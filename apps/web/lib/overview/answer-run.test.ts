import { describe, expect, it } from "vitest";
import { answerAddress, runOfSearch, searchWithRun } from "./answer-run";

describe("the answer's run in the address", () => {
  it("names no run on a plain address", () => {
    expect(runOfSearch("")).toBeNull();
    expect(runOfSearch("?case=case_x")).toBeNull();
    expect(runOfSearch("?run=")).toBeNull();
    expect(runOfSearch("?run=%20")).toBeNull();
  });

  it("reads the run's command id", () => {
    expect(runOfSearch("?run=cmd_1")).toBe("cmd_1");
    expect(runOfSearch("?case=case_x&run=cmd_1")).toBe("cmd_1");
  });

  it("adds, replaces and removes the run, keeping the other parameters", () => {
    expect(searchWithRun("", "cmd_1")).toBe("?run=cmd_1");
    expect(searchWithRun("?case=case_x", "cmd_1")).toBe("?case=case_x&run=cmd_1");
    expect(searchWithRun("?run=cmd_0&case=case_x", "cmd_1")).toBe("?run=cmd_1&case=case_x");
    expect(searchWithRun("?case=case_x&run=cmd_1", null)).toBe("?case=case_x");
    expect(searchWithRun("?run=cmd_1", null)).toBe("");
  });

  it("round-trips", () => {
    expect(runOfSearch(searchWithRun("?q=why", "cmd_01M66MRGPHJ3D8XMQE5M26PTM1"))).toBe(
      "cmd_01M66MRGPHJ3D8XMQE5M26PTM1",
    );
  });
});

describe("the address an answer puts in place", () => {
  const RUN = "cmd_01M66MRGPHJ3D8XMQE5M26PTM1";

  it("moves a hand-over on the journey's page to /valley, with the place and the run only", () => {
    expect(answerAddress("/", "", RUN, true)).toBe(`/valley?run=${RUN}`);
    expect(answerAddress("/", "?case=case_x&dive=1&mode=run&q=why", RUN, true)).toBe(
      `/valley?case=case_x&run=${RUN}`,
    );
    expect(answerAddress("/valley", "?mode=run", RUN, true)).toBe(`/valley?run=${RUN}`);
  });

  it("leaves an address that already names the answer", () => {
    expect(answerAddress("/valley", `?run=${RUN}`, RUN, true)).toBeNull();
    expect(answerAddress("/valley", `?case=case_x&run=${RUN}`, RUN, true)).toBeNull();
    expect(answerAddress("/valley", "", null, false)).toBeNull();
  });

  it("names or drops the run in place when no steps handed over (a reload, a view's own address)", () => {
    expect(answerAddress("/valley", "?run=not_a_run", null, false)).toBe("/valley");
    expect(answerAddress("/", `?run=${RUN}`, null, false)).toBe("/");
    expect(answerAddress("/instruments/time", "?case=case_x", RUN, true)).toBe(
      `/instruments/time?case=case_x&run=${RUN}`,
    );
    expect(answerAddress("/", `?run=${RUN}`, RUN, false)).toBeNull();
  });
});
