"""
PPO-inspired inventory decision agent using numpy (no PyTorch dependency).
Implements a trained policy via numpy weight matrices.
"""
import os
import numpy as np
import joblib
from pathlib import Path

PPO_PATH = os.getenv("PPO_PATH", "./models/ppo_agent.joblib")

ACTIONS = ["WAIT", "REORDER", "URGENT_REORDER", "DISCOUNT", "MONITOR"]
ACTION_LABELS = {
    "WAIT": "Hold current stock — demand is stable",
    "REORDER": "Place a standard reorder now",
    "URGENT_REORDER": "Urgent reorder — stock critically low",
    "DISCOUNT": "Run a promotion to clear excess stock",
    "MONITOR": "Monitor closely — borderline stock level"
}

STATE_DIM = 6
ACTION_DIM = 5
HIDDEN_DIM = 64


def softmax(x):
    e = np.exp(x - x.max())
    return e / e.sum()


def relu(x):
    return np.maximum(0, x)


class NumpyPPOPolicy:
    """2-layer MLP policy using numpy weights."""
    def __init__(self):
        np.random.seed(42)
        self.W1 = np.random.randn(STATE_DIM, HIDDEN_DIM) * 0.1
        self.b1 = np.zeros(HIDDEN_DIM)
        self.W2 = np.random.randn(HIDDEN_DIM, HIDDEN_DIM) * 0.1
        self.b2 = np.zeros(HIDDEN_DIM)
        self.W_actor = np.random.randn(HIDDEN_DIM, ACTION_DIM) * 0.1
        self.b_actor = np.zeros(ACTION_DIM)

    def forward(self, state):
        h1 = relu(state @ self.W1 + self.b1)
        h2 = relu(h1 @ self.W2 + self.b2)
        logits = h2 @ self.W_actor + self.b_actor
        return softmax(logits)

    def update_weights(self, dW1, dW2, dW_actor, lr=0.01):
        self.W1 += lr * dW1
        self.W2 += lr * dW2
        self.W_actor += lr * dW_actor


class PPOAgent:
    def __init__(self):
        self.policy = None
        self.trained = False
        self._load()

    def _load(self):
        path = Path(PPO_PATH)
        if path.exists():
            try:
                data = joblib.load(path)
                self.policy = NumpyPPOPolicy()
                self.policy.W1 = data['W1']
                self.policy.b1 = data['b1']
                self.policy.W2 = data['W2']
                self.policy.b2 = data['b2']
                self.policy.W_actor = data['W_actor']
                self.policy.b_actor = data['b_actor']
                self.trained = True
                print(f"PPO agent loaded from {PPO_PATH}")
            except Exception as e:
                print(f"PPO load error: {e}")
                self.policy = NumpyPPOPolicy()
        else:
            self.policy = NumpyPPOPolicy()
            print("No PPO model found — using initialized policy")

    def reload(self):
        self._load()

    def is_loaded(self):
        return self.policy is not None

    def _encode_state(self, stock, predicted_demand, trend_score, data_quality, price, month):
        return np.array([
            min(stock / max(predicted_demand, 1), 5.0),
            min(predicted_demand / max(stock, 1), 5.0),
            (trend_score - 50) / 50,
            np.sin((month - 3) * np.pi / 6),
            min(stock / max(predicted_demand / 30, 0.01), 60) / 60,
            data_quality
        ], dtype=np.float32)

    def decide(self, stock, predicted_demand, trend_score=50, data_quality=0.5, price=50, month=6):
        state = self._encode_state(stock, predicted_demand, trend_score, data_quality, price, month)
        probs = self.policy.forward(state)
        action_idx = int(np.argmax(probs))
        action = ACTIONS[action_idx]
        reorder_qty = max(0, int(predicted_demand * 1.3 - stock)) if action in ["REORDER", "URGENT_REORDER"] else 0
        reasoning = self._build_reasoning(state, action, stock, predicted_demand, trend_score)

        return {
            "action": action,
            "label": ACTION_LABELS[action],
            "confidence": round(float(probs[action_idx]), 3),
            "reward": round(float(probs[action_idx] * 3), 3),
            "reorder_quantity": reorder_qty,
            "probabilities": {ACTIONS[i]: round(float(probs[i]), 3) for i in range(ACTION_DIM)},
            "reasoning": reasoning,
            "model": "ppo_numpy_mlp" if self.trained else "ppo_initialized",
            "state": {
                "stock_ratio": round(float(state[0]), 2),
                "demand_velocity": round(float(state[1]), 2),
                "trend_norm": round(float(state[2]), 2),
                "data_quality": round(data_quality, 2)
            }
        }

    def _build_reasoning(self, state, action, stock, predicted_demand, trend_score):
        ratio = state[0]
        reasons = []
        if ratio < 0.3:
            reasons.append(f"Stock ({int(stock)}) is critically below predicted demand ({int(predicted_demand)}).")
        elif ratio < 0.7:
            reasons.append(f"Stock is below safe threshold — {ratio:.1f}x predicted demand.")
        elif ratio > 2.5:
            reasons.append(f"Excess inventory — stock is {ratio:.1f}x predicted demand.")
        else:
            reasons.append(f"Stock level is optimal at {ratio:.1f}x predicted demand.")
        if trend_score > 60:
            reasons.append(f"Bullish market trend ({trend_score:.0f}/100).")
        elif trend_score < 40:
            reasons.append(f"Bearish market trend ({trend_score:.0f}/100).")
        return reasons


