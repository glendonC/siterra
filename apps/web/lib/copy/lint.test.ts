import { describe, expect, it } from "vitest";
import { DESIGN_RULES, RULES, lint, type Scope } from "./lint";

// One string each rule must catch and one it must leave alone, in the scope where the rule runs.
const CASES: Record<string, { scope: Scope; hit: string; clean: string }> = {
  "VT-01": {
    scope: "ui",
    hit: "Rainfall fell \u2014 then rose.",
    clean: "Rainfall fell, then rose.",
  },
  "VT-02": { scope: "ui", hit: "2019–2025", clean: "2019 to 2025" },
  "VT-03": { scope: "ui", hit: "Data for 2019-2025", clean: "Data for 2019 to 2025" },
  "VT-04": { scope: "ui", hit: "CHIRPS · 33 cells", clean: "CHIRPS, 33 cells" },
  "VT-05": { scope: "ui", hit: "Loading...", clean: "Loading" },
  "VT-06": { scope: "ui", hit: "Done!", clean: "Done." },
  "VT-07": { scope: "ui", hit: "Ready \u{1F680}", clean: "© OpenStreetMap contributors" },
  "VT-08": { scope: "ui", hit: "LIVE", clean: "Live NDVI from CHIRPS" },
  "VT-09": { scope: "heading", hit: "Run assessment", clean: "Scope & Baseline" },
  "VT-10": { scope: "ui", hit: "Key insights", clean: "Key findings" },
  "VT-11": { scope: "ui", hit: "Leverage the data", clean: "Use the data" },
  "VT-12": { scope: "ui", hit: "It is worth noting the gap.", clean: "The gap is 3 months." },
  "VT-13": { scope: "ui", hit: "Not only rain but also snow.", clean: "Rain and snow." },
  "VT-14": { scope: "ui", hit: "We checked 6 sources.", clean: "Siterra checked 6 sources." },
  "VT-15": { scope: "ui", hit: "Siterra thinks rain fell.", clean: "Siterra compared rainfall." },
  "VT-16": { scope: "ui", hit: "Simply press Enter.", clean: "Press Enter." },
  "VT-17": {
    scope: "ui",
    hit: "Oops, something went wrong.",
    clean: "Rainfall not loaded. Question text kept.",
  },
  "VT-18": { scope: "ui", hit: "Loaded via Earth Search.", clean: "Loaded through Earth Search." },
  "VT-19": { scope: "ui", hit: "Shown in real time.", clean: "Precomputed monthly." },
  "VT-20": { scope: "ui", hit: "Pasture degradation", clean: "Pasture cover" },
  "VT-21": { scope: "model", hit: "Likely caused by rain.", clean: "Supported by 2 records." },
  "VT-22": { scope: "ui", hit: "Vegetation health", clean: "Vegetation index (NDVI)" },
  "VT-23": { scope: "model", hit: "Siterra recommends option A.", clean: "Candidate response A." },
  "VT-24": { scope: "model", hit: "A significant trend.", clean: "A lower value in April." },
  "VT-25": { scope: "model", hit: "**Result**", clean: "Result" },
  "VT-30": { scope: "ui", hit: "5km", clean: "5 km" },
  "VT-31": { scope: "ui", hit: "82 %", clean: "82%" },
  "VT-32": { scope: "ui", hit: "10/26/2026", clean: "26 Oct 2026" },
  "VT-33": { scope: "ui", hit: "2nd June", clean: "2 June" },
  "VT-34": { scope: "ui", hit: "three villages", clean: "3 villages" },
  "VT-35": { scope: "ui", hit: "NDVI fell by 5%", clean: "NDVI 0.03 below the same-month median" },
  "VT-36": { scope: "ui", hit: "Departure -38 mm", clean: "Departure −38 mm" },
  "VT-37": { scope: "ui", hit: "349 millimetres", clean: "349 millimeters" },
  "VT-38": {
    scope: "model",
    hit: "Rain fell. 23 months were dry.",
    clean: "Rain fell. In 23 months it was dry.",
  },
  "VT-40": { scope: "button", hit: "Submit", clean: "Run Assessment" },
  "VT-41": {
    scope: "button",
    hit: "Record Scientific Review",
    clean: "Record Scientific Review (demo)",
  },
  "VT-42": { scope: "link", hit: "Learn more", clean: "Sources & Notices" },
  "VT-43": { scope: "ui", hit: "Siterra can't assess this.", clean: "Siterra cannot assess this." },
  "VT-44": { scope: "button", hit: "Open the case.", clean: "Open Region Pack" },
  "VT-45": { scope: "ui", hit: "Your question is kept.", clean: "Question kept." },
  "VT-46": {
    scope: "ui",
    hit: "Validated interventions and live telemetry.",
    clean: "Real Data, Field Unverified. Kind: Verified outcome.",
  },
  "VT-47": {
    scope: "ui",
    hit: "Each model call appears here as it happens.",
    clean: "No events for this request.",
  },
  "VT-49": { scope: "ui", hit: "Rain & snow", clean: "Rain and snow" },
  "DL-09": { scope: "ui", hit: "A drought year", clean: "A dry year" },
};

const ids = (text: string, scope: Scope) => lint(text, scope).map((f) => f.id);

describe("copy lint", () => {
  it("has a must-match and a must-not-match case for every rule", () => {
    const ruleIds = [...RULES, ...DESIGN_RULES].map((r) => r.id).sort();
    expect(Object.keys(CASES).sort()).toEqual(ruleIds);
  });

  it.each(Object.entries(CASES))("%s catches its pattern and leaves the fix alone", (id, c) => {
    expect(ids(c.hit, c.scope)).toContain(id);
    expect(ids(c.clean, c.scope)).not.toContain(id);
  });

  it("flags sentences over 25 words as VT-50", () => {
    const long = Array.from({ length: 26 }, () => "word").join(" ") + ".";
    expect(ids(long, "ui")).toContain("VT-50");
    expect(ids("A short sentence.", "ui")).not.toContain("VT-50");
  });

  it("flags a control segment over 3 words as VT-48", () => {
    expect(ids("Skip to the Map", "link")).toContain("VT-48");
    expect(ids("Synthetic Replay · No Live Model", "heading")).not.toContain("VT-48");
    expect(ids("Interventions & Precedents", "heading")).not.toContain("VT-48");
  });

  it("lets headings use the middle dot and '&' that detail lines may not", () => {
    expect(ids("Real Data · Field Unverified", "heading")).toEqual([]);
    expect(ids("Scope & Baseline", "heading")).toEqual([]);
    expect(ids("Real data · field unverified", "ui")).toContain("VT-04");
  });

  it("leaves placeholders, numbers and minor words alone in Title Case", () => {
    expect(ids("NDVI Departure · {period}", "heading")).toEqual([]);
    expect(ids("Vertical Exaggeration ×{factor}", "heading")).toEqual([]);
    expect(ids("Skip to Map", "link")).toEqual([]);
  });

  it("does not run docs-only scope on interface rules", () => {
    expect(ids("Key insights", "docs")).toEqual([]);
  });
});
