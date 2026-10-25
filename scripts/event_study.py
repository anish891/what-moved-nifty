"""Event study: market model, CARs, CIs, clusters, driver correlations.

Reads  data/raw/*.csv, scripts/patches.json, public/data/events.json
Writes public/data/impacts.json, drivers.json, nifty.json

Method (see /methodology):
  1. Market model: Nifty log-return on EM benchmark (EEM in INR) log-returns, same-day and
     one-day-lagged (non-synchronous trading), OLS over 250 trading days ending 10 days
     before the event.
  2. AR = actual - predicted; CAR over [-1,+5], [-1,+20], [0,+60] (log, reported as simple %).
  3. t-stat and 95% CI from the estimation-window residual sigma; |t| < 1.96 => not significant.
  4. Events within 5 trading days chain into a confounded cluster; the cluster CAR over the
     union window is split equally between members (disclosed rule, no double counting).
  5. Same model per sector index.
  6. Rolling 60d correlations of Nifty with drivers.

Limitations: EEM contains ~15% India so it absorbs part of India-specific shocks (CARs lean
conservative); estimation windows are not purged of earlier events.
"""
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"
EST_LEN, EST_GAP = 250, 10
START = "2021-01-01"  # published range; earlier data is still used for estimation windows
WINDOWS = {"1d": (0, 0), "5d": (-1, 5), "20d": (-1, 20), "60d": (0, 60)}
SECTOR_T = 2.73  # |t| bar for one of 8 sector tests (Bonferroni at 5%)
INDEX_T1 = 2.24  # |t| bar for the 1-day index test (two windows tested)
SECTORS = ["nifty_it", "nifty_bank", "nifty_auto", "nifty_fmcg", "nifty_metal",
           "nifty_pharma", "nifty_realty", "nifty_psubank"]
CLUSTER_GAP = 5  # trading days


def load(name: str, col: str = "Close") -> pd.Series:
    df = pd.read_csv(RAW / f"{name}.csv", index_col=0, parse_dates=True)
    return df[col].astype(float).dropna()


def build_market():
    patches = json.loads((ROOT / "scripts" / "patches.json").read_text())
    nifty = load("nifty50")
    for d, p in patches["nifty_close"].items():
        nifty.loc[pd.Timestamp(d)] = p["close"]
    nifty = nifty.sort_index()

    usdinr = load("usdinr")
    eem = load("eem")
    eem_inr = eem * usdinr.reindex(eem.index, method="ffill")
    em = np.log(eem_inr).diff().dropna()  # indexed by US date
    ret = np.log(nifty).diff().dropna()
    X = pd.DataFrame(index=ret.index)
    # same-date EEM return (contains Asia's session) and previous-US-date return
    X["em0"] = em.reindex(ret.index)
    prev = [em.index[em.index < d][-1] if (em.index < d).any() else pd.NaT for d in ret.index]
    X["em1"] = [em.loc[p] if pd.notna(p) else np.nan for p in prev]
    X = X.fillna(0.0)
    return nifty, ret, X, patches


def fit(y: pd.Series, X: pd.DataFrame, t0_pos: int):
    end = t0_pos - EST_GAP
    start = end - EST_LEN
    if start < 0:
        return None
    yy, xx = y.iloc[start:end], X.iloc[start:end]
    ok = yy.notna()
    yy, xx = yy[ok], xx[ok]
    if len(yy) < 150:
        return None
    A = np.column_stack([np.ones(len(xx)), xx.values])
    beta, *_ = np.linalg.lstsq(A, yy.values, rcond=None)
    resid = yy.values - A @ beta
    sigma = resid.std(ddof=A.shape[1])
    return beta, sigma


def abnormal(y, X, beta):
    A = np.column_stack([np.ones(len(X)), X.values])
    return y - A @ beta


def car_window(ar: pd.Series, s: int, e: int, sigma: float, pos: int, partial_ok=False, tol=0):
    lo, hi = pos + s, pos + e
    if lo < 0:
        return None
    seg = ar.iloc[lo:hi + 1].dropna()
    full = hi - lo + 1
    if len(seg) < full - tol and not partial_ok:
        return None
    L = len(seg)
    if L == 0:
        return None
    car = seg.sum()
    half = 1.96 * sigma * np.sqrt(L)
    return car, car - half, car + half, car / (sigma * np.sqrt(L)), L


