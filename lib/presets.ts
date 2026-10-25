import type { Category } from "./types";
import { CATEGORY_KEYS } from "./categories";

export type PresetId = "topByCategory" | "path" | "brentDown" | "driverByYear" | "categorySubgraph";

export interface PresetDef {
  id: PresetId;
  label: string;
  /** which parameters the UI must collect */
  params: ("category" | "from" | "to")[];
  /** read-only Cypher; only these run, never user-supplied text */
  cypher: string;
}

export const PRESETS: Record<PresetId, PresetDef> = {
  topByCategory: {
    id: "topByCategory",
    label: "Top 10 events by |CAR| in a category",
    params: ["category"],
    cypher: `
      MATCH (e:Event)-[:IN_CATEGORY]->(:Category {name: $category})
      RETURN e.id AS id, e.title AS title, e.date AS date, e.car_5d AS car, e.significant AS significant
      ORDER BY abs(e.car_5d) DESC LIMIT 10`,
  },
  path: {
    id: "path",
    label: "Shortest path between two events",
    params: ["from", "to"],
    cypher: `
      MATCH (a:Event {id: $from}), (b:Event {id: $to})
      MATCH p = shortestPath((a)-[:SAME_CHANNEL|CO_MOVED|PRECEDED*..6]-(b))
      RETURN [n IN nodes(p) | {id: n.id, title: n.title, date: n.date}] AS path`,
  },
  brentDown: {
    id: "brentDown",
    label: "Events that moved Brent >5% and hit NIFTY by more than -2%",
    params: [],
    cypher: `
      MATCH (e:Event)-[m:MOVED]->(:Driver {name: 'Brent'})
      WHERE abs(m.delta_pct) > 0.05 AND e.car_5d < -0.02
      RETURN e.id AS id, e.title AS title, e.date AS date, e.car_5d AS car, m.delta_pct AS brent
      ORDER BY e.car_5d`,
  },
  driverByYear: {
    id: "driverByYear",
    label: "Which driver correlates most with NIFTY each year",
    params: [],
    cypher: `
      UNWIND range(2018, 2026) AS y
      MATCH (d:Driver)-[r:CORRELATED_WITH]->(:Index {name: 'NIFTY50'})
      WITH y, d, r['rho_' + toString(y)] AS rho
      WHERE rho IS NOT NULL
      WITH y, d, rho ORDER BY y, abs(rho) DESC
      WITH y, collect({driver: d.name, rho: rho})[0] AS top
      RETURN y AS year, top.driver AS driver, top.rho AS rho ORDER BY year`,
  },
  categorySubgraph: {
    id: "categorySubgraph",
    label: "Event subgraph for a category",
    params: ["category"],
    cypher: `
      MATCH (a:Event)-[:IN_CATEGORY]->(:Category {name: $category})
      OPTIONAL MATCH (a)-[r:SAME_CHANNEL|CO_MOVED|PRECEDED]-(b:Event)-[:IN_CATEGORY]->(:Category {name: $category})
      WITH a, collect(DISTINCT {other: b.id, type: type(r)}) AS rels
      RETURN a.id AS id, a.title AS title, a.date AS date,
             [x IN rels WHERE x.other IS NOT NULL] AS links
      ORDER BY a.date`,
  },
};

const ID = /^[a-z0-9-]{3,90}$/;

/** Returns sanitised params, or null when the request is invalid. */
export function cleanParams(p: PresetDef, q: URLSearchParams): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const k of p.params) {
    const v = q.get(k) ?? "";
    if (k === "category" ? !CATEGORY_KEYS.includes(v as Category) : !ID.test(v)) return null;
    out[k] = v;
  }
  return out;
}
