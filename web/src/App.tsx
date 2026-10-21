import { useEffect } from "react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { DataProvider } from "./lib/data";
import { useRoute } from "./lib/router";
import { TopBar } from "./components/shell/TopBar";
import { CommandPalette } from "./components/shell/CommandPalette";
import { DashboardPage } from "./components/dashboard/DashboardPage";
import { TraderPage } from "./components/trader/TraderPage";

function Pages() {
  const route = useRoute();
  useEffect(() => {
    document.title = route.page === "trader" ? "AI Trader · Conflict Trades" : "Desk · Conflict Trades";
  }, [route.page]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.page]);
  return route.page === "trader" ? <TraderPage /> : <DashboardPage />;
}

export function App() {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <DataProvider>
          <a href="#main" className="sr-only-focusable fixed left-3 top-3 z-[70] rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-bg" onClick={(e) => {
            e.preventDefault();
            document.getElementById("main")?.focus();
          }}>
            Skip to content
          </a>
          <TopBar />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] px-4 pb-20 pt-4 outline-none sm:px-6 sm:pt-5">
            <Pages />
          </main>
          <footer className="mx-auto max-w-[1440px] px-4 pb-10 text-[11px] text-muted sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
              <span className="num">Research workflow and paper trading only. Not investment advice.</span>
              <span className="num">
                Keys: <kbd>1–9</kbd> theater · <kbd>j</kbd>/<kbd>k</kbd> step · <kbd>/</kbd> filter · <kbd>Ctrl K</kbd> jump
              </span>
            </div>
          </footer>
          <CommandPalette />
        </DataProvider>
      </MotionConfig>
    </LazyMotion>
  );
}
