import type { AppData } from "./types";
import { PRESETS, type PresetId } from "./presets";

export interface EventRow {
  id: string;
  title: string;
  date: string;
  value?: number; // CAR as a fraction
  note?: string;
}
export type ExploreResult =
  | { kind: "events"; rows: EventRow[] }
  | { kind: "path"; path: EventRow[] | null }
  | { kind: "years"; rows: { year: number; driver: string; rho: number }[] };

export interface ExploreAnswer {
  source: "neo4j" | "static";
  result: ExploreResult;
}

type Params = Record<string, string>;

const DRIVER_LABEL: Record<string, string> = {
  brent: "Brent",
  usdinr: "USDINR",
  us10y: "US10Y",
  india_vix: "VIX",
  sox: "SOX",
};

/** The same questions the Cypher presets answer, computed from the static JSON. */
export function staticAnswer(id: PresetId, p: Params, data: AppData): ExploreResult {
  const ev = new Map(data.events.map((e) => [e.id, e]));
  const row = (eid: string, extra: Partial<EventRow> = {}): EventRow => ({
    id: eid,
    title: ev.get(eid)?.title ?? eid,
    date: ev.get(eid)?.date ?? "",
    ...extra,
  });
  const inCat = (c: string) => data.events.filter((e) => e.category === c && data.impacts[e.id]);

  switch (id) {
    case "topByCategory":
      return {
        kind: "events",
        rows: inCat(p.category)
          .sort((a, b) => Math.abs(data.impacts[b.id].car_5d) - Math.abs(data.impacts[a.id].car_5d))
          .slice(0, 10)
          .map((e) => row(e.id, { value: data.impacts[e.id].car_5d })),
      };
    case "brentDown":
      return {
        kind: "events",
        rows: data.graph.links
          .filter((l) => l.type === "MOVED" && l.target === "driver:brent")
          .filter((l) => Math.abs(l.delta ?? 0) > 0.05 && (data.impacts[l.source]?.car_5d ?? 0) < -0.02)
          .sort((a, b) => data.impacts[a.source].car_5d - data.impacts[b.source].car_5d)
          .map((l) => row(l.source, { value: data.impacts[l.source].car_5d, note: `Brent ${((l.delta ?? 0) * 100).toFixed(1)}%` })),
      };
    case "driverByYear": {
      const years = new Set<string>();
      Object.values(data.drivers).forEach((d) => Object.keys(d.by_year).forEach((y) => years.add(y)));
      const rows = [...years]
        .sort()
        .map((y) => {
          const best = Object.entries(data.drivers)
            .filter(([, d]) => d.by_year[y] != null)
            .sort((a, b) => Math.abs(b[1].by_year[y]) - Math.abs(a[1].by_year[y]))[0];
          return best ? { year: +y, driver: DRIVER_LABEL[best[0]] ?? best[0], rho: best[1].by_year[y] } : null;
        })
        .filter((r): r is { year: number; driver: string; rho: number } => r !== null);
      return { kind: "years", rows };
    }
    case "categorySubgraph": {
      const ids = new Set(inCat(p.category).map((e) => e.id));
      const n = new Map<string, number>();
      data.graph.links.forEach((l) => {
        if (["SAME_CHANNEL", "CO_MOVED", "PRECEDED"].includes(l.type) && ids.has(l.source) && ids.has(l.target)) {
          n.set(l.source, (n.get(l.source) ?? 0) + 1);
          n.set(l.target, (n.get(l.target) ?? 0) + 1);
        }
      });
      return {
        kind: "events",
        rows: [...ids]
          .sort((a, b) => (ev.get(a)!.date < ev.get(b)!.date ? -1 : 1))
          .map((i) => row(i, { value: data.impacts[i].car_5d, note: `${n.get(i) ?? 0} links in category` })),
      };
    }
    case "path": {
      const adj = new Map<string, string[]>();
      data.graph.links
        .filter((l) => ["SAME_CHANNEL", "CO_MOVED", "PRECEDED"].includes(l.type))
        .forEach((l) => {
          (adj.get(l.source) ?? adj.set(l.source, []).get(l.source)!).push(l.target);
          (adj.get(l.target) ?? adj.set(l.target, []).get(l.target)!).push(l.source);
        });
      const prev = new Map<string, string | null>([[p.from, null]]);
      let frontier = [p.from];
      for (let depth = 0; depth < 6 && !prev.has(p.to); depth++) {
        const next: string[] = [];
        for (const u of frontier)
          for (const v of adj.get(u) ?? []) if (!prev.has(v)) (prev.set(v, u), next.push(v));
        frontier = next;
      }
      if (!prev.has(p.to)) return { kind: "path", path: null };
      const out: string[] = [];
      for (let c: string | null = p.to; c; c = prev.get(c) ?? null) out.unshift(c);
      return { kind: "path", path: out.map((i) => row(i)) };
    }
  }
}

/** Normalise Neo4j rows to the same result type. */
function fromRows(id: PresetId, rows: Record<string, unknown>[]): ExploreResult {
  const r = (x: Record<string, unknown>): EventRow => ({
    id: String(x.id),
    title: String(x.title),
    date: String(x.date),
    value: typeof x.car === "number" ? x.car : undefined,
  });
  switch (id) {
    case "driverByYear":
      return { kind: "years", rows: rows.map((x) => ({ year: Number(x.year), driver: String(x.driver), rho: Number(x.rho) })) };
    case "path": {
      const p = rows[0]?.path as Record<string, unknown>[] | undefined;
      return { kind: "path", path: p ? p.map(r) : null };
    }
    case "brentDown":
      return { kind: "events", rows: rows.map((x) => ({ ...r(x), note: `Brent ${(Number(x.brent) * 100).toFixed(1)}%` })) };
    case "categorySubgraph":
      return { kind: "events", rows: rows.map((x) => ({ ...r(x), note: `${(x.links as unknown[]).length} links in category` })) };
    default:
      return { kind: "events", rows: rows.map(r) };
  }
}

export async function runPreset(id: PresetId, params: Params, data: AppData): Promise<ExploreAnswer> {
  const def = PRESETS[id];
  const qs = new URLSearchParams({ q: id });
  def.params.forEach((k) => qs.set(k, params[k] ?? ""));
  try {
    const res = await fetch(`/api/graph?${qs}`);
    if (res.ok) {
      const j = (await res.json()) as { source: "neo4j" | "static"; rows: Record<string, unknown>[] };
      if (j.source === "neo4j") return { source: "neo4j", result: fromRows(id, j.rows) };
    }
  } catch {
    /* fall through to static */
  }
  return { source: "static", result: staticAnswer(id, params, data) };
}