def simple(x):
    return float(np.expm1(x))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    nifty, ret, X, patches = build_market()
    idx = ret.index
    events = json.loads((OUT / "events.json").read_text())
    excl = patches["exclude_events"]
    ctx = {e["id"]: e.get("kind") == "context" for e in events}

    sector_ret = {s: np.log(load(s)).diff().reindex(idx) for s in SECTORS}

    # locate event day t0 = first trading day >= market_date or date
    rows = []
    for e in events:
        if e["id"] in excl:
            continue
        d = pd.Timestamp(e.get("market_date") or e["date"])
        pos = idx.searchsorted(d)
        if pos >= len(idx):
            continue
        rows.append({"id": e["id"], "pos": int(pos), "t0": idx[pos]})
    ev = pd.DataFrame(rows).sort_values("pos").reset_index(drop=True)

    # clusters: chain events with trading-day gap <= CLUSTER_GAP
    cluster = []
    c = 0
    for i, r in ev.iterrows():
        if i > 0 and r.pos - ev.pos[i - 1] > CLUSTER_GAP:
            c += 1
        cluster.append(c)
    ev["cluster"] = cluster

    impacts = {}
    for cid, g in ev.groupby("cluster"):
        n = len(g)
        first, last = int(g.pos.min()), int(g.pos.max())
        series = {"nifty": ret} | {s: sector_ret[s] for s in SECTORS}
        res = {}
        for name, y in series.items():
            m = fit(y, X, first)
            if m is None:
                continue
            beta, sigma = m
            ar = abnormal(y, X, beta)
            out = {}
            for k, (s, e_) in WINDOWS.items():
                # union window across cluster members
                lo_off, hi_off = s, e_
                w = car_window(ar, lo_off, hi_off + (last - first), sigma, first, tol=0 if name == "nifty" else 2)
                if w is None and k == "60d":
                    w = car_window(ar, lo_off, hi_off + (last - first), sigma, first, partial_ok=True)
                    if w is not None:
                        w = w + ("partial",)
                out[k] = w
            out["_ar"], out["_sigma"] = ar, sigma
            res[name] = out
        for _, r in g.iterrows():
            nf = res.get("nifty")
            if not nf or not nf["5d"]:
                continue

            def pack(w):
                if w is None:
                    return None
                car, lo, hi, t, L = w[:5]
                return {"car": simple(car / n), "ci_low": simple(lo / n), "ci_high": simple(hi / n),
                        "tstat": float(t), "days": int(L), "partial": len(w) > 5}

            def own_day(name):
                """1-day AR on this event's own reaction day (not split across a cluster)."""
                o = res.get(name)
                return car_window(o["_ar"], 0, 0, o["_sigma"], int(r.pos), tol=1) if o else None

            w1 = own_day("nifty")
            p1 = None
            if w1:
                p1 = {"car": simple(w1[0]), "ci_low": simple(w1[1]), "ci_high": simple(w1[2]), "tstat": float(w1[3])}
            p5, p20, p60 = pack(nf["5d"]), pack(nf["20d"]), pack(nf["60d"])
            sectors = {}
            sector_moving = []
            for s in SECTORS:
                sw = res.get(s, {}).get("5d")
                if sw:
                    car, lo, hi, t, L = sw[:5]
                    key = s.replace("nifty_", "")
                    d1 = own_day(s)
                    sectors[key] = {"car": simple(car / n), "ci_low": simple(lo / n), "ci_high": simple(hi / n),
                                    "t": float(t), "car_1d": simple(d1[0]) if d1 else None,
                                    "t_1d": float(d1[3]) if d1 else None}
                    if abs(t) >= SECTOR_T or (d1 and abs(d1[3]) >= SECTOR_T):
                        sector_moving.append(key)
            impacts[r["id"]] = {
                "id": r["id"],
                "t0": str(r.t0.date()),
                "car_1d": p1["car"] if p1 else None, "car_5d": p5["car"], "car_20d": p20["car"] if p20 else None,
                "car_60d": p60["car"] if p60 else None,
                "tstat_1d": p1["tstat"] if p1 else None,
                "significant_1d": bool(p1 and abs(p1["tstat"]) >= INDEX_T1),
                "sector_moving": sector_moving,
                "market_moving": bool(abs(p5["tstat"]) >= 1.96 or (p1 and abs(p1["tstat"]) >= INDEX_T1) or sector_moving),
                "context": bool(ctx.get(r["id"])),
                "ci_low": p5["ci_low"], "ci_high": p5["ci_high"],
                "tstat": p5["tstat"],
                "significant": bool(abs(p5["tstat"]) >= 1.96),
                "cluster_size": n,
                "confounded_with": [x for x in g.id if x != r["id"]],
                "car_60d_partial": bool(p60["partial"]) if p60 else False,
                "sectors": sectors,
            }
    # drop events lacking estimates
    (OUT / "impacts.json").write_text(json.dumps(impacts, indent=1))

    # nifty.json (2020-01-01 on)
    nf = nifty[START:]
    (OUT / "nifty.json").write_text(json.dumps([{"d": str(d.date()), "c": round(float(v), 2)} for d, v in nf.items()]))

    # drivers: rolling 60d correlation of Nifty returns with each driver
    us10 = pd.read_csv(RAW / "us10y.csv", index_col=0, parse_dates=True).iloc[:, 0]
    us10 = pd.to_numeric(us10, errors="coerce").dropna()
    # align levels to Indian trading days (ffill over foreign holidays), then difference
    lvl = {"brent": np.log(load("brent")), "usdinr": np.log(load("usdinr")), "us10y": us10,
           "india_vix": np.log(load("india_vix")), "sox": np.log(load("sox"))}
    drv = {k: v.reindex(v.index.union(idx)).ffill().reindex(idx).diff() for k, v in lvl.items()}
    d_out = {}
    for name, s in drv.items():
        roll = ret.rolling(60).corr(s)[START:]
        yr = roll.groupby(roll.index.year).mean()
        d_out[name] = {"rho_60d_avg": float(roll.mean()),
                       "by_year": {str(k): round(float(v), 3) for k, v in yr.items() if pd.notna(v)},
                       "latest": float(roll.dropna().iloc[-1])}
    (OUT / "drivers.json").write_text(json.dumps(d_out, indent=1))
    print(f"impacts: {len(impacts)} events; excluded: {list(excl)}")


if __name__ == "__main__":
    main()
