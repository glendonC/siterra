import { expect, test, type Page } from "@playwright/test";
import { sharedCase } from "./demo-case";

// The next-steps package (UI-2 unit 1): the "What to Do Next" card and its printable brief, read from the case
// record. Until PLATFORM's P9 commits packages in the live question, a case holds one only where a lane loaded the
// synthetic package (lib/package/fixtures/synthetic.ts); without one these tests are skipped, never faked.

test.use({ viewport: { width: 1440, height: 900 } });

async function briefOf(page: Page, caseId: string): Promise<string | null> {
  const res = await page.request.get(`/api/cases/${encodeURIComponent(caseId)}`);
  if (!res.ok()) return null;
  const snap = (await res.json()) as { records: { briefRecords: { id: string }[] } };
  return snap.records.briefRecords.at(-1)?.id ?? null;
}

test("the printable brief holds every part, its sources and limits, in the daylight palette", async ({
  page,
}) => {
  const caseId = sharedCase();
  const briefId = await briefOf(page, caseId);
  test.skip(
    briefId === null,
    "the case holds no package (P9 not landed, synthetic package not loaded)",
  );
  await page.goto(`/brief?case=${caseId}&brief=${briefId ?? ""}`);
  const brief = page.locator("[data-brief]");
  await expect(brief).toHaveAttribute("data-ready", "", { timeout: 60_000 });
  const text = await brief.innerText();
  for (const heading of [
    "Your Plan",
    "Known",
    "Uncertain",
    "Measure Next",
    "Candidate Responses",
    "Resources",
    "Siterra Prepared",
    "Needs Authorization",
    "Sources",
    "Package Limits",
  ])
    expect(text, heading).toContain(heading);
  expect(text).toContain("Nothing has been sent, scheduled or authorized.");
  expect(text).toContain("None is ranked or recommended.");
  // no record id reaches the page
  expect(text).not.toMatch(/\b(?:ev|src|int|res|act|brief|rev|task|bundle)_[A-Za-z0-9]/);
  // the daylight ground, not obsidian: the page's ground is the daylight paper token
  const daylight = await page
    .locator("main > div")
    .first()
    .evaluate((el) => {
      const probe = document.createElement("div");
      probe.style.background = "var(--paper)";
      document.body.append(probe);
      const same = getComputedStyle(probe).backgroundColor === getComputedStyle(el).backgroundColor;
      probe.remove();
      return same;
    });
  expect(daylight).toBe(true);
});

/** Words the briefing shows outside the global chrome and the action prompts (decision 16a). */
async function briefingWords(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.querySelector("[data-package-briefing]");
    if (!root) return 0;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n = 0;
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      const el = t.parentElement;
      if (!el || el.closest("[data-action-prompt], [data-chrome]")) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      n += ((t.textContent ?? "").trim().match(/\S+/g) ?? []).length;
    }
    return n;
  });
}

/** Words the Verdict scorecard shows at rest outside chrome and the focused cause's opened detail (decision 16). */
async function verdictWords(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.querySelector("[data-record='results']");
    if (!root) return 0;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n = 0;
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      const el = t.parentElement;
      if (!el || el.closest("[data-action-prompt], [data-chrome], [data-verdict-detail]")) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      n += ((t.textContent ?? "").trim().match(/\S+/g) ?? []).length;
    }
    return n;
  });
}

test("the briefing arrives with one headline, steps through five cards by key, and leaves on Esc", async ({
  page,
}) => {
  test.skip(
    process.env.SITERRA_WEB_SERVER === "production",
    "the harness page is development only",
  );
  const caseId = sharedCase();
  const briefId = await briefOf(page, caseId);
  test.skip(
    briefId === null,
    "the case holds no package (P9 not landed, synthetic package not loaded)",
  );
  await page.goto(`/brief/preview?case=${caseId}`);
  await expect(page.locator("[data-ready]")).toBeAttached({ timeout: 60_000 });
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.keyboard.press("Enter");
  const briefing = page.locator("[data-package-briefing]");
  await expect(briefing).toHaveAttribute("data-state", "in");
  // the arrival: one headline, no card, within the text budget
  await expect(briefing).toHaveAttribute("data-step", "arrival");
  await expect(briefing.getByRole("heading", { level: 2 })).toHaveText(/^Your plan: /);
  await expect(briefing).toContainText("Nothing sent or authorized.");
  await expect(briefing.locator("[data-card]")).toHaveCount(0);
  expect(await briefingWords(page)).toBeLessThanOrEqual(40);
  // Space steps through the cards in order, one at a time, each a title and at most three lines
  const seen: string[] = [];
  for (let k = 0; k < 12; k++) {
    await page.keyboard.press("Space");
    const card = briefing.locator("[data-card]");
    await expect(card).toHaveCount(1);
    const id = (await card.getAttribute("data-card")) ?? "";
    if (seen.at(-1) !== id) seen.push(id);
    expect(await card.locator("li").count()).toBeLessThanOrEqual(3);
    expect(await briefingWords(page), `step ${id}`).toBeLessThanOrEqual(40);
  }
  expect(seen).toEqual(["known", "open", "checks", "responses", "approve"]);
  // on the final approval step, Next [Space] is hidden and interactive review actions record the review decision
  await expect(briefing.locator("[data-step-next]")).toHaveCount(0);
  await expect(briefing.locator("[data-needs-you]")).toHaveText("Needs you");
  await expect(briefing.locator("[data-review-approve]")).toHaveText("Approve the PlanEnter");
  await expect(briefing.locator("[data-review-ask-changes]")).toHaveText("Ask for ChangesA");
  await page.keyboard.press("Enter");
  await expect(briefing.locator("[data-review-badge='approved']")).toHaveText("Prepared");
  await expect(briefing.locator("[data-review-recorded='approved']")).toHaveText(
    "Plan approved (recorded on this case; nothing is sent externally)",
  );
  expect(await briefingWords(page)).toBeLessThanOrEqual(40);
  // asking for changes opens the optional reviewer note and records changes_requested
  await page.keyboard.press("a");
  await expect(briefing.locator("[data-review-recorded='changes_requested']")).toHaveText(
    "Changes requested (recorded on this case; nothing is sent externally)",
  );
  await briefing.locator("[data-review-note]").fill("Check upper pasture dates first");
  await briefing.locator("[data-review-record-changes]").click();
  await expect(briefing.locator("[data-review-note-shown]")).toContainText(
    "Check upper pasture dates first",
  );
  // pointing at a line offers its source beside it (decision 15)
  await briefing.locator("[data-card] li").first().hover();
  await expect(page.locator("[data-action-prompt]").getByRole("button").first()).toHaveText(
    "Read the SourceEnter",
  );
  // the arrow key goes back a page at a time, all the way to the arrival; Esc leaves
  await page.mouse.move(10, 10);
  for (let k = 0; k < 20; k++) await page.keyboard.press("ArrowLeft");
  await expect(briefing).toHaveAttribute("data-step", "arrival");
  await page.keyboard.press("Escape");
  await expect(briefing).toHaveCount(0);
});

