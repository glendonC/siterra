// The instrument kinds (contracts 1.11.0): the fixed registry the host composer chooses among. The
// model never proposes one; it may order them and draft their captions (data-contracts.md,
// instruments). The strings are the kind field of the InstrumentSpec parameters, and also five of
// the componentKind values of a CanvasComponent and a LayoutAction, which case.test.ts and
// instruments.test.ts keep in step with the schema.

export const instrumentKinds = [
  "layer_stack",
  "cross_section",
  "pixel_anatomy",
  "rainfall_scatter",
  "field_plan",
] as const;

export type InstrumentKind = (typeof instrumentKinds)[number];

export function isInstrumentKind(value: string): value is InstrumentKind {
  return (instrumentKinds as readonly string[]).includes(value);
}
