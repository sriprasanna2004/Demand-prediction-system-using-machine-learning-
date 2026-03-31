"""
DemandAI ML Service v4.0
Upgrades:
- Conformal prediction intervals (MAPIE)
- Real PPO agent (Stable-Baselines3 + InventoryEnv)
- MLflow experiment tracking
- Redis feature store
- APScheduler batch predictions
- Drift alerting (Slack webhook)
- Per-cluster models
- Causal features (Google Trends + Granger)
- Price optimizer
- Supply chain lead time model
- Prometheus metrics
- Structured logging (structlog)
"""
import os
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
import uvicorn
from dotenv import load_dotenv

load_dotenv()

# Configure structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer()
    ]
)
log = structlog.get_logger()

# ── Model imports ────────────────────────────────────────────────
from model.predictor import DemandPredictor
from model.ensemble import StackedEnsemble, train_ensemble
from model.trainer import train_model
from model.forecaster import forecast
from model.explainer import explain_prediction
from model.rl_ppo import PPOInventoryAgent, train_ppo_agent
from model.analytics import stl_decompose, detect_anomalies, price_elasticity, whatif_simulator
from model.monitor import log_prediction, record_feedback, get_model_performance, detect_drift, get_audit_log
from model.conformal import ConformalPredictor
from model.cluster_models import ClusterRouter
from model.feature_store import get_cached_features, precompute_all_products
from model.experiment_tracker import get_experiment_history, log_training_run
from model.model_card import get_model_card
from model.batch_predictor import run_batch_predictions, check_and_alert_drift
from model.price_optimizer import optimize_price, estimate_elasticity_from_history
from model.supply_chain import predict_lead_time, compute_reorder_point, train_lead_time_model
from model.causal_features import get_cached_causal_features

