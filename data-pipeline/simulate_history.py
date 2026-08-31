"""
simulate_history.py — generates ~90 days of realistic simulated fares.

6 routes x 3 advance-purchase windows x 5 carriers x 90 days, with deliberate
festival-season spikes so the spike detector has something to catch.

Run:  python simulate_history.py --write-mongo
"""
from __future__ import annotations

import argparse
from datetime import date, timedelta

import numpy as np
import pandas as pd

from config import (
    ADVANCE_MULTIPLIER,
    ADVANCE_WINDOWS,
    CARRIER_MULTIPLIER,
    CARRIERS,
    CONVENIENCE_FEE,
    ROUTES,
    TAX_RATE,
    UDF,
)

DAYS = 90

# (day_offset, route, magnitude, reason)
SPIKE_EVENTS = [
    (34, "DEL-CCU", 0.38, "Durga Puja travel demand"),
    (55, "DEL-BOM", 0.27, "Diwali festival travel"),
    (56, "MAA-DEL", 0.31, "Diwali festival travel"),
    (74, "BLR-HYD", 0.24, "long-weekend demand"),
]


def build_fares(end: date | None = None) -> pd.DataFrame:
    end = end or date.today()
    dates = [end - timedelta(days=i) for i in range(DAYS - 1, -1, -1)]
    rows = []

    for route, base in ROUTES.items():
        rng = np.random.default_rng(abs(hash(route)) % (2**32))
        level = float(base)

        for di, d in enumerate(dates):
            level += (base - level) * 0.06 + rng.normal(0, base * 0.015)
            if d.weekday() in (4, 6):           # Fri / Sun demand
                level += base * 0.014

            day_level = level
            for offset, r, magnitude, _reason in SPIKE_EVENTS:
                if di == offset and r == route:
                    day_level = level * (1 + magnitude)

            for adv in ADVANCE_WINDOWS:
                for carrier in CARRIERS:
                    base_fare = round(
                        day_level
                        * ADVANCE_MULTIPLIER[adv]
                        * CARRIER_MULTIPLIER[carrier]
                        * rng.uniform(0.97, 1.03)
                    )
                    taxes = round(base_fare * TAX_RATE)
                    rows.append(
                        {
                            "route": route,
                            "date": d.isoformat(),
                            "advance_days": adv,
                            "carrier": carrier,
                            "base_fare": base_fare,
                            "taxes": taxes,
                            "udf": UDF,
                            "convenience_fee": CONVENIENCE_FEE,
                            "total_fare": base_fare + taxes + UDF + CONVENIENCE_FEE,
                            "source": "simulated",
                            "spike": False,
                        }
                    )
    return pd.DataFrame(rows)


def write_mongo(df: pd.DataFrame) -> None:
    from pymongo import MongoClient

    from config import DB_NAME, MONGO_URI, WEIGHTS

    if not MONGO_URI:
        raise SystemExit("MONGO_URI missing — set it in .env")

    db = MongoClient(MONGO_URI)[DB_NAME]
    db.fares.delete_many({})
    db.fares.insert_many(df.to_dict("records"))

    db.weights.delete_many({})
    db.weights.insert_many([{"route": r, "weight": w} for r, w in WEIGHTS.items()])

    bench = pd.read_csv("data/dgca_avg_fares.csv")
    db.dgca_benchmark.delete_many({})
    db.dgca_benchmark.insert_many(bench.to_dict("records"))
    print(f"seeded {len(df)} fares, {len(WEIGHTS)} weights, {len(bench)} benchmark months")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--write-mongo", action="store_true")
    ap.add_argument("--csv", default="data/fares_simulated.csv")
    args = ap.parse_args()

    frame = build_fares()
    frame.to_csv(args.csv, index=False)
    print(f"generated {len(frame)} rows -> {args.csv}")
    if args.write_mongo:
        write_mongo(frame)
