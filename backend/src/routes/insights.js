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

    const demandPct = parseFloat(demandChange);

    // Demand trend insight
    if (demandPct > 15)
      insights.push({ type: 'positive', icon: '📈', title: 'Strong Demand Growth', text: `Demand surged ${demandChange}% vs last period. Consider increasing stock levels to avoid shortages.` });
    else if (demandPct > 5)
      insights.push({ type: 'positive', icon: '↗️', title: 'Demand Rising', text: `Demand is up ${demandChange}% — a positive trend. Monitor top products for potential stockouts.` });
    else if (demandPct < -15)
      insights.push({ type: 'danger', icon: '📉', title: 'Demand Drop Alert', text: `Demand fell ${Math.abs(demandChange)}% vs last period. Run promotions or reduce procurement to avoid overstock.` });
    else if (demandPct < -5)
      insights.push({ type: 'warning', icon: '⚠️', title: 'Demand Softening', text: `Demand declined ${Math.abs(demandChange)}%. Review pricing strategy and consider targeted discounts.` });
    else
      insights.push({ type: 'neutral', icon: '✅', title: 'Demand Stable', text: 'Demand is steady. Maintain current inventory levels and monitor for seasonal shifts.' });

    // Low stock alerts
    if (lowStock.length > 3)
      insights.push({ type: 'danger', icon: '🚨', title: 'Critical Stock Alert', text: `${lowStock.length} products are critically low. Immediate reorder required to prevent stockouts and lost revenue.` });
    else if (lowStock.length > 0)
      insights.push({ type: 'warning', icon: '⚠️', title: 'Low Stock Warning', text: `${lowStock.length} product(s) need restocking: ${lowStock.map(p => p.name).join(', ')}.` });

    // Revenue insight
    if (displayRevenue > 0) {
      const profitEst = displayRevenue * 0.4;
      insights.push({ type: 'neutral', icon: '💰', title: 'Revenue Snapshot', text: `Estimated profit: $${profitEst.toLocaleString(undefined, { maximumFractionDigits: 0 })} (40% margin). Idle stock cost: $${idleStockCost}/month.` });
    }

    // Historical data insight
    if (allTimeTotal > 0 && currentTotal === 0)
      insights.push({ type: 'neutral', icon: '📊', title: 'Historical Data Ready', text: `${allTimeTotal.toLocaleString()} units in historical data. Run predictions to generate demand forecasts.` });

    // Top product insight
    if (topProds.length > 0)
      insights.push({ type: 'positive', icon: '🏆', title: 'Top Performer', text: `"${topProds[0].name}" leads demand with ${topProds[0].qty} units. Prioritize stock replenishment for this product.` });

    // Week-over-week comparison
    const last7Total  = salesLast7[0]?.qty || 0;
    const prev7Start  = new Date(now - 14 * 24 * 60 * 60 * 1000);
    const prev7End    = new Date(now - 7  * 24 * 60 * 60 * 1000);
    const prev7Sales  = await Sale.aggregate([
      { $match: { timestamp: { $gte: prev7Start, $lt: prev7End } } },
      { $group: { _id: null, qty: { $sum: '$quantity' } } }
    ]);
    const prev7Total = prev7Sales[0]?.qty || 0;
    if (last7Total > 0 && prev7Total > 0) {
      const wowPct = (((last7Total - prev7Total) / prev7Total) * 100).toFixed(1);
      if (Math.abs(parseFloat(wowPct)) > 10)
        insights.push({
          type: parseFloat(wowPct) > 0 ? 'positive' : 'warning',
          icon: parseFloat(wowPct) > 0 ? '📊' : '📉',
          title: 'Week-over-Week',
          text: `Sales this week are ${wowPct > 0 ? 'up' : 'down'} ${Math.abs(wowPct)}% vs last week (${last7Total} vs ${prev7Total} units).`
        });
    }

    // Seasonal spike detection (month-based)
    const currentMonth = now.getMonth() + 1;
    const peakMonths = [11, 12, 1]; // Nov, Dec, Jan
    if (peakMonths.includes(currentMonth))
      insights.push({ type: 'positive', icon: '🎄', title: 'Peak Season', text: 'You are in peak demand season. Build safety stock now to avoid stockouts during high-demand periods.' });

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
