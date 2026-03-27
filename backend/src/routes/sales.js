const router = require('express').Router();
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const { emitDashboardUpdate } = require('../services/socketService');
const validate = require('../middleware/validate');

const saleSchema = {
  productId: { type: 'string', required: true },
  quantity:  { type: 'number', required: true, min: 1, max: 10000 },
};

// GET sales with filters
router.get('/', async (req, res) => {
  try {
    const { productId, from, to, limit = 100 } = req.query;
    const filter = {};
    if (productId) filter.productId = productId;
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to) filter.timestamp.$lte = new Date(to);
    }
    const sales = await Sale.find(filter)
      .populate('productId', 'name category price')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));
    res.json({ success: true, data: sales });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET aggregated sales by product
router.get('/aggregate', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const agg = await Sale.aggregate([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: '$productId',
          totalQty: { $sum: '$quantity' },
          totalRevenue: { $sum: { $multiply: ['$quantity', '$price'] } },
          count: { $sum: 1 }
        }
      },
      { $sort: { totalQty: -1 } },
      { $limit: 20 }
    ]);
    res.json({ success: true, data: agg });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST add manual sale (user-generated)
router.post('/', validate(saleSchema), async (req, res) => {
  try {
    const { productId, quantity, price } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    const sale = await Sale.create({
      productId,
      quantity,
      price: price || product.price,
      source: 'manual'
    });

    // Update stock
    await Product.findByIdAndUpdate(productId, { $inc: { stock: -quantity } });

    const io = req.app.get('io');
    io.emit('new_sale', sale);
    const update = await emitDashboardUpdate();
    io.emit('dashboard_update', update);

    res.status(201).json({ success: true, data: sale });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
