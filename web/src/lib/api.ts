import type { Source } from "../types";

export type Endpoint = "refresh" | "trader";

export interface Fetched<T> {
  data: T;
  source: Source;
}

/**
 * Always the relative `api/<name>.json`:
 *  - server.js answers it live (its routes match by prefix) and tags X-CT-Source: live
 *  - the static host serves the frozen snapshot built by build.js
 *  - Vite dev proxies /api to server.js
 */
export async function getJson<T>(name: Endpoint, signal?: AbortSignal): Promise<Fetched<T>> {
  const res = await fetch(`api/${name}.json`, { cache: "no-cache", signal });
  if (!res.ok) throw new Error(`api/${name} returned HTTP ${res.status}`);
  const source: Source = res.headers.get("x-ct-source") === "live" ? "live" : "snapshot";
  const data = (await res.json()) as T;
  return { data, source };
}
