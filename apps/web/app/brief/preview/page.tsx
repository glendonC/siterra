import { notFound } from "next/navigation";
import { PackagePreview } from "../../../components/package/PackagePreview";

// Development only: the "What to Do Next" card over the obsidian ground with a fixed anchor, from the case record, so
// the card can be built before it joins the overview. Not served by a production build.
export default function PackagePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PackagePreview />;
}
