"use client";

// The Hero 1.3 valley sequence on /prototype (docs/reference/components.md, docs/reference/scenes.md,
// docs/reference/microcopy.md, docs/reference/motion.md):
// Six beats on the valley:
//   Beat 1: Arrival
//   Beat 2: Work (plan card + catchment-cut sheets lifting and descending onto the valley)
//   Beat 3: Predictions Locked (stems on the valley + Revision 1 pre-registration card)
//   Beat 4: The Record Answers (season stems around the 1991-2020 mean plane + 250 m trend + CHIRPS rain)
//   Beat 5: Verdict (48px two-tone Sky Statement in the paper sky + figure card on the right)
//   Beat 6: Field Plan & Assembly Brief (3 cool-shadow elevation bands + ground labels + card)

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { en, format, type MessageId } from "../../lib/copy/en";
import type { Fixture } from "../../lib/prototype/fixture";
import { resolvePlace, type Coverage, type Flow } from "../../lib/prototype/flow";
import { protoCopy } from "../../lib/prototype/proto-copy";
import type { Story } from "../../lib/prototype/story";
import { ARRIVAL_EXAGGERATION, ARRIVAL_POSE } from "../../lib/stage/arrival";
import { orbitToMapCamera } from "../../lib/stage/camera";
import type { DirectionId } from "../../lib/theme/daylight";
import { useMapBundle } from "../map/useMapBundle";
import { Notices } from "../notices/Notices";
import { LandPins, type LandPin } from "./LandPins";
import {
  ACTIVE_SEASON_STEM_TOP,
  ProtoMap,
  type MapLayer,
  type ProtoMapHandle,
  type SheetState,
  type View,
} from "./ProtoMap";
import { CoverageNote, KeySlot } from "./ProtoPanels";
import styles from "./Story.module.css";

export type BeatId = "arrival" | "work" | "locked" | "record" | "verdict" | "field";

const BEATS: readonly BeatId[] = ["arrival", "work", "locked", "record", "verdict", "field"];

const SCOPE_WILL: MessageId[] = ["scope.will1", "scope.will2", "scope.will3", "scope.will4"];
const SCOPE_WILL_NOT: MessageId[] = ["scope.willNot1", "scope.willNot2", "scope.willNot3"];
const CREDITS: MessageId[] = [
  "credit.terrain",
  "credit.rainfall",
  "credit.imagery",
  "credit.outletInput",
];

