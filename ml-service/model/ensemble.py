"""
Stacked Ensemble: XGBoost + LightGBM + Ridge meta-learner.
Upgrades:
- Isolation Forest anomaly filtering before training
- Conformal prediction intervals (MAPIE)
- Per-cluster fine-tuning
- MLflow experiment tracking
- Structured logging
"""
import os
import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from pymongo import MongoClient
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import mean_absolute_error, r2_score, mean_absolute_percentage_error
from sklearn.impute import SimpleImputer
from sklearn.ensemble import IsolationForest
from xgboost import XGBRegressor
from lightgbm import LGBMRegressor
from dotenv import load_dotenv

import structlog

log = structlog.get_logger()
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
ENSEMBLE_PATH = os.getenv("ENSEMBLE_PATH", "./models/ensemble_model.joblib")

FEATURE_COLS = [
    "price", "month", "day_of_week", "is_weekend",
    "avg_daily_sales_90d", "avg_daily_sales_30d", "avg_daily_sales_7d",
    "category_avg_qty", "temperature", "weather_code",
    "trend_score", "current_stock", "data_quality", "category_code",
    "sales_momentum", "price_elasticity_proxy", "stock_coverage_days",
    "seasonal_index", "demand_volatility"
]

CATEGORY_ENCODING = {
    "Electronics": 0, "Clothing": 1, "Food": 2,
    "Furniture": 3, "Books": 4, "Toys": 5
}

SEASONAL_INDEX = {1:0.85, 2:0.80, 3:0.90, 4:0.95, 5:1.00, 6:1.05,
                  7:1.10, 8:1.05, 9:1.00, 10:1.05, 11:1.20, 12:1.40}


class StackedEnsemble:
    def __init__(self):
        self.xgb = None
        self.lgbm = None
        self.meta = None
        self.imputer = SimpleImputer(strategy="median")
        self.scaler = StandardScaler()
        self._load()

    def _load(self):
        path = Path(ENSEMBLE_PATH)
        if path.exists():
            data = joblib.load(path)
            self.xgb  = data["xgb"]
            self.lgbm = data["lgbm"]
            self.meta = data["meta"]
            self.imputer = data["imputer"]
            self.scaler  = data["scaler"]
            self.cat  = data.get("cat")   # CatBoost (optional)
            log.info("ensemble_loaded", path=ENSEMBLE_PATH)
        else:
            log.warning("ensemble_not_found", path=ENSEMBLE_PATH)

    def reload(self):
        self._load()

    def is_loaded(self) -> bool:
        return self.xgb is not None

    def _engineer_features(self, features: dict) -> dict:
        row = {col: features.get(col, 0) for col in FEATURE_COLS}
        cat = features.get("category", "")
        row["category_code"] = CATEGORY_ENCODING.get(cat, -1)
        month = int(features.get("month", 6))
        row["seasonal_index"] = SEASONAL_INDEX.get(month, 1.0)
        avg7  = features.get("avg_daily_sales_7d",  0)
        avg30 = features.get("avg_daily_sales_30d", 0)
        avg90 = features.get("avg_daily_sales_90d", 0)
        row["sales_momentum"]        = (avg7 - avg30) / max(avg30, 0.01)
        row["price_elasticity_proxy"] = -1.2 * (features.get("price", 50) / 100)
        row["stock_coverage_days"]   = features.get("current_stock", 50) / max(avg30, 0.01)
        row["demand_volatility"]     = abs(avg7 - avg90) / max(avg90, 0.01)
        # Extra engineered features
        row["price_x_trend"]         = features.get("price", 50) * features.get("trend_score", 50) / 5000
        row["weekend_x_trend"]       = features.get("is_weekend", 0) * features.get("trend_score", 50) / 100
        row["stock_demand_ratio"]    = features.get("current_stock", 50) / max(avg30 * 30, 1)
        return row

    def predict(self, features: dict) -> dict:
        if not self.is_loaded():
            return None
        try:
            row = self._engineer_features(features)
            X = pd.DataFrame([row])[FEATURE_COLS].fillna(0)
            X_imp = self.imputer.transform(X)
            X_sc  = self.scaler.transform(X_imp)

            p_xgb  = float(self.xgb.predict(X_sc)[0])
            p_lgbm = float(self.lgbm.predict(X_sc)[0])

            if self.cat is not None:
                try:
                    p_cat = float(self.cat.predict(X_sc)[0])
                    meta_X = np.array([[p_xgb, p_lgbm, p_cat]])
                except Exception:
                    meta_X = np.array([[p_xgb, p_lgbm]])
            else:
                meta_X = np.array([[p_xgb, p_lgbm]])

            pred = float(self.meta.predict(meta_X)[0])
            pred = max(0, pred)

            dq = features.get("data_quality", 0.5)
            confidence = min(0.95, 0.5 + dq * 0.4)
            method = "stacked_ensemble_xgb_lgbm_cat" if self.cat else "stacked_ensemble_xgb_lgbm"

            return {
                "predicted_demand": round(pred, 1),
                "confidence_score": round(confidence, 3),
                "method": method
            }
        except Exception as e:
            log.error("ensemble_predict_failed", error=str(e))
            return None


