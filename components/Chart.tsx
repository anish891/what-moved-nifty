"use client";

import { memo, useMemo } from "react";
import { Area, ComposedChart, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CounterfactualPoint, EventImpact } from "@/lib/types";

interface Props {
  points: CounterfactualPoint[];
  cut: ReadonlySet<string>;
  impacts: Record<string, EventImpact>;
}

const TARGET = 520; // points drawn; ~1,700 daily points make the SVG sluggish
const ms = (d: string) => Date.parse(d + "T00:00:00Z");

/** Plot-area insets, shared with the scrub marker in App so it can be an overlay (no chart re-render). */
export const CHART_LEFT = 44;
export const CHART_RIGHT = 12;

function Chart({ points, cut, impacts }: Props) {
  const data = useMemo(() => {
    const stride = Math.max(1, Math.floor(points.length / TARGET));
    const out: { t: number; actual: number; cf: number; band: [number, number] }[] = [];
    points.forEach((p, i) => {
      if (i % stride === 0 || i === points.length - 1) out.push({ t: ms(p.d), actual: p.actual, cf: p.cf, band: [p.low, p.high] });
    });
    return out;
  }, [points]);

  const pins = useMemo(() => {
    const byDate = new Map(points.map((p) => [p.d, p.cf]));
    return [...cut]
      .map((id) => impacts[id])
      .filter(Boolean)
      .map((i) => ({ id: i.id, x: ms(i.t0), y: byDate.get(i.t0) }))
      .filter((p): p is { id: string; x: number; y: number } => p.y != null);
  }, [cut, impacts, points]);

  const [lo, hi, ticks] = useMemo(() => {
    let a = Infinity;
    let b = -Infinity;
    for (const p of points) {
      a = Math.min(a, p.low, p.actual);
      b = Math.max(b, p.high, p.actual);
    }
    const first = points[0] ? new Date(points[0].d).getUTCFullYear() : 2020;
    const last = points.length ? new Date(points[points.length - 1].d).getUTCFullYear() : 2026;
    const t: number[] = [];
    for (let y = first + 1; y <= last; y++) t.push(Date.UTC(y, 0, 1));
    return [Math.floor(a / 1000) * 1000, Math.ceil(b / 1000) * 1000, t];
  }, [points]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 6, right: CHART_RIGHT, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          ticks={ticks}
          tickFormatter={(t: number) => String(new Date(t).getUTCFullYear())}
          stroke="#52525b"
          fontSize={10}
          tickLine={false}
        />
        <YAxis domain={[lo, hi]} stroke="#52525b" fontSize={10} width={CHART_LEFT} tickLine={false} tickFormatter={(v: number) => (v / 1000).toFixed(0) + "k"} />
        <Tooltip
          isAnimationActive={false}
          labelFormatter={(t: number) => new Date(t).toISOString().slice(0, 10)}
          contentStyle={{ background: "rgba(10,10,14,.95)", border: "1px solid #27272a", fontSize: 12 }}
          formatter={(v: unknown, name: string) =>
            Array.isArray(v)
              ? [`${Math.round(v[0] as number).toLocaleString()} – ${Math.round(v[1] as number).toLocaleString()}`, "95% band"]
              : [Math.round(v as number).toLocaleString(), name]
          }
        />
        <Area dataKey="band" stroke="none" fill="#22d3ee" fillOpacity={0.16} isAnimationActive={false} name="band" activeDot={false} />
        <Line dataKey="actual" stroke="#f4f4f5" dot={false} strokeWidth={1.4} isAnimationActive={false} name="NIFTY actual" />
        <Line dataKey="cf" stroke="#22d3ee" dot={false} strokeWidth={1.8} isAnimationActive={false} name="Without cut events" />
        {pins.map((p) => (
          <ReferenceDot key={p.id} x={p.x} y={p.y} r={3.5} fill="#22d3ee" stroke="#000" isFront />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default memo(Chart);
