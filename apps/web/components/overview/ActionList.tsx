"use client";

// What can be done with a thing on the land, beside it (decision 15): each action with its key chip and also
// clickable, Enter first, Esc Back last. `still` draws the same list without controls, for the label that follows
// the cursor (its keys work; a plain click on the land runs Enter).

import type { ReactNode, Ref } from "react";
import { en } from "../../lib/copy/en";
import { VIEW_HREF, type Action } from "../../lib/overview/actions";
import { Control, ControlLink, KeyChip } from "../controls/Control";
import styles from "./ActionList.module.css";

export function ActionList({
  actions,
  onOpen,
  onBack,
  primaryRef,
  still = false,
  trailing,
  className,
}: {
  actions: readonly Action[];
  /** Opens a view in place; true when it did, so the link does not load. */
  onOpen?: (href: string) => boolean;
  onBack?: () => void;
  primaryRef?: Ref<HTMLAnchorElement>;
  still?: boolean;
  trailing?: ReactNode;
  className?: string;
}) {
  if (!actions.length && !trailing) return null;
  if (still)
    return (
      <span className={`${styles.still} ${className ?? ""}`} data-actions>
        {actions.map((a) => (
          <span key={a.key} className={styles.stillRow}>
            <KeyChip>{a.key}</KeyChip>
            <span>{en[a.label].text}</span>
          </span>
        ))}
      </span>
    );
  return (
    <div className={`${styles.list} ${className ?? ""}`} data-actions>
      {actions.map((a) =>
        a.view ? (
          <ControlLink
            key={a.key}
            ref={a.key === "Enter" ? primaryRef : undefined}
            href={VIEW_HREF[a.view]}
            keyHint={a.key}
            aria-keyshortcuts={a.key}
            variant={a.key === "Enter" ? "primary" : "default"}
            data-action={a.view}
            onClick={(e) => {
              if (a.view && onOpen?.(VIEW_HREF[a.view])) e.preventDefault();
            }}
          >
            {en[a.label].text}
          </ControlLink>
        ) : (
          <Control key={a.key} keyHint="Esc" keyShortcut="Escape" variant="quiet" onClick={onBack}>
            {en[a.label].text}
          </Control>
        ),
      )}
      {trailing}
    </div>
  );
}
