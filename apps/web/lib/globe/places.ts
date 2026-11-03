// The other places on the globe: every seed case GET /api/seed-cases lists, by its own place name,
// region and outlet, except the place the visitor is opening; each is a point the visitor can choose to open instead.

import { z } from "zod";

const listing = z.object({
  cases: z.array(
    z.object({
      caseId: z.string().min(1),
      place: z.object({ name: z.string().min(1), region: z.string().min(1) }),
      outlet: z.object({ lonLat: z.tuple([z.number(), z.number()]) }),
    }),
  ),
});

export interface OtherPlace {
  caseId: string;
  name: string;
  region: string;
  lon: number;
  lat: number;
}

/** The listed places other than the one named `current`; nothing when the listing cannot be read. */
export function otherPlaces(json: unknown, current: string): OtherPlace[] {
  const parsed = listing.safeParse(json);
  if (!parsed.success) return [];
  return parsed.data.cases
    .filter((c) => c.place.name !== current && !c.caseId.startsWith("case_loc_"))
    .map((c) => ({
      caseId: c.caseId,
      name: c.place.name,
      region: c.place.region,
      lon: c.outlet.lonLat[0],
      lat: c.outlet.lonLat[1],
    }));
}

/** The address that opens a place's own journey (its demo copy, the opening shown). */
export const placeHref = (caseId: string) => `/?case=${encodeURIComponent(caseId)}&start`;
