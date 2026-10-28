// The prototype's icons: one authored set, 16 px box, 1.5 px stroke, round joins.

import type { ReactNode } from "react";

function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** A free-hand loop with a pen point. */
export const Draw = () => (
  <Icon>
    <path d="M3.5 9.5c-1.2-2.6.6-6 4.2-6 3 0 5 1.8 4.6 4.1-.4 2.4-3.4 3.4-5.6 2.9" />
    <path d="M6.7 10.5 4 13.5l-.5-2.2Z" />
  </Icon>
);

/** A survey mark: a station triangle over a crosshair. */
export const Mark = () => (
  <Icon>
    <path d="M8 2.5 13.5 12.5h-11Z" />
    <path d="M8 7.5v3M6.5 9h3" />
  </Icon>
);
/** Three cards on two levels, joined. */
export const Connect = () => (
  <Icon>
    <rect x="2" y="10" width="4" height="3.5" />
    <rect x="10" y="10" width="4" height="3.5" />
    <rect x="6" y="2.5" width="4" height="3.5" />
    <path d="M4 10c0-2 4-2 4-4M12 10c0-2-4-2-4-4" />
  </Icon>
);
export const ArrowUp = () => (
  <Icon>
    <path d="M8 13V3M4 7l4-4 4 4" />
  </Icon>
);
export const Stop = () => (
  <Icon>
    <rect x="4" y="4" width="8" height="8" rx="1" />
  </Icon>
);
export const Chevron = () => (
  <Icon>
    <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
  </Icon>
);
export const Close = () => (
  <Icon>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
);
export const Play = () => (
  <Icon>
    <path d="M5 3.5v9l7-4.5Z" />
  </Icon>
);
export const Pause = () => (
  <Icon>
    <path d="M5.5 3.5v9M10.5 3.5v9" />
  </Icon>
);
export const Globe = () => (
  <Icon>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M2.5 8h11M8 2.5c1.8 1.6 2.6 3.4 2.6 5.5S9.8 11.9 8 13.5C6.2 11.9 5.4 10.1 5.4 8S6.2 4.1 8 2.5Z" />
  </Icon>
);
export const Relief = () => (
  <Icon>
    <path d="m1.5 12.5 4-6 2.5 3.5 2-2.5 4.5 5Z" />
  </Icon>
);
export const Flat = () => (
  <Icon>
    <rect x="2.5" y="2.5" width="11" height="11" />
    <path d="M2.5 8h11M8 2.5v11" />
  </Icon>
);
export const Copy = () => (
  <Icon>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
    <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
  </Icon>
);
export const Check = () => (
  <Icon>
    <path d="m3.5 8.5 3 3 6-7" />
  </Icon>
);
export const Compare = () => (
  <Icon>
    <path d="M8 2v12" />
    <rect x="2.5" y="4" width="11" height="8" />
  </Icon>
);
export const Target = () => (
  <Icon>
    <circle cx="8" cy="8" r="4.5" />
    <path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" />
  </Icon>
);
