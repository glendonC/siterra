import { InstrumentRecords } from "../../../components/instruments/InstrumentRecords";
import { ValleyOverview } from "../../../components/overview/ValleyOverview";

// See It Over Time by its own address (UI-2): the overview, which opens the land's seasons in place once the land is
// drawn, as the overview's T does. A case that cannot play its seasons stays on the overview, under its address.
export default function TimePage() {
  return (
    <main>
      <InstrumentRecords>
        <ValleyOverview />
      </InstrumentRecords>
    </main>
  );
}
