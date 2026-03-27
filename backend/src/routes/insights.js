const router = require('express').Router();
const Sale = require('../models/Sale');
const Product = require('../models/Product');

// GET /api/insights — business intelligence summary
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const last30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const last7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const prev30 = new Date(now - 60 * 24 * 60 * 60 * 1000);

    const [recentSales, prevSales, topProducts, lowStock] = await Promise.all([
      Sale.aggregate([
        { $match: { timestamp: { $gte: last30 } } },
        { $group: { _id: null, total: { $sum: '$quantity' }, revenue: { $sum: { $multiply: ['$quantity', '$price'] } } } }
      ]),
      Sale.aggregate([
        { $match: { timestamp: { $gte: prev30, $lt: last30 } } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]),
      Sale.aggregate([
        { $match: { timestamp: { $gte: last7 } } },
        { $group: { _id: '$productId', qty: { $sum: '$quantity' } } },
        { $sort: { qty: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $project: { name: '$product.name', category: '$product.category', qty: 1 } }
      ]),
      Product.find({ isActive: true, stock: { $lt: 20 } }).select('name category stock').limit(10)
    ]);

    const currentTotal = recentSales[0]?.total || 0;
    const prevTotal = prevSales[0]?.total || 0;
    const demandChange = prevTotal > 0 ? (((currentTotal - prevTotal) / prevTotal) * 100).toFixed(1) : 0;

    const insights = [];
    if (demandChange > 5) insights.push(`Demand expected to increase by ${demandChange}% based on recent trends.`);
    else if (demandChange < -5) insights.push(`Demand has dropped by ${Math.abs(demandChange)}%. Consider promotional strategies.`);
    else insights.push('Demand is stable. Maintain current inventory levels.');

    if (lowStock.length > 0) insights.push(`${lowStock.length} product(s) are critically low on stock.`);

    res.json({
      success: true,
      data: {
        demandChangePct: parseFloat(demandChange),
        totalSalesLast30Days: currentTotal,
        totalRevenueLast30Days: recentSales[0]?.revenue || 0,
        topProducts,
        lowStockAlerts: lowStock,
        insights
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/insights/timeseries — for chart rendering
router.get('/timeseries', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 14;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const series = await Sale.aggregate([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          totalQty: { $sum: '$quantity' },
          totalRevenue: { $sum: { $multiply: ['$quantity', '$price'] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ success: true, data: series });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
