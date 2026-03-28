"""
SHAP-based explainability using real TreeExplainer for XGBoost/LightGBM.
Falls back to permutation importance if SHAP unavailable.
"""
import numpy as np
import pandas as pd

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
    "category_code": "Product Category",
    "sales_momentum": "Sales Momentum",
    "price_elasticity_proxy": "Price Elasticity",
    "stock_coverage_days": "Stock Coverage Days",
    "seasonal_index": "Seasonal Index",
    "demand_volatility": "Demand Volatility"
}

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


def explain_prediction(ensemble, features: dict, predicted: float) -> dict:
    if ensemble is None or not ensemble.is_loaded():
        return _rule_based_explanation(features, predicted)

    try:
        import shap
        cat_code = CATEGORY_ENCODING.get(features.get("category", ""), -1)
        row = {col: features.get(col, 0) for col in FEATURE_COLS}
        row["category_code"] = cat_code

        df = pd.DataFrame([row])[FEATURE_COLS].fillna(0)
        X_imp = ensemble.imputer.transform(df)
        X_sc = ensemble.scaler.transform(X_imp)

        # Use SHAP TreeExplainer on XGBoost (fastest + most accurate)
        explainer = shap.TreeExplainer(ensemble.xgb)
        shap_values = explainer.shap_values(X_sc)

        contributions = []
        for i, feat in enumerate(FEATURE_COLS):
            impact = float(shap_values[0][i])
            contributions.append({
                "feature": feat,
                "label": FEATURE_LABELS.get(feat, feat),
                "value": round(float(row[feat]), 3),
                "impact": round(impact, 3),
                "direction": "positive" if impact > 0 else "negative"
            })

        contributions.sort(key=lambda x: abs(x["impact"]), reverse=True)
        top = contributions[:7]
        narrative = _build_narrative(features, top, predicted)

        return {
            "contributions": top,
            "explanation": narrative,
            "method": "shap_tree_explainer",
            "base_value": round(float(explainer.expected_value), 1)
        }

    except Exception as e:
        print(f"SHAP failed ({e}), using permutation importance")
        return _permutation_explain(ensemble, features, predicted)


def _permutation_explain(ensemble, features: dict, predicted: float) -> dict:
    try:
        cat_code = CATEGORY_ENCODING.get(features.get("category", ""), -1)
        row = {col: features.get(col, 0) for col in FEATURE_COLS}
        row["category_code"] = cat_code
        base_df = pd.DataFrame([row])[FEATURE_COLS].fillna(0)
        X_imp = ensemble.imputer.transform(base_df)
        X_sc = ensemble.scaler.transform(X_imp)
        base_pred = float(ensemble.xgb.predict(X_sc)[0])

        contributions = []
        for feat in FEATURE_COLS:
            perturbed = row.copy()
            perturbed[feat] = 0
            p_df = pd.DataFrame([perturbed])[FEATURE_COLS].fillna(0)
            p_imp = ensemble.imputer.transform(p_df)
            p_sc = ensemble.scaler.transform(p_imp)
            p_pred = float(ensemble.xgb.predict(p_sc)[0])
            impact = base_pred - p_pred
            contributions.append({
                "feature": feat,
                "label": FEATURE_LABELS.get(feat, feat),
                "value": round(float(row[feat]), 3),
                "impact": round(impact, 3),
                "direction": "positive" if impact > 0 else "negative"
            })

        contributions.sort(key=lambda x: abs(x["impact"]), reverse=True)
        top = contributions[:7]
        return {
            "contributions": top,
            "explanation": _build_narrative(features, top, predicted),
            "method": "permutation_importance",
            "base_value": round(base_pred, 1)
        }
    except Exception as e:
        return _rule_based_explanation(features, predicted)


def _rule_based_explanation(features: dict, predicted: float) -> dict:
    reasons = []
    avg7 = features.get("avg_daily_sales_7d", 0)
    trend = features.get("trend_score", 50)
    temp = features.get("temperature", 20)
    is_weekend = features.get("is_weekend", 0)
    month = features.get("month", 6)
    momentum = features.get("sales_momentum", 0)

    if avg7 > 0:
        reasons.append({"label": "7-Day Sales Trend", "impact": round(avg7*7, 1), "direction": "positive", "value": round(avg7, 3)})
    if trend > 55:
        reasons.append({"label": "Market Trend", "impact": round((trend-50)*0.5, 1), "direction": "positive", "value": trend})
    elif trend < 45:
        reasons.append({"label": "Market Trend", "impact": round((trend-50)*0.5, 1), "direction": "negative", "value": trend})
    if is_weekend:
        reasons.append({"label": "Weekend Effect", "impact": 2.5, "direction": "positive", "value": 1})
    if month in [11, 12]:
        reasons.append({"label": "Seasonal Index", "impact": 5.0, "direction": "positive", "value": month})
    if momentum > 0.2:
        reasons.append({"label": "Sales Momentum", "impact": round(momentum*10, 1), "direction": "positive", "value": round(momentum, 2)})
    elif momentum < -0.2:
        reasons.append({"label": "Sales Momentum", "impact": round(momentum*10, 1), "direction": "negative", "value": round(momentum, 2)})

    return {
        "contributions": reasons,
        "explanation": _build_narrative(features, reasons, predicted),
        "method": "rule_based",
        "base_value": round(predicted, 1)
    }


def _build_narrative(features: dict, top_factors: list, predicted: float) -> list:
    sentences = [f"Predicted demand is {round(predicted, 1)} units this month."]
    for f in top_factors[:3]:
        if abs(f["impact"]) < 0.3:
            continue
        if f["direction"] == "positive":
            sentences.append(f"{f['label']} is boosting demand by ~{abs(f['impact']):.1f} units.")
        else:
            sentences.append(f"{f['label']} is reducing demand by ~{abs(f['impact']):.1f} units.")
    dq = features.get("data_quality", 0)
    if dq < 0.3:
        sentences.append("Limited historical data — prediction uses category baseline.")
    elif dq > 0.7:
        sentences.append("High data quality — prediction is based on strong historical evidence.")
    return sentences
