"""Download daily prices and write site/data.js for the market map.

Usage:  python build.py
Source: Yahoo Finance through the unofficial `yfinance` library (free, no key).

Edit the three dictionaries below to change what the map tracks. A ticker may
appear in both universes (e.g. NVDA); it is downloaded once. Tickers use Yahoo
symbols, for example BRK-B.

Market caps are current shares outstanding x close, so past market caps ignore
buybacks and issuance. Fine for tile sizes and group totals, not a precise history.
"""
import concurrent.futures as cf
import datetime as dt
import json
import math
import pathlib
import sys

import yfinance as yf

# ---- what is tracked ---------------------------------------------------------

# Broad market map, grouped by sector.
MARKET = {
    "Technology": {
        "AAPL": "Apple", "MSFT": "Microsoft", "NVDA": "Nvidia", "AVGO": "Broadcom",
        "ORCL": "Oracle", "ADBE": "Adobe", "CRM": "Salesforce", "AMD": "AMD",
        "INTC": "Intel", "QCOM": "Qualcomm", "TXN": "Texas Instr.", "CSCO": "Cisco",
        "IBM": "IBM", "ACN": "Accenture",
    },
    "Communication": {
        "GOOGL": "Alphabet", "META": "Meta", "NFLX": "Netflix", "DIS": "Disney",
        "CMCSA": "Comcast", "T": "AT&T", "VZ": "Verizon", "TMUS": "T-Mobile",
    },
    "Consumer cyclical": {
        "AMZN": "Amazon", "TSLA": "Tesla", "HD": "Home Depot", "MCD": "McDonald's",
        "NKE": "Nike",
    },
    "Consumer defensive": {
        "WMT": "Walmart", "COST": "Costco", "PG": "Procter & Gamble", "KO": "Coca-Cola",
        "PEP": "PepsiCo", "PM": "Philip Morris",
    },
    "Financial": {
        "BRK-B": "Berkshire", "JPM": "JPMorgan", "V": "Visa", "MA": "Mastercard",
        "BAC": "Bank of America", "WFC": "Wells Fargo", "GS": "Goldman Sachs",
        "MS": "Morgan Stanley",
    },
    "Healthcare": {
        "LLY": "Eli Lilly", "UNH": "UnitedHealth", "JNJ": "Johnson & Johnson",
        "ABBV": "AbbVie", "MRK": "Merck", "PFE": "Pfizer", "TMO": "Thermo Fisher",
        "ABT": "Abbott",
    },
    "Industrials": {
        "GE": "GE Aerospace", "CAT": "Caterpillar", "HON": "Honeywell", "UNP": "Union Pacific",
        "RTX": "RTX", "BA": "Boeing", "DE": "Deere",
    },
    "Energy": {"XOM": "ExxonMobil", "CVX": "Chevron", "COP": "ConocoPhillips"},
    "Utilities": {"NEE": "NextEra", "SO": "Southern Co.", "DUK": "Duke Energy"},
    "Real estate": {"PLD": "Prologis", "AMT": "American Tower"},
    "Materials": {"LIN": "Linde"},
}

# AI cluster, grouped by layer of the AI value chain.
AI = {
    "Chips & compute": {
        "NVDA": "Nvidia", "AVGO": "Broadcom", "TSM": "TSMC", "AMD": "AMD",
        "MU": "Micron", "ARM": "Arm", "MRVL": "Marvell", "QCOM": "Qualcomm",
        "INTC": "Intel",
    },
    "Chip equipment": {
        "ASML": "ASML", "AMAT": "Applied Materials", "LRCX": "Lam Research", "KLAC": "KLA",
    },
    "Hyperscalers & models": {
        "MSFT": "Microsoft", "GOOGL": "Alphabet", "AMZN": "Amazon", "META": "Meta",
        "ORCL": "Oracle",
    },
    "Servers, network & neoclouds": {
        "ANET": "Arista", "DELL": "Dell", "SMCI": "Supermicro", "CRWV": "CoreWeave",
        "NBIS": "Nebius",
    },
    "Power & cooling": {
        "GEV": "GE Vernova", "VRT": "Vertiv", "ETN": "Eaton", "CEG": "Constellation",
        "VST": "Vistra",
    },
    "AI software": {
        "PLTR": "Palantir", "NOW": "ServiceNow", "CRM": "Salesforce", "SNOW": "Snowflake",
        "DDOG": "Datadog",
    },
}

# Benchmarks for the comparison chart (prices only, not on the map).
BENCH = {
    "SPY": "S&P 500 (SPY)",
    "QQQ": "Nasdaq 100 (QQQ)",
    "SMH": "Semiconductors (SMH)",
    "RSP": "S&P 500 equal weight (RSP)",
}

START = "2024-12-31"  # covers YTD 2025, full 2026 and a 1-year lookback
OUT = pathlib.Path(__file__).resolve().parent / "site" / "data.js"

# ---- download -------------------------------------------------------------------


def shares_outstanding(ticker):
    try:
        fi = yf.Ticker(ticker).fast_info
        sh = fi.get("shares")
        if not sh:
            mc, px = fi.get("marketCap"), fi.get("lastPrice")
            sh = mc / px if mc and px else None
        return ticker, float(sh) if sh else None
    except Exception as exc:  # network hiccup or delisted ticker
        print(f"  shares failed for {ticker}: {exc}", file=sys.stderr)
        return ticker, None


def main():
    names = {t: n for groups in (MARKET, AI) for members in groups.values() for t, n in members.items()}
    tickers = sorted(set(names) | set(BENCH))
    print(f"Downloading {len(tickers)} tickers from {START} ...")
    px = yf.download(tickers, start=START, interval="1d", auto_adjust=True,
                     progress=False, threads=True)["Close"].dropna(how="all").sort_index()
    missing = {t for t in tickers if t not in px.columns or px[t].isna().all()}
    if missing:
        print("  no prices for:", ", ".join(sorted(missing)), file=sys.stderr)

    print("Fetching shares outstanding ...")
    with cf.ThreadPoolExecutor(max_workers=12) as pool:
        shares = dict(pool.map(shares_outstanding, [t for t in names if t not in missing]))

    def closes(t):
        return [None if math.isnan(v) else round(float(v), 2) for v in px[t]]

    keep = lambda groups: {g: [t for t in m if t not in missing] for g, m in groups.items()}
    data = {
        "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "source": "Yahoo Finance via yfinance (adjusted daily closes)",
        "dates": [d.strftime("%Y-%m-%d") for d in px.index],
        "tickers": {t: {"name": names[t], "shares": shares.get(t), "close": closes(t)}
                    for t in sorted(names) if t not in missing},
        "bench": {t: {"name": n, "close": closes(t)} for t, n in BENCH.items() if t not in missing},
        "universes": {"market": keep(MARKET), "ai": keep(AI)},
    }
    OUT.write_text("window.DASH_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n",
                   encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB), "
          f"{len(data['dates'])} trading days, last {data['dates'][-1]}")


if __name__ == "__main__":
    main()
