// SA-07 (code search part): the build holds no outbound email, messaging, payment or publishing
// integration. Three checks: no such package in any manifest or the lockfile, no such host or API in
// the source, and the only server-side module that opens an outbound connection is the Model API
// transport. The action contract part (externalExecutionEnabled false) is in case.test.ts.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoDir = fileURLToPath(new URL("../../../", import.meta.url));
const thisFile = fileURLToPath(import.meta.url);

/** Packages whose purpose is sending mail or messages, taking payment or publishing. */
const integrationPackages =
  /^(nodemailer|@sendgrid\/.+|twilio|stripe|@stripe\/.+|mailgun(\.js)?|postmark|resend|@slack\/.+|discord\.js|telegraf|node-telegram-bot-api|web-push|firebase-admin|@aws-sdk\/client-(ses|sesv2|sns|pinpoint)|@mailchimp\/.+|twitter-api-v2|@paypal\/.+)$/;

/** Hosts and calls of those services, and raw mail transport. */
const integrationText =
  /nodemailer|sendgrid|api\.twilio\.com|\bstripe\b|api\.mailgun|postmarkapp|api\.resend\.com|hooks\.slack\.com|slack\.com\/api|api\.telegram\.org|discord(app)?\.com\/api|\bsmtp\b|sendMail\(|graph\.facebook\.com|api\.twitter\.com|api\.x\.com|mailchimp|paypal\.com|fcm\.googleapis\.com/i;

/** Ways server code opens an outbound connection. */
const outboundCall =
  /from "openai"|from "undici"|from "node:https?"|from "node:net"|from "node:tls"|\bfetch\(|new WebSocket\(/;

/** Server-side modules allowed to open an outbound connection, and why. */
const allowedOutbound: Record<string, string> = {
  "packages/agent/src/model/model-api-transport.ts":
    "Meta Model API only (isModelApiUrl), and only once GATE-01 is recorded",
};

function walk(dir: string, keep: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path, keep));
    else if (keep(path)) out.push(path);
  }
  return out;
}

const sourceRoots = ["packages", "apps"].map((d) => join(repoDir, d));
const isSource = (path: string) => /\.(ts|tsx|mts|mjs|js)$/.test(path) && path !== thisFile;
const isTest = (path: string) => /\.(test|spec)\.tsx?$/.test(path) || path.includes("/e2e/");

describe("SA-07 (code search part): no outbound email, messaging, payment or publishing integration", () => {
  it("the patterns catch what they name, and pass ordinary code", () => {
    expect(integrationPackages.test("nodemailer")).toBe(true);
    expect(integrationPackages.test("@aws-sdk/client-ses")).toBe(true);
    expect(integrationPackages.test("@aws-sdk/client-s3")).toBe(false);
    expect(integrationText.test('fetch("https://hooks.slack.com/services/x")')).toBe(true);
    expect(integrationText.test("const striped = true")).toBe(false);
    expect(outboundCall.test('import OpenAI from "openai";')).toBe(true);
    expect(outboundCall.test('import { readFileSync } from "node:fs";')).toBe(false);
  });

  it("no manifest and no lockfile entry names an integration package", () => {
    const manifests = [
      join(repoDir, "package.json"),
      ...sourceRoots.flatMap((root) =>
        readdirSync(root).map((name) => join(root, name, "package.json")),
      ),
    ];
    const named = manifests.flatMap((path) => {
      const json = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      return ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]
        .flatMap((field) => Object.keys((json[field] ?? {}) as Record<string, string>))
        .filter((dep) => integrationPackages.test(dep))
        .map((dep) => `${relative(repoDir, path)}: ${dep}`);
    });
    const lockPackages = [
      ...readFileSync(join(repoDir, "pnpm-lock.yaml"), "utf8").matchAll(
        /^ {2}'?(@?[^@\s':]+(?:\/[^@\s':]+)?)@[^:]+'?:$/gm,
      ),
    ].map((m) => m[1] ?? "");
    expect(lockPackages.length).toBeGreaterThan(100);
    expect([...named, ...lockPackages.filter((p) => integrationPackages.test(p))]).toEqual([]);
  });

  it("no source file names an integration host or API", () => {
    const hits = sourceRoots
      .flatMap((root) => walk(root, isSource))
      .filter((path) => integrationText.test(readFileSync(path, "utf8")))
      .map((path) => relative(repoDir, path));
    expect(hits).toEqual([]);
  });

  it("only the Model API transport opens an outbound connection from server code", () => {
    const serverRoots = [
      join(repoDir, "packages"),
      join(repoDir, "apps/worker"),
      join(repoDir, "apps/web/app/api"),
    ];
    const callers = serverRoots
      .flatMap((root) => walk(root, (path) => isSource(path) && !isTest(path)))
      .filter((path) => outboundCall.test(readFileSync(path, "utf8")))
      .map((path) => relative(repoDir, path))
      .sort();
    expect(callers).toEqual(Object.keys(allowedOutbound).sort());
  });
});
