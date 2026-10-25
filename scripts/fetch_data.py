"""Download raw series into data/raw (gitignored). Run locally, never on Vercel.

Usage: .venv/bin/python scripts/fetch_data.py
"""
from io import StringIO
from pathlib import Path

import requests
import yfinance as yf

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"

YAHOO = {
    "nifty50": "^NSEI",
    "nifty_it": "^CNXIT",
    "nifty_bank": "^NSEBANK",
    "nifty_auto": "^CNXAUTO",
    "nifty_fmcg": "^CNXFMCG",
    "nifty_metal": "^CNXMETAL",
    "nifty_pharma": "^CNXPHARMA",
    "nifty_realty": "^CNXREALTY",
    "nifty_psubank": "^CNXPSUBANK",
    "brent": "BZ=F",
    "usdinr": "INR=X",
    "india_vix": "^INDIAVIX",
    "eem": "EEM",
    "spx": "^GSPC",
    "nasdaq": "^IXIC",
    "sox": "^SOX",
    "taiex": "^TWII",
    "kospi": "^KS11",
}

# TODO: NSDL FPI monthly flows and DII flows have no stable download URL; add by hand-curated CSV.


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for name, ticker in YAHOO.items():
        df = yf.download(ticker, start="2018-10-01", auto_adjust=True, progress=False)
        if df.empty:
            print(f"{name} ({ticker}): NO DATA")
            continue
        df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
        df.to_csv(RAW / f"{name}.csv")
        print(f"{name} ({ticker}): {len(df)} rows, {df.index[0].date()} -> {df.index[-1].date()}")

    r = requests.get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10", timeout=30)
    r.raise_for_status()
    (RAW / "us10y.csv").write_text(r.text)
    print("us10y (FRED DGS10):", len(StringIO(r.text).readlines()) - 1, "rows")


if __name__ == "__main__":
    main()
