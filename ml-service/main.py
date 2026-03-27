from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import uvicorn
import os
from dotenv import load_dotenv

from model.predictor import DemandPredictor
from model.trainer import train_model
from model.forecaster import forecast
from model.explainer import explain_prediction
from model.rl_agent import decide

load_dotenv()

app = FastAPI(title="Demand Forecast ML Service", version="2.0.0")

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
    summary: Optional[dict] = None

class ForecastRequest(BaseModel):
    product_id: str
    category: str
    horizon: str = "24h"  # '1h' | '24h' | '7d'

class RLRequest(BaseModel):
    stock: float
    predicted_demand: float
    trend_score: float = 50
    data_quality: float = 0.5
    price: float = 50

class ScenarioRequest(BaseModel):
    product_id: str
    category: str
    scenario: str  # 'peak_hour' | 'rainy_day' | 'festival' | 'low_demand'
    base_features: dict

SCENARIOS = {
    "peak_hour":   {"temperature": 22, "trend_score": 75, "is_weekend": 0, "multiplier": 1.8, "label": "Peak Hour"},
    "rainy_day":   {"temperature": 8,  "trend_score": 40, "is_weekend": 0, "multiplier": 0.7, "label": "Rainy Day"},
    "festival":    {"temperature": 25, "trend_score": 90, "is_weekend": 1, "multiplier": 2.5, "label": "Festival Surge"},
    "low_demand":  {"temperature": 15, "trend_score": 25, "is_weekend": 0, "multiplier": 0.4, "label": "Low Demand"},
}

@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": predictor.is_loaded(), "version": "2.0.0"}

@app.post("/predict")
def predict(req: PredictRequest):
    try:
        features = req.dict(exclude={"summary", "product_id", "product_name"})
        result = predictor.predict(features)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict/explain")
def predict_with_explanation(req: PredictRequest):
    try:
        features = req.dict(exclude={"summary", "product_id", "product_name"})
        result = predictor.predict(features)
        explanation = explain_prediction(
            predictor.model, features, result["predicted_demand"]
        )
        return {**result, "explanation": explanation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/forecast")
def get_forecast(req: ForecastRequest):
    try:
        result = forecast(req.product_id, req.category, req.horizon)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/rl/decide")
def rl_decision(req: RLRequest):
    try:
        result = decide(
            stock=req.stock,
            predicted_demand=req.predicted_demand,
            trend_score=req.trend_score,
            data_quality=req.data_quality,
            price=req.price
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/scenario")
def run_scenario(req: ScenarioRequest):
    try:
        if req.scenario not in SCENARIOS:
            raise HTTPException(status_code=400, detail=f"Unknown scenario: {req.scenario}")

        s = SCENARIOS[req.scenario]
        features = {**req.base_features, **{k: v for k, v in s.items() if k != "multiplier" and k != "label"}}
        features["category"] = req.category

        result = predictor.predict(features)
        adjusted_demand = round(result["predicted_demand"] * s["multiplier"], 1)

        return {
            "scenario": req.scenario,
            "label": s["label"],
            "predicted_demand": adjusted_demand,
            "base_demand": result["predicted_demand"],
            "multiplier": s["multiplier"],
            "confidence_score": result["confidence_score"],
            "conditions": {k: v for k, v in s.items() if k not in ["multiplier", "label"]}
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/train")
def train():
    try:
        metrics = train_model()
        predictor.reload()
        return {"success": True, "metrics": metrics}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
