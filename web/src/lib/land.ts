let cache: Promise<Float32Array> | null = null;

/** Land dots baked by scripts/bake-land.mjs: [lng, lat] pairs in degrees. */
export function loadLand(): Promise<Float32Array> {
  if (!cache) {
    cache = fetch("land.bin")
      .then((r) => {
        if (!r.ok) throw new Error(`land.bin HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        const raw = new Int16Array(buf);
        const out = new Float32Array(raw.length);
        for (let i = 0; i < raw.length; i++) out[i] = raw[i] / 100;
        return out;
      })
      .catch((e) => {
        cache = null;
        throw e;
      });
  }
  return cache;
}
