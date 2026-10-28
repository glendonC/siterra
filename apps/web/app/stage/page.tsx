import { StageView } from "../../components/views/StageView";

// The arrival view at the approved pose, for the parity still against the approved hero frame.
// The manifest URL comes from the environment so no asset address is written into the app.
export default function StagePage() {
  const manifestUrl = process.env.NEXT_PUBLIC_MAP_MANIFEST_URL ?? "";
  return (
    <main style={{ position: "fixed", inset: 0 }}>
      <StageView manifestUrl={manifestUrl} />
    </main>
  );
}
