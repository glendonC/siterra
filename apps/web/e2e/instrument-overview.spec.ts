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
    "See the Five LayersL",
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

test("the proposed routes lie on the land, lift on hover, open with the bundle's figures, and Esc returns", async ({
  page,
}) => {
  const sent = writes(page);
  await ready(page);
  const ends = page.locator("[data-route-end]");
  await expect(ends).toHaveCount(4);
  const end = (member: string) => opacity(page, `[data-route-end='${member}']`);
  const entry = page.locator("[data-routes-entry]");
  await expect(entry).toHaveText("Proposed walking routes, access unconfirmed");
  // at rest the ends are quiet; hovering the one entry lifts every route
  await expect.poll(() => end("route_tabant_band_3")).toBeCloseTo(0.75, 2);
  await entry.hover();
  await expect.poll(() => end("route_tabant_band_3")).toBe(1);

  // opened: each route as the record names it, its figures from route_lines rounded once, the cost function in grey
  await entry.click();
  const record = page.locator("[data-record='routes']");
  await expect(record.locator("[data-route]")).toHaveCount(4);
  await expect(record.locator("[data-route-figures]")).toHaveText([
    "550 m, climb 20 m, estimated 12 min one way",
    "500 m, climb 130 m, estimated 24 min one way",
    "3.9 km, climb 560 m, estimated 2 h 20 min one way",
    "6.6 km, climb 1,060 m, estimated 4 h 10 min one way",
  ]);
  await expect(record.locator("[data-route]").first()).toContainText(
    "Proposed route to the pixel the case opens",
  );
  await expect(record.locator("[data-route='route_tabant_band_2']")).toContainText(
    "Proposed route to elevation band 2",
  );
  await expect(record.locator("[data-route='route_tabant_band_2']")).toContainText(
    "Candidate site chosen by a stated rule",
  );
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
  await ask.click();
  await expect(input).toBeFocused();
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