def _load_training_data() -> pd.DataFrame:
    """Pull sales + product + external data from MongoDB."""
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
        db = client["demandforecast"]

        sales = list(db.sales.find({}, {"_id": 0, "productId": 1, "quantity": 1, "timestamp": 1}))
        products = {str(p["_id"]): p for p in db.products.find()}
        weather_docs = list(db.externaldatas.find({"type": "weather"}).sort("timestamp", -1).limit(100))
        trend_docs = list(db.externaldatas.find({"type": "market_trend"}).sort("timestamp", -1).limit(100))

        # Also pull user-uploaded processed rows
        dataset_rows = list(db.datasetrows.find({}, {"_id": 0}).limit(5000))

        avg_temp = float(np.mean([w.get("temperature", 20) for w in weather_docs])) if weather_docs else 20.0
        avg_trend = float(np.mean([t.get("trendScore", 50) for t in trend_docs])) if trend_docs else 50.0

        df_sales = pd.DataFrame(sales)
        rows = []

        if not df_sales.empty:
            df_sales["timestamp"] = pd.to_datetime(df_sales["timestamp"])
            df_sales["month"] = df_sales["timestamp"].dt.month
            df_sales["day_of_week"] = df_sales["timestamp"].dt.dayofweek
            df_sales["is_weekend"] = df_sales["day_of_week"].isin([5, 6]).astype(int)
            df_sales["productId"] = df_sales["productId"].astype(str)

            for pid, group in df_sales.groupby("productId"):
                prod = products.get(pid)
                if not prod:
                    continue
                cat_code = CATEGORY_ENCODING.get(prod.get("category", ""), -1)
                monthly_qty = group.groupby("month")["quantity"].sum()
                for month, qty in monthly_qty.items():
                    seasonal = SEASONAL_INDEX.get(int(month), 1.0)
                    avg30 = qty / 30
                    avg7 = qty / 7
                    avg90 = qty / 90
                    rows.append({
                        "price": prod.get("price", 10),
                        "month": month,
                        "day_of_week": 3,
                        "is_weekend": 0,
                        "avg_daily_sales_90d": avg90,
                        "avg_daily_sales_30d": avg30,
                        "avg_daily_sales_7d": avg7,
                        "category_avg_qty": qty / max(len(group), 1),
                        "temperature": avg_temp,
                        "weather_code": 0,
                        "trend_score": avg_trend,
                        "current_stock": prod.get("stock", 50),
                        "data_quality": min(1.0, len(group) / 30),
                        "category_code": cat_code,
                        "sales_momentum": (avg7 - avg30) / max(avg30, 0.01),
                        "price_elasticity_proxy": -1.2 * (prod.get("price", 50) / 100),
                        "stock_coverage_days": prod.get("stock", 50) / max(avg30, 0.01),
                        "seasonal_index": seasonal,
                        "demand_volatility": abs(avg7 - avg90) / max(avg90, 0.01),
                        "target": qty
                    })

        # Merge uploaded dataset rows
        for r in dataset_rows:
            qty = float(r.get("quantity", 0))
            if qty <= 0:
                continue
            month = int(r.get("month", 6))
            avg30 = qty / 30
            avg7 = qty / 7
            avg90 = qty / 90
            rows.append({
                "price": float(r.get("price", 50)),
                "month": month,
                "day_of_week": int(r.get("day_of_week", 3)),
                "is_weekend": int(r.get("is_weekend", 0)),
                "avg_daily_sales_90d": avg90,
                "avg_daily_sales_30d": avg30,
                "avg_daily_sales_7d": avg7,
                "category_avg_qty": float(r.get("category_avg_qty", avg30)),
                "temperature": float(r.get("temperature", 20)),
                "weather_code": 0,
                "trend_score": float(r.get("trend_score", 50)),
                "current_stock": float(r.get("stock", 50)),
                "data_quality": float(r.get("data_quality", 0.8)),
                "category_code": int(r.get("category_code", -1)),
                "sales_momentum": (avg7 - avg30) / max(avg30, 0.01),
                "price_elasticity_proxy": -1.2 * (float(r.get("price", 50)) / 100),
                "stock_coverage_days": float(r.get("stock", 50)) / max(avg30, 0.01),
                "seasonal_index": SEASONAL_INDEX.get(month, 1.0),
                "demand_volatility": abs(avg7 - avg90) / max(avg90, 0.01),
                "target": qty
            })

        client.close()

        if rows:
            return pd.DataFrame(rows)
    except Exception as e:
        log.error("data_load_failed", error=str(e))

    return _generate_synthetic_data()


