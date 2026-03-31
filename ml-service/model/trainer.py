import os
import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from pymongo import MongoClient
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.impute import SimpleImputer
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
MODEL_PATH = os.getenv("MODEL_PATH", "./models/demand_model.joblib")

FEATURE_COLS = [
    "price", "month", "day_of_week", "is_weekend",
    "avg_daily_sales_90d", "avg_daily_sales_30d", "avg_daily_sales_7d",
    "category_avg_qty", "temperature", "weather_code",
    "trend_score", "current_stock", "data_quality", "category_code"
]

CATEGORY_ENCODING = {
    "Electronics": 0, "Clothing": 1, "Food": 2,
    "Furniture": 3, "Books": 4, "Toys": 5
}


def load_training_data():
    """Pull sales + product + external data from MongoDB and build feature matrix."""
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
        db = client["demandforecast"]

        sales = list(db.sales.find({}, {"_id": 0, "productId": 1, "quantity": 1, "timestamp": 1}))
        products = {str(p["_id"]): p for p in db.products.find()}
        weather_docs = list(db.externaldatas.find({"type": "weather"}).sort("timestamp", -1).limit(100))
        trend_docs = list(db.externaldatas.find({"type": "market_trend"}).sort("timestamp", -1).limit(100))
        client.close()

        avg_temp = np.mean([w.get("temperature", 20) for w in weather_docs]) if weather_docs else 20
        avg_trend = np.mean([t.get("trendScore", 50) for t in trend_docs]) if trend_docs else 50

        df_sales = pd.DataFrame(sales)
        if df_sales.empty:
            return _generate_synthetic_data()

        df_sales["timestamp"] = pd.to_datetime(df_sales["timestamp"])
        df_sales["month"] = df_sales["timestamp"].dt.month
        df_sales["day_of_week"] = df_sales["timestamp"].dt.dayofweek
        df_sales["is_weekend"] = df_sales["day_of_week"].isin([5, 6]).astype(int)
        df_sales["productId"] = df_sales["productId"].astype(str)

        rows = []
        for pid, group in df_sales.groupby("productId"):
            prod = products.get(pid)
            if not prod:
                continue

            cat_code = CATEGORY_ENCODING.get(prod.get("category", ""), -1)
            monthly_qty = group.groupby("month")["quantity"].sum()

            for month, qty in monthly_qty.items():
                rows.append({
                    "price": prod.get("price", 10),
                    "month": month,
                    "day_of_week": 3,
                    "is_weekend": 0,
                    "avg_daily_sales_90d": qty / 90,
                    "avg_daily_sales_30d": qty / 30,
                    "avg_daily_sales_7d": qty / 7,
                    "category_avg_qty": qty / len(group),
                    "temperature": avg_temp,
                    "weather_code": 0,
                    "trend_score": avg_trend,
                    "current_stock": prod.get("stock", 50),
                    "data_quality": min(1.0, len(group) / 30),
                    "category_code": cat_code,
                    "target": qty
                })

        if not rows:
            return _generate_synthetic_data()

        return pd.DataFrame(rows)

    except Exception as e:
        print(f"MongoDB unavailable ({e}), using synthetic data.")
        return _generate_synthetic_data()


def _generate_synthetic_data(n=2000):
    """Generate realistic synthetic training data for cold start."""
    np.random.seed(42)
    categories = [0, 1, 2, 3, 4, 5]
    base_demand = {0: 15, 1: 40, 2: 120, 3: 5, 4: 25, 5: 20}

    rows = []
    for _ in range(n):
        cat = np.random.choice(categories)
        month = np.random.randint(1, 13)
        price = np.random.uniform(5, 500)
        temp = np.random.uniform(-5, 40)
        trend = np.random.uniform(20, 80)
        dq = np.random.uniform(0.1, 1.0)

        # Seasonal multiplier
        seasonal = 1 + 0.3 * np.sin((month - 3) * np.pi / 6)
        # Price elasticity
        price_effect = max(0.3, 1 - price / 1000)
        # Weather effect (cold → more indoor shopping)
        weather_effect = 1 + max(0, (20 - temp) / 100)
        # Trend effect
        trend_effect = 1 + (trend - 50) / 200

        base = base_demand[cat]
        target = base * seasonal * price_effect * weather_effect * trend_effect
        target = max(1, target + np.random.normal(0, base * 0.1))

        rows.append({
            "price": price,
            "month": month,
            "day_of_week": np.random.randint(0, 7),
            "is_weekend": np.random.randint(0, 2),
            "avg_daily_sales_90d": target / 90,
            "avg_daily_sales_30d": target / 30,
            "avg_daily_sales_7d": target / 7,
            "category_avg_qty": base / 30,
            "temperature": temp,
            "weather_code": np.random.randint(0, 5),
            "trend_score": trend,
            "current_stock": np.random.randint(0, 200),
            "data_quality": dq,
            "category_code": cat,
            "target": target
        })

    return pd.DataFrame(rows)


def train_model():
    """Train Random Forest on available data and persist model."""
    print("Loading training data...")
    df = load_training_data()
    print(f"Training on {len(df)} samples")

    X = df[FEATURE_COLS].fillna(0)
    y = df["target"].clip(lower=0)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("model", RandomForestRegressor(
            n_estimators=200,
            max_depth=12,
            min_samples_leaf=3,
            n_jobs=-1,
            random_state=42
        ))
    ])

    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)

    print(f"MAE: {mae:.2f} | R²: {r2:.4f}")

    Path("./models").mkdir(exist_ok=True)
    joblib.dump(pipeline, MODEL_PATH)
    print(f"Model saved to {MODEL_PATH}")

    return {"mae": round(mae, 2), "r2": round(r2, 4), "samples": len(df)}


if __name__ == "__main__":
    train_model()
