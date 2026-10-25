# What Moved NIFTY

3D nebula graph of market shocks with a live counterfactual NIFTY line. Estimates, not proof.

```
npm install
npm run dev                      # http://localhost:3000, works with no database
```

## Data pipeline (local only)

```
python3 -m venv .venv && source .venv/bin/activate && pip install -r scripts/requirements.txt
python scripts/fetch_data.py       # raw series -> data/raw (gitignored)
python scripts/event_study.py      # -> public/data/impacts.json, drivers.json, nifty.json
python scripts/build_graph.py      # -> public/data/graph.json
```

Events live in `scripts/_gen/events_src.py` (run it to regenerate `public/data/events.json`).

## Neo4j (optional)

The site is fully static by default. Neo4j only powers the Explore panel's live queries; without it
the same questions are answered from the static JSON and the panel shows a "static JSON" badge.

Environment variables (same names locally in `.env.local` and on Vercel):

| Variable | Example | Notes |
|---|---|---|
| `NEO4J_URI` | `neo4j+s://xxxxxxxx.databases.neo4j.io` | AuraDB connection URI |
| `NEO4J_USERNAME` | `neo4j` | |
| `NEO4J_PASSWORD` | (from the Aura credentials file) | secret |
| `NEO4J_DATABASE` | `neo4j` | optional, defaults to `neo4j` |

Load the graph (idempotent `MERGE`):

```
python scripts/build_graph.py --neo4j --dry-run   # shows row counts, no connection
python scripts/build_graph.py --neo4j             # loads into the DB named by .env.local
python scripts/build_graph.py --neo4j --reset     # DESTRUCTIVE: deletes Event/Category/Driver/Index nodes first
```

`/api/graph` runs only the fixed read-only presets in `lib/presets.ts`, validates every parameter, uses a
read-only session with a 5 s timeout, and is CDN-cached for an hour. If Neo4j is missing or fails it returns
`{"source":"static"}` and the client falls back.

`FRED_API_KEY` in `.env.example` is currently unused (the FRED CSV endpoint needs no key).

## Range and live data

The published range is 2021-01-01 onward (`START` in `lib/data.ts`, `scripts/event_study.py`, `scripts/build_graph.py`).
`/api/nifty` proxies Yahoo Finance's public chart endpoint (unofficial, no key, 60 s CDN cache); the app merges its
candles onto `public/data/nifty.json` and polls every minute while the tab is visible. Events are not live: add new
ones in `scripts/_gen/events_src.py`, then rerun the pipeline.
