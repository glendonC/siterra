import { expect, test, type Page } from "@playwright/test";
import { sharedCase } from "./demo-case";

// The package's field check markers on the land (UI-2 package 1f; the lead, after "Founder instance smoke 4", where
// six checks on one anchor piled their names on one another). The case's synthetic package is crowded here, in the
// snapshot this page reads, with four SYNTHETIC checks on the first check's own place, as smoke 4's were: they stand as
// one marker carrying their numbers on every page (the card names the open check), and no label ever meets another
// or the card. Without a package in the case the test is skipped, never faked.

test.use({ viewport: { width: 1440, height: 900 } });

type Box = { x: number; y: number; width: number; height: number };
const meet = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function labelsApart(page: Page): Promise<void> {
  const boxes = // the labels, and the open step's card: no label may meet another, nor the card
    (
      await Promise.all(
        (await page.locator("[data-marker-label], [data-package-briefing] [data-card]").all()).map(
          (l) => l.boundingBox(),
        ),
      )
    ).filter((b): b is Box => b !== null);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a && b) expect(meet(a, b), `labels ${String(i)} and ${String(j)} overlap`).toBe(false);
    }
}

test("checks that share an anchor stand as one numbered marker; numbers only, the card names the open check; labels never overlap", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const caseId = sharedCase();
  const res = await page.request.get(`/api/cases/${encodeURIComponent(caseId)}`);
  test.skip(!res.ok(), "the case could not be read");
  const snap = (await res.json()) as {
    records: {
      briefRecords: {
        id: string;
        actionIds: string[];
        provenance: { generatedByTaskId: string | null };
      }[];
      taskRecords: { id: string; commandId: string }[];
    };
  };
  const brief = snap.records.briefRecords.at(-1);
  const commandId = snap.records.taskRecords.find(
    (t) => t.id === brief?.provenance.generatedByTaskId,
  )?.commandId;
  test.skip(!brief || !commandId, "the case holds no package (synthetic package not loaded)");
  const actionId = brief?.actionIds[0];

  // the snapshot this page reads, with four SYNTHETIC checks on the first check's place (smoke 4's shape)
  await page.route(`**/api/cases/${caseId}`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const r = await route.fetch();
    const s = (await r.json()) as {
      records: {
        operationalActionRecords: {
          id: string;
          fieldPlan: { measurements: Record<string, unknown>[] } | null;
        }[];
      };
    };
    for (const a of s.records.operationalActionRecords) {
      const first = a.fieldPlan?.measurements[0];
      if (a.id !== actionId || !a.fieldPlan || !first) continue;
      // copies of the first check on its own place; fieldCheckId is optional and is left out
      const { fieldCheckId: _link, ...bare } = first;
      for (let k = 1; k <= 4; k++)
        a.fieldPlan.measurements.push({
          ...bare,
          what: `SYNTHETIC crowded check ${String(k)} on the same place`,
        });
    }
    return route.fulfill({ response: r, json: s });
  });
  await page.route("**/api/cases/*/commands", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({ recordType: "Command", id: commandId, caseId }),
        })
      : route.continue(),
  );
  const completed = {
    recordType: "Event",
    schemaVersion: "1.19.0",
    id: "evt_e2e_markers_completed",
    caseId,
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "command.completed",
    commandId,
    taskId: null,
    caseRevision: 1,
    entityIds: [],
    message: "Completed.",
    dedupeKey: "e2e.markers.completed",
    resultStatus: "succeeded",
    tool: null,
    usage: null,
    validation: null,
    spanId: null,
    parentSpanId: null,
  };
  await page.route("**/api/cases/*/events*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `id: 1\ndata: ${JSON.stringify(completed)}\n\n`,
    }),
  );

  await page.goto(`/valley?case=${caseId}`);
  await expect(page.locator("[data-overview-root]")).toHaveAttribute("data-ready", "", {
    timeout: 90_000,
  });
  await page.keyboard.press("/");
  await page.keyboard.type("What should happen next?");
  await page.keyboard.press("Enter");
  await page.locator("[data-run-open-findings]").click();
  await expect(page.locator("[data-result]").first()).toBeFocused();
  await page.mouse.move(720, 120);
  await page.keyboard.press("Enter");
  const briefing = page.locator("[data-package-briefing][data-land]");
  await expect(briefing).toHaveAttribute("data-state", "in", { timeout: 10_000 });

  // arrival: the five checks on one place stand as one marker of numbers; no check's name
  const markers = briefing.locator("[data-marker]");
  await expect(markers).toHaveCount(1);
  await expect(markers.first()).toHaveAttribute("data-marker", "1 3 4 5 6");
  await expect(markers.first().locator("[data-marker-label]")).toHaveText("0103040506");
  await labelsApart(page);

  // every page: only the open check adds its name to its marker, and no two labels overlap
  for (let k = 0; k < 16; k++) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(120);
    await labelsApart(page);
    // numbers only on every page: the card names the open check
    await expect(markers.first().locator("[data-marker-label]")).toHaveText("0103040506");
  }
});
