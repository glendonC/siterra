// The cutaway's headline, read from the three elevation bands' own season trends: the band whose greenness rose most
// (or, where none rose, fell most), and whether every band's 95% interval lies on one side of zero. Pure; the words
// are the catalog's (instrument.cutaway.lead.*, instrument.cutaway.where.*, instrument.cutaway.clear.*).

export type BandId = "elevation_high" | "elevation_mid" | "elevation_low";

/** A band's OLS trend per decade with its 95% interval, as the season trend summary states it. */
export interface BandTrend {
  per_decade: number;
  lower: number;
  upper: number;
}

/** Top to bottom, as the bands stand on the section face. */
const ORDER: readonly BandId[] = ["elevation_high", "elevation_mid", "elevation_low"];

export interface BandLead {
  /** The band the headline names. */
  band: BandId;
  /** "rose" when any band's trend is above zero (the largest rise), else "fell" (the largest fall). */
  direction: "rose" | "fell";
  /** "up" or "down" when every band's 95% interval lies above or below zero; otherwise "mixed". */
  clear: "up" | "down" | "mixed";
}

export function bandLead(trends: Readonly<Record<BandId, BandTrend>>): BandLead {
  const rows = ORDER.map((band) => ({ band, t: trends[band] }));
  const rises = rows.some((r) => r.t.per_decade > 0);
  // the first band in the face's order wins a tie
  const pick = rows.reduce((best, r) =>
    rises
      ? r.t.per_decade > best.t.per_decade
        ? r
        : best
      : r.t.per_decade < best.t.per_decade
        ? r
        : best,
  );
  const clear = rows.every((r) => r.t.lower > 0)
    ? "up"
    : rows.every((r) => r.t.upper < 0)
      ? "down"
      : "mixed";
  return { band: pick.band, direction: rises ? "rose" : "fell", clear };
}
