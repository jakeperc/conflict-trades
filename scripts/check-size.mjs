// Enforce JS budgets on ui-dist/ using Vite's manifest:
//   initial route (entry + static imports)  <= 160 KB gzip
//   globe chunk (lazy, + what it adds)      <= 250 KB gzip
// The globe floor is ~238 KB because @react-three/fiber registers the whole three namespace (no tree-shaking).
// It loads only on desktop-class devices, after first paint.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "ui-dist");
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, ".vite", "manifest.json"), "utf-8"));
const BUDGET = { initial: 160, globe: 250 };

const gz = (file) => zlib.gzipSync(fs.readFileSync(path.join(OUT, file)), { level: 9 }).length / 1024;

function closure(keys, seen = new Set()) {
  for (const k of keys) {
    if (seen.has(k)) continue;
    seen.add(k);
    closure(manifest[k].imports ?? [], seen);
  }
  return seen;
}

const entry = Object.keys(manifest).find((k) => manifest[k].isEntry);
const initial = closure([entry]);
const globeKey = Object.keys(manifest).find((k) => /Globe\.tsx$/.test(k));
const globe = globeKey ? [...closure([globeKey])].filter((k) => !initial.has(k)) : [];

const sum = (keys) => [...keys].filter((k) => manifest[k].file.endsWith(".js")).reduce((a, k) => a + gz(manifest[k].file), 0);
const initialKb = sum(initial);
const globeKb = sum(globe);
const css = Object.values(manifest).flatMap((m) => m.css ?? []);
const cssKb = [...new Set(css)].reduce((a, f) => a + gz(f), 0);

const row = (label, kb, budget) => `${label.padEnd(10)} ${kb.toFixed(1).padStart(7)} KB gzip${budget ? `  (budget ${budget} KB)${kb > budget ? "  OVER" : ""}` : ""}`;
console.log(row("initial", initialKb, BUDGET.initial));
console.log(row("globe", globeKb, BUDGET.globe));
console.log(row("css", cssKb));

if (initialKb > BUDGET.initial || globeKb > BUDGET.globe) {
  console.error("Bundle budget exceeded.");
  process.exit(1);
}
