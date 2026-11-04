import type { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { daylight, ndviDeparture } from "../theme/daylight";
import { liftColours, pixelColours, sheetColours } from "../theme/obsidian";
import {
  answerLayer,
  explanationOf,
  labelOf,
  LAYER_EXPLANATION,
  litOf,
  paletteOf,
  placeLabels,
  runVerdicts,
  sheetProgress,
  stackBox,
  stackGap,
  stackHeights,
  stackOf,
  STACK_ORDER,
  type LabelContext,
  type StackLayer,
} from "./layers";

const rows = [
  { explanationId: "rainfall", label: "Rainfall", status: "consistent" as const },
  { explanationId: "grazing", label: "Grazing", status: "cannot_be_assessed" as const },
  { explanationId: "land_use", label: "Land use", status: "contradicted" as const },
  { explanationId: "snow_terrain", label: "Snow or terrain", status: "contradicted" as const },
  { explanationId: "data_artefact", label: "Data artefact", status: "contradicted" as const },
];

const ctx = (over: Partial<LabelContext> = {}): LabelContext => ({
  theme: "light",
  trendWindow: "March to June",
  rain: { window: "September to May", amounts: true },
  snowMonth: 1,
  explanations: rows,
  ...over,
});

describe("the stack's order", () => {
  it("puts what is being explained on top and the heights at the bottom", () => {
    expect(STACK_ORDER).toEqual(["trend", "rain", "snow", "cover", "bands"]);
  });

  it("keeps only the sheets the place has, in that order", () => {
    const has = new Set<StackLayer>(["bands", "trend", "cover"]);
    expect(stackOf((id) => has.has(id))).toEqual(["trend", "cover", "bands"]);
    expect(stackOf(() => false)).toEqual([]);
  });

  it("ties each sheet to one explanation, and the trend to none (it is what is explained)", () => {
    expect(LAYER_EXPLANATION).toEqual({
      trend: null,
      rain: "rainfall",
      snow: "snow_terrain",
      cover: "land_use",
      bands: "grazing",
    });
  });
});

describe("the stack's heights", () => {
  it("stands the sheets one gap apart from one gap above the land's top, the first sheet highest", () => {
    expect(stackHeights(3, 4, 10)).toEqual([34, 24, 14]);
    expect(stackHeights(0, 4, 10)).toEqual([]);
  });

  it("spaces the sheets so that no sheet's picture reaches the next", () => {
    // a sheet 15 km deep seen from 25 degrees, with 1 km of its own relief: its picture is 15 sin 25 + 1 cos 25
    // high, the gap's picture gap cos 25; a quarter to spare
    const gap = stackGap(15, 25, 1);
    const t = Math.tan((25 * Math.PI) / 180);
    expect(gap).toBeCloseTo(1.25 * (15 * t + 1), 9);
    const picture = 15 * Math.sin((25 * Math.PI) / 180) + Math.cos((25 * Math.PI) / 180);
    expect(gap * Math.cos((25 * Math.PI) / 180)).toBeGreaterThan(picture);
  });
});

describe("where the split stands on screen", () => {
  it("keeps right of the answer's column with room for the labels, at 1440 by 900", () => {
    const b = stackBox({ width: 1440, height: 900 }, { scale: 1, ox: 0, oy: 0 });
    expect(b.x0).toBe(40 + 470 + 56);
    expect(b.x1).toBe(1440 - 36 - 260 - 44);
    expect(b.y0).toBe(112);
    expect(b.y1).toBe(900 - 84);
  });

  it("keeps clear of the column when the stage scales, at 1280 by 720", () => {
    const fit = { scale: 0.8, ox: 64, oy: 0 };
    const b = stackBox({ width: 1280, height: 720 }, fit);
    // back in CSS px: the column's right edge (it keeps its 470 px) plus the gap, and the labels' room on the right
    expect(b.x0 * fit.scale + fit.ox).toBeCloseTo(40 + 470 + 56, 9);
    expect(b.x1 * fit.scale + fit.ox).toBeCloseTo(1280 - 36 - 260 - 44, 9);
    expect(b.y1 * fit.scale + fit.oy).toBeCloseTo(720 - 84, 9);
  });
});

describe("the labels' places", () => {
  const size = { width: 1440, height: 900, row: 15 };

  it("stand in one column right of every sheet, each name level with its sheet's edge", () => {
    const items = [
      { at: { x: 1100, y: 190 }, h: 80 },
      { at: { x: 1090, y: 335 }, h: 80 },
      { at: { x: 1080, y: 470 }, h: 64 },
    ];
    const p = placeLabels(items, { ...size, landRight: 1060 });
    expect(p.x).toBe(1100 + 44);
    expect(p.tops).toEqual([175, 320, 455]);
  });

  it("never touch: a label pressed by the one above moves down, and the last keeps above the key bar", () => {
    const items = [
      { at: { x: 1000, y: 700 }, h: 80 },
      { at: { x: 1000, y: 720 }, h: 80 },
      { at: { x: 1000, y: 880 }, h: 80 },
    ];
    const { tops } = placeLabels(items, { ...size, landRight: 900 });
    for (let n = 1; n < tops.length; n++)
      expect((tops[n] ?? 0) - ((tops[n - 1] ?? 0) + 80)).toBeGreaterThanOrEqual(8);
    expect((tops[2] ?? 0) + 80).toBeLessThanOrEqual(900 - 76);
    expect(tops[0]).toBeGreaterThanOrEqual(64);
  });

  it("keeps below the breadcrumb row", () => {
    const { tops } = placeLabels([{ at: { x: 900, y: 20 }, h: 80 }], { ...size, landRight: 900 });
    expect(tops[0]).toBe(64);
  });

  it("stands the one lifted label right of the land, and inside the canvas", () => {
    expect(placeLabels([{ at: { x: 1000, y: 300 }, h: 80 }], { ...size, landRight: 1080 }).x).toBe(
      1124,
    );
    expect(placeLabels([{ at: { x: 1300, y: 300 }, h: 80 }], { ...size, landRight: 1300 }).x).toBe(
      1440 - 24 - 260,
    );
  });
});

describe("the split, one sheet after another", () => {
  it("lifts the top sheet first and the last sheet last, all in place at the end", () => {
    expect(sheetProgress(0, 0, 5)).toBe(0);
    expect(sheetProgress(1, 4, 5)).toBe(1);
    expect(sheetProgress(0.3, 0, 5)).toBeGreaterThan(sheetProgress(0.3, 1, 5));
    expect(sheetProgress(0.3, 4, 5)).toBe(0);
    expect(sheetProgress(0.5, 0, 5)).toBe(1);
  });

  it("moves a single sheet over the whole span", () => {
    expect(sheetProgress(0.5, 0, 1)).toBeCloseTo(0.5, 9);
  });

  it("never leaves 0 to 1", () => {
    for (const k of [-1, 0, 0.2, 0.7, 1, 2])
      for (let i = 0; i < 5; i++) {
        const p = sheetProgress(k, i, 5);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
  });
});

describe("the lit sheet", () => {
  it("is the sheet in focus when the stack holds it", () => {
    expect(litOf(["trend", "rain", "bands"], "rain")).toBe("rain");
  });

  it("is none when nothing is in focus or the focus has no sheet", () => {
    expect(litOf(["trend", "rain"], null)).toBeNull();
    expect(litOf(["trend", "rain"], "cover")).toBeNull();
  });
});

describe("the verdicts a run has reached", () => {
  const snapshot = {
    records: {
      explanationBranchRecords: [
        { id: "branch_rain", explanationId: "rainfall" },
        { id: "branch_graze", explanationId: "grazing" },
      ],
    },
  } as unknown as CaseSnapshot;

  it("names each scored branch's explanation, and none before the merge scores it", () => {
    expect(
      runVerdicts(snapshot, [
        { id: "branch_rain", label: "Rainfall", status: "consistent" },
        { id: "branch_graze", label: "Grazing", status: null },
        { id: "branch_unknown", label: "Other", status: "contradicted" },
      ]),
    ).toEqual([{ explanationId: "rainfall", label: "Rainfall", status: "consistent" }]);
  });
});

describe("the layer the answer rests on", () => {
  it("is the sheet the measured claim reads", () => {
    expect(answerLayer("trend", "measurement", rows)).toBe("trend");
  });

  it("is the sheet of the explanation that fits, for an answer from the explanations", () => {
    expect(answerLayer(null, "status", rows)).toBe("rain");
  });

  it("lifts no snow sheet alone: snow cover is drawn in the stack only", () => {
    const snow = [
      { explanationId: "snow_terrain", label: "Snow or terrain", status: "consistent" as const },
    ];
    expect(answerLayer(null, "status", snow)).toBeNull();
    expect(answerLayer(null, "status", [...snow, ...rows])).toBe("rain");
  });

  it("skips a fitting explanation no sheet shows, and is none when nothing fits", () => {
    const artefact = [
      { explanationId: "data_artefact", label: "Data artefact", status: "consistent" as const },
    ];
    expect(answerLayer(null, "status", [...artefact, ...rows.slice(1)])).toBeNull();
    expect(answerLayer(null, "status", [...artefact, ...rows])).toBe("rain");
    expect(
      answerLayer(
        null,
        "status",
        rows.map((r) => ({ ...r, status: "contradicted" as const })),
      ),
    ).toBeNull();
  });

  it("is none for an answer that reads nothing", () => {
    expect(answerLayer(null, null, rows)).toBeNull();
    expect(answerLayer(null, "measurement", rows)).toBeNull();
  });
});

describe("each sheet's label", () => {
  it("names the trend and says it is what is being explained", () => {
    expect(labelOf("trend", ctx())).toMatchObject({
      name: "Vegetation Trend",
      what: "Change in greenness, March to June",
      scale: { low: "browner", high: "greener" },
      classes: null,
      explanation: null,
      role: "What is being explained",
    });
    expect(labelOf("trend", ctx({ trendWindow: null })).what).toBe("Change in greenness");
  });

  it("gives rainfall its scale and the rainfall explanation's verdict", () => {
    expect(labelOf("rain", ctx())).toMatchObject({
      name: "Rainfall",
      what: "Average rain, September to May",
      scale: { low: "drier", high: "wetter" },
      // the explanation is called what the sheet is: its verdict alone says it
      explanation: { label: "Rainfall", status: "consistent", verdict: "Fits", named: false },
      role: null,
    });
  });

  it("gives the rain sheet no scale when its shading is not an amount", () => {
    const l = labelOf("rain", ctx({ rain: { window: "September to May", amounts: false } }));
    expect(l.scale).toBeNull();
    expect(l.what).toBe("Squares the rain data covers");
  });

  it("gives snow its month, its scale and the snow or terrain verdict", () => {
    expect(labelOf("snow", ctx())).toMatchObject({
      name: "Snow Cover",
      what: "Snow in February, by height",
      scale: { low: "no snow", high: "always snow" },
      explanation: {
        label: "Snow or terrain",
        status: "contradicted",
        verdict: "Does not fit",
        named: true,
      },
    });
  });

  it("shows land cover by its two classes, with no scale and no line restating them", () => {
    const l = labelOf("cover", ctx());
    expect(l).toMatchObject({
      name: "Land Cover",
      what: null,
      scale: null,
      explanation: { label: "Land use", verdict: "Does not fit" },
    });
    expect(l.classes?.map((c) => c.word)).toEqual(["trees", "fields or buildings"]);
  });

  it("gives the elevation bands the grazing verdict and says nothing of pastures", () => {
    const l = labelOf("bands", ctx());
    expect(l).toMatchObject({
      name: "Elevation Bands",
      what: "Three heights of equal area",
      scale: { low: "lower", high: "higher" },
      explanation: { label: "Grazing", status: "cannot_be_assessed", verdict: "Not enough data" },
    });
  });

  it("leaves the verdict out while the record holds no explanations", () => {
    expect(labelOf("rain", ctx({ explanations: [] })).explanation).toBeNull();
    expect(explanationOf("rain", [])).toBeNull();
  });

  it("draws each scale in the sheet's own colours, low to high, in the theme", () => {
    expect(labelOf("trend", ctx()).scale?.stops).toEqual([
      ndviDeparture.below3,
      ndviDeparture.below2,
      ndviDeparture.below1,
      ndviDeparture.reference,
      ndviDeparture.above1,
      ndviDeparture.above2,
      ndviDeparture.above3,
    ]);
    expect(labelOf("trend", ctx({ theme: "obsidian" })).scale?.stops).toEqual([
      ...[...pixelColours.slopeBelow].reverse(),
      pixelColours.slopeNeutral,
      ...pixelColours.slopeAbove,
    ]);
    expect(labelOf("rain", ctx({ theme: "obsidian" })).scale?.stops).toEqual(sheetColours.rain);
    expect(labelOf("rain", ctx()).scale?.stops).toEqual([...sheetColours.rain].reverse());
  });
});

describe("the sheets' colours", () => {
  it("are tokens of the theme the page is in", () => {
    const light = paletteOf("light");
    const dark = paletteOf("obsidian");
    expect(light.plate).toBe(daylight.outsideVeil);
    expect(light.rim).toBe(daylight.ink);
    expect(dark.plate).toBe(liftColours.plate);
    expect(dark.rim).toBe(sheetColours.outline);
    expect(dark.bands).toEqual([liftColours.bandLow, liftColours.bandMid, liftColours.bandHigh]);
    expect(light.bands).toEqual([liftColours.bandHigh, liftColours.bandMid, liftColours.bandLow]);
    expect(dark.snow).toEqual(sheetColours.snow);
    expect(light.snow).toEqual([...sheetColours.snow].reverse());
  });
});
