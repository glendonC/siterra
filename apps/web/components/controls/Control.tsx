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
    hasKey && variant !== "primary" ? styles.withKey : "",
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
  const showKey = Boolean(keyHint) && variant !== "primary";
  return (
    <button
      ref={ref}
      type="button"
      className={classOf(variant, showKey, className)}
      aria-keyshortcuts={keyShortcut}
      {...rest}
    >
      {showKey ? <KeyChip>{keyHint}</KeyChip> : null}
      <span className={styles.label}>{children}</span>
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
  const showKey = Boolean(keyHint) && variant !== "primary";
  return (
    <Link ref={ref} href={href} className={classOf(variant, showKey, className)} {...rest}>
      {showKey ? <KeyChip>{keyHint}</KeyChip> : null}
      <span className={styles.label}>{children}</span>
    </Link>
  );
}
