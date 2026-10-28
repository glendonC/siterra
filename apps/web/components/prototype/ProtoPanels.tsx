"use client";

import { Fragment } from "react";
import { en } from "../../lib/copy/en";
import type { BriefText, Coverage, Flow } from "../../lib/prototype/flow";
import { protoCopy } from "../../lib/prototype/proto-copy";
import { PIXEL_TREND_SUMMARY, type StratumRecord } from "../../lib/prototype/restrend-data";
import { Cite } from "./Cite";
import styles from "./Story.module.css";

export function CoverageNote({ c }: { c: Coverage }) {
  return (
    <div className={styles.coverage}>
      <span className={styles.covBadge} data-badge={c.badge}>
        {c.badge === "required" ? en["flow.cov.required"].text : en["flow.cov.notLoaded"].text}
      </span>
      <span className={styles.covDetail}>{c.detail}</span>
    </div>
  );
}

export function StatusBadges() {
  return (
    <span className={styles.status}>
      <span>{en["flow.realData"].text}</span>
      <span>{en["flow.fieldUnverified"].text}</span>
    </span>
  );
}

export function RulersDock({
  strata,
  seasonYear,
}: {
  strata: readonly StratumRecord[];
  seasonYear: number;
}) {
  const bands = strata.filter((s) =>
    ["elevation_low", "elevation_mid", "elevation_high"].includes(s.id),
  );
  return (
    <aside className={styles.leftDock} aria-label={protoCopy.rulerPanelTitle}>
      <p className={styles.panelKey}>{protoCopy.rulerPanelTitle}</p>
      <span className={styles.rulerSub}>{protoCopy.rulerPanelSub}</span>
      {bands.map((b) => {
        const minN = Math.min(...b.seasons.map((s) => s.ndvi));
        const maxN = Math.max(...b.seasons.map((s) => s.ndvi));
        const span = Math.max(0.01, maxN - minN);
        const slopeStr = `+${b.unadjustedPerDecade.toFixed(4)} ${protoCopy.ndviLabel}${protoCopy.slopeLabel}`;
        return (
          <div key={b.id} className={styles.rulerCard}>
            <div className={styles.rulerTop}>
              <span>{b.name}</span>
              <span className={styles.rulerSlope}>{slopeStr}</span>
            </div>
            <span className={styles.rulerSub}>
              {b.elevationRange}
              {" · "}
              {b.modisPixels} {protoCopy.pixelsLabel}
              {" · "}
              {protoCopy.rSqLabel} {b.rSquared.toFixed(2)}
            </span>
            <svg className={styles.rulerSvg} viewBox="0 0 260 28" aria-hidden="true">
              <line
                x1="0"
                y1="14"
                x2="260"
                y2="14"
                stroke="currentColor"
                strokeOpacity="0.2"
                strokeDasharray="2 2"
              />
              {b.seasons.map((s, idx) => {
                const x = idx * 10 + 4;
                const h = Math.max(3, Math.round(((s.ndvi - minN) / span) * 22));
                const y = 26 - h;
                const isCur = s.year === seasonYear;
                return (
                  <rect
                    key={s.year}
                    x={x - 2.5}
                    y={y}
                    width={isCur ? 6 : 4.5}
                    height={h}
                    fill={
                      s.dryPulse
                        ? "var(--rain-dry)"
                        : isCur
                          ? "var(--ndvi-up-strong)"
                          : "var(--ndvi-up-mod)"
                    }
                    opacity={isCur ? 1 : 0.82}
                  />
                );
              })}
            </svg>
          </div>
        );
      })}
      <div className={styles.rulerCard}>
        <div className={styles.rulerTop}>
          <span>{protoCopy.pixelTrendHeader}</span>
        </div>
        <span className={styles.rulerSlope}>{PIXEL_TREND_SUMMARY.medianTheilSenPerDecade}</span>
        <span className={styles.rulerSub}>{protoCopy.pixelTrendFdr}</span>
        <span className={styles.rulerSub}>{protoCopy.pixelTrendClusters}</span>
      </div>
    </aside>
  );
}

export function PrecedentDock({ flow }: { flow: Flow }) {
  const restOpt = flow.options.find((o) => o.id === "rest");
  const meta = restOpt?.precedentMeta;
  return (
    <aside className={styles.leftDock} aria-label={protoCopy.precedentDrawerTitle}>
      <p className={styles.panelKey}>{protoCopy.precedentDrawerTitle}</p>
      <span className={styles.demoTag}>{meta?.badge ?? protoCopy.precedentRoleBadge}</span>
      <div className={styles.rulerCard}>
        <div className={styles.rulerTop}>
          <span>{meta?.study}</span>
        </div>
        <span className={styles.rulerSub}>{meta?.window}</span>
        <span className={styles.branchDetail}>{meta?.excerpt}</span>
      </div>
      <div className={styles.rulerCard}>
        <div className={styles.rulerTop}>
          <span>{protoCopy.precedentCompareLeft}</span>
        </div>
        <span className={styles.rulerSlope}>{protoCopy.precedentCompareRight}</span>
        <span className={styles.rulerSub}>{protoCopy.precedentCompareDiff}</span>
      </div>
      <CoverageNote c={flow.pastureCoverage} />
    </aside>
  );
}

