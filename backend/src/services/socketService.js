const Sale = require('../models/Sale');
const Product = require('../models/Product');

/**
 * Builds a lightweight dashboard snapshot for real-time emission.
 */
async function emitDashboardUpdate() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [recentSales, lowStock, totalToday] = await Promise.all([
    Sale.find({ timestamp: { $gte: since24h } })
      .populate('productId', 'name category')
      .sort({ timestamp: -1 })
      .limit(10),
    Product.find({ isActive: true, stock: { $lt: 20 } }).select('name stock category').limit(5),
    Sale.aggregate([
      { $match: { timestamp: { $gte: since24h } } },
      { $group: { _id: null, qty: { $sum: '$quantity' }, revenue: { $sum: { $multiply: ['$quantity', '$price'] } } } }
    ])
  ]);

  return {
    recentSales,
    lowStockAlerts: lowStock,
    todayStats: totalToday[0] || { qty: 0, revenue: 0 },
    timestamp: new Date()
  };
}

module.exports = { emitDashboardUpdate };
