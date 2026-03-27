FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p models && chmod +x startup.sh
EXPOSE 5001
CMD ["./startup.sh"]
