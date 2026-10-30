import { InstrumentFieldPlan } from "../../../components/instruments/InstrumentFieldPlan";
import { InstrumentShell } from "../../../components/instruments/InstrumentShell";

// The field plan on its own, full screen in the briefing shell (switcher and command line).
export default function FieldPlanPage() {
  return (
    <main>
      <InstrumentShell current="field">
        <InstrumentFieldPlan />
      </InstrumentShell>
    </main>
  );
}
