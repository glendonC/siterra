import { describe, expect, it } from "vitest";
import { hintAction, type KeyLike } from "./keys";

const press = (key: string, over: Partial<KeyLike> = {}): KeyLike => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  inEditable: false,
  onControl: false,
  ...over,
});

describe("hintAction", () => {
  it.each([
    ["Enter", "primary"],
    ["f", "readFlat"],
    ["F", "readFlat"],
    ["/", "focusCommand"],
    ["Escape", "escape"],
    ["x", null],
  ])("%s on the page gives %s", (key, action) => {
    expect(hintAction(press(key))).toBe(action);
  });

  it("leaves typing alone: F, / and Enter in the command line are text", () => {
    expect(hintAction(press("f", { inEditable: true }))).toBeNull();
    expect(hintAction(press("/", { inEditable: true }))).toBeNull();
    expect(hintAction(press("Enter", { inEditable: true }))).toBeNull();
  });

  it("still lets Escape leave the command line", () => {
    expect(hintAction(press("Escape", { inEditable: true }))).toBe("escape");
  });

  it("lets a focused button handle its own Enter", () => {
    expect(hintAction(press("Enter", { onControl: true }))).toBeNull();
  });

  it("ignores modified keys such as Cmd+F", () => {
    expect(hintAction(press("f", { metaKey: true }))).toBeNull();
    expect(hintAction(press("/", { ctrlKey: true }))).toBeNull();
  });
});
