"use client";

// The one control style (the lead's decision 1, 30 Oct 2026): a pill with a 1 px hairline, a faint fill on hover and
// focus, IBM Plex Sans 13 px, and a key chip inside when a key does the same thing. A mouse action is never drawn as
// a key. The colours are each theme's control tokens (app/daylight.css, app/obsidian.css).

import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";
import styles from "./Control.module.css";

type Variant = "default" | "primary" | "quiet";

const classOf = (variant: Variant, extra?: string) =>
  [
    styles.control,
    variant === "primary" ? styles.primary : "",
    variant === "quiet" ? styles.quiet : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");

/** A key chip: the key that does what the control does ("Esc", "R", "↵"). */
export function KeyChip({ children }: { children: ReactNode }) {
  return (
    <kbd className={styles.key} aria-hidden="true">
      {children}
    </kbd>
  );
}

export function Control({
  keyHint,
  keyShortcut,
  variant = "default",
  className,
  children,
  ref,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  /** The chip drawn inside ("↵", "Esc", "R"); none for a mouse-only action. */
  keyHint?: string;
  /** The aria-keyshortcuts value ("Enter", "Escape", "R"). */
  keyShortcut?: string;
  variant?: Variant;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      className={classOf(variant, className)}
      aria-keyshortcuts={keyShortcut}
      {...rest}
    >
      <span className={styles.label}>{children}</span>
      {keyHint ? <KeyChip>{keyHint}</KeyChip> : null}
    </button>
  );
}

/** The same pill as a link to another screen. */
export function ControlLink({
  href,
  keyHint,
  variant = "default",
  className,
  children,
  ref,
  ...rest
}: {
  href: string;
  keyHint?: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
  ref?: Ref<HTMLAnchorElement>;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link ref={ref} href={href} className={classOf(variant, className)} {...rest}>
      <span className={styles.label}>{children}</span>
      {keyHint ? <KeyChip>{keyHint}</KeyChip> : null}
    </Link>
  );
}
