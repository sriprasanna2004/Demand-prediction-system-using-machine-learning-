/**
 * Dataset Visualization API
 * Aggregates all sales/product data for the DataViz page
 */
const router = require('express').Router();
const Sale = require('../models/Sale');
const Product = require('../models/Product');

// GET /api/viz/overview — summary stats
router.get('/overview', async (req, res) => {
  try {
    const [totalSales, totalProducts, categoryBreakdown, priceRange] = await Promise.all([
      Sale.aggregate([
        { $group: { _id: null, totalQty: { $sum: '$quantity' }, totalRevenue: { $sum: { $multiply: ['$quantity', '$price'] } }, count: { $sum: 1 } } }
      ]),
      Product.countDocuments({ isActive: true }),
      Sale.aggregate([
        { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'prod' } },
        { $unwind: '$prod' },
        { $group: { _id: '$prod.category', totalQty: { $sum: '$quantity' }, totalRevenue: { $sum: { $multiply: ['$quantity', '$price'] } }, count: { $sum: 1 } } },
        { $sort: { totalQty: -1 } }
      ]),
      Product.aggregate([
        { $group: { _id: null, minPrice: { $min: '$price' }, maxPrice: { $max: '$price' }, avgPrice: { $avg: '$price' } } }
      ])
    ]);

    res.json({ success: true, data: {
      totalQty:     totalSales[0]?.totalQty     || 0,
      totalRevenue: totalSales[0]?.totalRevenue || 0,
      totalSaleRecords: totalSales[0]?.count    || 0,
      totalProducts,
      categoryBreakdown,
      priceRange: priceRange[0] || { minPrice: 0, maxPrice: 0, avgPrice: 0 }
    }});
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/viz/timeseries — daily sales over full history
router.get('/timeseries', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 120;
    const series = await Sale.aggregate([
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
        qty: { $sum: '$quantity' },
        revenue: { $sum: { $multiply: ['$quantity', '$price'] } },
        transactions: { $sum: 1 }
      }},
      { $sort: { _id: 1 } },
      { $limit: limit }
    ]);
    res.json({ success: true, data: series });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/viz/by-category — qty + revenue per category
router.get('/by-category', async (req, res) => {
  try {
    const data = await Sale.aggregate([
      { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'prod' } },
      { $unwind: '$prod' },
      { $group: {
        _id: '$prod.category',
        totalQty: { $sum: '$quantity' },
        totalRevenue: { $sum: { $multiply: ['$quantity', '$price'] } },
        avgPrice: { $avg: '$prod.price' },
        productCount: { $addToSet: '$productId' }
      }},
      { $project: { _id: 1, totalQty: 1, totalRevenue: 1, avgPrice: { $round: ['$avgPrice', 2] }, productCount: { $size: '$productCount' } } },
      { $sort: { totalQty: -1 } }
    ]);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/viz/top-products — top N products by qty
router.get('/top-products', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 15;
    const data = await Sale.aggregate([
      { $group: { _id: '$productId', totalQty: { $sum: '$quantity' }, totalRevenue: { $sum: { $multiply: ['$quantity', '$price'] } } } },
      { $sort: { totalQty: -1 } }, { $limit: limit },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'prod' } },
      { $unwind: '$prod' },
      { $project: { name: '$prod.name', category: '$prod.category', price: '$prod.price', stock: '$prod.stock', totalQty: 1, totalRevenue: { $round: ['$totalRevenue', 2] } } },
      { $sort: { totalQty: -1 } }
    ]);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/viz/monthly — monthly aggregation
router.get('/monthly', async (req, res) => {
  try {
    const data = await Sale.aggregate([
      { $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$timestamp' } },
        qty: { $sum: '$quantity' },
        revenue: { $sum: { $multiply: ['$quantity', '$price'] } }
      }},
      { $sort: { _id: 1 } }
    ]);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/viz/price-distribution — price buckets
router.get('/price-distribution', async (req, res) => {
  try {
    const data = await Product.aggregate([
      { $bucket: {
        groupBy: '$price',
        boundaries: [0, 25, 50, 100, 200, 500, 1000, 5000],
        default: '5000+',
        output: { count: { $sum: 1 }, avgStock: { $avg: '$stock' } }
      }}
    ]);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/viz/stock-health — stock vs demand comparison
router.get('/stock-health', async (req, res) => {
  try {
    const products = await Product.find({ isActive: true }).lean();
    const salesAgg = await Sale.aggregate([
      { $group: { _id: '$productId', totalQty: { $sum: '$quantity' }, txCount: { $sum: 1 } } }
    ]);
    const salesMap = {};
    salesAgg.forEach(s => { salesMap[s._id.toString()] = s; });

    const data = products.map(p => {
      const s = salesMap[p._id.toString()] || { totalQty: 0, txCount: 0 };
      const avgMonthlyDemand = s.totalQty / Math.max(1, s.txCount / 30);
      const daysOfSupply = avgMonthlyDemand > 0 ? Math.round(p.stock / (avgMonthlyDemand / 30)) : 999;
      return {
        name: p.name.length > 18 ? p.name.slice(0, 18) + '…' : p.name,
        category: p.category,
        stock: p.stock,
        totalSold: s.totalQty,
        daysOfSupply: Math.min(daysOfSupply, 365),
        status: daysOfSupply < 7 ? 'critical' : daysOfSupply < 14 ? 'low' : daysOfSupply < 30 ? 'ok' : 'healthy'
      };
    }).sort((a, b) => a.daysOfSupply - b.daysOfSupply);

    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
