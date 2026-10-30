import { InstrumentRainfallScatter } from "../../../components/instruments/InstrumentRainfallScatter";
import { InstrumentShell } from "../../../components/instruments/InstrumentShell";

// The rainfall scatter on its own, full screen in the briefing shell (switcher and command line).
export default function RainfallPage() {
  return (
    <main>
      <InstrumentShell current="rainfall">
        <InstrumentRainfallScatter />
      </InstrumentShell>
    </main>
  );
}
