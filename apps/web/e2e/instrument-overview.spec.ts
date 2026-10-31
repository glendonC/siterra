import { expect, test, type Page, type Request } from "@playwright/test";
import { textReport } from "./instrument-text";

// The overview at /valley (approved specimen D4): the relief inside the arc, at least 57 px clear of the land, five
// findings with the case's numbers, hover, opening a finding's record on its side and Esc back, and the ask
// opened and closed by its circle and by "/". Enter is never pressed in the ask here: a worker could pick the request
// up. The checks stop at "nothing is sent before Enter".

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

test("draws the land inside the arc with the case's findings", async ({ page }) => {
  const sent = writes(page);
  await ready(page);
  const root = page.locator("[data-overview-root]");
  expect(Number(await root.getAttribute("data-arc-gap"))).toBeGreaterThanOrEqual(57);
  expect(Number(await root.getAttribute("data-ask-gap"))).toBeGreaterThan(0);
  await expect(page.locator("[data-finding]")).toHaveCount(5);
  // the seed case's Measurements, as the instruments format them
  const numbers: [string, string][] = [
    ["catchment", "+0.0091"],
    ["band", "+0.0134"],
    ["pixel", "+0.0570"],
    ["rain", "0.037"],
    ["fdr", "24.7%"],
  ];
  for (const [id, n] of numbers)
    await expect(page.locator(`[data-finding='${id}']`)).toContainText(n);
  await expect(page.locator("[data-finding='band']")).toContainText("2,317 m");
  // the seed case holds no field plan, so no proposed field check is drawn on the land
  await expect(page.locator("[data-field-mark]")).toHaveCount(0);
  await expect(page.locator("[data-ask]")).toBeVisible();
  expect(await textReport(page, "[data-overview-root]")).toEqual({
    overlaps: [],
    small: [],
    outside: [],
  });
  expect(sent).toEqual([]);
});

test("hover and focus bring one finding forward and dim the others", async ({ page }) => {
  await ready(page);
  const pixel = page.locator("[data-finding='pixel']");
  await pixel.hover();
  await expect
    .poll(() => pixel.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--hov")))
    .toBe("1.000");
  await expect.poll(() => opacity(page, "[data-wire='pixel']")).toBe(1);
  await expect.poll(() => opacity(page, "[data-finding='rain']")).toBeLessThan(0.7);
  await page.mouse.move(20, 450);
  await expect.poll(() => opacity(page, "[data-finding='rain']")).toBe(1);
  // keyboard focus is a hover too
  await page.locator("[data-finding='band']").focus();
  await expect.poll(() => opacity(page, "[data-wire='band']")).toBe(1);
});

test("opens a finding's record on its side and Esc returns", async ({ page }) => {
  const sent = writes(page);
  await ready(page);
  const record = page.locator("[data-record]");
  // the record's Enter action (decision 15): the first in its list, named by what the visitor will see
  const open = record.locator("[data-actions] a").first();

  // the pixel: its number, its season chart and context, and the way to the full instrument
  await page.locator("[data-finding='pixel']").click();
  await expect(page.locator("[data-record='pixel']")).toContainText("+0.0570");
  await expect(page.locator("[data-record='pixel'] [data-pixel-note]")).toHaveText(
    "This pixel is an illustration chosen by judgment, not a sample.",
  );
  await expect(page.locator("[data-record='pixel'] svg circle").first()).toBeAttached({
    timeout: 30_000,
  });
  await expect(open).toHaveAttribute("href", "/instruments/pixel");
  await expect(open).toHaveAttribute("aria-keyshortcuts", "Enter");
  await expect(record.locator("[data-actions] > *")).toHaveText([
    "Open This PixelEnter",
    "See the LayersL",
    "BackEsc",
  ]);
  await expect.poll(() => opacity(page, "[data-record]")).toBe(1);
  // the land outside the focus band is blurred
  await expect
    .poll(() =>
      page
        .locator("canvas")
        .nth(1)
        .evaluate((el) => (el as HTMLElement).style.opacity),
    )
    .toBe("1");
  expect(await textReport(page, "[data-record]")).toEqual({ overlaps: [], small: [], outside: [] });
  await page.keyboard.press("Escape");
  await expect(record).toHaveCount(0);
  await expect(page.locator("[data-finding='pixel']")).toBeFocused();

  // Enter on a focused finding opens it too
  const records: [string, string, string][] = [
    ["band", "+0.0134", "/instruments/cutaway"],
    ["catchment", "+0.0091", "/instruments/layers"],
    ["fdr", "24.7%", "/instruments/layers"],
    ["rain", "0.037", "/instruments/rainfall"],
  ];
  for (const [id, n, href] of records) {
    await page.locator(`[data-finding='${id}']`).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(`[data-record='${id}']`)).toContainText(n);
    await expect(open).toHaveAttribute("href", href);
    await page.keyboard.press("Escape");
    await expect(record).toHaveCount(0);
  }

  // the way back by the breadcrumb's valley crumb
  await page.locator("[data-finding='pixel']").click();
  await expect(page.locator("[data-record='pixel']")).toBeVisible();
  await page.locator("[data-crumbs]").getByRole("button", { name: "Aït Bouguemez valley" }).click();
  await expect(record).toHaveCount(0);
  expect(sent).toEqual([]);
});

