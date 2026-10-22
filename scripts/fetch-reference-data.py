"""Fetch a small, attributed OurAirports snapshot; never auto-approve it as game content."""
import csv
import hashlib
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

SITE = Path(__file__).resolve().parents[1]
SOURCE = "https://davidmegginson.github.io/ourairports-data/airports.csv"
LICENSE = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/LICENSE"
TARGETS = {"LHR", "JFK", "LAX", "SFO", "AMS", "CDG", "FRA", "DXB", "SIN", "HND", "SYD", "BOM", "DEL", "DCA", "SAN"}

def get(url):
    with urlopen(Request(url, headers={"User-Agent": "AirplaneGames-Prototype/0.1"}), timeout=45) as response:
        return response.read()

raw = get(SOURCE)
license_text = get(LICENSE).decode("utf-8")
records = []
for row in csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))):
    if row["iata_code"] in TARGETS and row["type"] != "closed_airport":
        records.append({key: row[key] for key in ("ident", "iata_code", "name", "municipality", "iso_country", "latitude_deg", "longitude_deg", "home_link", "wikipedia_link")})
missing = TARGETS - {row["iata_code"] for row in records}
if missing:
    raise RuntimeError(f"Snapshot missing requested airports: {sorted(missing)}")
destination = SITE / "data"
destination.mkdir(exist_ok=True)
(destination / "reference-airports.json").write_text(json.dumps({"source": SOURCE, "licenseSource": LICENSE, "fetchedAt": datetime.now(timezone.utc).isoformat(), "sourceSha256": hashlib.sha256(raw).hexdigest(), "reviewState": "reference-only-not-approved-game-content", "airports": sorted(records, key=lambda r: r["iata_code"])}, indent=2) + "\n", encoding="utf-8")
(destination / "OURAIRPORTS-LICENSE.txt").write_text(license_text, encoding="utf-8")
print(f"Saved {len(records)} source-attributed airport references and original license.")
