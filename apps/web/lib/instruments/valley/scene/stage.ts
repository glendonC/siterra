// Renderer, camera and orbit for one instrument canvas. The camera is orthographic (a model on a table), its scale
// in CSS pixels per model kilometre, or perspective with a lens shift (the cutaway, facing its section); either way
// a layout measured before rendering at the design size draws exactly. It renders on demand, and every render ends
// by calling the layout callbacks so the labels follow the model.

import {
  Color,
  ColorManagement,
  LinearSRGBColorSpace,
  Mesh,
  NoToneMapping,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Vec3 } from "../frame";
import { LineKit } from "./lines";

export interface View {
  target: Vec3;
  /** Bearing of the camera from the target, degrees clockwise from north (north is -z). */
  azimuth: number;
  /** Degrees above the horizon. */
  elevation: number;
  /** CSS pixels per model kilometre (at the design size, when one is given). */
  scale: number;
  /** The canvas size the scale was measured at; other sizes scale the view to fit inside it. */
  design?: { width: number; height: number };
}

/** A perspective view: the camera on a bearing and elevation from the target, at a distance (km). */
export interface PerspectiveView {
  target: Vec3;
  azimuth: number;
  elevation: number;
  distance: number;
  /**
   * Lens shift in CSS px at the design size: moves the picture without turning the camera, so lines parallel to
   * the image plane stay horizontal.
   */
  shift: readonly [number, number];
  /** The canvas size the view was measured at; other sizes scale the picture to fit inside it. */
  design: { width: number; height: number };
}

export interface Stage {
  scene: Scene;
  camera: OrthographicCamera | PerspectiveCamera;
  lines: LineKit;
  /** CSS size of the canvas. */
  size(): { width: number; height: number };
  /** An orthographic view (a stage made without a field of view). */
  setView(view: View): void;
  /** A perspective view (a stage made with a field of view); the orbit keeps its distance and shift. */
  setPerspectiveView(view: PerspectiveView): void;
  /** The current bearing and elevation, after any orbit. */
  angles(): { azimuth: number; elevation: number };
  /** Moves the camera along its line to the target: a factor below 1 closer, above 1 farther (the view control). */
  zoomBy(factor: number): void;
  /**
   * Narrows a perspective stage's field of view by a factor (1 as made): with the camera drawn back to keep the
   * picture's size, a factor near 0 makes the view nearly orthographic (the overview handing its land to the layer
   * stack).
   */
  setFovScale(k: number): void;
  render(): void;
  /** Screen position (CSS px, from the canvas's top left) of a model point. */
  project(p: Vec3): { x: number; y: number };
  onRender(f: () => void): void;
  dispose(): void;
}

const DEG = Math.PI / 180;

/** A mesh with three's default geometry and material types (instanceof alone gives its generics as any). */
const isMesh = (o: Object3D): o is Mesh => o instanceof Mesh;

/** Unit vector from the target towards the camera. */
export function viewBack(azimuth: number, elevation: number): Vec3 {
  const a = azimuth * DEG;
  const e = elevation * DEG;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)];
}

/**
 * A stage on a canvas. With `fov` (vertical, degrees, at the design size) the camera is perspective; at other
 * sizes the field of view and the shift are scaled so that the picture fits as an orthographic one would. With
 * `alpha` the canvas is transparent and the background colour is not drawn.
 */
