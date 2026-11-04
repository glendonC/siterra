import { expect, test, type Page } from "@playwright/test";
import { daylight } from "../lib/theme/daylight";

// The brand files beside the root layout (icon.svg, icon.png, apple-icon.png, manifest.ts,
// opengraph-image.png): the head names each one with its type and size, and each URL answers 200 with
// that type. The tab icon carries its dark-scheme ink; the manifest's icons answer too.
test.use({ storageState: { cookies: [], origins: [] } });

const ICONS = [
  {
    selector: 'link[rel="icon"][type="image/svg+xml"]',
    path: "/icon.svg",
    sizes: "any",
    type: "image/svg+xml",
  },
  {
    selector: 'link[rel="icon"][type="image/png"]',
    path: "/icon.png",
    sizes: "96x96",
    type: "image/png",
  },
  {
    selector: 'link[rel="apple-touch-icon"]',
    path: "/apple-icon.png",
    sizes: "180x180",
    type: "image/png",
  },
] as const;

/** The one head element matching the selector, and the value of one of its attributes. */
async function headAttribute(page: Page, selector: string, name: string): Promise<string> {
  const element = page.locator(`head ${selector}`);
  await expect(element).toHaveCount(1);
  return (await element.getAttribute(name)) ?? "";
}

test("the head links the tab icons, the home-screen icon, the manifest and the link-preview image", async ({
  page,
  request,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  for (const icon of ICONS) {
    const href = await headAttribute(page, icon.selector, "href");
    expect(new URL(href, page.url()).pathname).toBe(icon.path);
    expect(await headAttribute(page, icon.selector, "sizes")).toBe(icon.sizes);
    const res = await request.get(href);
    expect(res.status(), href).toBe(200);
    expect(res.headers()["content-type"], href).toBe(icon.type);
    if (icon.type === "image/svg+xml")
      expect(await res.text()).toContain("@media (prefers-color-scheme: dark)");
  }

  const manifestHref = await headAttribute(page, 'link[rel="manifest"]', "href");
  expect(manifestHref).toBe("/manifest.webmanifest");
  const manifestRes = await request.get(manifestHref);
  expect(manifestRes.status()).toBe(200);
  expect(manifestRes.headers()["content-type"]).toBe("application/manifest+json");
  const manifest = (await manifestRes.json()) as {
    name: string;
    background_color: string;
    theme_color: string;
    icons: { src: string; type: string }[];
  };
  expect(manifest.name).toBe("Siterra");
  expect(manifest.background_color).toBe(daylight.paper);
  expect(manifest.theme_color).toBe(daylight.paper);
  expect(manifest.icons.map((i) => i.src)).toEqual(ICONS.map((i) => i.path));
  for (const icon of manifest.icons) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"], icon.src).toBe(icon.type);
  }

  // the link preview names its image by an absolute URL, as a crawler needs; it is fetched here by its path
  const og = new URL(await headAttribute(page, 'meta[property="og:image"]', "content"));
  expect(og.pathname).toBe("/opengraph-image.png");
  expect(await headAttribute(page, 'meta[property="og:image:type"]', "content")).toBe("image/png");
  expect(await headAttribute(page, 'meta[property="og:image:width"]', "content")).toBe("1200");
  expect(await headAttribute(page, 'meta[property="og:image:height"]', "content")).toBe("630");
  const ogRes = await request.get(`${og.pathname}${og.search}`);
  expect(ogRes.status()).toBe(200);
  expect(ogRes.headers()["content-type"]).toBe("image/png");
});
