"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { en, format } from "../../lib/copy/en";
import type { Fixture } from "../../lib/prototype/fixture";
import {
  resolvePlace,
  STAGES,
  type Coverage,
  type Flow,
  type StageId,
} from "../../lib/prototype/flow";
import { MULTI_CASES, protoCopy, type CaseSpec } from "../../lib/prototype/proto-copy";
import type { Story } from "../../lib/prototype/story";
import type { DirectionId } from "../../lib/theme/daylight";
import { useMapBundle } from "../map/useMapBundle";
import { Cite } from "./Cite";
import { Mark, Pause, Play } from "./icons";
import { LandPins, type LandPin } from "./LandPins";
import {
  ProtoMap,
  type MapLayer,
  type ProtoMapHandle,
  type SheetState,
  type View,
} from "./ProtoMap";
import {
  BriefModal,
  CoverageNote,
  MIREYE_LAYERS,
  MireyeLayerStack,
  SplitOverlay,
  StatusBadges,
  TechProofModal,
  VisualEvidenceHeader,
} from "./ProtoPanels";
import styles from "./Story.module.css";

type HypSubMode = "locked" | "record" | "graph" | "trace";
type ScopeSubMode = "globe" | "valley";
type ExplanationFilter = "all" | "grazing" | "rainfall" | "farms" | "snow";

const STAGE_TITLES: Record<StageId, string> = {
  scope: protoCopy.stage01,
  evidence: protoCopy.stage02,
  hypotheses: protoCopy.stage03,
  interventions: protoCopy.stage04,
  field: protoCopy.stage05,
};