def _filter_anomalies(df: pd.DataFrame) -> tuple:
    """
    Run Isolation Forest on sales history to tag anomalous events.
    Returns (clean_df, anomaly_df).
    """
    try:
        X = df[FEATURE_COLS].fillna(0)
        iso = IsolationForest(contamination=0.05, random_state=42, n_jobs=-1)
        labels = iso.fit_predict(X)
        clean = df[labels == 1].copy()
        anomalies = df[labels == -1].copy()
        log.info("anomaly_filter", total=len(df), clean=len(clean), anomalies=len(anomalies))
        return clean, anomalies
    except Exception as e:
        log.warning("anomaly_filter_failed", error=str(e))
        return df, pd.DataFrame()


def _store_anomalies(anomalies: pd.DataFrame):
    """Store anomalous rows in MongoDB for business review."""
    if anomalies.empty or not MONGO_URI:
        return
    try:
        from datetime import datetime
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client["demandforecast"]
        records = anomalies.to_dict(orient="records")
        for r in records:
            r["flagged_at"] = datetime.utcnow()
            r["reason"] = "isolation_forest"
        db.anomaly_events.insert_many(records)
        client.close()
        log.info("anomalies_stored", count=len(records))
    except Exception as e:
        log.warning("anomaly_store_failed", error=str(e))


def train_ensemble() -> dict:
    """
    Full training pipeline:
    1. Load data from MongoDB + uploaded datasets
    2. Filter anomalies with Isolation Forest
    3. Train XGBoost + LightGBM + Ridge meta-learner
    4. Fit conformal predictor on calibration set
    5. Train per-cluster models
    6. Log to MLflow
    """
    from model.conformal import train_conformal
    from model.cluster_models import train_cluster_models
    from model.experiment_tracker import log_training_run

    log.info("ensemble_training_started")
    df = _load_training_data()
    log.info("data_loaded", samples=len(df))

    # Anomaly filtering
    df_clean, df_anomalies = _filter_anomalies(df)
    _store_anomalies(df_anomalies)

    X = df_clean[FEATURE_COLS].fillna(0)
    y = df_clean["target"].clip(lower=0)

    # Time-series split
    tscv = TimeSeriesSplit(n_splits=3)
    splits = list(tscv.split(X))
    train_idx, calib_idx = splits[-2][0], splits[-1][1]

    X_train, y_train = X.iloc[train_idx], y.iloc[train_idx]
    X_calib, y_calib = X.iloc[calib_idx], y.iloc[calib_idx]

    imputer = SimpleImputer(strategy="median")
    scaler = StandardScaler()

    X_train_imp = imputer.fit_transform(X_train)
    X_train_sc = scaler.fit_transform(X_train_imp)
    X_calib_imp = imputer.transform(X_calib)
    X_calib_sc = scaler.transform(X_calib_imp)

    # Base learners
    xgb = XGBRegressor(
        n_estimators=300, max_depth=7, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, min_child_weight=3,
        random_state=42, tree_method="hist", verbosity=0
    )
    lgbm = LGBMRegressor(
        n_estimators=300, max_depth=7, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, min_child_samples=10,
        random_state=42, verbose=-1
    )

    xgb.fit(X_train_sc, y_train)
    lgbm.fit(X_train_sc, y_train)

    # CatBoost as 3rd base learner
    cat = None
    try:
        from catboost import CatBoostRegressor
        cat = CatBoostRegressor(iterations=300, depth=7, learning_rate=0.05,
                                loss_function='RMSE', random_seed=42, verbose=0)
        cat.fit(X_train_sc, y_train)
        log.info("catboost_trained")
    except Exception as e:
        log.warning("catboost_skipped", error=str(e))

    # Meta-learner on calibration set
    p_xgb_calib  = xgb.predict(X_calib_sc)
    p_lgbm_calib = lgbm.predict(X_calib_sc)
    if cat is not None:
        try:
            p_cat_calib = cat.predict(X_calib_sc)
            meta_X = np.column_stack([p_xgb_calib, p_lgbm_calib, p_cat_calib])
        except Exception:
            meta_X = np.column_stack([p_xgb_calib, p_lgbm_calib])
    else:
        meta_X = np.column_stack([p_xgb_calib, p_lgbm_calib])
    meta = Ridge(alpha=1.0)
    meta.fit(meta_X, y_calib)

    # Evaluate
    y_pred = meta.predict(meta_X)
    mae  = float(mean_absolute_error(y_calib, y_pred))
    r2   = float(r2_score(y_calib, y_pred))
    mape = float(mean_absolute_percentage_error(y_calib, np.maximum(y_pred, 0.1))) * 100

    # Save ensemble
    Path("./models").mkdir(exist_ok=True)
    joblib.dump({
        "xgb": xgb, "lgbm": lgbm, "cat": cat, "meta": meta,
        "imputer": imputer, "scaler": scaler
    }, ENSEMBLE_PATH)
    log.info("ensemble_saved", mae=mae, r2=r2, mape=mape)

    # Conformal prediction
    class _EnsembleWrapper:
        def __init__(self, xgb_m): self.xgb = xgb_m
        def is_loaded(self): return True
    conformal_metrics = train_conformal(
        _EnsembleWrapper(xgb), X_calib.values, y_calib.values, imputer, scaler
    )

    # Per-cluster models
    cluster_metrics = {}
    try:
        cluster_metrics = train_cluster_models(df_clean)
    except Exception as e:
        log.warning("cluster_training_failed", error=str(e))

    # MLflow logging
    params = {
        "n_estimators_xgb": 300, "n_estimators_lgbm": 300,
        "max_depth": 7, "learning_rate": 0.05,
        "train_samples": len(X_train), "calib_samples": len(X_calib),
        "anomalies_removed": len(df_anomalies)
    }
    metrics = {"mae": round(mae, 2), "r2": round(r2, 4), "mape": round(mape, 2)}
    run_id = log_training_run(params, metrics, ENSEMBLE_PATH, category="global")

    return {
        "mae": round(mae, 2),
        "r2": round(r2, 4),
        "mape": round(mape, 2),
        "samples": len(df_clean),
        "anomalies_removed": len(df_anomalies),
        "conformal": conformal_metrics,
        "clusters": cluster_metrics,
        "run_id": run_id
    }


