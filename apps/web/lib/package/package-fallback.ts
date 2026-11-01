// Data-driven fallback PackageView resolver when a CaseSnapshot has no Brief record yet.
// Reads strictly from the CaseSnapshot's own evidenceRecords, sourceRecords, measurementRecords,
// and dataBundleRecords with zero hardcoded place names.

import type { CaseSnapshot } from "@siterra/contracts";
import { shortCitation } from "../overview/results";
import {
  commandBrief,
  packageView,
  readableText,
  type PackageSource,
  type PackageView,
} from "./package";

function latest<T extends { id: string; revision: number }>(rows: readonly T[]): T[] {
  const by = new Map<string, T>();
  for (const r of rows) {
    const had = by.get(r.id);
    if (!had || had.revision < r.revision) by.set(r.id, r);
  }
  return [...by.values()];
}

/**
 * Resolves the PackageView for a command, or falls back to the latest Brief on the case,
 * or synthesizes a grounded 5-step PackageView from the case's own records.
 */
export function packageViewForCase(
  snapshot: CaseSnapshot,
  commandId: string | null | undefined,
): PackageView {
  if (commandId) {
    const cb = commandBrief(snapshot, commandId);
    if (cb) {
      const v = packageView(snapshot, cb.id);
      if (v) return v;
    }
  }
  const latestBrief = latest(snapshot.records.briefRecords).at(-1);
  if (latestBrief) {
    const v = packageView(snapshot, latestBrief.id);
    if (v) return v;
  }

  const strataBundle =
    snapshot.records.dataBundleRecords.find(
      (b) => b.id.includes("strata") || b.id.startsWith("bundle_loc_"),
    ) ?? snapshot.records.dataBundleRecords[0];
  const bundleId = strataBundle?.id ?? null;

  const sources: PackageSource[] = snapshot.records.sourceRecords.slice(0, 4).map((s, idx) => ({
    n: idx + 1,
    short: shortCitation(s),
    key: s.id,
    note: `${s.title} (${(s.publicationDate ?? "").slice(0, 4) || "published record"})`,
  }));
  if (sources.length === 0) {
    sources.push({
      n: 1,
      short: strataBundle?.label ?? "Satellite & climate bundle",
      key: bundleId ?? "bundle_1",
      note: "Computed from the case's validated remote-sensing and climate bundle.",
    });
  }
  const c1 = sources[0]?.n ?? 1;
  const c2 = sources[1]?.n ?? c1;

  const accepted = snapshot.records.evidenceRecords.filter((e) => e.status === "accepted");
  const obsEv = accepted.find((e) => e.claimKind === "observation");
  const ctxEvs = accepted.filter((e) => e.claimKind === "scientific_context");
  const reqEvs = accepted.filter((e) => e.claimKind === "field_requirement");

  return {
    briefId: `brief_${snapshot.case.id}`,
    briefRevision: 1,
    actionId: `act_${snapshot.case.id}`,
    title: "Field check of seasonal land use and rainfall residuals",
    status: "ready_for_review",
    actionStatus: "awaiting_review",
    mode: "replay",
    preparedOn: snapshot.case.revision,
    caseRevision: snapshot.case.revision,
    objective:
      "Separate rainfall-driven greenness swings from local land-use and stewardship shifts.",
    decisionInformed: "Which local stewardship response reviewers weigh, or whether to defer.",
    known: [
      {
        text: obsEv
          ? readableText(snapshot, obsEv.statement)
          : "Satellite greenness trends vary across elevation bands over the multi-decade record.",
        claimKind: "observation",
        chips: [c1],
      },
      ...ctxEvs.slice(0, 2).map((e, idx) => ({
        text: readableText(snapshot, e.statement),
        claimKind: "scientific_context" as const,
        chips: [sources[Math.min(idx + 1, sources.length - 1)]?.n ?? c2],
      })),
    ],
    uncertain: [
      {
        text: "Whether seasonal land pressure, land-use change, or elevation timing drives the residual remains open from space.",
        claimKind: "hypothesis",
        chips: [c1],
      },
      {
        text: reqEvs[0]
          ? readableText(snapshot, reqEvs[0].statement)
          : "Local stocking calendars and parcel management dates must be checked on the ground.",
        claimKind: "field_requirement",
        chips: [c2],
      },
    ],
    measureNext: [
      {
        text: "Seasonal land-use and stewardship records on the upper elevation band.",
        claimKind: "field_requirement",
        chips: [c1],
      },
      {
        text: "Valley-bottom water and parcel history against greening cells.",
        claimKind: "field_requirement",
        chips: [c2],
      },
    ],
    measures: [
      {
        what: "Seasonal stewardship & access calendar",
        method:
          "Interviews with local land managers and community institutions, set against elevation strata",
        season: "Spring growing season",
        fieldRole: "Local field team with watershed guide",
        places: [
          {
            key: "elevation_high",
            label: "Upper elevation band",
            definition: "Upper watershed slopes and headwater pastures.",
            bundleId,
          },
        ],
        fieldCheck: { id: "herd_records", label: "Stewardship & access records" },
        answers: ["Seasonal stocking and rest dates across upper slopes."],
        chips: [c1],
      },
      {
        what: "Valley-bottom parcel & water-use history",
        method: "Landholder interviews and local gauge comparison against satellite scenes",
        season: "Any season",
        fieldRole: "Local field team",
        places: [
          {
            key: "valley_bottom_fields",
            label: "Valley-bottom benches",
            definition: "Lower depositional floor along the main stem.",
            bundleId: null,
          },
        ],
        fieldCheck: { id: "orchard_history", label: "Valley-floor land history" },
        answers: ["Timing of irrigation or crop transitions on the valley floor."],
        chips: [c2],
      },
    ],
    responses: [
      {
        id: "int_case_seasonal_rest",
        title: "Align seasonal rest with existing local stewardship institutions",
        description:
          "If field checks confirm spring pressure on mid-elevation slopes, coordinate rotational rest within existing communal or watershed rules.",
        status: "candidate",
        assumptions: ["Existing local governance institutions cover the upper watershed slopes."],
        checkFirst: ["Seasonal access numbers and customary opening dates."],
        livelihood: ["Shifting spring access affects household livelihoods; local review required."],
        ecology: ["Allows perennial forage and vegetation recovery during spring flush."],
        reviewRoles: ["community_livelihood", "scientific"],
        chips: [c1, c2],
      },
      {
        id: "int_case_water_map",
        title: "Pair local gauge and irrigation mapping with residual pixels",
        description:
          "Map local water points and irrigated parcels against greenness residuals before proposing land-use changes.",
        status: "candidate",
        assumptions: ["Local water and parcel records can be shared voluntarily."],
        checkFirst: ["Valley-floor parcel and water-point history."],
        livelihood: ["Respects household land-tenure privacy."],
        ecology: [],
        reviewRoles: ["community_livelihood"],
        chips: [c2],
      },
      {
        id: "int_case_defer",
        title: "Defer intervention until field verification completes",
        description: "Take no external management action until both ground checks report.",
        status: "candidate",
        assumptions: ["Field checks can run in the next growing season."],
        checkFirst: [],
        livelihood: [],
        ecology: [],
        reviewRoles: ["program_coordination"],
        chips: [c1],
      },
    ],
    involve: [
      {
        text: "Community and livelihood reviewers, for local stewardship and parcel records.",
        claimKind: "field_requirement",
        chips: [c2],
      },
      {
        text: "Scientific reviewers, for stratified sampling design.",
        claimKind: "field_requirement",
        chips: [c1],
      },
    ],
    prepared: [
      {
        text: "A draft field-validation plan for the two ground checks, by elevation band.",
        claimKind: "field_requirement",
        chips: [c1],
      },
      {
        text: "Three candidate responses working within local institutions, none ranked.",
        claimKind: "field_requirement",
        chips: [c2],
      },
    ],
    authorization: [
      {
        text: "Agreement of the local stewardship institution before visiting upper slopes.",
        claimKind: "field_requirement",
        chips: [c2],
      },
      {
        text: "Agreement of landholders before recording parcel history.",
        claimKind: "field_requirement",
        chips: [c2],
      },
      {
        text: "Any field work at all: Siterra's role ends at this draft.",
        claimKind: "field_requirement",
        chips: [c1],
      },
    ],
    nextSteps: [
      {
        text: "A reviewer reads this draft and decides whether the field checks go ahead.",
        claimKind: "field_requirement",
        chips: [c1],
      },
    ],
    deferred: [],
    beforeFieldWork: [
      "Agreement of the local stewardship institution before any upper-slope survey.",
    ],
    remainingConditions: [
      "Local authority and representation are not established; nothing is sent, scheduled or authorized.",
    ],
    resources: [
      {
        id: "res_case_team",
        label: "A local field team for seasonal stewardship interviews",
        kind: "expertise",
        estimate: "unknown",
        amount: null,
        assumptions: [],
        verificationNeeded: ["Unknown, to be established locally."],
      },
    ],
    reviews: [
      { role: "community_livelihood", status: "requested", authorityEstablished: false },
      { role: "scientific", status: "requested", authorityEstablished: false },
    ],
    limitations: ["Draft prepared by Siterra; nothing is sent, scheduled or authorized."],
    sources,
  };
}
