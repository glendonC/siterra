import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CaseSnapshot } from "@siterra/contracts";
import { describe, expect, it } from "vitest";
import { splitFigure } from "./caption";

const seed = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "..",
      "packages",
      "contracts",
      "fixtures",
      "case-snapshot-aitbouguemez-seed.json",
    ),
    "utf8",
  ),
) as CaseSnapshot;
const ink = (id: string) =>
  seed.records.instrumentSpecRecords?.find((s) => s.id === id)?.caption.ink ?? "";

describe("splitFigure", () => {
  it("sets the composed trend captions' figures apart from their words", () => {
    expect(splitFigure(ink("inst_layer_stack_valley"))).toEqual({
      figure: "+0.0091",
      rest: "NDVI per decade, March to June, 2000 to 2025",
    });
    expect(splitFigure(ink("inst_cross_section_valley"))).toEqual({
      figure: "+0.0134",
      rest: "NDVI per decade below 2,317 m, March to June, 2000 to 2025",
    });
  });

  it("keeps a caption that opens with words whole", () => {
    const pixel = ink("inst_pixel_anatomy_valley");
    expect(splitFigure(pixel)).toEqual({ figure: null, rest: pixel });
  });
});
