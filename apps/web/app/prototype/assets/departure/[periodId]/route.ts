import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findBundlesDir } from "@siterra/db";

/**
 * GET /prototype/assets/departure/:periodId: one month's NDVI departure display picture from the departure
 * bundle, for the /prototype screen only (display assets; no case record, no session). Read only.
 */
export function GET(
  _request: Request,
  context: { params: Promise<{ periodId: string }> },
): Promise<Response> {
  return context.params.then(({ periodId }) => {
    if (!/^period_20(19|2[0-5])-(0[1-9]|1[0-2])$/.test(periodId))
      return new Response(null, { status: 404 });
    const dir = findBundlesDir(process.cwd());
    const file =
      dir === null
        ? null
        : join(dir, "bundle_ndvi_departure_ait_bouguemez", periodId, "overview.webp");
    if (file === null || !existsSync(file)) return new Response(null, { status: 404 });
    return new Response(readFileSync(file), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=3600",
      },
    });
  });
}
