import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lint } from "../copy/lint";
import { percent } from "../instruments/format";
import { changeTimingFrom, rainFrom, sharesFrom, strataFrom } from "./data";
import {
  bandWords,
  dryWords,
  greenWords,
  sharesWords,
  standingsOf,
  stepsWords,
  trendWord,
} from "./words";

// Both places' own bundles and case rows, as data/ holds them (the read API serves the same bytes).
const DATA = join(import.meta.dirname, "..", "..", "..", "..", "data");
const json = (p: string) => JSON.parse(readFileSync(join(DATA, p), "utf8")) as unknown;

const PLACES = [
  { place: "ait_bouguemez", rows: "case/measurement-rows.json" },
  { place: "calaveras_creek", rows: "case/calaveras-creek/measurement-rows.json" },
] as const;

interface BaselineSeason {
  year: number;
  rank_highest_to_lowest: number;
  rank_lowest_to_highest: number;
  tied_seasons: number;
}
interface SeasonTrendJson {
  primary: { growing_window: string };
  stratum_baseline_summary: {
    stratum: string;
    growing_window: string;
    seasons: BaselineSeason[];
  }[];
}

const seasonTrend = (place: string) =>
  json(`bundles/bundle_season_trend_long_record_${place}/season-trend-long-record.json`);
const trendSummary = (place: string) =>
  json(`bundles/bundle_pixel_trend_long_record_${place}/pixel-trend-long-record.json`);

for (const { place, rows } of PLACES) {
  describe(`Year by Year's words from ${place}'s own records`, () => {
    const st = seasonTrend(place) as SeasonTrendJson;
    const strata = strataFrom(st);

    it("places every year of the catchment and of each band as the record ranks it, ties included", () => {
      for (const s of strata) {
        const base = st.stratum_baseline_summary.find(
          (b) => b.stratum === s.id && b.growing_window === st.primary.growing_window,
        );
        expect(base, s.id).toBeDefined();
        const standing = standingsOf(s.ndvi);
        for (const season of base?.seasons ?? []) {
          const at = standing.get(season.year);
          expect(at?.fromTop, `${s.id} ${String(season.year)}`).toBe(season.rank_highest_to_lowest);
          expect(at?.fromBottom, `${s.id} ${String(season.year)}`).toBe(
            season.rank_lowest_to_highest,
          );
          expect((at?.tiedWith.length ?? 0) + 1).toBe(season.tied_seasons);
          expect(at?.of).toBe(base?.seasons.length);
        }
      }
    });

    it("says every year's place and every marked year's rain in words that pass the copy lint", () => {
      const catchment = strata.find((s) => s.id === "catchment");
      for (const [, s] of standingsOf(catchment?.ndvi ?? new Map())) {
        expect(lint(greenWords(s), "label")).toEqual([]);
      }
      const rain = rainFrom(
        json(`bundles/bundle_restrend_long_record_${place}/restrend-long-record-tables.json`),
      );
      const dry = standingsOf(new Map(rain.map((r) => [r.year, r.mm])));
      for (const r of rain) {
        const s = dry.get(r.year);
        if (s) expect(lint(dryWords(s, r), "label")).toEqual([]);
      }
    });

    it("reads the catchment's shares from the record field the answer reads its own from", () => {
      const summary = trendSummary(place);
      const shares = sharesFrom(summary);
      const measured = (
        json(rows) as {
          rows: { metric: string; bundleId: string; pointer: string; stratum: string }[];
        }
      ).rows.filter(
        (r) =>
          r.stratum === "catchment" &&
          r.bundleId === `bundle_pixel_trend_long_record_${place}` &&
          r.metric.startsWith("area_share_"),
      );
      expect(measured).toHaveLength(2);
      const at = (pointer: string) =>
        pointer
          .split("/")
          .slice(1)
          .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], summary);
      for (const r of measured)
        expect(
          r.metric === "area_share_upward_fdr" ? shares.catchment.up : shares.catchment.down,
        ).toBe(at(r.pointer));
      expect(lint(sharesWords(shares.catchment), "ui")).toEqual([]);
    });

    it("gives each band the shares its own record holds, and only the ones above zero", () => {
      const summary = trendSummary(place) as {
        primary: { growing_window: string };
        windows_summary: Record<
          string,
          {
            area_shares: {
              group: string;
              increasing_fdr_share: number;
              decreasing_fdr_share: number;
            }[];
          }
        >;
      };
      const shares = sharesFrom(summary);
      for (const g of summary.windows_summary[summary.primary.growing_window]?.area_shares ?? []) {
        if (!g.group.startsWith("elevation_")) continue;
        const words = bandWords(shares.groups.get(g.group));
        const parts = [
          ...(g.increasing_fdr_share > 0 ? [`${percent(g.increasing_fdr_share, 1)} greened`] : []),
          ...(g.decreasing_fdr_share > 0 ? [`${percent(g.decreasing_fdr_share, 1)} browned`] : []),
        ];
        expect(words).toBe(parts.length ? parts.join(", ") : null);
        if (words) expect(lint(words, "label")).toEqual([]);
      }
    });
  });
}

