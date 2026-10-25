"use client";

import { SCENARIOS } from "@/lib/scenarios";
import type { AppData } from "@/lib/types";

interface Props {
  data: AppData;
  cut: ReadonlySet<string>;
  onRun(ids: string[], label: string): void;
}

export default function ScenarioPanel({ data, cut, onRun }: Props) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">What if…?</h2>
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