def train_ppo(episodes=2000):
    """Train PPO agent using numpy REINFORCE."""
    policy = NumpyPPOPolicy()
    GAMMA = 0.99
    LR = 0.005
    reward_history = []

    for episode in range(episodes):
        stock = np.random.uniform(0, 200)
        demand = np.random.uniform(5, 100)
        trend = np.random.uniform(20, 80)
        dq = np.random.uniform(0.1, 1.0)
        month = np.random.randint(1, 13)

        states, actions, rewards = [], [], []

        for _ in range(10):
            state = np.array([
                min(stock / max(demand, 1), 5.0),
                min(demand / max(stock, 1), 5.0),
                (trend - 50) / 50,
                np.sin((month - 3) * np.pi / 6),
                min(stock / max(demand / 30, 0.01), 60) / 60,
                dq
            ], dtype=np.float32)

            probs = policy.forward(state)
            action_idx = np.random.choice(ACTION_DIM, p=probs)
            ratio = stock / max(demand, 1)

            reward = 0.0
            if action_idx == 0: reward = 1.0 if 0.7 <= ratio <= 2.0 else -0.5
            elif action_idx == 1: reward = 1.5 if ratio < 0.7 else -0.3
            elif action_idx == 2: reward = 2.0 if ratio < 0.3 else -1.0
            elif action_idx == 3: reward = 1.5 if ratio > 2.0 else -0.5
            elif action_idx == 4: reward = 0.5 if dq < 0.3 else 0.0

            states.append(state)
            actions.append(action_idx)
            rewards.append(reward)

            if action_idx in [1, 2]: stock = min(stock + demand * 1.3, 300)
            elif action_idx == 3: stock = max(stock - demand * 0.5, 0)
            stock = max(0, stock - demand / 30)

        # REINFORCE update
        returns = []
        R = 0
        for r in reversed(rewards):
            R = r + GAMMA * R
            returns.insert(0, R)
        returns = np.array(returns)
        returns = (returns - returns.mean()) / (returns.std() + 1e-8)

        for state, action_idx, G in zip(states, actions, returns):
            probs = policy.forward(state)
            h1 = relu(state @ policy.W1 + policy.b1)
            h2 = relu(h1 @ policy.W2 + policy.b2)
            grad_logits = -probs.copy()
            grad_logits[action_idx] += 1
            grad_logits *= G * LR
            policy.W_actor += np.outer(h2, grad_logits)
            policy.b_actor += grad_logits

        reward_history.append(sum(rewards))
        if (episode + 1) % 500 == 0:
            print(f"Episode {episode+1} — Avg Reward: {np.mean(reward_history[-500:]):.3f}")

    Path("./models").mkdir(exist_ok=True)
    joblib.dump({'W1': policy.W1, 'b1': policy.b1, 'W2': policy.W2, 'b2': policy.b2,
                 'W_actor': policy.W_actor, 'b_actor': policy.b_actor}, PPO_PATH)
    print(f"PPO saved to {PPO_PATH}")

    return {
        "episodes": episodes,
        "final_avg_reward": round(float(np.mean(reward_history[-100:])), 3),
        "model": "ppo_numpy_mlp"
    }
