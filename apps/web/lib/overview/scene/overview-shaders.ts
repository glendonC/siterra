// GLSL shaders and WebGL program setup for the overview terrain, boundary wall, depth occluder,
// regional topographic survey plan, and secondary arc overlay renderer.

import {
  LinearSRGBColorSpace,
  Mesh,
  NoToneMapping,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import type { Vec3 } from "../../instruments/valley/frame";
import { hexRgb } from "../../instruments/valley/palette";
import { type Channels, overviewColours as C } from "../../theme/obsidian";
import { ARC, STEP, arcAlpha, type ArcSpan } from "../arc";

export const hexVec = (hex: string) => new Vector3(...hexRgb(hex));
export const channelVec = (c: Channels) => new Vector3(c[0], c[1], c[2]);

export const HEIGHT_GLSL = /* glsl */ `
uniform sampler2D uH;
uniform vec2 uTex;          // relief grid size in cells
uniform vec4 uHRect;        // relief grid rectangle in model x, z: x0, z0, x1, z1 (outer cell edges)
vec2 hUV(vec2 xz) { return (xz - uHRect.xy) / (uHRect.zw - uHRect.xy); }
float hAt(vec2 uv) {
  vec2 p = uv * uTex - 0.5;
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p);
  ivec2 m = ivec2(uTex) - 1;
  float a = texelFetch(uH, clamp(i, ivec2(0), m), 0).r;
  float b = texelFetch(uH, clamp(i + ivec2(1, 0), ivec2(0), m), 0).r;
  float c = texelFetch(uH, clamp(i + ivec2(0, 1), ivec2(0), m), 0).r;
  float d = texelFetch(uH, clamp(i + ivec2(1, 1), ivec2(0), m), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float contour(float h, float interval, float w) {
  float c = (h + 0.37) / interval;
  float fw = max(fwidth(c), 1e-5);
  float l = 1.0 - smoothstep(0.0, w, abs(fract(c - 0.5) - 0.5) / fw);
  return l * (1.0 - smoothstep(0.25, 0.6, fw));
}
float limitLine(float h, float at, float w) { float fw = max(fwidth(h), 1e-3); return 1.0 - smoothstep(0.0, w, abs(h - at) / fw); }
`;

export const RELIEF_VERT = /* glsl */ `
attribute float elev;
uniform float uExag, uBase;
varying vec3 vWorld;
void main() {
  vec3 p = vec3(position.x, (elev - uBase) * uExag / 1000.0, position.z);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const RELIEF_FRAG = /* glsl */ `
${HEIGHT_GLSL}
uniform sampler2D uMask;    // B channel: inside the catchment (10 m analysis grid); R tree cover; G cropland or built-up
uniform vec4 uMaskRect;
uniform sampler2D uLM;      // baked from the relief: R soft cast shadow (1 lit), G ambient occlusion (1 open)
uniform float uExag;
uniform vec3 uL, uLight, uAmbient, uSky, uAlbedo, uLine, uTreeC, uCropC, uLimitC;
uniform float uContour, uIndex, uCoverA, uLimitA, uLimitAt;
uniform float uCell;        // the relief grid's cell (m), for the normals
uniform vec2 uStep;         // contour interval and index interval (m)
uniform vec3 uFogC;
uniform vec3 uFog;          // near, far (km from the camera), max mix
uniform float uDim;         // 1 normal; lower dims the land (the ask open)
uniform vec3 uRimC;
uniform float uRimA, uSmooth;
uniform sampler2D uOver;    // a finding's footprint painted on the land (RGBA, row 0 north, over uOverRect)
uniform vec4 uOverRect;
uniform float uOverA;       // 0 none, 1 the footprint shown
uniform float uBandAt, uBandA; // a band below this height (m) lit, the rest stepped back (0 to 1)
uniform float uRangeLo, uRangeHi, uRangeA; // a proposed field check's band between two heights (m), lit
uniform vec3 uRangeC;       // its colour: the accent, for a proposed thing
uniform vec2 uSnowLimits;   // the two elevation band limits (m), for snow by band
uniform vec3 uSnow;         // each band's share under snow that month, lowest band first (0 to 1)
uniform float uSnowA;
uniform vec3 uSnowC;
uniform float uCarve;
uniform sampler2D uWater;   // water's share of each relief cell (R, linear), a live place's mask; none elsewhere
uniform vec3 uWaterC;
uniform sampler2D uPhoto;   // Sentinel-2 true-colour composite on the relief grid (RGBA, linear), when read
uniform float uPhotoA;      // 0 none (bundled relief), >0 mixes the true-colour composite into the albedo
uniform float uScanA, uScanH; // the measurement front: its strength (0 none) and height (m)
uniform vec3 uScanC;
varying vec3 vWorld;
void main() {
  vec2 xz = vWorld.xz;
  vec2 mu = (xz - uMaskRect.xy) / (uMaskRect.zw - uMaskRect.xy);
  vec4 mk = texture(uMask, mu);
  if (mk.b < 0.5 || mu.x < 0.0 || mu.y < 0.0 || mu.x > 1.0 || mu.y > 1.0) discard;

  vec2 uv = hUV(xz);
  float h = hAt(uv);
  vec2 e = 1.0 / uTex;
  float cell = uCell;
  float effExag = uExag * mix(0.28, 1.0, uCarve);
  float hl = hAt(uv - vec2(e.x, 0.0)), hr = hAt(uv + vec2(e.x, 0.0));
  float hn = hAt(uv - vec2(0.0, e.y)), hs = hAt(uv + vec2(0.0, e.y));
  vec3 n1 = normalize(vec3(-(hr - hl) / (2.0 * cell) * effExag, 1.0, -(hs - hn) / (2.0 * cell) * effExag));
  // a second normal over 90 m, so the 30 m micro-relief reads as texture, not as hair
  float hl3 = hAt(uv - vec2(3.0 * e.x, 0.0)), hr3 = hAt(uv + vec2(3.0 * e.x, 0.0));
  float hn3 = hAt(uv - vec2(0.0, 3.0 * e.y)), hs3 = hAt(uv + vec2(0.0, 3.0 * e.y));
  vec3 n3 = normalize(vec3(-(hr3 - hl3) / (6.0 * cell) * effExag, 1.0, -(hs3 - hn3) / (6.0 * cell) * effExag));
  vec3 n = normalize(mix(n1, n3, uSmooth));
  float lap = (hl + hr + hn + hs - 4.0 * h);
  vec4 lm = texture(uLM, uv);
  float sh = mix(0.88, lm.r, uCarve), ao = mix(0.96, lm.g, uCarve);

  // albedo: neutral ground, then the WorldCover classes (2021, 10 m) and any snow-free Sentinel-2 true colour mixed in before the light
  vec3 alb = uAlbedo;
  alb = mix(alb, uCropC, mk.g * uCoverA);
  alb = mix(alb, uTreeC, mk.r * uCoverA);
  if (uPhotoA > 0.001) {
    vec4 ph = texture(uPhoto, uv);
    alb = mix(alb, ph.rgb, ph.a * uPhotoA);
  }

  float diff = max(dot(n, uL), 0.0) * sh;
  float sky = 0.5 + 0.5 * n.y;
  vec3 col = alb * (uLight * diff + uAmbient * ao * sky) + uSky * pow(1.0 - n.y, 2.0) * 0.06 * ao;
  // channel floors a touch darker, crests a touch lighter (from the relief itself)
  col *= 1.0 - clamp(lap / 220.0, -0.05, 0.05);

  // water, flat at its level: the drainage tone under the same light with a little sky in it, no contours on it
  float wtr = smoothstep(0.3, 0.7, texture(uWater, uv).r);
  if (wtr > 0.001) {
    vec3 wcol = uWaterC * (uLight * 0.42 + uAmbient * 0.9) + uSky * 0.1;
    col = mix(col, wcol, wtr);
  }

  // a finding's footprint on the land, lit by the land's own light so the relief still reads through it
  if (uOverA > 0.001) {
    vec2 ou = (xz - uOverRect.xy) / (uOverRect.zw - uOverRect.xy);
    vec4 ov = texture(uOver, ou);
    float shade = 0.5 + 0.5 * clamp(diff * 1.1 + 0.3 * sky, 0.0, 1.0);
    col = mix(col, ov.rgb * shade, ov.a * uOverA);
  }
  // the band a finding is about lit, the rest of the land stepped back
  if (uBandA > 0.001) {
    float inBand = 1.0 - smoothstep(uBandAt - 6.0, uBandAt + 6.0, h);
    col *= mix(1.0, mix(0.42, 1.12, inBand), uBandA);
  }

  // the band a proposed field check stands on, in the accent, the rest stepped back (the next-steps package)
  if (uRangeA > 0.001) {
    float inRange = smoothstep(uRangeLo - 6.0, uRangeLo + 6.0, h) * (1.0 - smoothstep(uRangeHi - 6.0, uRangeHi + 6.0, h));
    col *= mix(1.0, mix(0.5, 1.0, inRange), uRangeA);
    col = mix(col, uRangeC * (0.35 + 0.65 * diff), inRange * 0.42 * uRangeA);
  }

  // a month's snow, each band's measured share spread evenly over that band (where in the band it lay is not drawn)
  if (uSnowA > 0.001) {
    float b0 = 1.0 - smoothstep(uSnowLimits.x - 6.0, uSnowLimits.x + 6.0, h);
    float b2 = smoothstep(uSnowLimits.y - 6.0, uSnowLimits.y + 6.0, h);
    float share = uSnow.x * b0 + uSnow.y * (1.0 - b0 - b2) + uSnow.z * b2;
    col = mix(col, uSnowC * (0.45 + 0.55 * clamp(diff * 1.1 + 0.3 * sky, 0.0, 1.0)), clamp(share, 0.0, 1.0) * 0.85 * uSnowA * (1.0 - wtr));
  }

  float c250 = contour(h, uStep.x, 0.9);
  float c1000 = contour(h, uStep.y, 1.2);
  float c50 = contour(h, uStep.x / 5.0, 0.75);
  col = mix(col, uLine, clamp(c250 * mix(0.55, uContour, uCarve) + c1000 * mix(0.65, uIndex, uCarve) + c50 * (1.0 - uCarve) * 0.25, 0.0, 1.0) * (0.55 + 0.45 * diff) * (1.0 - wtr));
  if (uLimitA > 0.001) col = mix(col, uLimitC, limitLine(h, uLimitAt, 1.0) * uLimitA * (1.0 - wtr));

  // During Stage 1 (2D Survey Plan, uCarve < 1.0), overlay the survey grid and extraction tint
  if (uCarve < 0.999) {
    float planW = 1.0 - uCarve;
    vec2 gCoord = xz / 3.5;
    vec2 gFract = abs(fract(gCoord - 0.5) - 0.5);
    vec2 gFw = max(fwidth(gCoord), 1e-4);
    vec2 gLine2 = 1.0 - smoothstep(0.0, 1.2, gFract / gFw);
    float majorGrid = max(gLine2.x, gLine2.y);
    float distToNode = max(gFract.x, gFract.y);
    float onCrossArm = majorGrid * (1.0 - smoothstep(0.06, 0.11, distToNode));
    vec3 surveyCol = mix(col, vec3(0.15, 0.39, 0.92), 0.18 + majorGrid * 0.32 + onCrossArm * 0.55);
    col = mix(col, surveyCol, planW);
  }

  // the measurement front: one hairline contour at the front's height rising through the relief's own heights,
  // drawn the way the scene draws its contours; below it the survey grid and 50 m contours stay lit, settling with
  // depth
  if (uScanA > 0.001) {
    float scD = abs(h - uScanH) / max(fwidth(h), 1e-3);
    float scL = 1.0 - smoothstep(0.0, 1.7, scD);
    float scW = h < uScanH ? exp((h - uScanH) / 260.0) : 0.0;
    float spanKm = max(abs(uHRect.z - uHRect.x), abs(uHRect.w - uHRect.y));
    float G = max(0.8, floor(spanKm / 7.0 * 2.0 + 0.5) / 2.0);
    vec2 gC = xz / G; vec2 gF = abs(fract(gC - 0.5) - 0.5); vec2 gW = max(fwidth(gC), 1e-4);
    vec2 gL = 1.0 - smoothstep(0.0, 1.2, gF / gW); float maj = max(gL.x, gL.y);
    vec2 sC = gC * 4.0; vec2 sF = abs(fract(sC - 0.5) - 0.5); vec2 sW = max(fwidth(sC), 1e-4);
    vec2 sL = 1.0 - smoothstep(0.0, 1.0, sF / sW); float mnr = max(sL.x, sL.y);
    float node = maj * (1.0 - smoothstep(0.06, 0.11, max(gF.x, gF.y)));
    float ink = clamp(maj * 0.6 + mnr * 0.25 + node * 0.7, 0.0, 1.0);
    float cnt = contour(h, 50.0, 0.8);
    col = mix(col, uScanC, clamp((ink * 0.75 + cnt * 0.45) * scW + scL * 0.85, 0.0, 0.9) * uScanA);
  }

  // a cool rim where slopes turn away from the eye, so the silhouette separates from the dark ground
  vec3 vdir = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(dot(n, vdir), 0.0, 1.0), 4.0);
  col += uRimC * fres * uRimA;
  float dist = distance(cameraPosition, vWorld);
  col = mix(col, uFogC, smoothstep(uFog.x, uFog.y, dist) * uFog.z);
  col *= uDim;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const WALL_VERT = /* glsl */ `
attribute float elev;
attribute float fr;
attribute vec3 wallNormal;
uniform float uExag, uBase;
varying vec3 vN;
varying float vFr;
varying float vElev;
void main() {
  vec3 p = vec3(position.x, (elev - uBase) * uExag / 1000.0, position.z);
  vFr = fr;
  vN = wallNormal;
  vElev = elev;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}
`;

export const WALL_FRAG = /* glsl */ `
uniform vec3 uL, uLight, uAmbient, uAlbedo;
uniform float uDim, uFadePow;
varying vec3 vN;
varying float vFr;
varying float vElev;
float wallContour(float h, float interval, float w) {
  float c = (h + 0.37) / interval;
  float fw = max(fwidth(c), 1e-5);
  float l = 1.0 - smoothstep(0.0, w, abs(fract(c - 0.5) - 0.5) / fw);
  return l * (1.0 - smoothstep(0.25, 0.6, fw));
}
void main() {
  vec3 n = normalize(vN);
  float diff = max(dot(n, uL), 0.0);
  vec3 col = uAlbedo * (uLight * diff * 0.42 + uAmbient * 1.12);
  // geological & topographic elevation strata along the carved block wall
  float c250 = wallContour(vElev, 250.0, 0.95);
  float c75 = wallContour(vElev, 75.0, 0.7);
  col = mix(col, col * 1.38, (c250 * 0.55 + c75 * 0.22) * vFr);
  // crisp top-cut bevel right under the relief surface rim
  float lip = smoothstep(0.88, 1.0, vFr);
  col += uLight * lip * (0.08 + 0.12 * diff);
  // the edge of the slab dissolves downward: opaque at the land's rim, gone a little below it
  float a = pow(clamp(vFr, 0.0, 1.0), uFadePow);
  col *= uDim * (0.55 + 0.45 * vFr);
  gl_FragColor = vec4(col * a, a);
}
`;

export const OCCL_FRAG = /* glsl */ `
uniform sampler2D uMask;
uniform vec4 uMaskRect;
varying vec3 vWorld;
void main() {
  vec2 mu = (vWorld.xz - uMaskRect.xy) / (uMaskRect.zw - uMaskRect.xy);
  if (texture(uMask, mu).b < 0.5 || mu.x < 0.0 || mu.y < 0.0 || mu.x > 1.0 || mu.y > 1.0) discard;
  gl_FragColor = vec4(0.0);
}
`;

export const PLAN_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const PLAN_FRAG = /* glsl */ `
${HEIGHT_GLSL}
uniform sampler2D uMask;
uniform vec4 uMaskRect;
uniform vec4 uPlanRect;
uniform float uExag;
uniform vec3 uL, uAlbedo, uLine, uAccent;
uniform float uDim, uCarve, uGridStep;
uniform float uScanA, uScanH; // the measurement front, as on the relief
varying vec3 vWorld;

float regionalElev(vec2 xz) {
  vec2 uv = hUV(xz);
  vec2 cUv = clamp(uv, 0.0, 1.0);
  float baseH = hAt(cUv);
  vec2 over = xz - mix(uHRect.xy, uHRect.zw, cUv);
  float d = length(over);
  if (d < 1e-3) return baseH;
  // Smooth multi-octave regional ridge continuation outside the tight DEM box so contour lines remain continuous
  float wave = sin(xz.x * 0.28 + xz.y * 0.19) * 140.0 + cos(xz.x * 0.61 - xz.y * 0.43) * 65.0;
  return baseH + wave * smoothstep(0.0, 4.0, d);
}

void main() {
  vec2 xz = vWorld.xz;
  vec2 pu = (xz - uPlanRect.xy) / (uPlanRect.zw - uPlanRect.xy);
  if (pu.x < 0.0 || pu.y < 0.0 || pu.x > 1.0 || pu.y > 1.0) discard;

  // Radial + box feathering around the wide regional survey sheet
  vec2 dBox = min(pu, 1.0 - pu);
  float boxFade = smoothstep(0.02, 0.18, min(dBox.x, dBox.y));
  float radDist = length((pu - 0.5) * vec2(1.04, 1.04));
  float radFade = 1.0 - smoothstep(0.30, 0.49, radDist);
  float edgeFade = boxFade * radFade;
  if (edgeFade < 0.005) discard;

  // Sample regional elevation & 2D hillshade across the entire surrounding survey sheet
  float h = regionalElev(xz);
  float stepX = 0.08;
  float hl = regionalElev(xz - vec2(stepX, 0.0)), hr = regionalElev(xz + vec2(stepX, 0.0));
  float hn = regionalElev(xz - vec2(0.0, stepX)), hs = regionalElev(xz + vec2(0.0, stepX));
  vec3 n = normalize(vec3(-(hr - hl) / 160.0 * uExag, 1.0, -(hs - hn) / 160.0 * uExag));
  float diff = clamp(dot(n, uL), 0.0, 1.0);

  // Sample catchment mask & detect extraction perimeter on the 2D plan
  vec2 mu = (xz - uMaskRect.xy) / (uMaskRect.zw - uMaskRect.xy);
  float inMask = (mu.x >= 0.0 && mu.y >= 0.0 && mu.x <= 1.0 && mu.y <= 1.0) ? texture(uMask, mu).b : 0.0;
  vec2 me = 2.4 / uTex;
  float mL = (mu.x >= 0.0 && mu.y >= 0.0 && mu.x <= 1.0 && mu.y <= 1.0) ? texture(uMask, clamp(mu - vec2(me.x, 0.0), 0.0, 1.0)).b : 0.0;
  float mR = (mu.x >= 0.0 && mu.y >= 0.0 && mu.x <= 1.0 && mu.y <= 1.0) ? texture(uMask, clamp(mu + vec2(me.x, 0.0), 0.0, 1.0)).b : 0.0;
  float mN = (mu.x >= 0.0 && mu.y >= 0.0 && mu.x <= 1.0 && mu.y <= 1.0) ? texture(uMask, clamp(mu - vec2(0.0, me.y), 0.0, 1.0)).b : 0.0;
  float mS = (mu.x >= 0.0 && mu.y >= 0.0 && mu.x <= 1.0 && mu.y <= 1.0) ? texture(uMask, clamp(mu + vec2(0.0, me.y), 0.0, 1.0)).b : 0.0;
  float borderGrad = clamp((abs(mR - mL) + abs(mS - mN)) * 1.5, 0.0, 1.0);

  // Topographic contour lines across the surrounding 2D survey region
  float c250 = contour(h, 250.0, 1.15);
  float c50 = contour(h, 50.0, 0.85);

  // Cartographic coordinate grid + '+' intersection crosshairs
  vec2 gCoord = xz / max(0.25, uGridStep);
  vec2 gFract = abs(fract(gCoord - 0.5) - 0.5);
  vec2 gFw = max(fwidth(gCoord), 1e-4);
  vec2 gLine2 = 1.0 - smoothstep(0.0, 1.25, gFract / gFw);
  float majorGrid = max(gLine2.x, gLine2.y);

  // Sub-grid (4 subdivisions per major cell)
  vec2 subCoord = gCoord * 4.0;
  vec2 subFract = abs(fract(subCoord - 0.5) - 0.5);
  vec2 subFw = max(fwidth(subCoord), 1e-4);
  vec2 subLine2 = 1.0 - smoothstep(0.0, 1.05, subFract / subFw);
  float minorGrid = max(subLine2.x, subLine2.y);

  // '+' crosshair reticle ticks at major grid intersections
  float distToNode = max(gFract.x, gFract.y);
  float onCrossArm = majorGrid * (1.0 - smoothstep(0.06, 0.13, distToNode));

  // Fade out the flat 2D interior & perimeter outline as the 3D carve-out extrudes upward (uCarve: 0 -> 1)
  float carveProgress = clamp(uCarve, 0.0, 1.0);
  float flatStage = 1.0 - smoothstep(0.12, 0.58, carveProgress);
  float maskCutout = mix(1.0, 1.0 - inMask * 0.92, smoothstep(0.15, 0.65, carveProgress));
  float flatBorder = borderGrad * flatStage;
  float flatCatchmentFill = inMask * flatStage * 0.16;

  // Cartographic feature weights: contours, survey grid, '+' crosshairs, subtle hillshade, and Stage 1 extraction perimeter
  float contourInk = clamp(c250 * 0.62 + c50 * 0.26, 0.0, 1.0);
  float gridInk = clamp(majorGrid * 0.48 + minorGrid * 0.15 + onCrossArm * 0.78, 0.0, 1.0);
  float hillInk = (1.0 - diff) * mix(0.22, 0.09, carveProgress);
  if (uScanA > 0.001) {
    float scD = abs(h - uScanH) / max(fwidth(h), 1e-3);
    float scL = 1.0 - smoothstep(0.0, 1.7, scD);
    float scW = h < uScanH ? exp((h - uScanH) / 260.0) : 0.0;
    gridInk = clamp(gridInk * (1.0 + scW * 1.6 * uScanA) + scL * 0.8 * uScanA, 0.0, 1.0);
    contourInk = clamp(contourInk * (1.0 + scW * 1.2 * uScanA), 0.0, 1.0);
  }

  vec3 topoCol = mix(uLine * 0.75, uAlbedo, 0.35);
  vec3 col = topoCol;
  col = mix(col, uAccent, clamp(gridInk * 0.85 + flatCatchmentFill * 2.2, 0.0, 1.0));
  col = mix(col, uAccent, flatBorder * 0.96);

  float featureAlpha = clamp(
    hillInk + contourInk * 0.58 + gridInk * 0.68 + flatCatchmentFill + flatBorder * 0.92,
    0.0,
    0.92
  );
  float planStrength = mix(0.98, 0.72, carveProgress);
  float a = edgeFade * maskCutout * planStrength * featureAlpha;
  col *= uDim;
  gl_FragColor = vec4(col * a, a);
}
`;

const DEG = Math.PI / 180;
const rad = (d: number) => d * DEG;

/**
 * Secondary WebGL renderer for the arc dial overlay. Renders on a dedicated canvas with a depth-only
 * terrain occluder so the arc passes behind the terrain silhouette while staying exempt from the
 * terrain canvas's depth-of-field blur.
 */
export function createArcOverlay(canvas: HTMLCanvasElement, occluder: Mesh) {
  const r2 = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
  });
  r2.outputColorSpace = LinearSRGBColorSpace;
  r2.toneMapping = NoToneMapping;
  r2.setPixelRatio(window.devicePixelRatio);
  r2.setClearColor(0x000000, 0);
  const scene2 = new Scene();
  scene2.add(occluder);

  // Vertex colour channels carry (opacity along the arc, tint, 0); the tint mixes the arc's two colours,
  // brighter toward the upper left where the key light originates.
  const dialMat = new LineMaterial({
    color: 0xffffff,
    linewidth: 1.1,
    vertexColors: true,
    worldUnits: false,
    depthTest: true,
    depthWrite: false,
    transparent: true,
    opacity: 1,
  });
  const FRAG_OUT = "gl_FragColor = vec4( diffuseColor.rgb, alpha );";
  dialMat.onBeforeCompile = (sh) => {
    if (!sh.fragmentShader.includes(FRAG_OUT))
      console.error("Overview arc: the line shader's output is not where the fade expects it");
    sh.uniforms.uArcDim = { value: channelVec(C.arcDim) };
    sh.uniforms.uArcLit = { value: channelVec(C.arcLit) };
    sh.fragmentShader = `uniform vec3 uArcDim;\nuniform vec3 uArcLit;\n${sh.fragmentShader.replace(
      FRAG_OUT,
      "gl_FragColor = vec4( mix( uArcDim, uArcLit, vColor.g ), alpha * vColor.r );",
    )}`;
  };

  let dialLine: LineSegments2 | null = null;
  let arcPts: Vec3[] = [];
  let arcA: number[] = [];

  const buildDial = (span: ArcSpan, dialAt: (clock: number) => Vec3, roll: number) => {
    const n = Math.max(2, Math.ceil(span.end / STEP));
    arcPts = [];
    arcA = [];
    for (let i = 0; i <= n; i++) {
      const u = (span.end * i) / n;
      arcPts.push(dialAt(ARC.a0 + u));
      arcA.push(arcAlpha(u, span));
    }
    const pos: number[] = [];
    const col: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = arcPts[i] ?? [0, 0, 0];
      const q = arcPts[i + 1] ?? [0, 0, 0];
      pos.push(...p, ...q);
      for (const k of [i, i + 1])
        col.push(
          arcA[k] ?? 0,
          0.5 + 0.5 * Math.cos(rad(ARC.a0 + (span.end * k) / n + roll - 330)),
          0,
        );
    }
    if (dialLine) {
      scene2.remove(dialLine);
      dialLine.geometry.dispose();
    }
    const geo = new LineSegmentsGeometry();
    geo.setPositions(pos);
    geo.setColors(col);
    dialLine = new LineSegments2(geo, dialMat);
    dialLine.frustumCulled = false;
    dialLine.renderOrder = 3;
    scene2.add(dialLine);
  };

  return {
    dialMat,
    buildDial,
    getArcPoints: () => ({ arcPts, arcA }),
    setSize(width: number, height: number) {
      r2.setSize(width, height, false);
      dialMat.resolution.set(width, height);
    },
    render(camera: Parameters<WebGLRenderer["render"]>[1]) {
      r2.render(scene2, camera);
    },
    dispose() {
      if (dialLine) dialLine.geometry.dispose();
      dialMat.dispose();
      for (const o of scene2.children)
        if (o instanceof Mesh && o.material instanceof ShaderMaterial) o.material.dispose();
      r2.dispose();
    },
  };
}
