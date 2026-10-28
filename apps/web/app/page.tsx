import { JourneyPage } from "../components/journey/JourneyPage";

// The approved sequence: opening, globe, dive, arrival. Asset manifests come from the environment.
export default function Home() {
  return (
    <main>
      <JourneyPage
        manifestUrl={process.env.NEXT_PUBLIC_MAP_MANIFEST_URL ?? ""}
        globeManifestUrl={process.env.NEXT_PUBLIC_GLOBE_MANIFEST_URL ?? ""}
      />
    </main>
  );
}
