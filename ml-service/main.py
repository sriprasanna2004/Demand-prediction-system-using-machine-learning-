from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import uvicorn, os, io, json
import pandas as pd
from dotenv import load_dotenv

from model.predictor import DemandPredictor
from model.ensemble import StackedEnsemble, train_ensemble
from model.trainer import train_model
from model.forecaster import forecast
from model.explainer import explain_prediction
from model.rl_agent import decide

load_dotenv()

app = FastAPI(title="DemandAI ML Service", version="3.0.0")

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:4000").split(",")
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in ALLOWED_ORIGINS], allow_methods=["*"], allow_headers=["*"])

# Load both models — ensemble preferred, RF fallback
ensemble = StackedEnsemble()
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
    horizon: str = "24h"

class RLRequest(BaseModel):
    stock: float
    predicted_demand: float
    trend_score: float = 50
    data_quality: float = 0.5
    price: float = 50

class ScenarioRequest(BaseModel):
    product_id: str
    category: str
    scenario: str
    base_features: dict

class ColumnMapping(BaseModel):
    dataset_id: str
    mappings: dict  # { "our_field": "csv_column" }

SCENARIOS = {
    "peak_hour":   {"temperature": 22, "trend_score": 75, "is_weekend": 0, "multiplier": 1.8, "label": "Peak Hour"},
    "rainy_day":   {"temperature": 8,  "trend_score": 40, "is_weekend": 0, "multiplier": 0.7, "label": "Rainy Day"},
    "festival":    {"temperature": 25, "trend_score": 90, "is_weekend": 1, "multiplier": 2.5, "label": "Festival Surge"},
    "low_demand":  {"temperature": 15, "trend_score": 25, "is_weekend": 0, "multiplier": 0.4, "label": "Low Demand"},
}

@app.get("/health")
def health():
    return {
        "status": "ok",
        "ensemble_loaded": ensemble.is_loaded(),
        "rf_loaded": predictor.is_loaded(),
        "active_model": "stacked_ensemble" if ensemble.is_loaded() else "random_forest",
        "version": "3.0.0"
    }

@app.post("/predict")
def predict(req: PredictRequest):
    try:
        features = req.dict(exclude={"summary", "product_id", "product_name"})
        # Try ensemble first, fall back to RF
        result = ensemble.predict(features)
        if result is None:
            result = predictor.predict(features)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict/explain")
