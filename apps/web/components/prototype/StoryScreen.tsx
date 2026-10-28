"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { en, format } from "../../lib/copy/en";
import type { Fixture } from "../../lib/prototype/fixture";
import {
  FORMAL_TEXT,
  resolvePlace,
  STAGES,
  type Coverage,
  type Flow,
  type StageId,
} from "../../lib/prototype/flow";
import { protoCopy } from "../../lib/prototype/proto-copy";
import { PIXEL_TREND_SUMMARY } from "../../lib/prototype/restrend-data";
import type { Story } from "../../lib/prototype/story";
import type { DirectionId } from "../../lib/theme/daylight";
import { useMapBundle } from "../map/useMapBundle";
import { AgentStrip } from "./AgentStrip";
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
  PrecedentDock,
  RulersDock,
  SplitOverlay,
  StatusBadges,
  ViewpointHud,
} from "./ProtoPanels";
import styles from "./Story.module.css";

type HypSubMode = "locked" | "record" | "graph" | "trace";
type ScopeSubMode = "globe" | "valley";

const STAGE_TITLES: Record<StageId, string> = {
  scope: protoCopy.stage01,
  evidence: protoCopy.stage02,
  hypotheses: protoCopy.stage03,
  interventions: protoCopy.stage04,
  field: protoCopy.stage05,
};

const VIEW_PILLS: readonly { id: View; label: string }[] = [
  { id: "flat", label: protoCopy.viewOverview },
  { id: "relief", label: protoCopy.viewOblique },
  { id: "stack", label: protoCopy.viewStack },
  { id: "timerecord", label: protoCopy.viewRecord },
  { id: "split", label: protoCopy.viewSplit },
  { id: "viewpoint", label: protoCopy.viewViewpoint },
];

