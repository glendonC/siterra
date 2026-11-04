"use client";

import { useCallback, useEffect, useState } from "react";
import { en } from "../../lib/copy/en";
import { STORY_BEATS, type BeatCitation } from "../../lib/opening/beats";
import styles from "./Opening.module.css";

export interface OpeningProps {
  onOpen: () => void;
  onShown?: () => void;
  onBeat?: (index: number) => void;
  theme?: "light" | "obsidian";
  onToggleTheme?: () => void;
}

type DocTab = "thesis" | "methodology" | "architecture" | "sources";

const AUTO_ADVANCE_MS = 7200;

interface SpecRow {
  label: string;
  value: string;
  sub?: string;
}

interface NarrativePoint {
  num: string;
  tone: "blue" | "red" | "yellow" | "green";
  lead: string;
  body: string;
  citeLabel?: string;
  citeHref?: string;
}

const DOC_CONTENT: Record<
  DocTab,
  {
    kicker: string;
    leadInk: string;
    leadGrey: string;
    specs: readonly SpecRow[];
    points: readonly NarrativePoint[];
  }
> = {
  thesis: {
    kicker: "Product Thesis",
    leadInk: "A complete environmental land investigation in software.",
    leadGrey:
      "When a place is reported as degraded, Siterra checks decades of satellite imagery, rainfall history, published research, and local land-use rules side by side, before anyone makes a costly decision.",
    specs: [
      {
        label: "Investigation Scope",
        value: "Any Place on Earth",
        sub: "Global coordinate & valley engine",
      },
      {
        label: "Global Rangelands",
        value: "80M km² (>54% Land)",
        sub: "Supports 2B people (UNCCD 2024)",
      },
      {
        label: "Satellite Imagery",
        value: "26-Yr MODIS + Sentinel-2",
        sub: "250 m history + 10 m detail",
      },
      {
        label: "Rainfall Records",
        value: "CHIRPS 5 km History",
        sub: "Separates drought from land use",
      },
      {
        label: "Satellite Blind Spot",
        value: "30–40% Loss Threshold",
        sub: "Wessels et al. 2012 · RSE",
      },
      { label: "Project Audit", value: "26 Conservation Sites", sub: "West et al. 2023 · Science" },
      { label: "Final Output", value: "3D GPS Field Routes", sub: "Exact spots to verify on foot" },
    ],
    points: [
      {
        num: "01",
        tone: "blue",
        lead: "Real satellite and rainfall math, never AI guesswork.",
        body: "Calculates multi-decade plant trends across 30 m elevation bands, 5 km rainfall history, 10 m canopy imagery, and local species records using reproducible code.",
        citeLabel: "Wessels et al., 2012 · Remote Sensing of Environment ↗",
        citeHref: "https://doi.org/10.1016/j.rse.2012.06.022",
      },
      {
        num: "02",
        tone: "red",
        lead: "Cross-checks published science and local land history.",
        body: "Reads peer-reviewed studies, historical land policies, drought records, and seasonal grazing rules so top-down assumptions are tested against real evidence.",
        citeLabel: "Behnke & Scoones, 1992 · IIED Range Ecology ↗",
        citeHref: "https://www.iied.org/7282iied",
      },
      {
        num: "03",
        tone: "yellow",
        lead: "Tests every explanation and maps what to check on foot.",
        body: "Compares competing causes side by side (drought, irrigated crops, snow timing, and thorny weeds), then maps exact 3D walking routes for people on the ground to verify.",
        citeLabel: "Chamberlin, 1965 · Science ↗",
        citeHref: "https://doi.org/10.1126/science.148.3671.754",
      },
    ],
  },
  methodology: {
    kicker: "How It Works",
    leadInk: "Separates valley floors from high slopes and tests every cause.",
    leadGrey:
      "Standard satellite maps blur whole valleys into single coarse pixels. Siterra splits the terrain by elevation, checks whether rainfall explains the change, and pinpoints what only a walk on the ground can confirm.",
    specs: [
      {
        label: "Satellite Math",
        value: "100% Reproducible Code",
        sub: "Zero AI-generated numbers",
      },
      {
        label: "Terrain & Cover",
        value: "Copernicus 30 m Terrain",
        sub: "ESA WorldCover 10 m map",
      },
      {
        label: "Optical Imagery",
        value: "MODIS 250 m (26-Yr)",
        sub: "Sentinel-2 10 m canopy detail",
      },
      {
        label: "Climate Records",
        value: "CHIRPS 5 km Rainfall",
        sub: "Seasonal snow & drought tracking",
      },
      {
        label: "Research Search",
        value: "OpenAlex + GBIF Live",
        sub: "Exact word-for-word quote check",
      },
      {
        label: "Consistent Rules",
        value: "Locked Analysis Steps",
        sub: "Gould et al. 2025 · BMC Biology",
      },
      {
        label: "Human Control",
        value: "3 Human Sign-Off Steps",
        sub: "No automated policy or action",
      },
    ],
    points: [
      {
        num: "01",
        tone: "blue",
        lead: "Splits the land by elevation and checks rainfall first.",
        body: "Separates lower irrigated valley floors from higher grazing slopes and compares plant health against wet-season rain, showing where climate, not local herders, drives the trend.",
        citeLabel: "UNCCD Global Land Outlook, 2024 ↗",
        citeHref: "https://digitallibrary.un.org/record/4058928/files/1413651-EN.pdf",
      },
      {
        num: "02",
        tone: "red",
        lead: "Scores competing explanations side by side.",
        body: "Tests rainfall swings, grazing pressure, crop expansion, snowmelt timing, and satellite pixel mixing against measurements and verified quotes from scientific papers.",
        citeLabel: "West et al., 2023 · Science ↗",
        citeHref: "https://doi.org/10.1126/science.ade3535",
      },
      {
        num: "03",
        tone: "yellow",
        lead: "Maps 3D walking routes where satellites cannot see.",
        body: "Because satellites cannot tell unpalatable thorny weeds apart from healthy pasture grass, Siterra plots the exact GPS paths to walk and requires human sign-off before any action.",
        citeLabel: "Gould et al., 2025 · BMC Biology ↗",
        citeHref: "https://doi.org/10.1186/s12915-024-02101-x",
      },
    ],
  },
  architecture: {
    kicker: "Multi-Model System",
    leadInk: "Specialist Meta AI models paired with exact satellite math.",
    leadGrey:
      "Instead of relying on one chatbot, Meta Muse Spark breaks each investigation into parallel jobs, assigning long-document reading, satellite canopy vision, and hypothesis testing to specialist models checked by code.",
    specs: [
      {
        label: "Task Planner",
        value: "Meta Muse Spark",
        sub: "Coordinates parallel specialist jobs",
      },
      { label: "Paper Reader", value: "Llama 4 Scout", sub: "10M token context · OpenAlex papers" },
      {
        label: "Hypothesis Tester",
        value: "Llama 4 Maverick",
        sub: "17B-128E MoE · Compares causes",
      },
      { label: "Canopy Vision", value: "Meta SAM 2", sub: "10 m tree, crop & shrub segmentation" },
      {
        label: "Quote & Safety Check",
        value: "Llama Guard 4 + Code",
        sub: "Verifies exact quotes & scope",
      },
      {
        label: "Satellite & Rain Math",
        value: "Copernicus + CHIRPS",
        sub: "Pure code · Zero AI arithmetic",
      },
      { label: "3D Map Engine", value: "MapLibre WebGL", sub: "Verified 3D terrain & GPS layers" },
    ],
    points: [],
  },
  sources: {
    kicker: "Published Science",
    leadInk: "Every claim links directly to a published study or open satellite dataset.",
    leadGrey:
      "Siterra pairs peer-reviewed global research on satellite blind spots and conservation outcomes with live OpenAlex, Crossref, and GBIF searches for any place you investigate.",
    specs: [
      {
        label: "Global Rangelands",
        value: "UNCCD 2024 · IPBES 2018",
        sub: "80M km² open pasture synthesis",
      },
      {
        label: "Live Paper Search",
        value: "OpenAlex + Crossref",
        sub: "Finds studies for any location",
      },
      {
        label: "Species Records",
        value: "GBIF Occurrence Data",
        sub: "Local plant & wildlife records",
      },
      {
        label: "Satellite Blind Spot",
        value: "Wessels et al. 2012",
        sub: "30–40% loss before trend shows",
      },
      {
        label: "Conservation Audit",
        value: "West et al. 2023",
        sub: "26-project study in Science",
      },
      {
        label: "Dryland Ecology",
        value: "Behnke & Scoones 1992",
        sub: "Rainfall vs. grazing dynamics",
      },
      {
        label: "Analysis Standards",
        value: "Chamberlin · Gould 2025",
        sub: "Testing multiple explanations",
      },
    ],
    points: [],
  },
};

