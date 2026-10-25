"use client";

import { memo, useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { CATEGORIES, pct } from "@/lib/categories";
import type { AppData, GraphLink, GraphNode } from "@/lib/types";

export type Quality = "auto" | "high" | "low";

export interface NebulaHandle {
  /** Renders a fresh frame and returns the canvas; read it synchronously (drawImage / toDataURL). */
  canvas(): HTMLCanvasElement | null;
  focus(id: string): void;
  /** Visible nodes projected to CSS pixels relative to the canvas (for lasso selection). */
  screenPositions(): { id: string; x: number; y: number }[];
}

interface Props {
  apiRef: MutableRefObject<NebulaHandle | null>;
  data: AppData;
  cut: ReadonlySet<string>;
  visDate: string; // latest event date already "ignited" by the scrubber ("" = none); changes only at event dates
  selected: string | null;
  gap: number; // counterfactual / actual - 1, drives NIFTY brightness
  mobile: boolean;
  quality: Quality;
  picked: ReadonlySet<string>; // multi-selection (shift-click / pick mode / lasso)
  pickMode: boolean; // taps toggle picks instead of opening the panel
  lasso: boolean; // orbit controls are off while the lasso overlay is active
  onPick(id: string): void;
  onlyMoving: boolean; // hide events with no detectable market impact
  showAll: boolean; // draw the dense same-channel / co-moved edges for every node
  width?: number;
  height?: number;
  onSelect(id: string | null): void;
  onAutoLow(): void; // auto mode measured slow frames and dropped to low quality
}

type N = GraphNode & {
  x?: number; y?: number; z?: number;
  fx?: number; fy?: number; fz?: number;
  r: number;
  __threeObj?: THREE.Group;
};
type L = Omit<GraphLink, "source" | "target"> & { source: string | N; target: string | N };

const LINK_COLOR: Record<GraphLink["type"], string> = {
  IMPACTED: "#38bdf8",
  MOVED: "#d9a21b",
  CORRELATED_WITH: "#e5e7eb",
  SAME_CHANNEL: "#64748b",
  CO_MOVED: "#a78bfa",
  PRECEDED: "#4ade80",
};
const DENSE: ReadonlySet<GraphLink["type"]> = new Set(["SAME_CHANNEL", "CO_MOVED"]);

/* ---------- shared GPU resources: one geometry, cached materials and textures ---------- */
const SPHERE = new THREE.SphereGeometry(1, 12, 12);
const meshMats = new Map<string, THREE.MeshBasicMaterial>();
const spriteMats = new Map<string, THREE.SpriteMaterial>();
const labelTex = new Map<string, THREE.CanvasTexture>();
let glowTex: THREE.Texture | null = null;

function glow(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.45)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
const meshMat = (color: string, opacity: number) => {
  const k = `${color}|${opacity}`;
  let m = meshMats.get(k);
  if (!m) meshMats.set(k, (m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity })));
  return m;
};
const spriteMat = (color: string, opacity: number) => {
  const k = `${color}|${opacity}`;
  let m = spriteMats.get(k);
  if (!m)
    spriteMats.set(
      k,
      (m = new THREE.SpriteMaterial({ map: glow(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })),
    );
  return m;
};
function labelSprite(text: string): THREE.Sprite {
  let t = labelTex.get(text);
  if (!t) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 48;
    const g = c.getContext("2d")!;
    g.font = "600 26px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillStyle = "rgba(228,228,231,.9)";
    g.fillText(text, 128, 32);
    labelTex.set(text, (t = new THREE.CanvasTexture(c)));
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(34, 6.4, 1);
  return s;
}

/** Darken a hex colour: lines have a single global opacity, so edge strength is shown as brightness. */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v * f).toString(16).padStart(2, "0");
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

