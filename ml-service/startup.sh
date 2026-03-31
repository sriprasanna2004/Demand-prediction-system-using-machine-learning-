#!/bin/sh
set -e

MODEL_FILE="./models/demand_model.joblib"
LEAD_TIME_FILE="./models/lead_time_model.joblib"

if [ ! -f "$MODEL_FILE" ]; then
  echo "No trained model found. Training now (uses synthetic data if DB is empty)..."
  python model/trainer.py
  echo "Training complete."
else
  echo "Model found at $MODEL_FILE. Skipping RF training."
fi

if [ ! -f "$LEAD_TIME_FILE" ]; then
  echo "Training lead time model..."
  python -c "from model.supply_chain import train_lead_time_model; train_lead_time_model()"
  echo "Lead time model trained."
fi

echo "Starting ML service..."
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-5001}"
