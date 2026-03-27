const router = require('express').Router();
const axios = require('axios');
const Product = require('../models/Product');
const { buildFeatureVector } = require('../services/featureBuilder');

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

// POST /api/rl/decide — PPO reorder decision for a product
router.post('/decide', async (req, res) => {
  try {
    const { productId, predictedDemand } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    const features = await buildFeatureVector(product, null, product.price);

    const mlRes = await axios.post(`${ML_URL}/rl/decide`, {
      stock: product.stock,
      predicted_demand: predictedDemand || 30,
      trend_score: features.trend_score,
      data_quality: features.data_quality,
      price: product.price
    }, { timeout: 8000 });

    res.json({ success: true, data: { product: { id: product._id, name: product.name, stock: product.stock }, ...mlRes.data } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/rl/scenario — run scenario simulation
router.post('/scenario', async (req, res) => {
  try {
    const { productId, scenario } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    const features = await buildFeatureVector(product, null, product.price);

    const mlRes = await axios.post(`${ML_URL}/scenario`, {
      product_id: productId,
      category: product.category,
      scenario,
      base_features: features
    }, { timeout: 10000 });

    res.json({ success: true, data: mlRes.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/rl/batch — RL decisions for all active products
router.get('/batch', async (req, res) => {
  try {
    const products = await Product.find({ isActive: true }).limit(20);

    const decisions = await Promise.allSettled(products.map(async (product) => {
      const features = await buildFeatureVector(product, null, product.price);
      const mlRes = await axios.post(`${ML_URL}/rl/decide`, {
        stock: product.stock,
        predicted_demand: features.avg_daily_sales_30d * 30 || 30,
        trend_score: features.trend_score,
        data_quality: features.data_quality,
        price: product.price
      }, { timeout: 6000 });
      return { productId: product._id, name: product.name, stock: product.stock, ...mlRes.data };
    }));

    const results = decisions.filter(d => d.status === 'fulfilled').map(d => d.value);
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
