"""
Supplier lead time model using LightGBM quantile regression.
Predicts P50/P90 lead time per supplier.
Feeds P90 into reorder point formula:
  ROP = demand_forecast * P90_lead_time + safety_stock
"""
import os
import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional

import structlog

log = structlog.get_logger()

LEAD_TIME_MODEL_PATH = os.getenv("LEAD_TIME_MODEL_PATH", "./models/lead_time_model.joblib")

FEATURE_COLS = ["supplier_id_enc", "order_qty", "month", "day_of_week",
                "category_code", "price", "historical_avg_lead"]


def _encode_supplier(supplier_id: str) -> int:
    """Simple hash encoding for supplier ID."""
    return abs(hash(supplier_id)) % 1000


def train_lead_time_model(orders_data: list = None) -> dict:
    """
    Train quantile regression model on historical order data.
    orders_data: list of dicts with keys:
      supplier_id, order_qty, order_date, delivery_date, category, price
    """
    from lightgbm import LGBMRegressor

    if not orders_data or len(orders_data) < 20:
        orders_data = _generate_synthetic_orders(500)

    df = pd.DataFrame(orders_data)
    df["lead_time_days"] = (
        pd.to_datetime(df["delivery_date"]) - pd.to_datetime(df["order_date"])
    ).dt.days.clip(lower=1, upper=90)

    df["supplier_id_enc"] = df["supplier_id"].apply(_encode_supplier)
    df["month"] = pd.to_datetime(df["order_date"]).dt.month
    df["day_of_week"] = pd.to_datetime(df["order_date"]).dt.dayofweek
    df["category_code"] = df.get("category", "Electronics").map(
        {"Electronics": 0, "Clothing": 1, "Food": 2, "Furniture": 3, "Books": 4, "Toys": 5}
    ).fillna(-1)
    df["price"] = df.get("price", 50).fillna(50)

    # Compute historical avg lead time per supplier
    avg_lead = df.groupby("supplier_id_enc")["lead_time_days"].mean().to_dict()
    df["historical_avg_lead"] = df["supplier_id_enc"].map(avg_lead).fillna(df["lead_time_days"].mean())

    X = df[FEATURE_COLS].fillna(0)
    y = df["lead_time_days"]

    models = {}
    metrics = {}
    for quantile, alpha in [(0.5, "p50"), (0.9, "p90")]:
        model = LGBMRegressor(
            objective="quantile",
            alpha=quantile,
            n_estimators=200,
            learning_rate=0.05,
            max_depth=5,
            random_state=42,
            verbose=-1
        )
        model.fit(X, y)
        preds = model.predict(X)
        mae = float(np.mean(np.abs(y - preds)))
        models[alpha] = model
        metrics[alpha] = {"mae": round(mae, 2)}
        log.info("lead_time_model_trained", quantile=alpha, mae=mae)

    Path("./models").mkdir(exist_ok=True)
    joblib.dump({"models": models, "avg_lead": avg_lead}, LEAD_TIME_MODEL_PATH)
    return {"status": "trained", "metrics": metrics, "samples": len(df)}


def predict_lead_time(supplier_id: str, order_qty: float, category: str = "Electronics",
                      price: float = 50.0) -> dict:
    """Predict P50 and P90 lead time for a supplier order."""
    path = Path(LEAD_TIME_MODEL_PATH)
    if not path.exists():
        # Return synthetic estimates
        return {"p50_days": 7, "p90_days": 14, "method": "synthetic_fallback"}

    try:
        data = joblib.load(path)
        models = data["models"]
        avg_lead = data["avg_lead"]

        now = datetime.utcnow()
        enc = _encode_supplier(supplier_id)
        hist_avg = avg_lead.get(enc, 7.0)
        cat_map = {"Electronics": 0, "Clothing": 1, "Food": 2, "Furniture": 3, "Books": 4, "Toys": 5}

        X = pd.DataFrame([{
            "supplier_id_enc": enc,
            "order_qty": order_qty,
            "month": now.month,
            "day_of_week": now.weekday(),
            "category_code": cat_map.get(category, -1),
            "price": price,
            "historical_avg_lead": hist_avg
        }])

        p50 = max(1, float(models["p50"].predict(X)[0]))
        p90 = max(p50, float(models["p90"].predict(X)[0]))

        return {"p50_days": round(p50, 1), "p90_days": round(p90, 1), "method": "quantile_regression"}
    except Exception as e:
        log.warning("lead_time_predict_failed", error=str(e))
        return {"p50_days": 7, "p90_days": 14, "method": "fallback"}


def compute_reorder_point(daily_demand: float, p90_lead_time: float,
                          demand_std: float = None, service_level_z: float = 1.65) -> dict:
    """
    ROP = demand_forecast * P90_lead_time + safety_stock
    safety_stock = Z * sigma_demand * sqrt(lead_time)
    """
    if demand_std is None:
        demand_std = daily_demand * 0.2  # assume 20% CV

    safety_stock = service_level_z * demand_std * np.sqrt(p90_lead_time)
    rop = daily_demand * p90_lead_time + safety_stock

    return {
        "reorder_point": round(float(rop), 0),
        "safety_stock": round(float(safety_stock), 0),
        "demand_during_lead_time": round(float(daily_demand * p90_lead_time), 0),
        "p90_lead_time_days": p90_lead_time,
        "daily_demand": round(daily_demand, 2)
    }


def _generate_synthetic_orders(n: int = 500) -> list:
    np.random.seed(42)
    suppliers = ["SUP_A", "SUP_B", "SUP_C", "SUP_D"]
    categories = ["Electronics", "Clothing", "Food", "Furniture", "Books", "Toys"]
    base_lead = {"SUP_A": 5, "SUP_B": 10, "SUP_C": 7, "SUP_D": 14}
    orders = []
    for _ in range(n):
        sup = np.random.choice(suppliers)
        cat = np.random.choice(categories)
        order_date = datetime.utcnow() - timedelta(days=np.random.randint(1, 365))
        lead = max(1, int(base_lead[sup] + np.random.normal(0, 2)))
        delivery_date = order_date + timedelta(days=lead)
        orders.append({
            "supplier_id": sup,
            "order_qty": float(np.random.randint(10, 200)),
            "order_date": order_date.isoformat(),
            "delivery_date": delivery_date.isoformat(),
            "category": cat,
            "price": float(np.random.uniform(10, 500))
        })
    return orders
