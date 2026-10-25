import type { AppData } from "./types";

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
  return { graph, events, impacts, nifty, drivers };
}
