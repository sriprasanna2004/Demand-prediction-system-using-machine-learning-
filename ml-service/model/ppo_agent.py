"""
Real PPO (Proximal Policy Optimization) agent for inventory decisions.
Uses a 2-layer MLP policy network trained via actor-critic PPO.
State: [stock_ratio, demand_velocity, trend_norm, seasonality, days_to_stockout, data_quality]
Action: discrete — WAIT(0), REORDER(1), URGENT_REORDER(2), DISCOUNT(3), MONITOR(4)
"""
import os
import numpy as np
import joblib
from pathlib import Path

try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.distributions import Categorical
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

PPO_PATH = os.getenv("PPO_PATH", "./models/ppo_agent.pt")

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


class PolicyNetwork(nn.Module if TORCH_AVAILABLE else object):
    def __init__(self):
        if not TORCH_AVAILABLE:
            return
        super().__init__()
        self.shared = nn.Sequential(
            nn.Linear(STATE_DIM, 64), nn.Tanh(),
            nn.Linear(64, 64), nn.Tanh()
        )
        self.actor = nn.Linear(64, ACTION_DIM)   # policy head
        self.critic = nn.Linear(64, 1)            # value head

    def forward(self, x):
        shared = self.shared(x)
        return self.actor(shared), self.critic(shared)

    def get_action(self, state):
        logits, value = self.forward(state)
        dist = Categorical(logits=logits)
        action = dist.sample()
        return action, dist.log_prob(action), dist.entropy(), value


class PPOAgent:
    def __init__(self):
        self.policy = None
        self._load()

    def _load(self):
        if not TORCH_AVAILABLE:
            return
        path = Path(PPO_PATH)
        if path.exists():
            try:
                self.policy = PolicyNetwork()
                self.policy.load_state_dict(torch.load(path, map_location="cpu"))
                self.policy.eval()
                print(f"PPO agent loaded from {PPO_PATH}")
            except Exception as e:
                print(f"PPO load error: {e}")
                self.policy = None
        else:
            print("No PPO model found. Training on first call.")

    def reload(self):
        self._load()

    def is_loaded(self):
        return self.policy is not None

    def _encode_state(self, stock, predicted_demand, trend_score, data_quality, price, month=6):
        stock_ratio = min(stock / max(predicted_demand, 1), 5.0)
        demand_velocity = min(predicted_demand / max(stock, 1), 5.0)
        trend_norm = (trend_score - 50) / 50
        seasonal = np.sin((month - 3) * np.pi / 6)
        days_to_stockout = min(stock / max(predicted_demand / 30, 0.01), 60) / 60
        return np.array([stock_ratio, demand_velocity, trend_norm, seasonal, days_to_stockout, data_quality], dtype=np.float32)

    def decide(self, stock, predicted_demand, trend_score=50, data_quality=0.5, price=50, month=6):
        state = self._encode_state(stock, predicted_demand, trend_score, data_quality, price, month)

        if self.policy is not None and TORCH_AVAILABLE:
            with torch.no_grad():
                state_t = torch.FloatTensor(state).unsqueeze(0)
                logits, value = self.policy(state_t)
                probs = torch.softmax(logits, dim=-1).squeeze().numpy()
                action_idx = int(np.argmax(probs))
                confidence = float(probs[action_idx])
        else:
            # Rule-based fallback
            probs, action_idx = self._rule_policy(state)
            confidence = float(probs[action_idx])

        action = ACTIONS[action_idx]
        reorder_qty = max(0, int(predicted_demand * 1.3 - stock)) if action in ["REORDER", "URGENT_REORDER"] else 0
        reasoning = self._build_reasoning(state, action, stock, predicted_demand, trend_score)

        return {
            "action": action,
            "label": ACTION_LABELS[action],
            "confidence": round(confidence, 3),
            "reward": round(float(confidence * 3), 3),
            "reorder_quantity": reorder_qty,
            "probabilities": {ACTIONS[i]: round(float(probs[i]), 3) for i in range(ACTION_DIM)},
            "reasoning": reasoning,
            "model": "ppo_neural_network" if self.policy is not None else "ppo_rule_fallback",
            "state": {
                "stock_ratio": round(float(state[0]), 2),
                "demand_velocity": round(float(state[1]), 2),
                "trend_norm": round(float(state[2]), 2),
                "days_to_stockout_pct": round(float(state[4]), 2),
                "data_quality": round(data_quality, 2)
            }
        }

    def _rule_policy(self, state):
        stock_ratio, demand_vel, trend_norm, seasonal, days_pct, dq = state
        logits = np.zeros(ACTION_DIM)
        if stock_ratio < 0.3:
            logits[2] += 3.0  # URGENT_REORDER
            logits[1] += 1.5
        elif stock_ratio < 0.7:
            logits[1] += 2.5  # REORDER
            logits[4] += 0.5
        elif stock_ratio > 2.5:
            logits[3] += 2.5  # DISCOUNT
            logits[0] += 0.5
        else:
            logits[0] += 2.0  # WAIT
            logits[4] += 1.0
        if trend_norm > 0.2: logits[1] += 0.8
        elif trend_norm < -0.2: logits[3] += 0.8
        if dq < 0.3: logits[4] += 1.5
        exp = np.exp(logits - logits.max())
        probs = exp / exp.sum()
        return probs, int(np.argmax(probs))

    def _build_reasoning(self, state, action, stock, predicted_demand, trend_score):
        stock_ratio = state[0]
        reasons = []
        if stock_ratio < 0.3:
            reasons.append(f"Stock ({int(stock)}) is critically below predicted demand ({int(predicted_demand)}) — {stock_ratio:.1f}x ratio.")
        elif stock_ratio < 0.7:
            reasons.append(f"Stock is below safe threshold — only {stock_ratio:.1f}x predicted demand.")
        elif stock_ratio > 2.5:
            reasons.append(f"Excess inventory detected — stock is {stock_ratio:.1f}x predicted demand.")
        else:
            reasons.append(f"Stock level is optimal — {stock_ratio:.1f}x predicted demand.")
        if trend_score > 60:
            reasons.append(f"Bullish market trend ({trend_score:.0f}/100) suggests rising demand.")
        elif trend_score < 40:
            reasons.append(f"Bearish market trend ({trend_score:.0f}/100) — demand may soften.")
        if state[5] < 0.3:
            reasons.append("Limited historical data reduces decision confidence.")
        return reasons


