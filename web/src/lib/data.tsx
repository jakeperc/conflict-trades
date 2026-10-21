import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RefreshPayload, Source, TraderPayload } from "../types";
import { getJson } from "./api";
import { parseStored, readLocal, roll, sessionId, writeLocal, type Rolled } from "./baseline";
import { traderKpis, traderSnapshot, type TraderSnapshot } from "./derive";

const REFRESH_KEY = "conflict-dashboard-last-payload";
const TRADER_KEY = "ct-trader-baseline";

const isPayload = (x: unknown): x is RefreshPayload =>
  !!x && typeof x === "object" && "scenarios" in x && "generatedAt" in x;
const isSnapshot = (x: unknown): x is TraderSnapshot => !!x && typeof x === "object" && "openIds" in x;

// Read once at module init, outside React, so StrictMode double effects can't race the baseline.
const SESSION = sessionId();
let refreshStore: Rolled<RefreshPayload> = parseStored(readLocal(REFRESH_KEY), isPayload);
let traderStore: Rolled<TraderSnapshot> = parseStored(readLocal(TRADER_KEY), isSnapshot);

export type LoadStatus = "loading" | "ok" | "error";

export interface Slot<T> {
  data: T | null;
  status: LoadStatus;
  error: string | null;
  /** True while showing the cached copy from the last visit (stale-while-revalidate). */
  fromCache: boolean;
  receivedAt: number | null;
}

interface DataCtx {
  refresh: Slot<RefreshPayload>;
  trader: Slot<TraderPayload>;
  baseline: RefreshPayload | null;
  traderBaseline: TraderSnapshot | null;
  source: Source | null;
  reload: () => void;
  reloadTrader: () => void;
}

const Ctx = createContext<DataCtx | null>(null);

const POLL_LIVE = 60_000;
const POLL_SNAPSHOT = 10 * 60_000;

export function DataProvider({ children }: { children: ReactNode }) {
  const [refresh, setRefresh] = useState<Slot<RefreshPayload>>(() => ({
    data: refreshStore.current,
    status: "loading",
    error: null,
    fromCache: !!refreshStore.current,
    receivedAt: null
  }));
  const [baseline, setBaseline] = useState<RefreshPayload | null>(refreshStore.baseline);
  const [trader, setTrader] = useState<Slot<TraderPayload>>({ data: null, status: "loading", error: null, fromCache: false, receivedAt: null });
  const [traderBaseline, setTraderBaseline] = useState<TraderSnapshot | null>(traderStore.baseline);
  const [source, setSource] = useState<Source | null>(null);
  const refreshAbort = useRef<AbortController | null>(null);
  const traderAbort = useRef<AbortController | null>(null);

  const loadRefresh = useCallback(async () => {
    refreshAbort.current?.abort();
    const ac = new AbortController();
    refreshAbort.current = ac;
    setRefresh((s) => ({ ...s, status: "loading", error: null }));
    try {
      const { data, source: src } = await getJson<RefreshPayload>("refresh", ac.signal);
      refreshStore = roll(refreshStore, data, (p) => p.generatedAt, SESSION);
      writeLocal(REFRESH_KEY, refreshStore);
      setBaseline(refreshStore.baseline);
      setSource(src);
      setRefresh({ data, status: "ok", error: null, fromCache: false, receivedAt: Date.now() });
    } catch (e) {
      if (ac.signal.aborted) return;
      setRefresh((s) => ({ ...s, status: "error", error: (e as Error).message }));
    }
  }, []);

  const loadTrader = useCallback(async () => {
    traderAbort.current?.abort();
    const ac = new AbortController();
    traderAbort.current = ac;
    try {
      const { data, source: src } = await getJson<TraderPayload>("trader", ac.signal);
      if (data?.state) {
        const k = traderKpis(data.state, data.live);
        traderStore = roll(traderStore, traderSnapshot(data.state, k.equity), (s) => `${s.lastRunAt}|${s.cycles}`, SESSION);
        writeLocal(TRADER_KEY, traderStore);
        setTraderBaseline(traderStore.baseline);
      }
      setSource((prev) => prev ?? src);
      setTrader({ data, status: "ok", error: null, fromCache: false, receivedAt: Date.now() });
    } catch (e) {
      if (ac.signal.aborted) return;
      setTrader((s) => ({ ...s, status: "error", error: (e as Error).message }));
    }
  }, []);

  useEffect(() => {
    loadRefresh();
    loadTrader();
    return () => {
      refreshAbort.current?.abort();
      traderAbort.current?.abort();
    };
  }, [loadRefresh, loadTrader]);

  // Trader polls every 60s against the live server, every 10 min against the static snapshot.
  // The snapshot host also re-checks refresh.json (cheap 304s); live refresh stays manual (news + quotes).
  useEffect(() => {
    if (!source) return;
    let timer: number | null = null;
    const every = source === "live" ? POLL_LIVE : POLL_SNAPSHOT;
    const tick = () => {
      loadTrader();
      if (source === "snapshot") loadRefresh();
    };
    const start = () => {
      if (timer == null) timer = window.setInterval(tick, every);
    };
    const stop = () => {
      if (timer != null) window.clearInterval(timer);
      timer = null;
    };
    const onVis = () => {
      if (document.hidden) stop();
      else {
        loadTrader();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [source, loadTrader, loadRefresh]);

  const reload = useCallback(() => {
    loadRefresh();
    loadTrader();
  }, [loadRefresh, loadTrader]);

  const value = useMemo<DataCtx>(
    () => ({ refresh, trader, baseline, traderBaseline, source, reload, reloadTrader: loadTrader }),
    [refresh, trader, baseline, traderBaseline, source, reload, loadTrader]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData outside DataProvider");
  return v;
}
