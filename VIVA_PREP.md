# Viva Preparation — AI Demand Forecasting System

---

## Q1: Why did you choose Random Forest over Linear Regression?

Random Forest handles non-linear relationships between features like seasonality, weather, and price elasticity far better than Linear Regression. It's also robust to outliers and missing values, which is critical in retail data. We still include Ridge Regression as a baseline for comparison. In production, Random Forest consistently outperforms linear models on demand forecasting benchmarks because demand is inherently non-linear — a 10% price drop doesn't always produce a 10% demand increase.

---

## Q2: How does your system handle a brand new product with zero sales history (cold start problem)?

We solve this at three levels. First, the feature builder detects `data_quality = 0` and falls back to category averages — if a new Electronics product is added, we use the average demand of all Electronics products. Second, the ML model was trained on synthetic data that includes cold-start scenarios, so it can generalize. Third, the confidence score is explicitly lowered (0.20–0.25) to signal uncertainty to the user. The response includes a fallback message: "Exact data not found. Prediction based on trend analysis."

---

## Q3: Explain the real-time data pipeline end-to-end.

1. A cron job fires every 8 seconds via `node-cron` in the Node.js server.
2. `simulationEngine.js` picks a random active product and generates a realistic sale quantity based on time-of-day demand curves and category baselines.
3. The sale is inserted into MongoDB.
4. Socket.io emits a `new_sale` event to all connected React clients.
5. The React dashboard receives the event via `SocketContext`, updates the live feed, and invalidates the React Query cache to refresh stats.
6. Simultaneously, external API data (weather, market trends) is fetched periodically and stored in MongoDB as features for the next prediction request.

---

## Q4: What happens if the Python ML microservice goes down?

The Node.js backend wraps every ML call in a try/catch with an 8-second timeout. If the call fails, `getFallbackPrediction()` in `featureBuilder.js` computes a weighted average of recent sales trends (7-day, 30-day, 90-day) combined with category averages. The response includes `fallback: true` and a human-readable message. The system never returns an error to the user — it always returns a prediction with an appropriate confidence score.

---

## Q5: How do external signals like weather affect predictions?

Weather data from OpenWeatherMap is fetched and stored as features: temperature, humidity, and a numeric weather code (0=Clear, 1=Clouds, 2=Rain, etc.). These are included in the ML feature vector. For example, cold weather increases demand for warm clothing and indoor products. The model learns these correlations from training data. Market trend scores from Alpha Vantage act as a macro-economic signal — a rising retail ETF score increases predicted demand across categories.

---

## Q6: How do you ensure data quality and handle missing values?

At the feature level, we compute a `data_quality` score (0–1) based on the number of historical data points available. In the ML pipeline, `SimpleImputer` fills missing values with column medians before training. At inference time, missing external data falls back to cached values or neutral defaults (temperature=20°C, trend=50). The UI displays the data quality score as a progress bar so users understand prediction reliability.

---

## Q7: Explain your microservice architecture and why you chose it.

We have three independent services: React frontend, Node.js API server, and Python ML microservice. This separation means the ML service can be scaled independently (ML is CPU-intensive), updated without touching the API, and deployed on a specialized platform (Railway supports Python natively). The Node.js server acts as an orchestration layer — it merges database data, external API data, and ML predictions into a single response. This is the standard pattern used by companies like Shopify and Amazon for their recommendation engines.

---

## Q8: How does inventory optimization work?

After getting a predicted monthly demand `D`, we calculate:
- `recommendedStock = ceil(D * 1.2)` — 20% safety buffer
- `safetyStock = ceil(D * 0.2)` — the buffer itself
- If `currentStock < D * 0.5` → UNDERSTOCK → trigger reorder alert
- If `currentStock > D * 2` → OVERSTOCK → suggest discount/promotion
- Otherwise → OPTIMAL

This is based on the Economic Order Quantity (EOQ) model used in supply chain management, simplified for real-time use.

---

## Q9: How does the system continuously learn from new data?

The `/train` endpoint on the ML service triggers a full model retrain using all data currently in MongoDB — including simulated sales, manual entries, and historical records. In production, this would be scheduled nightly via a cron job. The `trainer.py` pulls fresh data from MongoDB, rebuilds the feature matrix, retrains the Random Forest, and saves the new model. The predictor hot-reloads the model without restarting the service. This is the continuous learning loop.

---

## Q10: How would you scale this system to handle 10,000 concurrent users?

Several strategies:
1. **Frontend**: Already on Vercel CDN — scales automatically.
2. **Node.js**: Add horizontal scaling with PM2 cluster mode + a load balancer (Nginx/AWS ALB). Use Redis for Socket.io adapter so WebSocket state is shared across instances.
3. **MongoDB**: Use Atlas with read replicas for analytics queries. Add indexes on `productId + timestamp` (already done).
4. **ML Service**: Deploy multiple Railway instances behind a load balancer. Cache frequent predictions in Redis with a 5-minute TTL.
5. **Message Queue**: Replace direct ML calls with a job queue (Bull/Redis) so prediction requests don't block the API under load.

---

## Key Lines to Impress Examiners

- "We implement a three-tier fallback: ML prediction → statistical trend analysis → category cold-start average. The system never fails."
- "The data quality score is a first-class feature — it's passed to the ML model AND displayed to the user, making uncertainty transparent."
- "We use Socket.io with room-based emission so in a multi-tenant SaaS scenario, each company only receives their own data updates."
- "The simulation engine models real demand curves — higher sales during business hours, category-specific base quantities, and seasonal sinusoidal patterns."
- "External API failures are handled gracefully with a cache-first strategy — the last known weather/trend data is used, with a `fromCache` flag in the response."
