import { useSyncExternalStore } from "react";

export type Page = "dashboard" | "trader";

export interface Route {
  page: Page;
  scenario?: string;
  positionId?: string;
}

/** Hash routes keep every path relative, so the site works from any subfolder. */
export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, "");
  if (h === "pageTrader") return { page: "trader" };
  if (h === "pageDashboard" || h === "") return { page: "dashboard" };
  const [path, query = ""] = h.split("?");
  const params = new URLSearchParams(query);
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "trader") {
    return parts[1] === "p" && parts[2] ? { page: "trader", positionId: parts[2] } : { page: "trader" };
  }
  const s = params.get("s");
  return s ? { page: "dashboard", scenario: s } : { page: "dashboard" };
}

export function toHash(r: Route): string {
  if (r.page === "trader") return r.positionId ? `#/trader/p/${encodeURIComponent(r.positionId)}` : "#/trader";
  return r.scenario ? `#/?s=${encodeURIComponent(r.scenario)}` : "#/";
}

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

let lastHash = "";
let lastRoute: Route = { page: "dashboard" };
function snapshot(): Route {
  const h = window.location.hash;
  if (h !== lastHash) {
    lastHash = h;
    lastRoute = parseHash(h);
  }
  return lastRoute;
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot, () => lastRoute);
}

export function navigate(r: Route, opts: { replace?: boolean } = {}) {
  const hash = toHash(r);
  if (hash === window.location.hash) return;
  if (opts.replace) {
    history.replaceState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = hash;
  }
}
