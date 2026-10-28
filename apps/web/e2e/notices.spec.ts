import { expect, test } from "@playwright/test";
import { sharedCase } from "./demo-case";

test.use({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2560 / 1440 });

test("Sources and notices lists the record's credits and the font licences", async ({
  page,
  request,
}) => {
  await page.goto(`/stage?case=${sharedCase()}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Sources & Notices" }).click();
  const dialog = page.getByRole("dialog", { name: "Sources & Notices" });
  await expect(dialog).toBeVisible();
  // credits come from the case's DataBundle records, in their own wording
  await expect(dialog.getByText(/CHIRPS v3\.0, Climate Hazards Center/)).toBeVisible();
  await expect(
    dialog.getByText("Contains modified Copernicus Sentinel data 2019-2025"),
  ).toBeVisible();
  for (const name of [
    "IBM Plex Sans, SIL Open Font License 1.1",
    "IBM Plex Mono, SIL Open Font License 1.1",
  ]) {
    const href = await dialog.getByRole("link", { name }).getAttribute("href");
    expect(href).not.toBeNull();
    const res = await request.get(href ?? "");
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("SIL OPEN FONT LICENSE Version 1.1");
  }
  // the map software's BSD 3-Clause notices ship with the app
  for (const [name, text] of [
    ["MapLibre GL JS, BSD 3-Clause License", "Copyright (c) 2023, MapLibre contributors"],
    [
      "maplibre-contour, BSD 3-Clause License, with the licences of the code it includes",
      "Copyright (c) 2023, Michael Barry and maplibre-contour contributors",
    ],
  ] as const) {
    const href = await dialog.getByRole("link", { name }).getAttribute("href");
    const res = await request.get(href ?? "");
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain(text);
  }
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  if (process.env.NOTICES_OUT) await page.screenshot({ path: process.env.NOTICES_OUT });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("single-key shortcuts can be turned off, and the choice holds after a reload (WCAG 2.1.4)", async ({
  page,
}) => {
  await page.goto(`/stage?case=${sharedCase()}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  // the stage's view: "oblique" until F asks for the flat reading
  const stage = page.locator("[data-view]");
  const staysOblique = async () => {
    await page.waitForTimeout(400);
    await expect(stage).toHaveAttribute("data-view", "oblique");
  };
  const notices = page.getByRole("dialog", { name: "Sources & Notices" });
  const sw = notices.getByRole("switch", { name: "Single-Key Shortcuts" });

  await page.getByRole("button", { name: "Sources & Notices" }).click();
  await expect(sw).toBeChecked();
  if (process.env.NOTICES_KEYS_OUT) {
    await sw.scrollIntoViewIfNeeded();
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.screenshot({ path: process.env.NOTICES_KEYS_OUT });
  }
  await sw.uncheck();
  await page.keyboard.press("Escape");
  await expect(notices).toBeHidden();
  await page.keyboard.press("f");
  await staysOblique();
  // the hint is still a button, and pressing it again returns
  const hint = page.getByRole("button", { name: /Flat Map View/ });
  await hint.click();
  await expect(stage).not.toHaveAttribute("data-view", "oblique");
  await hint.click();
  await expect(stage).toHaveAttribute("data-view", "oblique", { timeout: 10_000 });

  await page.reload();
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("f");
  await staysOblique();
  await page.getByRole("button", { name: "Sources & Notices" }).click();
  await expect(sw).not.toBeChecked();
  await sw.check();
  await page.keyboard.press("Escape");
  await expect(notices).toBeHidden();
  await page.keyboard.press("f");
  await expect(stage).not.toHaveAttribute("data-view", "oblique");
});