describe("the first place's words, as the record states them", () => {
  const strata = strataFrom(seasonTrend("ait_bouguemez"));
  const catchment = strata.find((s) => s.id === "catchment");
  const standing = standingsOf(catchment?.ndvi ?? new Map());
  const words = (year: number) => {
    const s = standing.get(year);
    return s ? greenWords(s) : null;
  };

  it("names 2019 the greenest year, 2002 the least green, 2001 the second least green and 2025 the fourth greenest", () => {
    expect(words(2019)).toBe("Greenest of 26 years");
    expect(words(2002)).toBe("Least green of 26 years");
    expect(words(2001)).toBe("Second least green of 26 years");
    expect(words(2025)).toBe("Fourth greenest of 26 years");
  });

  it("says the four driest years with their rain and months", () => {
    const rain = rainFrom(
      json("bundles/bundle_restrend_long_record_ait_bouguemez/restrend-long-record-tables.json"),
    );
    const dry = standingsOf(new Map(rain.map((r) => [r.year, r.mm])));
    const said = (year: number) => {
      const r = rain.find((x) => x.year === year);
      const s = dry.get(year);
      return r && s ? dryWords(s, r) : null;
    };
    expect(said(2001)).toBe("Driest of 26 years: 369 mm of rain, Sep 2000 to May 2001");
    expect(said(2024)).toBe("Second driest of 26 years: 391 mm of rain, Sep 2023 to May 2024");
    expect(said(2016)).toBe("Third driest of 26 years: 419 mm of rain, Sep 2015 to May 2016");
    expect(said(2023)).toBe("Fourth driest of 26 years: 421 mm of rain, Sep 2022 to May 2023");
  });

  it("ends on Greener with the answer's own shares and the year half the step changes had come by", () => {
    expect(catchment && trendWord(catchment)).toBe("Greener");
    expect(sharesWords(sharesFrom(trendSummary("ait_bouguemez")).catchment)).toBe(
      "24.7% of the area greened and 0.1% browned.",
    );
    expect(
      stepsWords(
        changeTimingFrom(json("bundles/bundle_pixel_seasons_ait_bouguemez/pixel-seasons.json")),
      ),
    ).toBe("Of the pixels that stepped up to greener, half did so by 2011.");
  });
});

describe("the second place's words", () => {
  it("ends on No clear change, with no share and no step year", () => {
    const catchment = strataFrom(seasonTrend("calaveras_creek")).find((s) => s.id === "catchment");
    expect(catchment && trendWord(catchment)).toBe("No clear change");
    const shares = sharesFrom(trendSummary("calaveras_creek"));
    expect(sharesWords(shares.catchment)).toBe("No part of the area greened or browned.");
    for (const id of ["elevation_low", "elevation_mid", "elevation_high"])
      expect(bandWords(shares.groups.get(id))).toBeNull();
    expect(
      stepsWords(
        changeTimingFrom(json("bundles/bundle_pixel_seasons_calaveras_creek/pixel-seasons.json")),
      ),
    ).toBeNull();
  });
});

describe("standings and their words", () => {
  it("lets tied years share a place and names the year it is tied with", () => {
    const s = standingsOf(
      new Map([
        [2000, 0.2],
        [2001, 0.3],
        [2002, 0.3],
        [2003, 0.1],
        [2004, null],
      ]),
    );
    expect(s.get(2001)).toEqual({ fromTop: 1, fromBottom: 3, of: 4, tiedWith: [2002] });
    expect(s.has(2004)).toBe(false);
    const at2001 = s.get(2001);
    expect(at2001 && greenWords(at2001)).toBe("Greenest of 4 years, tied with 2002");
  });

  it("counts a place past the catalog's last ordinal word instead of naming it", () => {
    const s = standingsOf(new Map(Array.from({ length: 50 }, (_, i) => [2000 + i, i / 100])));
    // 2028 is the 22nd highest of 50 and the 29th lowest: said from the top, past "twentieth"
    const at = s.get(2028);
    expect(at && greenWords(at)).toBe("Greener than 28 of the other 49 years");
    const low = s.get(2021);
    expect(low && greenWords(low)).toBe("Less green than 28 of the other 49 years");
  });

  it("says no direction where the record states none, and no clear change where it fails the check", () => {
    expect(trendWord({ direction: null, fdrPass: null })).toBeNull();
    expect(trendWord({ direction: "upward", fdrPass: false })).toBe("No clear change");
    expect(trendWord({ direction: "downward", fdrPass: true })).toBe("Browner");
    expect(trendWord({ direction: "includes_zero", fdrPass: true })).toBe("No clear change");
  });
});
