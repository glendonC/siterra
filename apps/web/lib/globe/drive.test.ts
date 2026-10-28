import { describe, expect, it } from "vitest";
import { ARRIVAL_POSE } from "../stage/arrival";
import { orbitToMapCamera } from "../stage/camera";
import { viewToMapCamera } from "./drive";
import { DIVE_S, RECORDING, globeStateAt } from "./timeline";

describe("viewToMapCamera", () => {
  it("lands the dive's last frame on the arrival camera MapLibre starts from", () => {
    const end = globeStateAt(RECORDING.dive + DIVE_S, RECORDING).view;
    const a = viewToMapCamera(end, 810);
    const b = orbitToMapCamera(ARRIVAL_POSE, 810);
    expect(a.center[0]).toBeCloseTo(b.center[0], 9);
    expect(a.center[1]).toBeCloseTo(b.center[1], 9);
    expect(a.zoom).toBeCloseTo(b.zoom, 6);
    expect(a.pitch).toBeCloseTo(b.pitch, 9);
    expect(a.bearing).toBeCloseTo(b.bearing, 9);
    expect(a.elevation).toBeCloseTo(b.elevation, 6);
  });

  it("looks straight down while the dive is still falling", () => {
    const v = globeStateAt(RECORDING.dive + 2.5, RECORDING).view;
    expect(viewToMapCamera(v, 810).pitch).toBeCloseTo(0, 6);
  });
});
