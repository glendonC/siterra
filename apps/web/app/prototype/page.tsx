import type { Metadata } from "next";
import { StoryScreen } from "../../components/prototype/StoryScreen";
import { buildFlow } from "../../lib/prototype/flow";
import { loadFixture } from "../../lib/prototype/load.server";
import { buildStory } from "../../lib/prototype/story";
import "../../../../design/tokens/siterra.css";

export const metadata: Metadata = { title: "Siterra prototype" };

// The five-stage analysis flow on the repository's saved records. No model is called and no case is opened;
// the run is scripted and every finding is marked as fixture.
export default function PrototypePage() {
  const fixture = loadFixture();
  const story = buildStory(fixture);
  const flow = buildFlow(fixture, story);
  return (
    <main style={{ position: "fixed", inset: 0 }}>
      <StoryScreen fixture={fixture} story={story} flow={flow} />
    </main>
  );
}
