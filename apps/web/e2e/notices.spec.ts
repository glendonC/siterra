import { expect, test } from "@playwright/test";
import { sharedCase } from "./demo-case";

test.use({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2560 / 1440 });

test("Sources and notices lists the record's credits and the font licences", async ({
  page,
  request,
}) => {
  await page.goto(`/stage?case=${sharedCase()}`);
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Sources and notices" }).click();
  const dialog = page.getByRole("dialog", { name: "Sources and notices" });
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
  const readFlat = page.getByRole("dialog", { name: "Everything on screen, as text" });
  const notices = page.getByRole("dialog", { name: "Sources and notices" });
  const sw = notices.getByRole("switch", { name: "Single-key shortcuts" });

  await page.getByRole("button", { name: "Sources and notices" }).click();
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
  await expect(readFlat).toBeHidden();
  // the hint is still a button
  await page.getByRole("button", { name: /Read flat/ }).click();
  await expect(readFlat).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.locator("[data-arrival-settled=true]")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("f");
  await expect(readFlat).toBeHidden();
  await page.getByRole("button", { name: "Sources and notices" }).click();
  await expect(sw).not.toBeChecked();
  await sw.check();
  await page.keyboard.press("Escape");
  await expect(notices).toBeHidden();
  await page.keyboard.press("f");
  await expect(readFlat).toBeVisible();
});
