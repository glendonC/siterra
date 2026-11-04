import { expect, test, type Page, type Request } from "@playwright/test";
import { en } from "../lib/copy/en";
import { ly } from "../lib/copy/layers";
import { proofSheet } from "../lib/readout/proof";
import {
  PIXEL_STEPS,
  answerOf,
  atTheAnswer,
  loadedRecord,
  openView,
  readoutOn,
  shapedInside,
  shownLabels,
  shownSheets,
  viewsOf,
} from "./answer";
import { textReport } from "./instrument-text";

// The overview at /valley (approved specimen D4): the relief inside the arc, at least 57 px clear of the land, and
// its home, the answer (UI-2), which opens by itself once the land has arrived: the case's findings are now its
// answer, the claim's sheet lifted on the land as its proof, and its views, each opened in place from the answer and
// left by Esc straight back to it; and the ask opened from the command bar and by "/" and closed by Esc, its own Close
// or a click outside it. Enter is pressed in the ask only against stubbed command routes (nothing reaches the server,
// so no worker can pick the request up); elsewhere the checks stop at "nothing is sent before Enter".

test.use({ viewport: { width: 1440, height: 900 } });

/** Writes the page makes, other than opening the demo copy of the seed case. */
function writes(page: Page): string[] {
  const sent: string[] = [];
  page.on("request", (r: Request) => {
    if (r.method() !== "GET" && new URL(r.url()).pathname !== "/api/demo-sessions")
      sent.push(`${r.method()} ${r.url()}`);
  });
  return sent;
}

/** Each pixel leader that passes over a visible word, other than at its own card's edge (the lead's U28c). */
const leadersOverText = (page: Page) =>
  page.evaluate(() => {
    const view = document.querySelector("[data-instrument='pixel']");
    if (!view) return ["no view"];
    const words: { r: DOMRect; card: string | null }[] = [];
    const w = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const el = n.parentElement;
      if (!el || !n.textContent?.trim()) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || el.closest("[style*='display: none']")) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      const card = el.closest("[data-part]")?.getAttribute("data-part") ?? null;
      for (const g of r.getClientRects())
        if (g.width > 1 && g.height > 1) words.push({ r: g, card });
    }
    const hits: string[] = [];
    for (const line of view.querySelectorAll<SVGLineElement>("[data-leaders] line")) {
      const id = line.dataset.leader ?? "";
      const m = line.getScreenCTM();
      if (!m) continue;
      const at = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(m);
      const a = at(line.x1.baseVal.value, line.y1.baseVal.value);
      const b = at(line.x2.baseVal.value, line.y2.baseVal.value);
      for (let i = 1; i < 60; i++) {
        const x = a.x + ((b.x - a.x) * i) / 60;
        const y = a.y + ((b.y - a.y) * i) / 60;
        const hit = words.find(
          (q) => q.card !== id && x > q.r.left && x < q.r.right && y > q.r.top && y < q.r.bottom,
        );
        if (hit) {
          hits.push(`${id} over ${String(hit.card)}`);
          break;
        }
      }
    }
    return hits;
  });

async function ready(page: Page) {
  await page.goto("/valley");
  // the land is drawn, measured and the words placed (the light bake takes about a second)
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 60_000,
  });
}

const opacity = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => Number((el as HTMLElement).style.opacity));

