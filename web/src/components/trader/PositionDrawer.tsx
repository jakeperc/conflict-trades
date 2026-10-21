import { useEffect, useRef } from "react";
import { m } from "motion/react";
import type { TraderState } from "../../types";
import { daysBetween, findPosition } from "../../lib/derive";
import { humanize, money, pct, shortDate, signedMoney, signedPct } from "../../lib/format";
import { navigate } from "../../lib/router";
import { useReducedMotion } from "../../lib/env";
import { DirBadge, scoreColor } from "../ui/primitives";
import { EdgeKey, FactorBars, Ladder } from "./parts";

export function PositionDrawer({ id, state }: { id: string; state: TraderState | null }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const reduced = useReducedMotion();
  const found = findPosition(state, id);
  const close = () => navigate({ page: "trader" });

  useEffect(() => {
    returnFocus.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
      (returnFocus.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <m.div
        className="absolute inset-0 bg-[rgb(2_3_8/.6)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.2 }}
        onClick={close}
        aria-hidden="true"
      />
      <m.aside
        className="scroll-thin absolute inset-y-0 right-0 flex w-full max-w-[600px] flex-col overflow-y-auto border-l border-line-2 bg-[#070a12] shadow-2xl"
        initial={{ x: reduced ? 0 : 40, opacity: reduced ? 1 : 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-[#070a12]/95 px-5 py-3 backdrop-blur">
          <span className="label">{found ? (found.kind === "open" ? "Open position" : "Closed trade") : "Position"}</span>
          <button ref={closeRef} type="button" className="btn h-8 px-2.5" onClick={close} aria-label="Close position detail">
            Esc
          </button>
        </header>
        {!found ? (
          <div className="p-6">
            <h2 id="drawer-title" className="text-[18px] font-semibold">
              Position not found
            </h2>
            <p className="mt-2 text-[13px] text-dim">
              <span className="num">{id}</span> is not in the open book or the closed history. It may predate the current trader state.
            </p>
          </div>
        ) : (
          <DrawerBody found={found} />
        )}
      </m.aside>
    </div>
  );
}

function DrawerBody({ found }: { found: NonNullable<ReturnType<typeof findPosition>> }) {
  const p = found.item;
  const closed = found.kind === "closed" ? found.item : null;
  const score = p.finalScoreAtEntry ?? Math.round((p.confidenceAtEntry ?? 0) * 100);
  const held = closed ? closed.holdingDays : daysBetween(p.entryDate);
  const left = Math.max(0, p.horizonDays - held);
  const pnlPct = closed ? closed.realizedPct : p.unrealizedPct;
  const pnl$ = closed ? closed.realizedPnlDollar : p.unrealizedPnlDollar;
  const good = (pnlPct ?? 0) >= 0;
  const mem = [...(p.memoryAdjustmentsAtEntry ?? [])].sort((a, b) => Math.abs(b.factor - 1) - Math.abs(a.factor - 1)).slice(0, 6);

  const stats: [string, string][] = [
    ["Entered", shortDate(p.entryDate)],
    [closed ? "Exited" : "Days held", closed ? shortDate(closed.exitDate) : `${held}d`],
    [closed ? "Held" : "Horizon left", closed ? `${closed.holdingDays}d` : `${left} / ${p.horizonDays}d`],
    ["Allocated", money(p.allocatedCash)],
    ["Shares", p.shares.toFixed(4)],
    ["Heat at entry", String(p.heatAtEntry ?? "—")],
    ["Conviction", `${p.conviction}/5`],
    [closed ? "Exit reason" : "Last mark", closed ? humanize(closed.exitReason) : shortDate(p.lastKnownDate)]
  ];

  return (
    <div className="flex flex-col gap-6 p-5">
      <section>
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 id="drawer-title" className="num text-[28px] font-semibold leading-none tracking-[-0.02em]">
            {p.ticker}
          </h2>
          <DirBadge dir={p.direction} size="md" />
          {closed && (
            <span
              className="num rounded-[5px] px-2 py-[3px] text-[10.5px] font-semibold tracking-[0.08em]"
              style={{ color: good ? "var(--color-long)" : "var(--color-short)", background: good ? "var(--color-long-soft)" : "var(--color-short-soft)" }}
            >
              {closed.outcome.toUpperCase()}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[13px] text-dim">
          {p.scenarioTitle ?? p.scenario} · {p.sector}
        </p>
        <div className="mt-4 flex items-end gap-4">
          <div>
            <div className="label">{closed ? "Realized" : "Unrealized"}</div>
            <div className="display text-[30px] leading-tight" style={{ color: good ? "var(--color-long)" : "var(--color-short)" }}>
              {signedPct(pnlPct, 2)}
            </div>
          </div>
          <div className="num pb-1.5 text-[14px]" style={{ color: good ? "var(--color-long)" : "var(--color-short)" }}>
            {signedMoney(pnl$)}
          </div>
        </div>
        <div className="mt-4">
          <Ladder p={{ ...p, currentPrice: closed ? closed.exitPrice : p.currentPrice }} big />
        </div>
      </section>

      <dl className="num grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-line bg-raise p-4 text-[12.5px] sm:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[10.5px] text-muted">{k}</dt>
            <dd className="mt-0.5 text-text">{v}</dd>
          </div>
        ))}
      </dl>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="label">Composite at entry</div>
            <div className="display text-[26px] leading-tight" style={{ color: scoreColor(score) }}>
              {score.toFixed(0)}
              <span className="num ml-1 text-[12px] text-muted">/ 100</span>
            </div>
          </div>
          <div className="text-right">
            <div className="label">Memory multiplier</div>
            <div className="num text-[16px]">×{(p.memoryMultAtEntry ?? 1).toFixed(2)}</div>
          </div>
        </div>
        <FactorBars components={p.componentsAtEntry} layout="rows" />
        {(p.diversificationPenaltyAtEntry ?? 0) > 0 && (
          <p className="num mt-2 text-[11.5px] text-muted">
            Diversification penalty at entry: <span className="text-short">−{p.diversificationPenaltyAtEntry?.toFixed(0)} pts</span>
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <div className="label mb-1">Thesis</div>
          <p className="text-[14px] leading-relaxed">{p.thesis ?? "—"}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <div className="label mb-1">Catalyst</div>
            <p className="text-[12.5px] text-dim">{p.catalyst ?? "—"}</p>
          </div>
          <div>
            <div className="label mb-1">Thesis breaker</div>
            <p className="text-[12.5px] text-dim">{p.thesisBreaker ?? "—"}</p>
          </div>
          <div>
            <div className="label mb-1">Pair trade</div>
            <p className="num text-[12.5px] text-dim">{p.pairTrade ?? "—"}</p>
          </div>
        </div>
      </section>

      <section>
        <div className="label mb-2">Memory edges at entry</div>
        {mem.length === 0 ? (
          <p className="text-[12.5px] text-muted">No memory edges contributed (no patterns with n≥3 at entry).</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Pattern</th>
                <th className="r">n</th>
                <th className="r">Win</th>
                <th className="r">Avg</th>
                <th className="r">Weight</th>
              </tr>
            </thead>
            <tbody>
              {mem.map((a) => (
                <tr key={a.key}>
                  <td>
                    <EdgeKey k={a.key} />
                  </td>
                  <td className="r num text-dim">{a.n}</td>
                  <td className="r num">{pct(a.winRate, 0)}</td>
                  <td className="r num" style={{ color: a.avgPct >= 0 ? "var(--color-long)" : "var(--color-short)" }}>
                    {pct(a.avgPct, 1)}
                  </td>
                  <td className="r num" style={{ color: a.factor >= 1.05 ? "var(--color-long)" : a.factor <= 0.95 ? "var(--color-short)" : undefined }}>
                    ×{a.factor.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
