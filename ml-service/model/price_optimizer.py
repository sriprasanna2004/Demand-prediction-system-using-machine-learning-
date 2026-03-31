"""
Gradient-based price optimizer.
Given demand elasticity, finds revenue-maximizing price
subject to margin floor constraint.
Exposes what-if price curve for visualization.
"""
import numpy as np
from typing import Optional

import structlog

log = structlog.get_logger()


def _demand_at_price(base_price: float, base_demand: float,
                     elasticity: float, price: float) -> float:
    """Price-demand relationship: Q = Q0 * (P/P0)^elasticity."""
    if base_price <= 0:
        return base_demand
    ratio = price / base_price
    return max(0, base_demand * (ratio ** elasticity))


def optimize_price(
    base_price: float,
    base_demand: float,
    elasticity: float,
    cost_per_unit: float,
    margin_floor: float = 0.15,
    price_min: float = None,
    price_max: float = None,
    steps: int = 100
) -> dict:
    """
    Find revenue-maximizing price subject to margin >= margin_floor.

    Args:
        base_price: current price
        base_demand: predicted demand at base_price
        elasticity: price elasticity (negative = elastic, e.g. -1.5)
        cost_per_unit: COGS per unit
        margin_floor: minimum acceptable margin (0.15 = 15%)
        price_min: lower bound (default: 50% of base)
        price_max: upper bound (default: 200% of base)
        steps: grid search resolution

    Returns:
        optimal_price, max_revenue, price_curve (for visualization)
    """
    if price_min is None:
        price_min = base_price * 0.5
    if price_max is None:
        price_max = base_price * 2.0

    prices = np.linspace(price_min, price_max, steps)
    curve = []
    best_revenue = -np.inf
    optimal_price = base_price

    for p in prices:
        demand = _demand_at_price(base_price, base_demand, elasticity, p)
        revenue = p * demand
        margin = (p - cost_per_unit) / p if p > 0 else 0
        feasible = margin >= margin_floor

        curve.append({
            "price": round(float(p), 2),
            "demand": round(float(demand), 1),
            "revenue": round(float(revenue), 2),
            "margin": round(float(margin), 3),
            "feasible": feasible
        })

        if feasible and revenue > best_revenue:
            best_revenue = revenue
            optimal_price = float(p)

    optimal_demand = _demand_at_price(base_price, base_demand, elasticity, optimal_price)
    optimal_margin = (optimal_price - cost_per_unit) / optimal_price if optimal_price > 0 else 0
    revenue_lift = (best_revenue - base_price * base_demand) / max(base_price * base_demand, 1)

    return {
        "optimal_price": round(optimal_price, 2),
        "optimal_demand": round(float(optimal_demand), 1),
        "optimal_revenue": round(float(best_revenue), 2),
        "optimal_margin": round(float(optimal_margin), 3),
        "base_price": base_price,
        "base_revenue": round(base_price * base_demand, 2),
        "revenue_lift_pct": round(revenue_lift * 100, 1),
        "elasticity_used": elasticity,
        "price_curve": curve[::max(1, steps // 50)],  # downsample for API response
    }


def estimate_elasticity_from_history(price_qty_pairs: list) -> float:
    """
    Simple log-log OLS elasticity estimate from historical (price, qty) pairs.
    Returns elasticity coefficient (typically negative).
    """
    if len(price_qty_pairs) < 3:
        return -1.2  # default moderate elasticity

    try:
        prices = np.array([p for p, _ in price_qty_pairs if p > 0])
        qtys = np.array([q for p, q in price_qty_pairs if p > 0 and q > 0])
        if len(prices) < 3:
            return -1.2

        log_p = np.log(prices)
        log_q = np.log(np.maximum(qtys, 0.1))

        # OLS: log_q = a + b * log_p
        A = np.vstack([np.ones_like(log_p), log_p]).T
        result = np.linalg.lstsq(A, log_q, rcond=None)
        elasticity = float(result[0][1])
        # Clip to reasonable range
        return float(np.clip(elasticity, -4.0, 0.5))
    except Exception as e:
        log.warning("elasticity_estimation_failed", error=str(e))
        return -1.2
