import { describe, expect, it } from "vitest";
import { emptyRolled, parseStored, roll, type Rolled } from "./baseline";

type P = { generatedAt: string; n: number };
const stamp = (p: P) => p.generatedAt;
const p = (g: string, n = 0): P => ({ generatedAt: g, n });
const isP = (x: unknown): x is P => !!x && typeof x === "object" && "generatedAt" in x;

describe("roll", () => {
  it("first visit ever: no baseline", () => {
    const r = roll(emptyRolled<P>(), p("d1"), stamp, "A");
    expect(r.baseline).toBeNull();
    expect(r.current?.generatedAt).toBe("d1");
  });

  it("static host, next day, new session: yesterday becomes the baseline", () => {
    const day1 = roll(emptyRolled<P>(), p("d1"), stamp, "A");
    const day2 = roll(day1, p("d2"), stamp, "B");
    expect(day2.baseline?.generatedAt).toBe("d1");
    expect(day2.current?.generatedAt).toBe("d2");
  });

  it("reload of the same snapshot keeps deltas (does not zero the baseline)", () => {
    const day2 = roll(roll(emptyRolled<P>(), p("d1"), stamp, "A"), p("d2"), stamp, "B");
    const reload = roll(day2, p("d2"), stamp, "B");
    expect(reload).toBe(day2);
    const newTab = roll(day2, p("d2"), stamp, "C");
    expect(newTab.baseline?.generatedAt).toBe("d1");
  });

  it("StrictMode double effect with the same payload is idempotent", () => {
    const start = roll(emptyRolled<P>(), p("d1"), stamp, "A");
    const once = roll(start, p("d2"), stamp, "B");
    const twice = roll(once, p("d2"), stamp, "B");
    expect(twice).toEqual(once);
  });

  it("live server: refreshes within a session keep the session baseline fixed", () => {
    let r: Rolled<P> = roll(emptyRolled<P>(), p("t1"), stamp, "A");
    r = roll(r, p("t2"), stamp, "B");
    r = roll(r, p("t3"), stamp, "B");
    r = roll(r, p("t4"), stamp, "B");
    expect(r.baseline?.generatedAt).toBe("t1");
    expect(r.current?.generatedAt).toBe("t4");
  });

  it("first session on the live server keeps a null baseline across reloads", () => {
    let r: Rolled<P> = roll(emptyRolled<P>(), p("t1"), stamp, "A");
    r = roll(r, p("t2"), stamp, "A");
    expect(r.baseline).toBeNull();
    expect(r.current?.generatedAt).toBe("t2");
  });
});

describe("parseStored", () => {
  it("migrates the legacy raw payload into current", () => {
    const r = parseStored<P>(JSON.stringify(p("old")), isP);
    expect(r.current?.generatedAt).toBe("old");
    expect(r.baseline).toBeNull();
    const next = roll(r, p("new"), stamp, "S");
    expect(next.baseline?.generatedAt).toBe("old");
  });

  it("survives junk", () => {
    expect(parseStored<P>("{not json", isP)).toEqual(emptyRolled());
    expect(parseStored<P>(null, isP)).toEqual(emptyRolled());
  });
});
