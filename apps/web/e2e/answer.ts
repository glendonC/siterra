import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { CaseSnapshot, InstrumentListing } from "@siterra/contracts";
import { en, type MessageId } from "../lib/copy/en";
import { bandLimitsOf } from "../lib/land/record";
import {
  VIEW_HREF,
  VIEW_INSTRUMENT,
  VIEW_LABEL,
  actionsFor,
  type ViewKind,
} from "../lib/overview/actions";
import { findingsFrom } from "../lib/overview/findings";
import { readoutOf, type Readout } from "../lib/readout/readout";
import { timeSourcesOf } from "../lib/time/load";

// The overview's home is the answer (components/overview/Readout.tsx): once the land has arrived at /valley, with
// nothing open and no steps showing, it opens by itself; /valley?run=<command id> is the answer of that run instead.
// These helpers open it and derive what it should say, and which views it offers, from the record the page loaded,
// the way the overview derives them, so no expected text is typed by hand.

/** The recorded run the first place's steps replay (lib/run/fixtures/recorded-run.json): its own question and record. */
export const recorded = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "lib", "run", "fixtures", "recorded-run.json"),
    "utf8",
  ),
) as { commandId: string; question: string; snapshot: CaseSnapshot };

/** The answer as the overview reads one case record: the record's own findings and its band limits. */
export function answerOf(
  snapshot: CaseSnapshot,
  listing: InstrumentListing,
  commandId: string | null = null,
): Readout {
  const { findings, bandLimit } = findingsFrom(snapshot, listing);
  return readoutOf(snapshot, findings, bandLimit?.display ?? "", {
    commandId,
    limits: bandLimitsOf(snapshot),
  });
}

/**
 * The views the answer offers, in the order its number keys open them: each finding's own view first, then Year by
 * Year and the field plan, as the place's listing holds them ready (ValleyOverview's offered views).
 */
export function viewsOf(
  snapshot: CaseSnapshot,
  listing: InstrumentListing,
): { kind: ViewKind; key: string; label: string; href: string }[] {
  const { findings: all, bandLimit } = findingsFrom(snapshot, listing);
  const findings = all.filter((f) => f.id !== "band" || bandLimit !== null);
  const offered = new Set(
    (Object.keys(VIEW_INSTRUMENT) as ViewKind[]).filter((v) =>
      listing.instruments.some(
        (x) =>
          x.spec.parameters.kind === VIEW_INSTRUMENT[v] &&
          x.spec.status === "ready" &&
          (v === "rainfall" || x.assets.every((a) => a.status === "available")),
      ),
    ),
  );
  if (timeSourcesOf(snapshot)) offered.add("time");
  const kinds: ViewKind[] = [];
  for (const f of findings) {
    const v = actionsFor(f.id, offered, false)[0]?.view;
    if (v && !kinds.includes(v)) kinds.push(v);
  }
  for (const v of ["time", "field"] as const)
    if (offered.has(v) && !kinds.includes(v)) kinds.push(v);
  return kinds.map((kind, i) => ({
    kind,
    key: String(i + 1),
    label: en[VIEW_LABEL[kind]].text,
    href: VIEW_HREF[kind],
  }));
}

/**
 * The case record and instrument listing the overview loads, from its own responses and parsed as it parses them
 * (lib/case/load.ts, lib/instruments/listing.ts). Call it before the page opens, so it sees the page's first loads.
 * Only a request that finished counts: one the page let go of before its body arrived has no body to read.
 */
export function loadedRecord(page: Page): Promise<{
  snapshot: CaseSnapshot;
  listing: InstrumentListing;
}> {
  const loaded = async (path: RegExp): Promise<unknown> => {
    // a body the browser no longer holds (a page left as it loaded) is skipped for the next load of the same path
    for (let tries = 0; tries < 4; tries++) {
      const request = await page.waitForEvent("requestfinished", {
        predicate: (r) => r.method() === "GET" && path.test(new URL(r.url()).pathname),
        timeout: 90_000,
      });
      const response = await request.response();
      if (!response?.ok()) throw new Error(`${request.url()}: ${String(response?.status())}`);
      try {
        return (await response.json()) as unknown;
      } catch {
        continue;
      }
    }
    throw new Error(`no readable ${path.source}`);
  };
  return Promise.all([
    loaded(/^\/api\/cases\/[^/]+$/),
    loaded(/^\/api\/cases\/[^/]+\/instruments$/),
  ]).then(([c, l]) => ({
    snapshot: CaseSnapshot.parse(c),
    listing: InstrumentListing.parse(l),
  }));
}