test("draws the land inside the arc and opens on the case's answer, the measured finding's sheet lifted on the land", async ({
  page,
}) => {
  const sent = writes(page);
  const record = loadedRecord(page);
  const readout = await atTheAnswer(page);
  const root = page.locator("[data-overview-root]");
  expect(Number(await root.getAttribute("data-arc-gap"))).toBeGreaterThanOrEqual(57);
  await expect(readout).toBeVisible();
  // the answer, in ink, as the overview reads it from the record it loaded (lib/readout/readout.ts)
  const { snapshot, listing } = await record;
  const { answer } = answerOf(snapshot, listing);
  const ink = await page.locator("[data-overview-root]").evaluate((r) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--text-primary)";
    r.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  await expect(readout.locator("[data-readout-answer]")).toHaveText(answer.claim ?? "");
  await expect(readout.locator("[data-readout-answer]")).toHaveCSS("color", ink);
  // the measured finding on the land: the sheet the answer reads, the vegetation trend, lifted alone and named by its
  // layer only, never with the answer's numbers
  const sheet = proofSheet(snapshot, answer);
  if (!sheet) throw new Error("the case's answer reads no mapped measurement");
  const label = root.locator(`[data-layer-stack] [data-sheet='${sheet}']`);
  await expect(label).toHaveCSS("visibility", "visible", { timeout: 15_000 });
  await expect(label).toContainText(ly[`layers.name.${sheet}`].text);
  await expect(label).not.toContainText(answer.claim ?? "");
  // the views the record's findings offer, each one key away
  await expect(readout.locator("[data-readout-views] button")).toHaveText(
    viewsOf(snapshot, listing).map((v) => `${v.key}${v.label}`),
  );
  // no finding label is left round the arc
  await expect.poll(() => shownLabels(page)).toBe(0);
  // the seed case holds no field plan view, so no proposed field check is drawn on the land
  await expect(page.locator("[data-field-mark]")).toHaveCount(0);
  // the ask is a key in the command bar (HUD-2, decision A), not a circle on the arc
  await expect(page.locator("[data-key-legend] [data-key='/']")).toBeVisible();
  expect(await textReport(page, "[data-overview-root]")).toEqual({
    overlaps: [],
    small: [],
    outside: [],
  });
  expect(sent).toEqual([]);
});

for (const kind of ["cutaway", "pixel", "rainfall"] as const)
  test(`the ${kind} view opens in place from the answer by its number key, under its own address`, async ({
    page,
  }) => {
    const sent = writes(page);
    const record = loadedRecord(page);
    await atTheAnswer(page);
    const { snapshot, listing } = await record;
    // Year by Year plays over the overview's own land (time.spec.ts); Map Layers splits the land in place beside the
    // answer (readout.spec.ts)
    const view = viewsOf(snapshot, listing).find((v) => v.kind === kind);
    if (!view) throw new Error(`the case offers no ${kind} view`);
    await page.keyboard.press(view.key);
    await expect(page).toHaveURL(new RegExp(`${view.href}$`), { timeout: 15_000 });
    await expect(page.locator(`[data-instrument='${kind}']`).first()).toBeVisible({
      timeout: 15_000,
    });
    // the answer's layer label stays with the answer: none shows while a view is open
    await expect.poll(() => shownSheets(page), { timeout: 10_000 }).toEqual([]);
    // Esc: the same answer at once
    await page.keyboard.press("Escape");
    await expect(readoutOn(page)).toBeVisible({ timeout: 2_000 });
    await expect(page).toHaveURL(/\/valley$/);
    await expect(readoutOn(page).locator("[data-readout-answer]")).toHaveText(
      answerOf(snapshot, listing).answer.claim ?? "",
    );
    expect(sent).toEqual([]);
  });

type Box = { x0: number; y0: number; x1: number; y1: number };

/**
 * The box an element draws: its words, pictures and marks that show (a step's content is placed by a transform, inside
 * a container as large as the stage).
 */
const drawnBox = (page: Page, selector: string): Promise<Box | null> =>
  page.locator(selector).evaluate((el) => {
    const shown = (e: Element) => {
      for (let x: Element | null = e; x && x !== el.parentElement; x = x.parentElement) {
        const cs = getComputedStyle(x);
        if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") return false;
      }
      return true;
    };
    const rs: DOMRect[] = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent?.trim() || !n.parentElement || !shown(n.parentElement)) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      rs.push(...Array.from(r.getClientRects()));
    }
    for (const g of el.querySelectorAll(
      "canvas, img, button, line, rect, circle, path, polyline, polygon",
    ))
      if (shown(g)) rs.push(g.getBoundingClientRect());
    const on = rs.filter((r) => r.width > 0.5 && r.height > 0.5);
    if (!on.length) return null;
    return {
      x0: Math.min(...on.map((r) => r.left)),
      y0: Math.min(...on.map((r) => r.top)),
      x1: Math.max(...on.map((r) => r.right)),
      y1: Math.max(...on.map((r) => r.bottom)),
    };
  });

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
  Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/**
 * The steps whose row does not look as it should: the open one on the theme's selected background (--trace-fill, read
 * from a probe beside the rows), every other row off it.
 */
