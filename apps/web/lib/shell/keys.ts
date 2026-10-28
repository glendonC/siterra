// Key hints instead of buttons (design language rule 10): which action a key press asks for. Pure, so the
// rules are tested without a browser. Typing in a field never triggers a hint, and modified keys are left
// to the browser and assistive technology. F and / are single character keys, so a viewer can turn them off
// (WCAG 2.1.4); Enter and Escape are not character keys and stay on.

export type HintAction = "primary" | "readFlat" | "focusCommand" | "escape";

export interface KeyLike {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** True when the key went to an input, a text area or an editable element. */
  inEditable: boolean;
  /** True when the key went to a button or link, which handles Enter itself. */
  onControl: boolean;
}

export interface HintOptions {
  /** False when the viewer turned single-key shortcuts off in Sources and notices. */
  singleKeys?: boolean;
}

export function hintAction(e: KeyLike, { singleKeys = true }: HintOptions = {}): HintAction | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  if (e.key === "Escape") return "escape";
  if (e.inEditable) return null;
  if (e.key === "Enter") return e.onControl ? null : "primary";
  if (!singleKeys) return null;
  if (e.key === "f" || e.key === "F") return "readFlat";
  if (e.key === "/") return "focusCommand";
  return null;
}

/** Reads the parts of a DOM keyboard event the rules need. */
export function keyLike(e: KeyboardEvent): KeyLike {
  const t = e.target as HTMLElement | null;
  const tag = t?.tagName ?? "";
  return {
    key: e.key,
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    inEditable:
      tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(t?.isContentEditable),
    onControl: tag === "BUTTON" || tag === "A",
  };
}
