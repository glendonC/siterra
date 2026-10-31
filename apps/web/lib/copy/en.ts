// English message catalog (I18N-01): every interface string the app shows lives here, keyed by string ID.
// Place names, numbers and record fields come from records and are not catalog strings.
// Placeholders use ICU-style names in braces: {area}.

import type { Scope } from "./lint";

export interface Message {
  text: string;
  /**
   * Lint scope: a detail line ("ui"), a map or data label, a heading (header, tab, badge, status word or
   * stage name, in Title Case), a button or a link.
   */
  kind: Extract<Scope, "ui" | "label" | "heading" | "button" | "link">;
  /** A line that says what a value is not or does not prove; exempt from the land-label word cap. */
  honesty?: true;
}

export const en = {
  // Opening page: the case question (from its record), one sentence of what Siterra does, one action; how it works
  // waits behind a quiet button
  "opening.title": { text: "Siterra", kind: "heading" },
  "opening.what": {
    text: "Siterra weighs a question about the land against satellite records and published studies, and says what they leave open.",
    kind: "ui",
  },
  // only the brief task waits for a person (awaiting_review); a visitor's results are never reviewed by one
  "opening.how": {
    text: "Meta Muse Spark plans the tasks and reads published sources. Code computes every number, checks every quote against its source and marks what it could not check. Siterra sends, spends and decides nothing.",
    kind: "ui",
  },

  "opening.action": { text: "Choose a Place", kind: "button" },
  // the controls every screen after the opening shares (decisions 2 to 5): the breadcrumb, the keys that work now,
  // the sources behind one button with the data's short names always visible, and the view control
  "chrome.crumbs": { text: "Location in the case", kind: "ui" },
  "chrome.back": { text: "Back", kind: "button" },
  "chrome.keys": { text: "Keys that work now", kind: "ui" },
  "chrome.key.back": { text: "Back", kind: "button" },
  "chrome.key.reset": { text: "Reset View", kind: "button" },
  "chrome.key.ask": { text: "Ask", kind: "button" },
  "chrome.key.sources": { text: "Sources", kind: "button" },
  // recorded life on the land (UI-2): its key in the legend
  "chrome.key.life": { text: "Recorded Life", kind: "button" },
  "chrome.sources": { text: "Sources", kind: "heading" },
  "chrome.close": { text: "Close", kind: "button" },
  "chrome.view": { text: "View", kind: "ui" },
  "chrome.reset": { text: "Reset View", kind: "button" },
  "chrome.zoomIn": { text: "Zoom In", kind: "button" },
  "chrome.zoomOut": { text: "Zoom Out", kind: "button" },
  "chrome.data": { text: "Data: {names}", kind: "ui" },
  // the drawn relief's vertical exaggeration, after the data's names where land is drawn (decision 16)
  "chrome.relief": { text: "Relief ×{value}", kind: "label" },
  // the data's short names for that line
  "source.dem": { text: "Copernicus DEM", kind: "label" },
  "source.worldcover": { text: "ESA WorldCover", kind: "label" },
  "source.modis": { text: "NASA MODIS", kind: "label" },
  "source.chirps": { text: "CHIRPS", kind: "label" },
  "source.geonames": { text: "GeoNames", kind: "label" },
  // recorded life's records, in the short sources line while the layer shows (UI-2)
  "source.gbif": { text: "GBIF", kind: "label" },
  "source.sentinel": { text: "Copernicus Sentinel-2", kind: "label" },
  "source.studies": { text: "{n} published studies", kind: "label" },
  "opening.howButton": { text: "How It Works", kind: "button" },

  // The engine's five stages (ADR-0043 amendment, proposed). ADR-0023 bars causal diagnosis, so stage 3
  // tests hypotheses; precedents are published studies; nothing is verified in the field yet
  "stage.scope_baseline": { text: "Scope & Baseline", kind: "heading" },
  "stage.evidence": { text: "Evidence", kind: "heading" },
  "stage.hypothesis_testing": { text: "Hypothesis Testing", kind: "heading" },
  "stage.interventions_precedents": { text: "Interventions & Precedents", kind: "heading" },
  "stage.field_verification": { text: "Field Verification", kind: "heading" },

  // Globe and dive (approved hero study A4; place and range names come from the case record)
  "globe.range": { text: "{range}", kind: "label" },
  // each case on the globe has a card beside its point (Destiny's manner): the place and region in the record's
  // words, the case's own question, and the one action into it
  "globe.place": { text: "{place} · {region}", kind: "heading" },
  "month.jan": { text: "January", kind: "label" },
  "month.feb": { text: "February", kind: "label" },
  "month.mar": { text: "March", kind: "label" },
  "month.apr": { text: "April", kind: "label" },
  "month.may": { text: "May", kind: "label" },
  "month.jun": { text: "June", kind: "label" },
  "month.jul": { text: "July", kind: "label" },
  "month.aug": { text: "August", kind: "label" },
  "month.sep": { text: "September", kind: "label" },
  "month.oct": { text: "October", kind: "label" },
  "month.nov": { text: "November", kind: "label" },
  "month.dec": { text: "December", kind: "label" },
  "season.window": { text: "{from} to {to}", kind: "label" },
  "season.unstated": { text: "the recorded season", kind: "label" },
  "globe.open": { text: "Open", kind: "button" },
  "globe.openPlace": { text: "Open {place}, {region}", kind: "ui" },
  "globe.others": { text: "Other places", kind: "label" },
  "globe.cases": { text: "Cases on the globe", kind: "ui" },
  // a mouse action is said in words, never drawn as a key
  "globe.drag": { text: "drag to turn", kind: "ui" },
  "globe.legend": {
    text: "Rangeland biomes, potential extent (Rangelands Atlas method)",
    kind: "ui",
  },
  "credit.globe": {
    text: "Globe relief: produced using Copernicus WorldDEM™-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved",
    kind: "ui",
  },

  // Arrival (valley and region names come from the case record)
  "arrival.valleyName": { text: "{valley}", kind: "label" },
  "arrival.region": { text: "{region}", kind: "label" },
  "arrival.studyArea": { text: "{label}: {area} km²", kind: "label" },
  "arrival.studyAreaLimit": {
    text: "Not a pasture, agdal, or management boundary.",
    kind: "ui",
    honesty: true,
  },
  "arrival.outlet": { text: "Outlet: the whole catchment drains here", kind: "label" },

  // Text view (the flat listing)
  "flat.lonW": { text: "{deg}° W", kind: "label" },
  "flat.latN": { text: "{deg}° N", kind: "label" },
  "flat.km": { text: "{n} km", kind: "label" },
  "flat.m": { text: "{n} m", kind: "label" },

  // Task status words (microcopy section 6)
  "task.queued": { text: "Queued", kind: "heading" },
  "task.running": { text: "Running", kind: "heading" },
  "task.needs_input": { text: "Input Required", kind: "heading" },
  "task.done": { text: "Done", kind: "heading" },
  "task.partial": { text: "Partial", kind: "heading" },
  "task.failed": { text: "Failed", kind: "heading" },
  "task.cancelled": { text: "Canceled", kind: "heading" },
  "task.awaiting_review": { text: "Awaiting Review", kind: "heading" },
  "work.planning": { text: "Planned tasks: {n}.", kind: "ui" },
  "work.received": { text: "Request received.", kind: "ui" },
  // accepted evidence only; three words so the completed card stays within its 45 (VC-04)
  "work.complete": { text: "Complete. Findings: {n}.", kind: "ui" },
  // microcopy section 5 Failed and Partial; the question text stays in the command line, no Retry on the card
  "work.failed": { text: "Assessment failed: {cause}. Question text kept.", kind: "ui" },
  "work.partial": { text: "Assessment partial. Not completed: {tasks}.", kind: "ui" },
  "work.cancelled": { text: "Assessment canceled.", kind: "ui" },
  // causes after the section 16 patterns: Budget or time limit, Model output rejected, Model service down
  "work.cause.roundLimit": { text: "model round limit reached", kind: "ui" },
  "work.cause.rejected": { text: "model proposal rejected by checks", kind: "ui" },
  "work.cause.modelDown": { text: "model service not responding", kind: "ui" },
  "work.cause.other": { text: "no task completed", kind: "ui" },
  // the scope refusal (packages/agent tasks/scope.ts): a badge and two sentences, what is wrong and what is required
  "work.outOfScope": { text: "Out of Scope", kind: "heading" },
  "work.outOfScopeDetail": {
    text: "The request treats people as the explanation by identity, or names a private individual. Questions must concern land, water, vegetation or land-use practices.",
    kind: "ui",
  },
  // task kinds, by the five-stage engine's names where a stage owns the task
  "task.kind.plan": { text: "Plan", kind: "heading" },
  "task.kind.source_research": { text: "Source Research", kind: "heading" },
  "task.kind.observation_analysis": { text: "Observation Analysis", kind: "heading" },
  "task.kind.livelihood_governance": { text: "Livelihoods & Governance", kind: "heading" },
  "task.kind.hypothesis_comparison": { text: "Hypothesis Comparison", kind: "heading" },
  "task.kind.explanation_branches": { text: "Explanation Branches", kind: "heading" },
  "task.kind.intervention_feasibility": { text: "Intervention Feasibility", kind: "heading" },
  "task.kind.brief_package": { text: "Field Verification Plan", kind: "heading" },
  "task.kind.instrument_composition": { text: "View Order", kind: "heading" },
  "task.kind.validation": { text: "Automated Checks", kind: "heading" },
  // labeled precomputed (ADR-0021; agent orchestration, "Precomputed observations are labeled precomputed")
  "work.observations": { text: "Precomputed Observations", kind: "heading" },
  "work.observationLine": {
    text: "{label}: {available} of {total} months observed, {first} to {last}",
    kind: "ui",
  },
  "work.refused": { text: "Request not sent. Question text kept for another run.", kind: "ui" },
  "work.quotaUsed": {
    text: "Demo request limit reached for this session. Question text kept.",
    kind: "ui",
  },
  "work.instanceLimit": {
    text: "This instance has reached its limit for live model questions. Try again later. Question text kept.",
    kind: "ui",
  },

  // Activity panel (microcopy section 20: panel title, empty state, model badge)
  "activity.model": { text: "{model} · {route}", kind: "heading" },
  "activity.route.synthetic": { text: "Synthetic Replay", kind: "heading" },
  "activity.route.recorded": { text: "Recorded Replay", kind: "heading" },
  "activity.route.modelApi": { text: "Model API", kind: "heading" },
  "activity.code": { text: "Code: {tool}", kind: "heading" },
  "activity.proposal": { text: "Proposal: {tool}", kind: "heading" },
  "activity.rejected": { text: "Rejected: {rule} ({code})", kind: "ui" },
  // a coverage boundary: the badge, then what is missing and what is required
  "activity.notLoaded": { text: "Dataset Not Loaded", kind: "heading" },
  "activity.blocked": {
    text: "Required inputs not loaded: {inputs}. Attach the datasets or limit the question to loaded layers.",
    kind: "ui",
  },
  "activity.cause": { text: "Cause: {cause}", kind: "ui" },
  // the check that rejected a proposal, by its validation issue code (ValidationResult)
  "rule.schema": { text: "wrong shape", kind: "ui" },
  "rule.unknown_reference": { text: "cites a record that does not exist", kind: "ui" },
  "rule.stale_reference": { text: "cites an outdated record", kind: "ui" },
  "rule.ownership": { text: "changes a record this step does not own", kind: "ui" },
  "rule.claim_kind": { text: "the wrong kind of claim", kind: "ui" },
  "rule.numeric_provenance": { text: "a number not found in its records", kind: "ui" },
  "rule.unit": { text: "the wrong unit", kind: "ui" },
  "rule.coverage": { text: "too little observed data", kind: "ui" },
  "rule.authority": { text: "claims authority it does not have", kind: "ui" },
  "rule.prohibited_claim": { text: "a claim Siterra may not make", kind: "ui" },
  "rule.transition": { text: "a status change that is not allowed", kind: "ui" },
  "rule.limit": { text: "over a set limit", kind: "ui" },
  "rule.catalog_mismatch": { text: "not in the analysis catalog", kind: "ui" },
  "rule.focus_not_permitted": { text: "a map view that is not allowed", kind: "ui" },
  "rule.excerpt_mismatch": { text: "quote not found in its source", kind: "ui" },

  // Map legend (microcopy section 19, the approved key's form for any month; section 1a valley.key.ndvi.note)
  "legend.ndvi.title": { text: "NDVI Departure · {period}", kind: "heading" },
  "legend.ndvi.subtitle": {
    text: "Difference from the median of the other {months}, 2019 to 2025, inside the catchment",
    kind: "ui",
  },
  "legend.coverage": { text: "{percent}% of area observed", kind: "ui" },
  // the departure's two shares: the coverage-check figure (all-years reference) and the cells the picture colors
  // (leave-one-year-out reference); the bare forms when the method states no reference-year minimum
  "legend.ndvi.coverage": {
    text: "Coverage: {percent}% of area, observed in at least {years} {months} including {period}",
    kind: "ui",
    honesty: true,
  },
  "legend.ndvi.coverage.bare": { text: "Coverage: {percent}% of area", kind: "ui", honesty: true },
  "legend.ndvi.painted": {
    text: "Colored: {percent}% of area, observed in {period} and at least {years} other {months}",
    kind: "ui",
    honesty: true,
  },
  "legend.ndvi.painted.bare": { text: "Colored: {percent}% of area", kind: "ui", honesty: true },
  // the period's quality flags, in the approved verdict line's form (valley.verdict.flags and its note)
  "legend.flags": { text: "{period} views: {flags}.", kind: "ui", honesty: true },
  "legend.flags.reducedQaNote": {
    text: "Cloud screening used the scene classification only.",
    kind: "ui",
    honesty: true,
  },
  "flag.snow": { text: "snow suspected", kind: "ui" },
  "flag.terrainShadow": { text: "terrain shadow suspected", kind: "ui" },
  "flag.lowSceneCount": { text: "few satellite dates", kind: "ui" },
  "flag.partialMonth": { text: "part of the month only", kind: "ui" },
  "flag.qaJoinIncomplete": { text: "scene classification incomplete", kind: "ui" },
  "flag.reducedQa": { text: "cloud screening reduced", kind: "ui" },
  // the strata bundle's excluded stratum, drawn over the values, not masked from them
  "legend.ndvi.excluded": {
    text: "Hatched: cropland and buildings mapped by ESA WorldCover in 2021, left out of the field-sampling strata. Their departure is still drawn.",
    kind: "ui",
  },
  "legend.ndvi.note": {
    text: "No cropland mask is applied: irrigated fields and orchards are included.",
    kind: "ui",
    honesty: true,
  },
  "legend.ndvi.method": {
    text: "Sentinel-2 L2A, monthly median NDVI, cloud and snow masked. Method {method} {version}.",
    kind: "ui",
  },
  // SC-04 asks for true cell size: the display cells are coarser than the analysis grid, so the key says so
  "legend.ndvi.cells": {
    text: "Drawn in cells of about {display} m, averaged from the {analysis} m analysis grid. The measurements use the {analysis} m cells.",
    kind: "ui",
    honesty: true,
  },
  "legend.ndvi.cellsDisplay": {
    text: "Drawn in cells of about {display} m.",
    kind: "ui",
    honesty: true,
  },
  // Opening a case
  "case.notFound": {
    text: "Case not available to this session. Open the home page to start a new session.",
    kind: "ui",
  },
  "case.failed": {
    text: "Case not loaded. No records changed. Reload the page to retry.",
    kind: "ui",
  },
  // a coverage boundary: the badge, then what is missing and what is required
  "case.coverageRequired": { text: "Coverage Required", kind: "heading" },
  "case.noBoundary": {
    text: "No analysis boundary is set for this case. A catchment boundary is required to draw the region.",
    kind: "ui",
  },

  // Explanation branches and field plan (CMP-23, DF-09)
  "branches.status.predicted": { text: "Predictions Locked", kind: "heading" },
  "branches.status.consistent": { text: "Consistent", kind: "heading" },
  "branches.status.contradicted": { text: "Contradicted", kind: "heading" },
  "branches.status.cannot_be_assessed": { text: "Cannot Be Assessed", kind: "heading" },
  "branches.outcome.met": { text: "Met", kind: "heading" },
  "branches.outcome.not_met": { text: "Not Met", kind: "heading" },
  "branches.outcome.not_testable": { text: "Not Testable", kind: "heading" },
  "branches.outcome.pending": { text: "Committed", kind: "heading" },

  // Trace drill-down (CMP-16, TR-02, TR-05, TR-06)
  "trace.summary": {
    text: "Models: {models}. Tools: {tools}. Checks: {accepted} accepted, {rejected} rejected.",
    kind: "ui",
  },
  "trace.usage": { text: "Tokens: {input} in, {output} out. Cost: ${cost}.", kind: "ui" },

  // Stage notes
  "stage.relief": { text: "Vertical Exaggeration ×{factor}", kind: "heading" },
  // no text listing follows it any more (the /stage view and its listing are retired)
  "stage.mapFailed": { text: "Map not loaded. Reload the page to retry.", kind: "ui" },

  // Credits
  "credit.outletInput": { text: "© OpenStreetMap contributors.", kind: "ui" },

  // Mode
  "mode.live": { text: "Live", kind: "heading" },
  "mode.liveDetail": {
    text: "Model and tool calls run now. Observations are precomputed.",
    kind: "ui",
  },
  "mode.replay": { text: "Recorded Replay · {date}", kind: "heading" },
  "mode.replayDetail": {
    text: "Recorded outputs from a live run. Nothing is computed now.",
    kind: "ui",
  },
  "mode.simulated": { text: "Simulated Answer", kind: "heading" },
  "mode.concept": { text: "Concept Prototype", kind: "heading" },
  "mode.conceptDetail": {
    text: "Model steps are synthetic examples, not live model output. The rainfall and vegetation records are measured.",
    kind: "ui",
  },
  "mode.fixture": { text: "Fixture Data", kind: "heading" },

  // Instruments: the layer stack (approved specimen A). Figures, years and limits come from the record's fixtures
  // (lib/instruments/valley/fixtures.ts); credits are numbered by the sheet they serve
  "instrument.layers.description": {
    text: "A relief model of the catchment with its drainage lines. Above it are five sheets: the vegetation trend, rainfall, snow cover, land cover, and the three elevation bands.",
    kind: "ui",
  },
  "instrument.layers.keys": {
    text: "Arrow keys turn the model; Home returns to the measured view.",
    kind: "ui",
  },
  "instrument.layers.scale": { text: "Vertical scale {value}×", kind: "label" },
  "instrument.layers.failed": { text: "Layers not loaded. Reload the page to retry.", kind: "ui" },
  "instrument.sheet.trend": { text: "Vegetation Trend", kind: "heading" },
  "instrument.sheet.trend.key": { text: "{value} NDVI per decade", kind: "label" },
  "instrument.sheet.rain": { text: "Rainfall", kind: "heading" },
  "instrument.sheet.rain.key": { text: "{value} mm, {from} to {to} mean", kind: "label" },
  "instrument.sheet.snow": { text: "Snow Cover", kind: "heading" },
  // the sheet shows February (SNOW_MONTH in lib/instruments/valley/scene/layer-stack.ts)
  "instrument.sheet.snow.key": { text: "{value}, mean of {from} to {to}", kind: "label" },
  "instrument.sheet.cover": { text: "Land Cover", kind: "heading" },
  "instrument.sheet.cover.crop": { text: "cropland or built-up", kind: "label" },
  "instrument.sheet.cover.tree": { text: "tree cover, {year}, {res} m", kind: "label" },
  "instrument.sheet.bands": { text: "Elevation Bands", kind: "heading" },
  "instrument.sheet.bands.key": { text: "limits at {lower} m and {upper} m", kind: "label" },
  "instrument.credit.modisNdvi": { text: "MODIS MOD13Q1 v6.1, NASA LP DAAC", kind: "ui" },
  "instrument.credit.chirps": {
    text: "CHIRPS v3.0, Climate Hazards Center, UC Santa Barbara",
    kind: "ui",
  },
  "instrument.credit.modisSnow": { text: "MODIS MOD10A1 v6.1, NSIDC", kind: "ui" },
  "instrument.credit.worldcover": { text: "© ESA WorldCover 2021, CC BY 4.0", kind: "ui" },
  "instrument.credit.dem": {
    text: "Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved",
    kind: "ui",
  },

  // Instruments: the cutaway (approved specimen B). Figures, years and limits come from the fixtures; the place's
  // name and the two published statements with their sources come from their own fixtures, not from here
  // (lib/instruments/valley/cutaway-data.ts)
  "instrument.cutaway.description": {
    text: "The catchment cut north to south through {place}. Its section face shows the true elevation profile and the two band limits. Beside each band are its vegetation trend and its monthly snow cover.",
    kind: "ui",
  },
  "instrument.cutaway.keys": {
    text: "Arrow keys turn the model; Home returns to the measured view.",
    kind: "ui",
  },
  "instrument.cutaway.failed": {
    text: "Cutaway not loaded. Reload the page to retry.",
    kind: "ui",
  },
  "instrument.cutaway.band.high": { text: "{limit} m and above", kind: "label" },
  "instrument.cutaway.band.mid": { text: "{lower} to {upper} m", kind: "label" },
  "instrument.cutaway.band.low": { text: "Below {limit} m", kind: "label" },
  "instrument.cutaway.band.unit": { text: "NDVI per decade", kind: "label" },
  // the snow key's two lines, as specimen B breaks them
  "instrument.cutaway.snow": { text: "Snow-covered share by month,", kind: "label" },
  "instrument.cutaway.snow.years": { text: "mean of {from} to {to}", kind: "label" },
  "instrument.cutaway.metres": { text: "{value} m", kind: "label" },
  "instrument.cutaway.north": { text: "N", kind: "label" },
  "instrument.cutaway.south": { text: "S", kind: "label" },
  // the snow summary records the snow recipe as not applicable (the place's sampled winters show almost no snow); it
  // is not a finding that snow never falls
  "instrument.cutaway.noSnow": {
    text: "No snow drawn: the sampled winters showed almost none.",
    kind: "label",
    honesty: true,
  },
  "instrument.cutaway.statement": { text: "Published statement {n}", kind: "label" },

  // Instruments: the briefing shell around them. Enter in the command line opens the valley with the typed text in
  // the valley's command line, sending nothing
  // each view's name in the breadcrumb, in plain words (decision 13)
  "instrument.shell.layers": { text: "Five layers", kind: "label" },
  "instrument.shell.cutaway": { text: "Cut through", kind: "label" },
  "instrument.shell.pixel": { text: "This pixel", kind: "label" },
  "instrument.shell.rainfall": { text: "Rainfall", kind: "label" },
  "instrument.shell.field": { text: "Field plan", kind: "label" },
  "instrument.shell.command": { text: "Ask or challenge", kind: "label" },

  // Instruments: the pixel anatomy (approved specimen C). Every number comes from the pixel's data file; the species
  // statements and their sources come from the statements fixture
  // the neutral question, shown only when the case's record states none (P7b-10 states each place's own)
  "instrument.pixel.question": {
    text: "What is one pixel's trend made of?",
    kind: "ui",
  },
  "instrument.pixel.source.trend": {
    text: "MODIS MOD13Q1 v6.1 (Didan 2021), per-pixel Theil-Sen trend, Siterra pixel_trend_long_record; ESA WorldCover v200 (Zanaga et al. 2022).",
    kind: "ui",
  },
  "instrument.pixel.source.spectra": {
    text: "Sentinel-2 L2A class spectra measured in the pixel's own cells, Earth Search sentinel-cogs.",
    kind: "ui",
  },
  "instrument.pixel.chip": { text: "Source {n}: {text}", kind: "label" },
  "instrument.pixel.locate": { text: "Locate", kind: "heading" },
  "instrument.pixel.locate.key": {
    text: "NDVI per decade, {window} {from} to {to}",
    kind: "label",
  },
  "instrument.pixel.km": { text: "{value} km", kind: "label" },
  "instrument.pixel.m": { text: "{value} m", kind: "label" },
  "instrument.pixel.cells": { text: "Pixel Cells", kind: "heading" },
  "instrument.pixel.cells.detail": {
    text: "Pixel {tile}, row {row}, column {col}, as its {cells} Sentinel-2 cells of 10 m. Cells outside it are veiled.",
    kind: "ui",
  },
  "instrument.pixel.cells.detailLand": {
    text: "Pixel {tile}, row {row}, column {col}, as its {cells} Sentinel-2 cells of 10 m, risen from the land. Paint them by:",
    kind: "ui",
  },
  "instrument.pixel.cells.truecolour": { text: "True color", kind: "label" },
  "instrument.pixel.cells.ndvi": { text: "NDVI, {month}", kind: "label" },
  "instrument.pixel.cells.class": { text: "WorldCover {year} class", kind: "label" },
  "instrument.pixel.cells.truecolourNote": {
    text: "Shared display composite. Display only, no value read from it.",
    kind: "ui",
  },
  "instrument.pixel.cells.ndviNote": {
    text: "Monthly median of {min} to {max} clear dates per cell",
    kind: "label",
  },
  "instrument.pixel.class.10": { text: "Tree cover", kind: "label" },
  "instrument.pixel.class.40": { text: "Cropland", kind: "label" },
  "instrument.pixel.class.30": { text: "Grassland", kind: "label" },
  "instrument.pixel.class.60": { text: "Bare or sparse", kind: "label" },
  "instrument.pixel.classShort.10": { text: "Tree", kind: "label" },
  "instrument.pixel.classShort.40": { text: "Cropland", kind: "label" },
  "instrument.pixel.classShort.30": { text: "Grassland", kind: "label" },
  "instrument.pixel.classShort.60": { text: "Bare", kind: "label" },
  "instrument.pixel.spectra": { text: "Measured Spectra", kind: "heading" },
  "instrument.pixel.spectra.detail": {
    text: "Sentinel-2 L2A, {date}: median of each class's cells. All {cells} cells clear.",
    kind: "ui",
  },
  "instrument.pixel.spectra.reflectance": { text: "Reflectance", kind: "label" },
  "instrument.pixel.spectra.red": { text: "Red B04", kind: "label" },
  "instrument.pixel.spectra.nir": { text: "Near-infrared B08", kind: "label" },
  "instrument.pixel.spectra.axisShort": { text: "Wavelength, nm", kind: "label" },
  "instrument.pixel.spectra.axis": {
    text: "Wavelength, nm (axis broken at 900 to 1500)",
    kind: "label",
  },
  "instrument.pixel.spectra.ndvi": { text: "NDVI {value}", kind: "label" },
  "instrument.pixel.spectra.cellCount": { text: "{n} cells", kind: "label" },
  "instrument.pixel.spectra.pixel": { text: "This pixel, all cells", kind: "label" },
  "instrument.pixel.spectra.model": { text: "Model mix, panel 05", kind: "label" },
  "instrument.pixel.series": { text: "Season Record", kind: "heading" },
  "instrument.pixel.series.pixel": { text: "This pixel", kind: "label" },
  "instrument.pixel.series.band": { text: "Band below", kind: "label" },
  "instrument.pixel.series.trend": {
    text: "{slope} per decade, 95% {lower} to {upper}",
    kind: "label",
  },
  "instrument.pixel.model": { text: "Linear Mix Model", kind: "heading" },
  "instrument.pixel.model.label": {
    text: "Model: linear mix of measured class spectra from this pixel. Not a measurement of plant species.",
    kind: "ui",
  },
  "instrument.pixel.model.keyShort": { text: "Model NDVI", kind: "label" },
  "instrument.pixel.model.measuredShort": { text: "Measured {value}", kind: "label" },
  "instrument.pixel.model.labelShort": {
    text: "A linear mix of this pixel's class spectra. Not a measurement of plant species.",
    kind: "ui",
    honesty: true,
  },
  "instrument.pixel.model.bar": {
    text: "Class shares in the model; ticks mark the measured shares.",
    kind: "ui",
  },
  "instrument.pixel.model.segment": { text: "{name} {share}", kind: "label" },
  "instrument.pixel.model.boundary": { text: "Boundary between {left} and {right}", kind: "label" },
  "instrument.pixel.model.key": {
    text: "Model NDVI, mix of the {date} class medians",
    kind: "label",
  },
  "instrument.pixel.model.delta": {
    text: "{value} in model NDVI from the measured mix",
    kind: "label",
  },
  "instrument.pixel.model.gloss": { text: "Mixed red {red} and near-infrared {nir}.", kind: "ui" },
  "instrument.pixel.model.measured": {
    text: "Measured {value} on the same date (mean of cells).",
    kind: "ui",
  },
  "instrument.pixel.model.drag": {
    text: "Drag a boundary to move share between two classes.",
    kind: "ui",
  },
  "instrument.pixel.model.reset": { text: "Reset Shares", kind: "button" },
  "instrument.pixel.model.meaning": {
    text: "Grassland keeps its measured spectrum in every mix; only the shares move. The satellite records the mix, not which plants grow in the grassland.",
    kind: "ui",
  },
  "instrument.pixel.field": { text: "Field Check", kind: "heading" },
  "instrument.pixel.field.proposed": { text: "Proposed field check. Not measured.", kind: "ui" },
  "instrument.pixel.field.transect": {
    text: "Transect of {length} m on grassland: {n} quadrats, dashed on 02",
    kind: "label",
  },
  "instrument.pixel.field.records": {
    text: "Records plant cover by species and palatability, bare ground",
    kind: "label",
  },
  "instrument.pixel.field.noSpectrum": {
    text: "No spectrum of any of these species was measured here.",
    kind: "ui",
  },
  "instrument.pixel.description": {
    text: "One 250 m satellite pixel shown as its 10 m Sentinel-2 cells, with the measured spectra of its land cover classes and its season record. A linear mix model has movable class shares, and a field check is proposed.",
    kind: "ui",
  },
  // a cited statement and its references, as "(SCI-03, pp. 7 to 8)"
  "instrument.pixel.ref": { text: "{text} ({refs}).", kind: "label" },
  "instrument.pixel.ref.page": { text: "{id}, p. {page}", kind: "label" },
  "instrument.pixel.ref.pages": { text: "{id}, pp. {page}", kind: "label" },
  "instrument.pixel.failed": { text: "Pixel not loaded. Reload the page to retry.", kind: "ui" },

  // Instruments: the rainfall scatter. Every total here is the bundle's primary rainfall window and says so (its window
  // in words, U25); seasons, the fit and the driest seasons come from the restrend bundle files the spec names
  "instrument.scatter.description": {
    text: "The catchment's seasons as points: each season's greenness against the rainfall before it, a straight-line fit, the four driest seasons ringed.",
    kind: "ui",
  },
  "instrument.scatter.failed": {
    text: "Rainfall scatter not loaded. Reload the page to retry.",
    kind: "ui",
  },
  "instrument.scatter.axis.rain": { text: "{window} rainfall, mm", kind: "label" },
  "instrument.scatter.axis.ndvi": { text: "{window} NDVI, catchment mean", kind: "label" },
  "instrument.scatter.fit": { text: "Straight-line fit, R squared {r2}", kind: "label" },
  "instrument.scatter.driest": { text: "{year}, {mm} mm", kind: "label" },
  "instrument.scatter.seasons": { text: "{n} seasons, {from} to {to}", kind: "label" },
  "instrument.scatter.key.season": { text: "One season", kind: "label" },
  "instrument.scatter.why": {
    text: "The fit says nothing about why.",
    kind: "label",
    honesty: true,
  },
  "instrument.scatter.more": { text: "Fit and interval", kind: "label" },
  "instrument.scatter.key.driest": {
    text: "The four driest {window} totals",
    kind: "label",
  },
  "instrument.scatter.slope": {
    text: "Rainfall slope {slope} NDVI per 100 mm, 95% {lower} to {upper}.",
    kind: "ui",
  },
  // Instruments: the field plan. Explanations, statuses and checks come from the branch merge the field plan spec
  // names; every check is proposed, nothing is scheduled
  "instrument.fieldPlan.description": {
    text: "The explanations the branch merge weighed, with the status it gave each, and the proposed field checks that would tell the open ones apart.",
    kind: "ui",
  },
  "instrument.fieldPlan.failed": {
    text: "Field plan not loaded. Reload the page to retry.",
    kind: "ui",
  },
  "instrument.fieldPlan.none": {
    text: "This case's record holds no field plan yet.",
    kind: "ui",
  },
  "instrument.fieldPlan.proposed": { text: "Proposed", kind: "label" },
  "instrument.fieldPlan.reason.failed": {
    text: "A prediction it needs failed on adequate data.",
    kind: "ui",
  },
  "instrument.fieldPlan.reason.tooFew.one": {
    text: "Not enough data yet: {have} period of data, {need} are needed to rule it out.",
    kind: "ui",
  },
  "instrument.fieldPlan.reason.tooFew": {
    text: "Not enough data yet: {have} periods of data, {need} are needed to rule it out.",
    kind: "ui",
  },
  "instrument.fieldPlan.reason.noneRecorded": { text: "No predictions were recorded.", kind: "ui" },
  "instrument.fieldPlan.reason.noneTestable": {
    text: "No prediction can be tested with the record yet.",
    kind: "ui",
  },
  "instrument.fieldPlan.reason.allMet": {
    text: "Every testable prediction is met, {n} of {of}.",
    kind: "ui",
  },
  // a prediction the branch does not need was not met (branches.ts: cannot be assessed, or consistent when every
  // needed one is met); the predictions are counted, never named
  "instrument.fieldPlan.reason.notNeeded.one": {
    text: "A prediction it does not need was not met.",
    kind: "ui",
  },
  "instrument.fieldPlan.reason.notNeeded": {
    text: "{n} predictions it does not need were not met.",
    kind: "ui",
  },
  "instrument.fieldPlan.reason.optional.need.one": {
    text: "The prediction it needs was met",
    kind: "ui",
  },
  "instrument.fieldPlan.reason.optional.need": {
    text: "{met} of {of} predictions it needs were met",
    kind: "ui",
  },
  "instrument.fieldPlan.reason.optional.one": {
    text: "{need}; one it does not need was not.",
    kind: "ui",
  },
  "instrument.fieldPlan.reason.optional": {
    text: "{need}; {n} it does not need were not.",
    kind: "ui",
  },
  "instrument.fieldPlan.separates": { text: "Tells apart {pairs}", kind: "label" },
  "instrument.fieldPlan.only": {
    text: "The only proposed check that tells {a} from {b}",
    kind: "label",
  },
  "instrument.fieldPlan.pair": { text: "{a} and {b}", kind: "label" },
  "instrument.fieldPlan.unseparated.none": {
    text: "Every pair of open explanations has a proposed check that tells them apart.",
    kind: "ui",
  },
  "instrument.fieldPlan.unseparated": {
    text: "No proposed check tells these apart: {pairs}.",
    kind: "ui",
  },
  "instrument.scatter.gate": {
    text: "The interval includes zero, so the rainfall-adjusted trend's precondition is not met.",
    kind: "ui",
  },
  "instrument.pixel.credit": {
    text: "Contains modified Copernicus Sentinel data 2025. MODIS MOD13Q1 v6.1, NASA LP DAAC. © ESA WorldCover project 2021, CC BY 4.0. Catchment from Copernicus DEM GLO-30.",
    kind: "ui",
  },

  // The overview (approved specimen D4) at /valley: the relief inside an arc, five findings on it, the proposed field
  // check on the land and the ask. Every number, the case question, the place's name and its area come from the
  // records; the findings' captions name what each number is
  "overview.description": {
    text: "A relief model of the catchment inside one arc. Each point on the arc is a finding with its number. The circle on the arc's lower left opens the ask.",
    kind: "ui",
  },
  "overview.keys": {
    text: "Enter opens a finding's view over the land; Esc plays it back to the overview. The slash key opens the ask.",
    kind: "ui",
  },
  "overview.findings": { text: "Findings", kind: "heading" },
  // decision 16: one short line under each number; the season and years are in the opened card
  "overview.finding.catchment.1": { text: "NDVI per decade, catchment", kind: "label" },
  "overview.finding.band.1": { text: "NDVI per decade below {limit} m", kind: "label" },
  "overview.finding.pixel.1": { text: "NDVI per decade, one pixel", kind: "label" },
  "overview.finding.rain.1": { text: "R squared with rainfall", kind: "label" },
  // the share's direction from its Measurement's metric (AUDIT's U28 advisory: every place said greening)
  "overview.finding.fdr.1": { text: "of the area {direction}", kind: "label" },
  "overview.fdr.up": { text: "greening", kind: "label" },
  "overview.fdr.down": { text: "browning", kind: "label" },
  "overview.fdr.none": { text: "with a trend", kind: "label" },
  // a direction-neutral place's record holds both shares: both are shown, each from its own Measurement (U25b)
  "overview.fdr.share": { text: "{value} {direction}", kind: "label" },
  "overview.fdr.both": { text: "{first}, {second}", kind: "label" },
  "overview.finding.fdr.pair.1": {
    text: "of the area after a false discovery rate check",
    kind: "label",
  },
  "overview.lift.trend.pair": {
    text: "{n} cells, {window}; {shares} after a false discovery rate check",
    kind: "ui",
  },
  "overview.finding.fdr.2": { text: "after a false discovery rate check", kind: "label" },
  "overview.field": { text: "Proposed field check, not measured", kind: "label", honesty: true },
  "overview.pixel": { text: "This pixel", kind: "label" },
  // a question at work on the overview (U29, specimen R); only what runs now has words (decision 16)
  "run.task.one": { text: "{model}, 1 call, {time} s", kind: "label" },
  "run.task.many": { text: "{model}, {calls} calls, {time} s", kind: "label" },
  "run.task.waiting": { text: "Calling the model, {time} s", kind: "label" },
  "run.gather.land": { text: "On the land", kind: "label" },
  "run.gather.unchecked": {
    text: "Not yet checked against a source",
    kind: "label",
    honesty: true,
  },
  "run.branch.sealed": { text: "Predictions locked", kind: "label" },
  "run.branch.consistent": { text: "Consistent", kind: "label" },
  "run.branch.contradicted": { text: "Contradicted", kind: "label" },
  "run.branch.cannot": { text: "Cannot be assessed", kind: "label" },
  "run.check": { text: "Proposed check: {label}", kind: "label", honesty: true },
  "run.sofar": { text: "Findings so far: {n}", kind: "label" },
  "run.findings": { text: "{n} findings in {time} s", kind: "label" },
  "run.count.checked": { text: "{n} checked", kind: "label" },
  "run.count.computed": { text: "{n} computed", kind: "label" },
  "run.count.unchecked": { text: "{n} not yet checked", kind: "label", honesty: true },
  "run.check.kicker": { text: "Proposed field check", kind: "label", honesty: true },
  "run.open": { text: "See the Findings", kind: "button" },
  "run.recorded.title": { text: "Recorded run, {date}", kind: "label", honesty: true },
  "run.recorded.detail": {
    text: "Nothing is computed now. Shown {speed} times faster than it ran.",
    kind: "ui",
    honesty: true,
  },
  "run.done": { text: "Ran for {time} s", kind: "label" },
  "run.replayed": { text: "Replayed run, no model called now", kind: "label", honesty: true },
  "run.recorded": { text: "Recorded run, nothing computed now", kind: "label", honesty: true },
  // the proposed walking routes (U12): the entry, and the opened column; numbers and route names come from the record
  "overview.routes": {
    text: "Proposed routes, access unconfirmed",
    kind: "label",
    honesty: true,
  },
  // decision 16: the column says where the routes start and what kind of figure they are; their limits in full and
  // the cost function wait behind "Method and Limits"
  "overview.routes.grey": {
    text: "From {origin}, one way. Model estimates.",
    kind: "ui",
    honesty: true,
  },
  "overview.routes.not": { text: "Model estimates, {not}.", kind: "ui", honesty: true },
  "overview.routes.method": { text: "Method and Limits", kind: "button" },
  "overview.routes.figures": {
    text: "{length}, climb {climb}, {time}",
    kind: "label",
  },
  "overview.routes.cost": {
    text: "Cost function: {name}, times {factor} off path; {time}.",
    kind: "ui",
  },
  "overview.routes.unread": {
    text: "Length, climb and time not loaded. Reload the page to retry.",
    kind: "ui",
  },
  "overview.key.tree": { text: "Tree cover", kind: "label" },
  "overview.key.crop": { text: "Cropland or built-up, {year}", kind: "label" },
  // the opened finding's record (D4's opened node): a kicker, the number, its caption, the season chart and its
  // line, the published context in the record's display text with its sources, and the way to the full instrument
  "overview.record.pixel": { text: "One pixel", kind: "label" },
  // what the land shows while a finding is open (decision 6): its footprint, from the case's own assets

  "overview.lift.trend": {
    text: "{n} cells, {window}; {share} of the area {direction} after a false discovery rate check",
    kind: "ui",
  },
  "overview.lift.rain": {
    text: "{n} rainfall cells; R squared {r2} against greenness",
    kind: "ui",
  },
  "overview.lift.cover": { text: "ESA WorldCover {year}, 10 m", kind: "ui" },
  "overview.lift.bands": {
    text: "Equal-area thirds, limits at {lower} m and {upper} m",
    kind: "ui",
  },
  "overview.hover.height": { text: "{value} m above sea level", kind: "ui" },
  "overview.hover.band.low": { text: "Lowest third, below {limit} m", kind: "ui" },
  "overview.hover.band.mid": { text: "Middle third, {lower} to {upper} m", kind: "ui" },
  "overview.hover.band.high": { text: "Highest third, {limit} m and above", kind: "ui" },
  "overview.hover.drainage": { text: "Drainage line, order {order}", kind: "label" },
  "overview.slopeKey": { text: "NDVI per decade, {window}", kind: "label" },
  "overview.record.band": { text: "Below {limit} m", kind: "label" },
  "overview.record.caption": {
    text: "NDVI per decade, {window}, {from} to {to}",
    kind: "label",
  },
  // decision 16: the card's interval is its fit and its numbers, and one short line says what a dot is
  "overview.record.theilSen": { text: "Theil-Sen, 95%: {lower} to {upper}", kind: "label" },
  "overview.record.ols": { text: "Least squares, 95%: {lower} to {upper}", kind: "label" },
  "overview.record.dot": { text: "Each dot, one season's mean", kind: "label" },
  // what the slope colours on the land are, and are not (the lead's U25b must-fix: no finding read into the map)
  "overview.onLand.fdrRule": {
    text: "Colors show each cell's trend, not which cells pass the check.",
    kind: "ui",
    honesty: true,
  },
  "overview.record.scatter": {
    text: "One point per season; the line is the straight-line fit across them.",
    kind: "ui",
  },
  "overview.record.ndvi": { text: "NDVI", kind: "label" },
  "overview.record.rain": { text: "{window}, mm", kind: "label" },
  "overview.record.context": { text: "Published context", kind: "label" },
  // each record's one action, named by what the visitor will see (decision 13)
  "overview.open.layers": { text: "See the Five Layers", kind: "button" },
  "overview.open.cutaway": { text: "Cut Through the Land", kind: "button" },
  "overview.open.pixel": { text: "Open This Pixel", kind: "button" },
  "overview.open.rainfall": { text: "Compare with Rainfall", kind: "button" },
  "overview.open.field": { text: "See the Field Plan", kind: "button" },
  "overview.open.time": { text: "See It Over Time", kind: "button" },
  "overview.cite": { text: "{authors} {year}, {venue}, p. {page}", kind: "label" },
  "overview.cite.pages": { text: "{authors} {year}, {venue}, pp. {pages}", kind: "label" },
  "overview.cite.noPage": { text: "{authors} {year}, {venue}", kind: "label" },
  "overview.cite.etAl": { text: "{name} et al.", kind: "label" },
  "overview.cite.two": { text: "{a} and {b}", kind: "label" },
  // the breadcrumb's last crumb while something is open: the finding's number from the record with a few words
  "overview.crumb.catchment": { text: "{value} over the catchment", kind: "label" },
  "overview.crumb.band": { text: "{value} below {limit} m", kind: "label" },
  "overview.crumb.pixel": { text: "{value} in one pixel", kind: "label" },
  "overview.crumb.rain": { text: "{value} rain and greenness", kind: "label" },
  "overview.crumb.fdr": { text: "{value} {direction}", kind: "label" },
  "overview.crumb.field": { text: "Proposed field check", kind: "label" },
  "overview.crumb.routes": { text: "Proposed walking routes", kind: "label" },
  "overview.crumb.results": { text: "Findings", kind: "label" },
  "overview.failed": { text: "Overview not loaded. Reload the page to retry.", kind: "ui" },
  "instrument.noBandLimits": {
    text: "This case's record holds no two elevation band limits, so this view is not drawn.",
    kind: "ui",
  },
  "overview.noLand": {
    text: "This case's record holds no view of its land yet, so the land is not drawn.",
    kind: "ui",
  },

  // The ask: a matte circle that opens a fade from the bottom with the question typed in large type. Enter sends it
  // on the overview (the same commission as the valley's command line) and carries it to the overview from an
  // instrument, sending nothing there; the activity line shows only after Enter, from the session's log
  "ask.circle": { text: "ask", kind: "label" },
  "ask.open": { text: "Ask Siterra", kind: "button" },
  "ask.close": { text: "Close Ask", kind: "button" },
  // the activity line: the step running with the model and route that served it (the activity panel's badge)
  "ask.taskModel": { text: "{model}: {task}, {status}", kind: "ui" },
  "ask.task": { text: "{task}, {status}", kind: "ui" },
  // The ask's results (U11b): the work card's outcome with its findings count as a button, and the results view it
  // opens: an answer caption from the request's BranchMerge counts, then the findings it committed, each statement
  // as recorded, with a source chip that opens the cited locator and excerpt
  "ask.complete": { text: "Complete.", kind: "ui" },
  "ask.findings": { text: "Findings: {n}", kind: "button" },
  "results.title": { text: "Results", kind: "heading" },
  "results.findings": { text: "Findings", kind: "heading" },
  "results.chip": { text: "Source {n}", kind: "button" },
  "results.n0": { text: "no", kind: "label" },
  "results.n1": { text: "one", kind: "label" },
  "results.n2": { text: "two", kind: "label" },
  "results.n3": { text: "three", kind: "label" },
  "results.n4": { text: "four", kind: "label" },
  "results.n5": { text: "five", kind: "label" },
  "results.first.contradicted.one": { text: "{n} explanation is contradicted", kind: "ui" },
  "results.first.contradicted.many": { text: "{n} explanations are contradicted", kind: "ui" },
  "results.then.contradicted.one": { text: "{n} is contradicted", kind: "ui" },
  "results.then.contradicted.many": { text: "{n} are contradicted", kind: "ui" },
  "results.first.consistent.one": {
    text: "{n} explanation is consistent with the records",
    kind: "ui",
  },
  "results.first.consistent.many": {
    text: "{n} explanations are consistent with the records",
    kind: "ui",
  },
  "results.then.consistent.one": { text: "{n} is consistent with the records", kind: "ui" },
  "results.then.consistent.many": { text: "{n} are consistent with the records", kind: "ui" },
  "results.first.cannot.one": { text: "{n} explanation cannot be assessed yet", kind: "ui" },
  "results.first.cannot.many": { text: "{n} explanations cannot be assessed yet", kind: "ui" },
  "results.then.cannot.one": { text: "{n} cannot be assessed yet", kind: "ui" },
  "results.then.cannot.many": { text: "{n} cannot be assessed yet", kind: "ui" },
  "results.join1": { text: "{a}.", kind: "ui" },
  "results.join2": { text: "{a} and {b}.", kind: "ui" },
  "results.join3": { text: "{a}, {b} and {c}.", kind: "ui" },
  "results.plan.one": {
    text: "The field plan proposes {n} check that tells the open ones apart.",
    kind: "ui",
  },
  "results.plan.many": {
    text: "The field plan proposes {n} checks that tell the open ones apart.",
    kind: "ui",
  },
  "results.plan.none": { text: "No proposed field check tells the open ones apart.", kind: "ui" },
  // the counts agree with their numbers: "1 check", "2 checks"; "1 pair ... is", "2 pairs ... are"
  "results.plan.partial": {
    text: "The field plan proposes {checks}; {pairs} not told apart by any of them.",
    kind: "ui",
  },
  "results.count.check.one": { text: "{n} check", kind: "ui" },
  "results.count.check.many": { text: "{n} checks", kind: "ui" },
  "results.count.pair.one": { text: "{n} pair of open explanations is", kind: "ui" },
  "results.count.pair.many": { text: "{n} pairs of open explanations are", kind: "ui" },
  "results.only.one": { text: "The request added {n} finding to the case record.", kind: "ui" },
  "results.only.many": { text: "The request added {n} findings to the case record.", kind: "ui" },
  "results.excerpt": { text: "{title}, {locator}: \u201c{excerpt}\u201d", kind: "ui" },
  "results.locator": { text: "{title}, {locator}", kind: "ui" },
  "results.cite": { text: "{authors} {year}", kind: "label" },
  "results.unknownSource": { text: "a source the case does not hold", kind: "label" },
  "results.unknownBundle": { text: "Data the case does not hold", kind: "label" },
  "results.checked": { text: "Checked against the source", kind: "label" },
  "results.unchecked": { text: "Not yet checked against the source", kind: "label", honesty: true },
  "results.computed.state": { text: "Computed from the record's measurements", kind: "label" },
  "results.computed.none": { text: "{bundle}.", kind: "ui" },
  "results.computed.one": { text: "{bundle}. Computed from one of its measurements.", kind: "ui" },
  "results.computed.many": { text: "{bundle}. Computed from {n} of its measurements.", kind: "ui" },
} as const satisfies Record<string, Message>;

