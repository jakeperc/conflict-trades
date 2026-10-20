export type BandKey = "critical" | "high" | "moderate" | "low";

export interface Band {
  key: BandKey;
  label: string;
  min: number;
  color: string;
  /** 0..3, used for discrete ring size / pulse so 74 vs 96 reads differently. */
  level: number;
}

// Same thresholds as the legacy UI (95 / 75 / 50). Colors are the heat ramp only.
export const BANDS: Band[] = [
  { key: "critical", label: "Critical", min: 95, color: "#ff4757", level: 3 },
  { key: "high", label: "High", min: 75, color: "#ff9f43", level: 2 },
  { key: "moderate", label: "Moderate", min: 50, color: "#f5d76e", level: 1 },
  { key: "low", label: "Low", min: -Infinity, color: "#4fb3e8", level: 0 }
];

export function heatBand(value: number | null | undefined): Band {
  const v = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return BANDS.find((b) => v >= b.min) ?? BANDS[BANDS.length - 1];
}
