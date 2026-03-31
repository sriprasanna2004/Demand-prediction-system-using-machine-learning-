"""
Advanced analytics:
- STL decomposition (trend + seasonality + residual)
- Isolation Forest anomaly detection
- Price elasticity estimation
- Cross-product correlation
- What-if price simulator
"""
import os
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

try:
    from statsmodels.tsa.seasonal import STL
    STATSMODELS_AVAILABLE = True
except ImportError:
    STATSMODELS_AVAILABLE = False

try:
    from sklearn.ensemble import IsolationForest
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()
MONGO_URI = os.getenv("MONGO_URI")


def _get_sales_series(product_id: str, days: int = 90):
    """Fetch daily sales series for a product."""
    try:
        from bson import ObjectId
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client["demandforecast"]
        since = datetime.utcnow() - timedelta(days=days)
        sales = list(db.sales.find(
            {"productId": ObjectId(product_id), "timestamp": {"$gte": since}},
            {"quantity": 1, "timestamp": 1, "price": 1}
        ))
        client.close()
        return sales
    except Exception:
        return []


def stl_decompose(product_id: str, category: str, days: int = 90) -> dict:
    """
    STL decomposition of demand time series.
    Returns trend, seasonal, and residual components.
    """
    sales = _get_sales_series(product_id, days)

    if len(sales) < 14:
        return _synthetic_decomposition(category, days)

    # Build daily series
    df = pd.DataFrame(sales)
    df["date"] = pd.to_datetime(df["timestamp"]).dt.date
    daily = df.groupby("date")["quantity"].sum().reset_index()
    daily = daily.set_index("date")

    # Fill missing days with 0
    idx = pd.date_range(daily.index.min(), daily.index.max(), freq="D")
    daily = daily.reindex(idx, fill_value=0)
    series = daily["quantity"].values.astype(float)

    if not STATSMODELS_AVAILABLE or len(series) < 14:
        return _manual_decomposition(series, daily.index)

    try:
        stl = STL(series, period=7, robust=True)
        result = stl.fit()
        dates = [str(d.date()) for d in daily.index]
        return {
            "dates": dates,
            "observed": [round(float(v), 2) for v in series],
            "trend": [round(float(v), 2) for v in result.trend],
            "seasonal": [round(float(v), 2) for v in result.seasonal],
            "residual": [round(float(v), 2) for v in result.resid],
            "trend_direction": "increasing" if result.trend[-1] > result.trend[0] else "decreasing",
            "seasonality_strength": round(float(np.std(result.seasonal) / (np.std(result.seasonal) + np.std(result.resid) + 1e-8)), 3),
            "data_points": len(series)
        }
    except Exception as e:
        return _manual_decomposition(series, daily.index)


