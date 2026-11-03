// Terrain-draped 3D features for the overview scene: Strahler river reaches, dashed walking routes,
// and 3D recorded-life bio-markers.

import {
  BufferGeometry,
  type Camera,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  type Scene,
  Vector3,
} from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import type { Frame, Vec3 } from "../../instruments/valley/frame";
import type { Stage } from "../../instruments/valley/scene/stage";
import { lifeColours, overviewColours as C } from "../../theme/obsidian";
import { ease, lerp } from "../arc";
import type { OverviewData } from "../data";
import { createLandProbe, type Gaps, type LandProbe, measureLandGaps } from "./overview-probe";
import type { ScreenPoint } from "./overview-sheets";

export { createLandProbe, type Gaps, type LandProbe, measureLandGaps };

/** Opacity factor applied to non-selected routes when one route is picked in the list. */
export const ROUTE_QUIET = 0.35;

/** Screen-space dash and gap lengths (design px), widths (CSS px), opacities, and dark outline parameters. */
const DASH = { dash: 6, gap: 4, w0: 1.5, w1: 2.2, a0: 0.85, a1: 1, edge: 1.6, edgeA: 0.5 } as const;
/** Metres between vertices where a route is draped onto the triangulated relief, and height offset above it. */
const DRAPE = { step: 7.5, over: 4 } as const;
/** Recorded life 3D marker geometry parameters: stem height (m), beacon sizes (CSS px), and ring resolution. */
const LIFE = {
  over: 420,
  size: 10.5,
  baseSize: 5,
  ring: 72,
  footRing: 20,
  footRadiusM: 235,
} as const;

const v3 = (p: Vec3) => new Vector3(p[0], p[1], p[2]);
const arr = (v: Vector3): Vec3 => [v.x, v.y, v.z];

/** Builds the drainage reach polylines grouped by Strahler stream order (1 to 5). */
export function createRiverLines(
  scene: Scene,
  stageLines: Stage["lines"],
  data: OverviewData,
  frame: Frame,
) {
  const WIDTHS = [0.9, 1.2, 1.6, 2.1, 2.7];
  const OPACITY = [0.65, 0.78, 0.88, 0.95, 1.0];
  const riverLines: { line: { material: { opacity: number } }; rest: number }[] = [];
  for (const o of [1, 2, 3, 4, 5]) {
    const pls = data.rivers.reaches
      .filter((q) => q.order === o)
      .map((r) => r.pts.map(([E, N, h]) => frame.v(E, N, h + 4)));
    if (pls.length) {
      const line = stageLines.lines(pls, {
        color: C.drainage[o - 1] ?? C.catchmentLine,
        width: WIDTHS[o - 1] ?? 1,
        opacity: OPACITY[o - 1] ?? 1,
      });
      riverLines.push({ line, rest: OPACITY[o - 1] ?? 1 });
      scene.add(line);
    }
  }
  return riverLines;
}

