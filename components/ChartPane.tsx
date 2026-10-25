"use client";

import { memo, useMemo, useRef } from "react";
import Chart, { CHART_LEFT, CHART_RIGHT } from "./Chart";
import { CATEGORIES } from "@/lib/categories";
import type { AppData, CounterfactualPoint } from "@/lib/types";

interface Props {
  data: AppData;
  points: CounterfactualPoint[];
  cut: ReadonlySet<string>;
  scrubFrac: number;
  selected: string | null;
  onlyMoving: boolean;
  onScrubTo(frac: number): void;
  onSelect(id: string): void;
}

const left = (f: number) => `calc(${CHART_LEFT}px + (100% - ${CHART_LEFT + CHART_RIGHT}px) * ${f})`;

/** The chart plus overlays: clickable event ticks along the bottom, a moving scrub line, click-to-scrub. */
function ChartPane({ data, points, cut, scrubFrac, selected, onlyMoving, onScrubTo, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [t0, t1] = useMemo(
    () => [Date.parse(points[0]?.d ?? "2021-01-01"), Date.parse(points[points.length - 1]?.d ?? "2026-01-01")],
    [points],
  );
  const ticks = useMemo(
    () =>
      data.events
        .map((e) => ({ e, i: data.impacts[e.id] }))
        .filter((x) => x.i && !x.i.context && (!onlyMoving || x.i.market_moving))
        .map(({ e, i }) => ({ id: e.id, title: e.title, f: (Date.parse(i.t0) - t0) / (t1 - t0), color: CATEGORIES[e.category].color, moving: i.market_moving, cut: cut.has(e.id) }))
        .filter((x) => x.f >= 0 && x.f <= 1),
    [data, cut, t0, t1, onlyMoving],
  );

  return (
    <div
      ref={box}
      className="relative h-full cursor-crosshair"
      onClick={(ev) => {
        const r = box.current!.getBoundingClientRect();
        const f = (ev.clientX - r.left - CHART_LEFT) / (r.width - CHART_LEFT - CHART_RIGHT);
        if (f >= 0 && f <= 1) onScrubTo(f);
      }}
      title="Click the chart to jump to a date"
    >
      <Chart points={points} cut={cut} impacts={data.impacts} />
      <div
        className="pointer-events-none absolute bottom-[18px] top-[6px] w-px border-l border-dashed border-zinc-400"
        style={{ left: left(scrubFrac) }}
      />
      {/* event ticks */}
      <div className="absolute bottom-[36px] left-0 right-0 h-3">
        {ticks.map((t) => (
          <button
            key={t.id}
            title={t.title}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(t.id);
            }}
            className="absolute -translate-x-1/2 rounded-full transition-transform hover:scale-150"
            style={{
              left: left(t.f),
              bottom: 0,
              width: selected === t.id ? 9 : t.moving ? 6 : 4,
              height: selected === t.id ? 9 : t.moving ? 6 : 4,
              background: t.cut ? "transparent" : t.color,
              border: t.cut ? `1px solid ${t.color}` : selected === t.id ? "1px solid #fff" : "none",
              opacity: t.moving || selected === t.id ? 1 : 0.45,
            }}
            aria-label={t.title}
          />
        ))}
      </div>
    </div>
  );
}

export default memo(ChartPane);
