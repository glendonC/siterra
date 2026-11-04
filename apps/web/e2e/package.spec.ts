import { expect, test, type Page } from "@playwright/test";
import { en } from "../lib/copy/en";
import { pkg } from "../lib/copy/package";
import { rd } from "../lib/copy/readout";
import { findingWords, followUpOf, nextWords, reviewWords } from "../lib/readout/readout";
import { answerOf, atTheAnswer, crumbsOf, keyOf, loadedRecord, readoutOn } from "./answer";
import { sharedCase } from "./demo-case";

// The next-steps package (UI-2): its printable brief, and the parts of the answer that read it from the case record:
// Next (what each field check would tell apart), the reviews the plan asks for with the demo plan review, and E to
// export the brief. The answer reads the case record at the overview's home, and still after a question of the
// visitor's own, whose findings then head it as a Follow-up (here the command whose tasks committed the package, its
// acceptance and completion served to the page: no worker runs, no model is called, nothing leaves the machine).
// Until PLATFORM's P9 commits packages in the live question, a case holds one only where a lane loaded the synthetic
// package (lib/package/fixtures/synthetic.ts); without one these tests are skipped, never faked.

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
    pkg["brief.title"].text,
    pkg["package.section.known"].text,
    pkg["package.section.uncertain"].text,
    pkg["package.section.measure"].text,
    pkg["package.section.responses"].text,
    pkg["package.section.resources"].text,
    pkg["package.section.prepared"].text,
    pkg["package.section.authorization"].text,
    pkg["package.sources"].text,
    pkg["package.limitations"].text,
  ])
    expect(text, heading).toContain(heading);
  // one state, and that nothing has been sent, scheduled or authorized, said once where a reader meets it first
  const state = pkg["brief.state"].text.replace(
    "{state}",
    pkg["package.status.ready_for_review"].text,
  );
  expect(text).toContain(state);
  expect(text.split("Nothing has been sent").length - 1).toBe(1);
  expect(text).toContain(pkg["package.responses.note"].text);
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

const QUESTION = "What should happen next?";

interface CaseRecords {
  briefRecords: {
    id: string;
    createdAt: string;
    provenance: { generatedByTaskId: string | null };
  }[];
  taskRecords: { id: string; commandId: string }[];
  branchMergeRecords?: { createdAt: string }[];
  operationalActionRecords?: { createdAt: string; fieldPlan: unknown }[];
}

/**
 * The case's package as the record holds it: the latest brief and the command whose task committed it. Null when the
 * case holds no package (no brief, no committing command, no field plan or no merge).
 */
async function packageOf(page: Page, caseId: string) {
  const res = await page.request.get(`/api/cases/${encodeURIComponent(caseId)}`);
  if (!res.ok()) return null;
  const r = ((await res.json()) as { records: CaseRecords }).records;
  const latest = <T extends { createdAt: string }>(xs: readonly T[]) =>
    [...xs].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
  const brief = latest(r.briefRecords);
  const commandId = r.taskRecords.find(
    (t) => t.id === brief?.provenance.generatedByTaskId,
  )?.commandId;
  const plan = latest((r.operationalActionRecords ?? []).filter((a) => a.fieldPlan));
  const merge = latest(r.branchMergeRecords ?? []);
  if (!brief || !commandId || !plan || !merge) return null;
  return { briefId: brief.id, commandId };
}

/** Opens a case's answer at the overview's home; returns it with the readout the record should give. */
async function homeOf(page: Page, caseId: string) {
  const record = loadedRecord(page);
  const readout = await atTheAnswer(page, `/valley?case=${caseId}`);
  const { snapshot, listing } = await record;
  return { readout, snapshot, listing, model: answerOf(snapshot, listing) };
}

test("at home the answer reads the case's package: what each check would tell apart, the reviews it asks for; E exports the brief, Esc goes to the Landing", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const caseId = sharedCase();
  const pack = await packageOf(page, caseId);
  test.skip(!pack, "the case holds no package (P9 not run here, synthetic package not loaded)");
  if (!pack) return;
  const { readout, snapshot, model } = await homeOf(page, caseId);
  await expect(readout.locator("[data-run-question]")).toHaveText(snapshot.case.objective);
  // Next: the field plan's checks, each saying what only it would tell apart
  const ground = model.ground;
  if (!ground) throw new Error("the case's package holds no field plan the merge binds");
  await expect(readout.locator("[data-readout-group='ground'] [data-readout-check]")).toHaveText(
    ground.checks.map((c) => nextWords(c)),
  );
  // the reviews the record asks for, as one row under Needs You with the export's key
  const asked = reviewWords(ground.reviews);
  if (!asked) throw new Error("the case's package asks for no review");
  const review = readout.locator("[data-readout-review]");
  await expect(review).toHaveText(`${asked}${rd["readout.review.key"].text}`);
  await expect(readout).toContainText(en["run.tree.needsYou"].text);
  // the record holds a brief, so the key bar offers its export
  await expect(keyOf(page, "E")).toHaveText(`E${rd["readout.key.brief"].text}`);

  // E opens the case's own brief, and so does the review's row
  const brief = new RegExp(`/brief\\?case=${caseId}&brief=${pack.briefId}$`);
  const byKey = page.waitForEvent("popup");
  await page.keyboard.press("e");
  const exported = await byKey;
  await expect(exported).toHaveURL(brief);
  await exported.close();
  const byRow = page.waitForEvent("popup");
  await review.click();
  const opened = await byRow;
  await expect(opened).toHaveURL(brief);
  await opened.close();

  // Esc leaves the place for the Landing
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-opening]")).toBeVisible({ timeout: 60_000 });
});

