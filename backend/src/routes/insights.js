const router = require('express').Router();
const Sale = require('../models/Sale');
const Product = require('../models/Product');

// GET /api/insights — business intelligence summary
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const last30  = new Date(now - 30  * 24 * 60 * 60 * 1000);
    const last7   = new Date(now - 7   * 24 * 60 * 60 * 1000);
    const prev30  = new Date(now - 60  * 24 * 60 * 60 * 1000);
    const last90  = new Date(now - 90  * 24 * 60 * 60 * 1000);

    const [recentSales, prevSales, topProducts, lowStock, allProducts, salesLast7, allTimeSales] = await Promise.all([
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
        { $sort: { qty: -1 } }, { $limit: 5 },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $project: { name: '$product.name', category: '$product.category', qty: 1 } }
      ]),
      Product.find({ isActive: true, stock: { $lt: 20 } }).select('name category stock').limit(10),
      Product.find({ isActive: true }).select('stock price'),
      Sale.aggregate([
        { $match: { timestamp: { $gte: last7 } } },
        { $group: { _id: null, revenue: { $sum: { $multiply: ['$quantity', '$price'] } }, qty: { $sum: '$quantity' } } }
      ]),
      // All-time fallback for uploaded datasets with older dates
      Sale.aggregate([
        { $group: { _id: null, total: { $sum: '$quantity' }, revenue: { $sum: { $multiply: ['$quantity', '$price'] } } } }
      ])
    ]);

    const currentTotal   = recentSales[0]?.total   || 0;
    const prevTotal      = prevSales[0]?.total      || 0;
    const allTimeTotal   = allTimeSales[0]?.total   || 0;
    const allTimeRevenue = allTimeSales[0]?.revenue || 0;

    // Use 30-day window if data exists, otherwise fall back to all-time
    const displayTotal   = currentTotal   > 0 ? currentTotal   : allTimeTotal;
    const displayRevenue = recentSales[0]?.revenue > 0 ? recentSales[0].revenue : allTimeRevenue;

    const demandChange = prevTotal > 0
      ? (((currentTotal - prevTotal) / prevTotal) * 100).toFixed(1)
      : currentTotal > 0 ? '100.0' : '0';

    const revenue7     = salesLast7[0]?.revenue || 0;
    const qty7         = salesLast7[0]?.qty     || 0;
    const costPerUnit  = qty7 > 0 ? (revenue7 / qty7 * 0.6).toFixed(2) : 0;
    const profit30     = (displayRevenue * 0.4).toFixed(0);
    const totalStockValue = allProducts.reduce((s, p) => s + p.stock * p.price, 0);
    const idleStockCost   = (totalStockValue * 0.02).toFixed(0);
    const efficiencyScore = Math.min(100, Math.max(0,
      50 + parseFloat(demandChange) * 2 - (lowStock.length * 5)
    )).toFixed(0);

    // Top products fallback — if last 7d empty, use last 90d
    let topProds = topProducts;
    if (!topProds.length) {
      topProds = await Sale.aggregate([
        { $match: { timestamp: { $gte: last90 } } },
        { $group: { _id: '$productId', qty: { $sum: '$quantity' } } },
        { $sort: { qty: -1 } }, { $limit: 5 },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $project: { name: '$product.name', category: '$product.category', qty: 1 } }
      ]);
    }
    // Still empty — use all-time
    if (!topProds.length) {
      topProds = await Sale.aggregate([
        { $group: { _id: '$productId', qty: { $sum: '$quantity' } } },
        { $sort: { qty: -1 } }, { $limit: 5 },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $project: { name: '$product.name', category: '$product.category', qty: 1 } }
      ]);
    }

    const insights = [];
    if (parseFloat(demandChange) > 5)
      insights.push(`Demand increased by ${demandChange}% compared to the previous period.`);
    else if (parseFloat(demandChange) < -5)
      insights.push(`Demand dropped by ${Math.abs(demandChange)}%. Consider promotional strategies.`);
    else
      insights.push('Demand is stable. Maintain current inventory levels.');
    if (lowStock.length > 0)
      insights.push(`${lowStock.length} product(s) are critically low on stock — reorder recommended.`);
    if (allTimeTotal > 0 && currentTotal === 0)
      insights.push(`${allTimeTotal.toLocaleString()} total units in historical data. Run predictions to generate forecasts.`);
    if (totalStockValue > 0)
      insights.push(`Total stock value: $${totalStockValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}. Idle cost estimate: $${idleStockCost}/month.`);

    res.json({
      success: true,
      data: {
        demandChangePct: parseFloat(demandChange),
        totalSalesLast30Days: displayTotal,
        totalRevenueLast30Days: displayRevenue,
        topProducts: topProds,
        lowStockAlerts: lowStock,
        insights,
        businessMetrics: {
          profit30Days:    parseFloat(profit30),
          costPerUnit:     parseFloat(costPerUnit),
          idleStockCost:   parseFloat(idleStockCost),
          efficiencyScore: parseFloat(efficiencyScore),
          totalStockValue: parseFloat(totalStockValue.toFixed(0))
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/insights/timeseries
router.get('/timeseries', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 14;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let series = await Sale.aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
        totalQty: { $sum: '$quantity' },
        totalRevenue: { $sum: { $multiply: ['$quantity', '$price'] } }
      }},
      { $sort: { _id: 1 } }
    ]);

    // If no recent data, fall back to last 365 days (covers uploaded historical data)
    if (!series.length) {
      series = await Sale.aggregate([
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          totalQty: { $sum: '$quantity' },
          totalRevenue: { $sum: { $multiply: ['$quantity', '$price'] } }
        }},
        { $sort: { _id: 1 } },
        { $limit: 90 }
      ]);
    }

    res.json({ success: true, data: series });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