test("from a question's results, Your Plan opens the package on the land, and Esc returns", async ({
  page,
}) => {
  test.setTimeout(180_000);
  // the case's package and the command whose tasks committed it, from the record
  const caseId = sharedCase();
  const res = await page.request.get(`/api/cases/${encodeURIComponent(caseId)}`);
  test.skip(!res.ok(), "the case could not be read");
  const snap = (await res.json()) as {
    records: {
      briefRecords: { id: string; provenance: { generatedByTaskId: string | null } }[];
      taskRecords: { id: string; commandId: string }[];
    };
  };
  const brief = snap.records.briefRecords.at(-1);
  const commandId = snap.records.taskRecords.find(
    (t) => t.id === brief?.provenance.generatedByTaskId,
  )?.commandId;
  test.skip(
    !commandId,
    "the case holds no package (P9 not run here, synthetic package not loaded)",
  );
  // the question is answered by that command, and its completion arrives on the event stream: no worker runs, no
  // model is called; the page reads the package from the record
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
    id: "evt_e2e_package_completed",
    caseId,
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "command.completed",
    commandId,
    taskId: null,
    caseRevision: 1,
    entityIds: [],
    message: "Completed.",
    dedupeKey: "e2e.package.completed",
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
  const root = page.locator("[data-overview-root]");
  await expect(root).toHaveAttribute("data-ready", "", { timeout: 90_000 });
  await page.keyboard.press("/");
  await page.keyboard.type("What should happen next?");
  await page.keyboard.press("Enter");
  // the run takes the arc (U29); once it is done its question card opens the findings
  await page.locator("[data-run-open-findings]").click();
  // Scene 6 Verdict shows all 5 tested causes with plain status, and expands only the focused cause at a time
  await expect(page.locator("[data-verdict-cause]")).toHaveCount(5);
  await expect(page.locator("[data-verdict-detail]")).toHaveCount(1);
  await expect(page.locator("[data-verdict-reason]")).toHaveCount(1);
  await expect(page.locator("[data-verdict-prediction]")).toHaveCount(1);
  expect(await verdictWords(page)).toBeLessThanOrEqual(40);
  // the card takes the focus once it is drawn; ArrowDown steps through causes, and Enter opens Your Plan
  await expect(page.locator("[data-result]").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("[data-verdict-reason]")).toContainText(
    "orchard history needs a field check.",
  );
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  // the results offer the package as their Enter
  const open = page.locator("[data-open-package]");
  await expect(open).toHaveText("Your PlanEnter");
  await page.mouse.move(720, 120);
  await page.keyboard.press("Enter");
  const briefing = page.locator("[data-package-briefing][data-land]");
  await expect(briefing).toHaveAttribute("data-state", "in", { timeout: 10_000 });
  await expect(page.getByRole("navigation").getByText("Your Plan")).toBeVisible();
  // the arrival: the headline and the markers on their bands, nothing else
  await expect(briefing).toHaveAttribute("data-step", "arrival");
  await expect(briefing.getByRole("heading", { level: 2 })).toHaveText(/^Your plan: /);
  // Space opens the first card beside the land
  await page.keyboard.press("Space");
  await expect(briefing.locator("[data-card='known']")).toBeVisible();
  // step to the final approval card, approve the plan, and verify the exported brief reflects it
  await briefing.getByRole("button", { name: "Who Must Approve" }).click();
  await expect(briefing.locator("[data-card='approve']")).toBeVisible();
  await expect(briefing.locator("[data-step-next]")).toHaveCount(0);
  await briefing.locator("[data-review-approve]").click();
  await expect(briefing.locator("[data-review-recorded='approved']")).toHaveText(
    "Plan approved (recorded on this case; nothing is sent externally)",
  );
  // the overview's legend carries the brief's export while the package is open, and E opens it
  await expect(page.getByText("Export Brief")).toBeVisible();
  const popup = page.waitForEvent("popup");
  await page.keyboard.press("e");
  const exported = await popup;
  await expect(exported).toHaveURL(/\/brief\?case=.*&brief=/);
  await expect(exported.locator("[data-brief-review-status]")).toHaveText(
    "Plan approved (recorded on this case; nothing is sent externally)",
  );
  await expect(exported.locator("[data-brief]")).not.toContainText("Awaiting Review");
  await exported.close();
  // Esc returns to the overview at rest
  await page.keyboard.press("Escape");
  await expect(briefing).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator("[data-case-question]")).toBeVisible();
});
