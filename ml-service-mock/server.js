/**
 * Mock ML service — mimics the Python FastAPI service.
 * Returns realistic predictions so the full UI works without Python.
 * Replace with the real ml-service once Python is installed.
 */
const express = require('express');
const app = express();
app.use(express.json());

app.get('/health', (_, res) => res.json({ status: 'ok', model_loaded: true, mock: true }));

app.post('/predict', (req, res) => {
  const {
    avg_daily_sales_7d = 0,
    avg_daily_sales_30d = 0,
    avg_daily_sales_90d = 0,
    category_avg_qty = 2,
    trend_score = 50,
    data_quality = 0.5,
    price = 50,
    is_weekend = 0,
    month = new Date().getMonth() + 1
  } = req.body;

  // Weighted trend average
  let daily = avg_daily_sales_7d * 0.5 + avg_daily_sales_30d * 0.3 + avg_daily_sales_90d * 0.2;
  if (daily === 0) daily = category_avg_qty;

  // Seasonal bump (Dec/Nov higher)
  const seasonal = 1 + (month === 12 || month === 11 ? 0.3 : month === 6 || month === 7 ? 0.15 : 0);
  // Weekend bump
  const weekend = 1 + (is_weekend ? 0.1 : 0);
  // Trend influence
  const trend = 1 + (trend_score - 50) / 200;
  // Price elasticity
  const priceEffect = Math.max(0.4, 1 - price / 2000);

  const predicted = Math.max(1, daily * 30 * seasonal * weekend * trend * priceEffect);
  const confidence = Math.min(0.92, 0.45 + data_quality * 0.45);

  res.json({
    predicted_demand: parseFloat(predicted.toFixed(1)),
    confidence_score: parseFloat(confidence.toFixed(3)),
    method: 'mock_weighted_average'
  });
});

app.post('/train', (_, res) => {
  // Simulate a 2-second training delay
  setTimeout(() => {
    res.json({ success: true, metrics: { mae: 4.21, r2: 0.87, samples: 2000 } });
  }, 2000);
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Mock ML service running on port ${PORT}`));
