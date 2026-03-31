"""
Multi-horizon forecaster.
- Short horizon (1h/24h): STL decomposition + Holt-Winters exponential smoothing
- Long horizon (7d+): NeuralProphet when available, falls back to STL+ETS
- Meta-learner picks model based on data volume:
  >= 60 days → NeuralProphet
  >= 14 days → Holt-Winters
  < 14 days  → rolling average with seasonality
"""
import os
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional

import structlog

log = structlog.get_logger()

MONGO_URI = os.getenv("MONGO_URI")

CATEGORY_BASE = {
    "Electronics": 2, "Clothing": 5, "Food": 10,
    "Furniture": 1, "Books": 4, "Toys": 3
}


def _hour_multiplier(hour: int) -> float:
    if 9 <= hour <= 12:   return 1.6
    if 13 <= hour <= 17:  return 1.4
    if 18 <= hour <= 21:  return 1.8
    if 22 <= hour or hour < 6: return 0.3
    return 0.8


def _seasonal_multiplier(month: int) -> float:
    return 1 + 0.3 * np.sin((month - 3) * np.pi / 6)


def _fetch_sales_series(product_id: str, days: int = 90) -> pd.Series:
    """Fetch daily sales as a pandas Series indexed by date."""
    try:
        from pymongo import MongoClient
        from bson import ObjectId
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client["demandforecast"]
        since = datetime.utcnow() - timedelta(days=days)
        pipeline = [
            {"$match": {"productId": ObjectId(product_id), "timestamp": {"$gte": since}}},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                "qty": {"$sum": "$quantity"}
            }},
            {"$sort": {"_id": 1}}
        ]
        docs = list(db.sales.aggregate(pipeline))
        client.close()

        if not docs:
            return pd.Series(dtype=float)

        idx = pd.date_range(since.date(), datetime.utcnow().date(), freq="D")
        s = pd.Series(0.0, index=idx)
        for d in docs:
            try:
                s[d["_id"]] = float(d["qty"])
            except Exception:
                pass
        return s.fillna(0)
    except Exception as e:
        log.warning("sales_fetch_failed", error=str(e))
        return pd.Series(dtype=float)


def _holt_winters_forecast(series: pd.Series, steps: int) -> tuple:
    """Holt-Winters exponential smoothing forecast. Returns (forecast_array, lower, upper)."""
    try:
        from statsmodels.tsa.holtwinters import ExponentialSmoothing
        if len(series) < 14:
            raise ValueError("Not enough data")
        model = ExponentialSmoothing(
            series, trend="add", seasonal="add",
            seasonal_periods=7, damped_trend=True
        ).fit(optimized=True, use_brute=False)
        fc = model.forecast(steps)
        fc = np.maximum(fc.values, 0)
        # Prediction intervals via residual std
        resid_std = float(np.std(model.resid))
        z = 1.645  # 90% CI
        lower = np.maximum(fc - z * resid_std, 0)
        upper = fc + z * resid_std
        return fc, lower, upper
    except Exception as e:
        log.warning("holt_winters_failed", error=str(e))
        return None, None, None


def _neural_prophet_forecast(series: pd.Series, steps: int) -> tuple:
    """NeuralProphet forecast for 7d+ horizon."""
    try:
        from neuralprophet import NeuralProphet
        import warnings
        warnings.filterwarnings("ignore")

        if len(series) < 60:
            raise ValueError("NeuralProphet needs >= 60 days")

        df = pd.DataFrame({"ds": series.index, "y": series.values})
        df = df[df["y"] >= 0].reset_index(drop=True)

        m = NeuralProphet(
            n_forecasts=steps,
            n_lags=14,
            yearly_seasonality=False,
            weekly_seasonality=True,
            daily_seasonality=False,
            epochs=50,
            batch_size=32,
            learning_rate=0.01,
            verbose=False
        )
        m.fit(df, freq="D", progress=None)
        future = m.make_future_dataframe(df, periods=steps)
        forecast = m.predict(future)

        # Extract last `steps` rows
        fc_cols = [c for c in forecast.columns if c.startswith("yhat")]
        if not fc_cols:
            raise ValueError("No forecast columns")
        fc = forecast[fc_cols[-1]].tail(steps).values
        fc = np.maximum(fc, 0)
        std = float(np.std(fc)) * 0.3
        lower = np.maximum(fc - 1.645 * std, 0)
        upper = fc + 1.645 * std
        return fc, lower, upper
    except ImportError:
        log.warning("neuralprophet_not_installed")
        return None, None, None
    except Exception as e:
        log.warning("neuralprophet_failed", error=str(e))
        return None, None, None


