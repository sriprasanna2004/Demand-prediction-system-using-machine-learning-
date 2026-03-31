"""
Custom Gymnasium environment for inventory management RL.
State: [stock_ratio, days_of_supply, demand_forecast_norm, trend_norm,
        seasonality, lead_time_norm, holding_cost_norm]
Action: continuous reorder quantity [0, 500]
Reward: -stockout_penalty - holding_cost + service_level_bonus
"""
import numpy as np
import gymnasium as gym
from gymnasium import spaces


class InventoryEnv(gym.Env):
    metadata = {"render_modes": []}

    # Reward shaping constants
    STOCKOUT_PENALTY = 10.0
    HOLDING_COST_RATE = 0.02   # per unit per step
    SERVICE_LEVEL_BONUS = 5.0
    OVERSTOCK_PENALTY = 0.5

    def __init__(self, historical_data: list = None, lead_time: float = 7.0,
                 holding_cost: float = 1.0, max_stock: float = 500.0):
        super().__init__()
        self.historical_data = historical_data or []
        self.lead_time = lead_time
        self.holding_cost = holding_cost
        self.max_stock = max_stock
        self.step_idx = 0
        self.stock = max_stock * 0.5
        self.pending_orders = []  # (arrival_step, qty)

        # State: 7 normalized features
        self.observation_space = spaces.Box(
            low=np.zeros(7, dtype=np.float32),
            high=np.ones(7, dtype=np.float32),
            dtype=np.float32
        )
        # Action: reorder quantity 0–500 (continuous)
        self.action_space = spaces.Box(
            low=np.array([0.0], dtype=np.float32),
            high=np.array([500.0], dtype=np.float32),
            dtype=np.float32
        )

    def _get_demand(self) -> float:
        if self.historical_data and self.step_idx < len(self.historical_data):
            return float(self.historical_data[self.step_idx])
        # Synthetic demand with seasonality
        t = self.step_idx
        base = 20.0
        seasonal = 1 + 0.3 * np.sin(2 * np.pi * t / 365)
        weekly = 1 + 0.15 * np.sin(2 * np.pi * t / 7)
        noise = np.random.normal(0, 2)
        return max(0, base * seasonal * weekly + noise)

    def _get_obs(self, demand_forecast: float) -> np.ndarray:
        days_of_supply = self.stock / max(demand_forecast, 1)
        seasonality = 0.5 + 0.5 * np.sin(2 * np.pi * self.step_idx / 365)
        return np.array([
            min(1.0, self.stock / self.max_stock),           # stock_ratio
            min(1.0, days_of_supply / 30),                   # days_of_supply (norm)
            min(1.0, demand_forecast / 100),                 # demand_forecast_norm
            0.5,                                             # trend_norm (neutral)
            float(seasonality),                              # seasonality
            min(1.0, self.lead_time / 30),                   # lead_time_norm
            min(1.0, self.holding_cost / 10),                # holding_cost_norm
        ], dtype=np.float32)

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.step_idx = 0
        self.stock = self.max_stock * np.random.uniform(0.2, 0.8)
        self.pending_orders = []
        demand = self._get_demand()
        return self._get_obs(demand), {}

    def step(self, action):
        reorder_qty = float(np.clip(action[0], 0, 500))

        # Receive pending orders that have arrived
        arrived = [(s, q) for s, q in self.pending_orders if s <= self.step_idx]
        self.pending_orders = [(s, q) for s, q in self.pending_orders if s > self.step_idx]
        for _, q in arrived:
            self.stock = min(self.max_stock, self.stock + q)

        # Place new order (arrives after lead_time steps)
        if reorder_qty > 0:
            arrival = self.step_idx + int(self.lead_time)
            self.pending_orders.append((arrival, reorder_qty))

        # Realize demand
        demand = self._get_demand()
        fulfilled = min(self.stock, demand)
        stockout = max(0, demand - self.stock)
        self.stock = max(0, self.stock - demand)

        # Compute reward
        service_level = fulfilled / max(demand, 1)
        holding_cost = self.stock * self.HOLDING_COST_RATE
        reward = (
            -stockout * self.STOCKOUT_PENALTY
            - holding_cost * self.HOLDING_COST_RATE
            + service_level * self.SERVICE_LEVEL_BONUS
            - max(0, self.stock - demand * 3) * self.OVERSTOCK_PENALTY
        )

        self.step_idx += 1
        terminated = self.step_idx >= max(len(self.historical_data) if self.historical_data else 365, 365)
        truncated = False

        next_demand = self._get_demand()
        obs = self._get_obs(next_demand)
        info = {
            "stock": self.stock, "demand": demand, "fulfilled": fulfilled,
            "stockout": stockout, "service_level": service_level,
            "reorder_qty": reorder_qty
        }
        return obs, float(reward), terminated, truncated, info
