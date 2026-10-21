import { create } from "zustand";

/** Transient UI state shared between the map/globe canvas and the DOM. Routing lives in the URL. */
interface UiState {
  hoverLane: string | null;
  hoverScenario: string | null;
  /** Hovered trade row: lanes of this scenario whose sectors include `sector` light up. */
  hoverTrade: { scenario: string; sector: string; ticker: string } | null;
  paletteOpen: boolean;
  glPref: "auto" | "on" | "off";
  lastScenario: string | null;
  tradeFilterText: string;
  setLastScenario: (key: string) => void;
  setTradeFilterText: (q: string) => void;
  setHoverLane: (id: string | null) => void;
  setHoverScenario: (key: string | null) => void;
  setHoverTrade: (t: UiState["hoverTrade"]) => void;
  setPaletteOpen: (open: boolean) => void;
  setGlPref: (p: UiState["glPref"]) => void;
}

function initialGlPref(): UiState["glPref"] {
  try {
    const q = new URLSearchParams(window.location.search).get("gl");
    if (q === "1") return "on";
    if (q === "0") return "off";
    const stored = localStorage.getItem("ct-gl");
    if (stored === "on" || stored === "off") return stored;
  } catch {
    /* ignore */
  }
  return "auto";
}

export const useUi = create<UiState>((set) => ({
  hoverLane: null,
  hoverScenario: null,
  hoverTrade: null,
  paletteOpen: false,
  glPref: initialGlPref(),
  lastScenario: null,
  tradeFilterText: "",
  setLastScenario: (lastScenario) => set({ lastScenario }),
  setTradeFilterText: (tradeFilterText) => set({ tradeFilterText }),
  setHoverLane: (hoverLane) => set({ hoverLane }),
  setHoverScenario: (hoverScenario) => set({ hoverScenario }),
  setHoverTrade: (hoverTrade) => set({ hoverTrade }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setGlPref: (glPref) => {
    try {
      if (glPref === "auto") localStorage.removeItem("ct-gl");
      else localStorage.setItem("ct-gl", glPref);
    } catch {
      /* ignore */
    }
    set({ glPref });
  }
}));
