"use client";

import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { CATEGORIES, pct } from "@/lib/categories";
import type { AppData, GraphLink, GraphNode } from "@/lib/types";

export interface NebulaHandle {
  canvas(): HTMLCanvasElement | null;
  focus(id: string): void;
}

interface Props {
  apiRef: MutableRefObject<NebulaHandle | null>;
  data: AppData;
  cut: ReadonlySet<string>;
  scrub: string; // ISO date; events after it are not yet "ignited"
  selected: string | null;
  gap: number; // counterfactual / actual - 1, drives NIFTY brightness
  mobile: boolean;
  width?: number;
  height?: number;
  onSelect(id: string | null): void;
}

type N = GraphNode & { x?: number; y?: number; z?: number; fx?: number; fy?: number; fz?: number; r: number };

const LINK_COLOR: Record<GraphLink["type"], string> = {
  IMPACTED: "#38bdf8",
  MOVED: "#fbbf24",
  CORRELATED_WITH: "#e5e7eb",
  SAME_CHANNEL: "#64748b",
  CO_MOVED: "#a78bfa",
  PRECEDED: "#4ade80",
};

let glowTex: THREE.Texture | null = null;
function glow(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.45)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

function tooltip(n: N, data: AppData): string {
  if (n.kind !== "event") return `<div class="tt"><b>${n.label}</b></div>`;
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
    <div style="margin:4px 0">CAR[-1,+5] <b>${pct(imp.car_5d)}</b> [${pct(imp.ci_low)}, ${pct(imp.ci_high)}] · 1-day AR <b>${pct(imp.car_1d)}</b>${imp.significant ? "" : ' · <span style="color:#9ca3af">not significant</span>'}</div>
    ${bars}</div>`;
}

export default function Nebula({ apiRef, data, cut, scrub, selected, gap, mobile, width, height, onSelect }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fg = useRef<any>(null);
  const prevCut = useRef<ReadonlySet<string>>(cut);
  const gapRef = useRef(gap);
  gapRef.current = gap;
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const shards = useRef<{ pts: THREE.Points; vel: Float32Array; t0: number }[]>([]);

  const graph = useMemo(() => {
    let nodes: N[] = data.graph.nodes.map((n) => {
      const imp = data.impacts[n.id];
      let r = 5;
      if (n.kind === "event" && imp) {
        r = 1.6 + Math.min(Math.abs(imp.car_5d), 0.15) * 60;
        if (!imp.significant) r *= 0.7;
      } else if (n.kind === "driver") r = 3;
      else r = 5;
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
    const links = data.graph.links
      .filter((l) => ids.has(l.source) && ids.has(l.target))
      .map((l) => ({ ...l }));
    return { nodes, links };
  }, [data, mobile]);

  const fitted = useRef(false);
  /** Move the camera to `dist` beyond a node along the line from the origin; safe for the origin node. */
  const flyTo = (n: N, dist: number, ms: number) => {
    const len = Math.hypot(n.x ?? 0, n.y ?? 0, n.z ?? 0);
    const k = len < 1 ? 0 : 1 + dist / len;
    const pos = len < 1 ? { x: 0, y: 0, z: dist * 2.2 } : { x: n.x! * k, y: n.y! * k, z: n.z! * k };
    fg.current?.cameraPosition(pos, { x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 }, ms);
  };
  const graphRef = useRef<N[]>([]);
  graphRef.current = graph.nodes;

  const isVisible = useCallback(
    (n: N) => {
      if (cut.has(n.id)) return false;
      if (n.kind === "event" && n.date! > scrub) return false;
      return true;
    },
    [cut, scrub],
  );

  const nodeObject = useCallback(
    (n: N) => {
      const g = new THREE.Group();
      let color = n.kind === "index" ? "#38bdf8" : "#ffffff";
      let opacity = 1;
      let halo = "#38bdf8";
      if (n.kind === "event") {
        const imp = data.impacts[n.id];
        color = CATEGORIES[n.category!].color;
        opacity = imp.significant ? 1 : 0.4;
        halo = imp.car_5d < 0 ? "#ef4444" : "#22c55e";
      } else if (n.kind === "driver") {
        color = "#fde68a";
        halo = "#f59e0b";
      }
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(n.r, 20, 20),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity }),
      );
      sphere.name = "core";
      g.add(sphere);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glow(),
          color: halo,
          transparent: true,
          opacity: opacity * (n.kind === "index" ? 0.3 : n.kind === "driver" ? 0.2 : 0.5),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      sprite.name = "halo";
      sprite.scale.setScalar(n.r * (n.kind === "index" ? 5 : 4));
      g.add(sprite);
      return g;
    },
    [data],
  );

  apiRef.current = {
    canvas: () => (fg.current?.renderer?.().domElement as HTMLCanvasElement) ?? null,
    focus: (id: string) => {
      const n = graph.nodes.find((x) => x.id === id);
      if (!n || n.x == null || !fg.current) return;
      flyTo(n, 90, 1000);
    },
  };

  // one-time scene setup: bloom, starfield, orbit auto-rotate, animation loop
  useEffect(() => {
    const f = fg.current;
    if (!f) return;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __fg: unknown }).__fg = { f, nodes: () => graphRef.current };
    f.cameraPosition({ x: 0, y: 30, z: mobile ? 420 : 330 });
    const scene: THREE.Scene = f.scene();
    const renderer: THREE.WebGLRenderer = f.renderer();
    const lowEnd = mobile || renderer.capabilities.maxTextureSize < 8192;
    if (!lowEnd) {
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      f.postProcessingComposer().addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.9, 0.5, 0.55));
    }
    const sp = new Float32Array(3000 * 3);
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
    const el = renderer.domElement;
    el.addEventListener("pointerdown", pause);
    el.addEventListener("wheel", pause, { passive: true });

    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      stars.rotation.y = t * 0.004;
      // pulse NIFTY core; brighter when the counterfactual sits above reality
      const core = graphRef.current.find((n) => n.id === "NIFTY") as (N & { __threeObj?: THREE.Group }) | undefined;
      const obj = core?.__threeObj;
      if (obj) {
        const k = 1 + 0.06 * Math.sin(t * 2);
        obj.scale.setScalar(k);
        const halo = obj.getObjectByName("halo") as THREE.Sprite | undefined;
        if (halo) (halo.material as THREE.SpriteMaterial).opacity = Math.min(0.7, 0.25 + Math.abs(gapRef.current) * 3);
      }
      // shatter particles
      const now = performance.now();
      shards.current = shards.current.filter((s) => {
        const age = (now - s.t0) / 1200;
        if (age >= 1) {
          scene.remove(s.pts);
          s.pts.geometry.dispose();
          return false;
        }
        const pos = s.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          pos.setXYZ(i, pos.getX(i) + s.vel[i * 3], pos.getY(i) + s.vel[i * 3 + 1], pos.getZ(i) + s.vel[i * 3 + 2]);
        }
        pos.needsUpdate = true;
        (s.pts.material as THREE.PointsMaterial).opacity = 1 - age;
        return true;
      });
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // shatter newly cut nodes
  useEffect(() => {
    const f = fg.current;
    const added = [...cut].filter((id) => !prevCut.current.has(id));
    prevCut.current = cut;
    if (!f || added.length === 0 || added.length > 12) return;
    const scene: THREE.Scene = f.scene();
    for (const id of added) {
      const n = graph.nodes.find((x) => x.id === id);
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
        const sp = 0.2 + Math.random() * 0.9;
        v[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
        v[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * sp;
        v[i * 3 + 2] = Math.cos(ph) * sp;
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
  }, [cut, graph.nodes]);

  // selected-node ring emphasis
  useEffect(() => {
    for (const n of graph.nodes as (N & { __threeObj?: THREE.Group })[]) {
      const core = n.__threeObj?.getObjectByName("core") as THREE.Mesh | undefined;
      if (core) core.scale.setScalar(n.id === selected ? 1.35 : 1);
    }
  }, [selected, graph.nodes]);

  const linkVisible = useCallback(
    (l: GraphLink & { source: string | N; target: string | N }) => {
      const s = typeof l.source === "object" ? l.source : graph.nodes.find((n) => n.id === l.source)!;
      const t = typeof l.target === "object" ? l.target : graph.nodes.find((n) => n.id === l.target)!;
      return isVisible(s as N) && isVisible(t as N);
    },
    [graph.nodes, isVisible],
  );

  return (
    <ForceGraph3D
      ref={fg}
      graphData={graph}
      width={width}
      height={height}
      backgroundColor="#000000"
      showNavInfo={false}
      controlType="orbit"
      rendererConfig={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
      enableNodeDrag={false}
      nodeThreeObject={nodeObject as never}
      nodeThreeObjectExtend={false}
      nodeVisibility={isVisible as never}
      nodeLabel={((n: N) => tooltip(n, data)) as never}
      onNodeClick={((n: N) => {
        onSelect(n.id);
        const f = fg.current;
        if (f && n.x != null) flyTo(n, 110, 900);
      }) as never}
      onNodeHover={((n: N | null) => {
        const c = fg.current?.controls();
        if (!c) return;
        c.autoRotate = !n;
        clearTimeout(idleTimer.current);
        if (n) idleTimer.current = setTimeout(() => (c.autoRotate = true), 4000);
      }) as never}
      onBackgroundClick={() => onSelect(null)}
      linkVisibility={linkVisible as never}
      linkColor={((l: GraphLink) => LINK_COLOR[l.type]) as never}
      linkOpacity={0.2}
      linkWidth={((l: GraphLink) => (l.type === "IMPACTED" ? 0.2 : 0.15 + l.weight * 0.9)) as never}
      linkDirectionalParticles={((l: GraphLink) => (l.type === "IMPACTED" || l.type === "MOVED" ? 2 : 0)) as never}
      linkDirectionalParticleWidth={1.1}
      linkDirectionalParticleSpeed={0.006}
      cooldownTicks={200}
      onEngineStop={() => {
        if (fitted.current) return;
        fitted.current = true;
        const maxR = Math.max(...graph.nodes.map((n) => Math.hypot(n.x ?? 0, n.y ?? 0, n.z ?? 0)), 60);
        fg.current?.cameraPosition({ x: 0, y: maxR * 0.25, z: maxR * (mobile ? 3.4 : 2.5) + 30 }, { x: 0, y: 0, z: 0 }, 800);
      }}
    />
  );
}
