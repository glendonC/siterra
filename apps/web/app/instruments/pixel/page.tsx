import { InstrumentPixelAnatomy } from "../../../components/instruments/InstrumentPixelAnatomy";
import { InstrumentShell } from "../../../components/instruments/InstrumentShell";

// The pixel anatomy on its own, full screen in the briefing shell (switcher and command line), for the
// side-by-side check against the approved specimen.
export default function PixelPage() {
  return (
    <main>
      <InstrumentShell current="pixel">
        <InstrumentPixelAnatomy />
      </InstrumentShell>
    </main>
  );
}
