"use client";

// CMP-23 ExplanationBranches: renders ExplanationBranch and BranchMerge records with their pre-registered
// commit revision ("Predictions Locked · Rev N"), geometric certainty indicators (dashed before scoring,
// solid for met/consistent, cut for not met/contradicted, open ring for untestable/cannot be assessed),
// and the minimum field verification cover from BranchMerge.fieldPlan (DF-07, DF-08, DF-09).

import { en } from "../../lib/copy/en";
import type { ProjectedBranches } from "../../lib/projection/branches";
import styles from "./ExplanationBranches.module.css";

export interface ExplanationBranchesProps {
  branches: ProjectedBranches;
  selectedBranchId?: string | null;
  onSelectBranch?: (branchId: string) => void;
}

export function ExplanationBranches({
  branches,
  selectedBranchId,
  onSelectBranch,
}: ExplanationBranchesProps) {
  const hasFieldPlan = branches.fieldChecks.length > 0 || Boolean(branches.unseparatedText);
  return (
    <div
      className={styles.root}
      data-explanation-branches
      data-record-ids={branches.recordIds.join(" ")}
    >
      <div className={styles.header}>
        <h3 className={styles.heading}>{en["branches.heading"].text}</h3>
        <div className={styles.badges}>
          <span className={styles.badge} data-branches-locked>
            {branches.lockedBadge}
          </span>
          {branches.rulesVersion ? (
            <span className={styles.badge}>{branches.rulesVersion}</span>
          ) : null}
        </div>
      </div>
      <ol className={styles.list}>
        {branches.branches.map((b) => {
          const selected = selectedBranchId === b.branchId;
          return (
            <li
              key={b.branchId}
              className={styles.branch}
              data-branch-id={b.branchId}
              data-branch-status={b.status}
              data-certainty-mark={b.mark}
              data-selected={selected ? "true" : "false"}
              data-record-ids={b.branchId}
            >
              <button
                type="button"
                className={styles.branchButton}
                onClick={() => {
                  onSelectBranch?.(b.branchId);
                }}
              >
                <span className={styles.mark} data-mark={b.mark} aria-hidden="true" />
                <span className={styles.branchLabel}>{b.label}</span>
                <span className={styles.branchStatus}>{b.statusLabel}</span>
              </button>
              <p className={styles.reason}>{b.reason}</p>
              {b.predictions.length > 0 ? (
                <ul className={styles.predictions}>
                  {b.predictions.map((p) => (
                    <li
                      key={p.key}
                      className={styles.prediction}
                      data-prediction-key={p.key}
                      data-certainty-mark={p.mark}
                    >
                      <span className={styles.predHead}>
                        <span className={styles.mark} data-mark={p.mark} aria-hidden="true" />
                        <span className={styles.predOutcome}>{p.outcomeLabel}</span>
                        <span className={styles.predWording}>{p.wording}</span>
                      </span>
                      {p.observed ? <p className={styles.observed}>{p.observed}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
      {hasFieldPlan ? (
        <div className={styles.fieldPlan} data-field-plan>
          <h4 className={styles.fieldHeading}>{en["branches.fieldPlan"].text}</h4>
          <ul className={styles.fieldList}>
            {branches.fieldChecks.map((fc) => (
              <li
                key={fc.fieldCheckId}
                className={styles.fieldItem}
                data-field-check={fc.fieldCheckId}
              >
                <span className={styles.fieldLabel}>{fc.label}</span>
                <span className={styles.fieldSeparates}>{fc.separatesText}</span>
              </li>
            ))}
          </ul>
          {branches.unseparatedText ? (
            <p className={styles.unseparated}>{branches.unseparatedText}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
