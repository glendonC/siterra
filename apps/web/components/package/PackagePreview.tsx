"use client";

// Development harness for the next-steps briefing (UI-2 unit 1): the case's latest Brief from the record, the steps on
// the obsidian ground without a land. Enter opens, Esc closes. The overview mounts the same briefing over its own land
// with the markers on their bands; this page is not the product.

import type { CaseSnapshot } from "@siterra/contracts";
import { useEffect, useState } from "react";
import { openCase } from "../../lib/case/load";
import { packageView } from "../../lib/package/package";
import { viewerStorage } from "../../lib/shell/preferences";
import { PackageBriefing } from "./PackageBriefing";
import styles from "./PackagePreview.module.css";

export function PackagePreview() {
  const [snapshot, setSnapshot] = useState<CaseSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const caseId = new URLSearchParams(window.location.search).get("case") ?? undefined;
    void openCase(caseId, (i, init) => fetch(i, init), viewerStorage(), Date.now()).then((r) => {
      if (r.status === "ready") setSnapshot(r.snapshot);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const brief = snapshot?.records.briefRecords.at(-1);
  const view = snapshot && brief ? packageView(snapshot, brief.id) : undefined;
  return (
    <div data-theme="obsidian" className={styles.ground} data-ready={snapshot ? "" : undefined}>
      {snapshot && view ? (
        <PackageBriefing
          snapshot={snapshot}
          view={view}
          open={open}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
