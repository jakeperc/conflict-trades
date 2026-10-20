const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const DASH = "—";

export function money(v: number | null | undefined, whole = false): string {
  if (!ok(v)) return DASH;
  return (whole ? usd0 : usd2).format(v);
}

export function signedMoney(v: number | null | undefined): string {
  if (!ok(v)) return DASH;
  return `${v >= 0 ? "+" : "−"}${usd2.format(Math.abs(v))}`;
}

/** 0.0642 -> "6.42%" */
export function pct(v: number | null | undefined, digits = 1): string {
  if (!ok(v)) return DASH;
  return `${(v * 100).toFixed(digits)}%`;
}

/** 0.0642 -> "+6.42%" with a real minus sign. */
export function signedPct(v: number | null | undefined, digits = 1): string {
  if (!ok(v)) return DASH;
  const s = (Math.abs(v) * 100).toFixed(digits);
  if (Number(s) === 0) return `${(0).toFixed(digits)}%`;
  return `${v > 0 ? "+" : "−"}${s}%`;
}

/** Percentage points from a fraction: 0.172 -> "+17.2pp". */
export function pp(v: number | null | undefined, digits = 1): string {
  if (!ok(v)) return DASH;
  const s = (Math.abs(v) * 100).toFixed(digits);
  return `${v >= 0 ? "+" : "−"}${s}pp`;
}

export function signedInt(v: number | null | undefined): string {
  if (!ok(v)) return DASH;
  if (v === 0) return "0";
  return `${v > 0 ? "+" : "−"}${Math.abs(v)}`;
}

export function num(v: number | null | undefined, digits = 1): string {
  if (!ok(v)) return DASH;
  return v.toFixed(digits);
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return DASH;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(t);
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const t = Date.parse(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(t)) return DASH;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(t);
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return DASH;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return DASH;
  const m = Math.round((now - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return shortDate(iso);
}

/** Google News descriptions are HTML. Strip to text; never render as HTML. */
export function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

/** Google News titles end with " - Source". */
export function splitHeadline(title: string, source?: string): { text: string; source: string } {
  const m = title.match(/^(.*)\s+-\s+([^-]{2,60})$/);
  if (m) return { text: m[1], source: source || m[2] };
  return { text: title, source: source || "" };
}

export function shortScenarioLabel(title: string, key: string): string {
  return (title || key).split("/")[0].trim() || key;
}

export function humanize(snake: string): string {
  return snake.replace(/_/g, " ");
}
