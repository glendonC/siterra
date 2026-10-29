import { InstrumentCutaway } from "../../../components/instruments/InstrumentCutaway";
import { InstrumentShell } from "../../../components/instruments/InstrumentShell";

// The cutaway on its own, full screen in the briefing shell (switcher and command line), for the
// side-by-side check against the approved specimen.
export default function CutawayPage() {
  return (
    <main>
      <InstrumentShell current="cutaway">
        <InstrumentCutaway />
      </InstrumentShell>
    </main>
  );
}
