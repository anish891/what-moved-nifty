"use client";

import { CATEGORIES, pct } from "@/lib/categories";
import type { AppData, GraphLink } from "@/lib/types";

interface Props {
  data: AppData;
  id: string;
  cut: ReadonlySet<string>;
  onToggleCut(id: string): void;
  onSelect(id: string): void;
  onClose(): void;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-zinc-500">{sub}</div>}
    </div>
  );
}

export default function SidePanel({ data, id, cut, onToggleCut, onSelect, onClose }: Props) {
  const node = data.graph.nodes.find((n) => n.id === id);
  if (!node) return null;
  const header = (
    <div className="flex items-start justify-between gap-2">
      <h2 className="text-base font-semibold leading-snug">{node.label}</h2>
      <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200" aria-label="Close">
        ✕
      </button>
    </div>
  );

  if (node.kind === "driver") {
    const key = node.id.replace("driver:", "");
    const st = data.drivers[key];
    return (
      <div className="space-y-3">
        {header}
        <p className="text-xs text-zinc-400">
          Macro driver. Average rolling 60-day correlation with NIFTY daily returns:{" "}
          <b className="text-zinc-200">{st ? st.rho_60d_avg.toFixed(2) : "–"}</b> (latest {st ? st.latest.toFixed(2) : "–"}).
        </p>
        {st && (
          <div className="grid grid-cols-4 gap-1 text-[11px]">
            {Object.entries(st.by_year).map(([y, v]) => (
              <div key={y} className="rounded bg-zinc-900 px-1.5 py-1">
                <div className="text-zinc-500">{y}</div>
                <div className={v < 0 ? "text-red-400" : "text-green-400"}>{v.toFixed(2)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (node.kind === "index") {
    return (
      <div className="space-y-3">
        {header}
        <p className="text-xs text-zinc-400">
          The core of the nebula. Every event node is linked to NIFTY by its measured abnormal return. Cut events to see
          the counterfactual path.
        </p>
      </div>
    );
  }

  const ev = data.events.find((e) => e.id === id)!;
  const imp = data.impacts[id];
  const cat = CATEGORIES[ev.category];
  const isCut = cut.has(id);
  const connected = data.graph.links
    .filter((l: GraphLink) => l.type !== "IMPACTED" && l.type !== "MOVED" && l.type !== "CORRELATED_WITH")
    .flatMap((l) => (l.source === id ? [{ o: l.target, t: l.type }] : l.target === id ? [{ o: l.source, t: l.type }] : []));
  const seen = new Set<string>();
  const uniq = connected.filter((c) => (seen.has(c.o) ? false : (seen.add(c.o), true))).slice(0, 8);
  const sectors = Object.entries(imp.sectors);

  return (
    <div className="space-y-3">
      {header}
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        <span className="rounded-full px-2 py-0.5 text-black" style={{ background: cat.color }}>
          {cat.label}
        </span>
        <span>{ev.date}</span>
        {imp.t0 !== ev.date && <span>· reaction {imp.t0}</span>}
        <span>· {ev.actor}</span>
      </div>
      <p className="text-sm text-zinc-300">{ev.description}</p>

      {imp.context ? (
        <p className="rounded-md border border-zinc-700 bg-zinc-900/60 p-2 text-xs text-zinc-300">
          Context only: a monthly or structural aggregate, not a dated shock. It carries no measured impact and cannot be cut.
        </p>
      ) : null}
      <div className={imp.context ? "hidden" : "grid grid-cols-2 gap-1.5"}>
        <Stat label="CAR [-1,+5] (headline)" value={pct(imp.car_5d)} sub={`95% CI ${pct(imp.ci_low)} to ${pct(imp.ci_high)}`} />
        <Stat label="1-day abnormal return" value={pct(imp.car_1d)} sub="reaction day only" />
        <Stat label="CAR [-1,+20]" value={pct(imp.car_20d)} />
        <Stat label="CAR [0,+60]" value={pct(imp.car_60d)} sub={imp.car_60d_partial ? "partial window" : undefined} />
      </div>
      <SignalBadge imp={imp} />
      {imp.cluster_size > 1 && (
        <p className="rounded-md border border-amber-900/60 bg-amber-950/30 p-2 text-xs text-amber-200">
          Confounded cluster of {imp.cluster_size}: the cluster&apos;s abnormal return is split equally between members, so
          this is not this event&apos;s effect alone.
        </p>
      )}

      {sectors.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Sector CAR [-1,+5] <span className="normal-case text-zinc-600">· ● = significant (|t| ≥ 2.73)</span></div>
          <div className="space-y-0.5">
            {sectors.map(([s, v]) => (
              <div key={s} className="flex items-center gap-2 text-[11px]">
                <span className={`w-14 ${imp.sector_moving.includes(s) ? "font-semibold text-zinc-100" : "text-zinc-400"}`}>{s}{imp.sector_moving.includes(s) ? " ●" : ""}</span>
                <div className="relative h-2 flex-1 rounded bg-zinc-900">
                  <div
                    className="absolute top-0 h-2 rounded"
                    style={{
                      left: v.car >= 0 ? "50%" : `${50 - Math.min(Math.abs(v.car) * 500, 50)}%`,
                      width: `${Math.min(Math.abs(v.car) * 500, 50)}%`,
                      background: v.car >= 0 ? "#4ade80" : "#f87171",
                    }}
                  />
                </div>
                <span className="w-12 text-right tabular-nums text-zinc-400">{pct(v.car)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => onToggleCut(id)}
        disabled={imp.context}
        className={`w-full rounded-md px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-30 ${
          isCut ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700" : "bg-cyan-400 text-black hover:bg-cyan-300"
        }`}
      >
        {imp.context ? "Context only: cannot be cut" : isCut ? "↺ RESTORE THIS EVENT" : "✂ CUT THIS EVENT"}
      </button>
      <div className="text-center text-[10px] text-zinc-600"><kbd className="rounded bg-zinc-800 px-1">←</kbd> <kbd className="rounded bg-zinc-800 px-1">→</kbd> browse events · <kbd className="rounded bg-zinc-800 px-1">C</kbd> cut · <kbd className="rounded bg-zinc-800 px-1">Esc</kbd> close</div>

      <div className="text-xs">
        <a href={ev.source_url} target="_blank" rel="noreferrer" className="text-cyan-400 underline underline-offset-2">
          Source
        </a>{" "}
        <span className="text-zinc-500">({ev.source_quality}{ev.verified ? "" : ", unverified"})</span>
      </div>
      {ev.notes && <p className="text-[11px] text-zinc-500">{ev.notes}</p>}

      {uniq.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Connected events</div>
          <ul className="space-y-1">
            {uniq.map((c) => {
              const n = data.graph.nodes.find((x) => x.id === c.o)!;
              return (
                <li key={c.o}>
                  <button onClick={() => onSelect(c.o)} className="text-left text-xs text-zinc-300 hover:text-white">
                    <span className="text-zinc-500">{c.t.toLowerCase().replace("_", " ")}</span> · {n.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function SignalBadge({ imp }: { imp: AppData["impacts"][string] }) {
  if (imp.context) return null;
  const why: string[] = [];
  if (imp.significant) why.push(`[-1,+5] CAR significant (t ${imp.tstat.toFixed(1)})`);
  if (imp.significant_1d && imp.tstat_1d != null) why.push(`1-day move significant (t ${imp.tstat_1d.toFixed(1)})`);
  if (imp.sector_moving.length) why.push(`sector: ${imp.sector_moving.join(", ")}`);
  return (
    <div className={`rounded-md border p-2 text-xs ${imp.market_moving ? "border-emerald-900/70 bg-emerald-950/30 text-emerald-200" : "border-zinc-800 bg-zinc-900/50 text-zinc-400"}`}>
      <div className="font-semibold">{imp.market_moving ? "● Market-moving" : "○ No detectable market impact"}</div>
      <div className="mt-0.5 text-[11px] opacity-80">
        {imp.market_moving
          ? why.join(" · ")
          : `t ${imp.tstat.toFixed(1)} on the 5-day CAR, ${imp.tstat_1d != null ? imp.tstat_1d.toFixed(1) : "–"} on the day. Measured against emerging markets, so shocks that hit every market equally show little India-specific effect.`}
      </div>
    </div>
  );
}
