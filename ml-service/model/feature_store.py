"""
Redis-backed feature store.
Precomputes rolling windows, lag features, and Fourier seasonality
for all products on a 15-minute cron. Falls back to MongoDB if Redis
is unavailable — prediction still works, just slower.
"""
import os, json, hashlib
import numpy as np
from datetime import datetime, timedelta
from typing import Optional

import structlog

log = structlog.get_logger()

REDIS_URL = os.getenv("REDIS_URL", "")
FEATURE_TTL = 900  # 15 minutes

_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    if not REDIS_URL:
        return None
    try:
        import redis
        _redis_client = redis.from_url(REDIS_URL, decode_responses=True, socket_timeout=2)
        _redis_client.ping()
        log.info("redis_connected", url=REDIS_URL[:30])
        return _redis_client
    except Exception as e:
        log.warning("redis_unavailable", error=str(e))
        return None


def _cache_key(product_id: str, suffix: str = "features") -> str:
    return f"demandai:features:{product_id}:{suffix}"


def get_cached_features(product_id: str) -> Optional[dict]:
    r = _get_redis()
    if r is None:
        return None
    try:
        raw = r.get(_cache_key(product_id))
        if raw:
            return json.loads(raw)
    except Exception as e:
        log.warning("redis_get_error", error=str(e))
    return None


def set_cached_features(product_id: str, features: dict) -> None:
    r = _get_redis()
    if r is None:
        return
    try:
        r.setex(_cache_key(product_id), FEATURE_TTL, json.dumps(features))
    except Exception as e:
        log.warning("redis_set_error", error=str(e))


def compute_fourier_features(day_of_year: int, n_harmonics: int = 3) -> dict:
    """Fourier features for weekly (7d) and annual (365d) seasonality."""
    feats = {}
    for k in range(1, n_harmonics + 1):
        feats[f"sin_week_{k}"] = float(np.sin(2 * np.pi * k * day_of_year / 7))
        feats[f"cos_week_{k}"] = float(np.cos(2 * np.pi * k * day_of_year / 7))
        feats[f"sin_year_{k}"] = float(np.sin(2 * np.pi * k * day_of_year / 365))
        feats[f"cos_year_{k}"] = float(np.cos(2 * np.pi * k * day_of_year / 365))
    return feats


def build_lag_features(daily_sales: list) -> dict:
    """Compute lag-1, lag-7, lag-14, lag-28 from daily sales array (most recent last)."""
    n = len(daily_sales)
    def _lag(k):
        return float(daily_sales[-(k+1)]) if n > k else 0.0
    return {
        "lag_1": _lag(1),
        "lag_7": _lag(7),
        "lag_14": _lag(14),
        "lag_28": _lag(28),
        "rolling_std_7": float(np.std(daily_sales[-7:])) if n >= 7 else 0.0,
        "rolling_std_30": float(np.std(daily_sales[-30:])) if n >= 30 else 0.0,
    }


def precompute_all_products():
    """
    Called by APScheduler every 15 minutes.
    Pulls all active products from MongoDB, computes features, caches in Redis.
    """
    from pymongo import MongoClient
    MONGO_URI = os.getenv("MONGO_URI")
    if not MONGO_URI:
        return

    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client["demandforecast"]
        products = list(db.products.find({"isActive": True}, {"_id": 1, "category": 1, "price": 1, "stock": 1}))
        now = datetime.utcnow()

        for prod in products:
            pid = str(prod["_id"])
            since_90 = now - timedelta(days=90)

            # Daily sales series
            pipeline = [
                {"$match": {"productId": prod["_id"], "timestamp": {"$gte": since_90}}},
                {"$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                    "qty": {"$sum": "$quantity"}
                }},
                {"$sort": {"_id": 1}}
            ]
            daily_docs = list(db.sales.aggregate(pipeline))
            daily_map = {d["_id"]: d["qty"] for d in daily_docs}

            # Fill gaps
            daily_series = []
            for i in range(90, 0, -1):
                d = (now - timedelta(days=i)).strftime("%Y-%m-%d")
                daily_series.append(daily_map.get(d, 0))

            total_90 = sum(daily_series)
            total_30 = sum(daily_series[-30:])
            total_7 = sum(daily_series[-7:])

            lag_feats = build_lag_features(daily_series)
            fourier_feats = compute_fourier_features(now.timetuple().tm_yday)

            features = {
                "avg_daily_sales_90d": round(total_90 / 90, 4),
                "avg_daily_sales_30d": round(total_30 / 30, 4),
                "avg_daily_sales_7d": round(total_7 / 7, 4),
                "data_quality": min(1.0, len(daily_docs) / 30),
                "computed_at": now.isoformat(),
                **lag_feats,
                **fourier_feats,
            }
            set_cached_features(pid, features)

        client.close()
        log.info("feature_store_refreshed", products=len(products))
    except Exception as e:
        log.error("feature_store_error", error=str(e))
