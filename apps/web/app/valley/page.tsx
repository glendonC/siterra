import { InstrumentRecords } from "../../components/instruments/InstrumentRecords";
import { ValleyOverview } from "../../components/overview/ValleyOverview";

// The Valley view: the relief inside the arc with the case's findings, each opening its
// instrument beside the land, and the ask. The records are the case the valley opens (?case=, or the visitor's demo
// copy of the seed case).
export default function ValleyPage() {
  return (
    <main>
      <InstrumentRecords>
        <ValleyOverview />
      </InstrumentRecords>
    </main>
  );
}
