"use client";

// The printable brief of a question's plan (UI-2 unit 1, CMP-14): the records of the plan the answer reads, laid out
// as a document. On screen it follows the app's theme (lib/theme/instruments.ts, the views' rule); on paper it is
// always daylight. Its head says once that nothing has been sent, scheduled or authorized. A line names its kind only
// where that changes how it reads (a hypothesis, a scenario), in the answer column's words, and carries its numbered
// sources, listed with their links at the end. Read from the case record at /brief?case=&brief=; it sends nothing.

import type { CaseSnapshot } from "@siterra/contracts";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { openCase } from "../../lib/case/load";
import { pformat, pkg, type PackageMessageId } from "../../lib/copy/package";
import {
  packageView,
  type PackageLine,
  type PackageResource,
  type PackageView,
} from "../../lib/package/package";
import {
  reviewMessageOf,
  viewRecordedReview,
  type RecordedReviewDecision,
} from "../../lib/package/review";
import { viewerStorage } from "../../lib/shell/preferences";
import { savedTheme, THEME_KEY, type AppTheme } from "../../lib/theme/instruments";
import { Control } from "../controls/Control";
import styles from "./PackageBrief.module.css";

const t = (id: PackageMessageId) => pkg[id].text;

type Load =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; snapshot: CaseSnapshot; briefId: string };

