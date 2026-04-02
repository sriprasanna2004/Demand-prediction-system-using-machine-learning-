/**
 * Dataset Visualization API
 * Shows data from uploaded datasets only (source: 'api')
 * Optionally filtered by dataset_id via ?dataset_id=ds_xxx
 */
const router = require('express').Router();
const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Product = require('../models/Product');

// Build match stage — optionally filter by dataset_id
function buildMatch(datasetId) {
  if (datasetId) return { 'metadata.dataset_id': datasetId };
  return {};  // show all data when no specific dataset selected
}

// GET /api/viz/overview
router.get('/overview', async (req, res) => {
  try {
    const match = buildMatch(req.query.dataset_id);

    const [totalSales, categoryBreakdown, priceRange, productCount] = await Promise.all([
      Sale.aggregate([
        { $match: match },
        { $group: { _id: null, totalQty: { $sum: '$quantity' }, totalRevenue: { $sum: { $multiply: ['$quantity', '$price'] } }, count: { $sum: 1 } } }
      ]),
      Sale.aggregate([
        { $match: match },
        { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'prod' } },
        { $unwind: '$prod' },
        { $group: { _id: '$prod.category', totalQty: { $sum: '$quantity' }, totalRevenue: { $sum: { $multiply: ['$quantity', '$price'] } } } },
        { $sort: { totalQty: -1 } }
      ]),
      Sale.aggregate([
        { $match: match },
        { $group: { _id: null, minPrice: { $min: '$price' }, maxPrice: { $max: '$price' }, avgPrice: { $avg: '$price' } } }
      ]),
      Sale.aggregate([
        { $match: match },
        { $group: { _id: '$productId' } },
        { $count: 'total' }
      ])
    ]);

    res.json({ success: true, data: {
      totalQty:         totalSales[0]?.totalQty     || 0,
      totalRevenue:     totalSales[0]?.totalRevenue || 0,
      totalSaleRecords: totalSales[0]?.count        || 0,
      totalProducts:    productCount[0]?.total      || 0,
      categoryBreakdown,
      priceRange: priceRange[0] || { minPrice: 0, maxPrice: 0, avgPrice: 0 }
    }});
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/viz/timeseries — daily sales over full history
router.get('/timeseries', async (req, res) => {
  try {
    const match = buildMatch(req.query.dataset_id);
    const limit = parseInt(req.query.limit) || 365;

    const series = await Sale.aggregate([
      { $match: match },
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

// GET /api/viz/by-category
router.get('/by-category', async (req, res) => {
  try {
    const match = buildMatch(req.query.dataset_id);

    const data = await Sale.aggregate([
      { $match: match },
      { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'prod' } },
      { $unwind: '$prod' },
      { $group: {
        _id: '$prod.category',
        totalQty:     { $sum: '$quantity' },
        totalRevenue: { $sum: { $multiply: ['$quantity', '$price'] } },
        avgPrice:     { $avg: '$prod.price' },
        productCount: { $addToSet: '$productId' }
      }},
      { $project: {
        _id: 1, totalQty: 1, totalRevenue: 1,
        avgPrice:     { $round: ['$avgPrice', 2] },
        productCount: { $size: '$productCount' }
      }},
      { $sort: { totalQty: -1 } }
    ]);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/viz/top-products
router.get('/top-products', async (req, res) => {
  try {
    const match = buildMatch(req.query.dataset_id);
    const limit = parseInt(req.query.limit) || 15;

    const data = await Sale.aggregate([
      { $match: match },
      { $group: { _id: '$productId', totalQty: { $sum: '$quantity' }, totalRevenue: { $sum: { $multiply: ['$quantity', '$price'] } } } },
      { $sort: { totalQty: -1 } }, { $limit: limit },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'prod' } },
      { $unwind: '$prod' },
      { $project: {
        name: '$prod.name', category: '$prod.category',
        price: '$prod.price', stock: '$prod.stock',
        totalQty: 1, totalRevenue: { $round: ['$totalRevenue', 2] }
      }},
      { $sort: { totalQty: -1 } }
    ]);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/viz/monthly
router.get('/monthly', async (req, res) => {
  try {
    const match = buildMatch(req.query.dataset_id);

    const data = await Sale.aggregate([
      { $match: match },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$timestamp' } },
        qty:     { $sum: '$quantity' },
        revenue: { $sum: { $multiply: ['$quantity', '$price'] } }
      }},
      { $sort: { _id: 1 } }
    ]);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/viz/price-distribution — from uploaded products
router.get('/price-distribution', async (req, res) => {
  try {
    const match = buildMatch(req.query.dataset_id);

    // Get product IDs from uploaded sales
    const productIds = await Sale.distinct('productId', match);

    const data = await Product.aggregate([
      { $match: { _id: { $in: productIds } } },
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

// GET /api/viz/stock-health
router.get('/stock-health', async (req, res) => {
  try {
    const match = buildMatch(req.query.dataset_id);

    const salesAgg = await Sale.aggregate([
      { $match: match },
      { $group: { _id: '$productId', totalQty: { $sum: '$quantity' }, txCount: { $sum: 1 } } }
    ]);

    const productIds = salesAgg.map(s => s._id);
    const products = await Product.find({ _id: { $in: productIds } }).lean();

    const salesMap = {};
    salesAgg.forEach(s => { salesMap[s._id.toString()] = s; });

    const data = products.map(p => {
      const s = salesMap[p._id.toString()] || { totalQty: 0, txCount: 0 };
      const avgDailyDemand = s.totalQty / Math.max(s.txCount, 1);
      const daysOfSupply = avgDailyDemand > 0 ? Math.round(p.stock / avgDailyDemand) : 999;
      return {
        name: p.name.length > 20 ? p.name.slice(0, 20) + '…' : p.name,
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

// GET /api/viz/datasets-list — list datasets with row counts for the selector
router.get('/datasets-list', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const DatasetModel = mongoose.models.Dataset ||
      mongoose.model('Dataset', new mongoose.Schema({ dataset_id: String, filename: String, row_count: Number, status: String, created_at: Date }, { strict: false }));

    const datasets = await DatasetModel.find({ status: 'mapped' }, { dataset_id: 1, filename: 1, row_count: 1, processed_rows: 1, created_at: 1, _id: 0 })
      .sort({ created_at: -1 }).lean();
    res.json({ success: true, data: datasets });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