# ── Global model instances ───────────────────────────────────────
ensemble = StackedEnsemble()
predictor = DemandPredictor()
ppo = PPOInventoryAgent()
conformal = ConformalPredictor()
cluster_router = ClusterRouter()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init scheduler. Shutdown: stop scheduler."""
    _start_scheduler()
    log.info("ml_service_started", version="4.0.0")
    yield
    log.info("ml_service_stopped")


app = FastAPI(title="DemandAI ML Service", version="4.0.0", lifespan=lifespan)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:4000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS],
    allow_methods=["*"], allow_headers=["*"]
)

# Prometheus metrics
try:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator().instrument(app).expose(app)
    log.info("prometheus_metrics_enabled")
except ImportError:
    log.warning("prometheus_not_installed")


def _start_scheduler():
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        scheduler = BackgroundScheduler()
        # Feature store refresh every 15 minutes
        scheduler.add_job(precompute_all_products, "interval", minutes=15, id="feature_store")
        # Nightly batch predictions at 2 AM
        scheduler.add_job(
            lambda: run_batch_predictions(ensemble, conformal),
            "cron", hour=2, minute=0, id="batch_predict"
        )
        # Drift check every 6 hours
        scheduler.add_job(
            lambda: check_and_alert_drift(ensemble),
            "interval", hours=6, id="drift_check"
        )
        scheduler.start()
        log.info("scheduler_started")
    except Exception as e:
        log.warning("scheduler_failed", error=str(e))


# ── Pydantic schemas (v2) ────────────────────────────────────────

class PredictRequest(BaseModel):
    product_id: str
    product_name: str
    category: str
    price: float
    month: int = Field(ge=1, le=12)
    day_of_week: int = Field(ge=0, le=6)
    is_weekend: int = Field(ge=0, le=1)
    avg_daily_sales_90d: float = 0.0
    avg_daily_sales_30d: float = 0.0
    avg_daily_sales_7d: float = 0.0
    category_avg_qty: float = 1.0
    temperature: float = 20.0
    weather_code: int = 0
    trend_score: float = 50.0
    current_stock: float = 50.0
    data_quality: float = Field(ge=0.0, le=1.0, default=0.5)
    summary: Optional[dict] = None


class ForecastRequest(BaseModel):
    product_id: str
    category: str
    horizon: str = "24h"


class RLRequest(BaseModel):
    stock: float
    predicted_demand: float
    trend_score: float = 50.0
    data_quality: float = 0.5
    price: float = 50.0
    month: int = 6


class PriceOptimizeRequest(BaseModel):
    product_id: str
    base_price: float
    base_demand: float
    cost_per_unit: float
    margin_floor: float = 0.15
    price_min: Optional[float] = None
    price_max: Optional[float] = None


class LeadTimeRequest(BaseModel):
    supplier_id: str
    order_qty: float
    category: str = "Electronics"
    price: float = 50.0


class FeedbackRequest(BaseModel):
    product_id: str
    prediction_date: str
    actual_demand: float


class WhatIfRequest(BaseModel):
    product_id: str
    category: str
    base_features: dict
    scenarios: List[dict]


class ScenarioRequest(BaseModel):
    product_id: str
    category: str
    scenario: str
    base_features: dict


SCENARIOS = {
    "peak_hour":  {"temperature": 22, "trend_score": 75, "is_weekend": 0, "multiplier": 1.8, "label": "Peak Hour"},
    "rainy_day":  {"temperature": 8,  "trend_score": 40, "is_weekend": 0, "multiplier": 0.7, "label": "Rainy Day"},
    "festival":   {"temperature": 25, "trend_score": 90, "is_weekend": 1, "multiplier": 2.5, "label": "Festival Surge"},
    "low_demand": {"temperature": 15, "trend_score": 25, "is_weekend": 0, "multiplier": 0.4, "label": "Low Demand"},
}


# ── Health ───────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "ensemble_loaded": ensemble.is_loaded(),
        "rf_loaded": predictor.is_loaded(),
        "ppo_loaded": ppo.is_loaded(),
        "conformal_loaded": conformal.is_loaded(),
        "cluster_loaded": cluster_router.is_loaded(),
        "active_model": "stacked_ensemble" if ensemble.is_loaded() else "random_forest",
        "version": "4.0.0"
    }


# ── Prediction ───────────────────────────────────────────────────

@app.post("/predict")
def predict(req: PredictRequest):
    try:
        features = req.model_dump(exclude={"summary"})

        # Enrich from feature store cache
        cached = get_cached_features(req.product_id)
        if cached:
            for k in ["avg_daily_sales_90d", "avg_daily_sales_30d", "avg_daily_sales_7d", "data_quality"]:
                if cached.get(k) and features.get(k, 0) == 0:
                    features[k] = cached[k]

        # Try conformal predictor first (gives intervals)
        result = None
        if conformal.is_loaded():
            result = conformal.predict_with_interval(features)
        # Try cluster router
        if result is None and cluster_router.is_loaded():
            cluster_result = cluster_router.predict(features)
            if cluster_result:
                result = cluster_result
                result["lower_bound"] = result["predicted_demand"] * 0.8
                result["upper_bound"] = result["predicted_demand"] * 1.2
        # Fall back to ensemble
        if result is None:
            result = ensemble.predict(features) or predictor.predict(features)
            if result:
                result["lower_bound"] = result["predicted_demand"] * 0.8
                result["upper_bound"] = result["predicted_demand"] * 1.2

        if result is None:
            raise HTTPException(status_code=503, detail="No model available")

        # Async audit log
        try:
            log_prediction(req.product_id, req.product_name, features, result)
        except Exception:
            pass

        return result
    except HTTPException:
        raise
    except Exception as e:
        log.error("predict_failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/explain")
def predict_with_explanation(req: PredictRequest):
    try:
        features = req.model_dump(exclude={"summary"})
        result = conformal.predict_with_interval(features) if conformal.is_loaded() else None
        result = result or ensemble.predict(features) or predictor.predict(features)
        explanation = explain_prediction(ensemble, features, result["predicted_demand"])
        return {**result, "explanation": explanation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Forecast ─────────────────────────────────────────────────────

@app.post("/forecast")
def get_forecast(req: ForecastRequest):
    try:
        return forecast(req.product_id, req.category, req.horizon)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── RL / PPO ─────────────────────────────────────────────────────

@app.post("/rl/decide")
def rl_decision(req: RLRequest):
    try:
        return ppo.decide(
            stock=req.stock, predicted_demand=req.predicted_demand,
            trend_score=req.trend_score, data_quality=req.data_quality,
            price=req.price, month=req.month
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Scenarios ────────────────────────────────────────────────────

@app.post("/scenario")
def run_scenario(req: ScenarioRequest):
    try:
        if req.scenario not in SCENARIOS:
            raise HTTPException(status_code=400, detail=f"Unknown scenario: {req.scenario}")
        s = SCENARIOS[req.scenario]
        features = {**req.base_features, **{k: v for k, v in s.items() if k not in ["multiplier", "label"]}}
        features["category"] = req.category
        result = ensemble.predict(features) or predictor.predict(features)
        return {
            "scenario": req.scenario, "label": s["label"],
            "predicted_demand": round(result["predicted_demand"] * s["multiplier"], 1),
            "base_demand": result["predicted_demand"],
            "multiplier": s["multiplier"],
            "confidence_score": result["confidence_score"],
            "conditions": {k: v for k, v in s.items() if k not in ["multiplier", "label"]}
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Analytics ────────────────────────────────────────────────────

@app.get("/analytics/decompose/{product_id}")
def decompose(product_id: str, category: str = "Electronics", days: int = 90):
    try:
        return stl_decompose(product_id, category, days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/analytics/anomalies/{product_id}")
def anomalies(product_id: str, days: int = 60):
    try:
        return detect_anomalies(product_id, days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/analytics/elasticity/{product_id}")
def elasticity(product_id: str):
    try:
        return price_elasticity(product_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analytics/whatif")
def whatif(req: WhatIfRequest):
    try:
        return whatif_simulator(req.product_id, req.category, req.base_features, req.scenarios)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Monitoring ───────────────────────────────────────────────────

@app.get("/monitor/performance")
def performance(days: int = 30):
    try:
        return get_model_performance(days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/monitor/drift")
def drift_check(days: int = 30):
    try:
        return detect_drift(days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/monitor/audit")
def audit(product_id: str = None, limit: int = 50):
    try:
        return {"data": get_audit_log(product_id, limit)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/monitor/feedback")
def feedback(req: FeedbackRequest):
    try:
        return record_feedback(req.product_id, req.prediction_date, req.actual_demand)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Model Card ───────────────────────────────────────────────────

@app.get("/model/card")
def model_card(days: int = 30):
    try:
        return get_model_card(days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Experiments ──────────────────────────────────────────────────

@app.get("/experiments")
def experiments(limit: int = 20):
    try:
        return {"runs": get_experiment_history(limit)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Price Optimization ───────────────────────────────────────────

@app.post("/optimize/price")
def price_optimize(req: PriceOptimizeRequest):
    try:
        # Get elasticity from history if available
        elasticity_val = -1.2  # default
        try:
            from pymongo import MongoClient
            from bson import ObjectId
            client = MongoClient(os.getenv("MONGO_URI"), serverSelectionTimeoutMS=3000)
            db = client["demandforecast"]
            sales = list(db.sales.find(
                {"productId": ObjectId(req.product_id)},
                {"price": 1, "quantity": 1}
            ).limit(100))
            client.close()
            if len(sales) >= 5:
                pairs = [(float(s.get("price", req.base_price)), float(s["quantity"])) for s in sales]
                elasticity_val = estimate_elasticity_from_history(pairs)
        except Exception:
            pass

        result = optimize_price(
            base_price=req.base_price,
            base_demand=req.base_demand,
            elasticity=elasticity_val,
            cost_per_unit=req.cost_per_unit,
            margin_floor=req.margin_floor,
            price_min=req.price_min,
            price_max=req.price_max
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Supply Chain ─────────────────────────────────────────────────

@app.post("/supply/lead-time")
def lead_time(req: LeadTimeRequest):
    try:
        lt = predict_lead_time(req.supplier_id, req.order_qty, req.category, req.price)
        return lt
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/supply/reorder-point")
def reorder_point(daily_demand: float, supplier_id: str = "default",
                  category: str = "Electronics", demand_std: float = None):
    try:
        lt = predict_lead_time(supplier_id, daily_demand * 30, category)
        rop = compute_reorder_point(daily_demand, lt["p90_days"], demand_std)
        return {**rop, "lead_time": lt}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Causal Features ──────────────────────────────────────────────

@app.get("/causal/features/{product_id}")
def causal_features(product_id: str, product_name: str = "", category: str = "Electronics"):
    try:
        return get_cached_causal_features(product_id, product_name, category)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Batch Predictions ────────────────────────────────────────────

@app.post("/batch/predict")
def batch_predict(background_tasks: BackgroundTasks):
    """Trigger batch prediction run (async)."""
    background_tasks.add_task(run_batch_predictions, ensemble, conformal)
    return {"status": "started", "message": "Batch prediction running in background"}


@app.get("/batch/results")
def batch_results(limit: int = 50):
    try:
        from pymongo import MongoClient
        client = MongoClient(os.getenv("MONGO_URI"), serverSelectionTimeoutMS=5000)
        db = client["demandforecast"]
        results = list(db.batch_predictions.find(
            {}, {"_id": 0}
        ).sort("stockout_risk", -1).limit(limit))
        client.close()
        return {"data": results, "count": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Training ─────────────────────────────────────────────────────

@app.post("/train")
def train_rf():
    try:
        from model.trainer import train_model
        metrics = train_model()
        predictor.reload()
        run_id = log_training_run({"model": "random_forest"}, metrics, category="global")
        return {"success": True, "metrics": metrics, "model": "random_forest", "run_id": run_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/train/ensemble")
def train_ens():
    try:
        metrics = train_ensemble()
        ensemble.reload()
        conformal.reload()
        cluster_router.reload()
        return {"success": True, "metrics": metrics, "model": "stacked_ensemble"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/train/ppo")
def train_ppo_endpoint(timesteps: int = 50000, background_tasks: BackgroundTasks = None):
    """Train PPO agent (runs in background for large timesteps)."""
    if background_tasks and timesteps > 10000:
        background_tasks.add_task(train_ppo_agent, timesteps)
        return {"status": "started", "timesteps": timesteps}
    try:
        result = train_ppo_agent(timesteps)
        ppo.reload()
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/train/lead-time")
def train_lead_time():
    try:
        result = train_lead_time_model()
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Dataset endpoints (kept for compatibility) ───────────────────

@app.post("/dataset/upload")
async def upload_dataset_compat():
    raise HTTPException(status_code=410, detail="Use /api/datasets/upload-json via backend")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
