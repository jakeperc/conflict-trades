import { useEffect, useState, useSyncExternalStore } from "react";

function mediaStore(query: string) {
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const subscribe = (cb: () => void) => {
    if (!window.matchMedia) return () => {};
    const mq = window.matchMedia(query);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  };
  return { get, subscribe };
}

const reduced = mediaStore("(prefers-reduced-motion: reduce)");
const finePointer = mediaStore("(hover: hover) and (pointer: fine)");

export function useReducedMotion(): boolean {
  return useSyncExternalStore(reduced.subscribe, reduced.get, () => false);
}

export function useFinePointer(): boolean {
  return useSyncExternalStore(finePointer.subscribe, finePointer.get, () => true);
}

let webgl2: boolean | null = null;
export function hasWebGL2(): boolean {
  if (webgl2 != null) return webgl2;
  try {
    const c = document.createElement("canvas");
    webgl2 = !!c.getContext("webgl2");
  } catch {
    webgl2 = false;
  }
  return webgl2;
}

/**
 * Hub convention: WebGL by default only on desktop (fine pointer), motion allowed, WebGL2,
 * and >= 4 GB device memory. Everyone else gets the SVG map. `?gl=1|0` / palette overrides.
 */
export function decideGl(pref: "auto" | "on" | "off", reducedMotion: boolean, fine: boolean): boolean {
  if (pref === "off") return false;
  if (!hasWebGL2()) return false;
  if (pref === "on") return true;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return fine && !reducedMotion && (mem == null || mem >= 4);
}

/** True while the element is on screen. */
export function useOnScreen<T extends Element>(ref: React.RefObject<T | null>, rootMargin = "0px"): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return on;
}

export function usePageVisible(): boolean {
  const [vis, setVis] = useState(() => (typeof document === "undefined" ? true : !document.hidden));
  useEffect(() => {
    const f = () => setVis(!document.hidden);
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  return vis;
}
