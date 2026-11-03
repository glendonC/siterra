import { InstrumentCutaway } from "../../../components/instruments/InstrumentCutaway";
import { InstrumentShell } from "../../../components/instruments/InstrumentShell";

// Standalone cutaway route in the briefing shell.
export default function CutawayPage() {
  return (
    <main>
      <InstrumentShell current="cutaway">
        <InstrumentCutaway />
      </InstrumentShell>
    </main>
  );
}
