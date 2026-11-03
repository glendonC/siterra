import { notFound } from "next/navigation";
import { RunPreview } from "../../../components/overview/RunPreview";

// Development only: the overview with the RECORDED run "Founder instance smoke 1" at work on it, fed
// through the same event model as the live stream, for building and frames. Not served by a production build.
export default function RunPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <RunPreview />;
}