/** The answer on screen. */
export const readoutOn = (page: Page): Locator =>
  page.locator("[data-overview-root][data-readout] [data-readout]");

/**
 * Opens a place and waits for its answer: the land drawn, the answer opened by itself, and its opening (DUR.s, 1 s)
 * run, so its keys are bound before a test presses one.
 */
export async function atTheAnswer(page: Page, path = "/valley"): Promise<Locator> {
  await page.goto(path);
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 90_000,
  });
  const readout = readoutOn(page);
  await expect(readout).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1_000);
  return readout;
}

/** Opens one of the answer's views in place by a click on it, found by the view's catalog name. */
export async function openView(page: Page, kind: ViewKind): Promise<void> {
  await readoutOn(page).getByRole("button", { name: en[VIEW_LABEL[kind]].text }).click();
}

/** The box the answer column draws on screen: every box inside it with an area (its own root spans the viewport). */
export const columnBox = (
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> =>
  readoutOn(page).evaluate((root) => {
    const rs = Array.from(root.querySelectorAll("*"))
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 1 && r.height > 1 && r.width < innerWidth);
    const x0 = Math.min(...rs.map((r) => r.left));
    const y0 = Math.min(...rs.map((r) => r.top));
    return {
      x: x0,
      y: y0,
      width: Math.max(...rs.map((r) => r.right)) - x0,
      height: Math.max(...rs.map((r) => r.bottom)) - y0,
    };
  });

/**
 * How many of the overview's finding labels round the arc are drawn: not hidden by style, and neither they nor any
 * element round them faded out to nothing. The resting screen that showed them is gone, so none should be.
 */
export const shownLabels = (page: Page): Promise<number> =>
  page.locator("[data-overview] [data-finding]").evaluateAll(
    (els) =>
      els.filter((el) => {
        if (getComputedStyle(el).visibility === "hidden") return false;
        for (let e: Element | null = el; e; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.opacity === "0" || cs.display === "none") return false;
        }
        return true;
      }).length,
  );

/** The layer labels drawn beside the land, by the sheet each one names: placed on screen and not faded out. */
export const shownSheets = (page: Page): Promise<(string | null)[]> =>
  page
    .locator("[data-layer-stack] [data-sheet]")
    .evaluateAll((els) =>
      els
        .filter(
          (e) =>
            (e as HTMLElement).style.visibility === "visible" &&
            Number((e as HTMLElement).style.opacity || "1") > 0.5,
        )
        .map((e) => e.getAttribute("data-sheet")),
    );

/** A catalog sentence as a pattern: its words as written, each {placeholder} any text. */
export const shaped = (...texts: string[]): RegExp =>
  new RegExp(
    `^(?:${texts
      .map((t) =>
        t
          .split(/\{\w+\}/)
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join(".+"),
      )
      .join("|")})$`,
  );

/** The same pattern found anywhere in a longer text. */
export const shapedInside = (...texts: string[]): RegExp =>
  new RegExp(shaped(...texts).source.slice(1, -1));

/** Inside One Pixel's six steps in order, each named by what it shows (lib/instruments/pixel/scene-picking.ts). */
export const PIXEL_STEPS: readonly (readonly [string, MessageId])[] = [
  ["01", "instrument.pixel.locate"],
  ["02", "instrument.pixel.cells"],
  ["03", "instrument.pixel.spectra"],
  ["04", "instrument.pixel.series"],
  ["05", "instrument.pixel.model"],
  ["06", "instrument.pixel.field"],
];

/** The breadcrumb's words, one per crumb. */
export const crumbsOf = (page: Page): Promise<string[]> =>
  page
    .locator("[data-crumbs] li")
    .evaluateAll((els) => els.map((e) => e.textContent.replace("/", "").trim()));

/** The key bar's entry for one key, by the chip it draws. */
export const keyOf = (page: Page, chip: string): Locator =>
  page.locator(`[data-key-legend] [data-key='${chip}']`);

/** The key bar's entries in order, each its chip and its label. */
export const keysOf = (page: Page): Locator => page.locator("[data-key-legend] [data-key]");

/** The answer column's text in a visitor's words: none of the record's own vocabulary (BRIEF.md, R1). */
export const RECORD_WORDS =
  /\b(?:merge|status|branch|stale|revision|proposed|recorded|replay|composite|model estimate|false discovery)\b|\b[a-z]+_[a-z_]+\b/i;
