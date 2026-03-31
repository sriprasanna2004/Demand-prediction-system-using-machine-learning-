"""
Causal demand sensing:
- Google Trends via pytrends (leading indicator)
- Granger causality test to find significant lag (3-7 days)
- Returns causal features with lookahead advantage
Falls back to neutral values if APIs unavailable.
"""
import os
import numpy as np
from datetime import datetime, timedelta
from typing import Optional

import structlog

log = structlog.get_logger()


def _fetch_google_trends(keyword: str, days: int = 30) -> list:
    """Fetch relative search interest for keyword. Returns list of (date, value)."""
    try:
        from pytrends.request import TrendReq
        pytrends = TrendReq(hl="en-US", tz=360, timeout=(10, 25))
        pytrends.build_payload([keyword], timeframe=f"today {days}-d")
        df = pytrends.interest_over_time()
        if df.empty or keyword not in df.columns:
            return []
        return [(str(idx.date()), float(row[keyword])) for idx, row in df.iterrows()]
    except Exception as e:
        log.warning("google_trends_failed", keyword=keyword, error=str(e))
        return []


def _granger_causality_lag(x: list, y: list, max_lag: int = 7) -> int:
    """
    Find the lag at which x Granger-causes y.
    Returns best lag (1-7) or 0 if no significant causality.
    """
    if len(x) < max_lag + 5 or len(y) < max_lag + 5:
        return 0
    try:
        from statsmodels.tsa.stattools import grangercausalitytests
        import pandas as pd
        n = min(len(x), len(y))
        data = pd.DataFrame({"y": y[-n:], "x": x[-n:]})
        results = grangercausalitytests(data[["y", "x"]], maxlag=max_lag, verbose=False)
        best_lag = 0
        best_p = 1.0
        for lag, res in results.items():
            p = res[0]["ssr_ftest"][1]  # F-test p-value
            if p < best_p:
                best_p = p
                best_lag = lag
        return best_lag if best_p < 0.05 else 0
    except Exception as e:
        log.warning("granger_test_failed", error=str(e))
        return 0


def get_causal_features(product_name: str, category: str,
                        sales_series: list = None) -> dict:
    """
    Returns causal features for a product:
    - trend_interest: current Google Trends score (0-100)
    - trend_lag: days of lookahead advantage
    - trend_signal: normalized leading indicator
    """
    # Map category to search keyword
    keyword_map = {
        "Electronics": "buy electronics",
        "Clothing": "buy clothes online",
        "Food": "grocery delivery",
        "Furniture": "buy furniture",
        "Books": "buy books online",
        "Toys": "buy toys",
    }
    keyword = keyword_map.get(category, product_name[:20])

    trends_data = _fetch_google_trends(keyword, days=30)

    if not trends_data:
        return {
            "trend_interest": 50.0,
            "trend_lag": 0,
            "trend_signal": 0.0,
            "causal_method": "fallback_neutral"
        }

    trend_values = [v for _, v in trends_data]
    current_interest = float(trend_values[-1]) if trend_values else 50.0

    # Granger causality if we have sales data
    best_lag = 0
    if sales_series and len(sales_series) >= 14:
        best_lag = _granger_causality_lag(trend_values, sales_series, max_lag=7)

    # Normalized signal: deviation from mean
    mean_interest = np.mean(trend_values) if trend_values else 50
    std_interest = np.std(trend_values) if len(trend_values) > 1 else 10
    trend_signal = (current_interest - mean_interest) / max(std_interest, 1)

    return {
        "trend_interest": round(current_interest, 1),
        "trend_lag": best_lag,
        "trend_signal": round(float(trend_signal), 3),
        "causal_method": "google_trends_granger" if best_lag > 0 else "google_trends_only"
    }


def get_cached_causal_features(product_id: str, product_name: str, category: str) -> dict:
    """Try Redis cache first, then compute."""
    from model.feature_store import _get_redis, _cache_key
    import json

    r = _get_redis()
    if r:
        try:
            key = _cache_key(product_id, "causal")
            raw = r.get(key)
            if raw:
                return json.loads(raw)
        except Exception:
            pass

    features = get_causal_features(product_name, category)

    if r:
        try:
            import json as _json
            r.setex(_cache_key(product_id, "causal"), 3600, _json.dumps(features))
        except Exception:
            pass

    return features
