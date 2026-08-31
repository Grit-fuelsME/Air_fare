"""
calculate_index.py — computes the daily passenger-traffic weighted airfare index.

    price_change%(route) = (fare_today - fare_yesterday) / fare_yesterday
    weighted_change      = sum(price_change%(route) * weight(route))
    index(t)             = index(t-1) * (1 + weighted_change),  index(0) = 100

A route is flagged as a spike when its daily change exceeds +20%. An optional
scikit-learn IsolationForest pass catches subtler seasonally-adjusted outliers.
A plain-English explanation sentence is generated for every day.
"""
from __future__ import annotations

import argparse

import pandas as pd

from config import SPIKE_THRESHOLD, WEIGHTS

ROUTE_LABELS = {
    "DEL-BOM": "Delhi-Mumbai",
    "DEL-BLR": "Delhi-Bengaluru",
    "BOM-BLR": "Mumbai-Bengaluru",
    "DEL-CCU": "Delhi-Kolkata",
    "BLR-HYD": "Bengaluru-Hyderabad",
    "MAA-DEL": "Chennai-Delhi",
}


def route_daily_average(fares: pd.DataFrame) -> pd.DataFrame:
    """Average total fare per route per day (across carriers and windows)."""
    return fares.pivot_table(index="date", columns="route", values="total_fare", aggfunc="mean")


def detect_spikes_ml(changes: pd.DataFrame) -> set[tuple[str, str]]:
    """IsolationForest outliers as a secondary detector. Returns {(date, route)}."""
    try:
        from sklearn.ensemble import IsolationForest
    except ImportError:
        return set()

    flagged: set[tuple[str, str]] = set()
    for route in changes.columns:
        series = changes[route].dropna()
        if len(series) < 20:
            continue
        model = IsolationForest(contamination=0.03, random_state=42)
        preds = model.fit_predict(series.to_frame())
        for d, p, v in zip(series.index, preds, series.values):
            if p == -1 and v > 0:
                flagged.add((d, route))
    return flagged


def explanation(day: str, pct: float, top_route: str, top_change: float, spikes: list[dict]) -> str:
    direction = "rose" if pct >= 0 else "eased"
    text = (
        f"On {day} the airfare index {direction} {abs(pct):.2f}%, mainly driven by "
        f"{ROUTE_LABELS.get(top_route, top_route)} fares ({top_change:+.1f}%)."
    )
    if spikes:
        names = ", ".join(ROUTE_LABELS.get(s["route"], s["route"]) for s in spikes)
        text += f" Sharp demand pushed {names} up by more than 20% in a single day."
    return text


def compute_index(fares: pd.DataFrame) -> pd.DataFrame:
    daily = route_daily_average(fares).sort_index()
    changes = daily.pct_change()
    ml_flags = detect_spikes_ml(changes)

    records = []
    index_value = 100.0

    for i, day in enumerate(daily.index):
        if i == 0:
            records.append(
                {
                    "date": day,
                    "index_value": 100.0,
                    "pct_change": 0.0,
                    "top_contributor_route": "-",
                    "explanation_text": (
                        "Index base period established at 100 using DGCA passenger-traffic "
                        "weights across six trunk routes."
                    ),
                    "spikes": [],
                }
            )
            continue

        row = changes.loc[day]
        contributions = {r: row[r] * WEIGHTS.get(r, 0.0) for r in daily.columns}
        weighted_change = sum(contributions.values())
        top_route = max(contributions, key=lambda r: contributions[r])

        spikes = [
            {"route": r, "pct_change": round(row[r] * 100, 2)}
            for r in daily.columns
            if row[r] > SPIKE_THRESHOLD or (day, r) in ml_flags
        ]

        index_value *= 1 + weighted_change
        pct = weighted_change * 100
        records.append(
            {
                "date": day,
                "index_value": round(index_value, 2),
                "pct_change": round(pct, 2),
                "top_contributor_route": top_route,
                "explanation_text": explanation(day, pct, top_route, row[top_route] * 100, spikes),
                "spikes": spikes,
            }
        )

    return pd.DataFrame(records)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="data/fares_simulated.csv")
    ap.add_argument("--write-mongo", action="store_true")
    args = ap.parse_args()

    fares = pd.read_csv(args.csv)
    index_df = compute_index(fares)
    index_df.to_csv("data/daily_index.csv", index=False)
    print(index_df.tail(5).to_string(index=False))

    if args.write_mongo:
        from pymongo import MongoClient

        from config import DB_NAME, MONGO_URI

        db = MongoClient(MONGO_URI)[DB_NAME]
        db.daily_index.delete_many({})
        db.daily_index.insert_many(index_df.to_dict("records"))
        print(f"wrote {len(index_df)} daily_index documents")


if __name__ == "__main__":
    main()
