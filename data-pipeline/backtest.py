"""
backtest.py — compares the last 30 days of the computed index against the
DGCA published monthly average domestic fare and prints a deviation summary.
"""
from __future__ import annotations

import pandas as pd

from config import WEIGHTS


def weighted_avg_fare(fares: pd.DataFrame) -> pd.Series:
    daily = fares.pivot_table(index="date", columns="route", values="total_fare", aggfunc="mean")
    weights = pd.Series(WEIGHTS).reindex(daily.columns).fillna(0)
    return (daily * weights).sum(axis=1).sort_index()


def run(fares_csv: str = "data/fares_simulated.csv",
        bench_csv: str = "data/dgca_avg_fares.csv") -> pd.DataFrame:
    fares = pd.read_csv(fares_csv)
    bench = pd.read_csv(bench_csv).set_index("month")["avg_fare"]

    apix = weighted_avg_fare(fares).tail(30)
    frame = apix.to_frame("apix_avg_fare")
    frame["month"] = [d[:7] for d in frame.index]
    frame["dgca_avg_fare"] = frame["month"].map(bench)
    frame["deviation_pct"] = (
        (frame["apix_avg_fare"] - frame["dgca_avg_fare"]) / frame["dgca_avg_fare"] * 100
    ).round(2)

    abs_dev = frame["deviation_pct"].abs().mean()
    signed = frame["deviation_pct"].mean()
    print(frame.to_string())
    print(
        f"\nBACKTEST SUMMARY: average absolute deviation {abs_dev:.2f}% "
        f"({signed:+.2f}% signed bias) over the last 30 days."
    )
    return frame


if __name__ == "__main__":
    run()
