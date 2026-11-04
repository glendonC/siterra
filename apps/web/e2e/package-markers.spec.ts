import { expect, test, type Page } from "@playwright/test";
import { nextWords } from "../lib/readout/readout";
import { answerOf, atTheAnswer, columnBox, loadedRecord, readoutOn } from "./answer";
import { sharedCase } from "./demo-case";
import { textReport } from "./instrument-text";

// Checks that share a place, on the answer (UI-2; the lead, after "Founder instance smoke 4", where six checks on one
// anchor piled their names on one another on the land). The case's synthetic package is crowded here, in the snapshot
// this page reads, with four SYNTHETIC checks on the first check's own place, as smoke 4's were. The answer reads the
// case record at the overview's home: each check keeps its own Next row in the plan's order, its words stay apart
// however many checks the plan holds, and only the pressed check is named on the land, at its place, clear of the
// column and the key bar. What each row says is derived from the crowded record the page read. Without a package the
// tests are skipped.

test.use({ viewport: { width: 1440, height: 900 } });

interface Measurement {
  what: string;
  fieldCheckId?: string | null;
  stratumKeys: string[];
  [key: string]: unknown;
}
interface FieldPlan {
  measurements: Measurement[];
}

const SYNTHETIC = "SYNTHETIC crowded check";

/**
 * Opens the case's answer with its field plan crowded by four SYNTHETIC copies of its first check on that check's own
 * place (fieldCheckId is optional and is left out of the copies), and returns the answer model of the record the page
 * read. Null when the case holds no package.
 */
async function crowdedAnswer(page: Page) {
  const caseId = sharedCase();
  const res = await page.request.get(`/api/cases/${encodeURIComponent(caseId)}`);
  if (!res.ok()) return null;
  const snap = (await res.json()) as {
    records: {
      briefRecords: unknown[];
      operationalActionRecords?: { id: string; createdAt: string; fieldPlan: FieldPlan | null }[];
    };
  };
  // the action the answer reads its field plan from: the latest that carries one
  const action = [...(snap.records.operationalActionRecords ?? [])]
    .filter((a) => a.fieldPlan)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
  const first = action?.fieldPlan?.measurements[0];
  if (!snap.records.briefRecords.length || !action || !first) return null;
  const { fieldCheckId: _link, ...bare } = first;
  const copies: Measurement[] = [1, 2, 3, 4].map((k) => ({
    ...bare,
    what: `${SYNTHETIC} ${String(k)} on the same place`,
  }));
  // the snapshot this page reads, with the copies on the first check's place (smoke 4's shape)
  await page.route(`**/api/cases/${caseId}`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const r = await route.fetch();
    const s = (await r.json()) as {
      records: { operationalActionRecords: { id: string; fieldPlan: FieldPlan | null }[] };
    };
    for (const a of s.records.operationalActionRecords)
      if (a.id === action.id && a.fieldPlan) a.fieldPlan.measurements.push(...copies);
    return route.fulfill({ response: r, json: s });
  });
  const record = loadedRecord(page);
  const readout = await atTheAnswer(page, `/valley?case=${caseId}`);
  const { snapshot, listing } = await record;
  const checks = answerOf(snapshot, listing).ground?.checks ?? [];
  // the page read the crowded plan: the four copies are among the answer's checks
  expect(checks.filter((c) => c.what.startsWith(SYNTHETIC))).toHaveLength(4);
  return { readout, checks };
}

const rowOf = (page: Page, c: { fieldCheckId: string | null; number: string }) =>
  readoutOn(page).locator(`[data-readout-check='${c.fieldCheckId ?? c.number}']`);

test("checks that share a place each keep their own Next row in the plan's order, and never pile their words on one another", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const opened = await crowdedAnswer(page);
  test.skip(!opened, "the case holds no package (synthetic package not loaded)");
  if (!opened) return;
  const { readout, checks } = opened;
  await expect(readout.locator("[data-readout-group='ground'] li")).toHaveText(
    checks.map((c) => nextWords(c)),
  );
  // no line of the answer's text overlaps another, however many checks share the first one's place
  expect((await textReport(page, "[data-overview-root] [data-readout]")).overlaps).toEqual([]);
});

test("on the land only the pressed check is named, at its place; the label meets neither the column nor the key bar", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const opened = await crowdedAnswer(page);
  test.skip(!opened, "the case holds no package (synthetic package not loaded)");
  if (!opened) return;
  const { checks } = opened;
  const place = page.locator("[data-readout-place]");
  // nothing is named on the land until a check is pressed
  await expect(place).toHaveCount(0);
  // a check whose place the land does not draw is no button
  for (const c of checks.filter((x) => !x.drawn))
    await expect(rowOf(page, c).locator("button")).toHaveCount(0);
  const copies = checks.filter((c) => c.drawn && c.what.startsWith(SYNTHETIC));
  test.skip(copies.length < 2, "the first check's place is not drawn on the land");
  const [one, two] = copies;
  if (!one || !two) return;
  // pressing a copy lights its place, named in the plan's words for it (the column names the check)
  await rowOf(page, one).locator("button").click();
  await expect(rowOf(page, one).locator("button")).toHaveAttribute("aria-pressed", "true");
  await expect(place).toHaveCount(1);
  await expect(place).toHaveCSS("visibility", "visible");
  await expect(place.locator("b")).toHaveText(one.place ?? one.what);
  // pressing another names only that one: still one label, one row pressed
  await rowOf(page, two).locator("button").click();
  await expect(rowOf(page, two).locator("button")).toHaveAttribute("aria-pressed", "true");
  await expect(rowOf(page, one).locator("button")).toHaveAttribute("aria-pressed", "false");
  await expect(place).toHaveCount(1);
  await expect(
    readoutOn(page).locator("[data-readout-group='ground'] button[aria-pressed='true']"),
  ).toHaveCount(1);
  // the label stands clear of the answer's column and the key bar
  const meet = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const [label, rail, keys] = await Promise.all([
    place.locator("b").boundingBox(),
    columnBox(page),
    page.locator("[data-key-legend]").boundingBox(),
  ]);
  if (!label || !keys) throw new Error("the label or the key bar");
  expect(meet(label, rail)).toBe(false);
  expect(meet(label, keys)).toBe(false);
  // pressed again, it lets go: nothing is named on the land
  await rowOf(page, two).locator("button").click();
  await expect(place).toHaveCount(0);
});