export function ViewpointHud({ flow }: { flow: Flow }) {
  const unmapped = flow.groundChecks.filter((g) => !g.at);
  return (
    <>
      <div className={styles.compassBar} aria-hidden="true">
        <span>{protoCopy.compassN}</span>
        <span>{protoCopy.compassNE}</span>
        <span className={styles.compassActive}>{protoCopy.compassENE}</span>
        <span>{protoCopy.compassE}</span>
        <span>{protoCopy.compassSE}</span>
      </div>
      <aside className={styles.leftDock} aria-label={protoCopy.viewpointHudTitle}>
        <p className={styles.panelKey}>{protoCopy.viewpointHudTitle}</p>
        <span className={styles.rulerSub}>
          {protoCopy.viewpointAltTag}
          {" · "}
          {protoCopy.viewpointFovTag}
        </span>
        <span className={styles.demoTag}>{protoCopy.viewpointProposedTag}</span>
        {unmapped.map((u) => (
          <div key={u.id} className={styles.rulerCard}>
            <div className={styles.rulerTop}>
              <span>{u.label}</span>
              <span className={styles.covBadge}>{protoCopy.openRingBadge}</span>
            </div>
            <span className={styles.branchDetail}>{u.what}</span>
            <span className={styles.branchCheck}>{u.separates}</span>
          </div>
        ))}
      </aside>
      <div className={styles.wristInset} aria-hidden="true">
        <p className={styles.panelKey}>{protoCopy.wristMapLabel}</p>
        <svg viewBox="0 0 180 64" width="100%" height="54">
          <polygon
            points="14,38 52,14 148,10 168,32 132,54 44,56"
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth="1.2"
          />
          <polygon
            points="42,40 128,14 152,44"
            fill="var(--survey-light)"
            stroke="var(--accent)"
            strokeWidth="1.2"
          />
          <circle cx="42" cy="40" r="3.5" fill="var(--accent)" />
        </svg>
      </div>
    </>
  );
}

export function SplitOverlay({ mode }: { mode: 1 | 2 | 3 }) {
  const leftText =
    mode === 1
      ? protoCopy.splitLeftLabel1
      : mode === 2
        ? protoCopy.splitLeftLabel2
        : protoCopy.splitLeftLabel3;
  const rightText =
    mode === 1
      ? protoCopy.splitRightLabel1
      : mode === 2
        ? protoCopy.splitRightLabel2
        : protoCopy.splitRightLabel3;
  return (
    <>
      <div className={styles.splitLine} aria-hidden="true" />
      <div className={styles.splitBadgeLeft}>{leftText}</div>
      <div className={styles.splitBadgeRight}>{rightText}</div>
    </>
  );
}

export function BriefModal({
  brief,
  briefText,
  flow,
  onSelectLang,
  onClose,
}: {
  brief: "en" | "fr";
  briefText: BriefText;
  flow: Flow;
  onSelectLang: (l: "en" | "fr") => void;
  onClose: () => void;
}) {
  return (
    <div className={styles.briefScrim} role="dialog" aria-modal="true" aria-label={briefText.title}>
      <article className={styles.brief} lang={briefText.lang}>
        <header className={styles.briefBar}>
          <div className={styles.langs} role="radiogroup" aria-label={en["flow.lang"].text}>
            <button
              type="button"
              role="radio"
              aria-checked={brief === "en"}
              className={styles.lang}
              onClick={() => {
                onSelectLang("en");
              }}
            >
              {en["flow.lang.en"].text}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={brief === "fr"}
              className={styles.lang}
              onClick={() => {
                onSelectLang("fr");
              }}
            >
              {en["flow.lang.fr"].text}
            </button>
          </div>
          <button type="button" className={styles.secondary} onClick={onClose}>
            {en["flow.close"].text}
          </button>
        </header>
        <div className={styles.page} data-dir="2">
          <div className={styles.pageTags}>
            <StatusBadges />
            <span className={styles.demoTag}>{briefText.status}</span>
            <Cite ns={[1, 2, 3]} chips={flow.sources} down />
          </div>
          <h2 className={styles.pageTitle}>{briefText.title}</h2>
          <dl className={styles.pageMeta}>
            {briefText.meta.map((m) => (
              <Fragment key={m.key}>
                <dt>{m.key}</dt>
                <dd>{m.value}</dd>
              </Fragment>
            ))}
          </dl>
          <div className={styles.pageCols}>
            {briefText.sections.map((sec) => (
              <section key={sec.head} className={styles.pageSection}>
                <h3>{sec.head}</h3>
                <ul>
                  {sec.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <section className={styles.pageSources}>
            <h3>{en["flow.sources"].text}</h3>
            {briefText.sources.map((s) => (
              <p key={s}>{s}</p>
            ))}
          </section>
          <p className={styles.pageFooter}>{briefText.footer}</p>
        </div>
      </article>
    </div>
  );
}