test("a trend card says what a dot is, and its published context opens beside it from a toggle under the card", async ({
  page,
}) => {
  await ready(page);
  await page.locator("[data-finding='pixel']").click();
  const record = page.locator("[data-record='pixel']");
  await expect.poll(() => opacity(page, "[data-record]")).toBe(1);
  await expect(record.locator("[data-season-dot]")).toHaveText("Each dot, one season's mean");
  // closed, the toggle waits under the card's actions (AUDIT's U28 advisory: it stood at the stage's left edge)
  const toggle = record.locator("[data-context-toggle]");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const actions = await record.locator("[data-actions]").boundingBox();
  const closed = await toggle.boundingBox();
  if (!actions || !closed) throw new Error("the actions or the toggle");
  expect(Math.abs(closed.x - actions.x)).toBeLessThan(24);
  expect(closed.y).toBeGreaterThanOrEqual(actions.y + actions.height);
  expect(closed.y - (actions.y + actions.height)).toBeLessThan(40);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(record.locator("section").last()).toBeVisible();
  expect(await textReport(page, "[data-record]")).toEqual({ overlaps: [], small: [], outside: [] });
});

test("Enter on an opened card runs the action its Enter chip names, however the card was opened", async ({
  page,
}) => {
  await ready(page);
  // opened by a click: the focus is still on the finding's label
  await page.locator("[data-finding='band']").click();
  await expect(page.locator("[data-record='band']")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/instruments\/cutaway$/);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/valley$/);
  // opened by the keyboard, on a fresh overview: Enter on the label opens the card, Enter again runs its action
  await ready(page);
  await page.locator("[data-finding='pixel']").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-record='pixel']")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/instruments\/pixel$/);
});

