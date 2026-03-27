from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn
import os
from dotenv import load_dotenv

from model.predictor import DemandPredictor
from model.trainer import train_model

load_dotenv()

app = FastAPI(title="Demand Forecast ML Service", version="1.0.0")

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:4000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS],
    allow_methods=["*"],
    allow_headers=["*"],
)

predictor = DemandPredictor()

class PredictRequest(BaseModel):
    product_id: str
    product_name: str
    category: str
    price: float
    month: int
    day_of_week: int
    is_weekend: int
    avg_daily_sales_90d: float
    avg_daily_sales_30d: float
    avg_daily_sales_7d: float
    category_avg_qty: float
    temperature: float
    weather_code: int
    trend_score: float
    current_stock: float
    data_quality: float
    # summary is ignored by ML
    summary: Optional[dict] = None

@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": predictor.is_loaded()}

@app.post("/predict")
def predict(req: PredictRequest):
    try:
        result = predictor.predict(req.dict(exclude={"summary", "product_id", "product_name"}))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/train")
def train():
    """Trigger model retraining from MongoDB data."""
    try:
        metrics = train_model()
        predictor.reload()
        return {"success": True, "metrics": metrics}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
