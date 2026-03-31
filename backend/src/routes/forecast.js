const router = require('express').Router();
const axios = require('axios');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const { buildFeatureVector } = require('../services/featureBuilder');

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

const CATEGORY_BASE = { Electronics: 2, Clothing: 5, Food: 10, Furniture: 1, Books: 4, Toys: 3 };

function hourMultiplier(h) {
  if (h >= 9 && h <= 12) return 1.6;
  if (h >= 13 && h <= 17) return 1.4;
  if (h >= 18 && h <= 21) return 1.8;
  if (h >= 22 || h < 6) return 0.3;
  return 0.8;
}

async function localForecast(productId, category, horizon) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const agg = await Sale.aggregate([
    { $match: { productId: require('mongoose').Types.ObjectId.createFromHexString(productId), timestamp: { $gte: since } } },
    { $group: { _id: null, total: { $sum: '$quantity' } } }
  ]);
  const avgDaily = agg[0] ? agg[0].total / 30 : (CATEGORY_BASE[category] || 3);
  const now = new Date();
  const points = [];

  if (horizon === '1h') {
    for (let i = 0; i < 12; i++) {
      const t = new Date(now.getTime() + i * 5 * 60000);
      const val = Math.max(0, (avgDaily / 24) * hourMultiplier(t.getHours()) * (1 + (Math.random() - 0.5) * 0.1));
      points.push({ time: `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}`, value: +val.toFixed(2), upper: +(val*1.2).toFixed(2), lower: +(val*0.8).toFixed(2) });
    }
  } else if (horizon === '24h') {
    for (let i = 0; i < 24; i++) {
      const t = new Date(now.getTime() + i * 3600000);
      const val = Math.max(0, (avgDaily / 24) * hourMultiplier(t.getHours()));
      points.push({ time: `${t.getHours().toString().padStart(2,'0')}:00`, value: +val.toFixed(2), upper: +(val*1.25).toFixed(2), lower: +(val*0.75).toFixed(2) });
    }
  } else {
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for (let i = 0; i < 7; i++) {
      const t = new Date(now.getTime() + i * 86400000);
      const isWknd = t.getDay() === 0 || t.getDay() === 6;
      const val = Math.max(0, avgDaily * (isWknd ? 1.15 : 1.0));
      points.push({ time: `${days[t.getDay()]} ${t.getDate()}`, value: +val.toFixed(1), upper: +(val*1.3).toFixed(1), lower: +(val*0.7).toFixed(1) });
    }
  }

  return { horizon, points, total: +points.reduce((s,p) => s+p.value, 0).toFixed(1), confidence: 0.65, data_points: agg[0]?.total || 0 };
}

// POST /api/forecast
router.post('/', async (req, res) => {
  try {
    const { productId, horizon = '24h' } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    try {
      const mlRes = await axios.post(`${ML_URL}/forecast`, { product_id: productId, category: product.category, horizon }, { timeout: 8000 });
      return res.json({ success: true, data: mlRes.data });
    } catch (_) {
      const data = await localForecast(productId, product.category, horizon);
      return res.json({ success: true, data, fallback: true });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/forecast/explain
router.post('/explain', async (req, res) => {
  try {
    const { productId, targetDate, price } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    const features = await buildFeatureVector(product, targetDate, price);
    try {
      const mlRes = await axios.post(`${ML_URL}/predict/explain`, features, { timeout: 10000 });
      return res.json({ success: true, data: { product: { id: product._id, name: product.name }, ...mlRes.data } });
    } catch (_) {
      return res.json({ success: true, data: { product: { id: product._id, name: product.name }, explanation: { explanation: ['ML service unavailable — explanation not available.'], contributions: [] } } });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
