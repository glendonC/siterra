import { InstrumentLayerStack } from "../../../components/instruments/InstrumentLayerStack";

// The layer stack on its own, full screen, for the side-by-side check against the approved specimen until the
// briefing shell opens the instruments from the valley.
export default function LayersPage() {
  return (
    <main style={{ position: "fixed", inset: 0 }}>
      <InstrumentLayerStack />
    </main>
  );
}
