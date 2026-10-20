/**
 * "Since your last visit" baselines.
 *
 * baseline = the last snapshot seen in an earlier browser session; it stays fixed for the
 * whole session, so a reload (or React StrictMode re-running effects) never zeroes deltas.
 * current  = the newest snapshot seen, also used to paint instantly before a live refresh lands.
 */
export interface Rolled<T> {
  v: 2;
  baseline: T | null;
  current: T | null;
  /** Session that fixed `baseline`; later updates in that session keep it. */
  session: string | null;
}

export function emptyRolled<T>(): Rolled<T> {
  return { v: 2, baseline: null, current: null, session: null };
}

export function roll<T>(stored: Rolled<T>, incoming: T, stamp: (x: T) => string | null | undefined, session: string): Rolled<T> {
  if (!stored.current) return { v: 2, baseline: null, current: incoming, session };
  if (stamp(stored.current) === stamp(incoming)) return stored;
  if (stored.session === session) return { ...stored, current: incoming };
  return { v: 2, baseline: stored.current, current: incoming, session };
}

/** Accepts the v2 shape or the legacy raw payload (which becomes `current`). */
export function parseStored<T>(raw: string | null, isLegacy: (x: unknown) => x is T): Rolled<T> {
  if (!raw) return emptyRolled();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && (parsed as Rolled<T>).v === 2) return parsed as Rolled<T>;
    if (isLegacy(parsed)) return { v: 2, baseline: null, current: parsed, session: null };
  } catch {
    /* corrupt entry: start over */
  }
  return emptyRolled();
}

const SESSION_KEY = "ct-session";

export function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "no-session-storage";
  }
}

export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode: deltas just won't persist */
  }
}
