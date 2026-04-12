"""
Generate a 1000-row supply chain sales dataset for DemandAI.
Columns match exactly what the system expects:
  date, product_name, category, quantity, price, stock, temperature, trend_score, day_of_week
Run: python generate_dataset.py
Output: supply_chain_sales.csv
"""
import csv
import random
import math
from datetime import date, timedelta

random.seed(42)

PRODUCTS = [
    ("iPhone 15 Pro",      "Electronics",  999,  80),
    ("Samsung 4K TV",      "Electronics",  799,  40),
    ("MacBook Air",        "Electronics", 1299,  30),
    ("Sony Headphones",    "Electronics",  349,  60),
    ("iPad Pro",           "Electronics",  899,  45),
    ("Nike Air Max",       "Clothing",     120, 150),
    ("Levi's Jeans",       "Clothing",      60, 200),
    ("Adidas Hoodie",      "Clothing",      80, 180),
    ("Zara Jacket",        "Clothing",     110, 120),
    ("H&M T-Shirt",        "Clothing",      25, 300),
    ("Organic Coffee 1kg", "Food",          18, 500),
    ("Protein Bars 12pk",  "Food",          25, 400),
    ("Olive Oil 1L",       "Food",          12, 350),
    ("Green Tea 50pk",     "Food",           8, 600),
    ("Almond Milk 1L",     "Food",           4, 450),
    ("IKEA Desk",          "Furniture",    250,  40),
    ("Office Chair",       "Furniture",    350,  25),
    ("Bookshelf",          "Furniture",    180,  35),
    ("Coffee Table",       "Furniture",    220,  20),
    ("Bed Frame",          "Furniture",    450,  15),
    ("Clean Code",         "Books",         35, 100),
    ("Atomic Habits",      "Books",         18, 150),
    ("The Lean Startup",   "Books",         22, 120),
    ("Deep Work",          "Books",         20, 130),
    ("Python Crash Course","Books",         30,  90),
    ("LEGO Technic Set",   "Toys",          89,  60),
    ("Barbie Dreamhouse",  "Toys",         120,  45),
    ("Hot Wheels 10pk",    "Toys",          15, 200),
    ("Nerf Blaster",       "Toys",          35,  80),
    ("Puzzle 1000pc",      "Toys",          25, 110),
]

SEASONAL = {1:0.85,2:0.80,3:0.90,4:0.95,5:1.00,6:1.05,
            7:1.10,8:1.05,9:1.00,10:1.05,11:1.20,12:1.40}

CAT_BASE = {"Electronics":3,"Clothing":8,"Food":20,"Furniture":1,"Books":5,"Toys":4}

start = date(2023, 1, 1)
rows = []

for i in range(1000):
    d = start + timedelta(days=random.randint(0, 730))
    product, category, price, stock = random.choice(PRODUCTS)
    
    month = d.month
    dow = d.weekday()
    is_weekend = 1 if dow >= 5 else 0
    
    base = CAT_BASE[category]
    seasonal = SEASONAL[month]
    weekend_boost = 1.2 if is_weekend else 1.0
    price_effect = max(0.3, 1 - price / 2000)
    
    temp = round(random.uniform(-5, 38), 1)
    weather_effect = 1 + max(0, (20 - temp) / 150)
    
    trend = round(random.uniform(30, 85), 1)
    trend_effect = 1 + (trend - 50) / 300
    
    qty = max(1, int(base * seasonal * weekend_boost * price_effect * weather_effect * trend_effect
                     + random.gauss(0, base * 0.15)))
    
    # Slight stock variation
    current_stock = max(0, stock + random.randint(-20, 20))
    
    rows.append({
        "date":         d.strftime("%Y-%m-%d"),
        "product_name": product,
        "category":     category,
        "quantity":     qty,
        "price":        price,
        "stock":        current_stock,
        "temperature":  temp,
        "trend_score":  trend,
        "day_of_week":  dow,
    })

# Sort by date
rows.sort(key=lambda r: r["date"])

with open("supply_chain_sales.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)

print(f"Generated {len(rows)} rows -> supply_chain_sales.csv")
print("Columns:", list(rows[0].keys()))
print("\nSample row:", rows[0])
print("\nMapping guide:")
print("  date_or_month  -> date")
print("  quantity       -> quantity")
print("  product_name   -> product_name")
print("  category       -> category")
print("  price          -> price")
print("  stock          -> stock")
print("  temperature    -> temperature")
print("  trend_score    -> trend_score")
print("  day_of_week    -> day_of_week")
