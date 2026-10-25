"use client";

import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, pct } from "@/lib/categories";
import { loadData } from "@/lib/data";
import type { AppData } from "@/lib/types";

export default function EventsTable() {
  const [data, setData] = useState<AppData | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    loadData().then(setData);
  }, []);
  const rows = useMemo(() => {
    if (!data) return [];
    const s = q.toLowerCase();
    return data.events
      .filter((e) => !s || `${e.title} ${e.description} ${e.actor} ${e.category} ${e.date}`.toLowerCase().includes(s))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, q]);
  if (!data) return <p className="text-zinc-500">Loading…</p>;
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search events, actors, categories…"
        className="mb-3 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-cyan-500"
      />
      <p className="mb-2 text-xs text-zinc-500">{rows.length} of {data.events.length} events</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead className="text-zinc-500">
            <tr>
              <th className="py-1 pr-3">Date</th><th className="pr-3">Event</th><th className="pr-3">Category</th>
              <th className="pr-3 text-right">CAR [-1,+5]</th><th className="pr-3 text-right">1-day AR</th>
              <th className="pr-3">Signal</th><th>Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const i = data.impacts[e.id];
              return (
                <tr key={e.id} className="border-t border-zinc-900 align-top">
                  <td className="py-1.5 pr-3 whitespace-nowrap text-zinc-400">{e.date}</td>
                  <td className="pr-3">
                    <div className="text-zinc-200">{e.title}</div>
                    <div className="text-zinc-500">{e.description}</div>
                  </td>
                  <td className="pr-3 whitespace-nowrap" style={{ color: CATEGORIES[e.category].color }}>{CATEGORIES[e.category].label}</td>
                  <td className={`pr-3 text-right tabular-nums ${i && i.car_5d < 0 ? "text-red-400" : "text-green-400"}`}>
                    {i && !i.context ? pct(i.car_5d) : "–"}
                    {i && !i.context && <div className="text-[10px] text-zinc-600">[{pct(i.ci_low)}, {pct(i.ci_high)}]</div>}
                  </td>
                  <td className="pr-3 text-right tabular-nums">{i && !i.context ? pct(i.car_1d) : "–"}</td>
                  <td className="pr-3 whitespace-nowrap">
                    {!i ? "–" : i.context ? <span className="text-zinc-500">context</span> : i.market_moving ? <span className="text-emerald-300">● moving</span> : <span className="text-zinc-500">○ none</span>}
                    {i && i.cluster_size > 1 ? <span className="text-zinc-600"> · cl{i.cluster_size}</span> : null}
                  </td>
                  <td><a href={e.source_url} target="_blank" rel="noreferrer" className="text-cyan-400 underline">{e.source_quality}</a></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
