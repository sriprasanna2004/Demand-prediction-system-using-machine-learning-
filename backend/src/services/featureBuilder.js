const Sale = require('../models/Sale');
const ExternalData = require('../models/ExternalData');

/**
 * Build a feature vector for the ML service.
 * Merges historical sales stats + external signals.
 */
async function buildFeatureVector(product, targetDate, price) {
  const date = targetDate ? new Date(targetDate) : new Date();
  const month = date.getMonth() + 1;
  const dayOfWeek = date.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 ? 1 : 0;

  // Historical sales for this product (last 90 days)
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [sales90, sales30, sales7, categorySales] = await Promise.all([
    Sale.aggregate([
      { $match: { productId: product._id, timestamp: { $gte: since90 } } },
      { $group: { _id: null, total: { $sum: '$quantity' }, count: { $sum: 1 } } }
    ]),
    Sale.aggregate([
      { $match: { productId: product._id, timestamp: { $gte: since30 } } },
      { $group: { _id: null, total: { $sum: '$quantity' } } }
    ]),
    Sale.aggregate([
      { $match: { productId: product._id, timestamp: { $gte: since7 } } },
      { $group: { _id: null, total: { $sum: '$quantity' } } }
    ]),
    // Category average for cold-start — filter by date first, then join products
    Sale.aggregate([
      { $match: { timestamp: { $gte: since30 } } },
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'prod'
        }
      },
      { $unwind: '$prod' },
      { $match: { 'prod.category': product.category, 'prod.isActive': true } },
      { $group: { _id: null, avgQty: { $avg: '$quantity' }, total: { $sum: '$quantity' } } }
    ])
  ]);

  const avg90 = sales90[0] ? sales90[0].total / 90 : 0;
  const avg30 = sales30[0] ? sales30[0].total / 30 : 0;
  const avg7 = sales7[0] ? sales7[0].total / 7 : 0;
  const categoryAvg = categorySales[0]?.avgQty || 1;
  const dataPoints = sales90[0]?.count || 0;

  // Data quality score (0-1)
  const dataQuality = Math.min(1, dataPoints / 30);

  // External signals
  const [weather, trend] = await Promise.all([
    ExternalData.findOne({ type: 'weather' }).sort({ timestamp: -1 }),
    ExternalData.findOne({ type: 'market_trend' }).sort({ timestamp: -1 })
  ]);

  const temperature = weather?.temperature ?? 20;
  const weatherCode = encodeWeather(weather?.weatherCondition);
  const trendScore = trend?.trendScore ?? 50;

  return {
    product_id: product._id.toString(),
    product_name: product.name,
    category: product.category,
    price: price || product.price,
    month,
    day_of_week: dayOfWeek,
    is_weekend: isWeekend,
    avg_daily_sales_90d: parseFloat(avg90.toFixed(4)),
    avg_daily_sales_30d: parseFloat(avg30.toFixed(4)),
    avg_daily_sales_7d: parseFloat(avg7.toFixed(4)),
    category_avg_qty: parseFloat(categoryAvg.toFixed(4)),
    temperature,
    weather_code: weatherCode,
    trend_score: trendScore,
    current_stock: product.stock,
    data_quality: parseFloat(dataQuality.toFixed(4)),
    // Summary for response (not sent to ML)
    summary: {
      dataPoints,
      dataQuality: parseFloat(dataQuality.toFixed(2)),
      hasExternalData: !!(weather || trend)
    }
  };
}

function encodeWeather(condition) {
  const map = { Clear: 0, Clouds: 1, Rain: 2, Snow: 3, Thunderstorm: 4, Drizzle: 2, Mist: 1 };
  return map[condition] ?? 0;
}

/**
 * Statistical fallback when ML service is down.
 * Uses weighted average of recent trends + category baseline.
 */
async function getFallbackPrediction(product, features) {
  const { avg_daily_sales_7d, avg_daily_sales_30d, avg_daily_sales_90d, category_avg_qty, data_quality } = features;

  let predicted;
  let confidence;

  if (data_quality > 0.5) {
    // Enough data — weighted recent trend
    predicted = avg_daily_sales_7d * 0.5 + avg_daily_sales_30d * 0.3 + avg_daily_sales_90d * 0.2;
    confidence = 0.65;
  } else if (data_quality > 0.1) {
    // Sparse data — lean on category
    predicted = avg_daily_sales_30d * 0.4 + category_avg_qty * 0.6;
    confidence = 0.45;
  } else {
    // Cold start — category average only
    predicted = category_avg_qty;
    confidence = 0.25;
  }

  // Apply trend score influence
  const trendMultiplier = 1 + (features.trend_score - 50) / 500;
  predicted = Math.max(0, predicted * trendMultiplier);

  return {
    predicted_demand: parseFloat((predicted * 30).toFixed(1)), // monthly
    confidence_score: confidence,
    method: data_quality < 0.1 ? 'cold_start_category_average' : 'trend_weighted_average'
  };
}

module.exports = { buildFeatureVector, getFallbackPrediction };
