export interface SavedScenario {
  id: string;
  name: string;
  ids: string[];
  created: number;
}

const KEY = "wmn.scenarios.v1";

export function loadSaved(): SavedScenario[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((s) => s && typeof s.name === "string" && Array.isArray(s.ids)) : [];
  } catch {
    return [];
  }
}

export function storeSaved(list: SavedScenario[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* storage blocked: the shareable link still works */
  }
}

/** Shareable URL for a scenario: same page, ?cut=<ids>&name=<label>. */
export function scenarioUrl(ids: Iterable<string>, name: string): string {
  const u = new URL(location.href);
  u.search = "";
  u.searchParams.set("cut", [...ids].join(","));
  if (name) u.searchParams.set("name", name.slice(0, 60));
  return u.toString();
}

/** Point-in-polygon (ray casting). */
export function inPolygon(x: number, y: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