function tooltip(n: N, data: AppData): string {
  if (n.kind !== "event") return `<div style="background:rgba(10,10,14,.92);border:1px solid #27272a;border-radius:8px;padding:6px 9px;color:#e5e7eb;font-size:12px"><b>${n.label}</b></div>`;
  const imp = data.impacts[n.id];
  const cat = CATEGORIES[n.category!];
  const bars = Object.entries(imp.sectors)
    .map(([s, v]) => {
      const w = Math.min(Math.abs(v.car) * 600, 40);
      const col = v.car >= 0 ? "#4ade80" : "#f87171";
      return `<div style="display:flex;align-items:center;gap:4px;font-size:10px"><span style="width:44px;color:#9ca3af">${s}</span><span style="display:inline-block;width:${w}px;height:6px;background:${col}"></span><span style="color:#9ca3af">${pct(v.car)}</span></div>`;
    })
    .join("");
  return `<div style="background:rgba(10,10,14,.92);border:1px solid #27272a;border-radius:8px;padding:8px 10px;max-width:260px;color:#e5e7eb;font-size:12px">
    <div style="font-weight:600;margin-bottom:2px">${n.label}</div>
    <div style="color:#9ca3af;font-size:11px">${n.date} · <span style="color:${cat.color}">${cat.label}</span></div>
    ${imp.context ? '<div style="margin:4px 0;color:#9ca3af">Context only: a monthly/structural aggregate, no measured impact</div>' : `<div style="margin:4px 0">CAR[-1,+5] <b>${pct(imp.car_5d)}</b> [${pct(imp.ci_low)}, ${pct(imp.ci_high)}] · 1-day AR <b>${pct(imp.car_1d)}</b><br/><span style="color:${imp.market_moving ? "#4ade80" : "#9ca3af"}">${imp.market_moving ? "● market-moving" : "○ no detectable market impact"}</span></div>`}
    ${bars}</div>`;
}

function NebulaImpl({
  apiRef, data, cut, visDate, selected, gap, mobile, quality, showAll, onlyMoving, picked, pickMode, lasso, onPick, width, height, onSelect, onAutoLow,
}: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fg = useRef<any>(null);
  const prevCut = useRef<ReadonlySet<string>>(cut);
  const gapRef = useRef(gap);
  gapRef.current = gap;
  const qRef = useRef<Quality>(quality);
  qRef.current = quality;
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const shards = useRef<{ pts: THREE.Points; vel: Float32Array; t0: number }[]>([]);
  const applyQ = useRef<(low: boolean) => void>(() => {});
  const flashes = useRef(new Map<string, number>()); // node id -> start time (ignite pulse)
  const prevVis = useRef(visDate);
  const fitted = useRef(false);

  const graph = useMemo(() => {
    let nodes: N[] = data.graph.nodes.map((n) => {
      const imp = data.impacts[n.id];
      let r = 5;
      if (n.kind === "event" && imp) {
        r = imp.context ? 2.6 : 1.6 + Math.min(Math.abs(imp.car_5d), 0.15) * 60;
        if (!imp.market_moving && !imp.context) r *= 0.7;
      } else if (n.kind === "driver") r = 3;
      return { ...n, r };
    });
    if (mobile) {
      const keep = new Set(
        nodes
          .filter((n) => n.kind === "event")
          .sort((a, b) => Math.abs(data.impacts[b.id].car_5d) - Math.abs(data.impacts[a.id].car_5d))
          .slice(0, 60)
          .map((n) => n.id),
      );
      nodes = nodes.filter((n) => n.kind !== "event" || keep.has(n.id));
    }
    const ids = new Set(nodes.map((n) => n.id));
    const drivers = nodes.filter((n) => n.kind === "driver");
    drivers.forEach((d, i) => {
      const a = (i / drivers.length) * Math.PI * 2;
      d.fx = Math.cos(a) * 60;
      d.fz = Math.sin(a) * 60;
      d.fy = (i % 2 ? 1 : -1) * 8;
    });
    const core = nodes.find((n) => n.id === "NIFTY")!;
    core.fx = core.fy = core.fz = 0;
    const links = data.graph.links.filter((l) => ids.has(l.source) && ids.has(l.target)).map((l) => ({ ...l }));
    return { nodes, links };
  }, [data, mobile]);
  const nodesRef = useRef<N[]>([]);
  nodesRef.current = graph.nodes;

  const stableVisible = useMemo(
    () => (n: N) =>
      !cut.has(n.id) &&
      !(n.kind === "event" && n.date! > visDate) &&
      !(onlyMoving && n.kind === "event" && !data.impacts[n.id]?.market_moving),
    [cut, visDate, onlyMoving, data],
  );

  const linkVisible = useCallback(
    (l: L) => {
      const s = (typeof l.source === "object" ? l.source : nodesRef.current.find((n) => n.id === l.source)) as N;
      const t = (typeof l.target === "object" ? l.target : nodesRef.current.find((n) => n.id === l.target)) as N;
      if (!s || !t || !stableVisible(s) || !stableVisible(t)) return false;
      if (DENSE.has(l.type) && !showAll && s.id !== selected && t.id !== selected) return false;
      return true;
    },
    [stableVisible, showAll, selected],
  );

  const nodeObject = useCallback(
    (n: N) => {
      const g = new THREE.Group();
      let color = n.kind === "index" ? "#38bdf8" : "#ffffff";
      let opacity = 1;
      let halo = "#38bdf8";
      let haloA = 0.3;
      if (n.kind === "event") {
        const imp = data.impacts[n.id];
        color = imp.context ? "#94a3b8" : CATEGORIES[n.category!].color;
        opacity = imp.market_moving || imp.context ? 1 : 0.4;
        halo = imp.context ? "#64748b" : imp.car_5d < 0 ? "#ef4444" : "#22c55e";
        haloA = imp.context ? 0.12 : 0.5 * opacity;
      } else if (n.kind === "driver") {
        color = "#fde68a";
        halo = "#f59e0b";
        haloA = 0.2;
      }
      const sphere = new THREE.Mesh(SPHERE, meshMat(color, opacity));
      sphere.scale.setScalar(n.r);
      sphere.name = "core";
      g.add(sphere);
      const sprite = new THREE.Sprite(spriteMat(halo, haloA));
      sprite.name = "halo";
      sprite.scale.setScalar(n.r * (n.kind === "index" ? 5 : 4));
      g.add(sprite);
      if (n.kind !== "event") {
        const lbl = labelSprite(n.kind === "index" ? "NIFTY 50" : n.label);
        lbl.position.y = n.r + 6;
        g.add(lbl);
      }
      return g;
    },
    [data],
  );

  apiRef.current = {
    canvas: () => {
      const f = fg.current;
      if (!f) return null;
      f.postProcessingComposer?.().render();
      return f.renderer().domElement as HTMLCanvasElement;
    },
    focus: (id: string) => {
      const n = nodesRef.current.find((x) => x.id === id);
      if (n && n.x != null) flyTo(n, 90, 1000);
    },
    screenPositions: () => {
      const f = fg.current;
      if (!f) return [];
      const cam = f.camera() as THREE.Camera;
      const el = f.renderer().domElement as HTMLCanvasElement;
      const v = new THREE.Vector3();
      const out: { id: string; x: number; y: number }[] = [];
      for (const n of nodesRef.current) {
        if (n.kind !== "event" || n.x == null || !n.__threeObj?.visible) continue;
        v.set(n.x, n.y!, n.z!).project(cam);
        if (v.z > 1) continue; // behind the camera
        out.push({ id: n.id, x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight });
      }
      return out;
    },
  };

  /** Move the camera to `dist` beyond a node along the line from the origin; safe for the origin node. */
  const flyTo = (n: N, dist: number, ms: number) => {
    const len = Math.hypot(n.x ?? 0, n.y ?? 0, n.z ?? 0);
    const k = len < 1 ? 0 : 1 + dist / len;
    const pos = len < 1 ? { x: 0, y: 0, z: dist * 2.2 } : { x: n.x! * k, y: n.y! * k, z: n.z! * k };
    fg.current?.cameraPosition(pos, { x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 }, ms);
  };

  // one-time scene setup: bloom, starfield, orbit auto-rotate, animation loop
  useEffect(() => {
    const f = fg.current;
    if (!f) return;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __fg: unknown }).__fg = { f, nodes: () => nodesRef.current };
    f.cameraPosition({ x: 0, y: 30, z: mobile ? 420 : 330 });
    const scene: THREE.Scene = f.scene();
    const renderer: THREE.WebGLRenderer = f.renderer();
    const composer = f.postProcessingComposer();
    const el = renderer.domElement;
    const canBloom = !mobile && renderer.capabilities.maxTextureSize >= 8192;
    const bloom = new UnrealBloomPass(new THREE.Vector2(el.clientWidth, el.clientHeight), 0.9, 0.5, 0.55);
    if (canBloom) composer.addPass(bloom);

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    applyQ.current = (low: boolean) => {
      const pr = low || mobile ? 1 : dpr;
      renderer.setPixelRatio(pr);
      composer.setPixelRatio?.(pr);
      composer.setSize(el.clientWidth, el.clientHeight);
      bloom.enabled = !low && canBloom;
    };
    applyQ.current(qRef.current === "low");

    const sp = new Float32Array(2000 * 3);
    for (let i = 0; i < sp.length; i += 3) {
      const r = 700 + Math.random() * 900;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      sp[i] = r * Math.sin(ph) * Math.cos(th);
      sp[i + 1] = r * Math.sin(ph) * Math.sin(th);
      sp[i + 2] = r * Math.cos(ph);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    const stars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({ color: "#9ca3af", size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.55 }),
    );
    scene.add(stars);

    const controls = f.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.43; // ≈ 0.15 rad/s
    const pause = () => {
      controls.autoRotate = false;
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => (controls.autoRotate = true), 4000);
    };
    el.addEventListener("pointerdown", pause);
    el.addEventListener("wheel", pause, { passive: true });

    let raf = 0;
    let last = performance.now();
    const t0 = last;
    let frames = 0;
    let acc = 0;
    let dropped = false;
    const loop = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (!document.hidden) {
        // adaptive quality: if auto mode averages > 34 ms/frame over 90 frames (after warm-up), go low
        if (qRef.current === "auto" && !dropped && dt < 500) {
          frames++;
          if (frames > 60) acc += dt;
          if (frames === 150) {
            if (acc / 90 > 34) {
              dropped = true;
              applyQ.current(true);
              onAutoLowRef.current();
            }
            acc = 0;
            frames = 60;
          }
        }
        const t = (now - t0) / 1000;
        stars.rotation.y = t * 0.004;
        const core = nodesRef.current.find((n) => n.id === "NIFTY");
        const obj = core?.__threeObj;
        if (obj) {
          obj.scale.setScalar(1 + 0.06 * Math.sin(t * 2));
          const halo = obj.getObjectByName("halo") as THREE.Sprite | undefined;
          // brighter when the counterfactual sits above reality
          if (halo) halo.material = spriteMat("#38bdf8", Math.round(Math.min(0.7, 0.25 + Math.abs(gapRef.current) * 3) * 20) / 20);
        }
        if (flashes.current.size) {
          for (const [id, st] of flashes.current) {
            const n = nodesRef.current.find((x) => x.id === id);
            const halo = n?.__threeObj?.getObjectByName("halo") as THREE.Sprite | undefined;
            const age = (now - st) / 900;
            if (!n || !halo || age >= 1) {
              halo?.scale.setScalar(n ? n.r * 4 : 1);
              flashes.current.delete(id);
            } else halo.scale.setScalar(n.r * (4 + 9 * Math.sin(Math.PI * age)));
          }
        }
        shards.current = shards.current.filter((s) => {
          const age = (now - s.t0) / 1200;
          if (age >= 1) {
            scene.remove(s.pts);
            s.pts.geometry.dispose();
            (s.pts.material as THREE.Material).dispose();
            return false;
          }
          const pos = s.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
          for (let i = 0; i < pos.count; i++)
            pos.setXYZ(i, pos.getX(i) + s.vel[i * 3], pos.getY(i) + s.vel[i * 3 + 1], pos.getZ(i) + s.vel[i * 3 + 2]);
          pos.needsUpdate = true;
          (s.pts.material as THREE.PointsMaterial).opacity = 1 - age;
          return true;
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    f.d3Force("charge")?.strength(-45);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(idleTimer.current);
      el.removeEventListener("pointerdown", pause);
      el.removeEventListener("wheel", pause);
      scene.remove(stars);
      sg.dispose();
      if (canBloom) {
        composer.removePass(bloom);
        bloom.dispose();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onAutoLowRef = useRef(onAutoLow);
  onAutoLowRef.current = onAutoLow;

  useEffect(() => {
    applyQ.current(quality === "low");
  }, [quality]);

  // pulse events as the scrubber ignites them
  useEffect(() => {
    const from = prevVis.current;
    prevVis.current = visDate;
    if (quality === "low" || visDate <= from) return;
    const fresh = nodesRef.current.filter((n) => n.kind === "event" && n.date! > from && n.date! <= visDate && !cut.has(n.id));
    if (fresh.length > 0 && fresh.length <= 8) fresh.forEach((n) => flashes.current.set(n.id, performance.now()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visDate]);

  // shatter newly cut nodes (skipped in low quality or for bulk cuts)
  useEffect(() => {
    const f = fg.current;
    const added = [...cut].filter((id) => !prevCut.current.has(id));
    prevCut.current = cut;
    if (!f || added.length === 0 || added.length > 12 || quality === "low") return;
    const scene: THREE.Scene = f.scene();
    for (const id of added) {
      const n = nodesRef.current.find((x) => x.id === id);
      if (!n || n.x == null) continue;
      const count = 200;
      const p = new Float32Array(count * 3);
      const v = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        p[i * 3] = n.x;
        p[i * 3 + 1] = n.y!;
        p[i * 3 + 2] = n.z!;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        const s = 0.2 + Math.random() * 0.9;
        v[i * 3] = Math.sin(ph) * Math.cos(th) * s;
        v[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * s;
        v[i * 3 + 2] = Math.cos(ph) * s;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
      const col = n.category ? CATEGORIES[n.category].color : "#ffffff";
      const pts = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ color: col, size: 2.2, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      scene.add(pts);
      shards.current.push({ pts, vel: v, t0: performance.now() });
    }
  }, [cut, quality]);

  // selected / picked node emphasis (picked nodes get a bright cyan halo)
  useEffect(() => {
    for (const n of nodesRef.current) {
      const g = n.__threeObj;
      const core = g?.getObjectByName("core");
      const halo = g?.getObjectByName("halo") as THREE.Sprite | undefined;
      const isPicked = picked.has(n.id);
      if (core) core.scale.setScalar(n.r * (isPicked ? 1.5 : n.id === selected ? 1.35 : 1));
      if (halo) {
        halo.userData.orig ??= halo.material;
        halo.material = isPicked ? spriteMat("#22d3ee", 0.95) : (halo.userData.orig as THREE.SpriteMaterial);
        if (isPicked) halo.scale.setScalar(n.r * 6);
        else if (!flashes.current.has(n.id)) halo.scale.setScalar(n.r * (n.kind === "index" ? 5 : 4));
      }
    }
  }, [selected, picked]);

  // lasso mode: let the overlay own the pointer, not the orbit controls
  useEffect(() => {
    const c = fg.current?.controls();
    if (c) c.enabled = !lasso;
  }, [lasso]);

  const low = quality === "low";
  const nodeLabel = useCallback((n: N) => tooltip(n, data), [data]);
  const onNodeClick = useCallback(
    (n: N, ev?: MouseEvent) => {
      if (n.kind === "event" && (pickMode || ev?.shiftKey)) {
        onPick(n.id);
        return;
      }
      onSelect(n.id);
      if (n.x != null) flyTo(n, 110, 900);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onSelect, onPick, pickMode],
  );
  const onNodeHover = useCallback((n: N | null) => {
    const c = fg.current?.controls();
    if (!c) return;
    c.autoRotate = !n;
    clearTimeout(idleTimer.current);
    if (n) idleTimer.current = setTimeout(() => (c.autoRotate = true), 4000);
  }, []);
  const onBg = useCallback(() => onSelect(null), [onSelect]);
  const linkColor = useCallback(
    (l: GraphLink) => shade(LINK_COLOR[l.type], 0.35 + 0.65 * Math.min(l.type === "IMPACTED" ? l.weight / 0.06 : l.weight, 1)),
    [],
  );
  const particles = useCallback((l: GraphLink) => (!low && l.type === "IMPACTED" && l.weight >= 0.03 ? 1 : 0), [low]);
  const onEngineStop = useCallback(() => {
    if (fitted.current) return;
    fitted.current = true;
    const maxR = Math.max(...nodesRef.current.map((n) => Math.hypot(n.x ?? 0, n.y ?? 0, n.z ?? 0)), 60);
    fg.current?.cameraPosition({ x: 0, y: maxR * 0.25, z: maxR * (mobile ? 3.4 : 2.5) + 30 }, { x: 0, y: 0, z: 0 }, 800);
  }, [mobile]);
  return (
    <ForceGraph3D
      ref={fg}
      graphData={graph}
      width={width}
      height={height}
      backgroundColor="#000000"
      showNavInfo={false}
      controlType="orbit"
      rendererConfig={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
      enableNodeDrag={false}
      nodeThreeObject={nodeObject as never}
      nodeThreeObjectExtend={false}
      nodeVisibility={stableVisible as never}
      nodeLabel={nodeLabel as never}
      onNodeClick={onNodeClick as never}
      onNodeHover={onNodeHover as never}
      onBackgroundClick={onBg}
      linkVisibility={linkVisible as never}
      linkColor={linkColor as never}
      linkOpacity={0.35}
      linkWidth={0}
      linkDirectionalParticles={particles as never}
      linkDirectionalParticleWidth={1.1}
      linkDirectionalParticleSpeed={0.006}
      warmupTicks={60}
      cooldownTicks={100}
      d3AlphaDecay={0.04}
      d3VelocityDecay={0.35}
      onEngineStop={onEngineStop}
    />
  );
}

export default memo(NebulaImpl);
