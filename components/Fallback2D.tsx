"use client";

import { useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { CATEGORIES } from "@/lib/categories";
import type { AppData } from "@/lib/types";

interface Props {
  data: AppData;
  cut: ReadonlySet<string>;
  scrub: string;
  onSelect(id: string | null): void;
}

/** Used when WebGL is unavailable. */
export default function Fallback2D({ data, cut, scrub, onSelect }: Props) {
  const graph = useMemo(
    () => ({
      nodes: data.graph.nodes.map((n) => ({ ...n })),
      links: data.graph.links.filter((l) => l.type === "IMPACTED" || l.type === "MOVED").map((l) => ({ ...l })),
    }),
    [data],
  );
  return (
    <ForceGraph2D
      graphData={graph}
      backgroundColor="#000"
      nodeVisibility={((n: { id: string; kind: string; date?: string }) =>
        !cut.has(n.id) && !(n.kind === "event" && n.date! > scrub)) as never}
      nodeColor={((n: { category?: keyof typeof CATEGORIES; kind: string }) =>
        n.category ? CATEGORIES[n.category].color : n.kind === "index" ? "#fff" : "#fde68a") as never}
      nodeVal={((n: { id: string; kind: string }) =>
        n.kind === "event" ? 1 + Math.abs(data.impacts[n.id]?.car_5d ?? 0) * 120 : 10) as never}
      nodeLabel={((n: { label: string }) => n.label) as never}
      linkColor={() => "rgba(148,163,184,.25)"}
      onNodeClick={((n: { id: string }) => onSelect(n.id)) as never}
      onBackgroundClick={() => onSelect(null)}
    />
  );
}
