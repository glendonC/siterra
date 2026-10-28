// Shader source for the globe on paper, ported unchanged from the design lane's approved hero study A4
// (gl4.js, 27 Oct 2026; our own code). The globe is ray traced per pixel against the unit sphere: relief,
// dots sized by elevation, contour lines drawn outward from the case, the rising relief, and the rangeland
// biomes lit. Edit the look in one place: here. The palette is generated from the daylight tokens, which
// hold the same values the study wrote by hand (paper 0.949, 0.937, 0.918 and so on).

import { daylight } from "../theme/daylight";

/** A "#rrggbb" token as a GLSL vec3 of sRGB values, three decimals. */
export function vec3(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const c = [m[1], m[2], m[3]].map((h) => (parseInt(h ?? "0", 16) / 255).toFixed(3));
  return `vec3(${c.join(", ")})`;
}

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
`;
// The daylight palette (design language 1.3): paper, ink, grey, the cool shadow tint, the accent (light and line only); the
// land's albedo and key light are DESIGN B's.
const PALETTE = `
const vec3 PAPER = ${vec3(daylight.paper)}, INK = ${vec3(daylight.ink)}, GREY = ${vec3(daylight.grey)};
const vec3 SHADOW = ${vec3(daylight.shadowTint)}, ALBEDO = ${vec3(daylight.albedo)};
`;
const CONTOUR = `
float contourLine(float h, float interval, float widthPx, float fadeLo, float fadeHi) {
  float c = (h + 0.37) / interval;
  float fw = max(fwidth(c), 1e-5);
  float l = 1.0 - smoothstep(0.0, widthPx, abs(fract(c - 0.5) - 0.5) / fw);
  return l * (1.0 - smoothstep(fadeLo, fadeHi, fw));
}`;

export const FULL_VS = `${HEAD}
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }`;

// The globe on paper. Modes are strengths, so a dive can pass from one to the next: x relief from the GLO-90 hillshade, y dots
// sized by elevation, z contour lines (drawn outward from the case), w the rising relief lit from its own normals.
export const GLOBE_FS = `${HEAD}${PALETTE}${CONTOUR}
uniform vec3 u_eye; uniform vec3 u_right; uniform vec3 u_up; uniform vec3 u_back; uniform vec4 u_proj; uniform vec2 u_res;
uniform sampler2D u_world; uniform sampler2D u_reg0; uniform sampler2D u_reg1;
uniform vec4 u_box0; uniform vec4 u_box1; uniform vec3 u_texel; // degrees per cell: world, region 0, region 1
uniform sampler2D u_shade; uniform sampler2D u_layer; uniform float u_layerK;
uniform vec3 u_sun; uniform vec3 u_key; uniform vec4 u_mode; uniform float u_exag;
uniform vec4 u_dots; // rows from pole to pole for the coarse and the fine lattice, the mix between them, dot scale
uniform vec4 u_cont; // interval in metres, reveal angle around the case (rad), soft edge (rad), strength
uniform vec3 u_case; uniform vec3 u_fadeC; uniform vec3 u_fade; // fade to paper round the catchment centre: inner, outer (rad), strength
uniform vec3 u_haze; // distance haze from the eye: near, far (Earth radii), strength
uniform float u_grat;
uniform vec2 u_limb; // facing range over which the dots settle into their mean tone toward the limb
out vec4 o;
float feather(vec2 ll, vec4 b, float f) { vec2 m = min(ll - b.xy, b.zw - ll); return smoothstep(0.0, f, min(m.x, m.y)); }
vec2 boxUV(vec2 ll, vec4 b) { return vec2((ll.x - b.x) / (b.z - b.x), (b.w - ll.y) / (b.w - b.y)); }
vec2 worldAt(vec2 ll) { return texture(u_world, vec2((ll.x + 180.0) / 360.0, (90.0 - ll.y) / 180.0)).rg; }
vec2 hl(vec2 ll, vec2 wr) {
  vec2 v = worldAt(ll);
  v = mix(v, texture(u_reg0, boxUV(ll, u_box0)).rg, wr.x);
  return mix(v, texture(u_reg1, boxUV(ll, u_box1)).rg, wr.y);
}
// generalised: the grids' mip levels biased coarser, so contour lines follow the land's form at the scale of the view
vec2 hlb(vec2 ll, vec2 wr, float bias) {
  vec2 v = texture(u_world, vec2((ll.x + 180.0) / 360.0, (90.0 - ll.y) / 180.0), bias).rg;
  v = mix(v, texture(u_reg0, boxUV(ll, u_box0), bias).rg, wr.x);
  return mix(v, texture(u_reg1, boxUV(ll, u_box1), bias).rg, wr.y);
}
// at a fixed footprint in degrees (the dots' own cells)
vec2 hlLod(vec2 ll, float span) {
  vec2 wr = vec2(feather(ll, u_box0, 0.4), feather(ll, u_box1, 0.15));
  vec2 v = textureLod(u_world, vec2((ll.x + 180.0) / 360.0, (90.0 - ll.y) / 180.0), log2(max(span / u_texel.x, 1.0))).rg;
  v = mix(v, textureLod(u_reg0, boxUV(ll, u_box0), log2(max(span / u_texel.y, 1.0))).rg, wr.x);
  return mix(v, textureLod(u_reg1, boxUV(ll, u_box1), log2(max(span / u_texel.z, 1.0))).rg, wr.y);
}
// One lattice of dots, rows of equal spacing and as many dots per row as fit round the parallel; returns coverage and the
// dot's elevation weight. Each dot reads the land and elevation at its own centre.
vec3 dots(vec2 ll, float rows, float pxDeg) {
  float d = 180.0 / rows;
  float j = floor((ll.y + 90.0) / d), latc = -90.0 + (j + 0.5) * d;
  float n = max(1.0, floor(360.0 * cos(radians(latc)) / d + 0.5)), dl = 360.0 / n;
  float i = floor((ll.x + 180.0) / dl), lonc = -180.0 + (i + 0.5) * dl;
  vec2 c = vec2(lonc, latc), off = vec2((ll.x - lonc) * cos(radians(latc)), ll.y - latc);
  vec2 v = hlLod(c, d);
  float land = step(0.5, v.y), e = clamp(v.x / 4200.0, 0.0, 1.0);
  float r = d * (land > 0.5 ? mix(0.17, 0.44, pow(e, 0.55)) : 0.09) * u_dots.w;
  float cov = 1.0 - smoothstep(r - pxDeg * 0.7, r + pxDeg * 0.7, length(off));
  return vec3(cov, land, e);
}
void main() {
  vec2 ndc = gl_FragCoord.xy / u_res * 2.0 - 1.0;
  vec3 dir = normalize(u_right * ((ndc.x - u_proj.z) * u_proj.y / u_proj.x) + u_up * ((ndc.y - u_proj.w) / u_proj.x) - u_back);
  float b = dot(u_eye, dir), c = dot(u_eye, u_eye) - 1.0, disc = b * b - c;
  vec3 col = PAPER;
  float t = -b - sqrt(max(disc, 0.0));
  if (disc > 0.0 && t > 0.0) {
    vec3 p = normalize(u_eye + dir * t);
    vec2 ll = vec2(degrees(atan(p.y, p.x)), degrees(asin(clamp(p.z, -1.0, 1.0))));
    vec3 east = normalize(vec3(-p.y, p.x, 0.0) + vec3(1e-6, 0.0, 0.0)), north = cross(p, east);
    vec2 wr = vec2(feather(ll, u_box0, 0.4), feather(ll, u_box1, 0.15));
    float texel = mix(mix(u_texel.x, u_texel.y, wr.x), u_texel.z, wr.y);
    vec2 fp = fwidth(ll);
    float cl0 = max(cos(radians(ll.y)), 0.05);
    float pxDeg = max(fp.x * cl0, fp.y);
    vec2 v = hl(ll, wr);
    float land = smoothstep(0.3, 0.7, v.y);
    float facing = max(dot(p, -dir), 0.0);
    // the sphere's own light, front-left: lit as the valley is lit, with a soft cool limb
    float sph = dot(p, u_sun);
    float body = smoothstep(-0.35, 0.9, sph);
    vec3 lit = ALBEDO * u_key;
    vec3 sea = mix(PAPER, SHADOW, 0.16);
    vec3 bodyC = mix(PAPER, SHADOW, 0.075), seaMap = mix(PAPER, SHADOW, 0.13);
    vec3 ground = mix(seaMap, bodyC, land);
    // GLO-90 relief: the hillshade read as N.L, in the valley's formula (flat ground at the lit albedo, lee slopes to the tint)
    if (u_mode.x > 0.001) {
      float hs = texture(u_shade, vec2((ll.x + 180.0) / 360.0, (90.0 - ll.y) / 180.0), -0.5).r;
      // flat ground is 180 of 255 in the science lane's hillshade; its slopes span about 105 to 210 over the High Atlas
      float sh = smoothstep(0.0, 1.0, clamp(0.952 + (hs - 0.7059) * 4.0, 0.0, 1.0));
      vec3 rel = mix(mix(SHADOW, lit, 0.40), lit, sh);
      ground = mix(ground, mix(sea, rel, land), u_mode.x);
    }
    // the rising relief: normals from the grids with the dive's exaggeration
    if (u_mode.w > 0.001) {
      float d = max(texel, pxDeg * 1.5);
      float hx = (hl(ll + vec2(d / cl0, 0.0), wr).x - hl(ll - vec2(d / cl0, 0.0), wr).x) / (2.0 * d * 111195.0);
      float hy = (hl(ll + vec2(0.0, d), wr).x - hl(ll - vec2(0.0, d), wr).x) / (2.0 * d * 111195.0);
      vec3 n = normalize(p - u_exag * land * (hx * east + hy * north));
      float shade = max(dot(n, u_sun), 0.0) / max(max(dot(p, u_sun), 0.0) * 1.05, 0.2);
      float sh = smoothstep(0.0, 1.0, clamp(shade, 0.0, 1.0));
      vec3 rel = mix(mix(SHADOW, lit, 0.40), lit, sh);
      rel = mix(rel, u_key, clamp(shade - 1.0, 0.0, 0.5) * 0.25);
      ground = mix(ground, mix(sea, rel, land), u_mode.w);
    }
    // dots: the sphere's body stays pale, the land is read from the dots alone
    if (u_mode.y > 0.001) {
      vec3 a = dots(ll, u_dots.x, pxDeg), f = dots(ll, u_dots.y, pxDeg);
      float cov = mix(a.x, f.x, u_dots.z), dl = mix(a.y, f.y, u_dots.z), de = mix(a.z, f.z, u_dots.z);
      vec3 dotC = dl > 0.5 ? mix(GREY, INK, 0.25 + 0.6 * de) : mix(bodyC, GREY, 0.45);
      vec3 dg = mix(bodyC, dotC, cov);
      // toward the limb the lattice is foreshortened past what a pixel can hold: there the dots settle into their mean tone
      vec3 mean = mix(bodyC, mix(GREY, INK, 0.3), 0.22 * land);
      dg = mix(mean, dg, smoothstep(u_limb.x, u_limb.y, facing));
      ground = mix(ground, dg, u_mode.y);
    }
    // the rangeland biomes lit: inside them the warm light pool of the valley, outside the land takes paper haze
    float share = texture(u_layer, vec2((ll.x + 180.0) / 360.0, (90.0 - ll.y) / 180.0)).r * land;
    float lk = u_layerK * smoothstep(0.15, 0.6, share);
    ground *= mix(vec3(1.0), vec3(1.10, 1.07, 1.02), lk);
    ground = mix(ground, PAPER, 0.30 * u_layerK * land * (1.0 - smoothstep(0.15, 0.6, share)) * (1.0 - u_mode.y * 0.5));
    if (u_mode.y > 0.001) ground = mix(ground, ground * vec3(1.03, 1.0, 0.93) + vec3(0.02, 0.012, 0.0), lk * u_mode.y);
    // contour lines, drawn outward from the case
    if (u_cont.w > 0.001) {
      float ang = acos(clamp(dot(p, u_case), -1.0, 1.0));
      float rv = 1.0 - smoothstep(u_cont.y - u_cont.z, u_cont.y, ang);
      float hg = hlb(ll, wr, 1.5).x, ia = 100.0 * exp2(floor(u_cont.x));
      float ca = contourLine(hg, ia, 1.0, 0.22, 0.5), cb = contourLine(hg, ia * 2.0, 1.0, 0.22, 0.5);
      float cl = mix(ca, cb, smoothstep(0.2, 0.8, fract(u_cont.x)));
      float cmaj = contourLine(hg, ia * 10.0, 1.25, 0.3, 0.6);
      ground = mix(ground, INK, max(cl * 0.36, cmaj * 0.5) * land * rv * u_cont.w);
    }
    // the coast as a faint drawn line, the graticule
    float lw = max(fwidth(v.y), 1e-4);
    ground = mix(ground, GREY, (1.0 - smoothstep(0.6, 1.6, abs(v.y - 0.5) / lw)) * 0.25 * (1.0 - u_mode.y));
    vec2 g = ll / 15.0, gd = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), vec2(1e-5));
    ground = mix(ground, INK, (1.0 - min(min(gd.x, gd.y), 1.0)) * u_grat);
    col = ground * mix(0.86, 1.0, body);
    col = mix(col, mix(PAPER, SHADOW, 0.3), pow(1.0 - facing, 3.0) * 0.35);
    // haze: away from the study area, and with distance from the eye (as the valley block)
    float r = acos(clamp(dot(p, u_fadeC), -1.0, 1.0));
    col = mix(col, PAPER, smoothstep(u_fade.x, u_fade.y, r) * u_fade.z);
    col = mix(col, PAPER, smoothstep(u_haze.x, u_haze.y, t) * u_haze.z);
  } else {
    // a faint cool limb on the paper, so the sphere reads without an outline
    vec3 cl = u_eye + dir * max(-b, 0.0);
    float dc = length(cl);
    col = mix(PAPER, mix(PAPER, SHADOW, 0.35), exp(-max(dc - 1.0, 0.0) / 0.006) * 0.35 * (1.0 - u_fade.z));
  }
  o = vec4(col, 1.0);
}`;
