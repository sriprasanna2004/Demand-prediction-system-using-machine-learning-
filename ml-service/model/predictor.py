import os
import joblib
import numpy as np
import pandas as pd
from pathlib import Path

MODEL_PATH = os.getenv("MODEL_PATH", "./models/demand_model.joblib")
FEATURE_COLS = [
    "price", "month", "day_of_week", "is_weekend",
    "avg_daily_sales_90d", "avg_daily_sales_30d", "avg_daily_sales_7d",
    "category_avg_qty", "temperature", "weather_code",
    "trend_score", "current_stock", "data_quality"
]

CATEGORY_ENCODING = {
    "Electronics": 0, "Clothing": 1, "Food": 2,
    "Furniture": 3, "Books": 4, "Toys": 5
}


class DemandPredictor:
    def __init__(self):
        self.model = None
        self._load()

    def _load(self):
        path = Path(MODEL_PATH)
        if path.exists():
            self.model = joblib.load(path)
            print(f"Model loaded from {MODEL_PATH}")
        else:
            print("No trained model found. Will use fallback until /train is called.")

    def reload(self):
        self._load()

    def is_loaded(self) -> bool:
        return self.model is not None

    def predict(self, features: dict) -> dict:
        # Encode category
        cat_code = CATEGORY_ENCODING.get(features.get("category", ""), -1)
        row = {col: features.get(col, 0) for col in FEATURE_COLS}
        row["category_code"] = cat_code

        df = pd.DataFrame([row])

        if self.model is None:
            return self._statistical_fallback(features)

        try:
            cols = FEATURE_COLS + ["category_code"]
            X = df[cols].fillna(0)
            pred = float(self.model.predict(X)[0])
            pred = max(0, pred)

            # Confidence: based on data quality + model type
            confidence = self._estimate_confidence(features, pred)

            return {
                "predicted_demand": round(pred, 1),
                "confidence_score": round(confidence, 3),
                "method": "random_forest"
            }
        except Exception as e:
            print(f"Prediction error: {e}")
            return self._statistical_fallback(features)

    def _estimate_confidence(self, features: dict, pred: float) -> float:
        dq = features.get("data_quality", 0)
        base = 0.5 + dq * 0.4  # 0.5 to 0.9 based on data quality
        # Penalize if prediction is very far from recent average
        avg30 = features.get("avg_daily_sales_30d", 0) * 30
        if avg30 > 0:
            ratio = abs(pred - avg30) / avg30
            penalty = min(0.2, ratio * 0.1)
            base -= penalty
        return max(0.1, min(0.95, base))

    def _statistical_fallback(self, features: dict) -> dict:
        """Pure statistical fallback — no model needed."""
        dq = features.get("data_quality", 0)
        avg7 = features.get("avg_daily_sales_7d", 0)
        avg30 = features.get("avg_daily_sales_30d", 0)
        avg90 = features.get("avg_daily_sales_90d", 0)
        cat_avg = features.get("category_avg_qty", 1)
        trend = features.get("trend_score", 50)

        if dq > 0.5:
            daily = avg7 * 0.5 + avg30 * 0.3 + avg90 * 0.2
            confidence = 0.60
        elif dq > 0.1:
            daily = avg30 * 0.4 + cat_avg * 0.6
            confidence = 0.40
        else:
            daily = cat_avg
            confidence = 0.20

        trend_mult = 1 + (trend - 50) / 500
        predicted = max(0, daily * 30 * trend_mult)

        return {
            "predicted_demand": round(predicted, 1),
            "confidence_score": round(confidence, 3),
            "method": "statistical_fallback"
        }
