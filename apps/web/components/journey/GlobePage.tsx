"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
  type SyntheticEvent,
} from "react";
import type { OtherPlace } from "../../lib/globe/places";
import { formatLatLon, launchStatus, startOutcome, type StartOutcome } from "./globe-choice";
import {
  GlobeBottomChrome,
  GlobeMonumentCard,
  GlobeSetupTopBar,
} from "./GlobeMonumentCard";
import {
  GlobeStepOnePanel,
  GlobeStepTwoPanel,
  useGlobeSetupKeyboard,
} from "./GlobeStepPanels";
import {
  buildDisplayedPlaceItems,
  parseCoordinateInput,
  resolveActivePlaceDisplay,
  resolveQuestionsForCurrentPlace,
  useWorldwideGeocodeSearch,
  type CustomGlobeLocation,
  type GlobeCase,
} from "./globe-place-helpers";
import styles from "./Journey.module.css";

export { formatLatLon, type CustomGlobeLocation, type GlobeCase };

export function GlobePage({
  cases,
  savedCases = [],
  allSavedCases = [],
  others = [],
  cardRef,
  onOpen,
  onSelectSavedCase,
  onBack,
  onBackToOpening,
  opened = false,
  selectedCaseId,
  customLocation,
  onSelectLocation,
  onLaunchCustomCase,
  registerPrimaryAction,
  onStartingChange,
  theme = "light",
  onToggleTheme,
}: {
  others?: readonly OtherPlace[];
  cases: GlobeCase[];
  savedCases?: readonly GlobeCase[];
  allSavedCases?: readonly GlobeCase[];
  cardRef: Ref<HTMLDivElement>;
  onOpen: (question?: string, targetCase?: GlobeCase, entryMode?: "run" | "briefing") => void;
  onSelectSavedCase?: (savedCase: GlobeCase) => void;
  onBack?: () => void;
  onBackToOpening?: () => void;
  opened?: boolean;
  selectedCaseId?: string;
  customLocation?: CustomGlobeLocation | null;
  onSelectLocation?: (loc: CustomGlobeLocation) => void;
  onLaunchCustomCase?: (caseId: string, question?: string) => void;
  registerPrimaryAction?: (fn: () => void) => void;
  /** Told when a start begins or ends here, so the globe takes no new point under "Starting". */
  onStartingChange?: (starting: boolean) => void;
  theme?: "light" | "obsidian";
  onToggleTheme?: () => void;
}) {
  // Step 1 shows location selection on arrival; Step 2 collapses Step 1 into a summary line and reveals questions.
  const [activeStep, setActiveStep] = useState<1 | 2>(1);
  const [qIdx, setQIdx] = useState(0);
  const [customQuestionInput, setCustomQuestionInput] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [highlightedPlaceIdx, setHighlightedPlaceIdx] = useState<number | null>(null);
  const [launchingCustom, setLaunchingCustom] = useState(false);
  // A start begun from this page folds step 2 to its question and displays the starting state.
  const [launch, setLaunch] = useState<{ question: string; status: string } | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const customQuestionRef = useRef<HTMLInputElement | null>(null);

  const { geocodeResults, searching } = useWorldwideGeocodeSearch(placeQuery);

  const studiedCases = useMemo(() => {
    const base =
      savedCases.length > 0 ? savedCases : allSavedCases.length > 0 ? allSavedCases : cases;
    const filtered = base.filter(
      (c) => !c.id.startsWith("case_loc_selected_") && !/^selected\b/i.test(c.place.trim()),
    );
    return filtered.length > 0 ? filtered : base;
  }, [savedCases, allSavedCases, cases]);

  const activeSavedCase = useMemo(
    () =>
      studiedCases.find((c) => c.id === selectedCaseId || c.seedCaseId === selectedCaseId) ??
      cases[0] ??
      studiedCases[0],
    [studiedCases, selectedCaseId, cases],
  );

  const activePlaceDisplay = useMemo(
    () => resolveActivePlaceDisplay(customLocation, activeSavedCase),
    [customLocation, activeSavedCase],
  );

  const questionsForCurrentPlace = useMemo(
    () => resolveQuestionsForCurrentPlace(customLocation, activeSavedCase),
    [customLocation, activeSavedCase],
  );

  useEffect(() => {
    setQIdx(0);
    setCustomQuestionInput("");
  }, [activeSavedCase?.id, activeSavedCase?.seedCaseId, customLocation?.lat, customLocation?.lon]);

  // A picked point advances to step 2 once it has its name, and never from open water.
  const pointReady =
    !customLocation || (!customLocation.resolving && customLocation.investigable !== false);
  const pointInWater = customLocation?.investigable === false && !customLocation.resolving;
  const [advanceWhenReady, setAdvanceWhenReady] = useState(false);

  useEffect(() => {
    if (!advanceWhenReady || !customLocation || customLocation.resolving) return;
    setAdvanceWhenReady(false);
    if (customLocation.investigable !== false) setActiveStep(2);
  }, [advanceWhenReady, customLocation]);

  useEffect(() => {
    if (customLocation?.investigable === false) setActiveStep(1);
  }, [customLocation]);

  const handleLaunchCustomLocation = useCallback(
    async (questionOverride?: string) => {
      if (!customLocation || launchingCustom || !pointReady) return;
      const chosenQ =
        questionOverride ||
        customQuestionInput.trim() ||
        questionsForCurrentPlace[qIdx] ||
        (questionsForCurrentPlace[0] ?? "");
      setLaunchingCustom(true);
      setLaunchError(null);
      setLaunch({ question: chosenQ, status: launchStatus("new") });
      let outcome: StartOutcome;
      try {
        const res = await fetch("/api/cases/from-location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lon: customLocation.lon,
            lat: customLocation.lat,
            placeName: customLocation.placeName,
            regionName: customLocation.regionName,
            question: chosenQ,
          }),
        });
        outcome = startOutcome(res.status, await res.json().catch(() => null));
      } catch {
        outcome = startOutcome(null, null);
      }
      if ("caseId" in outcome) {
        if (onLaunchCustomCase) {
          onLaunchCustomCase(outcome.caseId, chosenQ);
        } else {
          window.location.href = `/?case=${encodeURIComponent(outcome.caseId)}&dive=1&mode=run&q=${encodeURIComponent(chosenQ)}`;
        }
        return;
      }
      setLaunchingCustom(false);
      setLaunch(null);
      setLaunchError(outcome.failure);
    },
    [
      customLocation,
      launchingCustom,
      pointReady,
      customQuestionInput,
      questionsForCurrentPlace,
      qIdx,
      onLaunchCustomCase,
    ],
  );

  const startStudiedCase = useCallback(
    (question: string) => {
      if (!activeSavedCase) return;
      setLaunchError(null);
      setLaunch({ question, status: launchStatus("studied") });
      onOpen(question, activeSavedCase, "run");
    },
    [activeSavedCase, onOpen],
  );

  const activeIdx = qIdx < questionsForCurrentPlace.length ? qIdx : 0;
  const activeQuestionText =
    customQuestionInput.trim() ||
    questionsForCurrentPlace[activeIdx] ||
    activeSavedCase?.question ||
    (questionsForCurrentPlace[0] ?? "");

  const triggerLaunch = useCallback(() => {
    if (!pointReady || launch) return;
    if (customLocation) {
      void handleLaunchCustomLocation(activeQuestionText);
    } else {
      startStudiedCase(activeQuestionText);
    }
  }, [
    pointReady,
    launch,
    customLocation,
    handleLaunchCustomLocation,
    activeQuestionText,
    startStudiedCase,
  ]);

  const handleSelectStudiedCase = useCallback(
    (sc: GlobeCase) => {
      onSelectSavedCase?.(sc);
      setPlaceQuery("");
      setHighlightedPlaceIdx(null);
      setAdvanceWhenReady(false);
      setActiveStep(2);
    },
    [onSelectSavedCase],
  );

  const handleSelectWorldLocation = useCallback(
    (loc: CustomGlobeLocation) => {
      onSelectLocation?.(loc);
      setPlaceQuery("");
      setHighlightedPlaceIdx(null);
      setAdvanceWhenReady(true);
    },
    [onSelectLocation],
  );

  const handlePrimaryKeyOrAction = useCallback(() => {
    if (activeStep === 1) {
      if (pointReady) setActiveStep(2);
    } else {
      triggerLaunch();
    }
  }, [activeStep, pointReady, triggerLaunch]);

  useEffect(() => {
    registerPrimaryAction?.(handlePrimaryKeyOrAction);
  }, [registerPrimaryAction, handlePrimaryKeyOrAction]);

  useEffect(() => {
    onStartingChange?.(launch !== null);
  }, [launch, onStartingChange]);

  useGlobeSetupKeyboard({
    opened,
    launching: Boolean(launch),
    activeStep,
    pointReady,
    studiedCases,
    questionsCount: questionsForCurrentPlace.length,
    searchInputRef,
    customQuestionRef,
    setActiveStep,
    setCustomQuestionInput,
    setQIdx,
    onSelectStudiedCase: handleSelectStudiedCase,
    onTriggerLaunch: triggerLaunch,
  });

  const parsedCoords = useMemo(() => parseCoordinateInput(placeQuery), [placeQuery]);

  const matchingStudiedCases = useMemo(() => {
    const q = placeQuery.trim().toLowerCase();
    if (!q) return [];
    return studiedCases.filter(
      (sc) => sc.place.toLowerCase().includes(q) || sc.region.toLowerCase().includes(q),
    );
  }, [studiedCases, placeQuery]);

  const displayedPlaceItems = useMemo(
    () =>
      buildDisplayedPlaceItems({
        placeQuery,
        customLocation,
        activePlaceDisplay,
        pointInWater,
        pointReady,
        studiedCases,
        activeSavedCaseId: activeSavedCase?.id,
        parsedCoords,
        matchingStudiedCases,
        geocodeResults,
        onContinueCustomPoint: () => {
          if (pointReady) setActiveStep(2);
        },
        onSelectStudiedCase: handleSelectStudiedCase,
        onSelectWorldLocation: handleSelectWorldLocation,
      }),
    [
      placeQuery,
      customLocation,
      activePlaceDisplay,
      pointInWater,
      pointReady,
      studiedCases,
      activeSavedCase?.id,
      parsedCoords,
      matchingStudiedCases,
      geocodeResults,
      handleSelectStudiedCase,
      handleSelectWorldLocation,
    ],
  );

  const handlePlaceSearchSubmit = useCallback(
    (e: SyntheticEvent) => {
      e.preventDefault();
      const targetIdx =
        highlightedPlaceIdx !== null && displayedPlaceItems[highlightedPlaceIdx]
          ? highlightedPlaceIdx
          : 0;
      const target = displayedPlaceItems[targetIdx];
      if (target) {
        target.onSelect();
      }
    },
    [highlightedPlaceIdx, displayedPlaceItems],
  );

  return (
    <div className={styles.page}>
      <GlobeMonumentCard
        cases={cases}
        cardRef={cardRef}
        customLocation={customLocation}
        pointInWater={pointInWater}
        pointReady={pointReady}
        activePlaceDisplay={activePlaceDisplay}
        activeStep={activeStep}
        activeQuestionText={activeQuestionText}
        opened={opened}
        launching={Boolean(launch)}
        onPrimaryAction={handlePrimaryKeyOrAction}
      />

      <div
        className={styles.setupStage}
        data-opened={opened ? "" : undefined}
        inert={opened}
        aria-hidden={opened ? "true" : undefined}
      >
        <div className={styles.detroitAtmosphere} aria-hidden="true" />

        <GlobeSetupTopBar
          onBack={onBack ?? onBackToOpening}
          theme={theme}
          onToggleTheme={onToggleTheme}
        />

        <div className={styles.dbhCanvas} data-launching={launch ? "" : undefined}>
          <GlobeStepOnePanel
            activeStep={activeStep}
            activePlaceDisplay={activePlaceDisplay}
            placeQuery={placeQuery}
            searching={searching}
            highlightedPlaceIdx={highlightedPlaceIdx}
            displayedPlaceItems={displayedPlaceItems}
            searchInputRef={searchInputRef}
            onReturnToStepOne={() => {
              setActiveStep(1);
            }}
            onPlaceQueryChange={(val) => {
              setPlaceQuery(val);
              setHighlightedPlaceIdx(val.trim() ? 0 : null);
            }}
            onHighlightPlaceIdx={setHighlightedPlaceIdx}
            onClearSearch={() => {
              setPlaceQuery("");
              setHighlightedPlaceIdx(null);
            }}
            onPlaceSearchSubmit={handlePlaceSearchSubmit}
          />

          {activeStep === 2 ? (
            <GlobeStepTwoPanel
              launch={launch}
              launchError={launchError}
              questionsForCurrentPlace={questionsForCurrentPlace}
              activeIdx={activeIdx}
              customQuestionInput={customQuestionInput}
              customQuestionRef={customQuestionRef}
              onSelectPresetQuestion={(i, qText, wasSelected) => {
                setCustomQuestionInput("");
                setQIdx(i);
                if (wasSelected) {
                  if (customLocation) {
                    void handleLaunchCustomLocation(qText);
                  } else {
                    startStudiedCase(qText);
                  }
                }
              }}
              onDoubleClickPresetQuestion={(i, qText) => {
                setCustomQuestionInput("");
                setQIdx(i);
                if (customLocation) {
                  void handleLaunchCustomLocation(qText);
                } else {
                  startStudiedCase(qText);
                }
              }}
              onCustomQuestionChange={setCustomQuestionInput}
              onTriggerLaunch={triggerLaunch}
            />
          ) : null}

          {launch ? (
            <section className={styles.dbhLaunch} role="status" data-launch="">
              <p className={styles.dbhLaunchWord}>{"Starting"}</p>
              <p className={styles.dbhLaunchStatus}>{launch.status}</p>
            </section>
          ) : null}
        </div>

        <GlobeBottomChrome
          activeStep={activeStep}
          launching={Boolean(launch)}
          pointReady={pointReady}
          others={others}
          onEscapeAction={() => {
            if (activeStep === 2) {
              setActiveStep(1);
            } else {
              (onBack ?? onBackToOpening)?.();
            }
          }}
          onScanWholeArea={triggerLaunch}
          onPrimaryAction={handlePrimaryKeyOrAction}
        />
      </div>
    </div>
  );
}
