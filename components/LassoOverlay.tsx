"use client";

import { useRef, useState } from "react";
import { inPolygon } from "@/lib/saved";

interface Props {
  positions(): { id: string; x: number; y: number }[];
  onSelect(ids: string[], additive: boolean): void;
  onExit(): void;
}

/** Draw a freehand loop over the nebula; every visible event inside it is picked. Works with mouse, pen and touch. */
export default function LassoOverlay({ positions, onSelect, onExit }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [pts, setPts] = useState<{ x: number; y: number }[]>([]);
  const drawing = useRef(false);
  const ref = useRef<{ x: number; y: number }[]>([]); // always-current copy of the path (state lags between events)

  const rel = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div
      ref={box}
      className="absolute inset-0 z-[9] cursor-crosshair"
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        drawing.current = true;
        ref.current = [rel(e)];
        setPts(ref.current);
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        ref.current = [...ref.current, rel(e)];
        setPts(ref.current);
      }}
      onPointerUp={(e) => {
        if (!drawing.current) return;
        drawing.current = false;
        const poly = ref.current;
        ref.current = [];
        setPts([]);
        if (poly.length < 4) return;
        const ids = positions().filter((p) => inPolygon(p.x, p.y, poly)).map((p) => p.id);
        onSelect(ids, e.shiftKey);
      }}
      onPointerCancel={() => {
        drawing.current = false;
        ref.current = [];
        setPts([]);
      }}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        {pts.length > 1 && (
          <polygon
            points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="rgba(34,211,238,.10)"
            stroke="#22d3ee"
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
        )}
      </svg>
      <div className="pointer-events-none absolute left-1/2 top-[150px] -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-[11px] text-cyan-200">
        Draw a loop around events to select them
      </div>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onExit}
        className="absolute right-3 top-[150px] rounded-md bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
      >
        Exit lasso
      </button>
    </div>
  );
}