const LENS_PILLS: readonly { id: View; label: string }[] = [
  { id: "globe", label: protoCopy.lensGlobe },
  { id: "relief", label: protoCopy.lens3D },
  { id: "stack", label: protoCopy.lensStack },
  { id: "split", label: protoCopy.lensSplit },
  { id: "viewpoint", label: protoCopy.lens50m },
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
  const [mapReady, setMapReady] = useState(false);

  const [direction, setDirection] = useState<DirectionId>("1");
  const [caseId, setCaseId] = useState<CaseSpec["id"]>("high-atlas");
  const [stage, setStage] = useState<StageId>("scope");
  const [scopeMode, setScopeMode] = useState<ScopeSubMode>("valley");
  const [hypMode, setHypMode] = useState<HypSubMode>("record");
  const [view, setView] = useState<View>("relief");
  const [splitMode, _setSplitMode] = useState<1 | 2 | 3>(1);
  const [expFilter, setExpFilter] = useState<ExplanationFilter>("all");

  const [queryText, setQueryText] = useState("");
  const [notice, setNotice] = useState<Coverage | null>(null);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [openPin, setOpenPin] = useState<string | null>(null);
  const [selectedAnchor, setSelectedAnchor] = useState<{ x: number; y: number } | null>(null);

  const [seasonYear, setSeasonYear] = useState<number>(2025);
  const [playingRecord, setPlayingRecord] = useState(false);
  const [frontProgress, setFrontProgress] = useState<number | null>(0.72);
  const [cutPlaying, setCutPlaying] = useState(false);
  const [brief, setBrief] = useState<"en" | "fr" | null>(null);
  const [proofOpen, setProofOpen] = useState(false);

  const activeCase = useMemo(
    () => MULTI_CASES.find((c) => c.id === caseId) ?? MULTI_CASES[0],
    [caseId],
  ) as CaseSpec;

  // Sync URL query params for deterministic Playwright screenshots and deep links
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const dirParam = q.get("direction") ?? q.get("dir");
    if (dirParam === "1" || dirParam === "shd") setDirection("1");
    else if (dirParam === "2" || dirParam === "daylight" || dirParam === "mireye")
      setDirection("2");
    else if (dirParam === "3" || dirParam === "dune") setDirection("3");

    const caseParam = q.get("case");
    if (caseParam === "sierra" || caseParam === "sierra-fire") setCaseId("sierra-fire");
    else if (caseParam === "draa" || caseParam === "draa-basin") setCaseId("draa-basin");

    const stepParam = q.get("step") ?? q.get("stage");
    if (stepParam === "place" || stepParam === "globe") {
      setStage("scope");
      setScopeMode("globe");
      setView("globe");
    } else if (
      stepParam === "confirm" ||
      stepParam === "ask" ||
      stepParam === "scope" ||
      stepParam === "1"
    ) {
      setStage("scope");
      setScopeMode("valley");
      setView("relief");
    } else if (stepParam === "working" || stepParam === "evidence" || stepParam === "2") {
      setStage("evidence");
      setView("stack");
    } else if (
      stepParam === "findings" ||
      stepParam === "time" ||
      stepParam === "hypotheses" ||
      stepParam === "3" ||
      stepParam === "locked" ||
      stepParam === "record" ||
      stepParam === "graph"
    ) {
      setStage("hypotheses");
      if (stepParam === "locked" || q.get("sub") === "locked") {
        setHypMode("locked");
        setView("relief");
        setFrontProgress(null);
      } else if (stepParam === "graph" || q.get("sub") === "graph") {
        setHypMode("graph");
        setView("relief");
        setFrontProgress(null);
      } else {
        setHypMode("record");
        setView("timerecord");
        setFrontProgress(0.72);
      }
    } else if (stepParam === "interventions" || stepParam === "4") {
      setStage("interventions");
      setView("relief");
    } else if (stepParam === "field" || stepParam === "5") {
      setStage("field");
      setView("viewpoint");
    }

    const viewParam = q.get("view");
    if (viewParam === "globe") {
      setScopeMode("globe");
      setView("globe");
    } else if (viewParam === "overview" || viewParam === "flat") setView("flat");
    else if (viewParam === "oblique" || viewParam === "relief") setView("relief");
    else if (viewParam === "stack") setView("stack");
    else if (viewParam === "timerecord" || viewParam === "record") setView("timerecord");
    else if (viewParam === "split") setView("split");
    else if (viewParam === "viewpoint") setView("viewpoint");

    if (q.get("trace") === "1" || q.get("sub") === "trace") {
      setStage("hypotheses");
      setHypMode("trace");
    }
    const bParam = q.get("brief");
    if (bParam === "fr") setBrief("fr");
    else if (bParam === "en" || bParam === "1") setBrief("en");

    const yr = Number(q.get("season"));
    if (!Number.isNaN(yr) && Math.min(2025, Math.max(2000, yr)) === yr && q.has("season")) {
      setSeasonYear(yr);
    }

    const fp = q.get("front");
    if (fp !== null) setFrontProgress(Number(fp));

    const queryStr = q.get("q");
    if (queryStr) {
      setQueryText(queryStr);
      const r = resolvePlace(queryStr, fixture, flow);
      if (r.kind === "pack" && r.pack.coverage) setNotice(r.pack.coverage);
      else if (r.kind === "outside") setNotice(r.coverage);
    }
  }, [fixture, flow]);

  // 26-season playback timer
  useEffect(() => {
    if (!playingRecord) return;
    const id = window.setInterval(() => {
      setSeasonYear((y) => {
        const next = y >= 2025 ? 2000 : y + 1;
        setFrontProgress((next - 2000) / 25);
        return next;
      });
    }, 450);
    return () => {
      window.clearInterval(id);
    };
  }, [playingRecord]);

  // 90s Auto-Director Story Cut
  useEffect(() => {
    if (!cutPlaying) return;
    const sequence: { stage: StageId; view: View; hyp?: HypSubMode; scope?: ScopeSubMode }[] = [
      { stage: "scope", view: "globe", scope: "globe" },
      { stage: "scope", view: "relief", scope: "valley" },
      { stage: "evidence", view: "stack" },
      { stage: "hypotheses", view: "relief", hyp: "locked" },
      { stage: "hypotheses", view: "timerecord", hyp: "record" },
      { stage: "hypotheses", view: "relief", hyp: "graph" },
      { stage: "interventions", view: "relief" },
      { stage: "field", view: "viewpoint" },
    ];
    let idx = 0;
    const id = window.setInterval(() => {
      idx = (idx + 1) % sequence.length;
      const item = sequence[idx];
      if (!item) return;
      setStage(item.stage);
      setView(item.view);
      if (item.scope) setScopeMode(item.scope);
      if (item.hyp) setHypMode(item.hyp);
    }, 4500);
    return () => {
      window.clearInterval(id);
    };
  }, [cutPlaying]);

  const selectStage = useCallback((id: StageId) => {
    setStage(id);
    setNotice(null);
    setOpenPin(null);
    if (id === "scope") {
      setScopeMode("valley");
      setView("relief");
    } else if (id === "evidence") {
      setView("stack");
    } else if (id === "hypotheses") {
      setHypMode("record");
      setView("timerecord");
      setFrontProgress(0.72);
    } else if (id === "interventions") {
      setView("relief");
    } else {
      setView("viewpoint");
    }
  }, []);

  const handleQuery = useCallback(
    (qStr: string) => {
      const lower = qStr.toLowerCase();
      if (lower.includes("sierra") || lower.includes("california") || lower.includes("fire")) {
        setCaseId("sierra-fire");
        setNotice(null);
        setScopeMode("valley");
        setView("relief");
        return;
      }
      if (lower.includes("draa") || lower.includes("ouarzazate") || lower.includes("oasis")) {
        setCaseId("draa-basin");
        setNotice(null);
        setScopeMode("valley");
        setView("relief");
        return;
      }
      const r = resolvePlace(qStr, fixture, flow);
      if (r.kind === "match") {
        setCaseId("high-atlas");
        setNotice(null);
        setScopeMode("valley");
        setView("relief");
      } else if (r.kind === "pack" && r.pack.coverage) {
        setNotice(r.pack.coverage);
      } else if (r.kind === "outside") {
        setNotice(r.coverage);
      }
    },
    [fixture, flow],
  );

  const catchmentStratum = flow.restrendStrata[0];
  const currentSeasonObj = useMemo(
    () =>
      catchmentStratum?.seasons.find((s) => s.year === seasonYear) ??
      catchmentStratum?.seasons[catchmentStratum.seasons.length - 1],
    [catchmentStratum, seasonYear],
  );

  const layer = useMemo((): MapLayer => {
    const isDry = flow.driestYears.includes(seasonYear);
    if (expFilter === "rainfall") return { kind: "rain", values: null, dryPulse: true };
    if (expFilter === "farms") return { kind: "cropland", rainOutline: true };
    if (stage === "evidence") {
      if (activeSheet === "chirps_rain") return { kind: "rain", values: null, dryPulse: true };
      if (activeSheet === "dem_strata" || activeSheet === "s2_ndvi")
        return { kind: "cropland", rainOutline: true };
      return { kind: "pixeltrend", step: 16, rainOutline: true };
    }
    if (stage === "hypotheses") {
      if (hypMode === "locked") return { kind: "none" };
      const stepNum =
        frontProgress !== null ? Math.max(1, Math.min(16, Math.round(frontProgress * 16))) : 16;
      return {
        kind: "pixeltrend",
        step: stepNum,
        rainOutline: true,
        dryPulse: isDry,
      };
    }
    if (stage === "interventions") return { kind: "cropland", rainOutline: false };
    if (view === "split") {
      return splitMode === 2
        ? { kind: "cropland", rainOutline: true }
        : { kind: "pixeltrend", step: 16, rainOutline: true, dryPulse: true };
    }
    if (stage === "scope" && scopeMode === "valley") {
      return { kind: "pixeltrend", step: 16, rainOutline: false };
    }
    return { kind: "none" };
  }, [
    stage,
    scopeMode,
    hypMode,
    activeSheet,
    expFilter,
    seasonYear,
    frontProgress,
    view,
    splitMode,
    flow.driestYears,
  ]);

  const sheets = useMemo((): SheetState[] => {
    if (view !== "stack" && stage !== "evidence") return [];
    const offsets = [0.96, 0.74, 0.52, 0.3, 0.1];
    return MIREYE_LAYERS.map((ls, idx) => ({
      id: ls.id,
      n: ls.n,
      label: ls.title,
      sub: ls.tag,
      height: offsets[idx] ?? 0.2,
      opacity: activeSheet === null || activeSheet === ls.id ? 0.96 : 0.28,
      empty: false,
    }));
  }, [view, stage, activeSheet]);

  const activePins = useMemo((): LandPin[] => {
    if (view === "globe" || view === "stack" || stage === "evidence") return [];
    const baseLon = fixture.outlet.lon + 0.08;
    const baseLat = fixture.outlet.lat + 0.025;
    if (stage === "scope") {
      const zoneChips = [
        "/map/chips/chip-valley-floor-orchards.png",
        "/map/chips/chip-mid-slope-rangeland.png",
        "/map/chips/chip-upper-snow-band.png",
      ];
      return activeCase.zones.map((z, idx) => ({
        id: z.id,
        at: [baseLon + z.atOffset[0], baseLat + z.atOffset[1]] as [number, number],
        label: z.name,
        sub: z.elev,
        stem: 68 + idx * 24,
        kind: "seen" as const,
        badge: z.delta,
        chipUrl: zoneChips[idx % zoneChips.length] ?? "/map/chips/chip-mid-slope-rangeland.png",
      }));
    }
    if (stage === "hypotheses") {
      const expChips: Record<string, string> = {
        grazing: "/map/chips/chip-mid-slope-rangeland.png",
        rainfall: "/map/chips/chip-drought-comparison.png",
        farms: "/map/chips/chip-valley-floor-orchards.png",
        snow: "/map/chips/chip-upper-snow-band.png",
      };
      return activeCase.explanations.map((ex, idx) => {
        const offsets: [number, number][] = [
          [-0.042, -0.008],
          [-0.008, 0.012],
          [0.028, -0.006],
          [0.058, 0.018],
        ];
        const off = offsets[idx % offsets.length] ?? [0, 0];
        return {
          id: ex.id,
          at: [baseLon + off[0], baseLat + off[1]] as [number, number],
          label: ex.label,
          sub: ex.claim,
          stem: 66 + (idx % 3) * 26,
          kind:
            hypMode === "locked"
              ? ("locked" as const)
              : ex.verdict === "contradicted"
                ? ("contradicted" as const)
                : ex.verdict === "cannot"
                  ? ("missing" as const)
                  : ("seen" as const),
          badge: hypMode === "locked" ? "Locked Rule" : ex.verdictBadge,
          chipUrl: expChips[ex.id] ?? "/map/chips/chip-mid-slope-rangeland.png",
        };
      });
    }
    if (stage === "interventions") {
      const c = flow.pins[0]?.at ?? [-6.37, 31.64];
      const mid = flow.pins[1]?.at ?? [-6.41, 31.63];
      return [
        {
          id: "rest",
          at: c,
          label: protoCopy.agdalOpenRingLabel,
          sub: protoCopy.openRingTag,
          stem: 74,
          kind: "missing",
          badge: protoCopy.s4PrecedentBadge,
          chipUrl: "/map/chips/chip-valley-floor-orchards.png",
        },
        {
          id: "dry-year",
          at: mid,
          label: protoCopy.dryRuleFootprintLabel,
          sub: protoCopy.footprintTag,
          stem: 94,
          kind: "proposed",
          chipUrl: "/map/chips/chip-drought-comparison.png",
        },
      ];
    }
    const stopOffsets: [number, number][] = [
      [-0.044, -0.01],
      [-0.012, 0.004],
      [0.038, 0.018],
      [-0.028, -0.002],
    ];
    const stopChips = [
      "/map/chips/chip-outlet-hydrology.png",
      "/map/chips/chip-mid-slope-rangeland.png",
      "/map/chips/chip-upper-snow-band.png",
      "/map/chips/chip-valley-floor-orchards.png",
    ];
    return activeCase.fieldStops.slice(0, 4).map((g, i) => {
      const off = stopOffsets[i % stopOffsets.length] ?? [0, 0];
      return {
        id: g.id,
        at: [baseLon + off[0], baseLat + off[1]] as [number, number],
        label: g.label,
        sub: g.separates,
        stem: 62 + (i % 2) * 28,
        kind: "proposed" as const,
        badge: g.distanceLabel,
        chipUrl: stopChips[i % stopChips.length] ?? "/map/chips/chip-outlet-hydrology.png",
        distanceLabel: g.distanceLabel,
        elevationDelta: g.elevationDelta,
        profilePts: flow.groundChecks[i]?.profilePts ?? [0.22, 0.35, 0.48, 0.62, 0.78],
      };
    });
  }, [view, stage, hypMode, activeCase, fixture.outlet, flow.pins, flow.groundChecks]);

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

  const leaderFrom = useMemo(() => {
    if (view === "globe") return null;
    const w = typeof window === "undefined" ? 1440 : window.innerWidth;
    return { x: w - 410, y: 174 };
  }, [view]);

  const briefText = flow.brief.find((b) => b.lang === brief);

  // Selected pin metadata for the VisualEvidenceHeader
  const selectedPinObj = useMemo(() => {
    if (!activePins.length) return null;
    return activePins.find((p) => p.id === openPin) ?? activePins[0] ?? null;
  }, [activePins, openPin]);

  // Top-left Editorial Headline per Stage & Active Case
  const editorial = useMemo(() => {
    if (stage === "scope" && scopeMode === "globe") {
      return {
        kicker: protoCopy.stage1GlobeKicker,
        headline: protoCopy.stage1GlobeHeadline,
        subhead: protoCopy.stage1GlobeSubhead,
      };
    }
    if (stage === "scope") {
      return {
        kicker: protoCopy.stage1Kicker,
        headline: activeCase.questionHeadline,
        subhead: activeCase.questionSubhead,
      };
    }
    if (stage === "evidence") {
      return {
        kicker: protoCopy.stage2Kicker,
        headline: protoCopy.stage2Headline,
        subhead: protoCopy.stage2Subhead,
      };
    }
    if (stage === "hypotheses") {
      return {
        kicker: protoCopy.stage3Kicker,
        headline: activeCase.verdictHeadline,
        subhead: activeCase.verdictSubhead,
      };
    }
    if (stage === "interventions") {
      return {
        kicker: protoCopy.stage4Kicker,
        headline: protoCopy.stage4Headline,
        subhead: protoCopy.stage4Subhead,
      };
    }
    return {
      kicker: protoCopy.stage5Kicker,
      headline: protoCopy.stage5Headline,
      subhead: protoCopy.stage5Subhead,
    };
  }, [stage, scopeMode, activeCase]);

  // Active AI Specialist & Plain-English Briefing Caption (Bottom Cortana Bar)
  const activeSpecialist = useMemo(() => {
    if (stage === "scope") {
      return {
        name: protoCopy.bot1Name,
        role: protoCopy.bot1Role,
        speech: scopeMode === "globe" ? protoCopy.bot1SpeechGlobe : protoCopy.bot1SpeechValley,
        cites: [1] as number[],
      };
    }
    if (stage === "evidence") {
      const selLayer = MIREYE_LAYERS.find((l) => l.id === activeSheet);
      return {
        name: protoCopy.bot2Name,
        role: protoCopy.bot2Role,
        speech: selLayer ? `${selLayer.title}: ${selLayer.detail}` : protoCopy.bot2Speech,
        cites: [1, 2] as number[],
      };
    }
    if (stage === "hypotheses") {
      return {
        name: protoCopy.bot3Name,
        role: protoCopy.bot3Role,
        speech:
          hypMode === "locked"
            ? protoCopy.bot3SpeechLocked
            : hypMode === "graph"
              ? protoCopy.bot3SpeechGraph
              : hypMode === "trace"
                ? protoCopy.bot3SpeechTrace
                : protoCopy.bot3SpeechRecord,
        cites: [1, 2, 3] as number[],
      };
    }
    if (stage === "interventions") {
      return {
        name: protoCopy.bot4Name,
        role: protoCopy.bot4Role,
        speech: protoCopy.bot4Speech,
        cites: [3] as number[],
      };
    }
    return {
      name: protoCopy.bot5Name,
      role: protoCopy.bot5Role,
      speech: protoCopy.bot5Speech,
      cites: [1, 2, 3] as number[],
    };
  }, [stage, scopeMode, activeSheet, hypMode]);

  // 3 Clickable Cluely/Aside Quick-Prompt Pills per Stage
  const quickPrompts = useMemo(() => {
    if (stage === "scope") {
      return [
        {
          label: protoCopy.s1Prompt1,
          run: () => {
            selectStage("evidence");
          },
        },
        {
          label: protoCopy.s1Prompt2,
          run: () => {
            setCaseId("sierra-fire");
            setScopeMode("valley");
            setView("relief");
          },
        },
        {
          label: protoCopy.s1Prompt3,
          run: () => {
            setCaseId("draa-basin");
            setScopeMode("valley");
            setView("relief");
          },
        },
      ];
    }
    if (stage === "evidence") {
      return [
        {
          label: protoCopy.s2Prompt1,
          run: () => {
            selectStage("hypotheses");
          },
        },
        {
          label: protoCopy.s2Prompt2,
          run: () => {
            setActiveSheet((cur) => (cur === "modis_ndvi" ? null : "modis_ndvi"));
          },
        },
        {
          label: protoCopy.s2Prompt3,
          run: () => {
            setActiveSheet((cur) => (cur === "modis_snow" ? null : "modis_snow"));
          },
        },
      ];
    }
    if (stage === "hypotheses") {
      return [
        {
          label: protoCopy.s3Prompt1,
          run: () => {
            setHypMode("record");
            setView("timerecord");
            setPlayingRecord((p) => !p);
          },
        },
        {
          label: protoCopy.s3Prompt2,
          run: () => {
            setHypMode("graph");
            setView("relief");
          },
        },
        {
          label: protoCopy.s3Prompt3,
          run: () => {
            selectStage("interventions");
          },
        },
      ];
    }
    if (stage === "interventions") {
      return [
        {
          label: protoCopy.s4Prompt1,
          run: () => {
            selectStage("field");
          },
        },
        {
          label: protoCopy.s4Prompt2,
          run: () => {
            setView((v) => (v === "split" ? "relief" : "split"));
          },
        },
        {
          label: protoCopy.s4Prompt3,
          run: () => {
            setBrief("en");
          },
        },
      ];
    }
    return [
      {
        label: protoCopy.s5Prompt1,
        run: () => {
          setBrief("en");
        },
      },
      {
        label: protoCopy.s5Prompt2,
        run: () => {
          setBrief("fr");
        },
      },
      {
        label: protoCopy.s5Prompt3,
        run: () => {
          setProofOpen(true);
        },
      },
    ];
  }, [stage, selectStage]);

  return (
    <div className={styles.root} data-dir={direction} data-stage={stage} data-view={view}>
      {assets ? (
        <ProtoMap
          ref={mapRef}
          assets={assets}
          fixture={protoFixture}
          view={view}
          direction={direction}
          layer={layer}
          reading={stage === "evidence" ? "greenness" : null}
          frontProgress={
            stage === "hypotheses" && hypMode === "record" ? (frontProgress ?? 0.72) : null
          }
          showStrata={view !== "globe" && stage !== "evidence"}
          showRoute={stage === "field" || view === "viewpoint"}
          activeSheetId={activeSheet}
          onSelectSheet={setActiveSheet}
          sheets={sheets}
          leaderFrom={leaderFrom}
          leaderTarget={selectedAnchor}
          selection="set"
          onReady={() => {
            setMapReady(true);
          }}
        />
      ) : (
        <div className={styles.loading}>
          {bundle.status === "failed" ? en["flow.mapFailed"].text : en["flow.loading"].text}
        </div>
      )}

      {/* Non-overlapping LandPins with a single warm ochre active stem tethered to the Inspector */}
      {activePins.length > 0 ? (
        <LandPins
          map={map}
          pins={activePins}
          open={openPin}
          onOpen={setOpenPin}
          onSelectAnchor={setSelectedAnchor}
        />
      ) : null}

      {/* Mireye 5-Layer Isometric Stack Showcase (Stage 2 / Layer Stack) */}
      {stage === "evidence" || view === "stack" ? (
        <MireyeLayerStack activeSheetId={activeSheet} onSelectSheet={setActiveSheet} />
      ) : null}

      {/* Horizon Compass Ring in 50m Field Viewpoint */}
      {stage === "field" || view === "viewpoint" ? (
        <div className={styles.compassBar} aria-hidden="true">
          <span>{protoCopy.compassN}</span>
          <span>{protoCopy.compassNE}</span>
          <span className={styles.compassActive}>{protoCopy.compassENE}</span>
          <span>{protoCopy.compassE}</span>
          <span>{protoCopy.compassSE}</span>
        </div>
      ) : null}

      {view === "split" ? <SplitOverlay mode={splitMode} /> : null}

      {/* Top Context Bar: Brand + Multi-Case Switcher + Competing Explanations Bar + Theme */}
      <div className={styles.topScrim} aria-hidden="true" />
      <header className={styles.topBar}>
        <div className={styles.brandGroup}>
          <span className={styles.brandMark}>
            <Mark />
          </span>
          <span className={styles.brandName}>{en["flow.brand"].text}</span>

          {/* Interactive Multi-Case Switcher */}
          <div className={styles.caseSwitcher} role="group" aria-label={protoCopy.caseKicker}>
            {MULTI_CASES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={styles.casePill}
                data-active={caseId === c.id ? "true" : "false"}
                onClick={() => {
                  setCaseId(c.id);
                  setOpenPin(null);
                  setNotice(null);
                }}
              >
                {c.shortName}
              </button>
            ))}
          </div>
        </div>

        {/* Competing Explanations Toggle Bar (Perplexity Rule 5) */}
        <div className={styles.expBar} role="group" aria-label={protoCopy.explanationsBarLabel}>
          <span className={styles.expBarLabel}>{protoCopy.explanationsBarLabel}</span>
          <button
            type="button"
            className={styles.expPill}
            data-active={expFilter === "all" ? "true" : "false"}
            onClick={() => {
              setExpFilter("all");
            }}
          >
            {protoCopy.expAll}
          </button>
          {activeCase.explanations.map((ex) => (
            <button
              key={ex.id}
              type="button"
              className={styles.expPill}
              data-active={expFilter === ex.id ? "true" : "false"}
              data-verdict={ex.verdict}
              onClick={() => {
                setExpFilter((cur) => (cur === ex.id ? "all" : ex.id));
                if (stage === "hypotheses") {
                  setOpenPin(ex.id);
                }
              }}
            >
              <span>{ex.label}</span>
            </button>
          ))}
        </div>

        <div className={styles.topRight}>
          <div className={styles.opticGroup} role="group" aria-label={protoCopy.dir1Title}>
            {(
              [
                ["1", protoCopy.dir1Short],
                ["2", protoCopy.dir2Short],
                ["3", protoCopy.dir3Short],
              ] as const
            ).map(([dId, label]) => (
              <button
                key={dId}
                type="button"
                className={styles.opticBtn}
                data-active={direction === dId ? "true" : "false"}
                onClick={() => {
                  setDirection(dId);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.proofTrigger}
            onClick={() => {
              setProofOpen(true);
            }}
          >
            {protoCopy.techProofBtn}
          </button>
        </div>
      </header>

      {/* Top-Left Editorial Stage Headline Banner */}
      <section className={styles.editorialBanner} aria-live="polite">
        <span className={styles.editorialKicker}>{editorial.kicker}</span>
        <h1 className={styles.editorialHeadline}>{editorial.headline}</h1>
        <p className={styles.editorialSubhead}>{editorial.subhead}</p>
        {notice ? <CoverageNote c={notice} /> : null}
      </section>

      {/* Right-Hand Opaque Evidence Inspector Card (Tethered to Selected Terrain Stem) */}
      <aside className={styles.hudCard} aria-label={activeCase.shortName}>
        {/* High-Detail Visual Satellite & Telemetry Preview Header */}
        <VisualEvidenceHeader
          stage={stage}
          activeCase={activeCase}
          strata={flow.restrendStrata}
          seasonYear={seasonYear}
          {...(selectedPinObj ? { selectedPinId: selectedPinObj.id } : {})}
          {...(selectedPinObj ? { selectedLabel: selectedPinObj.label } : {})}
          {...(selectedPinObj ? { selectedSub: selectedPinObj.sub } : {})}
        />

        {stage === "scope" && scopeMode === "globe" ? (
          <>
            <header className={styles.cardHeader}>
              <span className={styles.panelKey}>{protoCopy.s1CardBadge}</span>
              <span className={styles.demoTag}>{protoCopy.globeLoadedTag}</span>
            </header>
            <h2 className={styles.cardTitle}>{protoCopy.globeCardTitle}</h2>
            <div className={styles.layerList}>
              {MULTI_CASES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={styles.packRow}
                  data-loaded={caseId === c.id ? "true" : "false"}
                  onClick={() => {
                    setCaseId(c.id);
                    setNotice(null);
                    setScopeMode("valley");
                    setView("relief");
                  }}
                >
                  <div>
                    <span className={styles.packName}>{c.shortName}</span>
                    <span className={styles.packTheme}>{c.regionLabel}</span>
                  </div>
                  <span className={styles.demoTag}>{c.heroStatNum}</span>
                </button>
              ))}
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  setScopeMode("valley");
                  setView("relief");
                }}
              >
                <span>{protoCopy.globeDiveBtn}</span>
                <span className={styles.kbd}>↵</span>
              </button>
            </div>
          </>
        ) : null}

        {stage === "scope" && scopeMode !== "globe" ? (
          <>
            <header className={styles.cardHeader}>
              <span className={styles.panelKey}>{protoCopy.s1CardBadge}</span>
              <button
                type="button"
                className={styles.ghostLink}
                onClick={() => {
                  setScopeMode("globe");
                  setView("globe");
                }}
              >
                {protoCopy.globeReturnBtn}
              </button>
            </header>
            <div className={styles.heroStatBox}>
              <span className={styles.heroStatBig}>{activeCase.heroStatNum}</span>
              <span className={styles.heroStatText}>
                {activeCase.heroStatLabel}
                <Cite ns={[1, 2]} chips={flow.sources} down />
              </span>
            </div>
            <div className={styles.zoneList}>
              {activeCase.zones.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  className={styles.zoneRow}
                  data-active={openPin === z.id ? "true" : "false"}
                  onClick={() => {
                    setOpenPin(z.id);
                  }}
                >
                  <div>
                    <span className={styles.zoneName}>{z.name}</span>
                    <span className={styles.zoneElev}>{z.elev}</span>
                  </div>
                  <span className={styles.zoneBadge}>{z.delta}</span>
                </button>
              ))}
            </div>
            <p className={styles.honestyText}>{protoCopy.s1HonestyNote}</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  selectStage("evidence");
                }}
              >
                <span>{protoCopy.s1NextBtn}</span>
                <span className={styles.kbd}>↵</span>
              </button>
            </div>
          </>
        ) : null}

        {stage === "evidence" ? (
          <>
            <header className={styles.cardHeader}>
              <span className={styles.panelKey}>{protoCopy.s2CardBadge}</span>
              {activeSheet ? (
                <button
                  type="button"
                  className={styles.ghostLink}
                  onClick={() => {
                    setActiveSheet(null);
                  }}
                >
                  {protoCopy.isoShowAll}
                </button>
              ) : null}
            </header>
            <div className={styles.layerList}>
              {MIREYE_LAYERS.map((ls) => {
                const isSel = activeSheet === ls.id;
                return (
                  <button
                    key={ls.id}
                    type="button"
                    className={styles.layerRow}
                    data-active={isSel ? "true" : "false"}
                    data-layer={String(ls.idx)}
                    onClick={() => {
                      setActiveSheet(isSel ? null : ls.id);
                    }}
                  >
                    <div className={styles.layerRowHead}>
                      <span className={styles.layerNum}>{ls.n}</span>
                      <span className={styles.layerDot} data-layer={String(ls.idx)} />
                      <span className={styles.layerTitle}>{ls.title}</span>
                      <span className={styles.layerTag}>{ls.tag}</span>
                    </div>
                    <span className={styles.layerDetail}>{ls.sub}</span>
                  </button>
                );
              })}
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  selectStage("hypotheses");
                }}
              >
                <span>{protoCopy.s2NextBtn}</span>
                <span className={styles.kbd}>↵</span>
              </button>
            </div>
          </>
        ) : null}

        {stage === "hypotheses" ? (
          <>
            <div className={styles.subModeBar} role="tablist">
              {(
                [
                  ["record", protoCopy.s3SubVerdict],
                  ["graph", protoCopy.s3SubWhy],
                  ["locked", protoCopy.s3SubLocked],
                  ["trace", protoCopy.s3SubProof],
                ] as const
              ).map(([mId, label]) => (
                <button
                  key={mId}
                  type="button"
                  role="tab"
                  aria-selected={hypMode === mId}
                  className={styles.subModeBtn}
                  data-active={hypMode === mId ? "true" : "false"}
                  onClick={() => {
                    setHypMode(mId);
                    if (mId === "record") {
                      setView("timerecord");
                      setFrontProgress(0.72);
                    } else {
                      setView("relief");
                      setFrontProgress(null);
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {hypMode === "record" || hypMode === "graph" ? (
              <div className={styles.layerList}>
                {activeCase.explanations.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    className={styles.hypCard}
                    data-active={openPin === ex.id ? "true" : "false"}
                    onClick={() => {
                      setOpenPin(ex.id);
                      setExpFilter(ex.id);
                    }}
                  >
                    <div className={styles.hypHead}>
                      <span className={styles.hypTitle}>{ex.label}</span>
                      <span className={styles.verdict} data-v={ex.verdict}>
                        {ex.verdictBadge}
                      </span>
                    </div>
                    <span className={styles.hypBody}>
                      {hypMode === "graph" ? ex.limitation : ex.evidence}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {hypMode === "locked" ? (
              <div className={styles.layerList}>
                {flow.branchNodes.slice(0, 4).map((b) => (
                  <div key={b.id} className={styles.hypCard}>
                    <div className={styles.hypHead}>
                      <span className={styles.hypTitle}>{b.label}</span>
                      <span className={styles.demoTag}>{b.revision}</span>
                    </div>
                    <span className={styles.hypBody}>{b.lockedPrediction}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {hypMode === "trace" ? (
              <div className={styles.layerList}>
                {flow.traceRecords.slice(0, 4).map((tr) => (
                  <div key={tr.id} className={styles.hypCard}>
                    <div className={styles.hypHead}>
                      <span className={styles.hypTitle}>{tr.stepTitle}</span>
                      <span className={styles.demoTag}>{tr.status}</span>
                    </div>
                    <span className={styles.hypBody}>{tr.validatorRule}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  selectStage("interventions");
                }}
              >
                <span>{protoCopy.s3NextBtn}</span>
                <span className={styles.kbd}>↵</span>
              </button>
            </div>
          </>
        ) : null}

        {stage === "interventions" ? (
          <>
            <header className={styles.cardHeader}>
              <span className={styles.panelKey}>{protoCopy.s4CardBadge}</span>
              <span className={styles.demoTag}>{protoCopy.s4PrecedentBadge}</span>
            </header>
            <div className={styles.precedentBox}>
              <span className={styles.precedentTitle}>{protoCopy.s4PrecedentTitle}</span>
              <span className={styles.precedentBody}>
                {protoCopy.s4PrecedentBody}
                <Cite ns={[3]} chips={flow.sources} down />
              </span>
              <span className={styles.precedentCaveat}>{protoCopy.s4PrecedentCaveat}</span>
            </div>
            <div className={styles.layerList}>
              {flow.options.map((o) => (
                <div key={o.id} className={styles.hypCard}>
                  <div className={styles.hypHead}>
                    <span className={styles.hypTitle}>{o.title}</span>
                    <span className={styles.demoTag}>{o.decides}</span>
                  </div>
                  <span className={styles.hypBody}>{o.evidence}</span>
                </div>
              ))}
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  selectStage("field");
                }}
              >
                <span>{protoCopy.s4NextBtn}</span>
                <span className={styles.kbd}>↵</span>
              </button>
            </div>
          </>
        ) : null}

        {stage === "field" ? (
          <>
            <header className={styles.cardHeader}>
              <span className={styles.panelKey}>{protoCopy.s5CardBadge}</span>
              <StatusBadges />
            </header>
            <div className={styles.layerList}>
              {activeCase.fieldStops.slice(0, 4).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={styles.hypCard}
                  data-active={openPin === g.id ? "true" : "false"}
                  onClick={() => {
                    setOpenPin(g.id);
                  }}
                >
                  <div className={styles.hypHead}>
                    <span className={styles.hypTitle}>{g.label}</span>
                    <span className={styles.demoTag}>{g.distanceLabel}</span>
                  </div>
                  <span className={styles.hypBody}>{g.what}</span>
                </button>
              ))}
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  setBrief("en");
                }}
              >
                <span>{protoCopy.s5BriefEnBtn}</span>
                <span className={styles.kbd}>↵</span>
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  setBrief("fr");
                }}
              >
                {protoCopy.s5BriefFrBtn}
              </button>
            </div>
          </>
        ) : null}
      </aside>

      {/* Bottom-Center Unified Cluely / Aside Dynamic Assistant & Stage Dock */}
      <div className={styles.bottomDockWrap}>
        {/* 1. Video-Game Cortana / Specialist Briefing Caption + Quick Prompts */}
        <section className={styles.cortanaBar} aria-label={protoCopy.teamLabel}>
          <div className={styles.cortanaMain}>
            <div className={styles.botAvatar}>
              <span className={styles.botPulse} />
              <span className={styles.botCore} />
            </div>
            <div className={styles.cortanaCopy}>
              <div className={styles.botMetaRow}>
                <span className={styles.botName}>{activeSpecialist.name}</span>
                <span className={styles.botRole}>{activeSpecialist.role}</span>
              </div>
              <p className={styles.cortanaSpeech}>
                {activeSpecialist.speech}
                <Cite ns={activeSpecialist.cites} chips={flow.sources} />
              </p>
            </div>
          </div>

          <div className={styles.cluelyRow}>
            <div className={styles.promptPills}>
              {quickPrompts.map((qp) => (
                <button key={qp.label} type="button" className={styles.promptPill} onClick={qp.run}>
                  {qp.label}
                </button>
              ))}
            </div>
            <form
              className={styles.inlineSearch}
              onSubmit={(e) => {
                e.preventDefault();
                if (queryText.trim()) handleQuery(queryText);
              }}
            >
              <input
                className={styles.inlineInput}
                value={queryText}
                onChange={(e) => {
                  setQueryText(e.target.value);
                }}
                placeholder={protoCopy.promptInputPlaceholder}
                aria-label={en["flow.place.name"].text}
              />
              <button type="submit" className={styles.inlineAskBtn}>
                {protoCopy.promptAskBtn}
              </button>
            </form>
          </div>
        </section>

        {/* 2. Synchronized 26-Year Timeline Scrubber (Stage 3 Record Mode) */}
        {stage === "hypotheses" && hypMode === "record" && catchmentStratum ? (
          <div className={styles.scrubberBar}>
            <button
              type="button"
              className={styles.playPill}
              onClick={() => {
                setPlayingRecord((p) => !p);
              }}
            >
              {playingRecord ? <Pause /> : <Play />}
              <span>{playingRecord ? protoCopy.timelinePause : protoCopy.timelinePlay}</span>
            </button>
            <div className={styles.seasonTracks}>
              {catchmentStratum.seasons.map((s) => {
                const h = Math.max(6, Math.round(((s.ndvi - 0.18) / 0.05) * 26));
                return (
                  <button
                    key={s.year}
                    type="button"
                    className={styles.seasonTick}
                    style={{ height: `${String(h)}px` }}
                    data-dry={s.dryPulse ? "true" : "false"}
                    data-active={s.year === seasonYear ? "true" : "false"}
                    title={`${String(s.year)}: ${String(Math.round(s.rainMm))} ${protoCopy.rainUnit}`}
                    onClick={() => {
                      setSeasonYear(s.year);
                      setFrontProgress((s.year - 2000) / 25);
                    }}
                  />
                );
              })}
            </div>
            <div className={styles.seasonReadout}>
              <span className={styles.seasonYearLabel}>
                {protoCopy.yearPrefix} {String(seasonYear)}
                {" · "}
                {String(Math.round(currentSeasonObj?.rainMm ?? 0))} {protoCopy.rainUnit}
              </span>
              <span className={styles.seasonSubLabel}>
                {currentSeasonObj?.dryPulse
                  ? protoCopy.timelineDryTag
                  : protoCopy.timelineNormalTag}
              </span>
            </div>
          </div>
        ) : null}

        {/* 3. Unified 5-Stage & Camera Pill Dock */}
        <div className={styles.stageDock}>
          <button
            type="button"
            className={styles.cutBtn}
            onClick={() => {
              setCutPlaying((c) => !c);
            }}
          >
            {cutPlaying ? <Pause /> : <Play />}
            <span>{cutPlaying ? protoCopy.cutStop : protoCopy.cutPlay}</span>
          </button>

          <nav className={styles.rail} aria-label={en["flow.stages"].text}>
            {STAGES.map((id) => (
              <button
                key={id}
                type="button"
                className={styles.railStep}
                data-state={stage === id ? "current" : "reached"}
                aria-current={stage === id ? "step" : undefined}
                onClick={() => {
                  selectStage(id);
                }}
              >
                {STAGE_TITLES[id]}
              </button>
            ))}
          </nav>

          <div className={styles.lensGroup} role="toolbar" aria-label={protoCopy.lens3D}>
            {LENS_PILLS.map((lp) => (
              <button
                key={lp.id}
                type="button"
                className={styles.lensBtn}
                data-active={view === lp.id ? "true" : "false"}
                onClick={() => {
                  setView(lp.id);
                  if (lp.id === "globe") {
                    setStage("scope");
                    setScopeMode("globe");
                  } else if (lp.id === "stack") {
                    setStage("evidence");
                  } else if (lp.id === "viewpoint") {
                    setStage("field");
                  } else if (scopeMode === "globe") {
                    setScopeMode("valley");
                  }
                }}
              >
                {lp.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {proofOpen ? (
        <TechProofModal
          flow={flow}
          onClose={() => {
            setProofOpen(false);
          }}
        />
      ) : null}

      {brief && briefText ? (
        <BriefModal
          brief={brief}
          briefText={briefText}
          flow={flow}
          onSelectLang={setBrief}
          onClose={() => {
            setBrief(null);
          }}
        />
      ) : null}

      <p className={styles.credit}>
        {format("stage.relief", { factor: 2 })}
        {" · "}
        {[
          en["credit.terrain"].text,
          en["credit.rainfall"].text,
          en["credit.imagery"].text,
          en["credit.worldcover"].text,
        ].join(" ")}
      </p>
    </div>
  );
}
