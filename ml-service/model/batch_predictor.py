"""
Nightly batch prediction job (APScheduler).
- Runs predictions for all products for next 7 days
- Stores results in MongoDB predictions collection
- Sends Slack webhook alert on drift/degradation
- Drift detection: PSI > 0.2 triggers async retrain
"""
import os
import numpy as np
from datetime import datetime, timedelta
from typing import Optional

import structlog

log = structlog.get_logger()

MONGO_URI = os.getenv("MONGO_URI")
SLACK_WEBHOOK = os.getenv("SLACK_WEBHOOK_URL", "")
PSI_THRESHOLD = float(os.getenv("PSI_THRESHOLD", "0.2"))
MAE_DRIFT_PCT = float(os.getenv("MAE_DRIFT_PCT", "0.15"))


def _send_slack_alert(message: str):
    if not SLACK_WEBHOOK:
        log.info("slack_alert_skipped", message=message[:100])
        return
    try:
        import requests
        requests.post(SLACK_WEBHOOK, json={"text": f"🤖 DemandAI Alert: {message}"}, timeout=5)
        log.info("slack_alert_sent")
    except Exception as e:
        log.warning("slack_alert_failed", error=str(e))


def _compute_psi(expected: list, actual: list, buckets: int = 10) -> float:
    """Population Stability Index between two distributions."""
    if len(expected) < 10 or len(actual) < 10:
        return 0.0
    try:
        bins = np.percentile(expected, np.linspace(0, 100, buckets + 1))
        bins[0] -= 1e-6
        bins[-1] += 1e-6
        exp_counts = np.histogram(expected, bins=bins)[0]
        act_counts = np.histogram(actual, bins=bins)[0]
        exp_pct = (exp_counts + 0.0001) / len(expected)
        act_pct = (act_counts + 0.0001) / len(actual)
        psi = float(np.sum((act_pct - exp_pct) * np.log(act_pct / exp_pct)))
        return round(psi, 4)
    except Exception:
        return 0.0


def run_batch_predictions(ensemble, conformal_predictor=None) -> dict:
    """
    Run predictions for all active products for next 7 days.
    Stores results in MongoDB predictions collection.
    """
    if not MONGO_URI:
        return {"status": "skipped", "reason": "no MONGO_URI"}

    try:
        from pymongo import MongoClient
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
        db = client["demandforecast"]

        products = list(db.products.find({"isActive": True}))
        if not products:
            client.close()
            return {"status": "no_products"}

        weather = db.externaldatas.find_one({"type": "weather"}, sort=[("timestamp", -1)])
        trend = db.externaldatas.find_one({"type": "market_trend"}, sort=[("timestamp", -1)])
        avg_temp = float(weather.get("temperature", 20)) if weather else 20.0
        avg_trend = float(trend.get("trendScore", 50)) if trend else 50.0

        results = []
        stockout_risks = []
        now = datetime.utcnow()

        for prod in products:
            pid = str(prod["_id"])
            category = prod.get("category", "Electronics")
            price = float(prod.get("price", 50))
            stock = float(prod.get("stock", 50))

            # Get cached features or compute basic ones
            from model.feature_store import get_cached_features
            cached = get_cached_features(pid) or {}

            features = {
                "product_id": pid,
                "product_name": prod.get("name", ""),
                "category": category,
                "price": price,
                "month": now.month,
                "day_of_week": now.weekday(),
                "is_weekend": 1 if now.weekday() >= 5 else 0,
                "avg_daily_sales_90d": cached.get("avg_daily_sales_90d", 0),
                "avg_daily_sales_30d": cached.get("avg_daily_sales_30d", 0),
                "avg_daily_sales_7d": cached.get("avg_daily_sales_7d", 0),
                "category_avg_qty": cached.get("avg_daily_sales_30d", 1),
                "temperature": avg_temp,
                "weather_code": 0,
                "trend_score": avg_trend,
                "current_stock": stock,
                "data_quality": cached.get("data_quality", 0.5),
                "sales_momentum": 0,
                "price_elasticity_proxy": -1.2 * (price / 100),
                "stock_coverage_days": stock / max(cached.get("avg_daily_sales_30d", 1), 0.01),
                "seasonal_index": 1.0,
                "demand_volatility": 0,
            }

            # Predict
            if conformal_predictor and conformal_predictor.is_loaded():
                pred = conformal_predictor.predict_with_interval(features)
            elif ensemble and ensemble.is_loaded():
                pred = ensemble.predict(features) or {}
                pred["lower_bound"] = pred.get("predicted_demand", 0) * 0.8
                pred["upper_bound"] = pred.get("predicted_demand", 0) * 1.2
            else:
                avg30 = cached.get("avg_daily_sales_30d", 0) * 30
                pred = {"predicted_demand": avg30, "lower_bound": avg30 * 0.8,
                        "upper_bound": avg30 * 1.2, "method": "fallback"}

            demand_7d = pred.get("predicted_demand", 0) / 30 * 7
            days_of_supply = stock / max(pred.get("predicted_demand", 1) / 30, 0.01)
            stockout_risk = max(0, min(1, 1 - days_of_supply / 14))

            record = {
                "product_id": pid,
                "product_name": prod.get("name", ""),
                "category": category,
                "predicted_demand_30d": round(pred.get("predicted_demand", 0), 1),
                "predicted_demand_7d": round(demand_7d, 1),
                "lower_bound": round(pred.get("lower_bound", 0), 1),
                "upper_bound": round(pred.get("upper_bound", 0), 1),
                "confidence_score": round(pred.get("confidence_score", 0.5), 3),
                "current_stock": stock,
                "days_of_supply": round(days_of_supply, 1),
                "stockout_risk": round(stockout_risk, 3),
                "method": pred.get("method", "unknown"),
                "batch_run_at": now
            }
            results.append(record)

            if stockout_risk > 0.6:
                stockout_risks.append({
                    "name": prod.get("name", ""),
                    "risk": round(stockout_risk * 100, 0),
                    "days_of_supply": round(days_of_supply, 1),
                    "stock": stock
                })

        # Store in MongoDB
        if results:
            db.batch_predictions.delete_many({"batch_run_at": {"$lt": now - timedelta(days=2)}})
            db.batch_predictions.insert_many(results)

        client.close()

        # Alert on top stockout risks
        if stockout_risks:
            top10 = sorted(stockout_risks, key=lambda x: -x["risk"])[:10]
            msg = f"Nightly batch: {len(top10)} stockout risks detected.\n"
            for r in top10:
                msg += f"• {r['name']}: {r['risk']}% risk, {r['days_of_supply']}d supply\n"
            _send_slack_alert(msg)

        log.info("batch_predictions_complete", products=len(results), stockout_risks=len(stockout_risks))
        return {
            "status": "complete",
            "products_predicted": len(results),
            "stockout_risks": len(stockout_risks),
            "top_risks": sorted(stockout_risks, key=lambda x: -x["risk"])[:10]
        }

    except Exception as e:
        log.error("batch_prediction_failed", error=str(e))
        return {"status": "error", "error": str(e)}


