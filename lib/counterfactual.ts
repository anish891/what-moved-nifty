import type { CounterfactualPoint, EventImpact, NiftyPoint } from "./types";

/**
 * Client-side counterfactual.
 * For each cut event, divide its CAR out of the NIFTY path from the first reaction day (t0)
 * onward (multiplicative). 95% CI half-widths of cut events are combined in quadrature.
 * Confounded clusters already carry an equal split of the cluster CAR, so cutting every
 * member removes the cluster CAR exactly once. Estimates only: see /methodology.
 */
export function computeCounterfactual(
  nifty: NiftyPoint[],
  impacts: Record<string, EventImpact>,
  cutIds: ReadonlySet<string>,
): CounterfactualPoint[] {
  const cuts = [...cutIds]
    .map((id) => impacts[id])
    .filter(Boolean)
    .map((imp) => ({ t0: imp.t0, car: imp.car_5d, half: (imp.ci_high - imp.ci_low) / 2 }))
    .sort((a, b) => a.t0.localeCompare(b.t0));

  // fast path: nothing cut
  if (cuts.length === 0) return nifty.map((p) => ({ d: p.d, actual: p.c, cf: p.c, low: p.c, high: p.c }));

  let ci = 0;
  let factor = 1;
  let varSum = 0;
  return nifty.map((p) => {
    while (ci < cuts.length && cuts[ci].t0 <= p.d) {
      factor *= 1 + cuts[ci].car;
      varSum += cuts[ci].half * cuts[ci].half;
      ci++;
    }
    const cf = p.c / factor;
    const band = Math.sqrt(varSum);
    return { d: p.d, actual: p.c, cf, low: cf * (1 - band), high: cf * (1 + band) };
  });
}

export function summarize(points: CounterfactualPoint[]) {
  const last = points[points.length - 1];
  if (!last) return null;
  return {
    actual: last.actual,
    cf: last.cf,
    pct: last.cf / last.actual - 1,
    pm: (last.high - last.low) / 2 / last.cf,
  };
}