export function StoryScreen({
  fixture,
  story: _story,
  flow,
}: {
  fixture: Fixture;
  story: Story;
  flow: Flow;
}) {
  const bundle = useMapBundle();
  const mapRef = useRef<ProtoMapHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const [mapReady, setMapReady] = useState(false);

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [beat, setBeat] = useState<BeatId>("arrival");
  const [view, setView] = useState<View>("relief");
  const [workClock, setWorkClock] = useState<number>(3.2);
  const [briefLang, setBriefLang] = useState<"en" | "fr" | null>(null);
  const [commandValue, setCommandValue] = useState<string>(protoCopy.question);
  const [viewerBranch, setViewerBranch] = useState<string | null>(null);
  const [notice, setNotice] = useState<Coverage | null>(null);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [singleKeys, setSingleKeys] = useState(true);
  const [selectedStemAnchor, setSelectedStemAnchor] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [leaderFrom, setLeaderFrom] = useState<{ x: number; y: number } | null>(null);

  // Sync URL query params for deterministic Playwright screenshots and deep links
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("theme") === "dark") setTheme("dark");
    else setTheme("light");

    const stepParam = q.get("beat") ?? q.get("step") ?? q.get("stage");
    if (
      stepParam === "arrival" ||
      stepParam === "place" ||
      stepParam === "globe" ||
      stepParam === "confirm" ||
      stepParam === "ask" ||
      stepParam === "scope" ||
      stepParam === "1"
    ) {
      setBeat("arrival");
      setCommandValue(protoCopy.question);
    } else if (
      stepParam === "work" ||
      stepParam === "working" ||
      stepParam === "evidence" ||
      stepParam === "2"
    ) {
      setBeat("work");
      setCommandValue("");
      setWorkClock(3.2);
    } else if (stepParam === "locked") {
      setBeat("locked");
      setCommandValue("");
    } else if (
      stepParam === "record" ||
      stepParam === "challenge" ||
      stepParam === "time" ||
      stepParam === "hypotheses" ||
      stepParam === "3"
    ) {
      if (q.get("sub") === "locked") {
        setBeat("locked");
      } else if (q.get("sub") === "graph" || q.get("trace") === "1") {
        setBeat("verdict");
      } else {
        setBeat("record");
      }
      setCommandValue("");
    } else if (stepParam === "verdict" || stepParam === "findings" || stepParam === "graph") {
      setBeat("verdict");
      setCommandValue("");
    } else if (
      stepParam === "interventions" ||
      stepParam === "4" ||
      stepParam === "field" ||
      stepParam === "5"
    ) {
      setBeat("field");
      setCommandValue("");
    }

    const bParam = q.get("brief");
    if (bParam === "fr") {
      setBeat("field");
      setBriefLang("fr");
      setCommandValue("");
    } else if (bParam === "en" || bParam === "1") {
      setBeat("field");
      setBriefLang("en");
      setCommandValue("");
    }

    if (q.get("view") === "flat" || q.get("view") === "overview") {
      setView("flat");
    }

    const queryStr = q.get("q");
    if (queryStr) {
      setCommandValue(queryStr);
      const r = resolvePlace(queryStr, fixture, flow);
      if (r.kind === "pack" && r.pack.coverage) setNotice(r.pack.coverage);
      else if (r.kind === "outside") setNotice(r.coverage);
    }
  }, [fixture, flow]);

  // Animate the Work beat clock when stepped into interactively (sheets lift 0.7s apart and descend in 900ms)
  const animateWorkRef = useRef(false);
  useEffect(() => {
    if (beat !== "work" || !animateWorkRef.current) return;
    animateWorkRef.current = false;
    setWorkClock(0);
    const t0 = performance.now();
    const id = window.setInterval(() => {
      const elapsed = (performance.now() - t0) / 1000;
      if (elapsed >= 6.5) {
        setWorkClock(6.5);
        window.clearInterval(id);
      } else {
        setWorkClock(elapsed);
      }
    }, 60);
    return () => {
      window.clearInterval(id);
    };
  }, [beat]);

  const advanceBeat = useCallback(() => {
    setOpenNote(null);
    setNotice(null);
    if (beat === "arrival") {
      animateWorkRef.current = true;
      setBeat("work");
      setCommandValue("");
    } else if (beat === "work") {
      setBeat("locked");
    } else if (beat === "locked") {
      setBeat("record");
    } else if (beat === "record") {
      setBeat("verdict");
    } else if (beat === "verdict") {
      setBeat("field");
      setBriefLang(null);
    } else if (briefLang === null) {
      setBriefLang("en");
    } else {
      setBriefLang(null);
      setBeat("arrival");
      setCommandValue(protoCopy.question);
      setViewerBranch(null);
    }
  }, [beat, briefLang]);

  const stepBackBeat = useCallback(() => {
    setOpenNote(null);
    setNotice(null);
    if (beat === "field" && briefLang !== null) {
      setBriefLang(null);
      return;
    }
    const idx = BEATS.indexOf(beat);
    if (idx > 0) {
      const prev = BEATS[idx - 1] ?? "arrival";
      setBeat(prev);
      if (prev === "arrival") setCommandValue(protoCopy.question);
    }
  }, [beat, briefLang]);

  // Keyboard navigation: Enter / ArrowRight advances beat, ArrowLeft steps back, F toggles Read flat,
  // / focuses command line, D toggles dark theme, Esc closes focus notes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA";
      if (e.key === "Escape") {
        setOpenNote(null);
        inputRef.current?.blur();
        return;
      }
      if (inInput) return;
      if (e.key === "Enter" || e.key === "ArrowRight") {
        if (tag === "BUTTON") return;
        e.preventDefault();
        advanceBeat();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepBackBeat();
      } else if ((e.key === "f" || e.key === "F") && singleKeys) {
        e.preventDefault();
        setView((v) => (v === "flat" ? "relief" : "flat"));
      } else if (e.key === "/" && singleKeys) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if ((e.key === "d" || e.key === "D") && singleKeys) {
        e.preventDefault();
        setTheme((t) => (t === "light" ? "dark" : "light"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [advanceBeat, stepBackBeat, singleKeys]);

  // Measure the card's [data-leader-anchor] element so the 1 px leader line leaves 12 px below its top
  useLayoutEffect(() => {
    if (beat === "arrival" || view === "flat") {
      setLeaderFrom(null);
      return;
    }
    const updateLeaderOrigin = () => {
      const cardEl = cardRef.current;
      const anchorEl = cardEl?.querySelector<HTMLElement>("[data-leader-anchor]");
      if (!cardEl || !anchorEl) {
        setLeaderFrom(null);
        return;
      }
      const cRect = cardEl.getBoundingClientRect();
      const aRect = anchorEl.getBoundingClientRect();
      setLeaderFrom({
        x: Math.round(cRect.left),
        y: Math.round(aRect.top + 12),
      });
    };
    updateLeaderOrigin();
    window.addEventListener("resize", updateLeaderOrigin);
    return () => {
      window.removeEventListener("resize", updateLeaderOrigin);
    };
  }, [beat, briefLang, viewerBranch, view]);

  // Map layer painted on the relief per beat
  const layer = useMemo((): MapLayer => {
    if (beat === "work") {
      return { kind: "greenness", periodId: "period_2022-06", rainOutline: false };
    }
    if (beat === "locked") {
      return { kind: "greenness", periodId: "period_2022-06", rainOutline: false };
    }
    if (beat === "record") {
      const periods = [
        "period_2022-11",
        "period_2022-12",
        "period_2023-01",
        "period_2023-02",
        "period_2023-03",
        "period_2023-04",
      ];
      const cellTotals: Record<string, number> = {};
      for (const p of periods) {
        for (const [cell, v] of Object.entries(fixture.cellRain[p] ?? {})) {
          cellTotals[cell] = (cellTotals[cell] ?? 0) + v;
        }
      }
      return {
        kind: "rain",
        values: cellTotals,
        dryPulse: true,
      };
    }
    if (beat === "verdict") {
      return { kind: "pixeltrend", step: 16, rainOutline: false };
    }
    if (beat === "field") {
      return { kind: "cropland", rainOutline: false };
    }
    return { kind: "none" };
  }, [beat, fixture.cellRain]);

  // Thin catchment-cut sheets during Beat 2 (Work): lift 0.7 s apart, descend onto the land in 900 ms
  const sheets = useMemo((): SheetState[] => {
    if (beat !== "work") return [];
    const specs = [
      {
        id: "rain_sheet",
        n: protoCopy.sheet01N,
        label: protoCopy.sheet01Label,
        liftAt: 0.2,
        downAt: 4.2,
        maxH: 0.82,
      },
      {
        id: "ndvi_sheet",
        n: protoCopy.sheet02N,
        label: protoCopy.sheet02Label,
        liftAt: 0.9,
        downAt: 5.4,
        maxH: 0.46,
      },
    ];
    return specs.map((s) => {
      let h = s.maxH;
      let op = 1;
      if (workClock < s.liftAt) {
        h = 0;
        op = 0;
      } else if (workClock < s.liftAt + 0.6) {
        const k = (workClock - s.liftAt) / 0.6;
        h = s.maxH * k;
        op = k;
      } else if (workClock >= s.downAt) {
        const k = Math.min(1, (workClock - s.downAt) / 0.9);
        h = s.maxH * (1 - k);
        op = Math.max(0, 1 - Math.max(0, workClock - (s.downAt + 0.45)) / 0.75);
      }
      return {
        id: s.id,
        n: s.n,
        label: s.label,
        height: h,
        opacity: op,
      };
    });
  }, [beat, workClock]);

  // Bare ink/ochre stems on the land (Arrival: outlet beam + Tabant & Aït Ouchi; Locked: Aït Ouchi selected)
  const activePins = useMemo((): LandPin[] => {
    if (view === "flat") return [];
    const tabant = fixture.places.find((p) => p.id.includes("tabant")) ?? fixture.places[0];
    const ouchi = fixture.places.find((p) => p.id.includes("ouchi")) ?? fixture.places[1];
    if (beat === "arrival") {
      const out: LandPin[] = [
        {
          id: "outlet",
          at: [fixture.outlet.lon, fixture.outlet.lat],
          label: protoCopy.outletLabel,
          stem: 68,
          kind: "outlet",
        },
      ];
      if (tabant) {
        out.push({
          id: "tabant",
          at: [tabant.lon, tabant.lat],
          label: protoCopy.stemTabant,
          stem: 44,
          kind: "village",
        });
      }
      if (ouchi) {
        out.push({
          id: "ouchi",
          at: [ouchi.lon, ouchi.lat],
          label: protoCopy.stemOuchi,
          stem: 44,
          kind: "village",
        });
      }
      return out;
    }
    if (beat === "locked") {
      const out: LandPin[] = [];
      if (ouchi) {
        out.push({
          id: "ouchi",
          at: [ouchi.lon, ouchi.lat],
          label: protoCopy.stemOuchi,
          stem: 56,
          kind: "selected",
        });
      }
      if (tabant) {
        out.push({
          id: "tabant",
          at: [tabant.lon, tabant.lat],
          label: protoCopy.stemDecline,
          stem: 44,
          kind: "locked",
        });
      }
      return out;
    }
    return [];
  }, [beat, view, fixture.outlet, fixture.places]);

  // Target point for the card's 1 px leader line (null = nearest point on the catchment boundary with 12 px tick)
  const leaderTarget = useMemo(() => {
    if (beat === "locked" && selectedStemAnchor) {
      return selectedStemAnchor;
    }
    if (beat === "record") {
      return ACTIVE_SEASON_STEM_TOP;
    }
    return null;
  }, [beat, selectedStemAnchor]);

  // Primary key hint label at bottom-left
  const primaryKeyLabel = useMemo(() => {
    if (beat === "arrival") return protoCopy.keyStart;
    if (beat === "work") return protoCopy.keyLockPredictions;
    if (beat === "locked") return protoCopy.keyTestRecord;
    if (beat === "record") return protoCopy.keyShowVerdict;
    if (beat === "verdict") return protoCopy.keyShowPlan;
    if (briefLang === null) return protoCopy.keyReadBrief;
    return protoCopy.keyRestart;
  }, [beat, briefLang]);

  const map = mapReady ? (mapRef.current?.map() ?? null) : null;
  const assets = bundle.status === "ready" ? bundle.bundle.valley : null;
  const protoFixture = useMemo(
    () => ({
      catchment: fixture.catchment,
      outlet: fixture.outlet,
      pictureCorners: fixture.pictureCorners,
      rainCells: fixture.rainCells,
      places: fixture.places,
    }),
    [fixture],
  );

  const bearing = orbitToMapCamera(ARRIVAL_POSE, 1).bearing;
  const dirId: DirectionId = theme === "dark" ? "1" : "2";
  const showWorldCoverCredit = beat === "field";

  return (
    <div className={styles.root} data-theme={theme} data-beat={beat} data-view={view}>
      {assets ? (
        <ProtoMap
          ref={mapRef}
          assets={assets}
          fixture={protoFixture}
          view={view}
          direction={dirId}
          layer={layer}
          reading={beat === "work" ? "greenness" : null}
          frontProgress={beat === "work" ? 0.68 : null}
          showArrivalLabels={beat === "arrival"}
          showGapLabel={beat === "locked" || beat === "verdict"}
          showSeasonStems={beat === "record"}
          showStrata={beat === "field"}
          sheets={sheets}
          leaderFrom={leaderFrom}
          leaderTarget={leaderTarget}
          selection="set"
          dimImagery={beat === "record" || beat === "field"}
          onReady={() => {
            setMapReady(true);
          }}
        />
      ) : (
        <div className={styles.loading}>
          {bundle.status === "failed" ? en["flow.mapFailed"].text : en["flow.loading"].text}
        </div>
      )}

      {/* Bare ink / ochre stems on the land (never inside a box) */}
      {activePins.length > 0 ? (
        <LandPins
          map={map}
          pins={activePins}
          selectedId={beat === "locked" ? "ouchi" : null}
          onSelectAnchor={setSelectedStemAnchor}
        />
      ) : null}

      {/* Top-Centre Mode Line (mono 11/16, opens the scope popover) */}
      <p className={styles.mode} data-budget="island">
        <button
          type="button"
          className={styles.modeButton}
          popoverTarget="proto-scope-popover"
          aria-label={`${protoCopy.modeLine}. ${en["scope.name"].text}`}
        >
          {protoCopy.modeLine}
        </button>
      </p>
      <div id="proto-scope-popover" popover="auto" className={styles.scope}>
        <p className={styles.scopeMode}>{en["mode.conceptDetail"].text}</p>
        <h2 className={styles.scopeHeading}>{en["scope.will"].text}</h2>
        <ul className={styles.scopeList}>
          {SCOPE_WILL.map((id) => (
            <li key={id}>{en[id].text}</li>
          ))}
        </ul>
        <h2 className={styles.scopeHeading}>{en["scope.willNot"].text}</h2>
        <ul className={styles.scopeList}>
          {SCOPE_WILL_NOT.map((id) => (
            <li key={id}>{en[id].text}</li>
          ))}
        </ul>
      </div>

      {/* Beat 5 (Verdict): Sky Statement written directly in the paper sky above the valley */}
      {beat === "verdict" && view !== "flat" ? (
        <div className={styles.skyBlock} aria-live="polite">
          <p className={styles.skyStatus}>{protoCopy.skyStatus}</p>
          <p className={styles.skyStatement}>
            <span className={styles.skyInk}>{protoCopy.skyClaim}</span>{" "}
            <span className={styles.skyGrey}>{protoCopy.skyLimit}</span>
          </p>
        </div>
      ) : null}

      {/* The ONE Card (right: 32px, top: 64px, width: 392px, square corners, zero buttons) */}
      {beat !== "arrival" ? (
        <section
          ref={cardRef}
          key={`${beat}-${briefLang ?? "none"}`}
          className={styles.card}
          data-budget="card"
          aria-live="polite"
        >
          {/* Beat 2: Work */}
          {beat === "work" ? (
            <>
              <p className={styles.question}>{protoCopy.question}</p>
              {viewerBranch ? (
                <p className={styles.branch}>
                  <i className={styles.branchLine} aria-hidden="true" />
                  {viewerBranch}
                </p>
              ) : null}
              <p className={styles.working}>{protoCopy.workStatus}</p>
              <ol className={styles.steps}>
                <li className={styles.step} data-state="done">
                  <span className={styles.stepN}>{protoCopy.workStep1Num}</span>
                  <span className={styles.stepText}>{protoCopy.workStep1}</span>
                  <i className={styles.stepMark} aria-hidden="true" />
                </li>
                <li className={styles.step} data-state="running" data-leader-anchor="">
                  <span className={styles.stepN}>{protoCopy.workStep2Num}</span>
                  <span className={styles.stepText}>{protoCopy.workStep2}</span>
                  <i className={styles.stepMark} aria-hidden="true" />
                </li>
                <li className={styles.step} data-state="waiting">
                  <span className={styles.stepN}>{protoCopy.workStep3Num}</span>
                  <span className={styles.stepText}>{protoCopy.workStep3}</span>
                  <i className={styles.stepMark} aria-hidden="true" />
                </li>
                <li className={styles.step} data-state="waiting">
                  <span className={styles.stepN}>{protoCopy.workStep4Num}</span>
                  <span className={styles.stepText}>{protoCopy.workStep4}</span>
                  <i className={styles.stepMark} aria-hidden="true" />
                </li>
              </ol>
            </>
          ) : null}

          {/* Beat 3: Predictions Locked / Evidence */}
          {beat === "locked" ? (
            <>
              <p className={styles.question}>{protoCopy.question}</p>
              <p className={styles.status}>{protoCopy.lockedStatus}</p>
              <p className={styles.statement} data-leader-anchor="">
                <span className={styles.ink}>{protoCopy.lockedClaim}</span>{" "}
                <span className={styles.grey}>{protoCopy.lockedLimit}</span>{" "}
                <button
                  type="button"
                  className={styles.monoChipBtn}
                  aria-expanded={openNote === "cite1"}
                  onClick={() => {
                    setOpenNote((n) => (n === "cite1" ? null : "cite1"));
                  }}
                >
                  {protoCopy.cite1Chip}
                </button>
              </p>
              {openNote === "cite1" ? (
                <p className={styles.focusNote}>{protoCopy.cite1Note}</p>
              ) : null}
              <p className={styles.source}>{protoCopy.lockedSource}</p>
              <p className={styles.meaning}>{protoCopy.lockedMeaning}</p>
              <p className={styles.open}>
                <i className={styles.ring} aria-hidden="true" />
                {protoCopy.lockedOpenReports}
              </p>
              <p className={styles.open}>
                <i className={styles.ring} aria-hidden="true" />
                {protoCopy.lockedOpenBranches}
              </p>
            </>
          ) : null}

          {/* Beat 4: The Record Answers / Dry-year challenge */}
          {beat === "record" ? (
            <>
              <p className={styles.question}>{protoCopy.question}</p>
              <p className={styles.branch}>
                <i className={styles.branchLine} aria-hidden="true" />
                {viewerBranch ?? protoCopy.challengeBranch}
              </p>
              <p className={styles.status}>{protoCopy.challengeStatus}</p>
              <p className={styles.statement} data-leader-anchor="">
                <span className={styles.ink}>{protoCopy.challengeClaim}</span>{" "}
                <span className={styles.grey}>{protoCopy.challengeLimit}</span>{" "}
                <button
                  type="button"
                  className={styles.monoChipBtn}
                  aria-expanded={openNote === "cite2"}
                  onClick={() => {
                    setOpenNote((n) => (n === "cite2" ? null : "cite2"));
                  }}
                >
                  {protoCopy.cite2Chip}
                </button>
              </p>
              {openNote === "cite2" ? (
                <p className={styles.focusNote}>{protoCopy.cite2Note}</p>
              ) : null}
              <p className={styles.source}>{protoCopy.challengeSource}</p>
              <p className={styles.meaning}>{protoCopy.challengeMeaning}</p>
            </>
          ) : null}

          {/* Beat 5: Verdict (Sky Statement is in the sky; Card holds the Figure, Source, Method, Meaning, Flags, Why) */}
          {beat === "verdict" ? (
            <>
              <div className={styles.figure} data-leader-anchor="">
                <p className={styles.figureLabel}>{protoCopy.verdictFigureLabel}</p>
                <p className={styles.figureValue}>
                  <span className={styles.figureNumber}>{protoCopy.verdictFigureValue}</span>
                  <span className={styles.figureUnit}>{protoCopy.verdictFigureUnit}</span>
                </p>
                <p className={styles.figureContext}>{protoCopy.verdictFigureContext}</p>
              </div>
              <p className={styles.source}>{protoCopy.verdictSource}</p>
              <p className={styles.source}>{protoCopy.verdictMethod}</p>
              <p className={styles.meaning}>{protoCopy.verdictMeaning}</p>
              <p className={styles.focusableLine}>
                <button
                  type="button"
                  className={styles.focusableBtn}
                  aria-expanded={openNote === "flags"}
                  onClick={() => {
                    setOpenNote((n) => (n === "flags" ? null : "flags"));
                  }}
                >
                  {protoCopy.verdictFlags}
                </button>
              </p>
              {openNote === "flags" ? (
                <p className={styles.focusNote}>{protoCopy.verdictFlagsNote}</p>
              ) : null}
              <p className={styles.whyLine}>
                <button
                  type="button"
                  className={styles.monoChipBtn}
                  aria-expanded={openNote === "why"}
                  onClick={() => {
                    setOpenNote((n) => (n === "why" ? null : "why"));
                  }}
                >
                  {protoCopy.verdictWhyChip}
                </button>{" "}
                <span>{protoCopy.verdictWhyText}</span>
              </p>
              {openNote === "why" ? (
                <p className={styles.focusNote}>{protoCopy.verdictWhyNote}</p>
              ) : null}
            </>
          ) : null}

          {/* Beat 6a: Field Plan (before opening Assembly Brief) */}
          {beat === "field" && briefLang === null ? (
            <>
              <p className={styles.statement} data-leader-anchor="">
                <button
                  type="button"
                  className={styles.statementFocusBtn}
                  aria-expanded={openNote === "plan"}
                  onClick={() => {
                    setOpenNote((n) => (n === "plan" ? null : "plan"));
                  }}
                >
                  <span className={styles.ink}>{protoCopy.planClaim}</span>{" "}
                  <span className={styles.grey}>{protoCopy.planLimit}</span>
                </button>
              </p>
              {openNote === "plan" ? (
                <p className={styles.focusNote}>{protoCopy.planLimitNote}</p>
              ) : null}
              <div className={styles.section}>
                <p className={styles.sectionLine}>
                  <span className={styles.grey}>{protoCopy.planMeasurePrefix}</span>{" "}
                  <span className={styles.ink}>{protoCopy.planMeasureBody}</span>
                </p>
              </div>
              <p className={styles.open}>
                <i className={styles.ring} aria-hidden="true" />
                {protoCopy.planPrecedentOpen}
              </p>
              <p className={styles.proposalOnly}>{protoCopy.planProposalOnly}</p>
            </>
          ) : null}

          {/* Beat 6b: Assembly Brief inside the exact same 392px right-hand card (no modal) */}
          {beat === "field" && briefLang !== null ? (
            <>
              <div className={styles.statusRow}>
                <p className={styles.status}>
                  {briefLang === "fr" ? protoCopy.briefStatusFr : protoCopy.briefStatusEn}
                </p>
                <span className={styles.langChips}>
                  <button
                    type="button"
                    className={styles.monoChipBtn}
                    data-active={briefLang === "en" ? "true" : "false"}
                    onClick={() => {
                      setBriefLang("en");
                    }}
                  >
                    {protoCopy.briefChipEn}
                  </button>
                  <button
                    type="button"
                    className={styles.monoChipBtn}
                    data-active={briefLang === "fr" ? "true" : "false"}
                    onClick={() => {
                      setBriefLang("fr");
                    }}
                  >
                    {protoCopy.briefChipFr}
                  </button>
                </span>
              </div>
              <p className={styles.statement} data-leader-anchor="">
                <span className={styles.ink}>
                  {briefLang === "fr" ? protoCopy.briefClaimFr : protoCopy.briefClaimEn}
                </span>{" "}
                <span className={styles.grey}>
                  {briefLang === "fr" ? protoCopy.briefLimitFr : protoCopy.briefLimitEn}
                </span>
              </p>
              <div className={styles.section}>
                <p className={styles.sectionLine}>
                  {briefLang === "fr" ? protoCopy.briefLine1Fr : protoCopy.briefLine1En}
                </p>
                <p className={styles.sectionLine}>
                  {briefLang === "fr" ? protoCopy.briefLine2Fr : protoCopy.briefLine2En}
                </p>
                <p className={styles.sectionLine}>
                  {briefLang === "fr" ? protoCopy.briefLine3Fr : protoCopy.briefLine3En}
                </p>
              </div>
              <p className={styles.source}>{protoCopy.briefSource}</p>
            </>
          ) : null}

          {notice ? <CoverageNote c={notice} /> : null}
        </section>
      ) : null}

      {/* Bottom-Left Key Slot (above the key hints at left: 40px, bottom: 92px) */}
      {beat === "work" || beat === "locked" ? <KeySlot kind="ndvi" /> : null}
      {beat === "record" ? <KeySlot kind="rain" /> : null}

      {/* Bottom-Left Key Hints (left: 40px, bottom: 34px, 24px apart) */}
      <ul className={styles.keys}>
        <li>
          <button
            type="button"
            className={styles.key}
            onClick={advanceBeat}
            aria-keyshortcuts="Enter"
            data-budget="action"
          >
            <kbd className={styles.glyph} aria-hidden="true">
              ↵
            </kbd>
            {primaryKeyLabel}
          </button>
        </li>
        <li>
          <button
            type="button"
            className={styles.key}
            onClick={() => {
              setView((v) => (v === "flat" ? "relief" : "flat"));
            }}
            aria-pressed={view === "flat"}
            aria-keyshortcuts="F"
            data-budget="key-hint"
          >
            <kbd className={styles.glyph} aria-hidden="true">
              F
            </kbd>
            {protoCopy.keyReadFlat}
          </button>
        </li>
      </ul>

      {/* Bottom-Centre Command Line (width: 580px, bottom: 34px, centred) */}
      <form
        className={styles.command}
        autoComplete="off"
        data-budget="command"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = commandValue.trim();
          if (!trimmed) {
            advanceBeat();
            return;
          }
          if (beat === "arrival" && trimmed === protoCopy.question) {
            advanceBeat();
            return;
          }
          const r = resolvePlace(trimmed, fixture, flow);
          if (r.kind === "pack" && r.pack.coverage) {
            setNotice(r.pack.coverage);
            if (beat === "arrival") setBeat("locked");
          } else if (r.kind === "outside") {
            setNotice(r.coverage);
            if (beat === "arrival") setBeat("locked");
          } else {
            setNotice(null);
            setViewerBranch(trimmed);
            setCommandValue("");
            setBeat("record");
          }
        }}
      >
        <span className={styles.commandGlyph} aria-hidden="true">
          /
        </span>
        <span className={styles.commandSep} aria-hidden="true" />
        <label className={styles.srOnly} htmlFor="proto-command-input">
          {en["command.label"].text}
        </label>
        <input
          ref={inputRef}
          id="proto-command-input"
          className={styles.commandInput}
          type="text"
          value={commandValue}
          onChange={(e) => {
            setCommandValue(e.target.value);
          }}
          placeholder={en["command.label"].text}
          spellCheck={false}
          aria-keyshortcuts="/"
        />
      </form>

      {/* Bottom-Right Instruments (right: 40px, bottom: 38px) */}
      <div className={styles.instruments} data-budget="island">
        <div className={styles.instrumentRow}>
          <svg
            className={styles.north}
            viewBox="-20 -20 40 40"
            role="img"
            aria-label={en["stage.northName"].text}
            style={{ transform: `rotate(${String(view === "flat" ? 0 : -bearing)}deg)` }}
          >
            <path d="M0 -12 L4.5 5.5 L0 2 L-4.5 5.5 Z" />
          </svg>
          <span className={styles.northLabel} aria-hidden="true">
            {en["stage.north"].text}
          </span>
          {view === "flat" ? null : (
            <span>{format("stage.relief", { factor: ARRIVAL_EXAGGERATION })}</span>
          )}
        </div>
        <div className={styles.instrumentRow}>
          <span>{en["stage.imagery"].text}</span>
        </div>
      </div>

      {/* Bottom-Right Credit Line (right: 40px, bottom: 14px) */}
      <p className={styles.credit} data-budget="credit">
        {[
          ...CREDITS.map((id) => en[id].text),
          showWorldCoverCredit ? en["credit.worldcover"].text : "",
        ]
          .filter(Boolean)
          .join(" ")}
        <button
          type="button"
          className={styles.creditLink}
          onClick={() => {
            setNoticesOpen(true);
          }}
        >
          {en["stage.sources"].text}
        </button>
      </p>

      <Notices
        open={noticesOpen}
        dataCredits={[]}
        placeCredits={[]}
        imagery={true}
        singleKeys={singleKeys}
        onSingleKeys={setSingleKeys}
        onClose={() => {
          setNoticesOpen(false);
        }}
      />
    </div>
  );
}
