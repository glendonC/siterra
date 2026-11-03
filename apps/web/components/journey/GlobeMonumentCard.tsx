"use client";

import type { Ref } from "react";
import { en, format } from "../../lib/copy/en";
import { placeHref, type OtherPlace } from "../../lib/globe/places";
import { SiterraMark, ThemeIcon } from "../opening/Opening";
import { cardQuestion, formatLatLon } from "./globe-choice";
import {
  cleanPlaceLabel,
  type ActivePlaceDisplay,
  type CustomGlobeLocation,
  type GlobeCase,
} from "./globe-place-helpers";
import styles from "./Journey.module.css";

export function GlobeMonumentCard({
  cases,
  cardRef,
  customLocation,
  pointInWater,
  pointReady,
  activePlaceDisplay,
  activeStep,
  activeQuestionText,
  opened,
  launching,
  onPrimaryAction,
}: {
  cases: readonly GlobeCase[];
  cardRef: Ref<HTMLDivElement>;
  customLocation?: CustomGlobeLocation | null;
  pointInWater: boolean;
  pointReady: boolean;
  activePlaceDisplay: ActivePlaceDisplay;
  activeStep: 1 | 2;
  activeQuestionText: string;
  opened: boolean;
  launching: boolean;
  onPrimaryAction: () => void;
}) {
  return (
    <ul className={styles.cases} aria-label={en["globe.cases"].text}>
      {cases.slice(0, 1).map((c) => {
        const coordsLabel = customLocation
          ? formatLatLon(customLocation.lat, customLocation.lon)
          : "";
        const customName = customLocation
          ? cleanPlaceLabel(customLocation.placeName, customLocation.regionName)
          : "";
        // Open water reads with its coordinates, e.g. "Open water · 13.31° N, 19.35° W".
        const displayPlace = customLocation
          ? pointInWater && customName && !customName.includes("°")
            ? `${customName} · ${coordsLabel}`
            : customName || coordsLabel
          : format("globe.place", { place: c.place, region: c.region });
        // The card shows only the place while it is being chosen; the question joins it in step 2.
        const shownQuestion = cardQuestion(activeStep, activeQuestionText);

        return (
          <li key={c.id}>
            <div
              ref={cardRef}
              className={styles.globeMonumentCard}
              data-case-card={c.id}
              data-diving={opened ? "" : undefined}
              onClick={() => {
                if (!opened) onPrimaryAction();
              }}
            >
              <div className={styles.monumentTopRow}>
                <span className={styles.monumentSignal}>
                  <span
                    className={styles.monumentSignalDot}
                    data-tone={customLocation ? "yellow" : "blue"}
                  />
                  <span className={styles.monumentKicker}>
                    {coordsLabel || activePlaceDisplay.coords}
                  </span>
                </span>
                {pointReady ? (
                  <span className={styles.monumentActionPrompt}>
                    <kbd className={styles.monumentActionKey}>{"↵"}</kbd>
                    <span>
                      {opened
                        ? "DIVING"
                        : launching
                          ? "STARTING"
                          : activeStep === 1
                            ? "SELECT"
                            : "START"}
                    </span>
                  </span>
                ) : null}
              </div>
              <p className={styles.casePlace}>{displayPlace}</p>
              {pointInWater && customLocation ? (
                <p className={styles.caseNote} data-card-note="">
                  {customLocation.surface === "unknown"
                    ? "The globe could not check this point. Pick a named place."
                    : "Pick a point on land or a coast to ask a question here."}
                </p>
              ) : null}
              {shownQuestion ? (
                <p className={styles.caseQuestion} data-card-question="">
                  {shownQuestion}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function GlobeSetupTopBar({
  onBack,
  theme,
  onToggleTheme,
}: {
  onBack?: () => void;
  theme: "light" | "obsidian";
  onToggleTheme?: () => void;
}) {
  return (
    <header className={styles.setupTopBar}>
      <button
        type="button"
        className={styles.setupBrandBtn}
        onClick={onBack}
        aria-label={"Return to Siterra opening page"}
      >
        <SiterraMark className={styles.setupBrandMark} />
        <span className={styles.setupBrandName}>{en["opening.title"].text}</span>
      </button>

      <div className={styles.setupTopRight}>
        {onToggleTheme ? (
          <button
            type="button"
            className={styles.setupThemeBtn}
            onClick={onToggleTheme}
            aria-label={
              theme === "obsidian"
                ? "Switch to warm paper light mode"
                : "Switch to obsidian dark mode"
            }
          >
            <ThemeIcon theme={theme} />
          </button>
        ) : null}
      </div>
    </header>
  );
}

export function GlobeBottomChrome({
  activeStep,
  launching,
  pointReady,
  others,
  onEscapeAction,
  onScanWholeArea,
  onPrimaryAction,
}: {
  activeStep: 1 | 2;
  launching: boolean;
  pointReady: boolean;
  others: readonly OtherPlace[];
  onEscapeAction: () => void;
  onScanWholeArea: () => void;
  onPrimaryAction: () => void;
}) {
  return (
    <>
      <div className={styles.globeContextualHud} aria-label={"3D Globe controls"}>
        <span className={styles.globeHudItem}>
          <kbd className={styles.globeHudKey}>{"DRAG"}</kbd>
          <span>{"Rotate Earth"}</span>
        </span>
        <span className={styles.globeHudItem}>
          <kbd className={styles.globeHudKey}>{"CLICK"}</kbd>
          <span>{"Pick any spot on Earth"}</span>
        </span>
      </div>

      <div className={styles.detroitBottomBar}>
        <button
          type="button"
          className={styles.detroitKeyAction}
          disabled={launching}
          onClick={onEscapeAction}
        >
          <kbd className={styles.detroitKeyCap}>{"ESC"}</kbd>
          <span>{activeStep === 2 ? "CHANGE PLACE" : "BACK"}</span>
        </button>
        <button
          type="button"
          className={styles.detroitKeyAction}
          disabled={launching || !pointReady}
          onClick={onScanWholeArea}
        >
          <kbd className={styles.detroitKeyCap}>{"SPACE"}</kbd>
          <span>{"SCAN WHOLE AREA"}</span>
        </button>
        <button
          type="button"
          className={styles.detroitKeyAction}
          disabled={launching || !pointReady}
          onClick={onPrimaryAction}
        >
          <kbd className={styles.detroitKeyCapPrimary}>{"↵"}</kbd>
          <span>{activeStep === 1 ? "CHOOSE FOCUS" : "START INVESTIGATION"}</span>
        </button>
      </div>

      {others.length ? (
        <nav className={styles.srOnlyOthers} aria-label={en["globe.others"].text}>
          {others.map((p) => (
            <a key={p.caseId} href={placeHref(p.caseId)} data-other-place={p.caseId}>
              {format("globe.place", { place: p.name, region: p.region })}
            </a>
          ))}
        </nav>
      ) : null}
    </>
  );
}