def _manual_decomposition(series, index):
    """Simple moving average decomposition fallback."""
    n = len(series)
    window = min(7, n // 2)
    trend = pd.Series(series).rolling(window, center=True, min_periods=1).mean().values
    seasonal = series - trend
    residual = series - trend - seasonal
    dates = [str(d.date()) if hasattr(d, 'date') else str(d) for d in index]
    return {
        "dates": dates,
        "observed": [round(float(v), 2) for v in series],
        "trend": [round(float(v), 2) for v in trend],
        "seasonal": [round(float(v), 2) for v in seasonal],
        "residual": [round(float(v), 2) for v in residual],
        "trend_direction": "increasing" if trend[-1] > trend[0] else "decreasing",
        "seasonality_strength": round(float(np.std(seasonal) / (np.std(seasonal) + np.std(residual) + 1e-8)), 3),
        "data_points": n
    }


def _synthetic_decomposition(category: str, days: int):
    """Generate synthetic decomposition for cold start."""
    base = {"Electronics": 3, "Clothing": 6, "Food": 15, "Furniture": 1, "Books": 4, "Toys": 4}.get(category, 3)
    dates = [(datetime.utcnow() - timedelta(days=days-i)).strftime("%Y-%m-%d") for i in range(days)]
    trend = [base * (1 + i * 0.002) for i in range(days)]
    seasonal = [base * 0.3 * np.sin(i * 2 * np.pi / 7) for i in range(days)]
    observed = [max(0, t + s + np.random.normal(0, base * 0.1)) for t, s in zip(trend, seasonal)]
    residual = [o - t - s for o, t, s in zip(observed, trend, seasonal)]
    return {
        "dates": dates, "observed": [round(v, 2) for v in observed],
        "trend": [round(v, 2) for v in trend], "seasonal": [round(v, 2) for v in seasonal],
        "residual": [round(v, 2) for v in residual],
        "trend_direction": "increasing", "seasonality_strength": 0.45, "data_points": 0
    }


def detect_anomalies(product_id: str, days: int = 60) -> dict:
    """
    Isolation Forest anomaly detection on sales data.
    Returns anomaly scores and flagged dates.
    """
    sales = _get_sales_series(product_id, days)

    if len(sales) < 10:
        return {"anomalies": [], "anomaly_rate": 0, "message": "Insufficient data"}

    df = pd.DataFrame(sales)
    df["date"] = pd.to_datetime(df["timestamp"]).dt.date
    df["hour"] = pd.to_datetime(df["timestamp"]).dt.hour
    daily = df.groupby("date").agg(
        quantity=("quantity", "sum"),
        transactions=("quantity", "count"),
        avg_price=("price", "mean")
    ).reset_index()

    if len(daily) < 5:
        return {"anomalies": [], "anomaly_rate": 0, "message": "Insufficient daily data"}

    features = daily[["quantity", "transactions"]].values

    if not SKLEARN_AVAILABLE:
        return {"anomalies": [], "anomaly_rate": 0, "message": "sklearn not available"}

    iso = IsolationForest(contamination=0.1, random_state=42, n_estimators=100)
    labels = iso.fit_predict(features)
    scores = iso.score_samples(features)

    anomalies = []
    for i, (label, score) in enumerate(zip(labels, scores)):
        if label == -1:
            anomalies.append({
                "date": str(daily.iloc[i]["date"]),
                "quantity": int(daily.iloc[i]["quantity"]),
                "anomaly_score": round(float(score), 3),
                "severity": "high" if score < -0.3 else "medium"
            })

    return {
        "anomalies": anomalies,
        "anomaly_rate": round(len(anomalies) / len(daily), 3),
        "total_days": len(daily),
        "flagged_days": len(anomalies),
        "all_scores": [{"date": str(daily.iloc[i]["date"]), "score": round(float(scores[i]), 3), "is_anomaly": labels[i] == -1} for i in range(len(daily))]
    }


def price_elasticity(product_id: str) -> dict:
    """
    Estimate price elasticity of demand using log-log regression.
    Elasticity = % change in demand / % change in price
    """
    sales = _get_sales_series(product_id, 90)

    if len(sales) < 20:
        return {"elasticity": -1.2, "interpretation": "Estimated (insufficient data)", "confidence": "low"}

    df = pd.DataFrame(sales)
    df = df[df["price"] > 0]

    if len(df) < 10:
        return {"elasticity": -1.2, "interpretation": "Estimated (insufficient data)", "confidence": "low"}

    log_price = np.log(df["price"].values)
    log_qty = np.log(np.maximum(df["quantity"].values, 0.1))

    # OLS log-log regression
    X = np.column_stack([np.ones(len(log_price)), log_price])
    try:
        coeffs = np.linalg.lstsq(X, log_qty, rcond=None)[0]
        elasticity = float(coeffs[1])
        r2 = float(1 - np.var(log_qty - X @ coeffs) / np.var(log_qty))
    except Exception:
        elasticity = -1.2
        r2 = 0

    if elasticity < -2:
        interpretation = "Highly elastic — demand very sensitive to price changes"
    elif elasticity < -1:
        interpretation = "Elastic — demand moderately sensitive to price"
    elif elasticity < 0:
        interpretation = "Inelastic — demand relatively insensitive to price"
    else:
        interpretation = "Giffen good — demand increases with price (unusual)"

    return {
        "elasticity": round(elasticity, 3),
        "interpretation": interpretation,
        "r2": round(r2, 3),
        "confidence": "high" if r2 > 0.5 else "medium" if r2 > 0.2 else "low",
        "data_points": len(df)
    }


def whatif_simulator(product_id: str, category: str, base_features: dict, scenarios: list) -> dict:
    """
    What-if simulator: test multiple price/stock/trend scenarios.
    scenarios: [{"name": "10% price drop", "price_change": -0.1, "trend_change": 0, "stock_change": 0}]
    """
    results = []
    base_price = base_features.get("price", 50)
    base_trend = base_features.get("trend_score", 50)
    base_stock = base_features.get("current_stock", 50)
    base_demand = base_features.get("avg_daily_sales_30d", 1) * 30

    for scenario in scenarios:
        new_price = base_price * (1 + scenario.get("price_change", 0))
        new_trend = base_trend + scenario.get("trend_change", 0)
        new_stock = base_stock * (1 + scenario.get("stock_change", 0))

        # Price elasticity effect
        price_ratio = new_price / max(base_price, 0.01)
        elasticity = -1.2  # default
        demand_multiplier = price_ratio ** elasticity

        # Trend effect
        trend_multiplier = 1 + (new_trend - base_trend) / 200

        new_demand = base_demand * demand_multiplier * trend_multiplier
        demand_change_pct = (new_demand - base_demand) / max(base_demand, 0.01) * 100

        # Revenue impact
        base_revenue = base_demand * base_price
        new_revenue = new_demand * new_price
        revenue_change_pct = (new_revenue - base_revenue) / max(base_revenue, 0.01) * 100

        results.append({
            "scenario_name": scenario.get("name", "Unnamed"),
            "price_change_pct": round(scenario.get("price_change", 0) * 100, 1),
            "new_price": round(new_price, 2),
            "predicted_demand": round(new_demand, 1),
            "demand_change_pct": round(demand_change_pct, 1),
            "new_revenue": round(new_revenue, 2),
            "revenue_change_pct": round(revenue_change_pct, 1),
            "recommendation": "Proceed" if revenue_change_pct > 0 else "Caution"
        })

    return {
        "base_demand": round(base_demand, 1),
        "base_price": base_price,
        "base_revenue": round(base_demand * base_price, 2),
        "scenarios": results
    }
