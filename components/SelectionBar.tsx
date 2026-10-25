"use client";

import { useState } from "react";

interface Props {
  count: number;
  alreadyCut: number;
  onCut(): void;
  onSave(name: string): void;
  onClear(): void;
  onDone(): void;
}

/** Floating bar shown while events are multi-selected: cut them, or cut and save as a named what-if. */
export default function SelectionBar({ count, alreadyCut, onCut, onSave, onClear, onDone }: Props) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  return (
    <div className="pointer-events-auto absolute bottom-[calc(var(--drawer,0px)+58px)] left-1/2 z-20 w-[min(94%,460px)] -translate-x-1/2 rounded-xl border border-cyan-500/40 bg-zinc-950/95 p-2.5 shadow-2xl backdrop-blur">
      {!naming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-300">
            <b className="text-cyan-300">{count}</b> selected{alreadyCut ? ` · ${alreadyCut} already cut` : ""}
          </span>
          <span className="ml-auto flex gap-1.5">
            <button onClick={onCut} disabled={!count} className="rounded-md bg-cyan-400 px-2.5 py-1 text-xs font-semibold text-black disabled:opacity-40">
              ✂ Cut {count || ""}
            </button>
            <button onClick={() => setNaming(true)} disabled={!count} className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40">
              Cut &amp; save…
            </button>
            <button onClick={onClear} disabled={!count} className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40">
              Clear
            </button>
            <button onClick={onDone} className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:text-white">
              Done
            </button>
          </span>
        </div>
      ) : (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(name.trim() || "My what-if");
            setNaming(false);
            setName("");
          }}
        >
          <input
            autoFocus
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name your what-if"
            className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs outline-none focus:border-cyan-500"
          />
          <button className="rounded-md bg-cyan-400 px-2.5 py-1 text-xs font-semibold text-black">Save &amp; copy link</button>
          <button type="button" onClick={() => setNaming(false)} className="px-1 text-xs text-zinc-400 hover:text-white">
            ✕
          </button>
        </form>
      )}
      <div className="mt-1 text-[10px] text-zinc-600">Shift-click or tap nodes to add or remove · loop with Lasso</div>
    </div>
  );
}
