"use client";

import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";
import styles from "./Control.module.css";

type Variant = "default" | "primary" | "quiet";

const classOf = (variant: Variant, hasKey: boolean, extra?: string) =>
  [
    styles.control,
    variant === "primary" ? styles.primary : "",
    variant === "quiet" ? styles.quiet : "",
    hasKey ? styles.withKey : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");

/** A crisp square keycap ("Esc", "R", "↵"), never wrapped inside an outer pill border. */
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
  keyHint?: string;
  keyShortcut?: string;
  variant?: Variant;
  ref?: Ref<HTMLButtonElement>;
}) {
  const showKey = Boolean(keyHint);
  return (
    <button
      ref={ref}
      type="button"
      className={classOf(variant, showKey, className)}
      aria-keyshortcuts={keyShortcut}
      {...rest}
    >
      <span className={styles.label}>{children}</span>
      {showKey ? <KeyChip>{keyHint}</KeyChip> : null}
    </button>
  );
}

/** The same control as a link to another screen. */
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
  const showKey = Boolean(keyHint);
  return (
    <Link ref={ref} href={href} className={classOf(variant, showKey, className)} {...rest}>
      <span className={styles.label}>{children}</span>
      {showKey ? <KeyChip>{keyHint}</KeyChip> : null}
    </Link>
  );
}
