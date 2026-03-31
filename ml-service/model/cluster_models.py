"""
Per-cluster demand models.
1. K-means clusters products by demand pattern (3-5 clusters)
2. Trains a fine-tuned XGBoost model per cluster
3. Routes predictions to the right cluster model
Falls back to global ensemble if cluster model unavailable.
"""
import os
import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from typing import Optional

import structlog

log = structlog.get_logger()

CLUSTER_PATH = os.getenv("CLUSTER_PATH", "./models/cluster_models.joblib")
N_CLUSTERS = int(os.getenv("N_CLUSTERS", "4"))

FEATURE_COLS = [
    "price", "month", "day_of_week", "is_weekend",
    "avg_daily_sales_90d", "avg_daily_sales_30d", "avg_daily_sales_7d",
    "category_avg_qty", "temperature", "weather_code",
    "trend_score", "current_stock", "data_quality", "category_code",
    "sales_momentum", "price_elasticity_proxy", "stock_coverage_days",
    "seasonal_index", "demand_volatility"
]


class ClusterRouter:
    def __init__(self):
        self.kmeans = None
        self.cluster_models = {}
        self.scaler = None
        self._load()

    def _load(self):
        path = Path(CLUSTER_PATH)
        if path.exists():
            try:
                data = joblib.load(path)
                self.kmeans = data["kmeans"]
                self.cluster_models = data["cluster_models"]
                self.scaler = data["scaler"]
                log.info("cluster_models_loaded", n_clusters=len(self.cluster_models))
            except Exception as e:
                log.warning("cluster_load_failed", error=str(e))

    def reload(self):
        self._load()

    def is_loaded(self) -> bool:
        return self.kmeans is not None and len(self.cluster_models) > 0

    def predict(self, features: dict) -> Optional[dict]:
        if not self.is_loaded():
            return None
        try:
            row = {col: features.get(col, 0) for col in FEATURE_COLS}
            X = pd.DataFrame([row])[FEATURE_COLS].fillna(0).values
            X_sc = self.scaler.transform(X)
            cluster_id = int(self.kmeans.predict(X_sc)[0])
            model = self.cluster_models.get(cluster_id)
            if model is None:
                return None
            pred = float(max(0, model.predict(X_sc)[0]))
            return {
                "predicted_demand": round(pred, 1),
                "cluster_id": cluster_id,
                "method": f"cluster_{cluster_id}_xgboost"
            }
        except Exception as e:
            log.warning("cluster_predict_failed", error=str(e))
            return None


def train_cluster_models(df: pd.DataFrame) -> dict:
    """
    Train K-means + per-cluster XGBoost models.
    df must have FEATURE_COLS + 'target' column.
    """
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import mean_absolute_error, r2_score
    from xgboost import XGBRegressor

    X = df[FEATURE_COLS].fillna(0)
    y = df["target"].clip(lower=0)

    scaler = StandardScaler()
    X_sc = scaler.fit_transform(X)

    # Cluster on demand-pattern features only
    pattern_cols = ["avg_daily_sales_90d", "avg_daily_sales_30d", "avg_daily_sales_7d",
                    "seasonal_index", "demand_volatility"]
    pattern_idx = [FEATURE_COLS.index(c) for c in pattern_cols if c in FEATURE_COLS]
    X_pattern = X_sc[:, pattern_idx]

    n = min(N_CLUSTERS, max(2, len(df) // 50))
    kmeans = KMeans(n_clusters=n, random_state=42, n_init=10)
    cluster_labels = kmeans.fit_predict(X_pattern)

    cluster_models = {}
    cluster_metrics = {}

    for cid in range(n):
        mask = cluster_labels == cid
        if mask.sum() < 10:
            log.warning("cluster_too_small", cluster=cid, size=int(mask.sum()))
            continue

        X_c = X_sc[mask]
        y_c = y.values[mask]

        model = XGBRegressor(
            n_estimators=200, max_depth=6, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.8, random_state=42,
            tree_method="hist"
        )
        model.fit(X_c, y_c)
        y_pred = model.predict(X_c)
        mae = float(mean_absolute_error(y_c, y_pred))
        r2 = float(r2_score(y_c, y_pred))
        cluster_models[cid] = model
        cluster_metrics[cid] = {"mae": round(mae, 2), "r2": round(r2, 4), "size": int(mask.sum())}
        log.info("cluster_trained", cluster=cid, mae=mae, r2=r2, size=int(mask.sum()))

    Path("./models").mkdir(exist_ok=True)
    joblib.dump({"kmeans": kmeans, "cluster_models": cluster_models, "scaler": scaler}, CLUSTER_PATH)
    return {"n_clusters": n, "cluster_metrics": cluster_metrics}
