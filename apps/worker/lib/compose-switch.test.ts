import { describe, expect, it } from "vitest";

import { composeInstrumentsEnabled } from "./compose-switch.ts";

describe("the instrument composition switch", () => {
  it("is on by default on the live route and off on a replay route", () => {
    expect(composeInstrumentsEnabled({}, "model_api")).toBe(true);
    expect(composeInstrumentsEnabled({}, "replay")).toBe(false);
  });

  it("is turned off by SITERRA_COMPOSE_INSTRUMENTS=0 on any route", () => {
    expect(composeInstrumentsEnabled({ SITERRA_COMPOSE_INSTRUMENTS: "0" }, "model_api")).toBe(
      false,
    );
    expect(composeInstrumentsEnabled({ SITERRA_COMPOSE_INSTRUMENTS: "0" }, "replay")).toBe(false);
  });

  it("is turned on by SITERRA_COMPOSE_INSTRUMENTS=1 on a replay route too", () => {
    expect(composeInstrumentsEnabled({ SITERRA_COMPOSE_INSTRUMENTS: "1" }, "replay")).toBe(true);
  });

  it("reads any other setting as unset", () => {
    expect(composeInstrumentsEnabled({ SITERRA_COMPOSE_INSTRUMENTS: "yes" }, "model_api")).toBe(
      true,
    );
    expect(composeInstrumentsEnabled({ SITERRA_COMPOSE_INSTRUMENTS: "" }, "replay")).toBe(false);
  });
});