def predict_with_explanation(req: PredictRequest):
    try:
        features = req.dict(exclude={"summary", "product_id", "product_name"})
        result = ensemble.predict(features) or predictor.predict(features)
        explanation = explain_prediction(ensemble, features, result["predicted_demand"])
        return {**result, "explanation": explanation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/forecast")
def get_forecast(req: ForecastRequest):
    try:
        return forecast(req.product_id, req.category, req.horizon)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/rl/decide")
def rl_decision(req: RLRequest):
    try:
        return decide(stock=req.stock, predicted_demand=req.predicted_demand,
                      trend_score=req.trend_score, data_quality=req.data_quality, price=req.price)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/scenario")
def run_scenario(req: ScenarioRequest):
    try:
        if req.scenario not in SCENARIOS:
            raise HTTPException(status_code=400, detail=f"Unknown scenario: {req.scenario}")
        s = SCENARIOS[req.scenario]
        features = {**req.base_features, **{k: v for k, v in s.items() if k not in ["multiplier","label"]}}
        features["category"] = req.category
        result = ensemble.predict(features) or predictor.predict(features)
        return {
            "scenario": req.scenario, "label": s["label"],
            "predicted_demand": round(result["predicted_demand"] * s["multiplier"], 1),
            "base_demand": result["predicted_demand"],
            "multiplier": s["multiplier"],
            "confidence_score": result["confidence_score"],
            "conditions": {k: v for k, v in s.items() if k not in ["multiplier","label"]}
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Dataset Upload ──────────────────────────────────────────────

@app.post("/dataset/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """Upload a CSV file. Returns columns for mapping."""
    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
        df = df.dropna(how="all")

        # Store raw in MongoDB
        from pymongo import MongoClient
        from datetime import datetime
        import uuid
        client = MongoClient(os.getenv("MONGO_URI"), serverSelectionTimeoutMS=8000)
        db = client["demandforecast"]
        dataset_id = str(uuid.uuid4())
        db.datasets.insert_one({
            "dataset_id": dataset_id,
            "filename": file.filename,
            "columns": list(df.columns),
            "row_count": len(df),
            "status": "uploaded",
            "created_at": datetime.utcnow(),
            "preview": df.head(5).to_dict(orient="records")
        })
        # Store raw rows
        rows = df.to_dict(orient="records")
        for r in rows:
            r["_dataset_id"] = dataset_id
        if rows:
            db.datasetraw.insert_many(rows)
        client.close()

        return {
            "success": True,
            "dataset_id": dataset_id,
            "filename": file.filename,
            "row_count": len(df),
            "columns": list(df.columns),
            "preview": df.head(5).to_dict(orient="records"),
            "required_fields": ["date_or_month", "quantity", "product_name", "category", "price"],
            "optional_fields": ["temperature", "trend_score", "stock", "day_of_week"]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/dataset/map")
async def map_columns(mapping: ColumnMapping):
    """Apply column mapping and process dataset into training rows."""
    try:
        from pymongo import MongoClient
        from datetime import datetime
        client = MongoClient(os.getenv("MONGO_URI"), serverSelectionTimeoutMS=8000)
        db = client["demandforecast"]

        raw_rows = list(db.datasetraw.find({"_dataset_id": mapping.dataset_id}, {"_id": 0}))
        if not raw_rows:
            raise HTTPException(status_code=404, detail="Dataset not found")

        m = mapping.mappings  # e.g. {"quantity": "sales_qty", "price": "unit_price", ...}
        processed = []
        errors = 0

        for row in raw_rows:
            try:
                qty_col = m.get("quantity")
                price_col = m.get("price")
                cat_col = m.get("category")
                name_col = m.get("product_name")
                date_col = m.get("date_or_month")

                if not qty_col or qty_col not in row:
                    errors += 1; continue

                qty = float(row[qty_col])
                price = float(row[price_col]) if price_col and price_col in row else 50
                category = str(row[cat_col]) if cat_col and cat_col in row else "Electronics"
                product_name = str(row[name_col]) if name_col and name_col in row else "Unknown"

                # Parse month
                month = 6
                if date_col and date_col in row:
                    try:
                        dt = pd.to_datetime(row[date_col])
                        month = dt.month
                    except Exception:
                        try:
                            month = int(row[date_col])
                        except Exception:
                            pass

                processed.append({
                    "quantity": qty, "price": price,
                    "category": category, "product_name": product_name,
                    "month": month,
                    "temperature": float(row[m["temperature"]]) if m.get("temperature") and m["temperature"] in row else 20,
                    "trend_score": float(row[m["trend_score"]]) if m.get("trend_score") and m["trend_score"] in row else 50,
                    "stock": float(row[m["stock"]]) if m.get("stock") and m["stock"] in row else 50,
                    "day_of_week": int(row[m["day_of_week"]]) if m.get("day_of_week") and m["day_of_week"] in row else 3,
                    "_dataset_id": mapping.dataset_id
                })
            except Exception:
                errors += 1

        if processed:
            db.datasetrows.insert_many(processed)

        db.datasets.update_one(
            {"dataset_id": mapping.dataset_id},
            {"$set": {"status": "mapped", "processed_rows": len(processed), "errors": errors, "mappings": m, "mapped_at": datetime.utcnow()}}
        )
        client.close()

        return {"success": True, "processed_rows": len(processed), "errors": errors,
                "message": f"Processed {len(processed)} rows. Ready to retrain."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/dataset/list")
def list_datasets():
    try:
        from pymongo import MongoClient
        client = MongoClient(os.getenv("MONGO_URI"), serverSelectionTimeoutMS=8000)
        db = client["demandforecast"]
        datasets = list(db.datasets.find({}, {"_id": 0}).sort("created_at", -1).limit(20))
        client.close()
        return {"success": True, "data": datasets}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/dataset/{dataset_id}")
def delete_dataset(dataset_id: str):
    try:
        from pymongo import MongoClient
        client = MongoClient(os.getenv("MONGO_URI"), serverSelectionTimeoutMS=8000)
        db = client["demandforecast"]
        db.datasets.delete_one({"dataset_id": dataset_id})
        db.datasetraw.delete_many({"_dataset_id": dataset_id})
        db.datasetrows.delete_many({"_dataset_id": dataset_id})
        client.close()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Training ────────────────────────────────────────────────────

@app.post("/train")
def train_rf():
    try:
        metrics = train_model()
        predictor.reload()
        return {"success": True, "metrics": metrics, "model": "random_forest"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/train/ensemble")
def train_ens():
    try:
        metrics = train_ensemble()
        ensemble.reload()
        return {"success": True, "metrics": metrics, "model": "stacked_ensemble"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
