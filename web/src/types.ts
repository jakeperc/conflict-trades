export type Direction = "LONG" | "SHORT";
export type LngLat = [number, number];

export interface Lane {
  id: string;
  label: string;
  from: LngLat;
  to: LngLat;
  sectors: string[];
  subScore?: string;
}

export interface Geo {
  pos: LngLat;
  label: string;
  lanes: Lane[];
}

export interface SubScore {
  label: string;
  value: number;
}

export interface Indicator {
  label: string;
  value: number;
  unit: string;
  delta: number;
  tone?: string;
}

export interface Headline {
  title: string;
  link: string;
  description?: string;
  source?: string;
  publishedAt?: string;
  publishedMs?: number;
  relevance?: number;
}

export interface Trade {
  ticker: string;
  direction: Direction;
  conviction: number;
  sector: string;
  horizon?: string;
  pairTrade?: string;
  thesisBreaker?: string;
  catalyst?: string;
  riskLevel?: string;
  thesis?: string;
  price: number | null;
  annualizedVol?: number;
  upsidePct: number | null;
  downsidePct: number | null;
  targetPrice: number | null;
  stopPrice: number | null;
  rewardToRisk: number | null;
  lastQuoteDate?: string;
  pctVsMa22?: number | null;
  pctVsMa50?: number | null;
  momentum5d?: number | null;
  momentum22d?: number | null;
  priceSeries?: number[];
  priceSource?: string;
  quoteError?: string;
}

export interface Ww3Signal {
  tilt: number;
  score: number;
  sources: string[];
}

export interface Scenario {
  key: string;
  title: string;
  subtitle: string;
  color: string;
  geo: Geo | null;
  summary: string;
  heat: number;
  ww3Tilt: number;
  ww3Signal: Ww3Signal | null;
  subScores: SubScore[];
  indicators: Indicator[];
  secondOrderEffects: string[];
  topPairTrade: string | null;
  refreshedAt: string;
  headlines: Headline[];
  trades: Trade[];
  heatHistory?: { t: string; heat: number }[];
}

export interface RefreshPayload {
  generatedAt: string;
  appVersion?: string;
  disclaimer: string;
  methodology: string;
  scenarios: Record<string, Scenario>;
}

export type Components = Record<ComponentKey, number>;
export type ComponentKey = "conviction" | "scenario" | "riskReward" | "trend" | "volRegime" | "catalyst" | "memory";

export interface MemoryAdjustment {
  key: string;
  n: number;
  winRate: number;
  avgPct: number;
  factor: number;
}

export interface Position {
  id: string;
  ticker: string;
  scenario: string;
  scenarioTitle?: string;
  sector: string;
  direction: Direction;
  conviction: number;
  entryDate: string;
  entryPrice: number;
  shares: number;
  allocatedCash: number;
  targetPrice: number;
  stopPrice: number;
  horizonDays: number;
  thesis?: string;
  catalyst?: string;
  thesisBreaker?: string;
  pairTrade?: string;
  heatAtEntry?: number;
  confidenceAtEntry?: number;
  finalScoreAtEntry?: number;
  componentsAtEntry?: Partial<Components>;
  diversificationPenaltyAtEntry?: number;
  memoryMultAtEntry?: number;
  memoryAdjustmentsAtEntry?: MemoryAdjustment[];
  currentPrice?: number;
  unrealizedPnlDollar?: number;
  unrealizedPct?: number;
  lastKnownDate?: string;
}

export interface ClosedTrade extends Position {
  exitDate: string;
  exitPrice: number;
  exitReason: string;
  realizedPnlDollar: number;
  realizedPct: number;
  holdingDays: number;
  outcome: "win" | "loss" | string;
}

export interface WatchItem {
  ticker: string;
  scenario: string;
  scenarioTitle?: string;
  direction: Direction;
  sector: string;
  price: number;
  targetPrice?: number;
  stopPrice?: number;
  rewardToRisk?: number;
  conviction?: number;
  momentum22d?: number | null;
  annualizedVol?: number | null;
  finalScore?: number;
  confidence?: number;
  components?: Partial<Components>;
  diversificationPenalty?: number;
  memoryMult?: number;
  held?: boolean;
}

export interface EquityPoint {
  date: string;
  cycle: number;
  cash: number;
  openMtM: number;
  totalEquity: number;
  pctVsStart: number;
}

export interface MemorySummaryRow {
  key: string;
  n: number;
  winRate: number;
  avgPnlPct: number;
  score: number;
}

export interface Simulation {
  runAt?: string;
  startDate?: string;
  endDate?: string;
  tradingDays?: number;
  closedCount: number;
  overallWinRate: number;
  overallAvgPnlPct: number;
  failureMode?: Record<string, number>;
  variantStats?: Record<string, { n: number; wins?: number; winRate: number; avgPnlPct: number }>;
  recalibratedBuckets?: number;
  topRecalibrationSignals?: { bucket: string; n: number; signal: string; magnitude: number; action: string }[];
}

export interface CalibrationBucket {
  n: number;
  weights?: Partial<Components>;
  stopMult?: number;
  targetMult?: number;
  standardWinRate?: number;
  standardAvgPnl?: number;
}

export interface Calibration {
  generatedAt?: string;
  fromTrades?: number;
  perBucket?: Record<string, CalibrationBucket>;
  globalWeights?: Components | null;
  tournamentMeta?: { improvement: number; candidateCount: number } | null;
  applyBucketWeights?: boolean;
}

export interface TraderState {
  startingCash: number;
  cash: number;
  openPositions: Position[];
  closedTrades: ClosedTrade[];
  equityCurve: EquityPoint[];
  createdAt?: string;
  lastRunAt?: string;
  cycles: number;
  lastWatchlist?: WatchItem[];
}

export interface TraderPayload {
  state: TraderState;
  live?: { equity: number; openMtM: number; pctReturn: number; fetchedAt: string | null };
  memory?: { summary?: { bucketCount?: number; tradesObserved?: number; top?: MemorySummaryRow[]; bottom?: MemorySummaryRow[] } };
  simulation?: Simulation | null;
  calibration?: Calibration | null;
}

export type Source = "live" | "snapshot";
