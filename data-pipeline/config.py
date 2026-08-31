"""Shared config for the APIx data pipeline."""
import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")            # never hardcode: set in .env
DB_NAME = os.getenv("MONGO_DB", "apix")

ROUTES = {
    "DEL-BOM": 5400,
    "DEL-BLR": 6100,
    "BOM-BLR": 4300,
    "DEL-CCU": 5200,
    "BLR-HYD": 3200,
    "MAA-DEL": 6400,
}

CARRIERS = ["IndiGo", "Air India", "Air India Express", "Akasa Air", "SpiceJet"]
ADVANCE_WINDOWS = [1, 15, 30]
ADVANCE_MULTIPLIER = {1: 1.62, 15: 1.12, 30: 0.88}
CARRIER_MULTIPLIER = {
    "IndiGo": 1.00, "Air India": 1.14, "Air India Express": 0.90,
    "Akasa Air": 0.97, "SpiceJet": 0.92,
}

# DGCA passenger-traffic shares (data/route_weights.csv)
WEIGHTS = {
    "DEL-BOM": 0.28, "DEL-BLR": 0.21, "BOM-BLR": 0.16,
    "DEL-CCU": 0.14, "BLR-HYD": 0.11, "MAA-DEL": 0.10,
}

SPIKE_THRESHOLD = 0.20   # 20% single-day route move
UDF = 236
CONVENIENCE_FEE = 299
TAX_RATE = 0.09
