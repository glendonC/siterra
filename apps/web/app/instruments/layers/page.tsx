import { InstrumentLayerStack } from "../../../components/instruments/InstrumentLayerStack";
import { InstrumentShell } from "../../../components/instruments/InstrumentShell";

// The layer stack on its own, full screen in the briefing shell (switcher and command line), for the
// side-by-side check against the approved specimen.
export default function LayersPage() {
  return (
    <main>
      <InstrumentShell current="layers">
        <InstrumentLayerStack />
      </InstrumentShell>
    </main>
  );
}
