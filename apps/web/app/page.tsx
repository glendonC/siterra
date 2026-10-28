import { JourneyPage } from "../components/journey/JourneyPage";

// The approved sequence: opening, globe, dive, arrival. The map assets come from the app's own origin.
export default function Home() {
  return (
    <main>
      <JourneyPage />
    </main>
  );
}
