import type { NiftyPoint } from "./types";

export interface LiveQuote {
  price: number;
  time: number; // ms epoch of the last trade
  live: boolean; // inside regular trading hours with a fresh print
}

/** Static series + live candles: live days on or after the last static date replace/extend it. */
export function mergeLive(base: NiftyPoint[], live: NiftyPoint[]): NiftyPoint[] {
  if (!base.length || !live.length) return base;
  const last = base[base.length - 1].d;
  const extra = live.filter((p) => p.d >= last).sort((a, b) => a.d.localeCompare(b.d));
  if (!extra.length) return base;
  return [...base.filter((p) => p.d < extra[0].d), ...extra];
}
