import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Float32BufferAttribute,
  Group,
  Quaternion,
  Vector3
} from "three";
import { arcPoints, centroid, easeInOutCubic, lngDelta, lngLatToXYZ } from "../../../lib/geo";
import { loadLand } from "../../../lib/land";
import { useUi } from "../../../lib/store";
import { laneLit, type Hotspot, type MapLane, type MapModel } from "../mapModel";
import type { TipTarget } from "../TheaterMap";

const RAD = Math.PI / 180;
const CAM_Z = 3.05;
const FOV = 36;

interface ViewState {
  lng: number;
  lat: number;
  fly: { t0: number; dur: number; fromLng: number; fromLat: number; dLng: number; dLat: number } | null;
  dragging: boolean;
  lastInteract: number;
  swayT0: number;
  sway: number;
}

interface Registry {
  labels: Map<string, HTMLButtonElement>;
  chevrons: Map<string, HTMLButtonElement>;
  invalidate: () => void;
  size: { w: number; h: number };
  dprEl: HTMLElement | null;
}

interface Props {
  model: MapModel;
  activeKey: string;
  onSelect: (key: string) => void;
  running: boolean;
  reducedMotion: boolean;
  onTip: (t: TipTarget | null) => void;
  resetSignal: number;
}

const FRESNEL_VS = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const EARTH_FS = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main(){
  float f = 1.0 - max(dot(vN, vV), 0.0);
  vec3 deep = vec3(0.020, 0.028, 0.055);
  vec3 rim = vec3(0.075, 0.090, 0.180);
  vec3 col = mix(deep, rim, pow(f, 2.2)) + vec3(0.32, 0.35, 0.78) * pow(f, 6.0) * 0.28;
  gl_FragColor = vec4(col, 1.0);
}`;

const ATMO_FS = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main(){
  float i = pow(clamp(0.6 - dot(vN, vV), 0.0, 1.0), 4.0);
  gl_FragColor = vec4(vec3(0.33, 0.37, 0.78) * i * 0.55, i);
}`;

/** Camera distance that fits the whole disc: full height in landscape, full width (with margin) in portrait. */
function fitDistance(aspect: number): number {
  const t = Math.tan((FOV / 2) * RAD) * Math.min(1, aspect) * (aspect < 1 ? 0.9 : 0.97);
  return Math.sqrt(1 + 1 / (t * t));
}

const LAND_VS = /* glsl */ `
uniform float uSize; uniform float uDpr; uniform vec3 uFocus;
varying float vFacing; varying float vFocus;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normalize(position));
  vFacing = dot(n, normalize(-mv.xyz));
  vFocus = 1.0 - smoothstep(0.0, 0.42, distance(normalize(position), uFocus));
  gl_PointSize = uSize * uDpr * (0.55 + 0.45 * max(vFacing, 0.0)) * (3.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const LAND_FS = /* glsl */ `
