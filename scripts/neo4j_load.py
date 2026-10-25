"""Load the event graph into Neo4j. Idempotent (MERGE); opt-in only.

Called from build_graph.py:  python scripts/build_graph.py --neo4j [--dry-run] [--reset]

Reads NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD / NEO4J_DATABASE from the environment or .env.local.
Never run this against a database you have not chosen deliberately: --reset deletes every node in the
schema's labels (Event, Category, Driver, Index) before loading.

Schema
  (:Event {id, title, date, category, car_1d, car_5d, car_20d, ci_low, ci_high, tstat, significant, source_url})
  (:Category {name, color})  (:Driver {name})  (:Index {name})
  (:Event)-[:IN_CATEGORY]->(:Category)
  (:Event)-[:IMPACTED {car, ci_low, ci_high}]->(:Index)
  (:Event)-[:MOVED {delta_pct, unit}]->(:Driver)
  (:Driver)-[:CORRELATED_WITH {rho_60d_avg, rho_<year>...}]->(:Index)
  (:Event)-[:SAME_CHANNEL {weight}]->(:Event)  (:Event)-[:CO_MOVED {similarity}]->(:Event)
  (:Event)-[:PRECEDED {days}]->(:Event)
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

DRIVER_NAMES = {"brent": "Brent", "usdinr": "USDINR", "us10y": "US10Y", "india_vix": "VIX", "sox": "SOX"}
CATEGORY_COLORS = {
    "govt_tax": "#f97316", "govt_regulation": "#fb7185", "govt_trade": "#facc15", "govt_fiscal": "#a3e635",
    "rbi_monetary": "#34d399", "global_rates": "#22d3ee", "global_trade": "#60a5fa", "geopolitics": "#c084fc",
    "commodities": "#d97706", "ai_rotation": "#e879f9", "corporate_shock": "#f472b6", "flows": "#94a3b8",
}
INDEX_NAMES = {"nifty": "NIFTY50", "it": "NIFTY_IT", "bank": "NIFTY_BANK", "auto": "NIFTY_AUTO",
               "fmcg": "NIFTY_FMCG", "metal": "NIFTY_METAL", "pharma": "NIFTY_PHARMA",
               "realty": "NIFTY_REALTY", "psubank": "NIFTY_PSUBANK"}
BATCH = 500

CONSTRAINTS = [
    "CREATE CONSTRAINT event_id IF NOT EXISTS FOR (e:Event) REQUIRE e.id IS UNIQUE",
    "CREATE CONSTRAINT category_name IF NOT EXISTS FOR (c:Category) REQUIRE c.name IS UNIQUE",
    "CREATE CONSTRAINT driver_name IF NOT EXISTS FOR (d:Driver) REQUIRE d.name IS UNIQUE",
    "CREATE CONSTRAINT index_name IF NOT EXISTS FOR (i:Index) REQUIRE i.name IS UNIQUE",
]


def build_payload(events, impacts, graph, drivers_stat):
    ev_by_id = {e["id"]: e for e in events}
    rows, impacted, in_cat = [], [], []
    for eid, imp in impacts.items():
        e = ev_by_id[eid]
        rows.append({"id": eid, "title": e["title"], "date": e["date"], "category": e["category"],
                     "car_1d": imp["car_1d"], "car_5d": imp["car_5d"], "car_20d": imp["car_20d"],
                     "ci_low": imp["ci_low"], "ci_high": imp["ci_high"], "tstat": imp["tstat"],
                     "significant": imp["significant"], "source_url": e["source_url"]})
        in_cat.append({"id": eid, "category": e["category"]})
        impacted.append({"id": eid, "index": INDEX_NAMES["nifty"], "car": imp["car_5d"],
                         "ci_low": imp["ci_low"], "ci_high": imp["ci_high"]})
        for s, v in imp["sectors"].items():
            if s in INDEX_NAMES:
                impacted.append({"id": eid, "index": INDEX_NAMES[s], "car": v["car"],
                                 "ci_low": v["ci_low"], "ci_high": v["ci_high"]})
    moved, same, comoved, preceded = [], [], [], []
    for l in graph["links"]:
        t = l["type"]
        if t == "MOVED":
            moved.append({"id": l["source"], "driver": DRIVER_NAMES[l["target"].split(":")[1]],
                          "delta_pct": l["delta"], "unit": l["unit"]})
        elif t == "SAME_CHANNEL":
            same.append({"a": l["source"], "b": l["target"], "weight": l["weight"]})
        elif t == "CO_MOVED":
            comoved.append({"a": l["source"], "b": l["target"], "similarity": l["weight"]})
        elif t == "PRECEDED":
            preceded.append({"a": l["source"], "b": l["target"], "days": l["days"]})
    corr = []
    for k, st in drivers_stat.items():
        if k in DRIVER_NAMES:
            props = {"rho_60d_avg": st["rho_60d_avg"]}
            props.update({f"rho_{y}": v for y, v in st["by_year"].items()})
            corr.append({"driver": DRIVER_NAMES[k], "props": props})
    return {
        "categories": [{"name": n, "color": c} for n, c in CATEGORY_COLORS.items()],
        "indexes": [{"name": n} for n in INDEX_NAMES.values()],
        "drivers": [{"name": n} for n in DRIVER_NAMES.values()],
        "events": rows, "in_cat": in_cat, "impacted": impacted, "moved": moved,
        "same": same, "comoved": comoved, "preceded": preceded, "corr": corr,
    }


STATEMENTS = [
    ("categories", "UNWIND $rows AS r MERGE (c:Category {name: r.name}) SET c.color = r.color", "categories"),
    ("indexes", "UNWIND $rows AS r MERGE (:Index {name: r.name})", "indexes"),
    ("drivers", "UNWIND $rows AS r MERGE (:Driver {name: r.name})", "drivers"),
    ("events", "UNWIND $rows AS r MERGE (e:Event {id: r.id}) SET e += r", "events"),
    ("in_category", "UNWIND $rows AS r MATCH (e:Event {id: r.id}), (c:Category {name: r.category}) "
                    "MERGE (e)-[:IN_CATEGORY]->(c)", "in_cat"),
    ("impacted", "UNWIND $rows AS r MATCH (e:Event {id: r.id}), (i:Index {name: r.index}) "
                 "MERGE (e)-[x:IMPACTED]->(i) SET x.car = r.car, x.ci_low = r.ci_low, x.ci_high = r.ci_high", "impacted"),
    ("moved", "UNWIND $rows AS r MATCH (e:Event {id: r.id}), (d:Driver {name: r.driver}) "
              "MERGE (e)-[x:MOVED]->(d) SET x.delta_pct = r.delta_pct, x.unit = r.unit", "moved"),
    ("correlated_with", "UNWIND $rows AS r MATCH (d:Driver {name: r.driver}), (i:Index {name: 'NIFTY50'}) "
                        "MERGE (d)-[x:CORRELATED_WITH]->(i) SET x += r.props", "corr"),
    ("same_channel", "UNWIND $rows AS r MATCH (a:Event {id: r.a}), (b:Event {id: r.b}) "
                     "MERGE (a)-[x:SAME_CHANNEL]->(b) SET x.weight = r.weight", "same"),
    ("co_moved", "UNWIND $rows AS r MATCH (a:Event {id: r.a}), (b:Event {id: r.b}) "
                 "MERGE (a)-[x:CO_MOVED]->(b) SET x.similarity = r.similarity", "comoved"),
    ("preceded", "UNWIND $rows AS r MATCH (a:Event {id: r.a}), (b:Event {id: r.b}) "
                 "MERGE (a)-[x:PRECEDED]->(b) SET x.days = r.days", "preceded"),
]

RESET = "MATCH (n) WHERE n:Event OR n:Category OR n:Driver OR n:Index DETACH DELETE n"


def run(events, impacts, graph, drivers_stat, dry_run=False, reset=False):
    payload = build_payload(events, impacts, graph, drivers_stat)
    summary = {name: len(payload[key]) for name, _, key in STATEMENTS}
    if dry_run:
        print("DRY RUN (no connection made). Rows per statement:")
        for k, v in summary.items():
            print(f"  {k:16} {v}")
        return

    try:
        from dotenv import load_dotenv
        from neo4j import GraphDatabase
    except ImportError as e:  # pragma: no cover
        raise SystemExit(f"Missing dependency: {e}. Run: pip install -r scripts/requirements.txt")

    load_dotenv(ROOT / ".env.local")
    uri, user, pw = (os.environ.get(k) for k in ("NEO4J_URI", "NEO4J_USERNAME", "NEO4J_PASSWORD"))
    db = os.environ.get("NEO4J_DATABASE", "neo4j")
    if not (uri and user and pw):
        raise SystemExit("Set NEO4J_URI, NEO4J_USERNAME and NEO4J_PASSWORD in .env.local first.")

    host = uri.split("@")[-1]
    print(f"Loading into {host} (database '{db}'){' with --reset' if reset else ''}")
    with GraphDatabase.driver(uri, auth=(user, pw)) as driver:
        driver.verify_connectivity()
        with driver.session(database=db) as s:
            for c in CONSTRAINTS:
                s.run(c)
            if reset:
                s.run(RESET)
            for name, cypher, key in STATEMENTS:
                rows = payload[key]
                for i in range(0, len(rows), BATCH):
                    chunk = rows[i:i + BATCH]
                    s.execute_write(lambda tx, q=cypher, ch=chunk: tx.run(q, rows=ch).consume())
                print(f"  {name:16} {len(rows)}")
    print("Done.")
