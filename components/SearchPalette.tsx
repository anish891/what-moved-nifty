"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, pct } from "@/lib/categories";
import type { AppData } from "@/lib/types";

interface Props {
  data: AppData;
  onPick(id: string): void;
  onClose(): void;
}

/** Ctrl/Cmd+K or "/" palette: type to find an event, Enter or click to fly to it. */
export default function SearchPalette({ data, onPick, onClose }: Props) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.events
      .filter((e) => data.impacts[e.id])
      .filter((e) => !s || `${e.title} ${e.description} ${e.actor} ${CATEGORIES[e.category].label} ${e.date}`.toLowerCase().includes(s))
      .sort((a, b) => (s ? 0 : b.date.localeCompare(a.date)))
      .slice(0, 8);
  }, [data, q]);

  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center bg-black/60 pt-[14vh] backdrop-blur-sm" onClick={onClose}>
      <div className="w-[min(94%,520px)] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={q}
          onChange={(e) => { setQ(e.target.value); setI(0); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(x + 1, rows.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
            else if (e.key === "Enter" && rows[i]) onPick(rows[i].id);
          }}
          placeholder="Search events: tariffs, RBI, Budget, Adani, AI…"
          className="w-full border-b border-zinc-800 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-zinc-600"
        />
        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {rows.length === 0 && <li className="px-4 py-3 text-xs text-zinc-500">No events match.</li>}
          {rows.map((e, k) => {
            const imp = data.impacts[e.id];
            return (
              <li key={e.id}>
                <button
                  onMouseEnter={() => setI(k)}
                  onClick={() => onPick(e.id)}
                  className={`flex w-full items-center gap-2 px-4 py-2 text-left text-xs ${k === i ? "bg-zinc-800" : ""}`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CATEGORIES[e.category].color }} />
                  <span className="w-[68px] shrink-0 text-zinc-500">{e.date}</span>
                  <span className={`flex-1 truncate ${imp.market_moving ? "text-zinc-100" : "text-zinc-400"}`}>{e.title}</span>
                  {!imp.context && <span className={`tabular-nums ${imp.car_5d < 0 ? "text-red-400" : "text-green-400"}`}>{pct(imp.car_5d)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-zinc-800 px-4 py-1.5 text-[10px] text-zinc-600">↑ ↓ to move · Enter to open · Esc to close</div>
      </div>
    </div>
  );
}
