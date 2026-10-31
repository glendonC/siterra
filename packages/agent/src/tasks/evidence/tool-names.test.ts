import { ToolCallInfo } from "@siterra/contracts";
import { describe, expect, it } from "vitest";

import { SMOKE4_STATEMENTS } from "../../testing/smoke4-findings.ts";
import { TOOL_NAMES, toolNameMessage, toolNamesIn } from "./tool-names.ts";

describe("the tool names a finding must not carry", () => {
  it("names every tool of the case contracts, and the proposals as well", () => {
    expect([...TOOL_NAMES].sort()).toEqual([...ToolCallInfo.shape.name.options].sort());
    expect(TOOL_NAMES).toContain("read_source");
    expect(TOOL_NAMES).toContain("search_occurrences");
    expect(TOOL_NAMES).toContain("propose_evidence");
  });

  it("finds read_source in each of the three smoke 4 statements and in their limitation", () => {
    for (const statement of SMOKE4_STATEMENTS)
      expect(toolNamesIn(statement)).toEqual(["read_source"]);
    expect(toolNamesIn("passage text not yet read with read_source")).toEqual(["read_source"]);
  });

  it("finds every tool name wherever it stands, in any case and with a hyphen or a call", () => {
    for (const name of TOOL_NAMES) {
      expect(toolNamesIn(`See ${name} for the passage.`)).toEqual([name]);
      expect(toolNamesIn(name.toUpperCase())).toEqual([name]);
      expect(toolNamesIn(`${name.replaceAll("_", "-")}.`)).toEqual([name]);
      expect(toolNamesIn(`(${name}())`)).toEqual([name]);
      expect(toolNamesIn(`\`${name}\``)).toEqual([name]);
    }
  });

  it("lists each name once, in the order first written", () => {
    expect(
      toolNamesIn(
        "Use read_source, then propose_evidence, then read_source again, then read_case.",
      ),
    ).toEqual(["read_source", "propose_evidence", "read_case"]);
  });

  it("finds a name inside a longer identifier, and leaves ordinary words alone", () => {
    expect(toolNamesIn("the read_source_text field")).toEqual(["read_source"]);
    expect(toolNamesIn("Sources were searched and the report was read.")).toEqual([]);
    expect(
      toolNamesIn("Read the source text; search the sources again; compare series of years."),
    ).toEqual([]);
    expect(toolNamesIn("a thread_source of water")).toEqual([]);
    expect(toolNamesIn("")).toEqual([]);
  });

  it("words the refusal so that the repair turn knows what to write instead", () => {
    expect(toolNameMessage("read_source")).toBe(
      '"read_source" is an internal tool name, which a finding never carries. Say what the source or the data shows, or what is still to be read or checked, in plain words.',
    );
  });
});
