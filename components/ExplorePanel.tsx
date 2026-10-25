"use client";

import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, CATEGORY_KEYS, pct } from "@/lib/categories";
import { runPreset, type ExploreAnswer } from "@/lib/explore";
import { PRESETS, type PresetId } from "@/lib/presets";
import type { AppData } from "@/lib/types";

interface Props {
  data: AppData;
  onSelect(id: string): void;
}

const ORDER: PresetId[] = ["topByCategory", "brentDown", "driverByYear", "path", "categorySubgraph"];

export default function ExplorePanel({ data, onSelect }: Props) {
  const events = useMemo(
    () => data.events.filter((e) => data.impacts[e.id]).sort((a, b) => a.date.localeCompare(b.date)),
    [data],
  );
  const cats = CATEGORY_KEYS.filter((c) => data.events.some((e) => e.category === c));
  const [preset, setPreset] = useState<PresetId>("topByCategory");
  const [category, setCategory] = useState<string>(cats[0]);
  const [from, setFrom] = useState(events.find((e) => e.id === "covid-lockdown-crash-2020-03-23")?.id ?? events[0].id);
  const [to, setTo] = useState(events[events.length - 1].id);
  const [ans, setAns] = useState<ExploreAnswer | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setBusy(true);
    runPreset(preset, { category, from, to }, data).then((a) => {
      if (live) {
        setAns(a);
        setBusy(false);
      }
    });
    return () => {
      live = false;
    };
  }, [preset, category, from, to, data]);

  const needs = PRESETS[preset].params;
  const sel = "w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Explore</h2>
        {ans && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] ${ans.source === "neo4j" ? "bg-emerald-900 text-emerald-200" : "bg-zinc-800 text-zinc-400"}`}>
            {ans.source === "neo4j" ? "live Neo4j query" : "static JSON"}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {ORDER.map((id) => (
          <button
            key={id}
            onClick={() => setPreset(id)}
            className={`rounded-full border px-2 py-0.5 text-left text-[11px] ${preset === id ? "border-cyan-300 bg-cyan-400 text-black" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}
          >
            {PRESETS[id].label}
          </button>
        ))}
      </div>

      {needs.includes("category") && (
        <select className={sel} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          {cats.map((c) => (
            <option key={c} value={c}>{CATEGORIES[c].label}</option>
          ))}
        </select>
      )}
      {needs.includes("from") && (
        <div className="space-y-1">
          <select className={sel} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From event">
            {events.map((e) => <option key={e.id} value={e.id}>{e.date} · {e.title}</option>)}
          </select>
          <select className={sel} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To event">
            {events.map((e) => <option key={e.id} value={e.id}>{e.date} · {e.title}</option>)}
          </select>
        </div>
      )}

      <div className={busy ? "opacity-50" : ""}>
        {ans?.result.kind === "years" && (
          <table className="w-full text-xs">
            <thead className="text-zinc-500"><tr><th className="text-left">Year</th><th className="text-left">Driver</th><th className="text-right">Avg 60d ρ</th></tr></thead>
            <tbody>
              {ans.result.rows.map((r) => (
                <tr key={r.year} className="border-t border-zinc-900">
                  <td className="py-1">{r.year}</td><td>{r.driver}</td>
                  <td className={`text-right tabular-nums ${r.rho < 0 ? "text-red-400" : "text-green-400"}`}>{r.rho.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {ans?.result.kind === "events" &&
          (ans.result.rows.length ? (
            <ul className="space-y-0.5">
              {ans.result.rows.map((r) => (
                <li key={r.id}>
                  <button onClick={() => onSelect(r.id)} className="flex w-full items-baseline gap-2 rounded px-1 py-1 text-left text-xs hover:bg-zinc-900">
                    <span className="w-16 shrink-0 text-zinc-500">{r.date}</span>
                    <span className="flex-1 text-zinc-200">{r.title}{r.note && <span className="block text-[10px] text-zinc-500">{r.note}</span>}</span>
                    {r.value != null && <span className={`tabular-nums ${r.value < 0 ? "text-red-400" : "text-green-400"}`}>{pct(r.value)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-500">No events match.</p>
          ))}
        {ans?.result.kind === "path" &&
          (ans.result.path ? (
            <ol className="space-y-1 border-l border-zinc-700 pl-3">
              {ans.result.path.map((r) => (
                <li key={r.id}>
                  <button onClick={() => onSelect(r.id)} className="text-left text-xs text-zinc-200 hover:text-white">
                    <span className="text-zinc-500">{r.date}</span> · {r.title}
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-zinc-500">No path within 6 hops (same channel, co-moved or preceded edges).</p>
          ))}
      </div>
      <p className="text-[10px] text-zinc-600">Answers come from fixed read-only queries; without a database the same questions run on the static data.</p>
    </div>
  );
}