/** The app's theme, as the visitor last chose it on the answer (in this tab or another), before the first paint. */
function useAppTheme(): AppTheme {
  const [theme, setTheme] = useState<AppTheme>("light");
  useLayoutEffect(() => {
    const sync = () => {
      setTheme(savedTheme());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === THEME_KEY) sync();
    };
    sync();
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return theme;
}

/**
 * The brief's ground. The scroller holds the daylight tokens, which paper keeps (PackageBrief.module.css); the page
 * inside it takes the app's theme on screen.
 */
function Ground({ children }: { children: ReactNode }) {
  const theme = useAppTheme();
  return (
    <div className={styles.scroller} data-theme="light" data-brief-scroll="">
      <div className={styles.ground} data-theme={theme}>
        {children}
      </div>
    </div>
  );
}

export function PackageBriefPage() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const caseId = q.get("case") ?? undefined;
    const briefId = q.get("brief") ?? "";
    let live = true;
    openCase(caseId, (input, init) => fetch(input, init), viewerStorage(), Date.now())
      .then((r) => {
        if (!live) return;
        setLoad(
          r.status === "ready"
            ? { status: "ready", snapshot: r.snapshot, briefId }
            : { status: "failed" },
        );
      })
      .catch(() => {
        if (live) setLoad({ status: "failed" });
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <Ground>
      {load.status === "ready" ? (
        <PackageBrief snapshot={load.snapshot} briefId={load.briefId} />
      ) : (
        <p className={styles.waiting}>
          {t(load.status === "loading" ? "brief.loading" : "brief.failed")}
        </p>
      )}
    </Ground>
  );
}

export function PackageBrief({ snapshot, briefId }: { snapshot: CaseSnapshot; briefId: string }) {
  const view = useMemo(() => packageView(snapshot, briefId), [snapshot, briefId]);
  const [decision, setDecision] = useState<RecordedReviewDecision | null>(null);
  useEffect(() => {
    if (!view) return;
    const sync = () => {
      setDecision(viewRecordedReview(snapshot.case.id, view));
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("siterra:review-decision", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("siterra:review-decision", sync);
    };
  }, [snapshot.case.id, view]);
  if (!view) return <p className={styles.waiting}>{t("brief.missing")}</p>;
  // one state: a recorded review decision, else the brief's own
  const state = decision ? reviewMessageOf(decision.status) : t(`package.status.${view.status}`);
  const [beforeState = "", afterState = ""] = t("brief.state").split("{state}");
  const place = snapshot.case.place?.name ?? null;
  return (
    <article className={styles.page} data-brief={view.briefId} data-ready="">
      <div className={styles.tools}>
        <Control
          variant="primary"
          onClick={() => {
            window.print();
          }}
        >
          {t("brief.print")}
        </Control>
      </div>

      <header className={styles.head}>
        {place ? <p className={styles.kicker}>{place}</p> : null}
        <h1 className={styles.title}>{t("brief.title")}</h1>
        <p className={styles.subject}>{view.title}</p>
        <dl className={styles.pairs}>
          <dt>{t("brief.question")}</dt>
          <dd>{snapshot.case.objective}</dd>
        </dl>
        <p className={styles.standing}>
          {beforeState}
          <span
            className={styles.stateWord}
            data-brief-review-status=""
            {...(decision ? { "data-brief-review-decision": decision.status } : {})}
          >
            {state}
          </span>
          {afterState}
        </p>
        {decision?.note ? (
          <p className={styles.note} data-brief-review-note="">
            {pformat("review.recordedNote", { note: decision.note })}
          </p>
        ) : null}
      </header>

      {view.known.length + view.uncertain.length > 0 ? (
        <div className={styles.twoUp}>
          <Part title={t("package.section.known")} lines={view.known} />
          <Part title={t("package.section.uncertain")} lines={view.uncertain} />
        </div>
      ) : null}

      <MeasureNext view={view} />

      {view.responses.length > 0 ? (
        <section className={styles.part}>
          <h2 className={styles.h2}>{t("package.section.responses")}</h2>
          <p className={styles.note}>{t("package.responses.note")}</p>
          {view.responses.map((r, i) => (
            <div key={r.id} className={styles.response}>
              <h3 className={styles.h3}>
                <span className={styles.n}>{String.fromCharCode(65 + i)}</span>
                {r.title}
              </h3>
              <p className={styles.text}>
                {r.description}
                <Refs chips={r.chips} />
              </p>
              {r.chips.length === 0 ? <p className={styles.note}>{t("steps.noSource")}</p> : null}
              <dl className={styles.pairs}>
                {(
                  [
                    ["package.assumes", r.assumptions],
                    ["package.checkFirst", r.checkFirst],
                    ["package.livelihood", r.livelihood],
                    ["package.ecology", r.ecology],
                  ] as const
                ).map(([k, v]) =>
                  v.length > 0 ? (
                    <div key={k} className={styles.pair}>
                      <dt>{t(k)}</dt>
                      <dd>{v.join(" ")}</dd>
                    </div>
                  ) : null,
                )}
                {r.reviewRoles.length > 0 ? (
                  <div className={styles.pair}>
                    <dt>{t("package.reviewedBy")}</dt>
                    <dd>{r.reviewRoles.map((x) => t(`package.role.${x}`)).join(", ")}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ))}
        </section>
      ) : null}

      <Resources resources={view.resources} />

      {view.prepared.length + view.authorization.length > 0 ? (
        <div className={styles.twoUp}>
          <Part title={t("package.section.prepared")} lines={view.prepared} />
          <Part title={t("package.section.authorization")} lines={view.authorization} />
        </div>
      ) : null}

      {view.involve.length + view.nextSteps.length + view.reviews.length > 0 ? (
        <div className={styles.twoUp}>
          <Part title={t("package.section.involve")} lines={view.involve} />
          <WhatNext view={view} />
        </div>
      ) : null}

      <Plain title={t("package.conditions")} lines={view.remainingConditions} />

      {view.sources.length > 0 ? (
        <section className={styles.part}>
          <h2 className={styles.h2}>{t("package.sources")}</h2>
          <ol className={styles.sources}>
            {view.sources.map((s) => (
              <li key={s.n} value={s.n}>
                {s.href ? (
                  <a
                    className={styles.link}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {s.title}
                  </a>
                ) : (
                  <span>{s.title}</span>
                )}
                {s.detail.length > 0 ? (
                  <span className={styles.detail}>{s.detail.join(", ")}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <Plain title={t("package.limitations")} lines={view.limitations} />
    </article>
  );
}

/** The field plan: its objective, each measurement with where, when, how and who, and what comes before it. */
function MeasureNext({ view }: { view: PackageView }) {
  const empty =
    !view.objective &&
    view.measures.length === 0 &&
    view.measureNext.length === 0 &&
    view.deferred.length === 0 &&
    view.beforeFieldWork.length === 0;
  if (empty) return null;
  return (
    <section className={styles.part}>
      <h2 className={styles.h2}>{t("package.section.measure")}</h2>
      {view.objective ? (
        <dl className={styles.pairs}>
          <dt>{t("package.objective")}</dt>
          <dd>{view.objective}</dd>
          {view.decisionInformed ? (
            <>
              <dt>{t("package.decision")}</dt>
              <dd>{view.decisionInformed}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
      {view.measures.length > 0 ? (
        <>
          <table className={`${styles.table} ${styles.plan}`}>
            <thead>
              <tr>
                <th />
                <th>{t("package.what")}</th>
                <th>{t("package.where")}</th>
                <th>{t("package.when")}</th>
                <th>{t("package.how")}</th>
                <th>{t("package.who")}</th>
              </tr>
            </thead>
            <tbody>
              {view.measures.map((m, i) => (
                <tr key={i}>
                  <td className={styles.n}>{String(i + 1).padStart(2, "0")}</td>
                  <td>
                    {m.what}
                    <Refs chips={m.chips} />
                  </td>
                  <td>
                    {m.places.map((p) => (
                      <span key={p.key} className={styles.place}>
                        {p.label}
                        <span className={styles.sub}>{p.definition}</span>
                      </span>
                    ))}
                  </td>
                  <td>{m.season}</td>
                  <td>{m.method}</td>
                  <td>{m.fieldRole}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.note}>{t("package.place.choose")}</p>
        </>
      ) : (
        <Lines lines={view.measureNext} />
      )}
      {view.deferred.length > 0 ? (
        <>
          <h3 className={styles.h3}>{t("package.deferred")}</h3>
          <ul className={styles.plain}>
            {view.deferred.map((d, i) => (
              <li key={i}>{d.gap ? `${d.gap} ${d.reason}` : d.reason}</li>
            ))}
          </ul>
        </>
      ) : null}
      {view.beforeFieldWork.length > 0 ? (
        <>
          <h3 className={styles.h3}>{t("package.permissions")}</h3>
          <ul className={styles.plain}>
            {view.beforeFieldWork.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

/**
 * What the checks would need, by kind. How much of each, and what is still to check, are said once under the list
 * when every resource shares them, else on each.
 */
function Resources({ resources }: { resources: PackageResource[] }) {
  const first = resources[0];
  if (!first) return null;
  const amountOf = (r: PackageResource) => r.amount ?? t(`package.amount.${r.estimate}`);
  const checkOf = (r: PackageResource) => r.verificationNeeded.join(" ");
  const shared = (f: (r: PackageResource) => string) => {
    const v = f(first);
    return resources.every((r) => f(r) === v) ? v : null;
  };
  const amount = shared(amountOf);
  const check = shared(checkOf);
  return (
    <section className={styles.part}>
      <h2 className={styles.h2}>{t("package.section.resources")}</h2>
      <table className={`${styles.table} ${styles.list}`}>
        <tbody>
          {resources.map((r) => (
            <tr key={r.id}>
              <td className={styles.kind}>{t(`package.kind.${r.kind}`)}</td>
              <td>
                {r.label}
                {amount === null ? <span className={styles.sub}>{amountOf(r)}</span> : null}
                {check === null && checkOf(r) !== "" ? (
                  <span className={styles.sub}>{checkOf(r)}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {amount !== null || (check !== null && check !== "") ? (
        <dl className={styles.pairs}>
          {amount !== null ? (
            <>
              <dt>{t("package.amount")}</dt>
              <dd>{amount}</dd>
            </>
          ) : null}
          {check !== null && check !== "" ? (
            <>
              <dt>{t("package.toCheck")}</dt>
              <dd>{check}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}

/**
 * What happens next, and the reviews the plan asks for, each role as its record holds it, one line for each state.
 * A demo decision is the case's own program review (packages/db/src/reviews.ts), never another role's; the head
 * says it.
 */
function WhatNext({ view }: { view: PackageView }) {
  const states = new Map<string, string[]>();
  for (const r of view.reviews) {
    const state = t(`package.review.${r.status}`);
    states.set(state, [...(states.get(state) ?? []), t(`package.role.${r.role}`)]);
  }
  const unestablished = view.reviews.some((r) => !r.authorityEstablished);
  if (view.nextSteps.length === 0 && states.size === 0) return null;
  return (
    <section className={styles.column}>
      <h2 className={styles.h2}>{t("package.section.next")}</h2>
      <Lines lines={view.nextSteps} />
      {states.size > 0 ? (
        <ul className={styles.plain}>
          {[...states].map(([state, roles]) => (
            <li key={state}>{pformat("package.reviews", { state, roles: roles.join(", ") })}</li>
          ))}
        </ul>
      ) : null}
      {unestablished ? <p className={styles.note}>{t("package.authority")}</p> : null}
    </section>
  );
}

function Refs({ chips }: { chips: number[] }) {
  if (chips.length === 0) return null;
  return <sup className={styles.refs}>{chips.join(",")}</sup>;
}

/** A line as it reads: a hypothesis or a scenario says so first, as the answer column says it; any other, as is. */
function lineText(l: PackageLine): string {
  return l.claimKind === "hypothesis"
    ? pformat("package.claim.hypothesis", { text: l.text })
    : l.claimKind === "scenario"
      ? pformat("package.claim.scenario", { text: l.text })
      : l.text;
}

function Lines({ lines }: { lines: PackageLine[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className={styles.lines}>
      {lines.map((l, i) => (
        <li key={i}>
          {lineText(l)}
          <Refs chips={l.chips} />
        </li>
      ))}
    </ul>
  );
}

/** One column of a two-column part: its heading and its lines, or nothing when it has none. */
function Part({ title, lines }: { title: string; lines: PackageLine[] }) {
  if (lines.length === 0) return null;
  return (
    <section className={styles.column}>
      <h2 className={styles.h2}>{title}</h2>
      <Lines lines={lines} />
    </section>
  );
}

/** A part of record sentences with no sources of their own, or nothing when it has none. */
function Plain({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <section className={styles.part}>
      <h2 className={styles.h2}>{title}</h2>
      <ul className={styles.plain}>
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </section>
  );
}
