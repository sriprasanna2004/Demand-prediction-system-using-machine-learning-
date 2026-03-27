# System Architecture & Data Flow

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        React Frontend (Vercel)                   │
│  Dashboard | Products | Predictions | Inventory                  │
│  React Query (cache) + Socket.io client (live updates)           │
└────────────────────────────┬─────────────────────────────────────┘
                             │ REST + WebSocket
┌────────────────────────────▼─────────────────────────────────────┐
│                   Node.js API Server (Render)                    │
│                                                                  │
│  /api/products   /api/sales   /api/predict                       │
│  /api/insights   /api/external-data                              │
│                                                                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │ simulationEngine│  │  featureBuilder  │  │ socketService  │  │
│  │ (cron, 8s)      │  │  (merges data)   │  │ (emit updates) │  │
│  └────────┬────────┘  └────────┬─────────┘  └───────┬────────┘  │
└───────────┼────────────────────┼────────────────────┼───────────┘
            │                   │                     │
    ┌───────▼──────┐   ┌────────▼────────┐   ┌───────▼────────┐
    │   MongoDB    │   │  Python ML      │   │ External APIs  │
    │   (Atlas)    │   │  FastAPI        │   │ OpenWeatherMap │
    │              │   │  (Railway)      │   │ Alpha Vantage  │
    │  Products    │   │                 │   └────────────────┘
    │  Sales       │   │  RandomForest   │
    │  ExternalData│   │  + Fallback     │
    └──────────────┘   └─────────────────┘
```

## Data Flow — Prediction Request

```
User clicks "Predict" in React
  → POST /api/predict { productId, targetDate, price }
    → featureBuilder.buildFeatureVector()
        → Query MongoDB: sales last 7/30/90 days for product
        → Query MongoDB: category average sales
        → Query MongoDB: latest weather + market trend
        → Compute data_quality score
        → Return feature vector (13 numeric features)
    → POST http://ml-service/predict { feature_vector }
        → predictor.predict()
            → Encode category
            → Run RandomForest pipeline
            → Estimate confidence from data_quality
            → Return { predicted_demand, confidence_score, method }
        [If ML fails] → getFallbackPrediction() (statistical)
    → Compute inventory recommendation
        → recommendedStock = ceil(demand * 1.2)
        → stockStatus = UNDERSTOCK | OPTIMAL | OVERSTOCK
    → Return full prediction response to React
```

## Data Flow — Real-Time Simulation

```
node-cron fires every 8 seconds
  → simulationEngine.runSimulation()
      → Fetch random active product from MongoDB
      → Compute quantity (time-of-day curve × category base × random)
      → Insert Sale document into MongoDB
      → Decrement product.stock
  → io.emit('new_sale', sale)         → React LiveFeed updates
  → emitDashboardUpdate()
      → Aggregate last 24h stats
      → Fetch low stock products
  → io.emit('dashboard_update', data) → React StatCards update
```

## Data Flow — External API Ingestion

```
GET /api/external-data/weather?location=New York
  → externalApiService.fetchWeather()
      → Call OpenWeatherMap API (5s timeout)
      → Store result in ExternalData collection
      → Return record
      [If API fails]
      → Query last stored ExternalData { type: 'weather' }
      → Return with fromCache: true
      [If no cache]
      → Return synthetic neutral values { temp: 20, condition: Clear }
```

## ML Feature Vector (13 features)

| Feature | Source | Description |
|---|---|---|
| price | Product / override | Current selling price |
| month | targetDate | 1–12, captures seasonality |
| day_of_week | targetDate | 0–6 |
| is_weekend | targetDate | Binary |
| avg_daily_sales_90d | MongoDB aggregation | Long-term trend |
| avg_daily_sales_30d | MongoDB aggregation | Medium-term trend |
| avg_daily_sales_7d | MongoDB aggregation | Short-term trend |
| category_avg_qty | MongoDB aggregation | Cold-start baseline |
| temperature | OpenWeatherMap | Weather impact |
| weather_code | OpenWeatherMap | Encoded condition |
| trend_score | Alpha Vantage | Market sentiment 0–100 |
| current_stock | Product | Supply constraint signal |
| data_quality | Computed | 0–1, drives confidence |
| category_code | Encoded | Product category |

## Deployment

| Service | Platform | URL |
|---|---|---|
| React Frontend | Vercel | https://demandai.vercel.app |
| Node.js API | Render | https://demandai-api.onrender.com |
| Python ML | Railway | https://demandai-ml.railway.app |
| MongoDB | Atlas | Managed cluster |

### Deploy Steps

**Backend (Render)**
1. Push `backend/` to GitHub
2. New Web Service → connect repo → root dir: `backend`
3. Build: `npm install` | Start: `node src/server.js`
4. Add env vars: MONGO_URI, ML_SERVICE_URL, OPENWEATHER_API_KEY, ALPHA_VANTAGE_API_KEY

**ML Service (Railway)**
1. Push `ml-service/` to GitHub
2. New Project → Deploy from GitHub → root: `ml-service`
3. Railway auto-detects Python via `requirements.txt`
4. Add env vars: MONGO_URI, PORT=5001
5. After deploy, call POST /train to train initial model

**Frontend (Vercel)**
1. Push `frontend/` to GitHub
2. New Project → Import → Framework: Create React App
3. Add env var: REACT_APP_API_URL=https://demandai-api.onrender.com
4. Deploy

### Local Development

```bash
# 1. Start MongoDB (Atlas or local)

# 2. Backend
cd backend
cp .env.example .env   # fill in values
npm install
node src/scripts/seed.js   # seed database
npm run dev

# 3. ML Service
cd ml-service
cp .env.example .env
pip install -r requirements.txt
python model/trainer.py    # train initial model
python main.py

# 4. Frontend
cd frontend
cp .env.example .env
npm install
npm start
```
