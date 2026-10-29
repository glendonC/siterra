// Plane geometry for the valley instruments, in any x, y (or x, z) coordinates.

export type Point = [number, number];

/** Signed area, positive when the ring runs counter-clockwise with y up. */
export function signedArea(ring: readonly (readonly number[])[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += (p?.[0] ?? 0) * (q?.[1] ?? 0) - (q?.[0] ?? 0) * (p?.[1] ?? 0);
  }
  return a / 2;
}

/** The ring without a closing vertex that repeats the first. */
export function openRing<P extends readonly number[]>(ring: readonly P[]): P[] {
  const first = ring[0];
  const last = ring.at(-1);
  const closed = ring.length > 1 && first?.[0] === last?.[0] && first?.[1] === last?.[1];
  return closed ? ring.slice(0, -1) : ring.slice();
}

/** The part of a polygon inside a convex polygon (Sutherland-Hodgman), whichever way the clip winds. */
export function clipConvex(poly: readonly Point[], clip: readonly Point[]): Point[] {
  const s = Math.sign(signedArea(clip));
  let out: Point[] = poly.slice();
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    if (!a || !b) break;
    const side = (p: Point) => s * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const input = out;
    out = [];
    for (let k = 0; k < input.length; k++) {
      const p = input[k];
      const q = input[(k + 1) % input.length];
      if (!p || !q) continue;
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) out.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
  }
  return out;
}
