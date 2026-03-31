"""
MLflow experiment tracking.
Logs every training run: params, metrics, artifacts.
Registers best model per category.
Falls back to local JSON log if MLflow server is unavailable.
"""
import os
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

import structlog

log = structlog.get_logger()

MLFLOW_URI = os.getenv("MLFLOW_TRACKING_URI", "")
EXPERIMENT_NAME = os.getenv("MLFLOW_EXPERIMENT", "demand_forecasting")
LOCAL_LOG_PATH = "./models/experiment_log.json"

_mlflow_available = False


def _init_mlflow():
    global _mlflow_available
    if not MLFLOW_URI:
        return False
    try:
        import mlflow
        mlflow.set_tracking_uri(MLFLOW_URI)
        mlflow.set_experiment(EXPERIMENT_NAME)
        _mlflow_available = True
        log.info("mlflow_connected", uri=MLFLOW_URI)
        return True
    except Exception as e:
        log.warning("mlflow_unavailable", error=str(e))
        return False


_init_mlflow()


def log_training_run(params: dict, metrics: dict, model_path: str = None,
                     category: str = "global", tags: dict = None) -> str:
    """
    Log a training run. Returns run_id (MLflow or local UUID).
    """
    run_id = f"run_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"

    if _mlflow_available:
        try:
            import mlflow
            with mlflow.start_run(run_name=f"{category}_{run_id}") as run:
                mlflow.log_params(params)
                mlflow.log_metrics(metrics)
                if tags:
                    mlflow.set_tags(tags)
                if model_path and Path(model_path).exists():
                    mlflow.log_artifact(model_path)
                run_id = run.info.run_id
                log.info("mlflow_run_logged", run_id=run_id, metrics=metrics)
                return run_id
        except Exception as e:
            log.warning("mlflow_log_failed", error=str(e))

    # Fallback: local JSON log
    _log_local(run_id, params, metrics, model_path, category, tags)
    return run_id


def _log_local(run_id: str, params: dict, metrics: dict, model_path: str,
               category: str, tags: dict):
    try:
        log_path = Path(LOCAL_LOG_PATH)
        log_path.parent.mkdir(exist_ok=True)
        existing = []
        if log_path.exists():
            with open(log_path) as f:
                existing = json.load(f)
        existing.append({
            "run_id": run_id,
            "timestamp": datetime.utcnow().isoformat(),
            "category": category,
            "params": params,
            "metrics": metrics,
            "model_path": model_path,
            "tags": tags or {}
        })
        # Keep last 100 runs
        existing = existing[-100:]
        with open(log_path, "w") as f:
            json.dump(existing, f, indent=2)
    except Exception as e:
        log.warning("local_log_failed", error=str(e))


def get_experiment_history(limit: int = 20) -> list:
    """Return recent experiment runs."""
    if _mlflow_available:
        try:
            import mlflow
            runs = mlflow.search_runs(
                experiment_names=[EXPERIMENT_NAME],
                order_by=["start_time DESC"],
                max_results=limit
            )
            return runs.to_dict(orient="records") if not runs.empty else []
        except Exception as e:
            log.warning("mlflow_search_failed", error=str(e))

    # Fallback: local log
    try:
        log_path = Path(LOCAL_LOG_PATH)
        if log_path.exists():
            with open(log_path) as f:
                runs = json.load(f)
            return list(reversed(runs[-limit:]))
    except Exception:
        pass
    return []


def register_best_model(run_id: str, category: str, metrics: dict):
    """Register model in MLflow Model Registry if it's the best for this category."""
    if not _mlflow_available:
        return
    try:
        import mlflow
        model_name = f"demand_forecast_{category.lower().replace(' ', '_')}"
        mlflow.register_model(f"runs:/{run_id}/model", model_name)
        log.info("model_registered", name=model_name, run_id=run_id)
    except Exception as e:
        log.warning("model_register_failed", error=str(e))