const PRIMARY_SOURCES = [
  {
    code: "UNCCD",
    tone: "blue" as const,
    citation: "Herrera, P.M. / UNCCD (2024)",
    title: "Global Land Outlook Thematic Report on Rangelands and Pastoralists",
    venue: "United Nations Convention to Combat Desertification",
    note: "Shows that open pastures and rangelands cover over 54% of Earth's land (80M km²) and support two billion people, while local ground data remains scarce.",
    href: "https://digitallibrary.un.org/record/4058928/files/1413651-EN.pdf",
  },
  {
    code: "RSE",
    tone: "red" as const,
    citation: "Wessels, K.J., van den Bergh, F., Scholes, R.J. (2012)",
    title: "Limits to detectability of land degradation by trend analysis of vegetation index data",
    venue: "Remote Sensing of Environment 125: 10–22",
    note: "Proves that 30 to 40% of vegetation can be lost before standard coarse satellite trend lines show a statistically clear decline under variable rainfall.",
    href: "https://doi.org/10.1016/j.rse.2012.06.022",
  },
  {
    code: "SCIENCE",
    tone: "yellow" as const,
    citation: "West, T.A.P., Wunder, S. et al. (2023)",
    title:
      "Action needed to make carbon offsets from forest conservation work for climate change mitigation",
    venue: "Science 381(6660): 873–877",
    note: "Evaluated 26 conservation projects across six countries and found that most failed to reduce land loss when baselines were not rigorously checked.",
    href: "https://doi.org/10.1126/science.ade3535",
  },
  {
    code: "IPBES",
    tone: "green" as const,
    citation: "IPBES (2018)",
    title: "Summary for Policymakers: Global Assessment Report on Land Degradation and Restoration",
    venue: "Intergovernmental Science-Policy Platform on Biodiversity",
    note: "Finds that land degradation affects 3.2 billion people worldwide, yet open satellite data is rarely combined with local ground knowledge in decisions.",
    href: "https://doi.org/10.5281/zenodo.3237411",
  },
  {
    code: "IIED",
    tone: "yellow" as const,
    citation: "Behnke, R.H., Scoones, I. (1992)",
    title: "Rethinking Range Ecology: Implications for Rangeland Management",
    venue: "International Institute for Environment and Development",
    note: "Shows that where rainfall swings widely from year to year, drought drives vegetation changes far more than livestock numbers, refuting simple overgrazing blame.",
    href: "https://www.iied.org/7282iied",
  },
  {
    code: "BMC",
    tone: "blue" as const,
    citation: "Gould, E., Fraser, H.S., Parker, T.H. et al. (2025)",
    title:
      "Same data, different analysts: variation in effect sizes due to analytical decisions in ecology",
    venue: "BMC Biology 23: 35 (174 Analyst Teams)",
    note: "Demonstrates why locked, repeatable analysis steps are essential so environmental conclusions do not change based on who runs the numbers.",
    href: "https://doi.org/10.1186/s12915-024-02101-x",
  },
  {
    code: "LANDSAT",
    tone: "green" as const,
    citation: "Zhu, Z., Wulder, M.A., Roy, D.P. et al. (2019)",
    title: "Benefits of the free and open Landsat data policy",
    venue: "Remote Sensing of Environment 224: 382–385",
    note: "Documents the 20-fold surge in global satellite imagery use after open release while highlighting the gap between raw satellite pixels and local ground truth.",
    href: "https://doi.org/10.1016/j.rse.2019.02.016",
  },
  {
    code: "NATURE",
    tone: "red" as const,
    citation: "Cunningham, C.X., Williamson, G.J., Bowman, D.M.J.S. (2024)",
    title: "Increasing frequency and intensity of the most extreme wildfires on Earth",
    venue: "Nature Ecology & Evolution",
    note: "21-year global satellite record showing a 2.2-fold increase in extreme wildfire events between 2003 and 2023.",
    href: "https://doi.org/10.1038/s41559-024-02452-2",
  },
] as const;

