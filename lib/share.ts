import type { CounterfactualPoint } from "./types";

/** 1200x675 PNG: nebula frame + counterfactual chart + stats + watermark. */
export function renderShareImage(
  nebula: HTMLCanvasElement | null,
  pts: CounterfactualPoint[],
  cutTitles: string[],
  stat: { actual: number; cf: number; pct: number; pm: number } | null,
): string {
  const W = 1200;
  const H = 675;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  if (nebula && nebula.width > 0) {
    const s = Math.max(W / nebula.width, 420 / nebula.height);
    const dw = nebula.width * s;
    const dh = nebula.height * s;
    g.drawImage(nebula, (W - dw) / 2, (420 - dh) / 2, dw, dh);
  }
  const grad = g.createLinearGradient(0, 300, 0, 430);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "#000");
  g.fillStyle = grad;
  g.fillRect(0, 300, W, 130);

  g.fillStyle = "#f4f4f5";
  g.font = "600 34px system-ui, sans-serif";
  g.fillText("What Moved NIFTY", 36, 62);
  g.font = "16px system-ui, sans-serif";
  g.fillStyle = "#a1a1aa";
  const sub = cutTitles.length ? `Cut: ${cutTitles.slice(0, 3).join(" · ")}${cutTitles.length > 3 ? ` +${cutTitles.length - 3} more` : ""}` : "Click a node to cut it";
  g.fillText(sub.slice(0, 110), 36, 90);

  // chart
  const x0 = 60;
  const x1 = W - 40;
  const y0 = 450;
  const y1 = 620;
  if (pts.length > 1) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of pts) {
      lo = Math.min(lo, p.low, p.actual);
      hi = Math.max(hi, p.high, p.actual);
    }
    const X = (i: number) => x0 + (i / (pts.length - 1)) * (x1 - x0);
    const Y = (v: number) => y1 - ((v - lo) / (hi - lo)) * (y1 - y0);
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(X(i), Y(p.high)) : g.moveTo(X(i), Y(p.high))));
    for (let i = pts.length - 1; i >= 0; i--) g.lineTo(X(i), Y(pts[i].low));
    g.closePath();
    g.fillStyle = "rgba(34,211,238,.18)";
    g.fill();
    const line = (key: "actual" | "cf", col: string, w: number) => {
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(X(i), Y(p[key])) : g.moveTo(X(i), Y(p[key]))));
      g.strokeStyle = col;
      g.lineWidth = w;
      g.stroke();
    };
    line("actual", "#f4f4f5", 1.5);
    line("cf", "#22d3ee", 2);
  }
  g.fillStyle = "#e4e4e7";
  g.font = "600 22px system-ui, sans-serif";
  if (stat) {
    g.fillText(
      `NIFTY without these events: ${Math.round(stat.cf).toLocaleString()} (${stat.pct >= 0 ? "+" : ""}${(stat.pct * 100).toFixed(1)}%) ±${(stat.pm * 100).toFixed(1)}%`,
      36,
      648,
    );
  }
  g.font = "13px system-ui, sans-serif";
  g.fillStyle = "#71717a";
  g.textAlign = "right";
  g.fillText("Estimates, not proof. Not investment advice.", W - 36, 648);
  g.fillText(typeof location !== "undefined" ? location.host : "", W - 36, 666);
  return c.toDataURL("image/png");
}
