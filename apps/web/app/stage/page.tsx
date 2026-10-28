import { StageView } from "../../components/views/StageView";

// The arrival view at the approved pose, for the parity still against the approved hero frame. The map
// assets come from the app's own origin (GET /api/map-assets), so no asset address is written into the app.
export default function StagePage() {
  return (
    <main style={{ position: "fixed", inset: 0 }}>
      <StageView />
    </main>
  );
}
