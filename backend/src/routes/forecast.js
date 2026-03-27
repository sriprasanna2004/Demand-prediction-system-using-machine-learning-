const router = require('express').Router();
const axios = require('axios');
const Product = require('../models/Product');
const { buildFeatureVector } = require('../services/featureBuilder');

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

// POST /api/forecast — time-series forecast for a product
router.post('/', async (req, res) => {
  try {
    const { productId, horizon = '24h' } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    const mlRes = await axios.post(`${ML_URL}/forecast`, {
      product_id: productId,
      category: product.category,
      horizon
    }, { timeout: 10000 });

    res.json({ success: true, data: mlRes.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/forecast/explain — prediction with AI explanation
router.post('/explain', async (req, res) => {
  try {
    const { productId, targetDate, price } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    const features = await buildFeatureVector(product, targetDate, price);
    const mlRes = await axios.post(`${ML_URL}/predict/explain`, features, { timeout: 10000 });

    res.json({ success: true, data: { product: { id: product._id, name: product.name }, ...mlRes.data } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
