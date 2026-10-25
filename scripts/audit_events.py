"""Audit events.json: source link health + whether the market actually reacted on the stated date.

Usage: .venv/bin/python scripts/audit_events.py   (writes data/raw/audit.json, prints a report)

Link status: 200 ok | 3xx followed | 404/410 dead | 403/429/5xx 'blocked' (many news sites block bots;
unknown, not proof of a bad link) | timeout.
Market check: raw NIFTY move on the first reaction day vs its normal daily volatility, plus the
event-study t-stats already in impacts.json.
"""
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36"}


def check(url: str):
    try:
        r = requests.get(url, headers=UA, timeout=15, stream=True, allow_redirects=True)
        code = r.status_code
        r.close()
        return code
    except requests.Timeout:
        return "timeout"
    except Exception as e:  # noqa: BLE001
        return f"err:{type(e).__name__}"


def main():
    events = json.loads((ROOT / "public/data/events.json").read_text())
    impacts = json.loads((ROOT / "public/data/impacts.json").read_text())
    nifty = pd.read_csv(ROOT / "data/raw/nifty50.csv", index_col=0, parse_dates=True)["Close"]
    ret = np.log(nifty).diff().dropna()

    with ThreadPoolExecutor(12) as ex:
        codes = list(ex.map(check, [e["source_url"] for e in events]))

    rows = []
    for e, code in zip(events, codes):
        imp = impacts.get(e["id"])
        row = {"id": e["id"], "date": e["date"], "title": e["title"], "quality": e["source_quality"],
               "link": code, "url": e["source_url"]}
        if imp:
            t0 = pd.Timestamp(imp["t0"])
            pos = ret.index.searchsorted(t0)
            win = ret.iloc[max(pos - 260, 0):max(pos - 10, 1)]
            sd = float(win.std()) if len(win) > 50 else float("nan")
            raw = float(ret.iloc[pos])
            row.update(raw_1d=raw, raw_z=raw / sd if sd else None, car_1d=imp["car_1d"], car_5d=imp["car_5d"],
                       t5=imp["tstat"], sig5=imp["significant"], cluster=imp["cluster_size"])
        rows.append(row)
    (ROOT / "data/raw/audit.json").write_text(json.dumps(rows, indent=1, default=str))

    def bucket(c):
        if c == 200:
            return "ok"
        if c in (404, 410):
            return "DEAD"
        if c in (403, 429, 401, 451) or (isinstance(c, int) and c >= 500):
            return "blocked"
        return str(c)

    from collections import Counter
    print("link status:", dict(Counter(bucket(r["link"]) for r in rows)))
    print("\nDEAD / odd links:")
    for r in rows:
        if bucket(r["link"]) not in ("ok", "blocked"):
            print(f"  {r['link']}  {r['date']}  {r['title'][:50]}  {r['url']}")
    print("\nNo visible market reaction (|raw z|<1 on reaction day and 5d not significant):")
    for r in rows:
        if r.get("raw_z") is not None and abs(r["raw_z"]) < 1 and not r["sig5"]:
            print(f"  {r['date']} z={r['raw_z']:+.1f} t5={r['t5']:+.1f} cl={r['cluster']} {r['title'][:55]}")
    s5 = sum(1 for r in rows if r.get("sig5"))
    big = sum(1 for r in rows if r.get("raw_z") is not None and abs(r["raw_z"]) >= 2)
    print(f"\nsignificant 5d CAR: {s5}/{len(rows)}; |raw 1d move| >= 2 sigma: {big}/{len(rows)}")


if __name__ == "__main__":
    main()
