const router = require('express').Router();
const axios = require('axios');
const Product = require('../models/Product');
const { buildFeatureVector } = require('../services/featureBuilder');

const ML_URL = process.env.ML_SERVICE_URL || 'https://demand-prediction-system-using-machine-learning-production.up.railway.app';

const ACTION_LABELS = {
  WAIT: 'Hold current stock — demand is stable',
  REORDER: 'Place a standard reorder now',
  URGENT_REORDER: 'Urgent reorder — stock critically low',
  DISCOUNT: 'Run a promotion to clear excess stock',
  MONITOR: 'Monitor closely — borderline stock level'
};

function localDecide(stock, predictedDemand, trendScore = 50, dataQuality = 0.5) {
  const ratio = stock / Math.max(predictedDemand, 1);
  let action = 'WAIT';
  if (ratio < 0.3) action = 'URGENT_REORDER';
  else if (ratio < 0.7) action = 'REORDER';
  else if (ratio > 2.5) action = 'DISCOUNT';
  else if (dataQuality < 0.3) action = 'MONITOR';

  const reorderQty = action.includes('REORDER') ? Math.max(0, Math.ceil(predictedDemand * 1.3 - stock)) : 0;
  const reasoning = [];
  if (ratio < 0.3) reasoning.push(`Stock (${Math.round(stock)}) is critically below predicted demand (${Math.round(predictedDemand)}).`);
  else if (ratio < 0.7) reasoning.push('Stock is below safe threshold (70% of predicted demand).');
  else if (ratio > 2.5) reasoning.push(`Stock is ${ratio.toFixed(1)}x predicted demand — excess inventory detected.`);
  else reasoning.push('Stock level is within optimal range.');
  if (trendScore > 60) reasoning.push(`Market trend is bullish (${trendScore.toFixed(0)}/100).`);
  else if (trendScore < 40) reasoning.push(`Market trend is bearish (${trendScore.toFixed(0)}/100).`);

  return { action, label: ACTION_LABELS[action], reward: 2.0, reorder_quantity: reorderQty,
    probabilities: { WAIT: 0.2, REORDER: 0.2, URGENT_REORDER: 0.2, DISCOUNT: 0.2, MONITOR: 0.2 },
    reasoning, state: { stock_ratio: +ratio.toFixed(2), trend_norm: +((trendScore-50)/50).toFixed(2), data_quality: dataQuality } };
}

const SCENARIOS = {
  peak_hour:  { multiplier: 1.8, label: 'Peak Hour' },
  rainy_day:  { multiplier: 0.7, label: 'Rainy Day' },
  festival:   { multiplier: 2.5, label: 'Festival Surge' },
  low_demand: { multiplier: 0.4, label: 'Low Demand' }
};

// POST /api/rl/decide
router.post('/decide', async (req, res) => {
  try {
    const { productId, predictedDemand } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    const features = await buildFeatureVector(product, null, product.price);
    const payload = { stock: product.stock, predicted_demand: predictedDemand || Math.max(features.avg_daily_sales_30d * 30, 10), trend_score: features.trend_score, data_quality: features.data_quality, price: product.price };

    try {
      const mlRes = await axios.post(`${ML_URL}/rl/decide`, payload, { timeout: 8000 });
      return res.json({ success: true, data: { product: { id: product._id, name: product.name, stock: product.stock }, ...mlRes.data } });
    } catch (_) {
      const decision = localDecide(payload.stock, payload.predicted_demand, payload.trend_score, payload.data_quality);
      return res.json({ success: true, data: { product: { id: product._id, name: product.name, stock: product.stock }, ...decision }, fallback: true });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/rl/scenario
router.post('/scenario', async (req, res) => {
  try {
    const { productId, scenario } = req.body;
    if (!SCENARIOS[scenario]) return res.status(400).json({ success: false, error: 'Unknown scenario' });
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    const features = await buildFeatureVector(product, null, product.price);
    try {
      const mlRes = await axios.post(`${ML_URL}/scenario`, { product_id: productId, category: product.category, scenario, base_features: features }, { timeout: 10000 });
      return res.json({ success: true, data: mlRes.data });
    } catch (_) {
      const baseDemand = Math.max(features.avg_daily_sales_30d * 30, 10);
      const s = SCENARIOS[scenario];
      return res.json({ success: true, data: { scenario, label: s.label, predicted_demand: +(baseDemand * s.multiplier).toFixed(1), base_demand: +baseDemand.toFixed(1), multiplier: s.multiplier, confidence_score: 0.6 }, fallback: true });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/rl/batch
router.get('/batch', async (req, res) => {
  try {
    const products = await Product.find({ isActive: true }).limit(20);
    const results = await Promise.all(products.map(async (product) => {
      const features = await buildFeatureVector(product, null, product.price);
      const demand = Math.max(features.avg_daily_sales_30d * 30, 10);
      try {
        const mlRes = await axios.post(`${ML_URL}/rl/decide`, { stock: product.stock, predicted_demand: demand, trend_score: features.trend_score, data_quality: features.data_quality, price: product.price }, { timeout: 6000 });
        return { productId: product._id, name: product.name, stock: product.stock, ...mlRes.data };
      } catch (_) {
        const decision = localDecide(product.stock, demand, features.trend_score, features.data_quality);
        return { productId: product._id, name: product.name, stock: product.stock, ...decision };
      }
    }));
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
