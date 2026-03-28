const router = require('express').Router();
const axios = require('axios');
const Product = require('../models/Product');
const { buildFeatureVector } = require('../services/featureBuilder');

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

// GET /api/analytics/decompose/:productId — STL decomposition
router.get('/decompose/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    const mlRes = await axios.get(`${ML_URL}/analytics/decompose/${req.params.productId}`, {
      params: { category: product.category, days: req.query.days || 90 }, timeout: 15000
    });
    res.json({ success: true, data: mlRes.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

// GET /api/analytics/anomalies/:productId — anomaly detection
router.get('/anomalies/:productId', async (req, res) => {
  try {
    const mlRes = await axios.get(`${ML_URL}/analytics/anomalies/${req.params.productId}`, {
      params: { days: req.query.days || 60 }, timeout: 15000
    });
    res.json({ success: true, data: mlRes.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

// GET /api/analytics/elasticity/:productId — price elasticity
router.get('/elasticity/:productId', async (req, res) => {
  try {
    const mlRes = await axios.get(`${ML_URL}/analytics/elasticity/${req.params.productId}`, { timeout: 10000 });
    res.json({ success: true, data: mlRes.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

// POST /api/analytics/whatif — what-if price simulator
router.post('/whatif', async (req, res) => {
  try {
    const { productId, scenarios } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    const features = await buildFeatureVector(product, null, product.price);
    const mlRes = await axios.post(`${ML_URL}/analytics/whatif`, {
      product_id: productId, category: product.category,
      base_features: features, scenarios
    }, { timeout: 10000 });
    res.json({ success: true, data: mlRes.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data?.detail || err.message });
  }
});

// GET /api/analytics/monitor/performance
router.get('/monitor/performance', async (req, res) => {
  try {
    const mlRes = await axios.get(`${ML_URL}/monitor/performance`, {
      params: { days: req.query.days || 30 }, timeout: 10000
    });
    res.json({ success: true, data: mlRes.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/analytics/monitor/drift
router.get('/monitor/drift', async (req, res) => {
  try {
    const mlRes = await axios.get(`${ML_URL}/monitor/drift`, { timeout: 10000 });
    res.json({ success: true, data: mlRes.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/analytics/monitor/audit
router.get('/monitor/audit', async (req, res) => {
  try {
    const mlRes = await axios.get(`${ML_URL}/monitor/audit`, {
      params: { product_id: req.query.productId, limit: req.query.limit || 50 }, timeout: 10000
    });
    res.json({ success: true, data: mlRes.data.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/analytics/monitor/feedback
router.post('/monitor/feedback', async (req, res) => {
  try {
    const mlRes = await axios.post(`${ML_URL}/monitor/feedback`, req.body, { timeout: 10000 });
    res.json({ success: true, data: mlRes.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/analytics/train/ppo — train PPO agent
router.post('/train/ppo', async (req, res) => {
  try {
    const mlRes = await axios.post(`${ML_URL}/train/ppo`, {}, { timeout: 300000 });
    res.json({ success: true, data: mlRes.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