/** Builds the terrain-draped dashed walking routes and computes their endpoints, centre, and bounding samples. */
export function createRoutesRig(
  scene: Scene,
  data: OverviewData,
  frame: Frame,
  sample: (E: number, N: number) => number,
  meshHeight: (E: number, N: number) => number,
) {
  const routePts: Vec3[][] = data.routes.map((r) => {
    const out: Vec3[] = [];
    r.pts.forEach(([E1, N1], i) => {
      const prev = r.pts[i - 1];
      const [E0, N0] = prev ?? [E1, N1];
      const n = prev ? Math.max(1, Math.ceil(Math.hypot(E1 - E0, N1 - N0) / DRAPE.step)) : 1;
      for (let k = prev ? 1 : 0; k <= n; k++) {
        const E = E0 + ((E1 - E0) * k) / n;
        const N = N0 + ((N1 - N0) * k) / n;
        out.push(frame.v(E, N, meshHeight(E, N) + DRAPE.over));
      }
    });
    return out;
  });

  const dashMat = (color: string, width: number, opacity: number) =>
    new LineMaterial({
      color: new Color(color),
      linewidth: width,
      worldUnits: false,
      dashed: true,
      dashSize: DASH.dash,
      gapSize: DASH.gap,
      dashScale: 1,
      transparent: true,
      opacity,
      depthTest: true,
      depthWrite: false,
    });

  const routeDraw = routePts.flatMap((pl, k) => {
    const id = data.routes[k]?.id;
    const seg: number[] = [];
    for (let i = 0; i + 1 < pl.length; i++) {
      const p = pl[i];
      const q = pl[i + 1];
      if (p && q) seg.push(...p, ...q);
    }
    if (!id || !seg.length) return [];
    const geo = new LineSegmentsGeometry();
    geo.setPositions(seg);
    const mat = dashMat(C.route, DASH.w0, DASH.a0);
    const edgeMat = dashMat(C.fog, DASH.w0 + DASH.edge, DASH.edgeA);
    const edge = new LineSegments2(geo, edgeMat);
    edge.computeLineDistances();
    edge.frustumCulled = false;
    edge.renderOrder = 5;
    const line = new LineSegments2(geo, mat);
    line.frustumCulled = false;
    line.renderOrder = 6;
    scene.add(edge, line);
    return [{ id, geo, mat, edgeMat }];
  });

  const routeEnds = data.routes.map((r) => {
    const [E, N] = r.pts[r.pts.length - 1] ?? [0, 0];
    return { id: r.id, p: frame.v(E, N, sample(E, N) + 10) };
  });
  const [E0s, N0s] = data.routes[0]?.pts[0] ?? [0, 0];
  const routeStart: Vec3 | null = data.routes.length
    ? frame.v(E0s, N0s, sample(E0s, N0s) + 10)
    : null;
  const routeAll = data.routes.flatMap((r) => r.pts);
  const RC: Vec3 | null = routeAll.length
    ? (() => {
        const Es = routeAll.map((q) => q[0]);
        const Ns = routeAll.map((q) => q[1]);
        const E = (Math.min(...Es) + Math.max(...Es)) / 2;
        const N = (Math.min(...Ns) + Math.max(...Ns)) / 2;
        return frame.v(E, N, sample(E, N));
      })()
    : null;
  const routeProbe = routePts.flatMap((pl) =>
    pl.filter((_, i) => i % 6 === 0 || i === pl.length - 1),
  );

  const dashR = new Vector3();

  return {
    routeDraw,
    routeEnds,
    routeStart,
    RC,
    routeProbe,
    setResolution(width: number, height: number) {
      for (const d of routeDraw) {
        d.mat.resolution.set(width, height);
        d.edgeMat.resolution.set(width, height);
      }
    },
    update(
      camera: Camera,
      project: (p: Vec3) => ScreenPoint,
      rHover: number,
      sel: string | null,
      routePick: string | null | undefined,
      e: number,
      dim: number,
    ) {
      if (!routeDraw.length || !RC) return;
      const lift = Math.max(rHover, sel === "routes" ? e : 0);
      const under = sel && sel !== "routes" ? 1 - 0.4 * e : 1;
      const pick = sel === "routes" ? (routePick ?? null) : null;
      camera.updateMatrixWorld();
      dashR.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      const a = project(RC);
      const b = project(arr(v3(RC).add(dashR)));
      const scale = Math.hypot(b.x - a.x, b.y - a.y);
      for (const d of routeDraw) {
        const quiet = pick && pick !== d.id ? ROUTE_QUIET : 1;
        d.mat.opacity = lerp(DASH.a0, DASH.a1, lift) * under * dim * quiet;
        d.mat.linewidth = pick === d.id ? DASH.w1 + 0.5 : lerp(DASH.w0, DASH.w1, lift);
        d.edgeMat.opacity = DASH.edgeA * under * dim * quiet;
        d.edgeMat.linewidth = d.mat.linewidth + DASH.edge;
        d.mat.dashScale = scale;
        d.edgeMat.dashScale = scale;
      }
    },
    dispose() {
      for (const d of routeDraw) {
        d.geo.dispose();
        d.mat.dispose();
        d.edgeMat.dispose();
      }
    },
  };
}

