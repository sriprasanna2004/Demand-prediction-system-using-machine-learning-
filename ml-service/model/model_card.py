"""
Model card: comprehensive evaluation metrics.
- MAPE by category
- MAPE by demand volume tier (high/mid/low)
- Forecast bias (systematic over/under prediction)
- Service level achieved vs target
- Calibration metrics for conformal intervals
"""
import os
import numpy as np
from datetime import datetime, timedelta
from typing import Optional

import structlog

log = structlog.get_logger()

MONGO_URI = os.getenv("MONGO_URI")
CATEGORIES = ["Electronics", "Clothing", "Food", "Furniture", "Books", "Toys"]


def _get_audit_data(days: int = 30) -> list:
    try:
        from pymongo import MongoClient
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client["demandforecast"]
        since = datetime.utcnow() - timedelta(days=days)
        records = list(db.prediction_audit.find(
            {"timestamp": {"$gte": since}, "actual_demand": {"$ne": None}},
            {"_id": 0, "product_id": 1, "predicted_demand": 1, "actual_demand": 1,
             "confidence_score": 1, "timestamp": 1}
        ))
        client.close()
        return records
    except Exception as e:
        log.warning("audit_fetch_failed", error=str(e))
        return []


def _get_product_categories() -> dict:
    """Returns {product_id: category} mapping."""
    try:
        from pymongo import MongoClient
        from bson import ObjectId
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client["demandforecast"]
        products = list(db.products.find({}, {"_id": 1, "category": 1}))
        client.close()
        return {str(p["_id"]): p.get("category", "Unknown") for p in products}
    except Exception:
        return {}


def _mape(actual: list, predicted: list) -> float:
    if not actual:
        return None
    errors = [abs(a - p) / max(abs(a), 1) for a, p in zip(actual, predicted)]
    return round(float(np.mean(errors)) * 100, 2)


def _bias(actual: list, predicted: list) -> float:
    """Positive = over-predicting, negative = under-predicting."""
    if not actual:
        return None
    errors = [(p - a) / max(abs(a), 1) for a, p in zip(actual, predicted)]
    return round(float(np.mean(errors)) * 100, 2)


def get_model_card(days: int = 30) -> dict:
    """
    Returns full model card with all evaluation metrics.
    Uses prediction audit log (requires actual_demand feedback).
    Falls back to synthetic metrics if no audit data.
    """
    records = _get_audit_data(days)

    if len(records) < 5:
        return _synthetic_model_card()

    cat_map = _get_product_categories()

    actuals = [r["actual_demand"] for r in records]
    preds = [r["predicted_demand"] for r in records]
    confs = [r.get("confidence_score", 0.7) for r in records]

    # Overall metrics
    overall_mape = _mape(actuals, preds)
    overall_bias = _bias(actuals, preds)
    mae = round(float(np.mean([abs(a - p) for a, p in zip(actuals, preds)])), 2)

    # MAPE by category
    cat_groups = {}
    for r in records:
        cat = cat_map.get(r["product_id"], "Unknown")
        if cat not in cat_groups:
            cat_groups[cat] = {"actual": [], "pred": []}
        cat_groups[cat]["actual"].append(r["actual_demand"])
        cat_groups[cat]["pred"].append(r["predicted_demand"])

    mape_by_category = {
        cat: _mape(g["actual"], g["pred"])
        for cat, g in cat_groups.items()
    }

    # MAPE by demand volume tier
    median_demand = float(np.median(actuals))
    p75 = float(np.percentile(actuals, 75))

    def _tier(a):
        if a >= p75: return "high"
        if a >= median_demand: return "mid"
        return "low"

    tier_groups = {"high": {"actual": [], "pred": []},
                   "mid": {"actual": [], "pred": []},
                   "low": {"actual": [], "pred": []}}
    for a, p in zip(actuals, preds):
        t = _tier(a)
        tier_groups[t]["actual"].append(a)
        tier_groups[t]["pred"].append(p)

    mape_by_tier = {
        tier: _mape(g["actual"], g["pred"])
        for tier, g in tier_groups.items()
    }

    # Service level: % of predictions within 20% of actual
    service_level = round(
        float(np.mean([abs(a - p) / max(a, 1) <= 0.2 for a, p in zip(actuals, preds)])) * 100, 1
    )

    # Calibration: % of actuals within confidence interval
    # Approximate: if confidence=0.9, expect 90% of actuals within ±10% of prediction
    calibration_hits = []
    for r in records:
        a = r["actual_demand"]
        p = r["predicted_demand"]
        c = r.get("confidence_score", 0.7)
        margin = p * (1 - c)
        calibration_hits.append(abs(a - p) <= margin)
    calibration_accuracy = round(float(np.mean(calibration_hits)) * 100, 1)

    # Trend: compare first half vs second half MAPE
    mid = len(records) // 2
    mape_first = _mape(actuals[:mid], preds[:mid])
    mape_second = _mape(actuals[mid:], preds[mid:])
    trend = "improving" if (mape_second or 100) < (mape_first or 100) else "degrading"

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "evaluation_period_days": days,
        "sample_count": len(records),
        "overall": {
            "mae": mae,
            "mape": overall_mape,
            "bias_pct": overall_bias,
            "service_level_pct": service_level,
            "calibration_accuracy_pct": calibration_accuracy,
            "trend": trend
        },
        "mape_by_category": mape_by_category,
        "mape_by_tier": mape_by_tier,
        "bias_interpretation": (
            "Over-predicting" if (overall_bias or 0) > 5
            else "Under-predicting" if (overall_bias or 0) < -5
            else "Well-calibrated"
        ),
        "service_level_target": 80.0,
        "service_level_achieved": service_level,
        "service_level_status": "✅ On target" if service_level >= 80 else "⚠️ Below target"
    }


def _synthetic_model_card() -> dict:
    """Returns realistic synthetic metrics when no audit data exists."""
    return {
        "generated_at": datetime.utcnow().isoformat(),
        "evaluation_period_days": 30,
        "sample_count": 0,
        "note": "No feedback data yet. Submit actual demand via /monitor/feedback to populate.",
        "overall": {
            "mae": None, "mape": None, "bias_pct": None,
            "service_level_pct": None, "calibration_accuracy_pct": None,
            "trend": "unknown"
        },
        "mape_by_category": {cat: None for cat in CATEGORIES},
        "mape_by_tier": {"high": None, "mid": None, "low": None},
        "bias_interpretation": "Insufficient data",
        "service_level_target": 80.0,
        "service_level_achieved": None,
        "service_level_status": "⏳ Awaiting feedback data"
    }
