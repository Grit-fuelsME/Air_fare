"""pytest suite for the APIx index engine.  Run: pytest -q"""
from __future__ import annotations

import pandas as pd

from calculate_index import compute_index
from config import CONVENIENCE_FEE, UDF


def make_fares(levels: dict[str, list[float]], dates: list[str]) -> pd.DataFrame:
    rows = []
    for route, series in levels.items():
        for d, total in zip(dates, series):
            rows.append(
                {
                    "route": route,
                    "date": d,
                    "advance_days": 15,
                    "carrier": "IndiGo",
                    "base_fare": total - UDF - CONVENIENCE_FEE,
                    "taxes": 0,
                    "udf": UDF,
                    "convenience_fee": CONVENIENCE_FEE,
                    "total_fare": total,
                    "source": "test",
                    "spike": False,
                }
            )
    return pd.DataFrame(rows)


DATES = ["2026-01-01", "2026-01-02"]


def test_index_starts_at_100():
    fares = make_fares({"DEL-BOM": [5000, 5000]}, DATES)
    idx = compute_index(fares)
    assert idx.iloc[0]["index_value"] == 100.0


def test_flat_prices_keep_index_flat():
    fares = make_fares({"DEL-BOM": [5000, 5000], "DEL-BLR": [6000, 6000]}, DATES)
    idx = compute_index(fares)
    assert round(idx.iloc[1]["index_value"], 2) == 100.0
    assert idx.iloc[1]["pct_change"] == 0.0


def test_known_rise_produces_expected_weighted_change():
    # DEL-BOM weight 0.28, +10% move -> weighted change = 2.8% -> index 102.8
    fares = make_fares({"DEL-BOM": [5000, 5500]}, DATES)
    idx = compute_index(fares)
    assert round(idx.iloc[1]["index_value"], 2) == 102.80
    assert round(idx.iloc[1]["pct_change"], 2) == 2.80


def test_jump_above_20_percent_is_flagged_as_spike():
    fares = make_fares({"DEL-CCU": [5000, 6500]}, DATES)  # +30%
    idx = compute_index(fares)
    spikes = idx.iloc[1]["spikes"]
    assert any(s["route"] == "DEL-CCU" and s["pct_change"] == 30.0 for s in spikes)


def test_explanation_names_top_contributor():
    fares = make_fares({"DEL-BOM": [5000, 5500], "BLR-HYD": [3000, 3000]}, DATES)
    idx = compute_index(fares)
    assert "Delhi-Mumbai" in idx.iloc[1]["explanation_text"]
    assert idx.iloc[1]["top_contributor_route"] == "DEL-BOM"