/** Manages the 3D recorded-life markers: ground rings, base nodes, vertical stems, diamond crystals, and crown beacons. */
export function createLifeRig(
  scene: Scene,
  stageSize: () => { width: number; height: number },
  frame: Frame,
  meshHeight: (E: number, N: number) => number,
  kmScale: number,
) {
  const lifeDisc = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    if (x) {
      x.fillStyle = lifeColours.halo;
      x.beginPath();
      x.arc(32, 32, 24, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = lifeColours.core;
      x.lineWidth = 3.5;
      x.beginPath();
      x.arc(32, 32, 22, 0, Math.PI * 2);
      x.stroke();
      x.fillStyle = lifeColours.core;
      x.beginPath();
      x.arc(32, 32, 11, 0, Math.PI * 2);
      x.fill();
    }
    const t = new CanvasTexture(c);
    t.colorSpace = LinearSRGBColorSpace;
    return t;
  })();

  let life: {
    pts: Vec3[];
    ne: [number, number][];
    obj: Group;
    geos: (BufferGeometry | LineSegmentsGeometry)[];
    mats: { mat: PointsMaterial | LineMaterial | MeshBasicMaterial; baseOpacity: number }[];
    lineMats: LineMaterial[];
  } | null = null;

  const setLife = (points: readonly { e: number; n: number; tone: string }[] | null) => {
    if (life) {
      scene.remove(life.obj);
      for (const g2 of life.geos) g2.dispose();
      for (const m2 of life.mats) m2.mat.dispose();
      life = null;
    }
    if (!points?.length) return;
    const { width: sw, height: sh } = stageSize();
    const stemRiseM = LIFE.over * kmScale;
    const footRadius = LIFE.footRadiusM * kmScale;
    const pts = points.map((p) => frame.v(p.e, p.n, meshHeight(p.e, p.n) + stemRiseM));
    const bases = points.map((p) => frame.v(p.e, p.n, meshHeight(p.e, p.n) + 6));
    const flatColors = points.flatMap((p) => {
      const c = new Color(p.tone);
      return [c.r, c.g, c.b];
    });

    const beaconGeo = new BufferGeometry();
    beaconGeo.setAttribute("position", new Float32BufferAttribute(pts.flat(), 3));
    beaconGeo.setAttribute("color", new Float32BufferAttribute(flatColors, 3));
    const beaconMat = new PointsMaterial({
      size: LIFE.size,
      sizeAttenuation: false,
      vertexColors: true,
      map: lifeDisc,
      alphaTest: 0.15,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
    });
    const beaconObj = new Points(beaconGeo, beaconMat);
    beaconObj.frustumCulled = false;
    beaconObj.renderOrder = 9;

    const baseGeo = new BufferGeometry();
    baseGeo.setAttribute("position", new Float32BufferAttribute(bases.flat(), 3));
    baseGeo.setAttribute("color", new Float32BufferAttribute(flatColors, 3));
    const baseMat = new PointsMaterial({
      size: LIFE.baseSize,
      sizeAttenuation: false,
      vertexColors: true,
      map: lifeDisc,
      alphaTest: 0.15,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
    });
    const baseObj = new Points(baseGeo, baseMat);
    baseObj.frustumCulled = false;
    baseObj.renderOrder = 6;

    const stemPos: number[] = [];
    const stemCol: number[] = [];
    points.forEach((p, idx) => {
      const b = bases[idx];
      const t = pts[idx];
      if (!b || !t) return;
      const c = new Color(p.tone);
      stemPos.push(b[0], b[1], b[2], t[0], t[1], t[2]);
      stemCol.push(c.r * 0.72, c.g * 0.72, c.b * 0.72, c.r, c.g, c.b);
    });
    const stemGeo = new LineSegmentsGeometry();
    stemGeo.setPositions(stemPos);
    stemGeo.setColors(stemCol);
    const stemMat = new LineMaterial({
      color: 0xffffff,
      linewidth: 1.75,
      vertexColors: true,
      worldUnits: false,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
    });
    stemMat.resolution.set(sw, sh);
    const stemObj = new LineSegments2(stemGeo, stemMat);
    stemObj.frustumCulled = false;
    stemObj.renderOrder = 7;

    const ringPos: number[] = [];
    const ringCol: number[] = [];
    points.forEach((p) => {
      const c = new Color(p.tone);
      for (let i = 0; i < LIFE.footRing; i++) {
        const a0 = (i / LIFE.footRing) * Math.PI * 2;
        const a1 = ((i + 1) / LIFE.footRing) * Math.PI * 2;
        const e0 = p.e + footRadius * Math.cos(a0);
        const n0 = p.n + footRadius * Math.sin(a0);
        const e1 = p.e + footRadius * Math.cos(a1);
        const n1 = p.n + footRadius * Math.sin(a1);
        const v0 = frame.v(e0, n0, meshHeight(e0, n0) + 6);
        const v1 = frame.v(e1, n1, meshHeight(e1, n1) + 6);
        ringPos.push(v0[0], v0[1], v0[2], v1[0], v1[1], v1[2]);
        ringCol.push(c.r * 0.88, c.g * 0.88, c.b * 0.88, c.r * 0.88, c.g * 0.88, c.b * 0.88);
      }
    });
    const ringGeo = new LineSegmentsGeometry();
    ringGeo.setPositions(ringPos);
    ringGeo.setColors(ringCol);
    const ringMat = new LineMaterial({
      color: 0xffffff,
      linewidth: 1.25,
      vertexColors: true,
      worldUnits: false,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
    });
    ringMat.resolution.set(sw, sh);
    const ringObj = new LineSegments2(ringGeo, ringMat);
    ringObj.frustumCulled = false;
    ringObj.renderOrder = 6;

    const prismPos: number[] = [];
    const prismCol: number[] = [];
    const rx = 0.095 * kmScale;
    const ry = 0.145 * kmScale;
    points.forEach((p, idx) => {
      const at = pts[idx];
      if (!at) return;
      const [cx, cy, cz] = at;
      const c = new Color(p.tone);
      const top: Vec3 = [cx, cy + ry, cz];
      const bot: Vec3 = [cx, cy - ry, cz];
      const eq: Vec3[] = [
        [cx + rx, cy, cz],
        [cx, cy, cz + rx],
        [cx - rx, cy, cz],
        [cx, cy, cz - rx],
      ];
      for (let i = 0; i < 4; i++) {
        const pA = eq[i];
        const pB = eq[(i + 1) % 4];
        if (!pA || !pB) continue;
        const shadeTop = i % 2 === 0 ? 1.0 : 0.84;
        const shadeBot = i % 2 === 0 ? 0.68 : 0.56;
        prismPos.push(top[0], top[1], top[2], pA[0], pA[1], pA[2], pB[0], pB[1], pB[2]);
        for (let k = 0; k < 3; k++) {
          prismCol.push(
            Math.min(1, c.r * shadeTop),
            Math.min(1, c.g * shadeTop),
            Math.min(1, c.b * shadeTop),
          );
        }
        prismPos.push(bot[0], bot[1], bot[2], pB[0], pB[1], pB[2], pA[0], pA[1], pA[2]);
        for (let k = 0; k < 3; k++) {
          prismCol.push(c.r * shadeBot, c.g * shadeBot, c.b * shadeBot);
        }
      }
    });
    const prismGeo = new BufferGeometry();
    prismGeo.setAttribute("position", new Float32BufferAttribute(prismPos, 3));
    prismGeo.setAttribute("color", new Float32BufferAttribute(prismCol, 3));
    const prismMat = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
    });
    const prismObj = new Mesh(prismGeo, prismMat);
    prismObj.frustumCulled = false;
    prismObj.renderOrder = 8;

    const obj = new Group();
    obj.add(ringObj, baseObj, stemObj, prismObj, beaconObj);
    obj.visible = false;
    scene.add(obj);
    life = {
      pts,
      ne: points.map((p) => [p.e, p.n]),
      obj,
      geos: [beaconGeo, baseGeo, stemGeo, ringGeo, prismGeo],
      mats: [
        { mat: beaconMat, baseOpacity: 1 },
        { mat: baseMat, baseOpacity: 0.85 },
        { mat: stemMat, baseOpacity: 0.92 },
        { mat: ringMat, baseOpacity: 0.72 },
        { mat: prismMat, baseOpacity: 0.92 },
      ],
      lineMats: [stemMat, ringMat],
    };
  };

  const lifeShown = (st: {
    life?: number;
    sel: string | null;
    s: number;
    split?: number;
    rise?: number;
  }): number => {
    const on = st.life ?? 0;
    if (!on) return 0;
    const open = st.sel !== null && st.sel !== "time";
    return on * (open ? 1 - ease(st.s) : 1) * (1 - (st.split ?? 0)) * (st.rise ?? 1);
  };

  return {
    setLife,
    lifeShown,
    setResolution(width: number, height: number) {
      if (!life) return;
      for (const lm of life.lineMats) lm.resolution.set(width, height);
    },
    update(
      st: { life?: number; sel: string | null; s: number; split?: number; rise?: number },
      dim: number,
    ) {
      if (!life) return;
      const a = lifeShown(st);
      for (const m2 of life.mats) m2.mat.opacity = a * dim * m2.baseOpacity;
      life.obj.visible = a > 0.01;
    },
    projectLayout(
      st: {
        life?: number;
        sel: string | null;
        s: number;
        split?: number;
        rise?: number;
        lifeFocus?: number | null;
        lifeRing?: number | null;
      },
      project: (p: Vec3) => ScreenPoint,
      occluded: (p: Vec3) => boolean,
    ): {
      lifeAt: Float32Array | null;
      lifeFocus: { at: ScreenPoint; behind: boolean; ring: ScreenPoint[] | null } | null;
    } {
      if (lifeShown(st) <= 0.01 || !life) return { lifeAt: null, lifeFocus: null };
      const out = new Float32Array(life.pts.length * 2);
      life.pts.forEach((p, i) => {
        const q = project(p);
        out[i * 2] = q.x;
        out[i * 2 + 1] = q.y;
      });
      const focusIdx = st.lifeFocus;
      const focusPt = focusIdx != null ? life.pts[focusIdx] : undefined;
      if (focusIdx == null || !focusPt) return { lifeAt: out, lifeFocus: null };
      const neAt = life.ne[focusIdx];
      const lifeRingRadius = st.lifeRing;
      const ring =
        lifeRingRadius && neAt
          ? Array.from({ length: LIFE.ring + 1 }, (_, i) => {
              const a = (i / LIFE.ring) * Math.PI * 2;
              const E = neAt[0] + lifeRingRadius * Math.cos(a);
              const N = neAt[1] + lifeRingRadius * Math.sin(a);
              return project(frame.v(E, N, meshHeight(E, N) + 12));
            })
          : null;
      return {
        lifeAt: out,
        lifeFocus: { at: project(focusPt), behind: occluded(focusPt), ring },
      };
    },
    dispose() {
      if (!life) return;
      for (const g2 of life.geos) g2.dispose();
      for (const m2 of life.mats) m2.mat.dispose();
    },
  };
}
