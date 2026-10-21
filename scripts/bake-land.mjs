// Bake the globe's land dots once, offline: equal-spacing latitude rings, kept where they fall on land.
// Output web/public/land.bin = Int16 pairs [lng*100, lat*100]. No topojson or point-in-polygon at runtime.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const STEP = Number(process.argv[2] || 0.9);
const topo = JSON.parse(fs.readFileSync(require.resolve("world-atlas/land-50m.json"), "utf-8"));
const land = feature(topo, topo.objects.land);

const polygons = [];
for (const f of land.features) {
  const g = f.geometry;
  const list = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const rings of list) {
    let minX = 180, maxX = -180, minY = 90, maxY = -90;
    for (const [x, y] of rings[0]) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    polygons.push({ rings, minX, maxX, minY, maxY });
  }
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function onLand(x, y) {
  for (const p of polygons) {
    if (x < p.minX || x > p.maxX || y < p.minY || y > p.maxY) continue;
    let inside = false;
    for (const ring of p.rings) if (inRing(x, y, ring)) inside = !inside;
    if (inside) return true;
  }
  return false;
}

const out = [];
for (let lat = -58; lat <= 82; lat += STEP) {
  const count = Math.max(1, Math.round((Math.cos((lat * Math.PI) / 180) * 360) / STEP));
  const offset = (Math.round(lat / STEP) % 2) * 0.5;
  for (let i = 0; i < count; i++) {
    const lng = -180 + ((i + offset) * 360) / count;
    if (onLand(lng, lat)) out.push(Math.round(lng * 100), Math.round(lat * 100));
  }
}

const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web", "public", "land.bin");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, Buffer.from(new Int16Array(out).buffer));
console.log(`land.bin: ${out.length / 2} dots, ${(out.length * 2 / 1024).toFixed(1)} KB, step ${STEP} deg`);
