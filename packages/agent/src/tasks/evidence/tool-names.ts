import { ToolCallInfo } from "@siterra/contracts";

// The names of the tools and proposals of Task.allowedTools are the agent's own machinery. A
// finding says what a source or a measurement shows, or what is still to be read or checked, in
// words a reader of the case understands; it never says how the agent reads (P9g, 'Founder
// instance smoke 4': three field requirements read "with read_source").

export const TOOL_NAMES: readonly string[] = ToolCallInfo.shape.name.options;

// A name is found anywhere it is not the tail of a longer word, in any case, with a hyphen for an
// underscore, and as the start of a longer identifier (read_source_text).
const PATTERNS = TOOL_NAMES.map(
  (name) =>
    [name, new RegExp(String.raw`(?<![a-z0-9])${name.replaceAll("_", "[_-]")}`, "gi")] as const,
);

/** The tool names a text carries, each once, in the order first written. */
export function toolNamesIn(text: string): string[] {
  const found: { name: string; at: number }[] = [];
  for (const [name, pattern] of PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) found.push({ name, at: match.index });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.name);
}

export function toolNameMessage(name: string): string {
  return `"${name}" is an internal tool name, which a finding never carries. Say what the source or the data shows, or what is still to be read or checked, in plain words.`;
}
