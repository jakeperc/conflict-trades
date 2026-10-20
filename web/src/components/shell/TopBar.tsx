import { useEffect, useState } from "react";
import { useData } from "../../lib/data";
import { ago, dateTime } from "../../lib/format";
import { navigate, useRoute, type Page } from "../../lib/router";
import { useUi } from "../../lib/store";

const STALE_SNAPSHOT_MS = 36 * 3600_000;

/** Hub signature: mono pill, colored dot. One axis only: how the data moves (LIVE vs DAILY). */
export function StatusPill() {
  const { source, refresh } = useData();
  const loading = refresh.status === "loading";
  const error = refresh.status === "error";
  const generated = refresh.data?.generatedAt ? Date.parse(refresh.data.generatedAt) : null;
  const stale = error || refresh.fromCache || (source === "snapshot" && generated != null && Date.now() - generated > STALE_SNAPSHOT_MS);
  const word = source === "live" ? "LIVE" : source === "snapshot" ? "DAILY" : "…";
  const dot = error ? "var(--color-short)" : stale ? "var(--color-heat-moderate)" : "var(--color-long)";
  const title = error
    ? `Refresh failed: ${refresh.error}. Showing the last copy this browser saw.`
    : source === "live"
      ? "Local server: live headlines and quotes"
      : "Static site: rebuilt once a day";
  return (
    <span
      className="num inline-flex h-7 items-center gap-2 rounded-full border border-line-2 bg-raise px-3 text-[11px] tracking-[0.14em] text-dim"
      title={title}
      role="status"
    >
      <i
        className="block h-[7px] w-[7px] rounded-full"
        style={{ background: dot, boxShadow: `0 0 8px ${dot}`, animation: loading ? "pulse-dot 1s ease-in-out infinite" : undefined }}
      />
      {word}
      {stale && !error && <span className="sr-only"> (stale)</span>}
      {error && <span className="sr-only"> (refresh failed)</span>}
    </span>
  );
}

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => set((x) => x + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

const PAGES: { page: Page; label: string }[] = [
  { page: "dashboard", label: "Desk" },
  { page: "trader", label: "AI Trader" }
];

export function TopBar() {
  const route = useRoute();
  const { refresh, reload } = useData();
  const openPalette = useUi((s) => s.setPaletteOpen);
  useTick(30_000);
  const generatedAt = refresh.data?.generatedAt;
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[rgb(5_7_13/0.72)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
        <a href="#/" className="flex items-center gap-2.5 rounded-lg pr-1" aria-label="Conflict Trades: desk">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#0d1120" stroke="rgb(148 163 184 / .25)" />
            <circle cx="16" cy="16" r="9" fill="none" stroke="#8b93ff" strokeWidth="1.6" />
            <path d="M7 16h18M16 7c3 3 3 15 0 18M16 7c-3 3-3 15 0 18" stroke="#8b93ff" strokeWidth="0.9" fill="none" opacity="0.55" />
            <circle cx="19.5" cy="12.5" r="2.6" fill="#ff4757" />
          </svg>
          <span className="hidden whitespace-nowrap leading-tight md:block">
            <span className="display block text-[14px] tracking-[0.02em] text-text">CONFLICT TRADES</span>
            <span className="label block text-[9.5px]">Geopolitical alpha desk</span>
          </span>
        </a>

        <nav aria-label="Pages" className="seg ml-1 sm:ml-4">
          {PAGES.map((p) => (
            <button
              key={p.page}
              type="button"
              className="whitespace-nowrap"
              aria-pressed={route.page === p.page}
              onClick={() => navigate({ page: p.page })}
            >
              {p.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <StatusPill />
          <span className="num hidden whitespace-nowrap text-[11.5px] text-muted lg:inline" title={generatedAt ? dateTime(generatedAt) : undefined}>
            {generatedAt ? `updated ${ago(generatedAt)}` : "loading…"}
          </span>
          <button
            type="button"
            className="btn hidden h-8 whitespace-nowrap px-2.5 text-dim lg:inline-flex"
            onClick={() => openPalette(true)}
            aria-label="Open command palette"
            aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
          >
            <span className="num text-[11px]">{isMac ? "⌘K" : "Ctrl K"}</span>
          </button>
          <button type="button" className="btn btn-accent h-8" onClick={reload} disabled={refresh.status === "loading"} aria-busy={refresh.status === "loading"}>
            <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" className={refresh.status === "loading" ? "animate-spin" : ""}>
              <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">{refresh.status === "loading" ? "Refreshing" : "Refresh"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