def _generate_synthetic_data(n: int = 2000) -> pd.DataFrame:
    np.random.seed(42)
    categories = [0, 1, 2, 3, 4, 5]
    base_demand = {0: 15, 1: 40, 2: 120, 3: 5, 4: 25, 5: 20}
    rows = []
    for _ in range(n):
        cat = np.random.choice(categories)
        month = np.random.randint(1, 13)
        price = np.random.uniform(5, 500)
        temp = np.random.uniform(-5, 40)
        trend = np.random.uniform(20, 80)
        dq = np.random.uniform(0.1, 1.0)
        seasonal = SEASONAL_INDEX.get(month, 1.0)
        price_effect = max(0.3, 1 - price / 1000)
        weather_effect = 1 + max(0, (20 - temp) / 100)
        trend_effect = 1 + (trend - 50) / 200
        base = base_demand[cat]
        target = base * seasonal * price_effect * weather_effect * trend_effect
        target = max(1, target + np.random.normal(0, base * 0.1))
        avg30 = target / 30
        avg7 = target / 7
        avg90 = target / 90
        rows.append({
            "price": price, "month": month,
            "day_of_week": np.random.randint(0, 7),
            "is_weekend": np.random.randint(0, 2),
            "avg_daily_sales_90d": avg90,
            "avg_daily_sales_30d": avg30,
            "avg_daily_sales_7d": avg7,
            "category_avg_qty": base / 30,
            "temperature": temp,
            "weather_code": np.random.randint(0, 5),
            "trend_score": trend,
            "current_stock": np.random.randint(0, 200),
            "data_quality": dq,
            "category_code": cat,
            "sales_momentum": (avg7 - avg30) / max(avg30, 0.01),
            "price_elasticity_proxy": -1.2 * (price / 100),
            "stock_coverage_days": np.random.randint(0, 200) / max(avg30, 0.01),
            "seasonal_index": seasonal,
            "demand_volatility": abs(avg7 - avg90) / max(avg90, 0.01),
            "target": target
        })
    return pd.DataFrame(rows)
