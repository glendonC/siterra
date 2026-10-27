# Stack versions and pins

Checked 2026-10-26 (America/New_York) against the public npm registry with `npm view <pkg> version`, `npm view <pkg> time --json`, `dist-tags`, `peerDependencies`, `engines` and `dependencies`. Nothing was installed and no lockfile exists. Register IDs: TECH-35 to TECH-38 in [feasibility](source-register.md).

## Pin rule used

Default: pin the newest stable (non-prerelease) version published on or before 2026-10-12, which is at least 14 days before today. Override only for a published security fix, and say so. A version newer than the cutoff is flagged, not silently adopted. Re-run the same `npm view` commands before writing the lockfile; this table is a starting point, not a tested dependency set.

## Runtime

| Item | Verified fact (source) | Recommendation |
| --- | --- | --- |
| Node.js | `nodejs.org/dist/index.json`: v24.22.1 is LTS "Krypton" (2026-10-20, flagged security release); v26.12.1 is "Current" and not yet LTS; v22.23.4 is LTS "Jod". The release page says production applications should only use Active or Maintenance LTS. | Node 24 LTS, at least 24.22.1 (security release, newer than the cutoff by design). Set the same major on Railway and locally. |
| Engine floors in the chosen set | `openai@7.32.0` node >=22.0.0; `pg-boss@12.37.1` node >=22.12.0; `vitest@5.0.4` node ^22.12.0, ^24 or >=26; `next@16.4.1` node >=20.9.0 | Node 24 satisfies all. Node 20 does not. |
| PostgreSQL | pg-boss README: "PostgreSQL 13 or higher" | Any current managed Postgres (13+). |

## Pin table

"Latest" is the `latest` dist-tag today. Dates are npm publish dates (UTC).

