const router = require('express').Router();
const mongoose = require('mongoose');
const Product = require('../models/Product');

const POSchema = new mongoose.Schema({
  poNumber:    { type: String, unique: true },
  supplierId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplierName:{ type: String },
  items: [{
    productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productName: String,
    quantity:    Number,
    unitCost:    Number,
    totalCost:   Number,
  }],
  totalAmount: Number,
  status:      { type: String, enum: ['draft','sent','confirmed','delivered','cancelled'], default: 'draft' },
  expectedDelivery: Date,
  notes:       String,
}, { timestamps: true });

// Auto-generate PO number
POSchema.pre('save', async function(next) {
  if (!this.poNumber) {
    const count = await mongoose.model('PurchaseOrder').countDocuments();
    this.poNumber = `PO-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

const PO = mongoose.models.PurchaseOrder || mongoose.model('PurchaseOrder', POSchema);

// GET all POs
router.get('/', async (req, res) => {
  try {
    const pos = await PO.find().sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, data: pos });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST create PO
router.post('/', async (req, res) => {
  try {
    const { supplierId, supplierName, items, expectedDelivery, notes } = req.body;
    const totalAmount = items.reduce((s, i) => s + (i.totalCost || i.quantity * i.unitCost), 0);
    const po = await PO.create({ supplierId, supplierName, items, totalAmount, expectedDelivery, notes });
    res.status(201).json({ success: true, data: po });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// PATCH update status
router.patch('/:id/status', async (req, res) => {
  try {
    const po = await PO.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json({ success: true, data: po });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await PO.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET SCM KPIs
router.get('/kpis', async (req, res) => {
  try {
    const Sale = require('../models/Sale');
    const now = new Date();
    const last30 = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [products, recentSales, allTimeSales, poStats] = await Promise.all([
      Product.find({ isActive: true }).lean(),
      Sale.aggregate([
        { $match: { timestamp: { $gte: last30 } } },
        { $group: { _id: '$productId', sold: { $sum: '$quantity' } } }
      ]),
      Sale.aggregate([
        { $group: { _id: '$productId', sold: { $sum: '$quantity' } } }
      ]),
      PO.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } }
      ])
    ]);

    const salesMap = {};
    recentSales.forEach(s => { salesMap[s._id.toString()] = s.sold; });

    // Inventory turnover = units sold / avg inventory
    const totalStock = products.reduce((s, p) => s + p.stock, 0);
    const totalSold30 = recentSales.reduce((s, r) => s + r.sold, 0);
    const inventoryTurnover = totalStock > 0 ? ((totalSold30 / 30) * 365 / totalStock).toFixed(2) : 0;

    // Days of supply = total stock / avg daily demand
    const avgDailyDemand = totalSold30 / 30;
    const daysOfSupply = avgDailyDemand > 0 ? Math.round(totalStock / avgDailyDemand) : 999;

    // Stockout rate = products with 0 stock / total
    const stockouts = products.filter(p => p.stock === 0).length;
    const stockoutRate = products.length > 0 ? ((stockouts / products.length) * 100).toFixed(1) : 0;

    // Fill rate = products with stock > 0 / total
    const fillRate = products.length > 0 ? (((products.length - stockouts) / products.length) * 100).toFixed(1) : 100;

    // Low stock count
    const lowStock = products.filter(p => p.stock > 0 && p.stock < 20).length;

    // PO summary
    const poSummary = {};
    poStats.forEach(p => { poSummary[p._id] = { count: p.count, total: p.total }; });

    res.json({ success: true, data: {
      inventoryTurnover: parseFloat(inventoryTurnover),
      daysOfSupply,
      stockoutRate: parseFloat(stockoutRate),
      fillRate: parseFloat(fillRate),
      totalProducts: products.length,
      stockoutProducts: stockouts,
      lowStockProducts: lowStock,
      totalStockUnits: totalStock,
      unitsSold30d: totalSold30,
      activePOs: (poSummary.draft?.count || 0) + (poSummary.sent?.count || 0) + (poSummary.confirmed?.count || 0),
      totalPOValue: Object.values(poSummary).reduce((s, p) => s + p.total, 0),
    }});
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
