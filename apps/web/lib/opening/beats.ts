// The opening page: four beats shown one at a time, then one action into the globe. Pure state, so the
// stepping rules are tested without a browser. Each beat is split into its two tones by sentence without
// changing a word: the claim in ink, the qualifier in grey (beat 4 leads with its grey half).

import { en, type MessageId } from "../copy/en";

export interface BeatPart {
  text: string;
  tone: "ink" | "grey";
}

export interface Beat {
  id: MessageId;
  parts: BeatPart[];
  tag?: MessageId;
}

const BEAT_IDS: { id: MessageId; tag?: MessageId; tones: ("ink" | "grey")[] }[] = [
  { id: "opening.beat1", tag: "opening.beat1.tag", tones: ["ink"] },
  { id: "opening.beat2", tag: "opening.beat2.tag", tones: ["ink", "grey"] },
  { id: "opening.beat3", tag: "opening.beat3.tag", tones: ["ink", "grey"] },
  { id: "opening.beat4", tones: ["grey", "ink"] },
];

/** Splits after a full stop followed by a space; the text is never changed, only divided. */
export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.?])\s+(?=[A-Z])/);
}

export const BEATS: Beat[] = BEAT_IDS.map((b) => {
  const sentences = splitSentences(en[b.id].text);
  if (sentences.length !== b.tones.length)
    throw new Error(
      `${b.id}: ${String(sentences.length)} sentences for ${String(b.tones.length)} tones`,
    );
  return {
    id: b.id,
    parts: sentences.map((text, i) => ({ text, tone: b.tones[i] ?? "ink" })),
    ...(b.tag ? { tag: b.tag } : {}),
  };
});

/** Where the opening is: a beat index, or the action after the last beat. */
export type OpeningState = { beat: number; actionShown: boolean };

export type OpeningInput = "next" | "previous" | "timer";

export const OPENING_START: OpeningState = { beat: 0, actionShown: false };

export function stepOpening(
  s: OpeningState,
  input: OpeningInput,
  beatCount = BEATS.length,
): OpeningState | "open" {
  const last = beatCount - 1;
  if (input === "previous") return { beat: Math.max(0, s.beat - 1), actionShown: false };
  if (s.beat < last) return { beat: s.beat + 1, actionShown: false };
  if (!s.actionShown) return { beat: last, actionShown: true };
  // the timer never opens the investigation by itself; a person does
  return input === "next" ? "open" : s;
}
