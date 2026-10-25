"use client";

import { useMemo, useState } from "react";
import { CATEGORIES, pct } from "@/lib/categories";
import type { AppData } from "@/lib/types";

interface Props {
  data: AppData;
  cut: ReadonlySet<string>;
  onSelect(id: string): void;
}

export default function Leaderboard({ data, cut, onSelect }: Props) {
  const [sigOnly, setSigOnly] = useState(false);
  const [by, setBy] = useState<"car_5d" | "car_1d">("car_5d");
  const rows = useMemo(
    () =>
      data.events
        .filter((e) => data.impacts[e.id])
        .map((e) => ({ e, i: data.impacts[e.id] }))
        .filter((r) => !sigOnly || r.i.significant)
        .sort((a, b) => Math.abs(b.i[by] ?? 0) - Math.abs(a.i[by] ?? 0))
        .slice(0, 40),
    [data, sigOnly, by],
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex gap-1">
          {(["car_5d", "car_1d"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setBy(k)}
              className={`rounded px-2 py-0.5 ${by === k ? "bg-zinc-200 text-black" : "bg-zinc-800 text-zinc-300"}`}
            >
              {k === "car_5d" ? "CAR [-1,+5]" : "1-day AR"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-zinc-400">
          <input type="checkbox" checked={sigOnly} onChange={(e) => setSigOnly(e.target.checked)} />
          significant only
        </label>
      </div>
      <ol className="space-y-0.5">
        {rows.map(({ e, i }, k) => (
          <li key={e.id}>
            <button
              onClick={() => onSelect(e.id)}
              className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-zinc-900 ${cut.has(e.id) ? "opacity-40" : ""}`}
            >
              <span className="w-5 text-zinc-600">{k + 1}</span>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CATEGORIES[e.category].color }} />
              <span className={`flex-1 truncate ${i.significant ? "text-zinc-200" : "text-zinc-500"}`}>{e.title}</span>
              <span className={`w-14 text-right tabular-nums ${(i[by] ?? 0) < 0 ? "text-red-400" : "text-green-400"}`}>
                {pct(i[by])}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="text-[10px] text-zinc-600">Dim titles are not significant at 5%. Estimates, not proof.</p>
    </div>
  );
}