const wrongGrounds = (page: Page) =>
  page.locator("[data-instrument='pixel'] [data-step]").evaluateAll((els) => {
    const probe = document.createElement("i");
    probe.style.background = "var(--trace-fill)";
    els[0]?.parentElement?.appendChild(probe);
    const selected = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return els
      .filter(
        (e) =>
          (getComputedStyle(e).backgroundColor === selected) !==
          (e.getAttribute("aria-expanded") === "true"),
      )
      .map((e) => e.getAttribute("data-step"));
  });

test("the pixel opens in place: its statement over one ordered list of six steps, each opening alone under its own row with its leader to the land; the paint control colors the cells; Esc puts them back", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await atTheAnswer(page);
  await openView(page, "pixel");
  await expect(page).toHaveURL(/\/instruments\/pixel$/);
  const view = page.locator("[data-instrument='pixel'][data-around]");
  await expect(view).toBeVisible();
  // the steps in order, numbered as the key bar writes its keys and named by what each shows
  const rows = view.locator("[data-step]");
  await expect(rows).toHaveText(
    PIXEL_STEPS.map(([id, name]) => `${id}${en[name].text}`),
    { timeout: 15_000 },
  );
  // at rest 02 is open under its own row, and only its row looks selected, wherever the pointer rests
  await expect(view.locator("[data-step][aria-expanded='true']")).toHaveCount(1);
  await expect(view.locator("[data-step='02']")).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => wrongGrounds(page)).toEqual([]);
  // one leader, 02's, to the risen cells, crossing no words
  await expect(view.locator("[data-leaders] line")).toHaveCount(1, { timeout: 10_000 });
  await expect(view.locator("[data-leaders] line[data-leader='02']")).toHaveCount(1);
  expect(await leadersOverText(page)).toEqual([]);
  // where the risen pixel stands on screen, once it has risen (the view follows it every frame)
  const pixelBox = async (): Promise<Box> => {
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = ((await view.getAttribute("data-pixel-box")) ?? "")
      .split(",")
      .map(Number);
    return { x0, y0, x1, y1 };
  };
  await expect
    .poll(
      async () => {
        const b = await pixelBox();
        return b.x1 - b.x0;
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(100);
  const pixel = await pixelBox();
  // each step in turn: it opens alone, its content directly under its own row and above the next, clear of the
  // risen pixel, its leader over no words, and nothing crowds
  for (const [i, [id]] of PIXEL_STEPS.entries()) {
    const row = view.locator(`[data-step='${id}']`);
    if ((await row.getAttribute("aria-expanded")) !== "true") await row.click();
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await expect(view.locator("[data-step][aria-expanded='true']")).toHaveCount(1);
    const part = `[data-instrument='pixel'] [data-part='${id}']`;
    await expect(page.locator(part)).toBeVisible();
    const [own, content, next] = await Promise.all([
      drawnBox(page, `[data-instrument='pixel'] [data-step='${id}']`),
      drawnBox(page, part),
      i + 1 < PIXEL_STEPS.length
        ? drawnBox(page, `[data-instrument='pixel'] [data-step='${PIXEL_STEPS[i + 1]?.[0] ?? ""}']`)
        : Promise.resolve(null),
    ]);
    if (!own || !content) throw new Error(`step ${id}`);
    expect(content.y0, `${id} under its row`).toBeGreaterThanOrEqual(own.y1 - 1);
    if (next) expect(next.y0, `${id} above the next row`).toBeGreaterThanOrEqual(content.y1 - 1);
    // each step's layout is read in full before the test fails, so one run names every step that crowds
    expect.soft(overlap(content, pixel), `${id} over the pixel`).toBe(0);
    expect.soft(await leadersOverText(page), `${id}'s leader`).toEqual([]);
    expect.soft(await textReport(page, "[data-instrument='pixel']"), `step ${id}`).toEqual({
      overlaps: [],
      small: [],
      outside: [],
    });
  }
  // pressed again, the open step closes and no step is open
  await view.locator("[data-step='06']").click();
  await expect(view.locator("[data-step][aria-expanded='true']")).toHaveCount(0);
  // the land stays under the steps
  await expect(page.locator("[data-overview-root] canvas[data-land]").first()).toBeVisible();
  // 02's paint control: one paint at a time
  await view.locator("[data-step='02']").click();
  for (const paint of ["ndvi", "class", "rgb"]) {
    await view.locator(`[data-paint='${paint}']`).click();
    await expect(view.locator(`[data-paint='${paint}']`)).toHaveAttribute("aria-pressed", "true");
    await expect(view.locator("[data-paint][aria-pressed='true']")).toHaveCount(1);
  }
  expect(await textReport(page, "[data-instrument='pixel']")).toEqual({
    overlaps: [],
    small: [],
    outside: [],
  });
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/valley$/);
  await expect(page.locator("[data-instrument='pixel']")).toHaveCount(0);
});

