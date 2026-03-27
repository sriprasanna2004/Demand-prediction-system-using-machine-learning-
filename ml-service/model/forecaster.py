"""
Time-series forecaster — predicts demand for next 1h, 24h, 7d.
Uses rolling sales averages + seasonal patterns.
"""
import os
import numpy as np
from pymongo import MongoClient
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()
MONGO_URI = os.getenv("MONGO_URI")

CATEGORY_BASE = {
    "Electronics": 2, "Clothing": 5, "Food": 10,
    "Furniture": 1, "Books": 4, "Toys": 3
}

def _hour_multiplier(hour: int) -> float:
    """Demand curve by hour of day."""
    if 9 <= hour <= 12:   return 1.6
    if 13 <= hour <= 17:  return 1.4
    if 18 <= hour <= 21:  return 1.8
    if 22 <= hour or hour < 6: return 0.3
    return 0.8

def _seasonal_multiplier(month: int) -> float:
    return 1 + 0.3 * np.sin((month - 3) * np.pi / 6)

def forecast(product_id: str, category: str, horizon: str = "24h") -> dict:
    """
    Returns demand forecast with confidence intervals.
    horizon: '1h' | '24h' | '7d'
    """
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client["demandforecast"]
        from bson import ObjectId
        since = datetime.utcnow() - timedelta(days=30)
        sales = list(db.sales.find(
            {"productId": ObjectId(product_id), "timestamp": {"$gte": since}},
            {"quantity": 1, "timestamp": 1}
        ))
        client.close()
    except Exception:
        sales = []

    base = CATEGORY_BASE.get(category, 3)
    avg_daily = sum(s["quantity"] for s in sales) / 30 if sales else base

    now = datetime.utcnow()
    points = []

    if horizon == "1h":
        steps = 12  # every 5 min
        for i in range(steps):
            t = now + timedelta(minutes=i * 5)
            mult = _hour_multiplier(t.hour) * (1 + np.random.normal(0, 0.05))
            val = max(0, avg_daily / 24 * mult)
            points.append({"time": t.strftime("%H:%M"), "value": round(val, 2),
                           "upper": round(val * 1.2, 2), "lower": round(val * 0.8, 2)})

    elif horizon == "24h":
        for i in range(24):
            t = now + timedelta(hours=i)
            mult = _hour_multiplier(t.hour) * _seasonal_multiplier(t.month)
            val = max(0, avg_daily / 24 * mult)
            points.append({"time": t.strftime("%H:00"), "value": round(val, 2),
                           "upper": round(val * 1.25, 2), "lower": round(val * 0.75, 2)})

    else:  # 7d
        for i in range(7):
            t = now + timedelta(days=i)
            is_weekend = t.weekday() >= 5
            mult = _seasonal_multiplier(t.month) * (1.15 if is_weekend else 1.0)
            val = max(0, avg_daily * mult)
            points.append({"time": t.strftime("%a %d"), "value": round(val, 1),
                           "upper": round(val * 1.3, 1), "lower": round(val * 0.7, 1)})

    total = sum(p["value"] for p in points)
    confidence = min(0.92, 0.5 + min(len(sales), 30) / 30 * 0.42)

    return {"horizon": horizon, "points": points, "total": round(total, 1),
            "confidence": round(confidence, 3), "data_points": len(sales)}
