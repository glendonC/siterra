// Host rules for the instrument records of contracts 1.11.0 (data-contracts.md, instruments):
// INST-01 a spec cites every record it names, INST-02 a component binds one spec of its own kind,
// INST-03 the layers of a layer_stack are distinct and the selected one is among them. Pure
// functions over the records; the commit applies them (packages/db commit.ts) so the interface
// reads only specs that follow them.
import {
  type BundleAssetRef,
  type CanvasComponent,
  type InstrumentSpec,
  isInstrumentKind,
} from "@siterra/contracts";

type Named = Pick<InstrumentSpec, "parameters" | "caption">;

/** The IDs the parameters name, area first; null where an optional field names nothing. */
function namedByParameters(parameters: InstrumentSpec["parameters"]): (string | null)[] {
  switch (parameters.kind) {
    case "layer_stack":
      return [
        parameters.geoSelectionId,
        parameters.relief.bundleId,
        ...parameters.layers.map((layer) => layer.data.bundleId),
        ...parameters.drainageFeatureIds,
        ...parameters.placeFeatureIds,
      ];
    case "cross_section":
      return [
        parameters.geoSelectionId,
        parameters.transectFeatureId,
        parameters.relief.bundleId,
        parameters.profile.bundleId,
        parameters.bands.bundleId,
        parameters.bandTrends.bundleId,
        parameters.snow.bundleId,
        ...parameters.drainageFeatureIds,
        ...parameters.placeFeatureIds,
        ...parameters.statements.map((statement) => statement.evidenceId),
      ];
    case "pixel_anatomy":
      return [
        parameters.geoSelectionId,
        parameters.locator.bundleId,
        parameters.anatomy.bundleId,
        parameters.bandSeries.bundleId,
        ...parameters.contextEvidenceIds,
      ];
    case "rainfall_scatter":
      return [parameters.geoSelectionId, parameters.seasons.bundleId, parameters.fit.bundleId];
    case "field_plan":
      return [
        parameters.geoSelectionId,
        parameters.branchMergeId,
        parameters.actionId,
        ...parameters.routeFeatureIds,
      ];
  }
}

/** Every record the spec names, once each: the parameters in field order, then the caption's citations. */
export function instrumentReferencedIds(spec: Named): string[] {
  const ids = [...namedByParameters(spec.parameters), ...spec.caption.citationIds];
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

/**
 * INST-01: the records the spec names that its provenance.inputVersions does not cite, at any
 * revision. Staleness follows exact versions only (data-contracts.md, principle 2), so a spec
 * naming a record it does not cite would never go stale when that record changes.
 */
export function uncitedInstrumentInputs(
  spec: Named & Pick<InstrumentSpec, "provenance">,
): string[] {
  const cited = new Set(spec.provenance.inputVersions.map((version) => version.entityId));
  return instrumentReferencedIds(spec).filter((id) => !cited.has(id));
}

/** INST-03: what makes the parameters of a spec contradict themselves; empty when they hold. */
export function instrumentSpecIssues(spec: Pick<InstrumentSpec, "id" | "parameters">): string[] {
  const { parameters } = spec;
  if (parameters.kind !== "layer_stack") return [];
  const issues: string[] = [];
  const layers = parameters.layers.map((layer) => layer.layer);
  for (const layer of new Set(layers.filter((name, i) => layers.indexOf(name) !== i))) {
    issues.push(`${spec.id}: the layer ${layer} is listed twice`);
  }
  if (parameters.selectedLayer !== null && !layers.includes(parameters.selectedLayer)) {
    issues.push(`${spec.id}: the selected layer ${parameters.selectedLayer} is not in the stack`);
  }
  return issues;
}

/**
 * INST-02: a component of an instrument kind binds exactly one spec, that spec's kind is the
 * component's, and the pinned revision is the spec's. `spec` is the current record the component's
 * binding names, or undefined when the case holds none. A component of another kind is not judged.
 */
export function instrumentComponentIssues(
  component: Pick<CanvasComponent, "id" | "componentKind" | "entityVersions">,
  spec: Pick<InstrumentSpec, "id" | "revision" | "parameters"> | undefined,
): string[] {
  if (!isInstrumentKind(component.componentKind)) return [];
  const [bound, ...others] = component.entityVersions;
  if (bound === undefined || others.length > 0) {
    return [`${component.id}: an instrument component binds exactly one spec`];
  }
  if (spec?.id !== bound.entityId) {
    return [`${component.id}: binds no instrument spec that exists in this case`];
  }
  if (spec.parameters.kind !== component.componentKind) {
    return [
      `${component.id}: a ${component.componentKind} component binds a ${spec.parameters.kind} spec`,
    ];
  }
  if (bound.revision !== spec.revision) {
    return [
      `${component.id}: binds ${bound.entityId} revision ${String(bound.revision)} but the spec is revision ${String(spec.revision)}`,
    ];
  }
  return [];
}

/**
 * INST-04 (read part): the bundle assets the parameters name, once each, in field order. A field_plan
 * names none, because it reads records. The interface resolves each against its bundle before it
 * draws anything (GET /api/cases/:id/instruments).
 */
export function instrumentAssetRefs(spec: Pick<InstrumentSpec, "parameters">): BundleAssetRef[] {
  const { parameters } = spec;
  const refs = ((): BundleAssetRef[] => {
    switch (parameters.kind) {
      case "layer_stack":
        return [parameters.relief, ...parameters.layers.map((layer) => layer.data)];
      case "cross_section":
        return [
          parameters.relief,
          parameters.profile,
          parameters.bands,
          parameters.bandTrends,
          parameters.snow,
        ];
      case "pixel_anatomy":
        return [parameters.locator, parameters.anatomy, parameters.bandSeries];
      case "rainfall_scatter":
        return [parameters.seasons, parameters.fit];
      case "field_plan":
        return [];
    }
  })();
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.bundleId}/${ref.assetKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
