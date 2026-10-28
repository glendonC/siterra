import { findMapDir } from "@siterra/db";

/** The map bundle folder: SITERRA_MAP_DIR, else the repository's data/map found upward. */
export function mapDir(): string | null {
  const configured = process.env["SITERRA_MAP_DIR"];
  return configured !== undefined && configured !== "" ? configured : findMapDir(process.cwd());
}
