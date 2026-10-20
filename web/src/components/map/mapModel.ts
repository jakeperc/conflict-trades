import type { Lane, LngLat, Scenario } from "../../types";
import { heatBand, type Band } from "../../lib/heat";
import { shortScenarioLabel } from "../../lib/format";

export interface Hotspot {
  key: string;
  label: string;
  place: string;
  pos: LngLat;
  heat: number;
  band: Band;
  index: number;
}

export interface MapLane extends Lane {
  scenario: string;
  /** 0..1 intensity from the lane's sub-score when set, otherwise from heat. */
  intensity: number;
  band: Band;
}

export interface MapModel {
  hotspots: Hotspot[];
  lanes: MapLane[];
  unmapped: Scenario[];
}

export function buildMapModel(scenarios: Scenario[]): MapModel {
  const hotspots: Hotspot[] = [];
  const lanes: MapLane[] = [];
  const unmapped: Scenario[] = [];
  scenarios.forEach((s, index) => {
    if (!s.geo || !Array.isArray(s.geo.pos)) {
      unmapped.push(s);
      return;
    }
    const band = heatBand(s.heat);
    hotspots.push({ key: s.key, label: shortScenarioLabel(s.title, s.key), place: s.geo.label, pos: s.geo.pos, heat: s.heat, band, index });
    for (const lane of s.geo.lanes ?? []) {
      const sub = lane.subScore ? s.subScores.find((x) => x.label === lane.subScore) : undefined;
      const v = sub?.value ?? s.heat;
      lanes.push({ ...lane, scenario: s.key, intensity: Math.max(0, Math.min(1, (v - 35) / 63)), band: heatBand(v) });
    }
  });
  return { hotspots, lanes, unmapped };
}

/** A lane lights up when hovered, or when a hovered trade row's sector rides it. */
export function laneLit(lane: MapLane, hoverLane: string | null, hoverTrade: { scenario: string; sector: string } | null): boolean {
  if (hoverLane === lane.id) return true;
  return !!hoverTrade && hoverTrade.scenario === lane.scenario && lane.sectors.includes(hoverTrade.sector);
}