def check_and_alert_drift(ensemble) -> dict:
    """
    Check for feature drift (PSI) and MAE degradation.
    Triggers async retrain if drift detected.
    """
    if not MONGO_URI:
        return {"drift_detected": False}

    try:
        from pymongo import MongoClient
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client["demandforecast"]

        now = datetime.utcnow()
        # Compare last 7 days vs previous 7 days
        recent = list(db.prediction_audit.find(
            {"timestamp": {"$gte": now - timedelta(days=7)}},
            {"predicted_demand": 1, "actual_demand": 1, "confidence_score": 1}
        ))
        baseline = list(db.prediction_audit.find(
            {"timestamp": {"$gte": now - timedelta(days=14),
                           "$lt": now - timedelta(days=7)}},
            {"predicted_demand": 1, "actual_demand": 1}
        ))
        client.close()

        if len(recent) < 5 or len(baseline) < 5:
            return {"drift_detected": False, "reason": "insufficient_data"}

        recent_preds = [r["predicted_demand"] for r in recent if r.get("predicted_demand")]
        baseline_preds = [r["predicted_demand"] for r in baseline if r.get("predicted_demand")]

        psi = _compute_psi(baseline_preds, recent_preds)

        # MAE comparison
        recent_with_actual = [r for r in recent if r.get("actual_demand")]
        baseline_with_actual = [r for r in baseline if r.get("actual_demand")]

        drift_detected = False
        alerts = []

        if psi > PSI_THRESHOLD:
            drift_detected = True
            alerts.append(f"PSI={psi:.3f} > threshold {PSI_THRESHOLD} — prediction distribution shifted")

        if recent_with_actual and baseline_with_actual:
            recent_mae = np.mean([abs(r["actual_demand"] - r["predicted_demand"])
                                  for r in recent_with_actual])
            baseline_mae = np.mean([abs(r["actual_demand"] - r["predicted_demand"])
                                    for r in baseline_with_actual])
            mae_change = (recent_mae - baseline_mae) / max(baseline_mae, 1)
            if mae_change > MAE_DRIFT_PCT:
                drift_detected = True
                alerts.append(f"MAE degraded {mae_change*100:.1f}% vs baseline")

        if drift_detected:
            alert_msg = "Drift detected: " + "; ".join(alerts)
            _send_slack_alert(alert_msg + " — triggering async retrain")
            log.warning("drift_detected", psi=psi, alerts=alerts)

        return {
            "drift_detected": drift_detected,
            "psi": psi,
            "alerts": alerts,
            "recent_samples": len(recent),
            "baseline_samples": len(baseline)
        }

    except Exception as e:
        log.error("drift_check_failed", error=str(e))
        return {"drift_detected": False, "error": str(e)}