for (const [w, h] of [
  [1440, 900],
  [1440, 800],
  [1280, 720],
] as const)
  test(`the pixel's tallest step stays on the screen and clear of the key bar at ${String(w)} x ${String(h)}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: w, height: h });
    await atTheAnswer(page);
    await openView(page, "pixel");
    const view = page.locator("[data-instrument='pixel'][data-around]");
    // 05, the mix model, opened under its row
    await view.locator("[data-step='05']").click();
    await expect(view.locator("[data-step='05']")).toHaveAttribute("aria-expanded", "true");
    const content = await drawnBox(page, "[data-instrument='pixel'] [data-part='05']");
    const keys = await page.locator("[data-key-legend]").last().boundingBox();
    if (!content || !keys) throw new Error("step 05 or the key bar");
    expect(content.y1).toBeLessThanOrEqual(h);
    expect(
      overlap(content, {
        x0: keys.x,
        y0: keys.y,
        x1: keys.x + keys.width,
        y1: keys.y + keys.height,
      }),
    ).toBe(0);
  });

test("the opened pixel's field check step keeps its plan, its transect and what it would record, with the published context cited by short citation", async ({
  page,
}) => {
  await atTheAnswer(page);
  await openView(page, "pixel");
  const view = page.locator("[data-instrument='pixel'][data-around]");
  await view.locator("[data-step='06']").click();
  const part = view.locator("[data-part='06']");
  await expect(part).toBeVisible();
  await expect(part).toContainText(en["instrument.pixel.field.proposed"].text);
  await expect(part).toContainText(shapedInside(en["instrument.pixel.field.transect"].text));
  await expect(part).toContainText(en["instrument.pixel.field.records"].text);
  // the published context, cited by short citation, never by the record's ids
  await expect(part).toContainText("El Aayadi et al. 2026, pp. 7 to 8");
  await expect(part).toContainText(en["instrument.pixel.field.noSpectrum"].text);
  expect(await view.innerText()).not.toMatch(/\bSCI-\d/);
  expect(await textReport(page, "[data-instrument='pixel']")).toEqual({
    overlaps: [],
    small: [],
    outside: [],
  });
});

test("the browser's Back reopens a view left by Esc, and Back again plays it back to the land", async ({
  page,
}) => {
  await atTheAnswer(page);
  await openView(page, "cutaway");
  await expect(page).toHaveURL(/\/instruments\/cutaway$/);
  await expect(page.locator("[data-instrument='cutaway'] [data-band]").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/valley$/);
  await expect(page.locator("[data-instrument='cutaway']")).toHaveCount(0, { timeout: 10_000 });
  // Back: the address and the view agree again
  await page.goBack();
  await expect(page).toHaveURL(/\/instruments\/cutaway$/);
  await expect(page.locator("[data-instrument='cutaway'] [data-band]").first()).toBeVisible({
    timeout: 10_000,
  });
  // Back again: to the land, the view played back
  await page.goBack();
  await expect(page).toHaveURL(/\/valley$/);
  await expect(page.locator("[data-instrument='cutaway']")).toHaveCount(0, { timeout: 10_000 });
});

test("the proposed routes lie on the land, lift on hover, open with the bundle's figures, and Esc returns", async ({
  page,
}) => {
  test.fixme(
    true,
    "HUD-2 decision A removed the overview's bottom-left routes entry; routes return inside the finding or plan step that uses them (DESIGN lane)",
  );
  const sent = writes(page);
  await ready(page);
  const ends = page.locator("[data-route-end]");
  await expect(ends).toHaveCount(4);
  const end = (member: string) => opacity(page, `[data-route-end='${member}']`);
  const entry = page.locator("[data-routes-entry]");
  await expect(entry).toHaveText("Proposed routes, access unconfirmed");
  // at rest the ends are quiet; hovering the one entry lifts every route
  await expect.poll(() => end("route_tabant_band_3")).toBeCloseTo(0.75, 2);
  await entry.hover();
  await expect.poll(() => end("route_tabant_band_3")).toBe(1);

  // opened: each route as the record names it, its figures from route_lines rounded once, the cost function in grey
  await entry.click();
  const record = page.locator("[data-record='routes']");
  await expect(record.locator("[data-route]")).toHaveCount(4);
  // decision 16: one line per route; "one way" and "model estimates" said once in the caption
  await expect(record.locator("[data-routes-caption]")).toContainText("one way. Model estimates.");
  await expect(record.locator("[data-route-figures]")).toHaveText([
    "550 m, climb 20 m, 12 min",
    "500 m, climb 130 m, 24 min",
    "3.9 km, climb 560 m, 2 h 20 min",
    "6.6 km, climb 1,060 m, 4 h 10 min",
  ]);
  await expect(record.locator("[data-route]").first()).toContainText("The pixel the case opens");
  await expect(record.locator("[data-route='route_tabant_band_2']")).toContainText(
    "Elevation band 2",
  );
  await expect(record.locator("[data-routes-end]")).toHaveText(
    "Candidate site chosen by a stated rule",
  );
  // the limits and the cost function wait behind their step
  await expect(record.locator("[data-routes-cost]")).toBeHidden();
  await record.locator("[data-routes-method]").click();
  await expect(record.locator("[data-routes-not]")).toContainText("Model estimates, not");
  await expect(record.locator("[data-routes-cost]")).toHaveText(
    "Cost function: Tobler's hiking function, times 0.6 off path; horizontal length over speed, one way, no load, no rest.",
  );
  await expect.poll(() => opacity(page, "[data-record]")).toBe(1);
  expect(await textReport(page, "[data-record]")).toEqual({ overlaps: [], small: [], outside: [] });
  // each route numbered in the list as its end is on the land; the shared start named from the record, with its
  // credit; no ring label left, not even a trace
  await expect(record.locator("[data-route-number]")).toHaveText(["1", "2", "3", "4"]);
  for (const [member, n] of [
    ["route_tabant_pixel_h17v05r4005c2178", "1"],
    ["route_tabant_band_1", "2"],
    ["route_tabant_band_2", "3"],
    ["route_tabant_band_3", "4"],
  ] as const)
    await expect(page.locator(`[data-route-end='${member}']`)).toHaveText(n);
  await expect(page.locator("[data-route-start]")).toHaveText("Tabant");
  await expect.poll(() => opacity(page, "[data-route-start]")).toBe(1);
  await expect(page.locator("[data-sources-line]")).toContainText("GeoNames");
  for (const label of await page.locator("[data-finding]").all())
    expect(await label.evaluate((el) => Number((el as HTMLElement).style.opacity))).toBe(0);
  // the routes stay sharp: the land is blurred outside them, every end is shown
  await expect
    .poll(() =>
      page
        .locator("canvas")
        .nth(1)
        .evaluate((el) => (el as HTMLElement).style.opacity),
    )
    .toBe("1");
  // a route picked with the keyboard is lifted alone
  await record.locator("[data-route='route_tabant_band_1']").focus();
  await page.keyboard.press("Tab");
  await expect(record.locator("[data-route='route_tabant_band_2']")).toBeFocused();
  await expect.poll(() => end("route_tabant_band_2")).toBe(1);
  await expect.poll(() => end("route_tabant_band_3")).toBeCloseTo(0.35, 2);
  await page.keyboard.press("Escape");
  await expect(record).toHaveCount(0);
  await expect(entry).toBeFocused();
  expect(sent).toEqual([]);
});

test("the ask opens from the command bar and by the slash key, closes by Esc, its own Close or a click outside, and sends nothing", async ({
  page,
}) => {
  const sent = writes(page);
  const readout = await atTheAnswer(page);
  const askOpen = page.locator("[data-ask-overlay][data-open]");
  const input = page.locator("input[name='question']");
  const suggested = page.locator("[data-ask-suggestions]");
  const picks = page.locator("[data-ask-suggestion]");
  await expect(page.locator("[data-ask-prompts]")).toHaveCount(0);
  await page.locator("[data-key-legend] [data-key='/']").click();
  await expect(input).toBeFocused();
  // the answer's column steps away while the ask is open
  await expect(readout).toBeHidden();
  // CMP-05: the line is labeled "Ask Siterra" on screen and has no placeholder
  await expect(input).toHaveAccessibleName("Ask Siterra");
  await expect(input).not.toHaveAttribute("placeholder");
  // no mode bar: no live search, findings or plan pill
  await expect(
    page.locator("[data-ask-live-search], [data-ask-open-verdict], [data-ask-open-plan]"),
  ).toHaveCount(0);
  // two suggestions with no key numbers, on the trace column's left edge and centred on the line
  await expect(picks).toHaveCount(2);
  await expect(picks.locator("kbd")).toHaveCount(0);
  const line = await input.boundingBox();
  const side = await suggested.boundingBox();
  if (!line || !side) throw new Error("the line or the suggestions");
  expect(Math.abs(side.x - 40)).toBeLessThan(1);
  expect(Math.abs(side.width - 330)).toBeLessThan(1);
  expect(Math.abs(side.y + side.height / 2 - (line.y + line.height / 2))).toBeLessThan(1);
  // the ask's own keys stand in for the screen's key bar while it is open
  await expect(page.locator("[data-ask-keys] [data-ask-key]")).toHaveText(["↵Submit", "EscClose"]);
  await expect(page.locator("[data-key-legend]")).toBeHidden();
  // nothing under 12 px: the line's label and the suggestions' kicker are mono 12 px labels
  expect(await textReport(page, "[data-overview-root]")).toEqual({
    overlaps: [],
    small: [],
    outside: [],
  });
  // an arrow key picks a suggestion with the focus kept on the line; typing puts the suggestions away
  await page.keyboard.press("ArrowDown");
  await expect(picks.first()).toHaveAttribute("data-selected", "");
  await expect(input).toBeFocused();
  await input.pressSequentially("Why is the valley floor greener?");
  await expect(input).toHaveValue("Why is the valley floor greener?");
  await expect(suggested).toHaveCount(0);
  // the activity line shows only after Enter
  await expect(page.locator("[data-ask-activity]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(askOpen).toHaveCount(0);
  await expect(input).not.toBeFocused();
  await expect(page.locator("[data-key-legend]")).toBeVisible();
  // the answer comes back as it was, and Esc in the ask left the place no more than that
  await expect(readout).toBeVisible();
  await expect(page).toHaveURL(/\/valley$/);

  await page.locator("body").click({ position: { x: 20, y: 450 } });
  await page.keyboard.press("/");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  // the empty line offers the suggestions again, none picked
  await expect(picks).toHaveCount(2);
  await expect(page.locator("[data-ask-suggestion][data-selected]")).toHaveCount(0);
  // its own Close closes it
  await page.locator("[data-ask-keys] [data-ask-key='Escape']").click();
  await expect(askOpen).toHaveCount(0);
  await expect(readout).toBeVisible();
  // and so does a click anywhere outside its line, which does nothing else: the answer stays as it was
  await page.keyboard.press("/");
  await expect(askOpen).toHaveCount(1);
  await page.mouse.click(1000, 450);
  await expect(askOpen).toHaveCount(0);
  await expect(readout).toBeVisible();
  await expect(page).toHaveURL(/\/valley$/);
  expect(sent).toEqual([]);
});

test("the arrow keys pick a suggestion and Enter asks it, with live web search off (stubbed, nothing reaches the server)", async ({
  page,
}) => {
  const asked: { text?: string }[] = [];
  const followed: unknown[] = [];
  // the commission and its follow-up are answered here, so no worker can pick either up
  await page.route("**/api/cases/*/commands", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    asked.push(route.request().postDataJSON() as { text?: string });
    return route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ recordType: "Command", id: "cmd_e2e_ask_suggestion" }),
    });
  });
  await page.route("**/api/cases/*/commands/*/complete", (route) => {
    followed.push(route.request().postDataJSON());
    return route.fulfill({ status: 202, contentType: "application/json", body: "{}" });
  });
  await ready(page);
  await page.keyboard.press("/");
  const input = page.locator("input[name='question']");
  const picks = page.locator("[data-ask-suggestion]");
  const picked = page.locator("[data-ask-suggestion][data-selected]");
  await expect(input).toBeFocused();
  await expect(picks).toHaveCount(2);
  const second = await picks.nth(1).textContent();
  // nothing is picked until an arrow key; down steps through both and back to the line, up the other way
  await expect(picked).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await expect(picks.nth(0)).toHaveAttribute("data-selected", "");
  await page.keyboard.press("ArrowDown");
  await expect(picks.nth(1)).toHaveAttribute("data-selected", "");
  await page.keyboard.press("ArrowDown");
  await expect(picked).toHaveCount(0);
  await page.keyboard.press("ArrowUp");
  await expect(picks.nth(1)).toHaveAttribute("data-selected", "");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  expect(asked).toEqual([]);
  // Enter asks the picked question, and its follow-up asks for no live web search (P1)
  await page.keyboard.press("Enter");
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]?.text).toBe(second);
  await expect.poll(() => followed).toEqual([{ liveSearch: false }]);
});

test("a question carried from an instrument opens the ask with it, sending nothing", async ({
  page,
}) => {
  const sent = writes(page);
  // what the instruments' ask stores on Enter (lib/shell/handoff.ts carryQuestion)
  await page.addInitScript(() => {
    if (location.pathname === "/valley")
      sessionStorage.setItem("siterra.valleyQuestion", "Is the valley floor greener since 2019?");
  });
  await ready(page);
  const input = page.locator("input[name='question']");
  await expect(input).toHaveValue("Is the valley floor greener since 2019?");
  await expect(input).toBeFocused();
  await expect(page.locator("[data-ask-activity]")).toHaveCount(0);
  expect(sent).toEqual([]);
});

for (const [w, h] of [
  [1440, 900],
  [1280, 800],
] as const)
  test(`the ask keeps the case's own question fully visible while it is typed, at ${String(w)} x ${String(h)} (U30)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: w, height: h });
    // the case's own question, as its record states it
    const record = loadedRecord(page);
    await atTheAnswer(page);
    const question = (await record).snapshot.case.objective.trim();
    expect(question.length).toBeGreaterThan(0);
    await page.keyboard.press("/");
    await page.keyboard.type(question);
    const input = page.locator("input[name='question']");
    await expect(input).toHaveValue(question);
    // nothing scrolled out of the field: the whole question fits it
    expect(await input.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
    expect(await input.evaluate((e) => e.scrollLeft)).toBe(0);
  });
