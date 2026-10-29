// Renderer, camera and orbit for one instrument canvas. The camera is orthographic (a model on a table); its scale
// is in CSS pixels per model kilometre, so a layout measured before rendering draws exactly. It renders on demand,
// and every render ends by calling the layout callbacks so the labels follow the model.

import {
  Color,
  ColorManagement,
  LinearSRGBColorSpace,
  Mesh,
  NoToneMapping,
  OrthographicCamera,
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

export interface Stage {
  scene: Scene;
  camera: OrthographicCamera;
  lines: LineKit;
  /** CSS size of the canvas. */
  size(): { width: number; height: number };
  setView(view: View): void;
  /** The current bearing and elevation, after any orbit. */
  angles(): { azimuth: number; elevation: number };
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

export function createStage(canvas: HTMLCanvasElement, background: string): Stage {
  // every colour is the sRGB value the tokens write, as in CSS
  ColorManagement.enabled = false;
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setPixelRatio(window.devicePixelRatio);
  const scene = new Scene();
  scene.background = new Color(background);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.screenSpacePanning = true;
  const lines = new LineKit();
  const callbacks: (() => void)[] = [];
  let scale = 10;
  let design: View["design"];
  let width = 1;
  let height = 1;

  const frustum = () => {
    const fit = design ? Math.min(width / design.width, height / design.height) : 1;
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
