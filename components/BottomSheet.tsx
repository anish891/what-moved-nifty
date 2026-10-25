"use client";

import { useEffect, useRef, useState } from "react";

type Snap = "peek" | "half" | "full";
const FRAC: Record<Snap, number> = { peek: 0.2, half: 0.52, full: 0.88 };

interface Props {
  children: React.ReactNode;
  onClose(): void;
  /** swipe left (+1 = next) / right (-1 = previous) on the content; omit to disable */
  onSwipe?(dir: 1 | -1): void;
  /** change this to snap back to "half" (e.g. when a new event is shown) */
  resetKey?: string;
}

/**
 * Mobile bottom sheet: drag the handle to snap between peek / half / full, drag down from peek to dismiss.
 * Horizontal swipes on the content step through events.
 */
export default function BottomSheet({ children, onClose, onSwipe, resetKey }: Props) {
  const [snap, setSnap] = useState<Snap>("half");
  const [dragY, setDragY] = useState<number | null>(null); // live height in px while dragging
  const start = useRef<{ y: number; h: number; t: number } | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [vh, setVh] = useState(800);

  useEffect(() => {
    const u = () => setVh(sheet.current?.parentElement?.clientHeight ?? window.innerHeight);
    u();
    window.addEventListener("resize", u);
    return () => window.removeEventListener("resize", u);
  }, []);
  useEffect(() => setSnap("half"), [resetKey]);

  const height = dragY ?? FRAC[snap] * vh;

  return (
    <div
      ref={sheet}
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-zinc-700 bg-zinc-950/95 shadow-[0_-12px_40px_rgba(0,0,0,.6)] backdrop-blur"
      style={{ height, transition: dragY == null ? "height .22s cubic-bezier(.2,.8,.2,1)" : "none" }}
    >
      <div
        className="flex h-8 shrink-0 cursor-grab touch-none items-center justify-center"
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* synthetic or already-released pointer: dragging still works while over the handle */
          }
          start.current = { y: e.clientY, h: height, t: performance.now() };
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          setDragY(Math.max(40, Math.min(vh * 0.92, start.current.h + (start.current.y - e.clientY))));
        }}
        onPointerUp={(e) => {
          const s = start.current;
          start.current = null;
          if (!s) return;
          const h = Math.max(40, Math.min(vh * 0.92, s.h + (s.y - e.clientY)));
          const v = (s.y - e.clientY) / Math.max(performance.now() - s.t, 1); // px/ms, + = upward
          setDragY(null);
          if (h < vh * 0.13 || (v < -0.9 && h < vh * 0.35)) return onClose();
          const target = v > 0.6 ? (h > vh * 0.45 ? "full" : "half") : v < -0.6 ? (h < vh * 0.5 ? "peek" : "half") : (Object.entries(FRAC).sort((a, b) => Math.abs(a[1] * vh - h) - Math.abs(b[1] * vh - h))[0][0] as Snap);
          setSnap(target);
        }}
        onDoubleClick={() => setSnap((s) => (s === "full" ? "half" : "full"))}
        aria-label="Drag to resize"
      >
        <span className="h-1 w-10 rounded-full bg-zinc-600" />
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-4"
        style={{ touchAction: "pan-y" }}
        onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s || !onSwipe) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (Math.abs(dx) > 70 && Math.abs(dy) < 45) onSwipe(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => (swipe.current = null)}
      >
        {children}
      </div>
    </div>
  );
}
