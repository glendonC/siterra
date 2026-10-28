// The globe renderer for the opening and the dive: one full-screen triangle ray traced against the unit
// sphere (shaders.ts). Ported from the design lane's hero study A4 (gl4.js Renderer, globe part only); the
// valley is MapLibre's, so this renderer is disposed once the dive has cross-faded to it.

import type { GlobeCamera, Vec3 } from "./frame";
import { FULL_VS, GLOBE_FS } from "./shaders";

/** Elevation in metres and land share, two floats per cell, north row first, over [west, south, east, north]. */
export interface Grid {
  w: number;
  h: number;
  box: [number, number, number, number];
  data: Float32Array;
}

export interface GlobeData {
  world: Grid;
  /** The Morocco and High Atlas patches, in that order. */
  regions: [Grid, Grid];
  /** Rangeland biome share per cell, 8 bits, equirectangular. */
  layer: { w: number; h: number; data: Uint8Array };
  /** Hillshade of the world relief. */
  shade: ImageBitmap;
}

/** One frame's uniforms. Modes are strengths so a dive passes from one to the next: relief, dots, unused, rising relief. */
export interface GlobeFrame {
  cam: GlobeCamera;
  sun: Vec3;
  key: Vec3;
  mode: [number, number, number, number];
  exag?: number;
  layerK?: number;
  /** Rows pole to pole for the coarse and fine lattice, the mix between them, dot scale. */
  dots?: [number, number, number, number];
  /** Contour interval level, reveal angle round the case (rad), soft edge (rad), strength. */
  cont?: [number, number, number, number];
  caseV: Vec3;
  fadeC?: Vec3;
  fade?: Vec3;
  haze?: Vec3;
  grat?: number;
  limb?: [number, number];
}

interface Program {
  p: WebGLProgram;
  u: (name: string) => WebGLUniformLocation | null;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type);
  if (!s) throw new Error("createShader failed");
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) ?? "shader compile failed");
  return s;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): Program {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? "program link failed");
  const cache = new Map<string, WebGLUniformLocation | null>();
  return {
    p,
    u: (n) => {
      if (!cache.has(n)) cache.set(n, gl.getUniformLocation(p, n));
      return cache.get(n) ?? null;
    },
  };
}

export class GlobeRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly prog: Program;
  private readonly vao: WebGLVertexArrayObject;
  private readonly floatLinear: boolean;
  private readonly floatRender: boolean;
  private textures: WebGLTexture[] = [];
  private globe?: {
    world: WebGLTexture;
    regs: [WebGLTexture, WebGLTexture];
    boxes: [Grid["box"], Grid["box"]];
    texel: Vec3;
    shade: WebGLTexture;
    layer: WebGLTexture;
  };
  private size: [number, number] = [0, 0];
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      depth: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 is not available.");
    this.gl = gl;
    this.floatLinear = Boolean(gl.getExtension("OES_texture_float_linear"));
    this.floatRender = Boolean(gl.getExtension("EXT_color_buffer_float"));
    this.prog = program(gl, FULL_VS, GLOBE_FS);
    this.vao = gl.createVertexArray();
  }

  private tex(
    w: number,
    h: number,
    internal: number,
    format: number,
    type: number,
    data: ArrayBufferView,
    repeat: boolean,
    mip: boolean,
  ): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    const filter = type === gl.FLOAT && !this.floatLinear ? gl.NEAREST : gl.LINEAR;
    let minFilter: number = filter;
    if (mip && (type !== gl.FLOAT || (this.floatLinear && this.floatRender))) {
      gl.getError();
      gl.generateMipmap(gl.TEXTURE_2D);
      if (gl.getError() === gl.NO_ERROR) minFilter = gl.LINEAR_MIPMAP_LINEAR;
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.textures.push(t);
    return t;
  }

  /** An image with its sRGB values kept as they are. */
  private imageTex(img: ImageBitmap): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.textures.push(t);
    return t;
  }

  setGlobe(g: GlobeData): void {
    const gl = this.gl;
    const grid = (r: Grid, repeat: boolean) =>
      this.tex(r.w, r.h, gl.RG32F, gl.RG, gl.FLOAT, r.data, repeat, true);
    const [r0, r1] = g.regions;
    this.globe = {
      world: grid(g.world, true),
      regs: [grid(r0, false), grid(r1, false)],
      boxes: [r0.box, r1.box],
      texel: [360 / g.world.w, (r0.box[2] - r0.box[0]) / r0.w, (r1.box[2] - r1.box[0]) / r1.w],
      shade: this.imageTex(g.shade),
      layer: this.tex(
        g.layer.w,
        g.layer.h,
        gl.R8,
        gl.RED,
        gl.UNSIGNED_BYTE,
        g.layer.data,
        true,
        true,
      ),
    };
  }

  resize(w: number, h: number): void {
    if (this.size[0] === w && this.size[1] === h) return;
    this.size = [w, h];
    this.canvas.width = w;
    this.canvas.height = h;
  }

  draw(f: GlobeFrame): void {
    const gl = this.gl;
    const [w, h] = this.size;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    const G = this.globe;
    if (!G) return;
    const P = this.prog;
    const c = f.cam;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(P.p);
    gl.uniform3fv(P.u("u_eye"), c.eye);
    gl.uniform3fv(P.u("u_right"), c.right);
    gl.uniform3fv(P.u("u_up"), c.upv);
    gl.uniform3fv(P.u("u_back"), c.back);
    gl.uniform4fv(P.u("u_proj"), c.proj);
    gl.uniform2f(P.u("u_res"), w, h);
    const tex: [string, WebGLTexture][] = [
      ["u_world", G.world],
      ["u_reg0", G.regs[0]],
      ["u_reg1", G.regs[1]],
      ["u_shade", G.shade],
      ["u_layer", G.layer],
    ];
    tex.forEach(([n, t], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(P.u(n), i);
    });
    gl.uniform4fv(P.u("u_box0"), G.boxes[0]);
    gl.uniform4fv(P.u("u_box1"), G.boxes[1]);
    gl.uniform3fv(P.u("u_texel"), G.texel);
    gl.uniform1f(P.u("u_layerK"), f.layerK ?? 0);
    gl.uniform3fv(P.u("u_sun"), f.sun);
    gl.uniform3fv(P.u("u_key"), f.key);
    gl.uniform4fv(P.u("u_mode"), f.mode);
    gl.uniform1f(P.u("u_exag"), f.exag ?? 0);
    gl.uniform4fv(P.u("u_dots"), f.dots ?? [200, 400, 0, 1]);
    gl.uniform4fv(P.u("u_cont"), f.cont ?? [100, 0, 0.01, 0]);
    gl.uniform3fv(P.u("u_case"), f.caseV);
    gl.uniform3fv(P.u("u_fadeC"), f.fadeC ?? f.caseV);
    gl.uniform3fv(P.u("u_fade"), f.fade ?? [1, 2, 0]);
    gl.uniform3fv(P.u("u_haze"), f.haze ?? [10, 20, 0]);
    gl.uniform1f(P.u("u_grat"), f.grat ?? 0);
    gl.uniform2fv(P.u("u_limb"), f.limb ?? [0.28, 0.55]);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Frees every GPU resource. With loseContext, also gives the context back, so only MapLibre's runs after
   * the dive; a canvas that may be drawn again (an effect cleaned up and run again) keeps its context.
   */
  dispose(loseContext = false): void {
    const gl = this.gl;
    for (const t of this.textures) gl.deleteTexture(t);
    this.textures = [];
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.prog.p);
    if (loseContext) gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.globe = undefined;
  }
}
