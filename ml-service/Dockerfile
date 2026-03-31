FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 libgcc-s1 && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Core deps (no torch)
RUN pip install --no-cache-dir -r requirements.txt

# CPU-only torch (needed by stable-baselines3 + neuralprophet) — ~800MB vs 2GB GPU
RUN pip install --no-cache-dir \
    torch==2.2.0+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# Optional heavy deps — install after slim torch
RUN pip install --no-cache-dir stable-baselines3==2.2.1 || echo "stable-baselines3 skipped"
RUN pip install --no-cache-dir neuralprophet==0.8.0 || echo "neuralprophet skipped"
RUN pip install --no-cache-dir pyarrow==15.0.0 || echo "pyarrow skipped"

COPY . .
RUN mkdir -p models && chmod +x startup.sh
EXPOSE 5001
CMD ["./startup.sh"]
