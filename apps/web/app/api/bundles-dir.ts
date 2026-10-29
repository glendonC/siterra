import { findBundlesDir } from "@siterra/db";

/** The folder of validated bundles: SITERRA_BUNDLES_DIR, else data/bundles found upward from the working folder. */
export function bundlesDir(): string | null {
  const configured = process.env["SITERRA_BUNDLES_DIR"];
  return configured !== undefined && configured !== "" ? configured : findBundlesDir(process.cwd());
}
