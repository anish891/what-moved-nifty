"use client";

import { useMemo } from "react";
import { Area, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CounterfactualPoint, EventImpact } from "@/lib/types";

interface Props {
  points: CounterfactualPoint[];
  cut: ReadonlySet<string>;
  impacts: Record<string, EventImpact>;
  scrub: string;
}

export default function Chart({ points, cut, impacts, scrub }: Props) {
  const data = useMemo(() => points.map((p) => ({ ...p, band: [p.low, p.high] as [number, number] })), [points]);
  const pins = useMemo(() => {
    const byDate = new Map(points.map((p) => [p.d, p]));
    return [...cut]
      .map((id) => impacts[id])
      .filter(Boolean)
      .map((i) => ({ id: i.id, x: i.t0, y: byDate.get(i.t0)?.cf }))
      .filter((p) => p.y != null);
  }, [cut, impacts, points]);
  const [lo, hi] = useMemo(() => {
    let a = Infinity;
    let b = -Infinity;
    for (const p of points) {
      a = Math.min(a, p.low, p.actual);
      b = Math.max(b, p.high, p.actual);
    }
    return [Math.floor(a / 1000) * 1000, Math.ceil(b / 1000) * 1000];
  }, [points]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
        <XAxis dataKey="d" tickFormatter={(d: string) => d.slice(0, 4)} interval={Math.floor(data.length / 7)} stroke="#52525b" fontSize={10} tickLine={false} />
        <YAxis domain={[lo, hi]} stroke="#52525b" fontSize={10} width={44} tickLine={false} tickFormatter={(v: number) => (v / 1000).toFixed(0) + "k"} />
        <Tooltip
          contentStyle={{ background: "rgba(10,10,14,.95)", border: "1px solid #27272a", fontSize: 12 }}
          formatter={(v: unknown, name: string) =>
            Array.isArray(v) ? [`${Math.round(v[0] as number).toLocaleString()} – ${Math.round(v[1] as number).toLocaleString()}`, "95% band"] : [Math.round(v as number).toLocaleString(), name]
          }
        />
        <Area dataKey="band" stroke="none" fill="#22d3ee" fillOpacity={0.16} isAnimationActive={false} name="band" />
        <Line dataKey="actual" stroke="#f4f4f5" dot={false} strokeWidth={1.4} isAnimationActive={false} name="NIFTY actual" />
        <Line dataKey="cf" stroke="#22d3ee" dot={false} strokeWidth={1.8} isAnimationActive={false} name="Without cut events" />
        <ReferenceLine x={scrub} stroke="#a1a1aa" strokeDasharray="3 3" />
        {pins.map((p) => (
          <ReferenceDot key={p.id} x={p.x} y={p.y} r={3.5} fill="#22d3ee" stroke="#000" />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
