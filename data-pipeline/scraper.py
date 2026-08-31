"""
scraper.py — ethical live-fare proof of concept.

Scrapes ONE scraper-friendly public fare page for a handful of sample routes.
Rules enforced here (non-negotiable for this project):

  1. robots.txt is fetched and checked before ANY page request.
  2. A 1-2 second delay is enforced between requests.
  3. A descriptive User-Agent identifies the project.
  4. Any failure degrades gracefully -> the caller falls back to the
     simulated panel from simulate_history.py.

In production this module is replaced by approved data-sharing APIs and
partnerships with airlines, OTAs and DGCA.
"""
from __future__ import annotations

import random
import time
from datetime import date, timedelta
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

from config import ADVANCE_WINDOWS, CONVENIENCE_FEE, TAX_RATE, UDF

USER_AGENT = "APIx-Research-Bot/0.1 (SIH26056 MoSPI prototype; contact: apix-team@example.org)"
SAMPLE_ROUTES = ["DEL-BOM", "DEL-BLR", "BOM-BLR", "DEL-CCU", "BLR-HYD"]

# A scraper-friendly public listing page. Swap for any source whose robots.txt
# and terms of use permit automated access.
BASE_URL = "https://www.example-fare-listing.in/fares/{route}?days={days}"


def robots_allows(url: str) -> bool:
    """Return True only if robots.txt explicitly allows this path for our UA."""
    parsed = urlparse(url)
    rp = RobotFileParser()
    rp.set_url(f"{parsed.scheme}://{parsed.netloc}/robots.txt")
    try:
        rp.read()
    except Exception as exc:  # unreachable robots.txt -> do not scrape
        print(f"[robots] could not read robots.txt ({exc}); refusing to scrape")
        return False
    allowed = rp.can_fetch(USER_AGENT, url)
    print(f"[robots] {'ALLOW' if allowed else 'DENY '} {url}")
    return allowed


def polite_sleep() -> None:
    time.sleep(random.uniform(1.0, 2.0))


def parse_fare_page(html: str, route: str, advance_days: int) -> list[dict]:
    """Parse fare rows out of the listing page. Structure is source-specific."""
    soup = BeautifulSoup(html, "html.parser")
    rows: list[dict] = []
    for card in soup.select(".fare-row"):
        carrier = card.select_one(".carrier")
        base = card.select_one(".base-fare")
        if not carrier or not base:
            continue
        base_fare = float(base.get_text(strip=True).replace("\u20b9", "").replace(",", ""))
        taxes = round(base_fare * TAX_RATE)
        rows.append(
            {
                "route": route,
                "date": str(date.today() + timedelta(days=advance_days)),
                "advance_days": advance_days,
                "carrier": carrier.get_text(strip=True),
                "base_fare": base_fare,
                "taxes": taxes,
                "udf": UDF,
                "convenience_fee": CONVENIENCE_FEE,
                "total_fare": base_fare + taxes + UDF + CONVENIENCE_FEE,
                "source": urlparse(BASE_URL).netloc,
                "spike": False,
            }
        )
    return rows


def scrape() -> list[dict]:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    collected: list[dict] = []

    for route in SAMPLE_ROUTES:
        for days in ADVANCE_WINDOWS:
            url = BASE_URL.format(route=route, days=days)
            if not robots_allows(url):
                continue
            try:
                resp = session.get(url, timeout=15)
                resp.raise_for_status()
                collected.extend(parse_fare_page(resp.text, route, days))
            except Exception as exc:
                print(f"[scrape] {route} T+{days} failed: {exc} -> skipping")
            finally:
                polite_sleep()

    if not collected:
        print("[scrape] no live rows collected; caller should fall back to simulated data")
    return collected


if __name__ == "__main__":
    rows = scrape()
    print(f"collected {len(rows)} live fare rows")
