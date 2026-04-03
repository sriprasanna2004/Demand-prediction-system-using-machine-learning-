const router = require('express').Router();
const { sendLowStockAlert, sendDriftAlert, sendRetrainComplete } = require('../services/emailService');
const Product = require('../models/Product');

// POST /api/alerts/test — send a test email
router.post('/test', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'email required' });
    process.env.ALERT_EMAIL = email;
    await sendRetrainComplete({ mae: 4.2, r2: 0.87, mape: 8.3 });
    res.json({ success: true, message: `Test email sent to ${email}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/alerts/low-stock — manually trigger low stock check
router.post('/low-stock', async (req, res) => {
  try {
    const lowStock = await Product.find({ isActive: true, stock: { $lt: 20 } }).select('name category stock').lean();
    if (!lowStock.length) return res.json({ success: true, message: 'No low stock products', count: 0 });
    await sendLowStockAlert(lowStock);
    res.json({ success: true, message: `Alert sent for ${lowStock.length} products`, count: lowStock.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/alerts/status — check if email is configured
router.get('/status', (req, res) => {
  res.json({
    success: true,
    configured: !!(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL),
    alert_email: process.env.ALERT_EMAIL ? `${process.env.ALERT_EMAIL.slice(0, 3)}***` : null,
    resend_key_set: !!process.env.RESEND_API_KEY,
  });
});

module.exports = router;
