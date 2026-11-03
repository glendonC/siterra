"use client";

// The printable brief of a next-steps package (UI-2 unit 1, CMP-14 "exports light for print"): the same records as
// the "What to Do Next" card, in the daylight palette, laid out for paper. Every line carries its numbered sources,
// listed in full at the end; lines from the field plan name the plan as their origin. The replay or concept mode and
// every limitation print with it. The brief is read from the case record at /brief?case=&brief=; it sends nothing.

import type { CaseSnapshot } from "@siterra/contracts";
import { useEffect, useMemo, useState } from "react";
import { openCase } from "../../lib/case/load";
import { pformat, pkg, type PackageMessageId } from "../../lib/copy/package";
import { packageView, type PackageLine, type PackageView } from "../../lib/package/package";
import {
  reviewMessageOf,
  viewRecordedReview,
  type RecordedReviewDecision,
} from "../../lib/package/review";
import { viewerStorage } from "../../lib/shell/preferences";
import { Control } from "../controls/Control";
import styles from "./PackageBrief.module.css";

const t = (id: PackageMessageId) => pkg[id].text;

type Load =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; snapshot: CaseSnapshot; briefId: string };

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
  if (load.status === "loading") return <p className={styles.state}>{t("brief.loading")}</p>;
  if (load.status === "failed") return <p className={styles.state}>{t("brief.failed")}</p>;
  return <PackageBrief snapshot={load.snapshot} briefId={load.briefId} />;
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
  if (!view) return <p className={styles.state}>{t("brief.missing")}</p>;
  const effectiveStatus = decision
    ? decision.status === "approved"
      ? "prepared"
      : "draft"
    : view.status;
  return (
    <div className={styles.scroller}>
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
          <p className={styles.kicker}>{t("brief.kicker")}</p>
          <h1 className={styles.title}>{t("brief.title")}</h1>
          <p className={styles.subject}>{view.title}</p>
          <dl className={styles.meta}>
            <dt>{t("brief.question")}</dt>
            <dd>{snapshot.case.objective}</dd>
          </dl>
          <p className={styles.status}>
            <span className={styles.statusWord}>{t(`package.status.${effectiveStatus}`)}</span>
            {decision ? (
              <span data-brief-review-status="" data-brief-review-decision={decision.status}>
                {reviewMessageOf(decision.status)}
              </span>
            ) : null}
            {!decision && view.actionStatus ? (
              <span>{t(`package.action.${view.actionStatus}`)}</span>
            ) : null}
            <span>{pformat("package.revision", { n: view.preparedOn })}</span>
          </p>
          {decision?.note ? (
            <p className={styles.origin} data-brief-review-note="">
              {pformat("review.recordedNote", { note: decision.note })}
            </p>
          ) : null}
          <p className={styles.honest}>{t("package.nothingSent")}</p>
        </header>

        <div className={styles.twoUp}>
          <Section title={t("package.section.known")} lines={view.known} />
          <Section title={t("package.section.uncertain")} lines={view.uncertain} />
        </div>

        <section className={styles.section}>
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
            <table className={styles.table}>
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
                      {m.fieldCheck ? (
                        <span className={styles.sub}>
                          {pformat("package.fieldCheck", { label: m.fieldCheck.label })}
                        </span>
                      ) : null}
                      {m.answers.length > 0 ? (
                        <span className={styles.sub}>
                          {t("package.answers")}: {m.answers.join(" ")}
                        </span>
                      ) : null}
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
          ) : (
            <Lines lines={view.measureNext} />
          )}
          {view.measures.length > 0 ? (
            <p className={styles.honest}>{t("package.place.choose")}</p>
          ) : null}
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
              <p className={styles.origin}>{t("package.fromPlan")}</p>
              <ul className={styles.plain}>
                {view.beforeFieldWork.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        {view.responses.length > 0 ? (
          <section className={styles.section}>
            <h2 className={styles.h2}>{t("package.section.responses")}</h2>
            <p className={styles.honest}>{t("package.responses.note")}</p>
            <div className={styles.responses}>
              {view.responses.map((r, i) => (
                <div key={r.id} className={styles.response}>
                  <h3 className={styles.h3}>
                    <span className={styles.n}>{String.fromCharCode(65 + i)}</span> {r.title}
                  </h3>
                  <p className={styles.text}>
                    {r.description}
                    <Refs chips={r.chips} />
                    {r.chips.length === 0 ? (
                      <span className={styles.sub}>{pkg["steps.noSource"].text}</span>
                    ) : null}
                  </p>
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
            </div>
          </section>
        ) : null}

        {view.resources.length > 0 ? (
          <section className={styles.section}>
            <h2 className={styles.h2}>{t("package.section.resources")}</h2>
            <p className={styles.origin}>{t("package.fromPlan")}</p>
            <table className={styles.table}>
              <tbody>
                {view.resources.map((r) => (
                  <tr key={r.id}>
                    <td className={styles.kind}>{t(`package.kind.${r.kind}`)}</td>
                    <td>{r.label}</td>
                    <td className={styles.kind}>
                      {r.amount ?? t(`package.estimate.${r.estimate}`)}
                    </td>
                    <td className={styles.kind}>
                      {r.verificationNeeded.length > 0
                        ? pformat("package.toCheck", { what: r.verificationNeeded.join(" ") })
                        : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <div className={styles.twoUp}>
          <Section title={t("package.section.prepared")} lines={view.prepared} />
          <Section
            title={t("package.section.authorization")}
            note={t("package.authorization.note")}
            lines={view.authorization}
          />
        </div>

        <div className={styles.twoUp}>
          {view.involve.length > 0 ? (
            <Section title={t("package.section.involve")} lines={view.involve} />
          ) : null}
          <section className={styles.section}>
            {view.nextSteps.length > 0 ? (
              <>
                <h2 className={styles.h2}>{t("package.section.next")}</h2>
                <Lines lines={view.nextSteps} />
              </>
            ) : null}
            {view.reviews.length > 0 ? (
              <ul className={styles.reviews}>
                {view.reviews.map((r, i) => (
                  <li key={i}>
                    <span>{t(`package.role.${r.role}`)}</span>
                    <span className={styles.kind}>
                      {t(`package.review.${decision?.status ?? r.status}`)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {view.reviews.some((r) => !r.authorityEstablished) ? (
              <p className={styles.honest}>{t("package.authority")}</p>
            ) : null}
          </section>
        </div>

        {view.remainingConditions.length > 0 ? (
          <section className={styles.section}>
            <h2 className={styles.h2}>{t("package.conditions")}</h2>
            <ul className={styles.plain}>
              {view.remainingConditions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={styles.section}>
          <h2 className={styles.h2}>{t("package.sources")}</h2>
          <ol className={styles.sources}>
            {view.sources.map((s) => (
              <li key={s.n} value={s.n}>
                {s.note}
              </li>
            ))}
          </ol>
        </section>

        {view.limitations.length > 0 ? (
          <section className={styles.section}>
            <h2 className={styles.h2}>{t("package.limitations")}</h2>
            <ul className={styles.plain}>
              {view.limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className={styles.foot}>{t("brief.footer")}</footer>
      </article>
    </div>
  );
}

function Refs({ chips }: { chips: number[] }) {
  if (chips.length === 0) return null;
  return <sup className={styles.refs}>{chips.join(", ")}</sup>;
}

function Lines({ lines }: { lines: PackageLine[] }) {
  return (
    <ul className={styles.lines}>
      {lines.map((l, i) => (
        <li key={i}>
          <span className={styles.claim}>{t(`package.claim.${l.claimKind}`)}</span>
          <span className={styles.text}>
            {l.text}
            <Refs chips={l.chips} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, note, lines }: { title: string; note?: string; lines: PackageLine[] }) {
  if (lines.length === 0) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>{title}</h2>
      {note ? <p className={styles.origin}>{note}</p> : null}
      <Lines lines={lines} />
    </section>
  );
}

export type { PackageView };
