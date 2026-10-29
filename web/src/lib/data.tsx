import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RefreshPayload, Source, TraderPayload } from "../types";
import { QUOTES_URL, getJson, getQuotes } from "./api";
import { parseStored, readLocal, roll, sessionId, writeLocal, type Rolled } from "./baseline";
import { markToMarket, traderKpis, traderSnapshot, type TraderSnapshot } from "./derive";

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
  /** When open positions were last re-marked from the live quote proxy (static host only). */
  quotesAt: number | null;
  reload: () => void;
  reloadTrader: () => void;
}

const Ctx = createContext<DataCtx | null>(null);

const POLL_LIVE = 60_000;
const POLL_SNAPSHOT = 10 * 60_000;
const POLL_QUOTES = 30_000;

/** Re-mark a snapshot payload at live prices; resolves to null if the proxy is down. */
async function markLive(data: TraderPayload, signal?: AbortSignal): Promise<TraderPayload | null> {
  const open = data.state?.openPositions ?? [];
  if (!QUOTES_URL || !open.length) return null;
  try {
    const q = await getQuotes([...new Set(open.map((p) => p.ticker))], signal);
    const m = markToMarket(data.state, q.quotes, q.fetchedAt);
    return { ...data, state: m.state, live: m.live };
  } catch {
    return null;
  }
}

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
  const [quotesAt, setQuotesAt] = useState<number | null>(null);
  // Last trader payload as served, before any live re-mark, so each quote tick marks from the source.
  const rawTrader = useRef<TraderPayload | null>(null);
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
      const { data: served, source: src } = await getJson<TraderPayload>("trader", ac.signal);
      rawTrader.current = served;
      // The live server marks positions itself; the static snapshot gets marked here.
      const marked = src === "snapshot" ? await markLive(served, ac.signal) : null;
      if (ac.signal.aborted) return;
      const data = marked ?? served;
      setQuotesAt(marked ? Date.now() : null);
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

  // Static host: re-mark open positions from the quote proxy every 30s while the tab is visible.
  useEffect(() => {
    if (source !== "snapshot" || !QUOTES_URL) return;
    let timer: number | null = null;
    let ac: AbortController | null = null;
    const tick = async () => {
      const served = rawTrader.current;
      if (!served) return;
      ac?.abort();
      ac = new AbortController();
      const marked = await markLive(served, ac.signal);
      if (!marked || rawTrader.current !== served) return;
      setQuotesAt(Date.now());
      setTrader((s) => ({ ...s, data: marked }));
    };
    const start = () => {
      if (timer == null) timer = window.setInterval(tick, POLL_QUOTES);
    };
    const stop = () => {
      if (timer != null) window.clearInterval(timer);
      timer = null;
      ac?.abort();
    };
    const onVis = () => {
      if (document.hidden) stop();
      else {
        tick();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [source]);

  const reload = useCallback(() => {
    loadRefresh();
    loadTrader();
  }, [loadRefresh, loadTrader]);

  const value = useMemo<DataCtx>(
    () => ({ refresh, trader, baseline, traderBaseline, source, quotesAt, reload, reloadTrader: loadTrader }),
    [refresh, trader, baseline, traderBaseline, source, quotesAt, reload, loadTrader]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData outside DataProvider");
  return v;
}
