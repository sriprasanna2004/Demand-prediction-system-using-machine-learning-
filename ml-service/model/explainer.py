"""
SHAP-based explainability for demand predictions.
Returns feature contributions and human-readable explanations.
"""
import numpy as np

FEATURE_LABELS = {
    "price": "Product Price",
    "month": "Month / Seasonality",
    "day_of_week": "Day of Week",
    "is_weekend": "Weekend Effect",
    "avg_daily_sales_90d": "90-Day Sales Trend",
    "avg_daily_sales_30d": "30-Day Sales Trend",
    "avg_daily_sales_7d": "7-Day Sales Trend",
    "category_avg_qty": "Category Baseline",
    "temperature": "Temperature",
    "weather_code": "Weather Condition",
    "trend_score": "Market Trend",
    "current_stock": "Current Stock Level",
    "data_quality": "Data Quality",
    "category_code": "Product Category"
}

def explain_prediction(model, features: dict, predicted: float) -> dict:
    """
    Generate feature importance explanation without SHAP dependency.
    Uses permutation-based approximation for interpretability.
    """
    import pandas as pd

    FEATURE_COLS = [
        "price", "month", "day_of_week", "is_weekend",
        "avg_daily_sales_90d", "avg_daily_sales_30d", "avg_daily_sales_7d",
        "category_avg_qty", "temperature", "weather_code",
        "trend_score", "current_stock", "data_quality", "category_code"
    ]

    if model is None:
        return _rule_based_explanation(features, predicted)

    try:
        row = {col: features.get(col, 0) for col in FEATURE_COLS}
        base_df = pd.DataFrame([row]).fillna(0)
        base_pred = float(model.predict(base_df)[0])

        contributions = []
        for feat in FEATURE_COLS:
            perturbed = row.copy()
            perturbed[feat] = 0
            p_df = pd.DataFrame([perturbed]).fillna(0)
            p_pred = float(model.predict(p_df)[0])
            impact = base_pred - p_pred
            contributions.append({
                "feature": feat,
                "label": FEATURE_LABELS.get(feat, feat),
                "value": round(float(row[feat]), 3),
                "impact": round(impact, 2),
                "direction": "positive" if impact > 0 else "negative"
            })

        contributions.sort(key=lambda x: abs(x["impact"]), reverse=True)
        top = contributions[:5]
        explanation = _build_narrative(features, top, predicted)

        return {"contributions": top, "explanation": explanation,
                "method": "permutation_importance", "base_prediction": round(base_pred, 1)}

    except Exception as e:
        return _rule_based_explanation(features, predicted)


def _rule_based_explanation(features: dict, predicted: float) -> dict:
    """Fallback rule-based explanation when model unavailable."""
    reasons = []
    dq = features.get("data_quality", 0)
    avg7 = features.get("avg_daily_sales_7d", 0)
    trend = features.get("trend_score", 50)
    temp = features.get("temperature", 20)
    is_weekend = features.get("is_weekend", 0)
    month = features.get("month", 6)

    if avg7 > 0:
        reasons.append({"label": "7-Day Sales Trend", "impact": round(avg7 * 7, 1),
                        "direction": "positive", "value": round(avg7, 3)})
    if trend > 55:
        reasons.append({"label": "Market Trend", "impact": round((trend - 50) * 0.5, 1),
                        "direction": "positive", "value": trend})
    if is_weekend:
        reasons.append({"label": "Weekend Effect", "impact": 2.5,
                        "direction": "positive", "value": 1})
    if month in [11, 12]:
        reasons.append({"label": "Month / Seasonality", "impact": 5.0,
                        "direction": "positive", "value": month})
    if temp < 10:
        reasons.append({"label": "Temperature", "impact": 1.5,
                        "direction": "positive", "value": temp})

    explanation = _build_narrative(features, reasons, predicted)
    return {"contributions": reasons, "explanation": explanation,
            "method": "rule_based", "base_prediction": round(predicted, 1)}


def _build_narrative(features: dict, top_factors: list, predicted: float) -> list:
    """Build human-readable explanation sentences."""
    sentences = [f"Predicted demand is {round(predicted, 1)} units this month."]

    for f in top_factors[:3]:
        if f["direction"] == "positive" and abs(f["impact"]) > 0.5:
            sentences.append(f"{f['label']} is boosting demand by ~{abs(f['impact']):.1f} units.")
        elif f["direction"] == "negative" and abs(f["impact"]) > 0.5:
            sentences.append(f"{f['label']} is reducing demand by ~{abs(f['impact']):.1f} units.")

    dq = features.get("data_quality", 0)
    if dq < 0.3:
        sentences.append("Low historical data — prediction uses category baseline.")
    elif dq > 0.7:
        sentences.append("High data quality — prediction is based on strong historical evidence.")

    return sentences