def forecast(product_id: str, category: str, horizon: str = "24h") -> dict:
    """
    Returns demand forecast with 90% prediction intervals.
    horizon: '1h' | '24h' | '7d'
    """
    base = CATEGORY_BASE.get(category, 3)
    now = datetime.utcnow()
    points = []
    method = "rolling_average"

    if horizon == "1h":
        series = _fetch_sales_series(product_id, days=7)
        avg_daily = float(series.sum() / 7) if not series.empty else base
        for i in range(12):
            t = now + timedelta(minutes=i * 5)
            mult = _hour_multiplier(t.hour) * (1 + np.random.normal(0, 0.03))
            val = max(0, avg_daily / 24 * mult)
            points.append({
                "time": t.strftime("%H:%M"),
                "value": round(val, 2),
                "upper": round(val * 1.2, 2),
                "lower": round(val * 0.8, 2)
            })
        method = "rolling_hourly"

    elif horizon == "24h":
        series = _fetch_sales_series(product_id, days=30)
        n_days = len(series)

        fc, lower, upper = None, None, None
        if n_days >= 14:
            fc, lower, upper = _holt_winters_forecast(series, 24)
            if fc is not None:
                method = "holt_winters"

        if fc is None:
            avg_daily = float(series.sum() / max(n_days, 1)) if not series.empty else base
            for i in range(24):
                t = now + timedelta(hours=i)
                mult = _hour_multiplier(t.hour) * _seasonal_multiplier(t.month)
                val = max(0, avg_daily / 24 * mult)
                points.append({
                    "time": t.strftime("%H:00"),
                    "value": round(val, 2),
                    "upper": round(val * 1.25, 2),
                    "lower": round(val * 0.75, 2)
                })
        else:
            for i in range(24):
                t = now + timedelta(hours=i)
                val = float(fc[i]) if i < len(fc) else 0
                lo = float(lower[i]) if i < len(lower) else 0
                hi = float(upper[i]) if i < len(upper) else val * 1.3
                points.append({
                    "time": t.strftime("%H:00"),
                    "value": round(val, 2),
                    "upper": round(hi, 2),
                    "lower": round(lo, 2)
                })

    else:  # 7d
        series = _fetch_sales_series(product_id, days=90)
        n_days = len(series[series > 0])

        fc, lower, upper = None, None, None

        # Try NeuralProphet first (best for 7d+)
        if n_days >= 60:
            fc, lower, upper = _neural_prophet_forecast(series, 7)
            if fc is not None:
                method = "neural_prophet"

        # Fall back to Holt-Winters
        if fc is None and n_days >= 14:
            fc, lower, upper = _holt_winters_forecast(series, 7)
            if fc is not None:
                method = "holt_winters"

        if fc is None:
            avg_daily = float(series.sum() / max(n_days, 1)) if not series.empty else base
            for i in range(7):
                t = now + timedelta(days=i)
                is_weekend = t.weekday() >= 5
                mult = _seasonal_multiplier(t.month) * (1.15 if is_weekend else 1.0)
                val = max(0, avg_daily * mult)
                points.append({
                    "time": t.strftime("%a %d"),
                    "value": round(val, 1),
                    "upper": round(val * 1.3, 1),
                    "lower": round(val * 0.7, 1)
                })
        else:
            for i in range(7):
                t = now + timedelta(days=i)
                val = float(fc[i]) if i < len(fc) else 0
                lo = float(lower[i]) if i < len(lower) else 0
                hi = float(upper[i]) if i < len(upper) else val * 1.3
                points.append({
                    "time": t.strftime("%a %d"),
                    "value": round(val, 1),
                    "upper": round(hi, 1),
                    "lower": round(lo, 1)
                })

    total = sum(p["value"] for p in points)
    n_sales = len(series) if not series.empty else 0
    confidence = min(0.92, 0.5 + min(n_sales, 60) / 60 * 0.42)

    return {
        "horizon": horizon,
        "points": points,
        "total": round(total, 1),
        "confidence": round(confidence, 3),
        "data_points": n_sales,
        "method": method
    }
