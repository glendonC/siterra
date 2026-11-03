import { InstrumentPixelAnatomy } from "../../../components/instruments/InstrumentPixelAnatomy";
import { InstrumentShell } from "../../../components/instruments/InstrumentShell";

// Standalone pixel anatomy route in the briefing shell.
export default function PixelPage() {
  return (
    <main>
      <InstrumentShell current="pixel">
        <InstrumentPixelAnatomy />
      </InstrumentShell>
    </main>
  );
}