/** Clean, abstract, uniform 6-fold radial geometric mark. */
export function SiterraMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
        <rect x="10.3" y="1.5" width="3.4" height="6.4" rx="1.7" />
        <rect x="10.3" y="1.5" width="3.4" height="6.4" rx="1.7" transform="rotate(60 12 12)" />
        <rect x="10.3" y="1.5" width="3.4" height="6.4" rx="1.7" transform="rotate(120 12 12)" />
        <rect x="10.3" y="1.5" width="3.4" height="6.4" rx="1.7" transform="rotate(180 12 12)" />
        <rect x="10.3" y="1.5" width="3.4" height="6.4" rx="1.7" transform="rotate(240 12 12)" />
        <rect x="10.3" y="1.5" width="3.4" height="6.4" rx="1.7" transform="rotate(300 12 12)" />
      </g>
    </svg>
  );
}

/** Clean sun / moon theme icon. */
export function ThemeIcon({ theme }: { theme: "light" | "obsidian" }) {
  if (theme === "obsidian") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.55" />
        <path
          d="M12 2.5V5M12 19v2.5M4.22 4.22l1.77 1.77M18.01 18.01l1.77 1.77M2.5 12H5M19 12h2.5M4.22 19.78l1.77-1.77M18.01 5.99l1.77-1.77"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.2 14.6A8.2 8.2 0 0 1 9.4 3.8a8.2 8.2 0 1 0 10.8 10.8Z"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Opening({ onOpen, onShown, onBeat, theme = "light", onToggleTheme }: OpeningProps) {
  const [beatIndex, setBeatIndex] = useState(0);
  const [hoveredCitation, setHoveredCitation] = useState<BeatCitation | null>(null);
  const [activeDocTab, setActiveDocTab] = useState<DocTab | null>(null);
  const totalBeats = STORY_BEATS.length;
  const isPaused = hoveredCitation !== null || activeDocTab !== null;

  useEffect(() => {
    onShown?.();
  }, [onShown]);

  useEffect(() => {
    onBeat?.(beatIndex);
    setHoveredCitation(null);
  }, [beatIndex, onBeat]);

  const goPrev = useCallback(() => {
    setBeatIndex((i) => (i - 1 + totalBeats) % totalBeats);
  }, [totalBeats]);

  const goNext = useCallback(() => {
    setBeatIndex((i) => (i + 1) % totalBeats);
  }, [totalBeats]);

  // Fallback timer when reduced-motion disables the CSS loader animation
  useEffect(() => {
    if (isPaused) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) return;
    const timer = window.setTimeout(() => {
      setBeatIndex((i) => (i + 1) % totalBeats);
    }, AUTO_ADVANCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [beatIndex, isPaused, totalBeats]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (activeDocTab !== null) {
        if (e.key === "Escape") {
          e.preventDefault();
          setActiveDocTab(null);
        }
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "BUTTON" || tag === "A") return;
      if (e.key === "Enter") {
        e.preventDefault();
        onOpen();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onOpen, goNext, goPrev, activeDocTab]);

  const beat = STORY_BEATS[beatIndex] ?? STORY_BEATS[0];
  if (!beat) return null;
  const doc = activeDocTab ? DOC_CONTENT[activeDocTab] : null;

  return (
    <div className={styles.opening} data-opening>
      <header className={styles.topBar}>
        <div className={styles.brand}>
          <SiterraMark className={styles.brandMark} />
          <span className={styles.brandName}>{en["opening.title"].text}</span>
        </div>

        <nav className={styles.topNav} aria-label={"Documentation and research"}>
          <button
            type="button"
            className={styles.topNavLink}
            data-tone="blue"
            data-active={activeDocTab === "thesis" ? "" : undefined}
            onClick={() => {
              setActiveDocTab((t) => (t === "thesis" ? null : "thesis"));
            }}
          >
            <span className={styles.topNavIndicator} aria-hidden="true" />
            <span className={styles.topNavLabel}>{"Thesis"}</span>
          </button>
          <button
            type="button"
            className={styles.topNavLink}
            data-tone="red"
            data-active={activeDocTab === "methodology" ? "" : undefined}
            onClick={() => {
              setActiveDocTab((t) => (t === "methodology" ? null : "methodology"));
            }}
          >
            <span className={styles.topNavIndicator} aria-hidden="true" />
            <span className={styles.topNavLabel}>{"Methodology"}</span>
          </button>
          <button
            type="button"
            className={styles.topNavLink}
            data-tone="yellow"
            data-active={activeDocTab === "architecture" ? "" : undefined}
            onClick={() => {
              setActiveDocTab((t) => (t === "architecture" ? null : "architecture"));
            }}
          >
            <span className={styles.topNavIndicator} aria-hidden="true" />
            <span className={styles.topNavLabel}>{"Architecture"}</span>
          </button>
          <button
            type="button"
            className={styles.topNavLink}
            data-tone="green"
            data-active={activeDocTab === "sources" ? "" : undefined}
            onClick={() => {
              setActiveDocTab((t) => (t === "sources" ? null : "sources"));
            }}
          >
            <span className={styles.topNavIndicator} aria-hidden="true" />
            <span className={styles.topNavLabel}>{"Sources"}</span>
          </button>
        </nav>

        {onToggleTheme ? (
          <div className={styles.topRightWrap}>
            <button
              type="button"
              className={styles.themeIconBtn}
              onClick={onToggleTheme}
              aria-label={theme === "obsidian" ? "Switch to light theme" : "Switch to dark theme"}
              title={theme === "obsidian" ? "Switch to light theme" : "Switch to dark theme"}
            >
              <ThemeIcon theme={theme} />
            </button>
          </div>
        ) : null}
      </header>

      {/* Permanently anchored editorial stage so the carousel and controls never shift up or down */}
      <div className={styles.paper}>
        <div
          className={styles.centerStack}
          data-citation-open={hoveredCitation ? "" : undefined}
          onMouseLeave={() => {
            setHoveredCitation(null);
          }}
        >
          {/* 1. Permanently fixed carousel bar with live 4-color progress loaders */}
          <div className={styles.carouselBar} role="group" aria-label={"Story beats"}>
            <button
              type="button"
              className={styles.carouselArrow}
              onClick={goPrev}
              aria-label={"Previous story beat"}
              title={"Previous (←)"}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M10 3.5L5.5 8L10 12.5"
                  stroke="currentColor"
                  strokeWidth="1.35"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <ol className={styles.marks}>
              {STORY_BEATS.map((b, i) => {
                const state = i < beatIndex ? "done" : i === beatIndex ? "current" : "upcoming";
                return (
                  <li key={b.id} className={styles.markItem}>
                    <button
                      type="button"
                      className={styles.markBtn}
                      data-state={state}
                      data-tone={b.tone}
                      data-paused={isPaused ? "" : undefined}
                      onClick={() => {
                        setBeatIndex(i);
                      }}
                      aria-label={`Beat ${String(i + 1)} of ${String(totalBeats)}`}
                      aria-current={i === beatIndex ? "step" : undefined}
                    >
                      <span className={styles.markTrack}>
                        <span
                          key={
                            i === beatIndex ? `active-${String(beatIndex)}` : `idle-${String(i)}`
                          }
                          className={styles.markFill}
                          data-tone={b.tone}
                          style={
                            i === beatIndex
                              ? { animationDuration: `${String(AUTO_ADVANCE_MS)}ms` }
                              : undefined
                          }
                          onAnimationEnd={i === beatIndex ? goNext : undefined}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <button
              type="button"
              className={styles.carouselArrow}
              onClick={goNext}
              aria-label={"Next story beat"}
              title={"Next (→)"}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M6 3.5L10.5 8L6 12.5"
                  stroke="currentColor"
                  strokeWidth="1.35"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {/* 2. Strictly fixed-height statement stage: pure thin two-tone typography */}
          <div className={styles.beatStage}>
            <article
              key={beat.id}
              className={styles.beat}
              data-string-id={beat.id}
              aria-live="polite"
            >
              <p className={styles.sentence}>
                <span className={styles.ink}>{beat.ink}</span>{" "}
                <span className={styles.grey}>{beat.grey}</span>
              </p>
            </article>
          </div>

          {/* 3. Quiet, borderless monospace source citation line (no random colored dots) */}
          <div className={styles.citationRow}>
            {beat.citations.map((cit, idx) => (
              <span key={cit.id} className={styles.citationItem}>
                {idx > 0 ? (
                  <span className={styles.citationSep} aria-hidden="true">
                    {"·"}
                  </span>
                ) : null}
                {cit.href ? (
                  <a
                    href={cit.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.citationLink}
                    onMouseEnter={() => {
                      setHoveredCitation(cit);
                    }}
                    onMouseLeave={() => {
                      setHoveredCitation((c) => (c?.id === cit.id ? null : c));
                    }}
                    onFocus={() => {
                      setHoveredCitation(cit);
                    }}
                    onBlur={() => {
                      setHoveredCitation((c) => (c?.id === cit.id ? null : c));
                    }}
                  >
                    {cit.label}
                  </a>
                ) : (
                  <button
                    type="button"
                    className={styles.citationLink}
                    onMouseEnter={() => {
                      setHoveredCitation(cit);
                    }}
                    onMouseLeave={() => {
                      setHoveredCitation((c) => (c?.id === cit.id ? null : c));
                    }}
                    onFocus={() => {
                      setHoveredCitation(cit);
                    }}
                    onBlur={() => {
                      setHoveredCitation((c) => (c?.id === cit.id ? null : c));
                    }}
                    onClick={() => {
                      setActiveDocTab("sources");
                    }}
                  >
                    {cit.label}
                  </button>
                )}
              </span>
            ))}

            {hoveredCitation ? (
              <div className={styles.citationPreview} role="tooltip">
                <div className={styles.citationPreviewHeader}>
                  <span className={styles.citationPreviewBadge} data-tone={beat.tone}>
                    {hoveredCitation.id}
                  </span>
                  <span className={styles.citationPreviewVenue}>{hoveredCitation.venue}</span>
                </div>
                <p className={styles.citationPreviewTitle}>{hoveredCitation.title}</p>
                <p className={styles.citationPreviewFinding}>{hoveredCitation.finding}</p>
              </div>
            ) : null}
          </div>

          {/* 4. Press Enter to start: crisp keycap outline around ↵, hides cleanly while citation tooltip is open */}
          <div className={styles.startPromptWrap}>
            <button
              type="button"
              className={styles.startPrompt}
              data-opening-action
              aria-keyshortcuts="Enter"
              onClick={onOpen}
            >
              <kbd className={styles.startGlyph} aria-hidden="true">
                {"↵"}
              </kbd>
              <span className={styles.startText}>{"Press Enter to start"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sleek, Unified Frosted-Blur Editorial Panel (permanently fixed height & top position across all tabs) */}
      {activeDocTab !== null && doc ? (
        <div
          className={styles.docBlurOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={"Siterra Documentation"}
          onClick={() => {
            setActiveDocTab(null);
          }}
        >
          <div
            className={styles.docSheet}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {/* Top Navigation Bar of the Blur Sheet */}
            <div className={styles.docSheetTop}>
              <div className={styles.docSheetTabs} role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeDocTab === "thesis"}
                  className={styles.docSheetTab}
                  data-tone="blue"
                  data-active={activeDocTab === "thesis" ? "" : undefined}
                  onClick={() => {
                    setActiveDocTab("thesis");
                  }}
                >
                  <i className={styles.docSheetTabDot} aria-hidden="true" />
                  {"Thesis"}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeDocTab === "methodology"}
                  className={styles.docSheetTab}
                  data-tone="red"
                  data-active={activeDocTab === "methodology" ? "" : undefined}
                  onClick={() => {
                    setActiveDocTab("methodology");
                  }}
                >
                  <i className={styles.docSheetTabDot} aria-hidden="true" />
                  {"Methodology"}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeDocTab === "architecture"}
                  className={styles.docSheetTab}
                  data-tone="yellow"
                  data-active={activeDocTab === "architecture" ? "" : undefined}
                  onClick={() => {
                    setActiveDocTab("architecture");
                  }}
                >
                  <i className={styles.docSheetTabDot} aria-hidden="true" />
                  {"Architecture"}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeDocTab === "sources"}
                  className={styles.docSheetTab}
                  data-tone="green"
                  data-active={activeDocTab === "sources" ? "" : undefined}
                  onClick={() => {
                    setActiveDocTab("sources");
                  }}
                >
                  <i className={styles.docSheetTabDot} aria-hidden="true" />
                  {"Sources"}
                </button>
              </div>

              <button
                type="button"
                className={styles.docSheetClose}
                onClick={() => {
                  setActiveDocTab(null);
                }}
              >
                <kbd className={styles.docKeycap}>{"Esc"}</kbd>
                <span>{"Close"}</span>
              </button>
            </div>

            {/* Clean Two-Column Layout on the Same Frosted Surface:
                Left = Hairline Specification Rows | Right = Thin Two-Tone Editorial Explanation & Links */}
            <div className={styles.docSheetBody}>
              <aside className={styles.docSpecCol}>
                <div className={styles.docSpecColHeader}>
                  <span className={styles.docSpecColKicker}>{doc.kicker}</span>
                </div>
                <dl className={styles.docSpecList}>
                  {doc.specs.map((row) => (
                    <div key={row.label} className={styles.docSpecRow}>
                      <dt className={styles.docSpecLabel}>{row.label}</dt>
                      <dd className={styles.docSpecValGroup}>
                        <span className={styles.docSpecValPrimary}>{row.value}</span>
                        {row.sub ? <span className={styles.docSpecValSub}>{row.sub}</span> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              </aside>

              <section className={styles.docNarrativeCol}>
                <p className={styles.docNarrativeLead}>
                  <span className={styles.docLeadInk}>{doc.leadInk}</span>{" "}
                  <span className={styles.docLeadGrey}>{doc.leadGrey}</span>
                </p>

                {activeDocTab === "architecture" ? (
                  <div className={styles.archDiagram}>
                    {/* Layer 1: Task Planner Row */}
                    <div className={styles.archRouterBar}>
                      <div className={styles.archRouterBadge}>
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                        >
                          <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
                          <circle cx="18" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.8" />
                          <circle cx="18" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.8" />
                          <path
                            d="M8.5 11L15.5 7M8.5 13L15.5 17"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                          />
                        </svg>
                        <span>{"PLANNER"}</span>
                      </div>
                      <div className={styles.archRouterMain}>
                        <span className={styles.archRouterTitle}>
                          {"Meta Muse Spark · Parallel Investigation Planner"}
                        </span>
                        <span className={styles.archRouterSub}>
                          {
                            "Scales the number of parallel specialist jobs to match the terrain, sensors, and published papers for any place"
                          }
                        </span>
                      </div>
                      <a
                        href="https://ai.meta.com/llama/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.archFlowLink}
                      >
                        {"Meta AI ↗"}
                      </a>
                    </div>

                    {/* Layer 2: 2x2 Parallel Specialist Models & Satellite Engine */}
                    <div className={styles.archModelGrid}>
                      <div className={styles.archModelCard} data-tone="blue">
                        <div className={styles.archModelHeader}>
                          <span className={styles.archModelIcon} data-tone="blue">
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                d="M4 5.5h16M4 12h16M4 18.5h10"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </svg>
                          </span>
                          <span className={styles.archModelName}>{"Llama 4 Scout"}</span>
                          <span className={styles.archModelSpec}>{"10M CONTEXT"}</span>
                        </div>
                        <p className={styles.archModelDesc}>
                          {
                            "Reads full-length scientific studies, historical land policies, and regional drought reports in one pass."
                          }
                        </p>
                      </div>

                      <div className={styles.archModelCard} data-tone="red">
                        <div className={styles.archModelHeader}>
                          <span className={styles.archModelIcon} data-tone="red">
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                d="M12 3v18M3 12h18M6.5 6.5l11 11M17.5 6.5l-11 11"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                              />
                            </svg>
                          </span>
                          <span className={styles.archModelName}>{"Llama 4 Maverick"}</span>
                          <span className={styles.archModelSpec}>{"17B-128E MoE"}</span>
                        </div>
                        <p className={styles.archModelDesc}>
                          {
                            "Tests competing explanations side by side (drought, crops, thorny weeds, grazing) and challenges weak claims."
                          }
                        </p>
                      </div>

                      <div className={styles.archModelCard} data-tone="yellow">
                        <div className={styles.archModelHeader}>
                          <span className={styles.archModelIcon} data-tone="yellow">
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden="true"
                            >
                              <rect
                                x="3.5"
                                y="3.5"
                                width="7"
                                height="7"
                                rx="1.2"
                                stroke="currentColor"
                                strokeWidth="1.8"
                              />
                              <rect
                                x="13.5"
                                y="3.5"
                                width="7"
                                height="7"
                                rx="1.2"
                                stroke="currentColor"
                                strokeWidth="1.8"
                              />
                              <rect
                                x="3.5"
                                y="13.5"
                                width="7"
                                height="7"
                                rx="1.2"
                                stroke="currentColor"
                                strokeWidth="1.8"
                              />
                              <circle
                                cx="17"
                                cy="17"
                                r="3.5"
                                stroke="currentColor"
                                strokeWidth="1.8"
                              />
                            </svg>
                          </span>
                          <span className={styles.archModelName}>{"Meta SAM 2"}</span>
                          <span className={styles.archModelSpec}>{"10M VISION"}</span>
                        </div>
                        <p className={styles.archModelDesc}>
                          {
                            "Outlines 10 m satellite tree canopies and irrigated orchards to separate farmland from open pasture grass."
                          }
                        </p>
                      </div>

                      <div className={styles.archModelCard} data-tone="green">
                        <div className={styles.archModelHeader}>
                          <span className={styles.archModelIcon} data-tone="green">
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                d="M3 17l5-5 4 4 8-9"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                          <span className={styles.archModelName}>{"Copernicus & CHIRPS"}</span>
                          <span className={styles.archModelSpec}>{"PURE CODE"}</span>
                        </div>
                        <p className={styles.archModelDesc}>
                          {
                            "Calculates 26-year satellite trends, 30 m elevation splits, and 5 km rainfall history with zero AI guesswork."
                          }
                        </p>
                      </div>
                    </div>

                    {/* Layer 3: Independent Verification Checks */}
                    <div className={styles.archGateBar}>
                      <div className={styles.archGateHeader}>
                        <span className={styles.archGateLabel}>
                          {"INDEPENDENT CODE CHECKS ON EVERY MODEL OUTPUT"}
                        </span>
                        <a
                          href="https://ai.meta.com/research/publications/segment-anything-2/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.archFlowLink}
                        >
                          {"SAM 2 Paper ↗"}
                        </a>
                      </div>
                      <div className={styles.archGatePills}>
                        <span className={styles.archGatePill}>
                          <i className={styles.archGateDot} data-tone="blue" />
                          {"Exact Word-for-Word Quote Check"}
                        </span>
                        <span className={styles.archGatePill}>
                          <i className={styles.archGateDot} data-tone="red" />
                          {"Llama Guard 4 Safety & Scope Check"}
                        </span>
                        <span className={styles.archGatePill}>
                          <i className={styles.archGateDot} data-tone="yellow" />
                          {"3D Map Coordinate & Layer Check"}
                        </span>
                        <span className={styles.archGatePill}>
                          <i className={styles.archGateDot} data-tone="green" />
                          {"3-Role Human Sign-Off Required"}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}
                {activeDocTab !== "architecture" && activeDocTab !== "sources" ? (
                  <div className={styles.docPointsList}>
                    {doc.points.map((pt) => (
                      <div key={pt.num} className={styles.docPointRow}>
                        <span className={styles.docPointNum} data-tone={pt.tone}>
                          {pt.num}
                        </span>
                        <div className={styles.docPointContent}>
                          <h3 className={styles.docPointTitle}>{pt.lead}</h3>
                          <p className={styles.docPointBody}>{pt.body}</p>
                          {pt.citeLabel && pt.citeHref ? (
                            <a
                              href={pt.citeHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.docPointCite}
                            >
                              {pt.citeLabel}
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {activeDocTab === "sources" ? (
                  <div className={styles.docSourcesList}>
                    {PRIMARY_SOURCES.map((s) => (
                      <div key={s.code} className={styles.docSourceItem}>
                        <div className={styles.docSourceTop}>
                          <span className={styles.docSourceCode} data-tone={s.tone}>
                            {s.code}
                          </span>
                          <span className={styles.docSourceAuthor}>{s.citation}</span>
                          <a
                            href={s.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.docSourceDoi}
                          >
                            {"Open DOI ↗"}
                          </a>
                        </div>
                        <p className={styles.docSourceTitle}>
                          <span className={styles.docLeadInk}>{s.title}</span>{" "}
                          <span className={styles.docLeadGrey}>{`· ${s.venue}`}</span>
                        </p>
                        <p className={styles.docSourceNote}>{s.note}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