def train_ppo(episodes=2000):
    """Train PPO agent in inventory simulation environment."""
    if not TORCH_AVAILABLE:
        print("PyTorch not available — skipping PPO training")
        return {"error": "PyTorch not available"}

    policy = PolicyNetwork()
    optimizer = optim.Adam(policy.parameters(), lr=3e-4)

    # PPO hyperparameters
    GAMMA = 0.99
    CLIP_EPS = 0.2
    ENTROPY_COEF = 0.01
    VALUE_COEF = 0.5
    UPDATE_EPOCHS = 4
    BATCH_SIZE = 64

    reward_history = []
    all_rewards = []

    for episode in range(episodes):
        # Sample random inventory scenario
        stock = np.random.uniform(0, 200)
        demand = np.random.uniform(5, 100)
        trend = np.random.uniform(20, 80)
        dq = np.random.uniform(0.1, 1.0)
        price = np.random.uniform(10, 500)
        month = np.random.randint(1, 13)

        states, actions, log_probs, rewards, values = [], [], [], [], []

        # Collect trajectory (10 steps per episode)
        for step in range(10):
            state = np.array([
                min(stock / max(demand, 1), 5.0),
                min(demand / max(stock, 1), 5.0),
                (trend - 50) / 50,
                np.sin((month - 3) * np.pi / 6),
                min(stock / max(demand / 30, 0.01), 60) / 60,
                dq
            ], dtype=np.float32)

            state_t = torch.FloatTensor(state).unsqueeze(0)
            action_t, log_prob, entropy, value = policy.get_action(state_t)
            action_idx = int(action_t.item())

            # Reward function
            stock_ratio = stock / max(demand, 1)
            reward = 0.0
            if action_idx == 0:   # WAIT
                reward = 1.0 if 0.7 <= stock_ratio <= 2.0 else -0.5
            elif action_idx == 1: # REORDER
                reward = 1.5 if stock_ratio < 0.7 else -0.3
            elif action_idx == 2: # URGENT_REORDER
                reward = 2.0 if stock_ratio < 0.3 else -1.0
            elif action_idx == 3: # DISCOUNT
                reward = 1.5 if stock_ratio > 2.0 else -0.5
            elif action_idx == 4: # MONITOR
                reward = 0.5 if dq < 0.3 else 0.0

            # Trend bonus
            if trend > 60 and action_idx in [1, 2]: reward += 0.3
            if trend < 40 and action_idx == 3: reward += 0.3

            states.append(state)
            actions.append(action_idx)
            log_probs.append(log_prob)
            rewards.append(reward)
            values.append(value)

            # Simulate state transition
            if action_idx in [1, 2]:
                stock = min(stock + demand * 1.3, 300)
            elif action_idx == 3:
                stock = max(stock - demand * 0.5, 0)
            stock = max(0, stock - demand / 30)
            trend += np.random.normal(0, 2)
            trend = np.clip(trend, 10, 90)

        all_rewards.append(sum(rewards))

        # Compute returns and advantages
        returns = []
        R = 0
        for r in reversed(rewards):
            R = r + GAMMA * R
            returns.insert(0, R)

        returns_t = torch.FloatTensor(returns)
        states_t = torch.FloatTensor(np.array(states))
        actions_t = torch.LongTensor(actions)
        old_log_probs_t = torch.stack(log_probs).detach()
        values_t = torch.stack(values).squeeze().detach()
        advantages = (returns_t - values_t)
        advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

        # PPO update
        for _ in range(UPDATE_EPOCHS):
            logits, new_values = policy(states_t)
            dist = Categorical(logits=logits)
            new_log_probs = dist.log_prob(actions_t)
            entropy = dist.entropy().mean()

            ratio = torch.exp(new_log_probs - old_log_probs_t)
            surr1 = ratio * advantages
            surr2 = torch.clamp(ratio, 1 - CLIP_EPS, 1 + CLIP_EPS) * advantages
            actor_loss = -torch.min(surr1, surr2).mean()
            critic_loss = VALUE_COEF * (returns_t - new_values.squeeze()).pow(2).mean()
            loss = actor_loss + critic_loss - ENTROPY_COEF * entropy

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(policy.parameters(), 0.5)
            optimizer.step()

        if (episode + 1) % 200 == 0:
            avg_reward = np.mean(all_rewards[-200:])
            reward_history.append({"episode": episode + 1, "avg_reward": round(avg_reward, 3)})
            print(f"Episode {episode+1}/{episodes} — Avg Reward: {avg_reward:.3f}")

    Path("./models").mkdir(exist_ok=True)
    torch.save(policy.state_dict(), PPO_PATH)
    print(f"PPO agent saved to {PPO_PATH}")

    return {
        "episodes": episodes,
        "final_avg_reward": round(float(np.mean(all_rewards[-100:])), 3),
        "reward_history": reward_history,
        "model": "ppo_neural_network"
    }