test("the pixel opens in place: its cards stand round its risen cells, 02 paints them, Esc puts them back", async ({
  page,
}) => {
  await ready(page);
  await page.locator("[data-finding='pixel']").click();
  await page.locator("[data-record] [data-actions] a").first().click();
  await expect(page).toHaveURL(/\/instruments\/pixel$/);
  const view = page.locator("[data-instrument='pixel'][data-around]");
  await expect(view).toBeVisible();
  // the pixel is the subject: at rest only the caption and 02 are open (decision 16, U28b), 01, 03, 04, 05 and 06
  // wait as chips; one leader from each card or chip to the pixel on the land
  await expect(view.locator("[data-card]:visible")).toHaveCount(2);
  await expect(view.locator("[data-chip]")).toHaveText([
    "01Locate",
    "03Measured Spectra",
    "04Season Record",
    "05Linear Mix Model",
    "06Field Check",
  ]);
  // at rest one leader, 02's to the risen cells; a waiting chip has none (U28c), and no leader crosses any words
  await expect(view.locator("[data-leaders] line")).toHaveCount(1, { timeout: 10_000 });
  await expect(view.locator("[data-leaders] line[data-leader='02']")).toHaveCount(1);
  expect(await leadersOverText(page)).toEqual([]);
  // a chip opens its card beside the column, and closes it again
  const chip = view.locator("[data-chip='06']");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  await expect(view.locator("[data-card='06']")).toBeVisible();
  // the field check cites its sources by short citation, never by the record's ids
  await expect(view.locator("[data-part='06']")).toContainText("El Aayadi et al. 2026, pp. 7 to 8");
  expect(await view.innerText()).not.toMatch(/\bSCI-\d/);
  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "false");
  await expect(view.locator("[data-card='06']")).toBeHidden();
  // no opened chip's card covers another card's words: each in turn, the text report clean and its back clear of
  // every other open card's back
  for (const id of ["01", "03", "04", "05", "06"]) {
    const c = view.locator(`[data-chip='${id}']`);
    await c.click();
    await expect(view.locator(`[data-card='${id}']`)).toBeVisible();
    // its own leader, with 02's beside it when 02 keeps its slot (03 and 05 open on the right)
    await expect(view.locator(`[data-leaders] line[data-leader='${id}']`)).toHaveCount(1);
    await expect(view.locator("[data-leaders] line")).toHaveCount(
      id === "03" || id === "05" ? 2 : 1,
    );
    expect(await leadersOverText(page), `${id}'s leaders`).toEqual([]);
    expect(await textReport(page, "[data-instrument='pixel']")).toEqual({
      overlaps: [],
      small: [],
      outside: [],
    });
    const boxes = await view.locator("[data-card]:visible").evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return {
          id: e.getAttribute("data-card"),
          x0: r.left,
          y0: r.top,
          x1: r.right,
          y1: r.bottom,
        };
      }),
    );
    const mine = boxes.find((b) => b.id === id);
    if (!mine) throw new Error(`card ${id}`);
    // nor over its subject, the risen pixel (decision 14)
    const [px0 = 0, py0 = 0, px1 = 0, py1 = 0] = ((await view.getAttribute("data-pixel-box")) ?? "")
      .split(",")
      .map(Number);
    expect(px1 - px0).toBeGreaterThan(100);
    expect(
      Math.max(0, Math.min(mine.x1, px1) - Math.max(mine.x0, px0)) *
        Math.max(0, Math.min(mine.y1, py1) - Math.max(mine.y0, py0)),
      `${id} over the pixel`,
    ).toBe(0);
    for (const b of boxes)
      if (b.id !== id)
        expect(
          Math.max(0, Math.min(mine.x1, b.x1) - Math.max(mine.x0, b.x0)) *
            Math.max(0, Math.min(mine.y1, b.y1) - Math.max(mine.y0, b.y0)),
          `${id} over ${String(b.id)}`,
        ).toBe(0);
    await c.click();
    await expect(view.locator(`[data-card='${id}']`)).toBeHidden();
  }
  // the land stays under the cards
  await expect(page.locator("[data-overview-root] canvas[data-land]").first()).toBeVisible();
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
  test(`the pixel's open cards touch neither each other nor the data line at ${String(w)} x ${String(h)}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: w, height: h });
    await ready(page);
    await page.locator("[data-finding='pixel']").click();
    await page.locator("[data-record] [data-actions] a").first().click();
    const view = page.locator("[data-instrument='pixel'][data-around]");
    // 05, the lowest card on the right, opened from its chip beside 02
    await view.locator("[data-chip='05']").click();
    await expect(view.locator("[data-card='05']")).toBeVisible();
    await expect(view.locator("[data-card='02']")).toBeVisible();
    const boxes = await view.locator("[data-card]:visible").evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return {
          id: e.getAttribute("data-card"),
          x0: r.left,
          y0: r.top,
          x1: r.right,
          y1: r.bottom,
        };
      }),
    );
    for (const a of boxes)
      for (const b of boxes)
        if (a.id !== null && b.id !== null && a.id < b.id)
          expect(
            Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
              Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)),
            `${a.id} and ${b.id}`,
          ).toBe(0);
    const line = await page.locator("[data-sources-line]:visible").first().boundingBox();
    const c05 = boxes.find((b) => b.id === "05");
    if (!line || !c05) throw new Error("the data line or card 05");
    expect(c05.y1).toBeLessThanOrEqual(line.y);
  });

test("the opened pixel's field check card keeps its proposal and transect, the rest behind its step", async ({
  page,
}) => {
  await ready(page);
  await page.locator("[data-finding='pixel']").click();
  await page.locator("[data-record] [data-actions] a").first().click();
  const view = page.locator("[data-instrument='pixel'][data-around]");
  await view.locator("[data-chip='06']").click();
  const card = view.locator("[data-part='06']");
  await expect(card).toContainText("Proposed field check. Not measured.");
  // the method line stands with the transect's at rest (U28e)
  await expect(card.getByText("Records plant cover by species and palatability")).toBeVisible();
  const step = card.locator("[data-field-context-step]");
  await expect(step).toHaveAttribute("aria-expanded", "false");
  await expect(card.locator("[data-field-context]")).toBeHidden();
  await step.click();
  await expect(step).toHaveAttribute("aria-expanded", "true");
  await expect(card.locator("[data-field-context]")).toBeVisible();
  await expect(card.locator("[data-field-context]")).toContainText(
    "El Aayadi et al. 2026, pp. 7 to 8",
  );
  // the card stays open while its step is used, clear of the ask disc, and nothing crowds
  await expect(view.locator("[data-card='06']")).toBeVisible();
  const back = await view.locator("[data-card='06']").boundingBox();
  // the disc on screen (the overview's own waits off it while the view stands)
  const disc = await page.locator("[data-ask]").last().boundingBox();
  if (!back || !disc) throw new Error("card 06 or the ask disc");
  expect(
    Math.max(0, Math.min(back.x + back.width, disc.x + disc.width) - Math.max(back.x, disc.x)) *
      Math.max(0, Math.min(back.y + back.height, disc.y + disc.height) - Math.max(back.y, disc.y)),
  ).toBe(0);
  expect(await textReport(page, "[data-instrument='pixel']")).toEqual({
    overlaps: [],
    small: [],
    outside: [],
  });
  // and its context reads whole at this size, not cut off inside the card
  const ctx = card.locator("[data-field-context]");
  expect(await ctx.evaluate((e) => e.scrollHeight - e.clientHeight)).toBeLessThanOrEqual(1);
});

test("the browser's Back reopens a view left by Esc, and Back again plays it back to the land", async ({
  page,
}) => {
  await ready(page);
  await page.locator("[data-finding='band']").click();
  await page.locator("[data-record] [data-actions] a").first().click();
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

test("the ask opens and closes by its circle and by the slash key, and sends nothing", async ({
  page,
}) => {
  const sent = writes(page);
  await ready(page);
  const ask = page.locator("[data-ask]");
  const input = page.locator("input[name='question']");
  await expect(page.locator("[data-suggested-question]")).toHaveCount(3);
  await expect(page.locator("[data-ask-prompts]")).toContainText("Ask Siterra to investigate");
  await ask.click();
  await expect(input).toBeFocused();
  await expect(page.locator("[data-ask-suggestion]")).toHaveCount(3);
  expect(await textReport(page, "[data-overview-root]")).toEqual({
    overlaps: [],
    small: [],
    outside: [],
  });
  await input.pressSequentially("Why is the valley floor greener?");
  await expect(input).toHaveValue("Why is the valley floor greener?");
  // the activity line shows only after Enter
  await expect(page.locator("[data-ask-activity]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(ask).toHaveAttribute("aria-expanded", "false");
  await expect(input).not.toBeFocused();

  await page.locator("body").click({ position: { x: 20, y: 450 } });
  await page.keyboard.press("/");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await ask.click();
  await expect(ask).toHaveAttribute("aria-expanded", "false");
  expect(sent).toEqual([]);
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
    await ready(page);
    const question = (await page.locator("[data-case-question]").first().innerText()).trim();
    await page.keyboard.press("/");
    await page.keyboard.type(question);
    const input = page.locator("input[name='question']");
    await expect(input).toHaveValue(question);
    // nothing scrolled out of the field: the whole question fits it
    expect(await input.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
    expect(await input.evaluate((e) => e.scrollLeft)).toBe(0);
  });
