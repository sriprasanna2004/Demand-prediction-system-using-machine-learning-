const router = require('express').Router();
const { fetchWeather, fetchMarketTrend } = require('../services/externalApiService');
const ExternalData = require('../models/ExternalData');

// GET /api/external-data/weather
router.get('/weather', async (req, res) => {
  try {
    const location = req.query.location || 'New York';
    const data = await fetchWeather(location);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/external-data/market
router.get('/market', async (req, res) => {
  try {
    const symbol = req.query.symbol || 'RETAIL';
    const data = await fetchMarketTrend(symbol);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/external-data/latest — most recent stored external data
router.get('/latest', async (req, res) => {
  try {
    const [weather, trend] = await Promise.all([
      ExternalData.findOne({ type: 'weather' }).sort({ timestamp: -1 }),
      ExternalData.findOne({ type: 'market_trend' }).sort({ timestamp: -1 })
    ]);
    res.json({ success: true, data: { weather, trend } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
