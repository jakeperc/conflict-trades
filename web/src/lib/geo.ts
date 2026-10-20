import type { LngLat } from "../types";

const RAD = Math.PI / 180;

/** Globe convention: lng 0 / lat 0 faces +Z (the camera); +Y is north. */
export function lngLatToXYZ([lng, lat]: LngLat, r = 1): [number, number, number] {
  const phi = lat * RAD;
  const lam = lng * RAD;
  return [r * Math.cos(phi) * Math.sin(lam), r * Math.sin(phi), r * Math.cos(phi) * Math.cos(lam)];
}

/** Great-circle points between two coordinates, lifted into an arc whose height scales with distance. */
export function arcPoints(from: LngLat, to: LngLat, segments = 64, r = 1): [number, number, number][] {
  const a = lngLatToXYZ(from, 1);
  const b = lngLatToXYZ(to, 1);
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  const lift = 0.03 + omega * 0.075;
  const out: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let p: [number, number, number];
    if (omega < 1e-6) p = a;
    else {
      const s0 = Math.sin((1 - t) * omega) / Math.sin(omega);
      const s1 = Math.sin(t * omega) / Math.sin(omega);
      p = [a[0] * s0 + b[0] * s1, a[1] * s0 + b[1] * s1, a[2] * s0 + b[2] * s1];
    }
    const h = r * (1 + lift * Math.sin(Math.PI * t));
    out.push([p[0] * h, p[1] * h, p[2] * h]);
  }
  return out;
}

export function centroid(points: LngLat[]): LngLat {
  if (!points.length) return [60, 30];
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
}

/** Shortest signed longitude difference, -180..180. */
export function lngDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* ---------- flat (equirectangular) map ---------- */

export interface FlatView {
  lng0: number;
  lng1: number;
  lat0: number;
  lat1: number;
  width: number;
  height: number;
}

export function project(view: FlatView, lng: number, lat: number): [number, number] {
  const x = ((lng - view.lng0) / (view.lng1 - view.lng0)) * view.width;
  const y = ((view.lat1 - lat) / (view.lat1 - view.lat0)) * view.height;
  return [x, y];
}

/** Pick the copy of `lng` (±360) that lands inside the view. */
export function wrapInto(view: FlatView, lng: number): number {
  for (const k of [0, 360, -360]) {
    const v = lng + k;
    if (v >= view.lng0 && v <= view.lng1) return v;
  }
  return lng;
}

/** Endpoints for a flat-map lane: unwrap `to` so the lane takes the short way round, then shift into view. */
export function flatLane(view: FlatView, from: LngLat, to: LngLat): { a: [number, number]; b: [number, number]; c: [number, number] } {
  const f = wrapInto(view, from[0]);
  const t = f + lngDelta(f, to[0]);
  const a = project(view, f, from[1]);
  const b = project(view, t, to[1]);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  // Bow the curve toward the pole, like a great circle on this projection.
  const bow = Math.min(len * 0.22, 90);
  const c: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - bow];
  return { a, b, c };
}