test("after a question of the visitor's own, its steps take the screen, then its answer: the case's, headed by a Follow-up with the question and its findings", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const caseId = sharedCase();
  const pack = await packageOf(page, caseId);
  test.skip(!pack, "the case holds no package (P9 not run here, synthetic package not loaded)");
  if (!pack) return;
  // the question is answered by the command whose tasks committed the package: its acceptance, the completion call
  // and its completion event are served here, so the page reads the package from the case record
  await page.route("**/api/cases/*/commands", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({ recordType: "Command", id: pack.commandId, caseId }),
        })
      : route.continue(),
  );
  await page.route("**/api/cases/*/commands/*/complete", (route) =>
    route.fulfill({ status: 200, json: { status: "skipped" } }),
  );
  const completed = {
    recordType: "Event",
    schemaVersion: "1.19.0",
    id: "evt_e2e_package_completed",
    caseId,
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "command.completed",
    commandId: pack.commandId,
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
  const { snapshot, listing, model } = await homeOf(page, caseId);
  await page.keyboard.press("/");
  const input = page.locator("input[name='question']");
  await expect(input).toBeFocused();
  await page.keyboard.type(QUESTION);
  await page.keyboard.press("Enter");
  // the question's steps take the screen at once, under their own crumb
  await expect(page.locator("[data-at-work][data-run-layer]")).toBeVisible({ timeout: 20_000 });
  expect((await crumbsOf(page)).at(-1)).toBe(en["chrome.key.thinking"].text);
  // done, they hand over to the question's answer, which the address names
  const readout = readoutOn(page);
  await expect(readout).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`[?&]run=${pack.commandId}`));
  // the Follow-up: the question sent and its own findings, as plain sentences
  const followUp = readout.locator("[data-readout-request]");
  await expect(followUp.locator("dt")).toHaveText(rd["readout.request.head"].text);
  await expect(followUp).toContainText(QUESTION);
  const findings = answerOf(snapshot, listing, pack.commandId).request?.findings ?? [];
  const toggle = followUp.locator("[data-readout-request-toggle]");
  if (findings.length) {
    // the first findings, and when there are more, one row that shows them all and then fewer again
    const first = followUpOf(findings, false);
    const lines = followUp.locator("dd > p:not([class*='asked'])");
    await expect(lines).toHaveText(first.shown.map((f) => findingWords(f)));
    if (first.toggle) {
      await expect(toggle).toHaveText(first.toggle);
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
      const all = followUpOf(findings, true);
      await expect(lines).toHaveText(all.shown.map((f) => findingWords(f)));
      await expect(toggle).toHaveText(all.toggle ?? "");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await toggle.click();
      await expect(lines).toHaveText(first.shown.map((f) => findingWords(f)));
    } else await expect(toggle).toHaveCount(0);
  } else {
    await expect(followUp).toContainText(rd["readout.request.none"].text);
    await expect(toggle).toHaveCount(0);
  }
  // the rest is still the case's: its sentence, its package's checks and its review
  await expect(readout.locator("[data-readout-answer]")).toHaveText(model.answer.claim ?? "");
  await expect(readout.locator("[data-readout-group='ground'] [data-readout-check]")).toHaveText(
    (model.ground?.checks ?? []).map((c) => nextWords(c)),
  );
  await expect(readout.locator("[data-readout-review]")).toBeVisible();
});

test("the package stands in the answer's own column, on screen; Enter opens no other view and the crumb stays Findings", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const caseId = sharedCase();
  const pack = await packageOf(page, caseId);
  test.skip(!pack, "the case holds no package (P9 not run here, synthetic package not loaded)");
  if (!pack) return;
  const { readout } = await homeOf(page, caseId);
  // the checks and the review sit in the same column as the answer, under it
  const ground = readout.locator("[data-readout-group='ground']");
  const review = readout.locator("[data-readout-review]");
  await expect(ground).toBeVisible();
  await expect(review).toBeVisible();
  const [answerBox, groundBox] = await Promise.all([
    readout.locator("[data-readout-answer]").boundingBox(),
    ground.boundingBox(),
  ]);
  expect(answerBox && groundBox && groundBox.y > answerBox.y).toBe(true);
  expect(answerBox && groundBox && Math.abs(groundBox.x - answerBox.x) <= 12).toBe(true);
  // Enter opens no plan view: the answer and its crumb stay
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1_500);
  expect((await crumbsOf(page)).at(-1)).toBe(en["overview.crumb.results"].text);
  await expect(ground).toBeVisible();
  // still on screen: neither the review nor anything above it is faded out (the list names any that is)
  const faded = () =>
    review.evaluate((el) => {
      const out: string[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const o = Number(getComputedStyle(e).opacity);
        if (o < 0.9)
          out.push(
            `<${e.tagName.toLowerCase()} class="${e.getAttribute("class") ?? ""}"> at ${String(o)}`,
          );
      }
      return out;
    });
  await expect.poll(faded, { timeout: 5_000 }).toEqual([]);
  const box = await review.boundingBox();
  expect(box && box.y + box.height <= 900 && box.x >= 0).toBe(true);
});
