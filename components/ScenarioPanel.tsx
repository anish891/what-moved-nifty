"use client";

import { SCENARIOS } from "@/lib/scenarios";
import type { SavedScenario } from "@/lib/saved";
import type { AppData } from "@/lib/types";

interface Props {
  data: AppData;
  cut: ReadonlySet<string>;
  onRun(ids: string[], label: string): void;
  saved: SavedScenario[];
  onRunSaved(s: SavedScenario): void;
  onDeleteSaved(id: string): void;
  onCopySaved(s: SavedScenario): void;
}

export default function ScenarioPanel({ data, cut, onRun, saved, onRunSaved, onDeleteSaved, onCopySaved }: Props) {
  return (
    <div className="space-y-2">
      {saved.length > 0 && (
        <div className="mb-3 space-y-1.5">
          <h2 className="text-sm font-semibold">Your what-ifs</h2>
          <ul className="space-y-1">
            {saved.map((s) => (
              <li key={s.id} className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5">
                <button onClick={() => onRunSaved(s)} className="min-w-0 flex-1 truncate text-left text-xs text-zinc-100 hover:text-cyan-200" title="Run this what-if">
                  ✂ {s.name} <span className="text-zinc-500">· {s.ids.length}</span>
                </button>
                <button onClick={() => onCopySaved(s)} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] hover:bg-zinc-700">Copy link</button>
                <button onClick={() => onDeleteSaved(s.id)} className="px-1 text-xs text-zinc-500 hover:text-red-400" aria-label={`Delete ${s.name}`}>✕</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <h2 className="text-sm font-semibold">What if…? <span className="font-normal text-zinc-500">ready-made</span></h2>
      <p className="text-xs text-zinc-400">One click cuts a group of events and redraws NIFTY. Run a second one to compare, or Undo.</p>
      <ul className="space-y-1.5">
        {SCENARIOS.map((s) => {
          const ids = s.ids(data);
          const active = ids.length > 0 && ids.length === cut.size && ids.every((i) => cut.has(i));
          return (
            <li key={s.id}>
              <button
                onClick={() => onRun(ids, s.label)}
                disabled={!ids.length}
                className={`w-full rounded-lg border px-3 py-2 text-left transition ${active ? "border-cyan-300 bg-cyan-400/10" : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"}`}
              >
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>✂ {s.label}</span>
                  <span className="text-[11px] text-zinc-500">{ids.length} events</span>
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-400">{s.blurb}</div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
