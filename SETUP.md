# Setup & Run Guide

## Option A — Docker (recommended, one command)

```bash
# 1. Copy and fill in your API keys
cp .env.example .env

# 2. Start everything
docker-compose up --build

# 3. Seed the database (first time only)
docker exec demandai_backend node src/scripts/seed.js

# 4. Open http://localhost:3000
```

Services started by Docker:
| Service    | URL                    |
|------------|------------------------|
| Frontend   | http://localhost:3000  |
| Backend    | http://localhost:4000  |
| ML Service | http://localhost:5001  |
| MongoDB    | localhost:27017        |

---

## Option B — Manual (no Docker)

### Prerequisites
- Node.js 18+
- Python 3.11+
- MongoDB (local or Atlas)

### 1. Backend
```bash
cd backend
cp .env.example .env
# Edit .env — set MONGO_URI, OPENWEATHER_API_KEY, ALPHA_VANTAGE_API_KEY

npm install
node src/scripts/seed.js   # seed DB once
npm run dev                # runs on :4000
```

### 2. ML Service
```bash
cd ml-service
cp .env.example .env
# Edit .env — set MONGO_URI

pip install -r requirements.txt
python model/trainer.py    # train model once (~10s on synthetic data)
python main.py             # runs on :5001
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env
# REACT_APP_API_URL=http://localhost:4000

npm install
npm start                  # runs on :3000
```

---

## Environment Variables

### backend/.env
| Variable               | Description                        | Required |
|------------------------|------------------------------------|----------|
| MONGO_URI              | MongoDB connection string          | Yes      |
| ML_SERVICE_URL         | Python ML service URL              | Yes      |
| OPENWEATHER_API_KEY    | OpenWeatherMap API key             | No*      |
| ALPHA_VANTAGE_API_KEY  | Alpha Vantage API key              | No*      |
| PORT                   | Server port (default 4000)         | No       |

*Falls back to cached/synthetic data if missing.

### ml-service/.env
| Variable    | Description                  | Required |
|-------------|------------------------------|----------|
| MONGO_URI   | MongoDB connection string    | Yes      |
| PORT        | Service port (default 5001)  | No       |
| MODEL_PATH  | Path to save model file      | No       |

### frontend/.env
| Variable             | Description           | Required |
|----------------------|-----------------------|----------|
| REACT_APP_API_URL    | Backend API base URL  | Yes      |

---

## Free API Keys

- **OpenWeatherMap**: https://openweathermap.org/api — free tier, 1000 calls/day
- **Alpha Vantage**: https://www.alphavantage.co/support/#api-key — free tier, 25 calls/day

Both are optional. The system uses cached/neutral fallback values when keys are absent.

---

## Deployment

### Frontend → Vercel
```bash
cd frontend
npx vercel --prod
# Set REACT_APP_API_URL to your Render backend URL
```

### Backend → Render
1. Push `backend/` to GitHub
2. New Web Service → root dir: `backend`
3. Build: `npm install` | Start: `node src/server.js`
4. Add env vars in Render dashboard

### ML Service → Railway
1. Push `ml-service/` to GitHub
2. New Project → Deploy from repo → root: `ml-service`
3. Add `MONGO_URI` env var
4. Railway auto-detects Dockerfile

---

## Verify Everything Works

```bash
# Backend health (shows DB + ML status)
curl http://localhost:4000/health

# Trigger prediction
curl -X POST http://localhost:4000/api/predict \
  -H "Content-Type: application/json" \
  -d '{"productId":"<id_from_db>"}'

# Trigger ML retrain
curl -X POST http://localhost:5001/train
```
