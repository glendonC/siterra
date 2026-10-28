// Per-viewer preferences kept in the browser. Storage can be missing or blocked (a private window, cleared
// site data), so every read falls back to the default and every write may silently do nothing.

const SINGLE_KEYS = "siterra.singleKeys";

/** The browser's local storage, or undefined where even reaching it throws (blocked site data). */
export function viewerStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Whether single-key shortcuts (F, /) are on; on unless the viewer turned them off. */
export function readSingleKeys(storage: Storage | undefined): boolean {
  try {
    return storage?.getItem(SINGLE_KEYS) !== "off";
  } catch {
    return true;
  }
}

export function writeSingleKeys(storage: Storage | undefined, on: boolean): void {
  try {
    storage?.setItem(SINGLE_KEYS, on ? "on" : "off");
  } catch {
    // the choice holds for this page only
  }
}
