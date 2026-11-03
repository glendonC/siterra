"use client";

import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import type { RunModel } from "../../lib/run/model";
import styles from "./AtWork.module.css";

export function ScrollableThinkingChips({
  chips,
  chipMeta,
  isExpanded,
}: {
  chips: readonly string[];
  chipMeta: RunModel["chipMeta"];
  isExpanded: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fadeRef = useRef<"right" | "left" | "both" | null>(null);

  const syncFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    let next: "right" | "left" | "both" | null = null;
    if (maxScroll > 2) {
      const left = el.scrollLeft > 3;
      const right = el.scrollLeft < maxScroll - 3;
      next = left && right ? "both" : right ? "right" : left ? "left" : null;
    }
    if (fadeRef.current !== next) {
      fadeRef.current = next;
      if (next) {
        el.setAttribute("data-fade", next);
      } else {
        el.removeAttribute("data-fade");
      }
    }
  }, []);

  useEffect(() => {
    syncFade();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      syncFade();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [chips.length, isExpanded, syncFade]);

  return (
    <div
      ref={scrollRef}
      className={styles.thinkingChips}
      data-thinking-chips=""
      onScroll={syncFade}
      onWheel={(e) => {
        const el = e.currentTarget;
        if (el.scrollWidth <= el.clientWidth) return;
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
          syncFade();
        }
      }}
    >
      {chips.map((chip, chipIdx) => {
        const meta = chipMeta?.[chip];
        const tip = meta
          ? meta.publisher
            ? `${meta.title} (${meta.publisher})`
            : meta.title
          : undefined;
        return meta?.url ? (
          <a
            key={chip}
            href={meta.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.thinkingChipLink}
            title={tip}
            aria-label={`Open ${chip}`}
            style={{ "--chip-idx": chipIdx } as CSSProperties}
            data-thinking-chip={isExpanded ? "" : undefined}
          >
            <span>{chip}</span>
            <svg
              className={styles.thinkingChipArrow}
              width="9"
              height="9"
              viewBox="0 0 10 10"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2.5 7.5L7.5 2.5M7.5 2.5H3.5M7.5 2.5V6.5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        ) : (
          <span
            key={chip}
            className={styles.thinkingChip}
            title={tip}
            style={{ "--chip-idx": chipIdx } as CSSProperties}
            data-thinking-chip={isExpanded ? "" : undefined}
          >
            {chip}
          </span>
        );
      })}
    </div>
  );
}
