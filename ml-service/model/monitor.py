"""
Model monitoring:
- Prediction audit log (every prediction stored with features + result)
- Model drift detection (PSI + prediction distribution shift)
- Performance tracking over time (MAE, MAPE per product/category)
"""
import os
import numpy as np
from datetime import datetime, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()
MONGO_URI = os.getenv("MONGO_URI")

PSI_THRESHOLD = 0.2   # Population Stability Index threshold for drift alert
MAE_DRIFT_PCT = 0.3   # 30% increase in MAE triggers drift alert


def log_prediction(product_id: str, product_name: str, features: dict,
                   prediction: dict, model_version: str = "v3"):
    """Store every prediction in audit log."""
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        db = client["demandforecast"]
        db.prediction_audit.insert_one({
            "product_id": product_id,
            "product_name": product_name,
            "timestamp": datetime.utcnow(),
            "model_version": model_version,
            "features": {k: v for k, v in features.items() if k not in ["summary"]},
            "predicted_demand": prediction.get("predicted_demand"),
            "confidence_score": prediction.get("confidence_score"),
            "method": prediction.get("method"),
            "actual_demand": None  # filled in later via /monitor/feedback
        })
        client.close()
    except Exception as e:
        print(f"Audit log error: {e}")


def record_feedback(product_id: str, prediction_date: str, actual_demand: float):
    """Record actual demand to compute prediction accuracy."""
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        db = client["demandforecast"]
        from datetime import datetime
        date = datetime.fromisoformat(prediction_date)
        db.prediction_audit.update_many(
            {"product_id": product_id, "timestamp": {"$gte": date - timedelta(hours=1), "$lte": date + timedelta(hours=1)}},
            {"$set": {"actual_demand": actual_demand}}
        )
        client.close()
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}


def get_model_performance(days: int = 30) -> dict:
    """Compute MAE, MAPE, R² from audit log where actual_demand is known."""
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client["demandforecast"]
        since = datetime.utcnow() - timedelta(days=days)
        records = list(db.prediction_audit.find(
            {"timestamp": {"$gte": since}, "actual_demand": {"$ne": None}},
            {"predicted_demand": 1, "actual_demand": 1, "method": 1, "product_id": 1, "timestamp": 1}
        ))
        client.close()
    except Exception as e:
        return {"error": str(e), "records": 0}

    if not records:
        return {"records": 0, "message": "No feedback data yet. Use /monitor/feedback to record actuals."}

    preds = np.array([r["predicted_demand"] for r in records])
    actuals = np.array([r["actual_demand"] for r in records])
    mask = actuals > 0

    mae = float(np.mean(np.abs(preds - actuals)))
    mape = float(np.mean(np.abs((preds[mask] - actuals[mask]) / actuals[mask]))) * 100 if mask.sum() > 0 else 0
    ss_res = np.sum((actuals - preds) ** 2)
    ss_tot = np.sum((actuals - actuals.mean()) ** 2)
    r2 = float(1 - ss_res / (ss_tot + 1e-8))

    # Per-method breakdown
    methods = {}
    for r in records:
        m = r.get("method", "unknown")
        if m not in methods:
            methods[m] = {"preds": [], "actuals": []}
        methods[m]["preds"].append(r["predicted_demand"])
        methods[m]["actuals"].append(r["actual_demand"])

    method_stats = {}
    for m, data in methods.items():
        p = np.array(data["preds"])
        a = np.array(data["actuals"])
        method_stats[m] = {
            "mae": round(float(np.mean(np.abs(p - a))), 2),
            "count": len(p)
        }

    return {
        "records": len(records),
        "mae": round(mae, 2),
        "mape": round(mape, 1),
        "r2": round(r2, 4),
        "by_method": method_stats,
        "period_days": days
    }


def detect_drift(days: int = 30) -> dict:
    """
    Detect model drift using Population Stability Index (PSI).
    Compares recent prediction distribution vs baseline.
    """
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client["demandforecast"]
        now = datetime.utcnow()
        recent_since = now - timedelta(days=days)
        baseline_since = now - timedelta(days=days * 2)

        recent = list(db.prediction_audit.find(
            {"timestamp": {"$gte": recent_since}},
            {"predicted_demand": 1, "confidence_score": 1, "features.data_quality": 1}
        ))
        baseline = list(db.prediction_audit.find(
            {"timestamp": {"$gte": baseline_since, "$lt": recent_since}},
            {"predicted_demand": 1, "confidence_score": 1}
        ))
        client.close()
    except Exception as e:
        return {"error": str(e)}

    if len(recent) < 10 or len(baseline) < 10:
        return {"drift_detected": False, "message": "Insufficient data for drift detection", "psi": 0}

    recent_preds = np.array([r["predicted_demand"] for r in recent if r.get("predicted_demand")])
    baseline_preds = np.array([r["predicted_demand"] for r in baseline if r.get("predicted_demand")])

    psi = _compute_psi(baseline_preds, recent_preds)

    recent_conf = np.mean([r.get("confidence_score", 0.5) for r in recent])
    baseline_conf = np.mean([r.get("confidence_score", 0.5) for r in baseline])
    conf_drop = baseline_conf - recent_conf

    drift_detected = psi > PSI_THRESHOLD or conf_drop > 0.1

    alerts = []
    if psi > PSI_THRESHOLD:
        alerts.append(f"Prediction distribution shifted significantly (PSI={psi:.3f} > {PSI_THRESHOLD})")
    if conf_drop > 0.1:
        alerts.append(f"Average confidence dropped by {conf_drop:.2f} — model may be less certain")
    if not alerts:
        alerts.append("No significant drift detected")

    return {
        "drift_detected": drift_detected,
        "psi": round(psi, 4),
        "psi_threshold": PSI_THRESHOLD,
        "recent_avg_confidence": round(recent_conf, 3),
        "baseline_avg_confidence": round(baseline_conf, 3),
        "confidence_drop": round(conf_drop, 3),
        "recent_predictions": len(recent),
        "baseline_predictions": len(baseline),
        "alerts": alerts,
        "recommendation": "Retrain model" if drift_detected else "Model is stable"
    }


def _compute_psi(baseline: np.ndarray, recent: np.ndarray, bins: int = 10) -> float:
    """Population Stability Index."""
    try:
        min_val = min(baseline.min(), recent.min())
        max_val = max(baseline.max(), recent.max())
        bin_edges = np.linspace(min_val, max_val, bins + 1)

        baseline_pct = np.histogram(baseline, bins=bin_edges)[0] / len(baseline)
        recent_pct = np.histogram(recent, bins=bin_edges)[0] / len(recent)

        # Avoid log(0)
        baseline_pct = np.where(baseline_pct == 0, 0.0001, baseline_pct)
        recent_pct = np.where(recent_pct == 0, 0.0001, recent_pct)

        psi = np.sum((recent_pct - baseline_pct) * np.log(recent_pct / baseline_pct))
        return float(psi)
    except Exception:
        return 0.0


def get_audit_log(product_id: str = None, limit: int = 50) -> list:
    """Get recent prediction audit log."""
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client["demandforecast"]
        query = {"product_id": product_id} if product_id else {}
        records = list(db.prediction_audit.find(
            query, {"_id": 0, "features": 0}
        ).sort("timestamp", -1).limit(limit))
        client.close()
        for r in records:
            r["timestamp"] = r["timestamp"].isoformat()
        return records
    except Exception:
        return []