uniform vec3 uFocusColor;
varying float vFacing; varying float vFocus;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.15, d) * smoothstep(-0.02, 0.28, vFacing);
  vec3 base = vec3(0.50, 0.57, 0.70);
  vec3 col = mix(base, uFocusColor, vFocus * 0.9);
  gl_FragColor = vec4(col, a * (0.34 + vFocus * 0.55));
  #include <colorspace_fragment>
}`;

const LANE_VS = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const LANE_FS = /* glsl */ `
uniform float uTime; uniform vec3 uColor; uniform float uOpacity; uniform float uSpeed; uniform float uLit;
varying vec2 vUv;
void main(){
  float t = vUv.x;
  float p = fract(t * 16.0 - uTime * uSpeed);
  float dash = smoothstep(0.0, 0.12, p) * (1.0 - smoothstep(0.38, 0.55, p));
  float ends = smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.95, t);
  float a = (0.22 + 0.78 * dash) * ends * uOpacity;
  gl_FragColor = vec4(uColor * (1.0 + uLit * 0.8), a);
  #include <colorspace_fragment>
}`;

const RING_VS = LANE_VS;
const RING_FS = /* glsl */ `
uniform float uTime; uniform vec3 uColor; uniform float uFreq; uniform float uPhase; uniform float uStrength;
varying vec2 vUv;
void main(){
  vec2 c = vUv - 0.5;
  float d = length(c) * 2.0;
  float k = fract(uTime * uFreq + uPhase);
  float ring = smoothstep(0.06, 0.0, abs(d - (0.25 + k * 0.75)));
  float glow = smoothstep(1.0, 0.0, d) * 0.0;
  float a = ring * (1.0 - k) * uStrength + glow;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

const GLOW_FS = /* glsl */ `
uniform vec3 uColor; uniform float uStrength;
varying vec2 vUv;
void main(){
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.4) * uStrength;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

function viewFor(model: MapModel): { lng: number; lat: number } {
  const c = centroid(model.hotspots.map((h) => h.pos));
  return { lng: c[0], lat: Math.max(-40, Math.min(55, c[1] - 4)) };
}

/* ---------------- scene pieces ---------------- */

function Earth() {
  return (
    <mesh renderOrder={0} onPointerOver={(e) => e.stopPropagation()} onPointerMove={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <sphereGeometry args={[0.995, 96, 64]} />
      <shaderMaterial vertexShader={FRESNEL_VS} fragmentShader={EARTH_FS} />
    </mesh>
  );
}

function Atmosphere() {
  return (
    <mesh scale={1.09} renderOrder={5}>
      <sphereGeometry args={[1, 64, 48]} />
      <shaderMaterial vertexShader={FRESNEL_VS} fragmentShader={ATMO_FS} side={BackSide} blending={AdditiveBlending} transparent depthWrite={false} />
    </mesh>
  );
}

function Graticule() {
  const geom = useMemo(() => {
    const pts: number[] = [];
    const push = (a: [number, number, number], b: [number, number, number]) => pts.push(...a, ...b);
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lng = -180; lng < 180; lng += 4) push(lngLatToXYZ([lng, lat], 1.0005), lngLatToXYZ([lng + 4, lat], 1.0005));
    }
    for (let lng = -180; lng < 180; lng += 30) {
      for (let lat = -80; lat < 80; lat += 4) push(lngLatToXYZ([lng, lat], 1.0005), lngLatToXYZ([lng, lat + 4], 1.0005));
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  return (
    <lineSegments geometry={geom} renderOrder={1}>
      <lineBasicMaterial color="#7c86c9" transparent opacity={0.07} depthWrite={false} />
    </lineSegments>
  );
}

function Land({ focus, focusColor }: { focus: Vector3; focusColor: string }) {
  const [geom, setGeom] = useState<BufferGeometry | null>(null);
  const dpr = useThree((s) => s.viewport.dpr);
  const uniforms = useMemo(
    () => ({ uSize: { value: 2.3 }, uDpr: { value: 1 }, uFocus: { value: new Vector3() }, uFocusColor: { value: new Color() } }),
    []
  );
  useEffect(() => {
    let alive = true;
    loadLand()
      .then((ll) => {
        if (!alive) return;
        const pos = new Float32Array((ll.length / 2) * 3);
        for (let i = 0, j = 0; i < ll.length; i += 2, j += 3) {
          const [x, y, z] = lngLatToXYZ([ll[i], ll[i + 1]], 1.001);
          pos[j] = x;
          pos[j + 1] = y;
          pos[j + 2] = z;
        }
        const g = new BufferGeometry();
        g.setAttribute("position", new Float32BufferAttribute(pos, 3));
        setGeom(g);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  uniforms.uDpr.value = dpr;
  uniforms.uFocus.value.copy(focus);
  uniforms.uFocusColor.value.set(focusColor);
  if (!geom) return null;
  return (
    <points geometry={geom} renderOrder={2}>
      <shaderMaterial vertexShader={LAND_VS} fragmentShader={LAND_FS} uniforms={uniforms} transparent depthWrite={false} />
    </points>
  );
}

const Z = new Vector3(0, 0, 1);

function HotspotMesh({
  h,
  active,
  hovered,
  clock,
  onSelect,
  onTip,
  wrap
}: {
  h: Hotspot;
  active: boolean;
  hovered: boolean;
  clock: MutableRefObject<number>;
  onSelect: (k: string) => void;
  onTip: (t: TipTarget | null) => void;
  wrap: MutableRefObject<HTMLDivElement | null>;
}) {
  const setHoverScenario = useUi((s) => s.setHoverScenario);
  const normal = useMemo(() => new Vector3(...lngLatToXYZ(h.pos, 1)), [h.pos]);
  const quat = useMemo(() => new Quaternion().setFromUnitVectors(Z, normal.clone().normalize()), [normal]);
  const color = useMemo(() => new Color(h.band.color), [h.band.color]);
  const level = h.band.level;
  const colH = 0.05 + level * 0.035 + (active ? 0.02 : 0);
  const rings = useMemo(
    () =>
      [0, 0.5].map((phase) => ({
        uTime: { value: 0 },
        uColor: { value: color },
        uFreq: { value: 0.42 + level * 0.1 },
        uPhase: { value: phase },
        uStrength: { value: 1 }
      })),
    [color, level]
  );
  const glow = useMemo(() => ({ uColor: { value: color }, uStrength: { value: 0.8 } }), [color]);
  useFrame(() => {
    for (const r of rings) {
      r.uTime.value = clock.current;
      r.uStrength.value = active ? 1 : 0.65;
    }
    glow.uStrength.value = active || hovered ? 1.0 : 0.6;
  });
  const tipAt = (e: ThreeEvent<PointerEvent>) => {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect) return;
    onTip({ kind: "scenario", id: h.key, scenario: h.key, x: e.nativeEvent.clientX - rect.left, y: e.nativeEvent.clientY - rect.top });
  };
  const ring = 0.07 + level * 0.022;
  return (
    <group position={normal} quaternion={quat}>
      <mesh position={[0, 0, 0.002]} renderOrder={6}>
        <planeGeometry args={[ring * 3.2, ring * 3.2]} />
        <shaderMaterial vertexShader={RING_VS} fragmentShader={GLOW_FS} uniforms={glow} transparent depthWrite={false} blending={AdditiveBlending} />
      </mesh>
      {rings.map((u, i) => (
        <mesh key={i} position={[0, 0, 0.003]} renderOrder={6}>
          <planeGeometry args={[ring * 2.4, ring * 2.4]} />
          <shaderMaterial vertexShader={RING_VS} fragmentShader={RING_FS} uniforms={u} transparent depthWrite={false} blending={AdditiveBlending} />
        </mesh>
      ))}
      <mesh position={[0, 0, colH / 2]} rotation={[Math.PI / 2, 0, 0]} renderOrder={7}>
        <cylinderGeometry args={[0.0035, 0.006, colH, 8, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, colH]} renderOrder={8}>
        <sphereGeometry args={[active ? 0.014 : 0.011, 16, 12]} />
        <meshBasicMaterial color={active ? "#ffffff" : color} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.004]} renderOrder={8}>
        <circleGeometry args={[0.012 + level * 0.003, 24]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh
        position={[0, 0, 0.02]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHoverScenario(h.key);
          tipAt(e);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHoverScenario(null);
          onTip(null);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta > 5) return;
          onSelect(h.key);
        }}
      >
        <sphereGeometry args={[0.07, 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function LaneMesh({
  lane,
  mine,
  lit,
  clock,
  onSelect,
  onTip,
  wrap
}: {
  lane: MapLane;
  mine: boolean;
  lit: boolean;
  clock: MutableRefObject<number>;
  onSelect: (k: string) => void;
  onTip: (t: TipTarget | null) => void;
  wrap: MutableRefObject<HTMLDivElement | null>;
}) {
  const setHoverLane = useUi((s) => s.setHoverLane);
  const curve = useMemo(() => new CatmullRomCurve3(arcPoints(lane.from, lane.to, 64, 1.002).map((p) => new Vector3(...p))), [lane.from, lane.to]);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new Color(lane.band.color) },
      uOpacity: { value: 1 },
      uSpeed: { value: 0.25 + lane.intensity * 0.55 },
      uLit: { value: 0 }
    }),
    [lane.band.color, lane.intensity]
  );
  useFrame(() => {
    uniforms.uTime.value = clock.current;
    uniforms.uOpacity.value = lit ? 1 : mine ? 0.8 : 0.3;
    uniforms.uLit.value = lit ? 1 : 0;
  });
  return (
    <group>
      <mesh renderOrder={4}>
        <tubeGeometry args={[curve, 96, lit ? 0.0048 : 0.0032, 6, false]} />
        <shaderMaterial vertexShader={LANE_VS} fragmentShader={LANE_FS} uniforms={uniforms} transparent depthWrite={false} blending={AdditiveBlending} />
      </mesh>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          setHoverLane(lane.id);
          const rect = wrap.current?.getBoundingClientRect();
          if (rect) onTip({ kind: "lane", id: lane.id, scenario: lane.scenario, x: e.nativeEvent.clientX - rect.left, y: e.nativeEvent.clientY - rect.top });
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHoverLane(null);
          onTip(null);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta > 5) return;
          onSelect(lane.scenario);
        }}
      >
        <tubeGeometry args={[curve, 48, 0.02, 5, false]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Drives rotation (drag, fly-to, idle sway), animation clock, DOM labels/chevrons, and the quality governor. */
function Rig({
  view,
  registry,
  model,
  running,
  reducedMotion,
  clock,
  children
}: {
  view: MutableRefObject<ViewState>;
  registry: MutableRefObject<Registry>;
  model: MapModel;
  running: boolean;
  reducedMotion: boolean;
  clock: MutableRefObject<number>;
  children: React.ReactNode;
}) {
  const group = useRef<Group>(null);
  const { camera, invalidate, setDpr } = useThree();
  const maxDpr = Math.min(window.devicePixelRatio || 1, 2);
  const gov = useRef({ dpr: maxDpr, acc: 0, frames: 0, good: 0 });
  const tmp = useMemo(() => new Vector3(), []);
  const locals = useMemo(() => model.hotspots.map((h) => ({ key: h.key, v: new Vector3(...lngLatToXYZ(h.pos, 1.0)) })), [model.hotspots]);

  useEffect(() => {
    registry.current.invalidate = invalidate;
  }, [invalidate, registry]);

  useFrame((state, dt) => {
    const v = view.current;
    const now = performance.now();
    if (running && !reducedMotion) clock.current += Math.min(dt, 0.1);

    if (v.fly) {
      const k = Math.min(1, (now - v.fly.t0) / v.fly.dur);
      const e = easeInOutCubic(k);
      v.lng = v.fly.fromLng + v.fly.dLng * e;
      v.lat = v.fly.fromLat + v.fly.dLat * e;
      if (k >= 1) v.fly = null;
      else invalidate();
    }

    const idle = !v.dragging && !v.fly && now - v.lastInteract > 5000;
    if (running && !reducedMotion && idle) {
      v.sway = Math.sin(((now - v.swayT0) / 1000) * ((2 * Math.PI) / 48)) * 8;
    } else if (!idle) {
      v.swayT0 = now;
      if (v.sway !== 0) {
        v.lng += v.sway;
        v.sway = 0;
      }
    }

    const g = group.current;
    if (g) {
      g.rotation.set(v.lat * RAD, -(v.lng + v.sway) * RAD, 0, "XYZ");
      g.updateMatrixWorld();
    }

    // Fit the disc to the panel, then place DOM labels + edge chevrons.
    const { w, h } = registry.current.size;
    const camZ = fitDistance(w / Math.max(1, h));
    if (Math.abs(camera.position.z - camZ) > 1e-3) camera.position.z = camZ;
    const cx = w / 2;
    const cy = h / 2;
    const radiusPx = (h / 2) * (1 / Math.tan((FOV / 2) * RAD)) / Math.sqrt(camZ * camZ - 1);
    for (const { key, v: local } of locals) {
      const label = registry.current.labels.get(key);
      const chev = registry.current.chevrons.get(key);
      if (!g) continue;
      tmp.copy(local).applyMatrix4(g.matrixWorld);
      const facing = tmp.z; // camera sits on +Z
      const wx = tmp.x;
      const wy = tmp.y;
      if (label) {
        tmp.project(camera);
        const x = (tmp.x * 0.5 + 0.5) * w;
        const y = (-tmp.y * 0.5 + 0.5) * h;
        const visible = facing > 0.18 && x > -40 && x < w + 40 && y > -20 && y < h + 20;
        label.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        label.style.opacity = visible ? "1" : "0";
        label.dataset.facing = visible ? "1" : "0";
      }
      if (chev) {
        const hidden = facing <= 0.18;
        if (hidden) {
          const ang = Math.atan2(-wy, wx);
          const r = Math.min(radiusPx * 1.06, Math.min(cx, cy) - 18);
          const x = cx + Math.cos(ang) * r;
          const y = cy + Math.sin(ang) * r;
          chev.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
          chev.style.setProperty("--ang", `${ang}rad`);
        }
        chev.style.opacity = hidden ? "1" : "0";
        chev.style.pointerEvents = hidden ? "auto" : "none";
      }
    }

    // Quality governor: drop resolution when frames run genuinely long (< ~26 fps), recover slowly.
    // Thresholds sit below 30 fps so a display or power-saver capped at 30 doesn't read as "slow".
    if (running && dt < 0.25) {
      const q = gov.current;
      q.acc += dt;
      q.frames += 1;
      if (q.acc >= 2) {
        const avg = q.acc / q.frames;
        if (avg > 1 / 26 && q.dpr > 0.75) {
          q.dpr = Math.max(0.75, q.dpr - 0.25);
          q.good = 0;
          setDpr(q.dpr);
        } else if (avg < 1 / 50 && q.dpr < maxDpr) {
          q.good += 1;
          if (q.good >= 4) {
            q.dpr = Math.min(maxDpr, q.dpr + 0.25);
            q.good = 0;
            setDpr(q.dpr);
          }
        }
        const el = registry.current.dprEl;
        if (el) {
          el.dataset.dpr = String(q.dpr);
          el.dataset.fps = String(Math.round(1 / avg));
        }
        q.acc = 0;
        q.frames = 0;
      }
    }
    void state;
  });

  return <group ref={group}>{children}</group>;
}

function Scene(props: {
  model: MapModel;
  activeKey: string;
  onSelect: (k: string) => void;
  onTip: (t: TipTarget | null) => void;
  running: boolean;
  reducedMotion: boolean;
  view: MutableRefObject<ViewState>;
  registry: MutableRefObject<Registry>;
  wrap: MutableRefObject<HTMLDivElement | null>;
}) {
  const { model, activeKey, onSelect, onTip, running, reducedMotion, view, registry, wrap } = props;
  const hoverLane = useUi((s) => s.hoverLane);
  const hoverTrade = useUi((s) => s.hoverTrade);
  const hoverScenario = useUi((s) => s.hoverScenario);
  const invalidate = useThree((s) => s.invalidate);
  const clock = useRef(reducedMotion ? 0.35 : 0);
  const active = model.hotspots.find((h) => h.key === activeKey) ?? model.hotspots[0];
  const focus = useMemo(() => new Vector3(...(active ? lngLatToXYZ(active.pos, 1) : [0, 0, 1])), [active]);

  useEffect(() => {
    invalidate();
  }, [activeKey, hoverLane, hoverTrade, hoverScenario, model, invalidate]);

  return (
    <Rig view={view} registry={registry} model={model} running={running} reducedMotion={reducedMotion} clock={clock}>
      <Earth />
      <Graticule />
      <Land focus={focus} focusColor={active?.band.color ?? "#8b93ff"} />
      {model.lanes.map((l) => (
        <LaneMesh
          key={`${l.scenario}:${l.id}`}
          lane={l}
          mine={l.scenario === activeKey}
          lit={laneLit(l, hoverLane, hoverTrade)}
          clock={clock}
          onSelect={onSelect}
          onTip={onTip}
          wrap={wrap}
        />
      ))}
      {model.hotspots.map((h) => (
        <HotspotMesh key={h.key} h={h} active={h.key === activeKey} hovered={hoverScenario === h.key} clock={clock} onSelect={onSelect} onTip={onTip} wrap={wrap} />
      ))}
      <Atmosphere />
    </Rig>
  );
}

export default function Globe({ model, activeKey, onSelect, running, reducedMotion, onTip, resetSignal }: Props) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const initial = useMemo(() => viewFor(model), [model]);
  const view = useRef<ViewState>({ lng: initial.lng, lat: initial.lat, fly: null, dragging: false, lastInteract: 0, swayT0: performance.now(), sway: 0 });
  const registry = useRef<Registry>({ labels: new Map(), chevrons: new Map(), invalidate: () => {}, size: { w: 1, h: 1 }, dprEl: null });
  const drag = useRef<{ x: number; y: number; id: number; moved: number } | null>(null);
  const firstKey = useRef(activeKey);
  const hoverScenario = useUi((s) => s.hoverScenario);

  const flyTo = (lng: number, lat: number) => {
    const v = view.current;
    v.lng += v.sway;
    v.sway = 0;
    const tLat = Math.max(-40, Math.min(58, lat - 6));
    if (reducedMotion) {
      v.lng = lng;
      v.lat = tLat;
      v.fly = null;
    } else {
      v.fly = { t0: performance.now(), dur: 900, fromLng: v.lng, fromLat: v.lat, dLng: lngDelta(v.lng, lng), dLat: tLat - v.lat };
    }
    v.lastInteract = performance.now();
    registry.current.invalidate();
  };

  // Fly to the selected theater, but keep the all-theater framing on first paint.
  useEffect(() => {
    if (activeKey === firstKey.current) return;
    firstKey.current = "";
    const h = model.hotspots.find((x) => x.key === activeKey);
    if (h) flyTo(h.pos[0], h.pos[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  useEffect(() => {
    if (!resetSignal) return;
    flyTo(initial.lng, initial.lat + 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      registry.current.size = { w: e.contentRect.width, h: e.contentRect.height };
      registry.current.invalidate();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.moved += Math.abs(dx) + Math.abs(dy);
    d.x = e.clientX;
    d.y = e.clientY;
    if (d.moved < 4) return;
    const v = view.current;
    if (!v.dragging) {
      v.dragging = true;
      v.lng += v.sway;
      v.sway = 0;
      v.fly = null;
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    }
    const k = 120 / Math.max(240, registry.current.size.h);
    v.lng -= dx * k * 0.9;
    v.lat = Math.max(-50, Math.min(70, v.lat + dy * k * 0.9));
    v.lastInteract = performance.now();
    registry.current.invalidate();
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const v = view.current;
    if (drag.current?.id === e.pointerId) drag.current = null;
    if (v.dragging) {
      v.dragging = false;
      v.lastInteract = performance.now();
    }
  };

  return (
    <div
      ref={wrap}
      className="absolute inset-0 select-none transition-opacity duration-700"
      style={{ opacity: ready ? 1 : 0, touchAction: "pan-y", cursor: "grab" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        className="absolute inset-0"
        ref={(el) => {
          registry.current.dprEl = el;
        }}
        data-testid="globe"
      >
        <Canvas
          flat
          dpr={[0.75, Math.min(window.devicePixelRatio || 1, 2)]}
          frameloop={running ? "always" : "demand"}
          camera={{ position: [0, 0, CAM_Z], fov: FOV, near: 0.1, far: 20 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          onCreated={() => setReady(true)}
          aria-hidden="true"
        >
          <Scene
            model={model}
            activeKey={activeKey}
            onSelect={onSelect}
            onTip={onTip}
            running={running}
            reducedMotion={reducedMotion}
            view={view}
            registry={registry}
            wrap={wrap}
          />
        </Canvas>
      </div>

      {/* DOM layer: labels are the accessible twin of the hotspots; chevrons point at theaters on the far side. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {model.hotspots.map((h) => (
          <button
            key={h.key}
            type="button"
            ref={(el) => {
              if (el) registry.current.labels.set(h.key, el);
              else registry.current.labels.delete(h.key);
            }}
            className="pointer-events-auto absolute left-0 top-0 -translate-y-1/2 rounded-md text-left transition-opacity duration-200 focus-visible:opacity-100"
            style={{ opacity: 0, willChange: "transform" }}
            aria-pressed={h.key === activeKey}
            aria-label={`${h.label}, ${h.place}: heat ${h.heat}, ${h.band.label}`}
            onClick={() => onSelect(h.key)}
            onPointerEnter={(e) => {
              useUi.getState().setHoverScenario(h.key);
              const rect = wrap.current?.getBoundingClientRect();
              if (rect) onTip({ kind: "scenario", id: h.key, scenario: h.key, x: e.clientX - rect.left, y: e.clientY - rect.top });
            }}
            onPointerLeave={() => {
              useUi.getState().setHoverScenario(null);
              onTip(null);
            }}
            onFocus={() => flyTo(h.pos[0], h.pos[1])}
          >
            <span
              className="ml-5 flex items-center gap-2 rounded-md border px-2 py-1 backdrop-blur-0"
              style={{
                background: "rgb(8 11 18 / .82)",
                borderColor: h.key === activeKey || hoverScenario === h.key ? `${h.band.color}88` : "rgb(148 163 184 / .18)"
              }}
            >
              <span className="display text-[15px] leading-none" style={{ color: h.band.color }}>
                {h.heat}
              </span>
              <span className="num text-[10px] leading-none tracking-[0.14em] text-dim">{h.label.toUpperCase()}</span>
            </span>
          </button>
        ))}
        {model.hotspots.map((h) => (
          <button
            key={`chev-${h.key}`}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            ref={(el) => {
              if (el) registry.current.chevrons.set(h.key, el);
              else registry.current.chevrons.delete(h.key);
            }}
            className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300"
            style={{ opacity: 0 }}
            onClick={() => onSelect(h.key)}
            title={`${h.label}: heat ${h.heat} (far side)`}
          >
            <span className="flex items-center gap-1 rounded-full border border-line-2 px-2 py-0.5" style={{ background: "rgb(8 11 18 / .85)" }}>
              <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: "rotate(var(--ang))" }} aria-hidden="true">
                <path d="M2 2l5 3-5 3" fill="none" stroke={h.band.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="num text-[9.5px] tracking-[0.12em] text-dim">{h.label.toUpperCase()}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