export type MessageId = keyof typeof en;

/**
 * Lint exceptions by string ID with the reason, never by pattern (voice and tone guide). Each entry names
 * the rules it may break.
 */
export const LINT_ALLOWLIST: Partial<Record<MessageId, { rules: string[]; reason: string }>> = {
  "overview.open.layers": {
    rules: ["VT-48"],
    reason: "The lead's decision 13 names each record's action by what the visitor will see.",
  },
  "overview.open.cutaway": {
    rules: ["VT-48"],
    reason: "The lead's decision 13 names each record's action by what the visitor will see.",
  },
  "overview.open.field": {
    rules: ["VT-48"],
    reason: "The lead's decision 13 names each record's action by what the visitor will see.",
  },
  "overview.open.time": {
    rules: ["VT-48"],
    reason: "The lead named this action (decision 15 adds T): it says what the visitor will see.",
  },
  "source.gbif": {
    rules: ["VT-08"],
    reason:
      "GBIF is the data source's own name, written as it writes it, like NASA and ESA in the credits.",
  },
  "source.modis": {
    rules: ["VT-08"],
    reason:
      "MODIS is the instrument's name; the short line names the data as its provider and instrument.",
  },

  "instrument.credit.modisNdvi": {
    rules: ["VT-08"],
    reason:
      "MODIS is the instrument's name and LP DAAC the archive's; the credit names the product as NASA's archive lists it.",
  },
  "instrument.credit.modisSnow": {
    rules: ["VT-08"],
    reason:
      "MODIS is the instrument's name and NSIDC the data centre's; the credit names the product as the data centre lists it.",
  },
  "instrument.credit.dem": {
    rules: ["VT-03", "VT-08"],
    reason: "Copernicus WorldDEM-30 licence notice, kept in the wording the licence requires.",
  },
  "instrument.pixel.source.trend": {
    rules: ["VT-08"],
    reason:
      "MODIS is the instrument's name; the source note names the product, the recipe and the land cover map as their publishers list them.",
  },
  "instrument.pixel.credit": {
    rules: ["VT-08"],
    reason:
      "MODIS is the instrument's name and LP DAAC the archive's; the credit carries the data licences' required wording.",
  },
  "credit.globe": {
    rules: ["VT-03", "VT-08"],
    reason: "Copernicus WorldDEM-90 licence notice, kept in the wording the licence requires.",
  },
};

/** True for a line that says what a value is not or does not prove (exempt from the label word cap). */
export function isHonesty(id: MessageId): boolean {
  const m: Message = en[id];
  return m.honesty === true;
}

/** Fills {name} placeholders. Unknown placeholders are left as written so a missing value shows. */
export function format(id: MessageId, values: Record<string, string | number> = {}): string {
  return en[id].text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}
