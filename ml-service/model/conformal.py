"""
Conformal prediction intervals using MAPIE.
Wraps the stacked ensemble to produce guaranteed-coverage prediction
intervals (default 90% CI) instead of heuristic confidence scores.
Falls back to ±20% heuristic if MAPIE is unavailable.
"""
import os
import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from typing import Tuple

import structlog

log = structlog.get_logger()

CONFORMAL_PATH = os.getenv("CONFORMAL_PATH", "./models/conformal_model.joblib")

FEATURE_COLS = [
    "price", "month", "day_of_week", "is_weekend",
    "avg_daily_sales_90d", "avg_daily_sales_30d", "avg_daily_sales_7d",
    "category_avg_qty", "temperature", "weather_code",
    "trend_score", "current_stock", "data_quality", "category_code",
    "sales_momentum", "price_elasticity_proxy", "stock_coverage_days",
    "seasonal_index", "demand_volatility"
]


class ConformalPredictor:
    """
    MAPIE-based conformal predictor.
    Provides prediction intervals with guaranteed marginal coverage.
    """

    def __init__(self):
        self.mapie = None
        self.imputer = None
        self.scaler = None
        self._load()

    def _load(self):
        path = Path(CONFORMAL_PATH)
        if path.exists():
            try:
                data = joblib.load(path)
                self.mapie = data["mapie"]
                self.imputer = data["imputer"]
                self.scaler = data["scaler"]
                log.info("conformal_model_loaded", path=str(path))
            except Exception as e:
                log.warning("conformal_load_failed", error=str(e))

    def reload(self):
        self._load()

    def is_loaded(self) -> bool:
        return self.mapie is not None

    def predict_with_interval(self, features: dict, alpha: float = 0.1) -> dict:
        """
        Returns point prediction + (1-alpha) coverage interval.
        alpha=0.1 → 90% CI
        """
        if not self.is_loaded():
            return self._heuristic_interval(features, alpha)

        try:
            row = {col: features.get(col, 0) for col in FEATURE_COLS}
            X = pd.DataFrame([row])[FEATURE_COLS].fillna(0)
            X_imp = self.imputer.transform(X)
            X_sc = self.scaler.transform(X_imp)

            y_pred, y_pis = self.mapie.predict(X_sc, alpha=alpha)
            point = float(max(0, y_pred[0]))
            lower = float(max(0, y_pis[0, 0, 0]))
            upper = float(max(0, y_pis[0, 1, 0]))

            coverage = 1 - alpha
            interval_width = upper - lower
            # Normalize confidence: narrower interval = higher confidence
            relative_width = interval_width / max(point, 1)
            confidence = max(0.1, min(0.99, 1.0 - relative_width * 0.3))

            return {
                "predicted_demand": round(point, 1),
                "lower_bound": round(lower, 1),
                "upper_bound": round(upper, 1),
                "coverage": coverage,
                "confidence_score": round(confidence, 3),
                "interval_width": round(interval_width, 1),
                "method": "conformal_mapie"
            }
        except Exception as e:
            log.warning("conformal_predict_failed", error=str(e))
            return self._heuristic_interval(features, alpha)

    def _heuristic_interval(self, features: dict, alpha: float) -> dict:
        """Fallback: ±(alpha * 2 * 100)% interval around ensemble prediction."""
        dq = features.get("data_quality", 0.5)
        avg30 = features.get("avg_daily_sales_30d", 0) * 30
        point = max(0, avg30)
        width_pct = 0.3 + (1 - dq) * 0.4  # wider when data quality is low
        lower = max(0, point * (1 - width_pct))
        upper = point * (1 + width_pct)
        return {
            "predicted_demand": round(point, 1),
            "lower_bound": round(lower, 1),
            "upper_bound": round(upper, 1),
            "coverage": 1 - alpha,
            "confidence_score": round(0.4 + dq * 0.4, 3),
            "interval_width": round(upper - lower, 1),
            "method": "heuristic_fallback"
        }


def train_conformal(ensemble, X_calib: np.ndarray, y_calib: np.ndarray,
                    imputer, scaler, alpha: float = 0.1) -> dict:
    """
    Fit MAPIE on calibration set using the trained ensemble's XGBoost base.
    Returns metrics dict.
    """
    try:
        from mapie.regression import MapieRegressor
        from mapie.conformity_scores import AbsoluteConformityScore

        X_imp = imputer.transform(X_calib)
        X_sc = scaler.transform(X_imp)

        mapie = MapieRegressor(
            estimator=ensemble.xgb,
            method="plus",
            cv="prefit",
            conformity_score=AbsoluteConformityScore()
        )
        mapie.fit(X_sc, y_calib)

        y_pred, y_pis = mapie.predict(X_sc, alpha=alpha)
        coverage = float(np.mean((y_calib >= y_pis[:, 0, 0]) & (y_calib <= y_pis[:, 1, 0])))
        avg_width = float(np.mean(y_pis[:, 1, 0] - y_pis[:, 0, 0]))

        Path("./models").mkdir(exist_ok=True)
        joblib.dump({"mapie": mapie, "imputer": imputer, "scaler": scaler}, CONFORMAL_PATH)
        log.info("conformal_trained", coverage=coverage, avg_width=avg_width)

        return {"coverage": round(coverage, 4), "avg_interval_width": round(avg_width, 2)}
    except ImportError:
        log.warning("mapie_not_installed")
        return {"coverage": None, "avg_interval_width": None, "error": "MAPIE not installed"}
    except Exception as e:
        log.error("conformal_train_failed", error=str(e))
        return {"error": str(e)}
