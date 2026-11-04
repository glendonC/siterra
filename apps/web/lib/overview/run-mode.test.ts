import { describe, expect, it } from "vitest";
import { opensOnSteps, splitOpen } from "./run-mode";

describe("what the globe's start opens on", () => {
  it("plays the place's own recorded run as its steps", () => {
    expect(opensOnSteps({ runMode: true, recording: true, sent: null })).toBe(true);
  });

  it("opens a place with no run to show on its own answer, as a plain visit does", () => {
    expect(opensOnSteps({ runMode: true, recording: false, sent: null })).toBe(false);
  });

  it("shows the steps of a question sent from here while it is at work or once it is answered", () => {
    expect(opensOnSteps({ runMode: true, recording: false, sent: "working" })).toBe(true);
    expect(opensOnSteps({ runMode: true, recording: false, sent: "answered" })).toBe(true);
  });

  it("does not wait on a question that could not run: the answer is the screen", () => {
    expect(opensOnSteps({ runMode: true, recording: false, sent: "stopped" })).toBe(false);
  });

  it("opens a plain visit on the answer, with or without a recording", () => {
    expect(opensOnSteps({ runMode: false, recording: true, sent: null })).toBe(false);
    expect(opensOnSteps({ runMode: false, recording: false, sent: null })).toBe(false);
  });
});

describe("when the land splits into its layers", () => {
  const at = { ready: true, steps: false, answer: false, mapLayers: false };

  it("never by itself: not on arrival, not on a plain visit's answer", () => {
    expect(splitOpen(at)).toBe(false);
    expect(splitOpen({ ...at, answer: true })).toBe(false);
  });

  it("while the analysis steps are the screen", () => {
    expect(splitOpen({ ...at, steps: true })).toBe(true);
  });

  it("while Map Layers is open on the answer, and no longer once the answer leaves", () => {
    expect(splitOpen({ ...at, answer: true, mapLayers: true })).toBe(true);
    expect(splitOpen({ ...at, answer: false, mapLayers: true })).toBe(false);
  });

  it("only once the land is loaded", () => {
    expect(splitOpen({ ...at, ready: false, steps: true })).toBe(false);
    expect(splitOpen({ ...at, ready: false, answer: true, mapLayers: true })).toBe(false);
  });
});
