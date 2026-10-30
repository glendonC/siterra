"use client";

// The proposed walking routes opened (U12), in the opened record's place on the right: the entry's words in ink and
// what the routes are not in grey (the bundle's own words), then each route as the record names it, with its length,
// climb and estimated time from the bundle's route_lines rounded once, and its end as the record names it; the cost
// function from the proposed_routes summary closes the column in grey. Each route is numbered as its end is on the
// land. Hovering or focusing a route lifts its line
// and end on the land and quiets the others.

import type { Ref } from "react";
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
  /** Opens the field plan in place over the land (decision 13); true when it did, so the link does not load. */
  onOpen?: (href: string) => boolean;
  /** What can be done from here, from what the record offers (decision 15). */
  actions: readonly Action[];
  onBack?: () => void;
  refs: RoutesRefs;
}) {
  const record = load.status === "ready" ? load.record : null;
  const list = inBundleOrder(routes, record?.order);
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
                {format("overview.routes.grey", {
                  origin: record.cost.origin,
                  not: record.cost.not,
                })}
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
                  {r.title}
                </span>
                {f ? (
                  <span className={styles.figures} data-route-figures>
                    {format("overview.routes.figures", f)}
                  </span>
                ) : null}
                {r.end ? (
                  <span className={styles.end}>
                    <i className={styles.site} aria-hidden="true" />
                    {r.end}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {record ? (
          <p className={styles.cost} data-routes-cost>
            {format("overview.routes.cost", {
              name: record.cost.name,
              factor: record.cost.offPath,
              time: record.cost.time,
            })}
          </p>
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
