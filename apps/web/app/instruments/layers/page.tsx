import { InstrumentLayerStack } from "../../../components/instruments/InstrumentLayerStack";
import { InstrumentShell } from "../../../components/instruments/InstrumentShell";

// Standalone layer stack route in the briefing shell.
export default function LayersPage() {
  return (
    <main>
      <InstrumentShell current="layers">
        <InstrumentLayerStack />
      </InstrumentShell>
    </main>
  );
}
