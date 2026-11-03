"use client";

// The proposed walking routes drawer on the right: displays the route summary, what the routes do not authorize,
// and each route with its length, climb, estimated time, and destination from the bundle's route_lines.
// Hovering or focusing a route lifts its line and endpoint marker on the terrain.

import { useState, type Ref } from "react";
import { en, format } from "../../lib/copy/en";
import {
  inBundleOrder,
  routeFigures,
  type RouteLine,
  type RoutesRecord,
} from "../../lib/overview/routes";
import type { Action } from "../../lib/overview/actions";
import { ActionList } from "./ActionList";
import styles from "./OverviewRoutes.module.css";

export interface RoutesRefs {
  root: Ref<HTMLDivElement>;
  inst: Ref<HTMLElement>;
  frost: Ref<HTMLDivElement>;
  first: Ref<HTMLLIElement>;
}

export type RoutesLoad =
  { status: "loading" } | { status: "ready"; record: RoutesRecord } | { status: "failed" };

/**
 * A route's title without the words the column's own title says ("Proposed route to the pixel the case opens" reads
 * "The pixel the case opens"); a title in another form stays as the record has it.
 */
function destinationOf(title: string): string {
  const m = /^proposed (?:walking )?route to (.+)$/i.exec(title);
  const d = m?.[1];
  return d ? d.charAt(0).toUpperCase() + d.slice(1) : title;
}

export function OverviewRoutes({
  routes,
  load,
  onPick,
  onOpen,
  actions,
  onBack,
  refs,
}: {
  routes: readonly RouteLine[];
  load: RoutesLoad;
  onPick: (id: string | null) => void;
  /** Opens the field plan in place over the land; returns true when handled in place. */
  onOpen?: (href: string) => boolean;
  /** Contextual actions available from the current record. */
  actions: readonly Action[];
  onBack?: () => void;
  refs: RoutesRefs;
}) {
  const record = load.status === "ready" ? load.record : null;
  const list = inBundleOrder(routes, record?.order);
  // Progressive disclosure for the routes' limits and cost function
  const [methodOpen, setMethodOpen] = useState(false);
  const ends = new Set(list.map((r) => r.end));
  const sharedEnd = list.length > 1 && ends.size === 1 ? (list[0]?.end ?? null) : null;
  return (
    <div ref={refs.root} className={styles.routes} data-record="routes">
      <div ref={refs.frost} className={styles.frost} aria-hidden="true" />
      <section ref={refs.inst} className={styles.inst} aria-label={en["overview.routes"].text}>
        <p className={styles.caption} data-routes-caption>
          <span className={styles.ink}>{en["overview.routes"].text}.</span>
          {record ? (
            <>
              {" "}
              <span className={styles.grey}>
                {format("overview.routes.grey", { origin: record.cost.origin })}
              </span>
            </>
          ) : null}
        </p>
        <ul className={styles.list}>
          {list.map((r, i) => {
            const facts = record?.facts.get(r.member);
            const f = facts ? routeFigures(facts) : null;
            return (
              <li
                key={r.id}
                ref={i === 0 ? refs.first : undefined}
                className={styles.item}
                tabIndex={0}
                data-route={r.member}
                onPointerEnter={() => {
                  onPick(r.id);
                }}
                onPointerLeave={() => {
                  onPick(null);
                }}
                onFocus={(ev) => {
                  // a keyboard focus picks the route; the focus the opening moves here after a click does not
                  if (ev.currentTarget.matches(":focus-visible")) onPick(r.id);
                }}
                onBlur={() => {
                  onPick(null);
                }}
              >
                <span className={styles.title}>
                  <span className={styles.num} data-route-number>
                    {i + 1}
                  </span>
                  {destinationOf(r.title)}
                </span>
                {f ? (
                  <span className={styles.figures} data-route-figures>
                    {format("overview.routes.figures", f)}
                  </span>
                ) : null}
                {r.end && !sharedEnd ? (
                  <span className={styles.end}>
                    <i className={styles.site} aria-hidden="true" />
                    {r.end}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {/* every route's end is the same kind of site: said once, under the list */}
        {sharedEnd ? (
          <p className={styles.end} data-routes-end>
            <i className={styles.site} aria-hidden="true" />
            {sharedEnd}
          </p>
        ) : null}
        {record ? (
          <>
            <button
              type="button"
              className={styles.method}
              aria-expanded={methodOpen}
              data-routes-method
              onClick={() => {
                setMethodOpen((o) => !o);
              }}
            >
              {en["overview.routes.method"].text}
            </button>
            <div hidden={!methodOpen}>
              <p className={styles.cost} data-routes-not>
                {format("overview.routes.not", { not: record.cost.not })}
              </p>
              <p className={styles.cost} data-routes-cost>
                {format("overview.routes.cost", {
                  name: record.cost.name,
                  factor: record.cost.offPath,
                  time: record.cost.time,
                })}
              </p>
            </div>
          </>
        ) : null}
        {load.status === "failed" ? (
          <p className={styles.cost} role="status">
            {en["overview.routes.unread"].text}
          </p>
        ) : null}
        <ActionList
          actions={actions}
          {...(onOpen ? { onOpen } : {})}
          {...(onBack ? { onBack } : {})}
        />
      </section>
    </div>
  );
}