| Package | Latest (date) | Pin | Pin date | Notes |
| --- | --- | --- | --- | --- |
| next | 16.4.3 (2026-10-23) | **16.4.1** | 2026-10-14 | Security override. GHSA-673q-mjm6-r5xr and GHSA-2464-fhr4-w9xw (critical, unauthenticated RCE) and GHSA-p3m5-59mp-jv5r (high, DoS) affect `>=16.0.0 <=16.4.0`; patched in 16.4.1. 16.4.2 and 16.4.3 are bug-fix backports newer than the cutoff (flagged). Never pin 16.4.0 or older. |
| eslint-config-next | 16.4.3 (2026-10-23) | 16.4.1 | 2026-10-14 | Keep equal to `next`. Depends on `typescript-eslint ^8.56.0`. |
| react | 19.3.1 (2026-10-14) | **19.3.1** | 2026-10-14 | Judgment override (12 days). Release note: React Server Components "Improve transport protocol", published the same day as the Next security release and alongside 19.0.9, 19.1.10 and 19.2.9 backports. No GitHub advisory was found for it in this check. 19.3.0 (2026-09-09) is the strict-rule alternative. |
| react-dom | 19.3.1 (2026-10-14) | 19.3.1 | 2026-10-14 | Peer: `react ^19.3.1`, so keep both identical. |
| typescript | 7.0.2 (2026-07-08) | **6.0.3** | 2026-04-16 | Do not use 7.x yet. TypeScript 7.0 "does not ship with an API" (TypeScript blog) and its package root export is only `./lib/version.cjs`. `typescript-eslint@8.72.1` peer is `typescript >=4.8.4 <6.1.0`, and `eslint-config-next` depends on it. Next 16.4 docs support TS 7 only through the `tsc` CLI. |
| @types/react, @types/react-dom | 19.3.0 (2026-09-09) | 19.3.0 | 2026-09-09 | |
| @types/node | 26.6.5 (2026-10-09) | 24.19.2 | 2026-10-09 | Match the Node 24 runtime, not the newest major. |
| tailwindcss | 4.3.3 (2026-07-16) | 4.3.3 | 2026-07-16 | |
| @tailwindcss/postcss | 4.3.3 (2026-07-16) | 4.3.3 | 2026-07-16 | Tailwind's Next.js guide installs `tailwindcss @tailwindcss/postcss postcss` and a `postcss.config.mjs` with `"@tailwindcss/postcss": {}`. |
| postcss | 8.5.32 (2026-10-26) | 8.5.30 | 2026-10-12 | 2026 advisories are patched by 8.5.23 and earlier fixes; 8.5.30 is above all of them. |
| shadcn (CLI) | 4.22.1 (2026-10-18) | 4.21.4 | 2026-10-07 | Run as `npx shadcn@4.21.4 init` rather than `@latest`. Generated components are owned source; the CLI itself is not a runtime dependency. |
| tw-animate-css | 1.4.0 (2025-09-24) | 1.4.0 | 2025-09-24 | Only if `shadcn init` adds it. |
| lucide-react | 1.61.0 (2026-10-21) | 1.55.0 | 2026-10-10 | Peer React ^16.5.1 to ^19. |
| motion | 14.6.0 (2026-10-22) | 14.1.0 | 2026-10-09 | `motion` depends on an exact `framer-motion` version, so do not add `framer-motion` separately. Import from `motion/react`. |
| maplibre-gl | 6.16.0 (2026-10-25) | 6.14.0 | 2026-10-11 | v6 is ESM-only and requires WebGL2. Security floor 6.4.1 (GHSA-jrc7-96c5-q579, critical XSS sanitizer bypass, `<= 6.4.0`). 6.15.0 and 6.16.0 flagged as newer than the cutoff. |
| pmtiles | 4.5.0 (2026-08-10) | 4.5.0 | 2026-08-10 | Depends only on `fflate`. |
| maplibre-contour | 0.1.1 (2026-09-17) | 0.1.1 | 2026-09-17 | BSD-3-Clause. Compatibility with maplibre-gl 6.x is not stated in its README; test in the first map spike. |
| @protomaps/basemaps | 5.7.2 (2026-03-10) | 5.7.2 | 2026-03-10 | Optional style-layer generator; BSD-3-Clause. Docs: style v4.0.0 and newer works with v4 tile builds. |
| @observablehq/plot | 0.6.17 (2025-02-14) | 0.6.17 | 2025-02-14 | Already depends on `d3 ^7.9.0`. |
| d3 | 7.9.0 (2024-03-12) | none | | Not needed as a direct dependency unless code imports d3 modules itself; then pin 7.9.0. |
| @tanstack/react-query | 5.105.0 (2026-10-26) | 5.104.2 | 2026-10-11 | Peer React ^18 or ^19. |
| zod | 4.6.7 (2026-10-12) | 4.6.7 | 2026-10-12 | Security floor 4.6.6 (GHSA-mrhx-c7xc-m3w5, high, memory exhaustion on oversized constrained collections). Exactly 14 days old. |
| pg | 8.23.1 (2026-09-30) | 8.23.1 | 2026-09-30 | pg-boss 12.x depends on `pg ^8.23.1`. |
| @types/pg | 8.23.1 (2026-08-17) | 8.23.1 | 2026-08-17 | |
| pg-boss | 12.38.0 (2026-10-13) | 12.37.1 | 2026-10-08 | 12.38.0 is 13 days old and adds schema version 46 plus batched maintenance; acceptable after the cutoff passes. Optional peer `@opentelemetry/api ^1.9.0`. |
| openai (Node SDK) | 7.45.0 (2026-10-26) | 7.32.0 | 2026-10-09 | Transport only. 13 minor releases (7.33.0 to 7.45.0) since 2026-10-14, several on the same day; flagged. `zod` is an optional peer (3.25+ or 4.x). Meta documents `npm install openai` with `baseURL: "https://api.meta.ai/v1"` and no SDK version floor. |
| vitest | 5.0.5 (2026-10-15) | 5.0.4 | 2026-10-12 | Requires a `vite` peer (not optional): add `vite@8.3.4` (2026-10-08). |
| vite | 8.3.5 (2026-10-21) | 8.3.4 | 2026-10-08 | Test runner peer only. |
| @playwright/test | 1.64.1 (2026-10-14) | 1.64.0 | 2026-10-07 | Next lists `@playwright/test ^1.51.1` as an optional peer. |
| @fontsource-variable/ibm-plex-sans | 5.3.0 (2026-07-19) | 5.3.0 | 2026-07-19 | OFL-1.1. Needed for the 450 label weight in [design system](../../docs/reference/design-system.md); static packages only ship fixed weights. |
| @fontsource/ibm-plex-sans | 5.3.0 (2026-07-19) | (alternative) | | Static weights. Use only if 450 is dropped. |
| @fontsource/ibm-plex-mono | 5.3.0 (2026-07-19) | 5.3.0 | 2026-07-19 | OFL-1.1. No `@fontsource-variable/ibm-plex-mono` package exists (npm 404), so Mono uses static 400/500/600. |
| @ibm/plex-sans, @ibm/plex-mono | 1.1.0 (2024-11-11), 2.5.0 (2026-06-11) | (alternative) | | Official IBM per-family packages, OFL-1.1. `@ibm/plex` 6.4.1 (2024-05-16) is the older monolithic package. |

