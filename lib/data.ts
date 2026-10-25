import type { AppData } from "./types";

/** Published range starts here; the event study still uses earlier data for estimation windows. */
export const START = "2021-01-01";

export async function loadData(): Promise<AppData> {
  const get = async <T,>(f: string): Promise<T> => {
    const r = await fetch(`/data/${f}.json`);
    if (!r.ok) throw new Error(`Failed to load ${f}.json`);
    return r.json();
  };
  const [graph, events, impacts, nifty, drivers] = await Promise.all([
    get<AppData["graph"]>("graph"),
    get<AppData["events"]>("events"),
    get<AppData["impacts"]>("impacts"),
    get<AppData["nifty"]>("nifty"),
    get<AppData["drivers"]>("drivers"),
  ]);
  const evs = events.filter((e) => e.date >= START);
  const keep = new Set(evs.map((e) => e.id));
  const imp = Object.fromEntries(Object.entries(impacts).filter(([id]) => keep.has(id)));
  return { graph, events: evs, impacts: imp, nifty: nifty.filter((p) => p.d >= START), drivers };
}
