"use client";

import { useEffect, type CSSProperties, type RefObject, type SyntheticEvent } from "react";
import {
  isTypingTarget,
  type ActivePlaceDisplay,
  type DisplayedPlaceItem,
  type GlobeCase,
} from "./globe-place-helpers";
import styles from "./Journey.module.css";

export function useGlobeSetupKeyboard(params: {
  opened: boolean;
  launching: boolean;
  activeStep: 1 | 2;
  pointReady: boolean;
  studiedCases: readonly GlobeCase[];
  questionsCount: number;
  searchInputRef: RefObject<HTMLInputElement | null>;
  customQuestionRef: RefObject<HTMLInputElement | null>;
  setActiveStep: (step: 1 | 2) => void;
  setCustomQuestionInput: (value: string) => void;
  setQIdx: (idx: number) => void;
  onSelectStudiedCase: (sc: GlobeCase) => void;
  onTriggerLaunch: () => void;
}): void {
  const {
    opened,
    launching,
    activeStep,
    pointReady,
    studiedCases,
    questionsCount,
    searchInputRef,
    customQuestionRef,
    setActiveStep,
    setCustomQuestionInput,
    setQIdx,
    onSelectStudiedCase,
    onTriggerLaunch,
  } = params;

  useEffect(() => {
    if (opened) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (launching) return;

      if (e.key === "/") {
        e.preventDefault();
        setActiveStep(1);
        window.setTimeout(() => searchInputRef.current?.focus(), 20);
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        if (!pointReady) return;
        setActiveStep(2);
        window.setTimeout(() => customQuestionRef.current?.focus(), 20);
        return;
      }

      if (e.key === " ") {
        e.preventDefault();
        onTriggerLaunch();
        return;
      }

      if (e.key === "Backspace") {
        if (activeStep === 2) {
          e.preventDefault();
          setActiveStep(1);
        }
        return;
      }

      if (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") {
        const idx = Number(e.key) - 1;
        if (activeStep === 1) {
          const targetCase = studiedCases[idx];
          if (targetCase) {
            e.preventDefault();
            onSelectStudiedCase(targetCase);
          }
        } else if (idx < questionsCount) {
          e.preventDefault();
          setCustomQuestionInput("");
          setQIdx(idx);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [
    opened,
    launching,
    activeStep,
    pointReady,
    studiedCases,
    questionsCount,
    searchInputRef,
    customQuestionRef,
    setActiveStep,
    setCustomQuestionInput,
    setQIdx,
    onSelectStudiedCase,
    onTriggerLaunch,
  ]);
}

export function GlobeStepOnePanel({
  activeStep,
  activePlaceDisplay,
  placeQuery,
  searching,
  highlightedPlaceIdx,
  displayedPlaceItems,
  searchInputRef,
  onReturnToStepOne,
  onPlaceQueryChange,
  onHighlightPlaceIdx,
  onClearSearch,
  onPlaceSearchSubmit,
}: {
  activeStep: 1 | 2;
  activePlaceDisplay: ActivePlaceDisplay;
  placeQuery: string;
  searching: boolean;
  highlightedPlaceIdx: number | null;
  displayedPlaceItems: readonly DisplayedPlaceItem[];
  searchInputRef: RefObject<HTMLInputElement | null>;
  onReturnToStepOne: () => void;
  onPlaceQueryChange: (value: string) => void;
  onHighlightPlaceIdx: (updater: number | null | ((prev: number | null) => number | null)) => void;
  onClearSearch: () => void;
  onPlaceSearchSubmit: (e: SyntheticEvent) => void;
}) {
  return (
    <section
      className={styles.dbhStepOne}
      data-completed={activeStep === 2 ? "" : undefined}
      aria-label={"Step 1 of 2: Location"}
    >
      <div
        className={styles.dbhStepHeader}
        onClick={() => {
          if (activeStep === 2) onReturnToStepOne();
        }}
      >
        <div className={styles.dbhFraction} aria-hidden="true">
          <span className={styles.dbhFractionNum}>{"1"}</span>
          <span className={styles.dbhFractionSlash}>{"/2"}</span>
        </div>

        <div className={styles.dbhStepHeadContent}>
          <h2 className={styles.dbhQuestion}>{"Where in the world are we investigating?"}</h2>

          {activeStep === 2 ? (
            <button
              type="button"
              className={styles.dbhDoneSummaryBtn}
              onClick={onReturnToStepOne}
            >
              <span className={styles.dbhDoneAnswerRow}>
                <span className={styles.dbhDoneAnswerPrimary}>{activePlaceDisplay.title}</span>
                {activePlaceDisplay.coords ? (
                  <span className={styles.dbhDoneAnswerCoords}>{activePlaceDisplay.coords}</span>
                ) : null}
                <span className={styles.dbhDoneChangePrompt}>
                  <kbd className={styles.keycapDark}>{"⌫"}</kbd>
                  <span>{"CHANGE"}</span>
                </span>
              </span>
            </button>
          ) : null}
        </div>
      </div>

      {activeStep === 1 ? (
        <div className={styles.dbhStepOneBody}>
          <div className={styles.dbhSearchSection}>
            <form
              onSubmit={onPlaceSearchSubmit}
              className={styles.dbhUnderlineForm}
              data-active={placeQuery.trim() ? "" : undefined}
              data-searching={searching ? "" : undefined}
            >
              <kbd
                className={placeQuery.trim() ? styles.keycapBlue : styles.keycapDark}
                aria-hidden="true"
              >
                {"/"}
              </kbd>
              <input
                ref={searchInputRef}
                type="text"
                value={placeQuery}
                onChange={(e) => {
                  onPlaceQueryChange(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    if (displayedPlaceItems.length > 0) {
                      onHighlightPlaceIdx((prev) =>
                        prev === null ? 0 : (prev + 1) % displayedPlaceItems.length,
                      );
                    }
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    if (displayedPlaceItems.length > 0) {
                      onHighlightPlaceIdx((prev) =>
                        prev === null
                          ? displayedPlaceItems.length - 1
                          : (prev - 1 + displayedPlaceItems.length) % displayedPlaceItems.length,
                      );
                    }
                  } else if (e.key === "Escape" && placeQuery) {
                    e.preventDefault();
                    e.stopPropagation();
                    onClearSearch();
                  }
                }}
                placeholder={"Search any place, valley, or coordinates (or click 3D globe)..."}
                className={styles.dbhUnderlineInput}
                aria-label={"Search any location or coordinates in the world"}
              />
              {placeQuery.trim() ? (
                <div className={styles.dbhInputRightGroup}>
                  {searching ? <span className={styles.dbhSearchingTag}>{"SEARCHING"}</span> : null}
                  <button
                    type="button"
                    className={styles.dbhInlinePrompt}
                    onClick={() => {
                      onClearSearch();
                      searchInputRef.current?.focus();
                    }}
                  >
                    <kbd className={styles.keycapDark}>{"ESC"}</kbd>
                    <span>{"CLEAR"}</span>
                  </button>
                </div>
              ) : null}
              <span className={styles.dbhInputTrace} aria-hidden="true" />
            </form>

            <ul
              className={styles.dbhOptionList}
              role="listbox"
              aria-label={"Locations"}
              onMouseLeave={() => {
                if (!placeQuery.trim()) {
                  onHighlightPlaceIdx(null);
                }
              }}
            >
              {displayedPlaceItems.map((item, idx) => {
                const isFocusedItem =
                  highlightedPlaceIdx !== null
                    ? highlightedPlaceIdx === idx
                    : placeQuery.trim() !== ""
                      ? idx === 0
                      : item.isSelected;
                return (
                  <li
                    key={item.key}
                    className={styles.dbhPlaceListItem}
                    style={
                      {
                        "--item-idx": idx,
                      } as CSSProperties
                    }
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={isFocusedItem}
                      data-selected={item.isSelected ? "" : undefined}
                      data-highlighted={isFocusedItem ? "" : undefined}
                      className={styles.dbhBareOption}
                      onMouseEnter={() => {
                        onHighlightPlaceIdx(idx);
                      }}
                      onFocus={() => {
                        onHighlightPlaceIdx(idx);
                      }}
                      onClick={item.onSelect}
                    >
                      <span className={styles.dbhPlaceMainRow}>
                        <span className={styles.dbhOptionLabel}>{item.title}</span>
                        {item.shortcutKey ? (
                          <span className={styles.dbhOptionAction}>
                            <kbd
                              className={isFocusedItem ? styles.keycapBlue : styles.keycapDark}
                            >
                              {item.shortcutKey}
                            </kbd>
                            <span className={styles.dbhActionWord}>{item.actionWord}</span>
                          </span>
                        ) : null}
                      </span>

                      <span className={styles.dbhPlaceDetailWrap} aria-hidden="true">
                        <span className={styles.dbhPlaceDetailInner}>{item.detail}</span>
                      </span>
                    </button>
                  </li>
                );
              })}

              {placeQuery.trim().length >= 2 &&
              displayedPlaceItems.length === 0 &&
              searching ? (
                <li className={styles.dbhInlineStatusRow}>
                  {"Searching worldwide locations..."}
                </li>
              ) : null}

              {placeQuery.trim().length >= 2 &&
              displayedPlaceItems.length === 0 &&
              !searching ? (
                <li className={styles.dbhInlineStatusRow}>
                  {
                    "No matching places found. Try coordinates (e.g. 31.64, -6.54) or click the 3D globe."
                  }
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function GlobeStepTwoPanel({
  launch,
  launchError,
  questionsForCurrentPlace,
  activeIdx,
  customQuestionInput,
  customQuestionRef,
  onSelectPresetQuestion,
  onDoubleClickPresetQuestion,
  onCustomQuestionChange,
  onTriggerLaunch,
}: {
  launch: { question: string; status: string } | null;
  launchError: string | null;
  questionsForCurrentPlace: readonly string[];
  activeIdx: number;
  customQuestionInput: string;
  customQuestionRef: RefObject<HTMLInputElement | null>;
  onSelectPresetQuestion: (index: number, qText: string, wasSelected: boolean) => void;
  onDoubleClickPresetQuestion: (index: number, qText: string) => void;
  onCustomQuestionChange: (value: string) => void;
  onTriggerLaunch: () => void;
}) {
  return (
    <section
      key="step-2-of-2"
      className={styles.dbhStepTwo}
      data-completed={launch ? "" : undefined}
      aria-label={"Step 2 of 2: Investigation Question"}
    >
      <div className={styles.dbhStepHeader}>
        <div className={styles.dbhFraction} data-tone="red" aria-hidden="true">
          <span className={styles.dbhFractionNum}>{"2"}</span>
          <span className={styles.dbhFractionSlash}>{"/2"}</span>
        </div>

        <div className={styles.dbhStepHeadContent}>
          <h2 className={styles.dbhQuestion}>
            {"Focus on a specific question, or scan the whole area:"}
          </h2>

          {launch ? (
            <p className={styles.dbhDoneAnswerRow} data-launch-question="">
              <span className={styles.dbhDoneAnswerPrimary}>{launch.question}</span>
            </p>
          ) : null}
        </div>
      </div>

      {launch ? null : (
        <div className={styles.dbhStepTwoBody}>
          {launchError ? (
            <p className={styles.dbhLaunchError} role="alert">
              {launchError}
            </p>
          ) : null}
          <ul className={styles.dbhQuestionList} role="radiogroup">
            {questionsForCurrentPlace.map((qText, i) => {
              const isSelected = customQuestionInput.trim() === "" && i === activeIdx;
              return (
                <li key={qText}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    data-selected={isSelected ? "" : undefined}
                    className={styles.dbhBareQuestionOption}
                    onClick={() => {
                      onSelectPresetQuestion(i, qText, isSelected);
                    }}
                    onDoubleClick={() => {
                      onDoubleClickPresetQuestion(i, qText);
                    }}
                  >
                    <span className={styles.dbhQuestionOptionText}>{qText}</span>
                    <span className={styles.dbhOptionAction}>
                      <kbd className={isSelected ? styles.keycapBlue : styles.keycapDark}>
                        {isSelected ? "↵" : String(i + 1)}
                      </kbd>
                      <span className={styles.dbhActionWord}>
                        {isSelected ? "START" : "SELECT"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className={styles.dbhCustomQuestionWrap}>
            <div
              className={styles.dbhUnderlineForm}
              data-active={customQuestionInput.trim() ? "" : undefined}
            >
              <kbd
                className={customQuestionInput.trim() ? styles.keycapBlue : styles.keycapDark}
                aria-hidden="true"
              >
                {"?"}
              </kbd>
              <input
                ref={customQuestionRef}
                type="text"
                value={customQuestionInput}
                onChange={(e) => {
                  onCustomQuestionChange(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customQuestionInput.trim()) {
                    e.preventDefault();
                    onTriggerLaunch();
                  }
                }}
                placeholder={"Or type your own question for this landscape..."}
                className={styles.dbhUnderlineInput}
                aria-label={"Type a custom investigation question"}
              />
              <span className={styles.dbhInputTrace} aria-hidden="true" />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
