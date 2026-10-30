import { describe, expect, it } from "vitest";
import { CARD_BOUNDS, EDGE_ZONES, boxAt, nearestOnBox, placeCard } from "./card";

// A card stands beside its anchor on the side with room, never over its subject, the edge controls or off screen.

const inside = (b: { x0: number; y0: number; x1: number; y1: number }) =>
  b.x0 >= CARD_BOUNDS.x0 &&
  b.y0 >= CARD_BOUNDS.y0 &&
  b.x1 <= CARD_BOUNDS.x1 &&
  b.y1 <= CARD_BOUNDS.y1;
const over = (a: { x0: number; y0: number; x1: number; y1: number }, b: typeof a) =>
  Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);

describe("placeCard", () => {
  it("puts a card on the open side of a land standing to the right", () => {
    const land = { x0: 760, y0: 180, x1: 1180, y1: 760 };
    const { box, side } = placeCard({ x: 770, y: 420 }, 400, 360, land, null);
    expect(side.toLowerCase()).toContain("left");
    expect(over(box, land)).toBe(false);
    expect(inside(box)).toBe(true);
    for (const z of EDGE_ZONES) expect(over(box, z)).toBe(false);
  });

  it("keeps its side while the anchor moves a little, rather than jumping", () => {
    const land = { x0: 500, y0: 200, x1: 940, y1: 760 };
    const a = placeCard({ x: 720, y: 450 }, 380, 300, land, null);
    const b = placeCard({ x: 726, y: 452 }, 380, 300, land, a.side);
    expect(b.side).toBe(a.side);
  });

  it("stays on screen near the edges", () => {
    const { box } = placeCard({ x: 1380, y: 130 }, 400, 300, { x0: 0, y0: 0, x1: 0, y1: 0 }, null);
    expect(inside(box)).toBe(true);
  });

  it("meets its leader at the card's nearest edge", () => {
    const b = boxAt({ x: 100, y: 400 }, 200, 100, "right");
    expect(nearestOnBox({ x: 100, y: 400 }, b)).toEqual({ x: b.x0, y: 400 });
  });
});
