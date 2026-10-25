"""Build public/data/graph.json from events.json, impacts.json and raw driver series.

Always writes graph.json. Neo4j loading is opt-in:
  --neo4j --dry-run   show what would be loaded, no connection
  --neo4j             MERGE the graph into the database named by NEO4J_* env vars (.env.local)
  --neo4j --reset     delete the schema labels first (destructive)

Edges
  IMPACTED         event -> NIFTY        weight |CAR[-1,+5]|
  MOVED            event -> driver       driver moved materially over the event window
  CORRELATED_WITH  driver -> NIFTY       average rolling 60d correlation
  SAME_CHANNEL     event -- event        >=2 shared expected channels (Jaccard weight), top-3 per node
  CO_MOVED         event -- event        cosine similarity of sector-CAR vectors > 0.6, top-3 per node,
                                         never inside one confounded cluster (identical by construction)
  PRECEDED         event -> event        same category, 0 < gap <= 30 days
"""
import argparse
import json
import sys
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"
SECTORS = ["it", "bank", "auto", "fmcg", "metal", "pharma", "realty", "psubank"]
CAP = 3

DRIVERS = {
    "brent": ("Brent crude", "pct", 0.05),
    "usdinr": ("USD/INR", "pct", 0.01),
    "us10y": ("US 10Y yield", "pp", 0.15),  # percentage points
    "india_vix": ("India VIX", "pct", 0.20),
    "sox": ("SOX (semis)", "pct", 0.05),
}


def series(name: str) -> pd.Series:
    if name == "us10y":
        s = pd.read_csv(RAW / "us10y.csv", index_col=0, parse_dates=True).iloc[:, 0]
        return pd.to_numeric(s, errors="coerce").dropna()
    return pd.read_csv(RAW / f"{name}.csv", index_col=0, parse_dates=True)["Close"].astype(float).dropna()


def cap_top(edges: list[dict], k: int) -> list[dict]:
    """Keep an edge only if it is within the top-k of either endpoint."""
    by_node: dict[str, list[dict]] = {}
    for e in edges:
        by_node.setdefault(e["source"], []).append(e)
        by_node.setdefault(e["target"], []).append(e)
    keep = set()
    for lst in by_node.values():
        for e in sorted(lst, key=lambda e: -e["weight"])[:k]:
            keep.add(id(e))
    return [e for e in edges if id(e) in keep]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--neo4j", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--reset", action="store_true")
    args = ap.parse_args()
    events = json.loads((OUT / "events.json").read_text())
    impacts = json.loads((OUT / "impacts.json").read_text())
    drivers_stat = json.loads((OUT / "drivers.json").read_text())
    nifty_idx = pd.DatetimeIndex(pd.read_csv(RAW / "nifty50.csv", index_col=0, parse_dates=True).index)

    ev = [e for e in events if e["id"] in impacts]
    nodes = [{"id": "NIFTY", "kind": "index", "label": "NIFTY 50"}]
    for k, (label, _, _) in DRIVERS.items():
        nodes.append({"id": f"driver:{k}", "kind": "driver", "label": label})
    for e in ev:
        nodes.append({"id": e["id"], "kind": "event", "label": e["title"], "category": e["category"],
                      "date": e["date"]})

    links: list[dict] = []
    for e in ev:
        links.append({"source": e["id"], "target": "NIFTY", "type": "IMPACTED",
                      "weight": round(abs(impacts[e["id"]]["car_5d"]), 4)})

    # MOVED: driver change over [t0-1, t0+5]
    lv = {k: series(k) for k in DRIVERS}
    for e in ev:
        t0 = pd.Timestamp(impacts[e["id"]]["t0"])
        pos = nifty_idx.searchsorted(t0)
        lo = nifty_idx[max(pos - 1, 0)]
        hi = nifty_idx[min(pos + 5, len(nifty_idx) - 1)]
        for k, (_, unit, thr) in DRIVERS.items():
            s = lv[k]
            a, b = s.asof(lo), s.asof(hi)
            if pd.isna(a) or pd.isna(b) or a == 0:
                continue
            delta = (b - a) if unit == "pp" else (b / a - 1)
            if abs(delta) >= thr:
                links.append({"source": e["id"], "target": f"driver:{k}", "type": "MOVED",
                              "weight": round(min(abs(delta) / (thr * 4), 1.0), 3),
                              "delta": round(float(delta), 4), "unit": unit})

    for k, st in drivers_stat.items():
        if k in DRIVERS:
            links.append({"source": f"driver:{k}", "target": "NIFTY", "type": "CORRELATED_WITH",
                          "weight": round(abs(st["rho_60d_avg"]), 3), "rho": round(st["rho_60d_avg"], 3)})

    # SAME_CHANNEL
    sc = []
    for a, b in combinations(ev, 2):
        sa, sb = set(a["expected_channel"]), set(b["expected_channel"])
        inter = sa & sb
        if len(inter) >= 2:
            sc.append({"source": a["id"], "target": b["id"], "type": "SAME_CHANNEL",
                       "weight": round(len(inter) / len(sa | sb), 3), "channels": sorted(inter)})
    links += cap_top(sc, CAP)

    # CO_MOVED
    vec = {e["id"]: np.array([impacts[e["id"]]["sectors"].get(s, {}).get("car", 0.0) for s in SECTORS]) for e in ev}
    cl = {e["id"]: tuple(sorted([e["id"], *impacts[e["id"]]["confounded_with"]])) for e in ev}
    cm = []
    for a, b in combinations(ev, 2):
        if cl[a["id"]] == cl[b["id"]]:
            continue
        va, vb = vec[a["id"]], vec[b["id"]]
        na, nb = np.linalg.norm(va), np.linalg.norm(vb)
        if na < 1e-3 or nb < 1e-3:
            continue
        cos = float(va @ vb / (na * nb))
        if cos > 0.6:
            cm.append({"source": a["id"], "target": b["id"], "type": "CO_MOVED", "weight": round(cos, 3)})
    links += cap_top(cm, CAP)

    # PRECEDED
    for a, b in combinations(sorted(ev, key=lambda e: e["date"]), 2):
        if a["category"] != b["category"]:
            continue
        days = (pd.Timestamp(b["date"]) - pd.Timestamp(a["date"])).days
        if 0 < days <= 30:
            links.append({"source": a["id"], "target": b["id"], "type": "PRECEDED",
                          "weight": round(1 - days / 30, 3), "days": days})

    graph = {"nodes": nodes, "links": links,
             "meta": {"events": len(ev), "built": pd.Timestamp.today().strftime("%Y-%m-%d")}}
    (OUT / "graph.json").write_text(json.dumps(graph, separators=(",", ":")))
    counts = pd.Series([l["type"] for l in links]).value_counts().to_dict()
    print(f"nodes={len(nodes)} links={len(links)} {counts}")

    if args.neo4j:
        sys.path.insert(0, str(ROOT / "scripts"))
        import neo4j_load

        neo4j_load.run(events, impacts, graph, drivers_stat, dry_run=args.dry_run, reset=args.reset)


if __name__ == "__main__":
    main()
