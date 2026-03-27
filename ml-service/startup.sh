#!/bin/sh
set -e

MODEL_FILE="./models/demand_model.joblib"

if [ ! -f "$MODEL_FILE" ]; then
  echo "No trained model found. Training now (uses synthetic data if DB is empty)..."
  python model/trainer.py
  echo "Training complete."
else
  echo "Model found at $MODEL_FILE. Skipping training."
fi

echo "Starting ML service..."
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-5001}"
