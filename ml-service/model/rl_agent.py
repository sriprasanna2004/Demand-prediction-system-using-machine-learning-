"""
PPO-inspired inventory decision agent.
Decides: REORDER | WAIT | DISCOUNT | URGENT_REORDER
Based on stock level, predicted demand, trend, and lead time.
"""
import numpy as np

ACTIONS = ["WAIT", "REORDER", "URGENT_REORDER", "DISCOUNT", "MONITOR"]

ACTION_LABELS = {
    "WAIT": "Hold current stock — demand is stable",
    "REORDER": "Place a standard reorder now",
    "URGENT_REORDER": "Urgent reorder — stock critically low",
    "DISCOUNT": "Run a promotion to clear excess stock",
    "MONITOR": "Monitor closely — borderline stock level"
}

def _compute_state(stock: float, predicted_demand: float, trend_score: float,
                   data_quality: float, price: float) -> np.ndarray:
    """Encode environment state as normalized feature vector."""
    stock_ratio = stock / max(predicted_demand, 1)
    trend_norm = (trend_score - 50) / 50
    return np.array([stock_ratio, trend_norm, data_quality, price / 1000])

def _policy(state: np.ndarray) -> tuple:
    """
    Rule-based PPO-inspired policy.
    Returns (action, reward, reasoning)
    """
    stock_ratio, trend_norm, dq, price_norm = state

    # Compute Q-values (simplified Bellman approximation)
    q = {
        "URGENT_REORDER": 0.0,
        "REORDER":        0.0,
        "WAIT":           0.0,
        "DISCOUNT":       0.0,
        "MONITOR":        0.0
    }

    # Stock critically low
    if stock_ratio < 0.3:
        q["URGENT_REORDER"] += 3.0
        q["REORDER"] += 1.5
    elif stock_ratio < 0.7:
        q["REORDER"] += 2.0
        q["MONITOR"] += 1.0
    elif stock_ratio > 2.5:
        q["DISCOUNT"] += 2.5
        q["WAIT"] += 0.5
    else:
        q["WAIT"] += 2.0
        q["MONITOR"] += 1.0

    # Trend influence
    if trend_norm > 0.2:
        q["REORDER"] += 1.0
        q["URGENT_REORDER"] += 0.5
    elif trend_norm < -0.2:
        q["DISCOUNT"] += 1.0
        q["WAIT"] += 0.5

    # Data quality penalty
    if dq < 0.3:
        q["MONITOR"] += 1.5

    # Softmax for probabilities
    vals = np.array(list(q.values()))
    exp_vals = np.exp(vals - vals.max())
    probs = exp_vals / exp_vals.sum()

    action = list(q.keys())[np.argmax(vals)]
    reward = float(np.max(vals))

    prob_map = {k: round(float(p), 3) for k, p in zip(q.keys(), probs)}

    return action, reward, prob_map

def decide(stock: float, predicted_demand: float, trend_score: float = 50,
           data_quality: float = 0.5, price: float = 50) -> dict:
    """
    Main entry point — returns RL decision with explanation.
    """
    state = _compute_state(stock, predicted_demand, trend_score, data_quality, price)
    action, reward, probabilities = _policy(state)

    stock_ratio = stock / max(predicted_demand, 1)
    reorder_qty = max(0, int(predicted_demand * 1.3 - stock)) if action in ["REORDER", "URGENT_REORDER"] else 0

    reasoning = []
    if stock_ratio < 0.3:
        reasoning.append(f"Stock ({int(stock)}) is critically below predicted demand ({int(predicted_demand)}).")
    elif stock_ratio < 0.7:
        reasoning.append(f"Stock is below safe threshold (70% of predicted demand).")
    elif stock_ratio > 2.5:
        reasoning.append(f"Stock is {stock_ratio:.1f}x predicted demand — excess inventory detected.")
    else:
        reasoning.append(f"Stock level is within optimal range.")

    if trend_score > 60:
        reasoning.append(f"Market trend is bullish ({trend_score:.0f}/100) — demand likely to rise.")
    elif trend_score < 40:
        reasoning.append(f"Market trend is bearish ({trend_score:.0f}/100) — demand may soften.")

    if data_quality < 0.3:
        reasoning.append("Limited historical data — decision confidence is lower.")

    return {
        "action": action,
        "label": ACTION_LABELS[action],
        "reward": round(reward, 3),
        "reorder_quantity": reorder_qty,
        "probabilities": probabilities,
        "reasoning": reasoning,
        "state": {
            "stock_ratio": round(float(stock_ratio), 2),
            "trend_norm": round(float(state[1]), 2),
            "data_quality": round(data_quality, 2)
        }
    }
