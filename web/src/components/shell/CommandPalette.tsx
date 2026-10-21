import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "../../lib/data";
import { navigate } from "../../lib/router";
import { useUi } from "../../lib/store";
import { hasWebGL2 } from "../../lib/env";

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useUi.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  if (!open) return null;
  return <PaletteDialog onClose={() => setOpen(false)} />;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const { refresh, trader, reload } = useData();
  const glPref = useUi((s) => s.glPref);
  const setGlPref = useUi((s) => s.setGlPref);
  const setFilter = useUi((s) => s.setTradeFilterText);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    returnFocus.current = document.activeElement;
    inputRef.current?.focus();
    return () => (returnFocus.current as HTMLElement | null)?.focus?.();
  }, []);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [
      { id: "p-desk", group: "Go to", label: "Desk", run: () => navigate({ page: "dashboard" }) },
      { id: "p-trader", group: "Go to", label: "AI Trader", run: () => navigate({ page: "trader" }) },
      { id: "a-refresh", group: "Actions", label: "Refresh data", run: reload }
    ];
    if (hasWebGL2()) {
      const on = glPref === "on" || (glPref === "auto" && document.querySelector("[data-map=globe]"));
      out.push({ id: "a-gl", group: "Actions", label: on ? "Switch map to 2D" : "Switch map to 3D globe", run: () => setGlPref(on ? "off" : "on") });
    }
    const payload = refresh.data;
    if (payload) {
      Object.values(payload.scenarios).forEach((s, i) =>
        out.push({ id: `s-${s.key}`, group: "Theaters", label: s.title, hint: `heat ${s.heat} · ${i + 1}`, run: () => navigate({ page: "dashboard", scenario: s.key }) })
      );
      const seen = new Set<string>();
      Object.values(payload.scenarios).forEach((s) =>
        s.trades.forEach((t) => {
          const k = `${t.ticker}-${s.key}`;
          if (seen.has(k)) return;
          seen.add(k);
          out.push({
            id: `t-${k}`,
            group: "Tickers",
            label: `${t.ticker} · ${t.direction.toLowerCase()}`,
            hint: `${s.title.split("/")[0].trim()} · ${t.sector}`,
            run: () => {
              setFilter(t.ticker);
              navigate({ page: "dashboard", scenario: s.key });
              requestAnimationFrame(() => document.getElementById("trades")?.scrollIntoView({ behavior: "smooth", block: "start" }));
            }
          });
        })
      );
    }
    (trader.data?.state.openPositions ?? []).forEach((p) =>
      out.push({ id: `pos-${p.id}`, group: "Open positions", label: `${p.ticker} ${p.direction.toLowerCase()}`, hint: p.scenarioTitle, run: () => navigate({ page: "trader", positionId: p.id }) })
    );
    return out;
  }, [refresh.data, trader.data, reload, glPref, setGlPref, setFilter]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items.filter((i) => i.group !== "Tickers");
    return items.filter((i) => `${i.label} ${i.hint ?? ""} ${i.group}`.toLowerCase().includes(s)).slice(0, 40);
  }, [items, q]);

  useEffect(() => setSel(0), [q]);

  const run = (i: Item | undefined) => {
    if (!i) return;
    onClose();
    i.run();
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-[rgb(2_3_8/.6)] px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-line-2 bg-[#0a0d16] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="text-muted">
            <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to a theater, ticker or position…"
            className="h-12 flex-1 bg-transparent text-[14px] text-text placeholder:text-muted focus:outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={filtered[sel] ? `pal-${filtered[sel].id}` : undefined}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(filtered.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(filtered[sel]);
              }
            }}
          />
          <kbd className="num rounded border border-line-2 px-1.5 text-[10px] text-muted">esc</kbd>
        </div>
        <ul id="palette-list" role="listbox" className="scroll-thin max-h-[52vh] overflow-y-auto p-2">
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">Nothing matches “{q}”.</li>}
          {filtered.map((i, idx) => {
            const header = i.group !== lastGroup;
            lastGroup = i.group;
            return (
              <li key={i.id} role="presentation">
                {header && <div className="label px-3 pb-1 pt-2.5 text-[9.5px]">{i.group}</div>}
                <div
                  id={`pal-${i.id}`}
                  role="option"
                  aria-selected={idx === sel}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-[13.5px] ${idx === sel ? "bg-raise-2 text-text" : "text-dim"}`}
                  onMouseEnter={() => setSel(idx)}
                  onClick={() => run(i)}
                >
                  <span className="truncate">{i.label}</span>
                  {i.hint && <span className="num shrink-0 truncate text-[11px] text-muted">{i.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