Not in the requested list but surfaced by peer checks: `vite` (vitest peer) and `@types/node` (vitest peer `^22.0.0 || >=24.0.0`).

## Peer constraints that matter

- **React 19 with Next 16:** `next@16.4.1` peers `react` and `react-dom` `^18.2.0 || ^19.0.0`. `react-dom@19.3.1` requires `react ^19.3.1`. Keep both at the same patch.
- **Tailwind v4 with shadcn:** shadcn's Tailwind v4 page states the CLI initializes Tailwind v4 projects, components are updated for Tailwind v4 and React 19, `forwardRef` was removed and colors moved to OKLCH. Keep the `@theme inline` token setup it generates and map project tokens there.
- **Zod 4 and JSON Schema export:** `z.toJSONSchema()` defaults to Draft 2020-12, emits `additionalProperties: false` for `z.object()` in output mode, inlines reused schemas by default, and breaks cycles with `$ref` by default. For Meta model-facing schemas set `cycles: "throw"` (Meta rejects recursive schemas), keep `reused: "inline"`, use `.nullable()` instead of `.optional()` (strict subset requires every property in `required`), and do not use constructs that export to `oneOf`/`allOf`. Add a contract test that rejects those keywords; see TECH-06.
- **TypeScript:** 6.0.3 keeps the compiler API for `typescript-eslint`. If the team later wants TS 7 speed, the TypeScript 7.0 announcement documents a side-by-side alias (`"typescript": "npm:@typescript/typescript6@^6.0.2"` with a separate TS 7 alias); not tested here.
- **MapLibre v6 in Next:** official install docs give a Next.js/Turbopack snippet in a `'use client'` module: `setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString())`, stating it "needs Next.js 15 or later". Default import is gone: use `import * as maplibregl from 'maplibre-gl'` or named imports. WebGL1 removed; `new Map()` throws `GPUInitializationError` without WebGL2. See [map assets](map-assets.md).
- **pg-boss:** Node 22.12+ and PostgreSQL 13+ (README).

## Security advisories checked

GitHub global advisory API, `ecosystem=npm`, per package, newest first. Recent items that affect the choice:

| Advisory | Package range | Patched | Effect on pin |
| --- | --- | --- | --- |
| GHSA-673q-mjm6-r5xr (critical) | next `>=16.0.0 <=16.4.0` | 16.4.1 | Forces 16.4.1+ |
| GHSA-2464-fhr4-w9xw (critical) | next `>=16.0.0 <=16.4.0` | 16.4.1 | Forces 16.4.1+ |
| GHSA-p3m5-59mp-jv5r (high) | next `>=16.0.0 <=16.4.0` | 16.4.1 | Forces 16.4.1+ |
| GHSA-jrc7-96c5-q579 (critical) | maplibre-gl `<= 6.4.0` | 6.4.1 | 6.14.0 is clear |
| GHSA-mrhx-c7xc-m3w5 (high) | zod `< 4.6.6` | 4.6.6 | 4.6.7 is clear |
| GHSA-82fw-gwwq-j7x9 (medium) | vitest 5 prereleases before 5.0.0-rc.2 | 5.0.0-rc.2 | 5.0.4 is clear |

No advisories since 2026-01-01 were returned for @tanstack/react-query, @playwright/test, @observablehq/plot, tailwindcss or typescript. Absence in one API query is not proof of absence; run `npm audit` after the first install.

## Not verified

- That this exact set installs and builds together (no install was run).
- `maplibre-contour@0.1.1` with `maplibre-gl@6.14.0`.
- `pmtiles` protocol with a `raster-dem` source on MapLibre 6 (documented for vector sources; expected to work).
- Whether `react@19.3.1` fixes a security issue.