export function StoryScreen({
  fixture,
  story,
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
  const [stage, setStage] = useState<StageId>("scope");
  const [scopeMode, setScopeMode] = useState<ScopeSubMode>("valley");
  const [hypMode, setHypMode] = useState<HypSubMode>("record");
  const [view, setView] = useState<View>("relief");
  const [splitMode, setSplitMode] = useState<1 | 2 | 3>(1);

  const [queryText, setQueryText] = useState("");
  const [notice, setNotice] = useState<Coverage | null>(null);
  const [stripOpen, setStripOpen] = useState(true);
  const [activeSheet, setActiveSheet] = useState<string | null>("modis_ndvi");
  const [openPin, setOpenPin] = useState<string | null>(null);

  const [seasonYear, setSeasonYear] = useState<number>(2025);
  const [playingRecord, setPlayingRecord] = useState(false);
  const [frontProgress, setFrontProgress] = useState<number | null>(0.72);
  const [cutPlaying, setCutPlaying] = useState(false);
  const [brief, setBrief] = useState<"en" | "fr" | null>(null);

  // Sync URL query params for deterministic Playwright screenshots and deep links
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const dirParam = q.get("direction") ?? q.get("dir");
    if (dirParam === "1" || dirParam === "shd") setDirection("1");
    else if (dirParam === "2" || dirParam === "daylight" || dirParam === "mireye")
      setDirection("2");
    else if (dirParam === "3" || dirParam === "dune") setDirection("3");

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
      setStripOpen(true);
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
      setStripOpen(q.get("strip") === "open");
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

  // 90s Auto-Director Cut
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
      setStripOpen(true);
    } else if (id === "hypotheses") {
      setHypMode("record");
      setView("timerecord");
      setStripOpen(false);
      setFrontProgress(0.72);
    } else if (id === "interventions") {
      setView("relief");
    } else {
      setView("viewpoint");
    }
  }, []);

  const handleQuery = useCallback(
    (qStr: string) => {
      const r = resolvePlace(qStr, fixture, flow);
      if (r.kind === "match") {
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
    if (stage === "evidence") {
      if (activeSheet === "chirps_rain") return { kind: "rain", values: null, dryPulse: true };
      if (activeSheet === "dem_strata") return { kind: "cropland", rainOutline: true };
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
    seasonYear,
    frontProgress,
    view,
    splitMode,
    flow.driestYears,
  ]);

  const sheets = useMemo((): SheetState[] => {
    if (view !== "stack" && stage !== "evidence") return [];
    const offsets = [0.96, 0.74, 0.52, 0.3, 0.1];
    return flow.layerStack.map((ls, idx) => ({
      id: ls.id,
      n: ls.n,
      label: ls.title,
      sub: `${ls.resolution} · ${ls.status}`,
      height: offsets[idx] ?? 0.2,
      opacity: 0.95,
      empty: ls.status === "Staged",
    }));
  }, [view, stage, flow.layerStack]);

  const activePins = useMemo((): LandPin[] => {
    if (view === "globe" || view === "stack") return [];
    if (stage === "hypotheses") {
      if (hypMode === "locked") {
        return flow.branchNodes.flatMap((b, idx) =>
          b.at
            ? [
                {
                  id: b.id,
                  at: b.at,
                  label: b.label,
                  sub: b.revision,
                  stem: 64 + (idx % 3) * 28,
                  kind: "locked" as const,
                  badge: "REV 1",
                },
              ]
            : [],
        );
      }
      return flow.branchNodes.flatMap((b, idx) =>
        b.at
          ? [
              {
                id: b.id,
                at: b.at,
                label: b.label,
                sub: b.outcomeTitle,
                stem: 64 + (idx % 3) * 28,
                kind:
                  b.status === "contradicted"
                    ? ("contradicted" as const)
                    : b.status === "cannot"
                      ? ("missing" as const)
                      : ("seen" as const),
                badge: FORMAL_TEXT[b.status],
              },
            ]
          : [],
      );
    }
    if (stage === "interventions") {
      const c = flow.pins[0]?.at ?? [-6.37, 31.64];
      const mid = flow.pins[1]?.at ?? [-6.39, 31.63];
      return [
        {
          id: "rest",
          at: c,
          label: protoCopy.agdalOpenRingLabel,
          sub: protoCopy.openRingTag,
          stem: 76,
          kind: "missing",
          badge: en["flow.cov.required"].text,
        },
        {
          id: "dry-year",
          at: mid,
          label: protoCopy.dryRuleFootprintLabel,
          sub: protoCopy.footprintTag,
          stem: 96,
          kind: "proposed",
        },
      ];
    }
    if (stage === "field" || view === "viewpoint") {
      return flow.groundChecks.flatMap((g, i) =>
        g.at
          ? [
              {
                id: g.id,
                at: g.at,
                label: g.label,
                sub: g.separates ?? g.short,
                stem: 58 + (i % 2) * 34,
                kind: "proposed" as const,
                ...(g.distanceLabel ? { distanceLabel: g.distanceLabel } : {}),
                ...(g.elevationDelta ? { elevationDelta: g.elevationDelta } : {}),
                ...(g.profilePts ? { profilePts: g.profilePts } : {}),
              },
            ]
          : [],
      );
    }
    return [];
  }, [view, stage, hypMode, flow.branchNodes, flow.pins, flow.groundChecks]);

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
    return { x: 1034, y: 156 };
  }, [view]);

  const briefText = flow.brief.find((b) => b.lang === brief);

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
          showStrata={view !== "globe"}
          activeSheetId={activeSheet}
          onSelectSheet={setActiveSheet}
          sheets={sheets}
          leaderFrom={leaderFrom}
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

      {activePins.length > 0 ? (
        <LandPins map={map} pins={activePins} open={openPin} onOpen={setOpenPin} />
      ) : null}

      {/* Top Tactical Command Bar */}
      <header className={styles.topBar}>
        <div className={styles.brandGroup}>
          <span className={styles.brandMark}>
            <Mark />
          </span>
          <span className={styles.brandName}>{en["flow.brand"].text}</span>
          <span className={styles.brandPack}>{protoCopy.packHeaderBadge}</span>
          <StatusBadges />
        </div>

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

        <div className={styles.topRight}>
          <div className={styles.opticGroup} role="group" aria-label={protoCopy.opticLabel}>
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
            className={styles.cutBtn}
            onClick={() => {
              setCutPlaying((c) => !c);
            }}
          >
            {cutPlaying ? <Pause /> : <Play />}
            {cutPlaying ? protoCopy.cutStop : protoCopy.cutPlay}
          </button>
        </div>
      </header>

      {/* Top Activity Strip (Stage 2 open, Stage 3 collapsible pill) */}
      {stage === "evidence" || (stage === "hypotheses" && stripOpen) ? (
        <AgentStrip
          steps={flow.steps}
          t={story.endsAt + 1}
          stopped={false}
          finished={true}
          open={stripOpen}
          onToggle={() => {
            setStripOpen((o) => !o);
          }}
          onStop={() => undefined}
        />
      ) : null}
      {stage === "hypotheses" && !stripOpen ? (
        <button
          type="button"
          className={styles.stripPill}
          onClick={() => {
            setStripOpen(true);
          }}
        >
          <span className={styles.demoTag}>{protoCopy.museBadge}</span>
          <span>{protoCopy.activityCollapsedPrefix}</span>
        </button>
      ) : null}

      {/* Left-Hand Instrument Dock per Stage */}
      {stage === "scope" && scopeMode === "globe" ? (
        <aside className={styles.leftDock} aria-label={en["flow.packs"].text}>
          <p className={styles.panelKey}>{protoCopy.globeTitle}</p>
          <span className={styles.rulerSub}>{protoCopy.globeSubtitle}</span>
          <span className={styles.demoTag}>{protoCopy.globeBiomesStat}</span>
          <p className={styles.panelKey}>{en["flow.packs"].text}</p>
          <button
            type="button"
            className={styles.packRow}
            data-loaded="true"
            onClick={() => {
              setNotice(null);
              setScopeMode("valley");
              setView("relief");
            }}
          >
            <div>
              <span className={styles.packName}>{flow.pack.name}</span>
              <span className={styles.packTheme}>{flow.pack.area}</span>
            </div>
            <StatusBadges />
          </button>
          {flow.otherPacks.map((p) => (
            <button
              key={p.id}
              type="button"
              className={styles.packRow}
              data-loaded="false"
              onClick={() => {
                if (p.coverage) setNotice(p.coverage);
              }}
            >
              <div>
                <span className={styles.packName}>{p.name}</span>
                <span className={styles.packTheme}>{p.theme}</span>
              </div>
              <span className={styles.covBadge} data-badge="notLoaded">
                {en["flow.cov.notLoaded"].text}
              </span>
            </button>
          ))}
          <p className={styles.panelKey}>{protoCopy.queryPromptLabel}</p>
          <form
            className={styles.searchForm}
            onSubmit={(e) => {
              e.preventDefault();
              handleQuery(queryText);
            }}
          >
            <input
              className={styles.input}
              value={queryText}
              onChange={(e) => {
                setQueryText(e.target.value);
              }}
              placeholder={en["flow.place.placeholder"].text}
              aria-label={en["flow.place.name"].text}
            />
            <button type="submit" className={styles.primary}>
              {en["flow.search"].text}
            </button>
          </form>
          <div className={styles.actions}>
            {flow.placeStarters.map((s) => (
              <button
                key={s.text}
                type="button"
                className={styles.pill}
                onClick={() => {
                  setQueryText(s.query);
                  handleQuery(s.query);
                }}
              >
                {s.text}
              </button>
            ))}
          </div>
          {notice ? <CoverageNote c={notice} /> : null}
        </aside>
      ) : null}

      {stage === "scope" && scopeMode === "valley" ? (
        <aside className={styles.leftDock} aria-label={protoCopy.scopeStrataTitle}>
          <p className={styles.panelKey}>{protoCopy.scopeStrataTitle}</p>
          <div className={styles.rulerCard}>
            <div className={styles.rulerTop}>
              <span>{protoCopy.scopeStratumLow}</span>
              <span className={styles.rulerSlope}>{protoCopy.strataLegendLow}</span>
            </div>
            <div className={styles.rulerTop}>
              <span>{protoCopy.scopeStratumMid}</span>
              <span className={styles.rulerSlope}>{protoCopy.strataLegendMid}</span>
            </div>
            <div className={styles.rulerTop}>
              <span>{protoCopy.scopeStratumHigh}</span>
              <span className={styles.rulerSlope}>{protoCopy.strataLegendHigh}</span>
            </div>
            <span className={styles.rulerSub}>{protoCopy.scopeAspectNote}</span>
          </div>
          <div className={styles.rulerCard}>
            <span className={styles.rulerSlope}>{protoCopy.baseline2025Badge}</span>
            <span className={styles.rulerSub}>{protoCopy.baseline2025Sub}</span>
          </div>
          <div className={styles.rulerCard}>
            <span className={styles.packName}>{protoCopy.pixelTrendHeader}</span>
            <span className={styles.rulerSlope}>{protoCopy.pixelTrendStats}</span>
            <span className={styles.rulerSub}>{protoCopy.pixelTrendFdr}</span>
            <span className={styles.rulerSub}>{protoCopy.pixelTrendClusters}</span>
          </div>
          <CoverageNote c={flow.pastureCoverage} />
        </aside>
      ) : null}

      {stage === "hypotheses" ? (
        <RulersDock strata={flow.restrendStrata} seasonYear={seasonYear} />
      ) : null}

      {stage === "interventions" ? <PrecedentDock flow={flow} /> : null}

      {stage === "field" || view === "viewpoint" ? <ViewpointHud flow={flow} /> : null}

      {view === "split" ? <SplitOverlay mode={splitMode} /> : null}

      {/* Right-Hand Receding HUD Investigation Card */}
      <aside className={styles.hudCard} aria-label={flow.placeTitle}>
        <header className={styles.cardHeader}>
          <span className={styles.panelKey}>{STAGE_TITLES[stage]}</span>
          <span className={styles.demoTag}>{protoCopy.cardRevTag}</span>
        </header>

        {stage === "scope" ? (
          <>
            <h2 className={styles.cardTitle}>{flow.pack.area}</h2>
            <p className={styles.cardLead}>
              {flow.analysis.detail}
              <Cite ns={[1, 2]} chips={flow.sources} down />
            </p>
            <p className={styles.cardGrey}>{flow.pack.boundary}</p>
            <div className={styles.metaBlock}>
              <span className={styles.metaKey}>{protoCopy.cardSourceTag}</span>
              <span className={styles.metaVal}>{protoCopy.stackCardSource}</span>
              <span className={styles.metaKey}>{protoCopy.cardMeaningTag}</span>
              <span className={styles.metaVal}>{protoCopy.baseline2025Badge}</span>
            </div>
            <p className={styles.panelKey}>{en["flow.pack.layers"].text}</p>
            <ul className={styles.branchList}>
              {flow.pack.layers.map((l) => (
                <li key={l.name} className={styles.branchItem}>
                  <div className={styles.branchRow}>
                    <span>{l.name}</span>
                    <span className={styles.rulerSub}>{l.span}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  if (scopeMode === "globe") {
                    setScopeMode("valley");
                    setView("relief");
                  } else {
                    setScopeMode("globe");
                    setView("globe");
                  }
                }}
              >
                {scopeMode === "globe" ? protoCopy.globeDiveBtn : protoCopy.globeReturnBtn}
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  selectStage("evidence");
                }}
              >
                {protoCopy.stage02}
              </button>
            </div>
          </>
        ) : null}

        {stage === "evidence" ? (
          <>
            <h2 className={styles.cardTitle}>{protoCopy.stackCardTitle}</h2>
            <p className={styles.cardLead}>
              {flow.steps[2]?.check}
              <Cite ns={[1, 2, 3]} chips={flow.sources} down />
            </p>
            <p className={styles.cardGrey}>{protoCopy.sourceHeading}</p>
            <div className={styles.metaBlock}>
              <span className={styles.metaKey}>{protoCopy.cardSourceTag}</span>
              <span className={styles.metaVal}>{protoCopy.stackCardSource}</span>
              <span className={styles.metaKey}>{protoCopy.cardMeaningTag}</span>
              <span className={styles.metaVal}>{protoCopy.stackCardMeaning}</span>
            </div>
            <ul className={styles.branchList}>
              {flow.layerStack.map((ls) => (
                <li key={ls.id} className={styles.branchItem}>
                  <div className={styles.branchRow}>
                    <span>
                      {ls.n}
                      {" · "}
                      {ls.title}
                    </span>
                    <span className={styles.demoTag}>{ls.status}</span>
                  </div>
                  <span className={styles.rulerSub}>
                    {ls.span}
                    {" · "}
                    {ls.resolution}
                  </span>
                </li>
              ))}
            </ul>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  selectStage("hypotheses");
                }}
              >
                {protoCopy.scoreTriggerBtn}
              </button>
            </div>
          </>
        ) : null}

        {stage === "hypotheses" ? (
          <>
            <div className={styles.subModeBar} role="tablist">
              {(
                [
                  ["locked", protoCopy.subLocked],
                  ["record", protoCopy.subRecord],
                  ["graph", protoCopy.subGraph],
                  ["trace", protoCopy.subTrace],
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

            {hypMode === "locked" ? (
              <>
                <h2 className={styles.cardTitle}>{protoCopy.lockedCardTitle}</h2>
                <p className={styles.cardLead}>{protoCopy.lockedInstruction}</p>
                <div className={styles.metaBlock}>
                  <span className={styles.metaKey}>{protoCopy.cardSourceTag}</span>
                  <span className={styles.metaVal}>{protoCopy.lockedCardSource}</span>
                  <span className={styles.metaKey}>{protoCopy.cardMeaningTag}</span>
                  <span className={styles.metaVal}>{protoCopy.lockedCardMeaning}</span>
                </div>
                <ul className={styles.branchList}>
                  {flow.branchNodes.map((b) => (
                    <li key={b.id} className={styles.branchItem}>
                      <div className={styles.branchRow}>
                        <span>{b.label}</span>
                        <span className={styles.demoTag}>{b.revision}</span>
                      </div>
                      <span className={styles.branchDetail}>{b.lockedPrediction}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {hypMode === "record" ? (
              <>
                <h2 className={styles.cardTitle}>{protoCopy.recordVerdictTitle}</h2>
                <p className={styles.cardLead}>
                  {protoCopy.recordVerdictClaim}
                  <Cite ns={[1, 2]} chips={flow.sources} down />
                </p>
                <p className={styles.cardGrey}>{protoCopy.recordVerdictGrey}</p>
                <div className={styles.metaBlock}>
                  <span className={styles.metaKey}>{protoCopy.cardSourceTag}</span>
                  <span className={styles.metaVal}>
                    {PIXEL_TREND_SUMMARY.bundleId}
                    {" · "}
                    {PIXEL_TREND_SUMMARY.medianTheilSenPerDecade}
                  </span>
                  <span className={styles.metaKey}>{protoCopy.cardMeaningTag}</span>
                  <span className={styles.metaVal}>{protoCopy.recordMeaning}</span>
                </div>
                <ul className={styles.branchList}>
                  {flow.branchNodes.slice(0, 4).map((b) => (
                    <li key={b.id} className={styles.branchItem}>
                      <div className={styles.branchRow}>
                        <span>{b.label}</span>
                        <span className={styles.verdict} data-v={b.status}>
                          {FORMAL_TEXT[b.status]}
                        </span>
                      </div>
                      <span className={styles.branchDetail}>{b.outcomeTitle}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {hypMode === "graph" ? (
              <>
                <h2 className={styles.cardTitle}>{protoCopy.graphCardTitle}</h2>
                <p className={styles.cardLead}>
                  {protoCopy.branchMergeSub}
                  <Cite ns={[1, 2, 3]} chips={flow.sources} down />
                </p>
                <div className={styles.metaBlock}>
                  <span className={styles.metaKey}>{protoCopy.cardSourceTag}</span>
                  <span className={styles.metaVal}>{protoCopy.graphCardSource}</span>
                  <span className={styles.metaKey}>{protoCopy.cardMeaningTag}</span>
                  <span className={styles.metaVal}>{protoCopy.graphCardMeaning}</span>
                </div>
                <ul className={styles.branchList}>
                  {flow.branchNodes.map((b) => (
                    <li key={b.id} className={styles.branchItem}>
                      <div className={styles.branchRow}>
                        <span>{b.label}</span>
                        <span className={styles.verdict} data-v={b.status}>
                          {FORMAL_TEXT[b.status]}
                        </span>
                      </div>
                      <span className={styles.branchDetail}>{b.outcomeDetail}</span>
                      <span className={styles.branchCheck}>
                        {protoCopy.branchOpenTarget}
                        {": "}
                        {b.separatingCheck}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {hypMode === "trace" ? (
              <>
                <h2 className={styles.cardTitle}>{protoCopy.traceTitle}</h2>
                <p className={styles.cardGrey}>{protoCopy.traceSub}</p>
                <div className={styles.traceBox}>
                  {flow.traceRecords.map((tr) => (
                    <div key={tr.id} className={styles.traceRow}>
                      <div className={styles.traceHead}>
                        <span>
                          {tr.id}
                          {" · "}
                          {tr.stepTitle}
                        </span>
                        <span className={styles.demoTag}>{tr.status}</span>
                      </div>
                      <span className={styles.traceMeta}>
                        {tr.actor}
                        {" · "}
                        {String(tr.durationMs)}
                        {" ms"}
                      </span>
                      <span className={styles.traceMeta}>{tr.validatorRule}</span>
                      <span className={styles.traceCode}>{tr.excerptOrPayload}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {stage === "interventions" ? (
          <>
            <h2 className={styles.cardTitle}>{protoCopy.stage4CardTitle}</h2>
            <p className={styles.cardLead}>
              {flow.optionsNote}
              <Cite ns={[3]} chips={flow.sources} down />
            </p>
            <div className={styles.metaBlock}>
              <span className={styles.metaKey}>{protoCopy.cardSourceTag}</span>
              <span className={styles.metaVal}>{protoCopy.stage4CardSource}</span>
              <span className={styles.metaKey}>{protoCopy.cardMeaningTag}</span>
              <span className={styles.metaVal}>{protoCopy.stage4CardMeaning}</span>
            </div>
            <ul className={styles.branchList}>
              {flow.options.map((o) => (
                <li key={o.id} className={styles.branchItem}>
                  <div className={styles.branchRow}>
                    <span>{o.title}</span>
                    <span className={styles.demoTag}>
                      {o.group === "precedent"
                        ? en["flow.precedent"].text
                        : en["flow.noPrecedent"].text}
                    </span>
                  </div>
                  <span className={styles.branchDetail}>{o.evidence}</span>
                  <span className={styles.branchCheck}>
                    {en["flow.decision"].text}
                    {": "}
                    {o.decides}
                  </span>
                </li>
              ))}
            </ul>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  selectStage("field");
                }}
              >
                {protoCopy.stage05}
              </button>
            </div>
          </>
        ) : null}

        {stage === "field" ? (
          <>
            <h2 className={styles.cardTitle}>{protoCopy.stage5CardTitle}</h2>
            <p className={styles.cardLead}>
              {protoCopy.stage5CardMeaning}
              <Cite ns={[1, 2, 3]} chips={flow.sources} down />
            </p>
            <div className={styles.metaBlock}>
              <span className={styles.metaKey}>{protoCopy.cardSourceTag}</span>
              <span className={styles.metaVal}>{protoCopy.stage5CardSource}</span>
              <span className={styles.metaKey}>{protoCopy.cardMeaningTag}</span>
              <span className={styles.metaVal}>{protoCopy.briefPrintHint}</span>
            </div>
            <ul className={styles.branchList}>
              {flow.groundChecks.map((g) => (
                <li key={g.id} className={styles.branchItem}>
                  <div className={styles.branchRow}>
                    <span>{g.label}</span>
                    <span className={styles.rulerSub}>{g.short}</span>
                  </div>
                  <span className={styles.branchDetail}>{g.what}</span>
                  {g.separates ? <span className={styles.branchCheck}>{g.separates}</span> : null}
                </li>
              ))}
            </ul>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  setBrief("en");
                }}
              >
                {protoCopy.briefOpenEnBtn}
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  setBrief("fr");
                }}
              >
                {protoCopy.briefOpenFrBtn}
              </button>
            </div>
          </>
        ) : null}
      </aside>

      {/* Bottom Camera View Switcher & Synchronized 26-Season Scrubber */}
      <div className={styles.bottomBar}>
        <div className={styles.viewBar} role="toolbar" aria-label={protoCopy.viewLabel}>
          <button
            type="button"
            className={styles.viewBtn}
            data-active={view === "globe" ? "true" : "false"}
            onClick={() => {
              setStage("scope");
              setScopeMode("globe");
              setView("globe");
            }}
          >
            {protoCopy.globeReturnBtn}
          </button>
          {VIEW_PILLS.map((vp) => (
            <button
              key={vp.id}
              type="button"
              className={styles.viewBtn}
              data-active={view === vp.id ? "true" : "false"}
              onClick={() => {
                setView(vp.id);
                if (vp.id === "stack") setStage("evidence");
                else if (vp.id === "timerecord") {
                  setStage("hypotheses");
                  setHypMode("record");
                  setFrontProgress(0.72);
                } else if (vp.id === "viewpoint") setStage("field");
              }}
            >
              {vp.label}
            </button>
          ))}
          {view === "split" ? (
            <button
              type="button"
              className={styles.pill}
              onClick={() => {
                setSplitMode((m) => (m === 1 ? 2 : m === 2 ? 3 : 1));
              }}
            >
              {splitMode === 1
                ? protoCopy.splitMode1
                : splitMode === 2
                  ? protoCopy.splitMode2
                  : protoCopy.splitMode3}
            </button>
          ) : null}
        </div>

        {stage === "hypotheses" && hypMode === "record" && catchmentStratum ? (
          <div className={styles.scrubberBar}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                setPlayingRecord((p) => !p);
              }}
            >
              {playingRecord ? <Pause /> : <Play />}
              {playingRecord ? protoCopy.seasonPauseBtn : protoCopy.seasonPlayBtn}
            </button>
            <div className={styles.seasonTracks}>
              {catchmentStratum.seasons.map((s) => {
                const h = Math.max(6, Math.round(((s.ndvi - 0.18) / 0.05) * 28));
                return (
                  <button
                    key={s.year}
                    type="button"
                    className={styles.seasonTick}
                    style={{ height: `${String(h)}px` }}
                    data-dry={s.dryPulse ? "true" : "false"}
                    data-active={s.year === seasonYear ? "true" : "false"}
                    title={`${String(s.year)}: NDVI ${s.ndvi.toFixed(4)}, ${String(Math.round(s.rainMm))} mm`}
                    onClick={() => {
                      setSeasonYear(s.year);
                      setFrontProgress((s.year - 2000) / 25);
                    }}
                  />
                );
              })}
            </div>
            <div>
              <span className={styles.packName}>
                {protoCopy.yearPrefix} {String(seasonYear)}
                {" · "}
                {protoCopy.ndviLabel} {currentSeasonObj?.ndvi.toFixed(4)}
                {" · "}
                {String(Math.round(currentSeasonObj?.rainMm ?? 0))} {protoCopy.rainUnit}
              </span>
              <span className={styles.packTheme}>
                {currentSeasonObj?.dryPulse
                  ? protoCopy.seasonDryYearAlert
                  : protoCopy.scanFrontLabel}
              </span>
            </div>
          </div>
        ) : null}
      </div>

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
