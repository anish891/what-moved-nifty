import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { CATEGORIES } from "@/lib/categories";
import type { Category, EventImpact, MarketEvent, NiftyPoint } from "@/lib/types";

export const alt = "What Moved NIFTY: cut an event and watch NIFTY's counterfactual path redraw";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const read = async <T,>(f: string): Promise<T> =>
  JSON.parse(await readFile(path.join(process.cwd(), "public", "data", f), "utf8")) as T;

/** Link-preview card (Open Graph / X "large image"): the real NIFTY line with market-moving events as dots. */
export default async function Image() {
  const [nifty, events, impacts] = await Promise.all([
    read<NiftyPoint[]>("nifty.json"),
    read<MarketEvent[]>("events.json"),
    read<Record<string, EventImpact>>("impacts.json"),
  ]);
  const pts = nifty.filter((p) => p.d >= "2021-01-01");
  const t0 = Date.parse(pts[0].d);
  const t1 = Date.parse(pts[pts.length - 1].d);
  const lo = Math.min(...pts.map((p) => p.c));
  const hi = Math.max(...pts.map((p) => p.c));

  const W = 1080;
  const H = 230;
  const X = (d: string) => ((Date.parse(d) - t0) / (t1 - t0)) * W;
  const Y = (c: number) => H - 10 - ((c - lo) / (hi - lo)) * (H - 30);
  const step = Math.max(1, Math.floor(pts.length / 220));
  const line = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  const d = line.map((p, i) => `${i ? "L" : "M"}${X(p.d).toFixed(1)},${Y(p.c).toFixed(1)}`).join(" ");
  const area = `${d} L${W},${H} L0,${H} Z`;

  const dated = events.filter((e) => impacts[e.id] && !impacts[e.id].context && e.date >= "2021-01-01");
  const moving = dated.filter((e) => impacts[e.id].market_moving);
  const closeAt = (date: string) => {
    const p = pts.find((q) => q.d >= date) ?? pts[pts.length - 1];
    return p.c;
  };
  const dots = moving.map((e) => ({
    x: X(impacts[e.id].t0),
    y: Y(closeAt(impacts[e.id].t0)),
    c: CATEGORIES[e.category as Category].color,
  }));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "radial-gradient(ellipse at 75% 90%, #0b3a4a 0%, #05090d 45%, #000000 100%)",
          color: "#f4f4f5",
          padding: "48px 60px 40px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, letterSpacing: 4, color: "#71717a" }}>
          <span>FIG 0.1  ·  MARKET SHOCK MAP</span>
          <span>WHAT-MOVED-NIFTY.VERCEL.APP</span>
        </div>
        <div style={{ height: 1, background: "#27272a", marginTop: 16, display: "flex" }} />

        <div style={{ display: "flex", flexDirection: "column", marginTop: 38 }}>
          <div style={{ fontSize: 92, fontWeight: 700, lineHeight: 1, letterSpacing: -2, display: "flex" }}>
            What Moved <span style={{ color: "#22d3ee", marginLeft: 22 }}>NIFTY</span>
          </div>
          <div style={{ fontSize: 33, color: "#a1a1aa", marginTop: 18, display: "flex" }}>
            Cut an event. Watch NIFTY&apos;s counterfactual path redraw.
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 26, fontSize: 22, color: "#d4d4d8" }}>
            {[`${dated.length} events since 2021`, `${moving.length} market-moving`, "live NIFTY", "estimates, not proof"].map((t) => (
              <span key={t} style={{ display: "flex", border: "1px solid #3f3f46", borderRadius: 999, padding: "6px 18px", background: "rgba(24,24,27,.7)" }}>
                {t}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", position: "absolute", left: 60, bottom: 34, width: W, height: H }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <defs>
              <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#fill)" />
            <path d={d} fill="none" stroke="#e4e4e7" strokeWidth="2.5" strokeLinejoin="round" />
            {dots.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="11" fill={p.c} fillOpacity="0.25" />
                <circle cx={p.x} cy={p.y} r="5" fill={p.c} />
              </g>
            ))}
          </svg>
        </div>
      </div>
    ),
    { ...size },
  );
}
