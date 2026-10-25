import { useEffect, useRef, useState } from "react";

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/** Smoothly animate a number toward `target` (ms duration). */
export function useTweenNumber(target: number, ms = 450): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  const cur = useRef(target);
  useEffect(() => {
    from.current = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min((now - t0) / ms, 1);
      cur.current = from.current + (target - from.current) * ease(k);
      setV(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** Progress 0..1 that restarts whenever `key` changes; use to morph between two arrays. */
export function useTweenProgress(key: unknown, ms = 380): number {
  const [p, setP] = useState(1);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min((now - t0) / ms, 1);
      setP(ease(k));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    setP(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key, ms]);
  return p;
}