export function createStage(
  canvas: HTMLCanvasElement,
  background: string,
  opts: { fov?: number; alpha?: boolean } = {},
): Stage {
  // every colour is the sRGB value the tokens write, as in CSS
  ColorManagement.enabled = false;
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    // a stage over its own ground (the overview) clears to transparent
    alpha: opts.alpha ?? false,
  });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setPixelRatio(window.devicePixelRatio);
  const scene = new Scene();
  if (opts.alpha) renderer.setClearColor(0x000000, 0);
  else scene.background = new Color(background);
  const camera =
    opts.fov === undefined
      ? new OrthographicCamera(-1, 1, 1, -1, 1, 4000)
      : new PerspectiveCamera(opts.fov, 1, 0.5, 4000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.screenSpacePanning = true;
  const lines = new LineKit();
  const callbacks: (() => void)[] = [];
  let scale = 10;
  let fovScale = 1;
  let design: View["design"];
  let shift: readonly [number, number] = [0, 0];
  let width = 1;
  let height = 1;

  const frustum = () => {
    const fit = design ? Math.min(width / design.width, height / design.height) : 1;
    if (camera instanceof PerspectiveCamera) {
      // the picture's size follows the fit, as an orthographic scale would: widen the view by the height that
      // is spare at this aspect, and scale the shift
      const spare = design ? height / (design.height * fit) : 1;
      const half = ((opts.fov ?? camera.fov) * fovScale * DEG) / 2;
      camera.fov = (2 * Math.atan(Math.tan(half) * spare)) / DEG;
      camera.aspect = width / height;
      if (shift[0] || shift[1])
        camera.setViewOffset(width, height, -shift[0] * fit, -shift[1] * fit, width, height);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      return;
    }
    const w = width / (scale * fit) / 2;
    const h = height / (scale * fit) / 2;
    camera.left = -w;
    camera.right = w;
    camera.top = h;
    camera.bottom = -h;
    camera.updateProjectionMatrix();
  };
  const render = () => {
    renderer.render(scene, camera);
    for (const f of callbacks) f();
  };
  const resize = () => {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    lines.resize(width, height);
    frustum();
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  controls.addEventListener("change", render);
  width = Math.max(1, canvas.clientWidth);
  height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  lines.resize(width, height);

  const v = new Vector3();
  return {
    scene,
    camera,
    lines,
    size: () => ({ width, height }),
    setPerspectiveView({ target, azimuth, elevation, distance, shift: sh, design: d }) {
      design = d;
      shift = sh;
      const back = viewBack(azimuth, elevation);
      camera.position
        .set(target[0], target[1], target[2])
        .addScaledVector(new Vector3(...back), distance);
      camera.up.set(0, 1, 0);
      controls.target.set(target[0], target[1], target[2]);
      camera.lookAt(controls.target);
      // the far plane keeps the land in view however far the camera stands (the overview's arrival from the globe
      // starts thousands of km out); the near plane follows so the depth keeps its precision
      if (camera instanceof PerspectiveCamera) {
        camera.far = Math.max(4000, distance * 2);
        camera.near = Math.max(0.5, distance / 8000);
      }
      frustum();
      camera.updateMatrixWorld();
      controls.update();
    },
    setFovScale(k) {
      fovScale = k;
      frustum();
    },
    setView({ target, azimuth, elevation, scale: s, design: d }) {
      scale = s;
      design = d;
      const back = viewBack(azimuth, elevation);
      camera.position
        .set(target[0], target[1], target[2])
        .addScaledVector(new Vector3(...back), 1500);
      camera.up.set(0, 1, 0);
      controls.target.set(target[0], target[1], target[2]);
      camera.lookAt(controls.target);
      camera.zoom = 1;
      frustum();
      controls.update();
    },
    angles() {
      v.copy(camera.position).sub(controls.target).normalize();
      return {
        azimuth: (Math.atan2(v.x, -v.z) / DEG + 360) % 360,
        elevation: Math.asin(Math.min(1, Math.max(-1, v.y))) / DEG,
      };
    },
    zoomBy(factor) {
      if (camera instanceof PerspectiveCamera) {
        v.copy(camera.position).sub(controls.target).multiplyScalar(factor);
        camera.position.copy(controls.target).add(v);
      } else {
        camera.zoom = Math.min(8, Math.max(0.25, camera.zoom / factor));
        camera.updateProjectionMatrix();
      }
      camera.updateMatrixWorld();
      controls.update();
      render();
    },
    render,
    project(p) {
      v.set(p[0], p[1], p[2]).project(camera);
      return { x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height };
    },
    onRender(f) {
      callbacks.push(f);
    },
    // geometries, materials and the textures they hold as a map; textures passed as uniforms belong to the
    // scene's builder, which disposes them
    dispose() {
      observer.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        if (!isMesh(o)) return;
        o.geometry.dispose();
        const mats: Material[] = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if ("map" in m && m.map instanceof Texture) m.map.dispose();
          m.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
