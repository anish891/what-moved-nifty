"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Chart, { CHART_LEFT, CHART_RIGHT } from "./Chart";
import ExplorePanel from "./ExplorePanel";
import Leaderboard from "./Leaderboard";
import SidePanel from "./SidePanel";
import type { NebulaHandle, Quality } from "./Nebula";
import { CATEGORIES, CATEGORY_KEYS, GROUPS } from "@/lib/categories";
import { computeCounterfactual, summarize } from "@/lib/counterfactual";
import { loadData } from "@/lib/data";
import { mergeLive, type LiveQuote } from "@/lib/live";
import { renderShareImage } from "@/lib/share";
import type { AppData, Category, NiftyPoint } from "@/lib/types";

const Nebula = dynamic(() => import("./Nebula"), { ssr: false });
const Fallback2D = dynamic(() => import("./Fallback2D"), { ssr: false });

type Panel = "none" | "details" | "board" | "explore";

function webglOk(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cut, setCut] = useState<ReadonlySet<string>>(new Set());
  const [history, setHistory] = useState<ReadonlySet<string>[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("none");
  const [scrubIdx, setScrubIdx] = useState<number>(-1);
  const [playing, setPlaying] = useState(false);
  const [drawer, setDrawer] = useState(true);
  const [gl, setGl] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [quality, setQuality] = useState<Quality>("auto");
  const [autoLow, setAutoLow] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [onlyMoving, setOnlyMoving] = useState(false);
  const [hint, setHint] = useState(true);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [livePts, setLivePts] = useState<NiftyPoint[]>([]);
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const prevLen = useRef(0);
  const stage = useRef<HTMLDivElement>(null);
  const nebula = useRef<NebulaHandle>(null);

  useEffect(() => {
    loadData()
      .then((d) => {
        setData(d);
        const ids = new Set(d.events.map((e) => e.id));
        const q = new URLSearchParams(location.search).get("cut");
        if (q) setCut(new Set(q.split(",").filter((x) => ids.has(x))));
        setScrubIdx(d.nifty.length - 1);
      })
      .catch((e) => setError(String(e)));
    setGl(webglOk());
    setMobile(window.innerWidth < 768);
  }, []);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  const nifty = useMemo(() => (data ? mergeLive(data.nifty, livePts) : []), [data, livePts]);

  // live NIFTY: fetch now and every 60 s while the tab is visible; failures keep the static series
  useEffect(() => {
    if (!data) return;
    let stop = false;
    const pull = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/nifty");
        const j = (await r.json()) as { points: NiftyPoint[]; quote: LiveQuote | null };
        if (!stop && j.points.length) {
          setLivePts(j.points);
          setQuote(j.quote);
        }
      } catch {
        /* offline: keep static data */
      }
    };
    pull();
    const t = setInterval(pull, 60_000);
    const vis = () => !document.hidden && pull();
    document.addEventListener("visibilitychange", vis);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [data]);

  // when new candles arrive and the scrubber was parked at "now", keep following "now"
  useEffect(() => {
    if (nifty.length && prevLen.current && nifty.length !== prevLen.current) {
      setScrubIdx((i) => (i === prevLen.current - 1 ? nifty.length - 1 : i));
    }
    prevLen.current = nifty.length;
  }, [nifty.length]);

  // shareable URL
  useEffect(() => {
    if (!data) return;
    const u = new URL(location.href);
    if (cut.size) u.searchParams.set("cut", [...cut].join(","));
    else u.searchParams.delete("cut");
    history_replace(u);
  }, [cut, data]);

  const apply = useCallback((next: ReadonlySet<string>) => {
    setCut((prev) => {
      setHistory((h) => [...h.slice(-49), prev]);
      return next;
    });
  }, []);
  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      setCut(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [undo]);

  // time scrubber playback
  useEffect(() => {
    if (!playing || !data) return;
    const t = setInterval(() => {
      setScrubIdx((i) => {
        if (i >= nifty.length - 1) {
          setPlaying(false);
          return i;
        }
        return Math.min(i + 6, nifty.length - 1);
      });
    }, 40);
    return () => clearInterval(t);
  }, [playing, data, nifty.length]);

  const points = useMemo(() => (data ? computeCounterfactual(nifty, data.impacts, cut) : []), [data, nifty, cut]);
  const stat = useMemo(() => summarize(points), [points]);
  const scrub = nifty.length && scrubIdx >= 0 ? nifty[Math.min(scrubIdx, nifty.length - 1)].d : "9999-12-31";
  const eventDates = useMemo(
    () => (data ? data.events.filter((e) => data.impacts[e.id]).map((e) => e.date).sort() : []),
    [data],
  );
  // latest event date already reached; only changes when the scrubber crosses an event, so the 3D scene is left alone in between
  const visDate = useMemo(() => {
    let last = "";
    for (const d of eventDates) {
      if (d <= scrub) last = d;
      else break;
    }
    return last;
  }, [eventDates, scrub]);
  const scrubFrac = useMemo(() => {
    if (!nifty.length || scrubIdx < 0) return 1;
    const t0 = Date.parse(nifty[0].d);
    const t1 = Date.parse(nifty[nifty.length - 1].d);
    return (Date.parse(nifty[Math.min(scrubIdx, nifty.length - 1)].d) - t0) / (t1 - t0);
  }, [nifty, scrubIdx]);
  const onAutoLow = useCallback(() => setAutoLow(true), []);
  const effQuality: Quality = autoLow && quality === "auto" ? "low" : quality;

  const select = useCallback((id: string | null) => {
    setSelected(id);
    setPanel(id ? "details" : "none");
  }, []);

  const toggle = useCallback(
    (id: string) => {
      const n = new Set(cut);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      apply(n);
    },
    [cut, apply],
  );

  const catIds = useMemo(() => {
    const m: Record<string, string[]> = {};
    data?.events.forEach((e) => data.impacts[e.id] && !data.impacts[e.id].context && (m[e.category] ??= []).push(e.id));
    return m;
  }, [data]);
  const [movingCount, totalCount] = useMemo(() => {
    const v = data ? data.events.map((e) => data.impacts[e.id]).filter((i) => i && !i.context) : [];
    return [v.filter((i) => i.market_moving).length, v.length];
  }, [data]);

  const toggleMany = (ids: string[]) => {
    if (!ids.length) return;
    const all = ids.every((i) => cut.has(i));
    const n = new Set(cut);
    ids.forEach((i) => (all ? n.delete(i) : n.add(i)));
    apply(n);
  };

  const share = () => {
    if (!data) return;
    const titles = [...cut].map((id) => data.events.find((e) => e.id === id)?.title ?? id);
    const url = renderShareImage(nebula.current?.canvas() ?? null, points, titles, stat);
    const a = document.createElement("a");
    a.href = url;
    a.download = "what-moved-nifty.png";
    a.click();
    navigator.clipboard?.writeText(location.href).catch(() => {});
  };

  if (error) return <div className="p-8 text-red-400">Could not load data: {error}</div>;
  if (!data) return <div className="flex h-full items-center justify-center text-zinc-500">Loading the nebula…</div>;

  const nCut = cut.size;
  const gap = stat ? stat.pct : 0;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div ref={stage} className="absolute inset-0">
        {size.w > 0 &&
          (gl ? (
            <Nebula
              apiRef={nebula}
              data={data}
              cut={cut}
              visDate={visDate}
              selected={selected}
              gap={gap}
              mobile={mobile}
              quality={effQuality}
              showAll={showAll}
              onlyMoving={onlyMoving}
              onAutoLow={onAutoLow}
              onSelect={select}
              width={size.w}
              height={size.h}
            />
          ) : (
            <Fallback2D data={data} cut={cut} scrub={scrub} onSelect={select} />
          ))}
      </div>

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/95 via-black/70 to-transparent px-3 pb-8 pt-2">
        <div className="pointer-events-auto flex items-center gap-3">
          <h1 className="text-sm font-semibold tracking-[0.18em]">WHAT MOVED NIFTY</h1>
          <nav className="ml-auto flex gap-4 text-xs text-zinc-400">
            <Link href="/events" className="hover:text-white">Events</Link>
            <Link href="/methodology" className="hover:text-white">Methodology</Link>
          </nav>
        </div>
        <div className="pointer-events-auto mt-1.5 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          <Btn onClick={undo} disabled={!history.length} title="Ctrl/Cmd+Z">↶ Undo</Btn>
          <Btn onClick={() => apply(new Set())} disabled={!nCut}>Restore all</Btn>
          <Sep />
          <Btn active={panel === "board"} onClick={() => setPanel(panel === "board" ? "none" : "board")}>Leaderboard</Btn>
          <Btn active={panel === "explore"} onClick={() => setPanel(panel === "explore" ? "none" : "explore")}>Explore</Btn>
          <Sep />
          <Btn
            active={onlyMoving}
            onClick={() => setOnlyMoving((v) => !v)}
            title="Hide events with no detectable market impact (see Methodology)"
          >
            ● Market-moving only <span className="opacity-60">{movingCount}/{totalCount}</span>
          </Btn>
          <Btn active={showAll} onClick={() => setShowAll((v) => !v)} title="Draw every same-channel and co-moved connection (heavier)">
            All links
          </Btn>
          <Btn
            onClick={() => { setAutoLow(false); setQuality((q) => (q === "auto" ? "low" : q === "low" ? "high" : "auto")); }}
            title="Rendering quality: Auto lowers it if the frame rate is poor"
          >
            Quality: {quality === "auto" ? (autoLow ? "Auto (low)" : "Auto") : quality === "low" ? "Low" : "High"}
          </Btn>
          <Btn onClick={share}>Share PNG</Btn>
        </div>
        <div className="pointer-events-auto mt-1.5 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
          {GROUPS.map((g) => {
            const ids = g.cats.flatMap((c) => catIds[c] ?? []);
            const on = ids.length > 0 && ids.every((i) => cut.has(i));
            return (
              <button
                key={g.label}
                onClick={() => toggleMany(ids)}
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] ${on ? "border-cyan-300 bg-cyan-400 text-black" : "border-zinc-600 text-zinc-300 hover:border-zinc-400"}`}
              >
                ✂ {g.label}
              </button>
            );
          })}
          {CATEGORY_KEYS.filter((c) => catIds[c]?.length).map((c: Category) => {
            const ids = catIds[c];
            const on = ids.every((i) => cut.has(i));
            const part = !on && ids.some((i) => cut.has(i));
            return (
              <button
                key={c}
                onClick={() => toggleMany(ids)}
                title={on ? `Restore all ${CATEGORIES[c].label}` : `Cut all ${CATEGORIES[c].label}`}
                className="flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px]"
                style={{
                  borderColor: CATEGORIES[c].color,
                  background: on ? CATEGORIES[c].color : "transparent",
                  color: on ? "#000" : CATEGORIES[c].color,
                  opacity: part ? 0.75 : 1,
                }}
              >
                {on ? "✂ " : ""}
                {CATEGORIES[c].label} <span className="opacity-60">{ids.length}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* counter */}
      <div className="pointer-events-none absolute left-3 top-[106px] z-10 max-w-[70%]">
        <div className="text-[11px] uppercase tracking-wide text-zinc-500">
          {nCut ? `NIFTY without ${nCut} event${nCut > 1 ? "s" : ""}` : "NIFTY 50 (actual)"}
        </div>
        {stat && (
          <div className="text-2xl font-semibold tabular-nums text-cyan-300 sm:text-3xl">
            {Math.round(stat.cf).toLocaleString()}{" "}
            {nCut > 0 && (
              <span className="text-base text-zinc-200">
                ({stat.pct >= 0 ? "+" : ""}
                {(stat.pct * 100).toFixed(1)}%) <span className="text-sm text-zinc-400">±{(stat.pm * 100).toFixed(1)}%</span>
              </span>
            )}
          </div>
        )}
        {nCut > 0 && stat && <div className="text-[11px] text-zinc-500">vs actual {Math.round(stat.actual).toLocaleString()} · estimate, 95% band</div>}
        <LiveBadge quote={quote} last={nifty[nifty.length - 1]} />
      </div>

      {/* first-visit hint */}
      {hint && !selected && nCut === 0 && (
        <div className="pointer-events-auto absolute left-1/2 top-[44%] z-10 w-[min(92%,360px)] -translate-x-1/2 rounded-xl border border-zinc-700 bg-black/80 px-4 py-3 text-center text-xs text-zinc-300 backdrop-blur">
          <div className="mb-1 text-sm font-semibold text-zinc-100">Cut an event, watch NIFTY change</div>
          Click any glowing node to read it, then press <b className="text-cyan-300">✂ Cut</b>. Or cut a whole category with the chips above.
          <button onClick={() => setHint(false)} className="mt-2 block w-full rounded bg-zinc-800 py-1 text-zinc-200 hover:bg-zinc-700">Got it</button>
        </div>
      )}

      {/* right panel */}
      {panel !== "none" && (
        <aside
          className="absolute bottom-[calc(var(--drawer,0px)+8px)] right-2 z-20 w-[min(340px,calc(100%-16px))] overflow-y-auto rounded-xl border border-zinc-800 bg-black/90 p-3 backdrop-blur max-sm:left-2 max-sm:top-auto max-sm:max-h-[52%] max-sm:w-auto sm:top-[132px]"
        >
          {panel === "details" && selected ? (
            <SidePanel data={data} id={selected} cut={cut} onToggleCut={toggle} onSelect={select} onClose={() => select(null)} />
          ) : panel === "explore" ? (
            <ExplorePanel data={data} onSelect={(id) => { select(id); nebula.current?.focus(id); }} />
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Shock leaderboard</h2>
                <button onClick={() => setPanel("none")} className="text-zinc-500 hover:text-zinc-200" aria-label="Close">✕</button>
              </div>
              <Leaderboard data={data} cut={cut} onSelect={(id) => { select(id); nebula.current?.focus(id); }} />
            </>
          )}
        </aside>
      )}

      {/* bottom: scrubber + chart drawer */}
      <div
        className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black via-black/90 to-transparent px-3 pb-2 pt-6"
        style={{ ["--drawer" as string]: drawer ? (mobile ? "212px" : "262px") : "40px" }}
      >
        <div className="flex items-center gap-2">
          <Btn onClick={() => { if (scrubIdx >= nifty.length - 1) setScrubIdx(0); setPlaying((p) => !p); }}>
            {playing ? "❚❚ Pause" : "▶ Play"}
          </Btn>
          <input
            type="range"
            min={0}
            max={nifty.length - 1}
            value={Math.max(scrubIdx, 0)}
            onChange={(e) => { setPlaying(false); setScrubIdx(+e.target.value); }}
            className="flex-1 accent-cyan-400"
            aria-label="Time scrubber"
          />
          <span className="w-[76px] text-right text-xs tabular-nums text-zinc-400">{scrubIdx >= nifty.length - 1 ? "now" : scrub === "9999-12-31" ? "" : scrub}</span>
          <Btn onClick={() => setDrawer((d) => !d)}>{drawer ? "Hide chart" : "Show chart"}</Btn>
        </div>
        {drawer && (
          <div className="relative mt-1 h-[150px] sm:h-[200px]">
            <Chart points={points} cut={cut} impacts={data.impacts} />
            <div
              className="pointer-events-none absolute bottom-[18px] top-[6px] w-px border-l border-dashed border-zinc-400"
              style={{ left: `calc(${CHART_LEFT}px + (100% - ${CHART_LEFT + CHART_RIGHT}px) * ${scrubFrac})` }}
            />
          </div>
        )}
        <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-zinc-500">
          <span><i className="mr-1 inline-block h-0.5 w-3 bg-zinc-200 align-middle" />NIFTY actual</span>
          <span><i className="mr-1 inline-block h-0.5 w-3 bg-cyan-400 align-middle" />without cut events</span>
          <span>Size = |CAR| · red/green halo = down/up · bright = market-moving, dim = no detectable impact · grey = context</span>
        </div>
      </div>
    </div>
  );
}

function Btn({ children, active, disabled, onClick, title }: { children: React.ReactNode; active?: boolean; disabled?: boolean; onClick?: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`shrink-0 rounded-md px-2.5 py-1 text-xs transition disabled:opacity-35 ${active ? "bg-cyan-400 text-black" : "bg-zinc-800/90 text-zinc-200 hover:bg-zinc-700"}`}
    >
      {children}
    </button>
  );
}
const Sep = () => <span className="mx-0.5 h-4 w-px shrink-0 bg-zinc-700" />;

function history_replace(u: URL) {
  try {
    window.history.replaceState(null, "", u);
  } catch {
    /* ignore */
  }
}

function LiveBadge({ quote, last }: { quote: LiveQuote | null; last?: NiftyPoint }) {
  if (!last) return null;
  if (quote?.live) {
    const t = new Date(quote.time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
    return (
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-emerald-300">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        LIVE · updated {t} IST
      </div>
    );
  }
  return (
    <div className="mt-0.5 text-[11px] text-zinc-500">
      Market closed · last close {last.d}
      {quote ? "" : " · live feed unavailable"}
    </div>
  );
}
