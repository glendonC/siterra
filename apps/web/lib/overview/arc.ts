// The overview's arc (approved specimen D4, js/d4.js): part of an upright circle in the picture plane behind the land,
// open at the bottom. Clock degrees: 0 at the top, clockwise. It runs clockwise from A0 (lower left, where the ask
// circle sits) over the top to A1 (lower right); its opacity rises from nothing over the first FA degrees and falls to
// nothing over the last FB degrees. Every length is CSS px at the 1440 x 900 design.

/** The arc at rest: its start and end on the clock, its fades (degrees) and its peak opacity. */
export const ARC = { a0: 236, a1: 128, fa: 50, fb: 46, peak: 0.8 } as const;
/** The dial at rest: radius and centre on screen, and how far behind the land's target it stands (km). */
export const DIAL = { r: 372, cx: 720, cy: 452, back: 34 } as const;
/** The dial with a finding opened: moved up and left, larger, turned away (yaw, degrees). */
export const DIAL1 = { cx: 210, cy: 170, r: 470, yaw: 24 } as const;
/** Where the ask disc rests on the arc (design px): the dial's start, the same in every view (decision 13d). */
export const ASK_AT = {
  x: DIAL.cx + DIAL.r * Math.sin(((236 as number) * Math.PI) / 180),
  y: DIAL.cy - DIAL.r * Math.cos(((236 as number) * Math.PI) / 180),
} as const;
/** A label's distance from its dot. */
export const GAP = 30;
/** Degrees per drawn segment of the arc. */
export const STEP = 0.5;

export const mod360 = (d: number) => ((d % 360) + 360) % 360;
/** The arc's span in degrees (252 at rest). */
export const SPAN = mod360(ARC.a1 - ARC.a0);
/** Degrees along the arc from its start to a clock angle. */
export const uOf = (clock: number) => mod360(clock - ARC.a0);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Smootherstep, the specimen's easing. */
export const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (6 * x - 15) + 10));
export const sstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** The drawn part of the arc: where it ends (degrees from its start) and over how much it fades in and out. */
export interface ArcSpan {
  end: number;
  fadeIn: number;
  fadeOut: number;
}

export const REST_SPAN: ArcSpan = { end: SPAN, fadeIn: ARC.fa, fadeOut: ARC.fb };

/** Opacity at u degrees along the arc: nothing at its start, full after fadeIn, nothing again at its end. */
export const arcAlpha = (u: number, s: ArcSpan = REST_SPAN) =>
  ARC.peak * sstep(0, s.fadeIn, u) * sstep(0, s.fadeOut, s.end - u);

/**
 * The drawn span for a move: s is the opening of a finding (0 rest, 1 opened) whose clock is `selClock`, k the
 * hover on the ask circle, o the ask open. As a finding opens, the far end draws back to just past it over the first
 * 60% of the move; while the ask circle is hovered or open, the opening fade shortens so the line runs into it.
 */
export function spanAt(s: number, k: number, o: number, selClock: number): ArcSpan {
  const eT = ease(clamp01(s / 0.6));
  return {
    end: lerp(SPAN, uOf(selClock) + 10, eT),
    fadeOut: lerp(ARC.fb, 10, eT),
    fadeIn: lerp(ARC.fa, 16, Math.max(k, ease(o))),
  };
}

/** The outward direction on screen of a clock angle turned by `roll` degrees (y down). */
export function outward(clock: number, roll = 0): { ux: number; uy: number } {
  const r = ((clock + roll) * Math.PI) / 180;
  return { ux: Math.sin(r), uy: -Math.cos(r) };
}

export type Side = "left" | "right" | "centre";
export type Rise = "above" | "below" | "middle";

/** Where a label sits from its dot: beyond the dot along the outward direction (the specimen's thresholds). */
export function labelSide(ux: number, uy: number): { side: Side; rise: Rise } {
  return {
    side: ux < -0.35 ? "left" : ux > 0.35 ? "right" : "centre",
    rise: uy < -0.55 ? "above" : uy > 0.55 ? "below" : "middle",
  };
}

/** A label's top left (design px) from its dot, its size and its numeral's height. */
export function labelAt(
  dot: { x: number; y: number },
  size: { w: number; h: number; nh: number },
  where: { side: Side; rise: Rise },
): { x: number; y: number } {
  const x =
    where.side === "left"
      ? dot.x - GAP - size.w
      : where.side === "right"
        ? dot.x + GAP
        : dot.x - size.w / 2;
  const y =
    where.rise === "above"
      ? dot.y - GAP * 0.6 - size.h
      : where.rise === "below"
        ? dot.y + GAP * 0.6
        : dot.y - size.nh / 2;
  return { x, y };
}

/** The hairline from a dot to the nearest corner of its label's numeral, starting 7 px out from the dot. */
export function wireTo(
  dot: { x: number; y: number },
  numeral: { left: number; top: number; right: number; bottom: number },
  where: { side: Side; rise: Rise },
): { x1: number; y1: number; x2: number; y2: number } {
  const tx =
    where.side === "left"
      ? numeral.right + 4
      : where.side === "right"
        ? numeral.left - 4
        : (numeral.left + numeral.right) / 2;
  const ty =
    where.rise === "above"
      ? numeral.bottom + 2
      : where.rise === "below"
        ? numeral.top - 2
        : (numeral.top + numeral.bottom) / 2;
  const L = Math.hypot(tx - dot.x, ty - dot.y) || 1;
  const k = 7 / L;
  return { x1: dot.x + (tx - dot.x) * k, y1: dot.y + (ty - dot.y) * k, x2: tx, y2: ty };
}
