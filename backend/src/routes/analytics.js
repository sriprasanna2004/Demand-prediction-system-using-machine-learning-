const router = require('express').Router();
const axios = require('axios');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const { buildFeatureVector } = require('../services/featureBuilder');

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

async function mlGet(path, params = {}, timeout = 12000) {
  const res = await axios.get(`${ML_URL}${path}`, { params, timeout });
  return res.data;
}
async function mlPost(path, body = {}, timeout = 12000) {
  const res = await axios.post(`${ML_URL}${path}`, body, { timeout });
  return res.data;
}

// ── Local fallbacks ──────────────────────────────────────────────

async function localDecompose(productId, category, days = 90) {
  const since = new Date(Date.now() - days * 86400000);
  const sales = await Sale.find({ productId, timestamp: { $gte: since } })
    .select('quantity timestamp').lean();

  const dailyMap = {};
  for (const s of sales) {
    const d = new Date(s.timestamp).toISOString().slice(0, 10);
    dailyMap[d] = (dailyMap[d] || 0) + s.quantity;
  }

  const dates = [];
  const observed = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    dates.push(d);
    observed.push(dailyMap[d] || 0);
  }

  const window = 7;
  const trend = observed.map((_, i) => {
    const slice = observed.slice(Math.max(0, i - window), i + window + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
  const seasonal = observed.map((v, i) => v - trend[i]);
  const residual = observed.map((v, i) => v - trend[i] - seasonal[i]);

  return {
    dates, observed, trend: trend.map(v => +v.toFixed(2)),
    seasonal: seasonal.map(v => +v.toFixed(2)),
    residual: residual.map(v => +v.toFixed(2)),
    trend_direction: trend[trend.length - 1] > trend[0] ? 'increasing' : 'decreasing',
    seasonality_strength: 0.4,
    data_points: sales.length
  };
}

async function localAnomalies(productId, days = 60) {
  const since = new Date(Date.now() - days * 86400000);
  const sales = await Sale.find({ productId, timestamp: { $gte: since } })
    .select('quantity timestamp').lean();

  if (!sales.length) return { anomalies: [], anomaly_rate: 0, total_days: 0, flagged_days: 0, all_scores: [] };

  const dailyMap = {};
  for (const s of sales) {
    const d = new Date(s.timestamp).toISOString().slice(0, 10);
    dailyMap[d] = (dailyMap[d] || 0) + s.quantity;
  }

  const entries = Object.entries(dailyMap).map(([date, qty]) => ({ date, quantity: qty }));
  const qtys = entries.map(e => e.quantity);
  const mean = qtys.reduce((a, b) => a + b, 0) / qtys.length;
  const std = Math.sqrt(qtys.reduce((a, b) => a + (b - mean) ** 2, 0) / qtys.length);

  const anomalies = [];
  const all_scores = entries.map(e => {
    const zscore = std > 0 ? Math.abs(e.quantity - mean) / std : 0;
    const is_anomaly = zscore > 2.5;
    if (is_anomaly) anomalies.push({ date: e.date, quantity: e.quantity, anomaly_score: +(-zscore).toFixed(3), severity: zscore > 3.5 ? 'high' : 'medium' });
    return { date: e.date, score: +(-zscore / 5).toFixed(3), is_anomaly };
  });

  return { anomalies, anomaly_rate: +(anomalies.length / entries.length).toFixed(3), total_days: entries.length, flagged_days: anomalies.length, all_scores };
}

async function localElasticity(productId) {
  const since = new Date(Date.now() - 90 * 86400000);
  const sales = await Sale.find({ productId, timestamp: { $gte: since } })
    .select('quantity price').lean();

  if (sales.length < 10) return { elasticity: -1.2, interpretation: 'Estimated (insufficient data)', confidence: 'low', r2: 0, data_points: sales.length };

  const logP = sales.map(s => Math.log(Math.max(s.price, 0.01)));
  const logQ = sales.map(s => Math.log(Math.max(s.quantity, 0.1)));
  const n = logP.length;
  const meanP = logP.reduce((a, b) => a + b) / n;
  const meanQ = logQ.reduce((a, b) => a + b) / n;
  const num = logP.reduce((s, p, i) => s + (p - meanP) * (logQ[i] - meanQ), 0);
  const den = logP.reduce((s, p) => s + (p - meanP) ** 2, 0);
  const elasticity = den > 0 ? num / den : -1.2;

  const pred = logP.map(p => meanQ + elasticity * (p - meanP));
  const ss_res = logQ.reduce((s, q, i) => s + (q - pred[i]) ** 2, 0);
  const ss_tot = logQ.reduce((s, q) => s + (q - meanQ) ** 2, 0);
  const r2 = ss_tot > 0 ? 1 - ss_res / ss_tot : 0;

  const e = +elasticity.toFixed(3);
  const interpretation = e < -2 ? 'Highly elastic — demand very sensitive to price' :
    e < -1 ? 'Elastic — demand moderately sensitive to price' :
    e < 0 ? 'Inelastic — demand relatively insensitive to price' : 'Unusual — demand increases with price';

  return { elasticity: e, interpretation, r2: +r2.toFixed(3), confidence: r2 > 0.5 ? 'high' : r2 > 0.2 ? 'medium' : 'low', data_points: n };
}

async function localWhatif(productId, baseFeatures, scenarios) {
  const baseDemand = (baseFeatures.avg_daily_sales_30d || 1) * 30;
  const basePrice = baseFeatures.price || 50;
  const results = scenarios.map(s => {
    const newPrice = basePrice * (1 + (s.price_change || 0));
    const elasticity = -1.2;
    const demandMult = (newPrice / basePrice) ** elasticity;
    const trendMult = 1 + ((s.trend_change || 0) / 200);
    const newDemand = baseDemand * demandMult * trendMult;
    const demandChangePct = (newDemand - baseDemand) / baseDemand * 100;
    const newRevenue = newDemand * newPrice;
    const revenueChangePct = (newRevenue - baseDemand * basePrice) / (baseDemand * basePrice) * 100;
    return {
      scenario_name: s.name, price_change_pct: +((s.price_change || 0) * 100).toFixed(1),
      new_price: +newPrice.toFixed(2), predicted_demand: +newDemand.toFixed(1),
      demand_change_pct: +demandChangePct.toFixed(1), new_revenue: +newRevenue.toFixed(2),
      revenue_change_pct: +revenueChangePct.toFixed(1),
      recommendation: revenueChangePct > 0 ? 'Proceed' : 'Caution'
    };
  });
  return { base_demand: +baseDemand.toFixed(1), base_price: basePrice, base_revenue: +(baseDemand * basePrice).toFixed(2), scenarios: results };
}

// ── Routes ───────────────────────────────────────────────────────

router.get('/decompose/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    try {
      const data = await mlGet(`/analytics/decompose/${req.params.productId}`, { category: product.category, days: req.query.days || 90 });
      return res.json({ success: true, data });
    } catch (_) {
      const data = await localDecompose(req.params.productId, product.category, parseInt(req.query.days) || 90);
      return res.json({ success: true, data, fallback: true });
    }
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/anomalies/:productId', async (req, res) => {
  try {
    try {
      const data = await mlGet(`/analytics/anomalies/${req.params.productId}`, { days: req.query.days || 60 });
      return res.json({ success: true, data });
    } catch (_) {
      const data = await localAnomalies(req.params.productId, parseInt(req.query.days) || 60);
      return res.json({ success: true, data, fallback: true });
    }
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/elasticity/:productId', async (req, res) => {
  try {
    try {
      const data = await mlGet(`/analytics/elasticity/${req.params.productId}`);
      return res.json({ success: true, data });
    } catch (_) {
      const data = await localElasticity(req.params.productId);
      return res.json({ success: true, data, fallback: true });
    }
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/whatif', async (req, res) => {
  try {
    const { productId, scenarios } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    const features = await buildFeatureVector(product, null, product.price);
    try {
      const data = await mlPost('/analytics/whatif', { product_id: productId, category: product.category, base_features: features, scenarios });
      return res.json({ success: true, data });
    } catch (_) {
      const data = await localWhatif(productId, features, scenarios);
      return res.json({ success: true, data, fallback: true });
    }
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/monitor/performance', async (req, res) => {
  try {
    const data = await mlGet('/monitor/performance', { days: req.query.days || 30 });
    res.json({ success: true, data });
  } catch (_) {
    res.json({ success: true, data: { records: 0, message: 'No feedback data yet.' } });
  }
});

router.get('/monitor/drift', async (req, res) => {
  try {
    const data = await mlGet('/monitor/drift');
    res.json({ success: true, data });
  } catch (_) {
    res.json({ success: true, data: { drift_detected: false, psi: 0, alerts: ['Insufficient data for drift detection'], recommendation: 'Collect more predictions first' } });
  }
});

router.get('/monitor/audit', async (req, res) => {
  try {
    const data = await mlGet('/monitor/audit', { product_id: req.query.productId, limit: req.query.limit || 50 });
    res.json({ success: true, data: data.data });
  } catch (_) {
    res.json({ success: true, data: [] });
  }
});

router.post('/monitor/feedback', async (req, res) => {
  try {
    const data = await mlPost('/monitor/feedback', req.body);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/train/ppo', async (req, res) => {
  try {
    const data = await mlPost('/train/ppo', {}, 300000);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
