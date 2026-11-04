// The Sources and Limits overlay's words (S and W), a sibling of en.ts with the same Message shape and lint
// (sources.test.ts runs it). Every dataset, version, credit, publication and count the overlay shows is a record field;
// these are the labels around them, the names of the open datasets by the dataset IDs the case's data bundles carry,
// and the limits in plain words, each shown only when the record states what it says (lib/sources/limits.ts). A
// dataset ID with no name here is shown as the record writes it. No place name, and none of the record's own words
// (merge, status, branch, revision, composite and the like).

import type { Message } from "./en";

export const sc = {
  "sources.dialog": { text: "Sources and limits of the case", kind: "ui" },
  "sources.tabs": { text: "Sources and limits", kind: "ui" },
  "sources.tab.sources": { text: "Sources", kind: "heading" },
  "sources.tab.limits": { text: "Limits", kind: "heading" },

  // Sources, left: one row per dataset the case measured with, its credits and licences whole under it
  "sources.measuredWith": { text: "Measured With", kind: "heading" },
  "sources.version": { text: "{name} {version}", kind: "label" },
  "sources.v": { text: "v{version}", kind: "label" },
  "sources.res.m": { text: "{n} m", kind: "label" },
  "sources.res.km": { text: "{n} km", kind: "label" },
  "sources.period": { text: "{from} to {to}", kind: "label" },
  "sources.detail": { text: "{res}, {period}", kind: "label" },

  // what each dataset measured and its name, by the dataset ID its bundles carry
  "sources.measured.modis-13Q1-061": { text: "Greenness", kind: "label" },
  "sources.measured.sentinel-2-l2a": { text: "Greenness", kind: "label" },
  "sources.measured.CHIRPS-3.0-monthly-final": { text: "Rainfall", kind: "label" },
  "sources.measured.esa-worldcover-v200": { text: "Land cover", kind: "label" },
  "sources.measured.copernicus-dem-glo-30": { text: "Elevation", kind: "label" },
  "sources.measured.modis-10A1-061": { text: "Snow cover", kind: "label" },
  "sources.measured.gbif-occurrence-search": { text: "Species records", kind: "label" },
  "sources.measured.other": { text: "Data", kind: "label" },
  "sources.name.modis-13Q1-061": { text: "MODIS MOD13Q1", kind: "label" },
  "sources.name.sentinel-2-l2a": { text: "Sentinel-2 L2A", kind: "label" },
  "sources.name.CHIRPS-3.0-monthly-final": { text: "CHIRPS", kind: "label" },
  "sources.name.esa-worldcover-v200": { text: "ESA WorldCover", kind: "label" },
  "sources.name.copernicus-dem-glo-30": { text: "Copernicus DEM GLO-30", kind: "label" },
  "sources.name.modis-10A1-061": { text: "MODIS MOD10A1", kind: "label" },
  "sources.name.gbif-occurrence-search": { text: "GBIF occurrence search", kind: "label" },

  // the credits of what the map draws that no dataset carries (a place's name, a village's point)
  "sources.onMap": { text: "On the Map", kind: "heading" },

  // Sources, right: the two-tone line from the record's counts, then every publication the case holds with its link
  "sources.lead.datasets.many": { text: "Measured with {n} datasets.", kind: "ui" },
  "sources.lead.datasets.one": { text: "Measured with 1 dataset.", kind: "ui" },
  "sources.lead.datasets.none": { text: "No measured data in the record.", kind: "ui" },
  "sources.lead.publications.many": { text: "Context from {n} publications.", kind: "ui" },
  "sources.lead.publications.one": { text: "Context from 1 publication.", kind: "ui" },
  "sources.lead.publications.none": { text: "No publication is cited.", kind: "ui" },
  "sources.cite": { text: "{authors} ({year})", kind: "label" },
  "sources.etAl": { text: "{authors} et al.", kind: "label" },
  // the day the analysis behind the answer on screen ran, when that answer is a run's
  "sources.run": { text: "From an analysis run on {date}.", kind: "ui" },

  "sources.limits.none": { text: "The record states no limitation.", kind: "ui" },
  // the pixel view's picture of its cells, where the case offers that view
  "sources.limits.pixelPicture": {
    text: "The true color picture of the pixel's cells is for display only; no value is read from it.",
    kind: "ui",
    honesty: true,
  },
  // Year by Year's playback between measured values, where the case offers that view, with its snow where it plays
  "sources.limits.timeBlend": {
    text: "While Year by Year plays, it blends each year's greenness into the next over November and December. Paused, it shows measured values.",
    kind: "ui",
    honesty: true,
  },
  "sources.limits.timeBlendSnow": {
    text: "While Year by Year plays, it blends each year's greenness into the next over November and December, and the snow between months. Paused, it shows measured values.",
    kind: "ui",
    honesty: true,
  },

  // Limits: the record's limitations in plain words, under four headings and a topic each. A line shows only when the
  // record states what it says (lib/sources/limits.ts); a number in it is counted from the record.
  "sources.section.app": { text: "What Siterra does not do", kind: "label" },
  "sources.section.data": { text: "What the data cannot show", kind: "label" },
  "sources.section.analysis": { text: "What the analysis assumes", kind: "label" },
  "sources.section.map": { text: "What the map does not show", kind: "label" },

  "sources.topic.brief": { text: "Brief", kind: "label" },
  "sources.topic.responses": { text: "Responses", kind: "label" },
  "sources.topic.explanations": { text: "Explanations", kind: "label" },
  "sources.topic.studies": { text: "Studies", kind: "label" },
  "sources.topic.steps": { text: "Analysis steps", kind: "label" },
  "sources.topic.views": { text: "Views", kind: "label" },
  "sources.topic.coverage": { text: "Coverage", kind: "label" },
  "sources.topic.greenness": { text: "Greenness", kind: "label" },
  "sources.topic.images": { text: "Satellite images", kind: "label" },
  "sources.topic.landCover": { text: "Land cover", kind: "label" },
  "sources.topic.rainfall": { text: "Rainfall", kind: "label" },
  "sources.topic.snow": { text: "Snow cover", kind: "label" },
  "sources.topic.species": { text: "Species records", kind: "label" },
  "sources.topic.monthly": { text: "Monthly values", kind: "label" },
  "sources.topic.rainGreen": { text: "Rain and greenness", kind: "label" },
  "sources.topic.trends": { text: "Trends", kind: "label" },
  "sources.topic.windows": { text: "Season windows", kind: "label" },
  "sources.topic.bands": { text: "Elevation bands", kind: "label" },
  "sources.topic.wetSeasons": { text: "Wet seasons", kind: "label" },
  "sources.topic.pixel": { text: "One pixel", kind: "label" },
  "sources.topic.rules": { text: "Rule changes", kind: "label" },
  "sources.topic.area": { text: "Area", kind: "label" },
  "sources.topic.heights": { text: "Heights", kind: "label" },
  "sources.topic.streams": { text: "Streams", kind: "label" },
  "sources.topic.profiles": { text: "Profiles", kind: "label" },
  "sources.topic.routes": { text: "Walking routes", kind: "label" },
  "sources.topic.places": { text: "Places", kind: "label" },
  "sources.topic.pictures": { text: "Pictures", kind: "label" },

  // what Siterra does not do
  "sources.limit.example": {
    text: "The brief, its responses and what they would need are a hand-written example, not a model's output or anyone's plan.",
    kind: "ui",
    honesty: true,
  },
  "sources.limit.draft": {
    text: "The brief is a draft: nothing in it is sent, scheduled or authorized.",
    kind: "ui",
    honesty: true,
  },
  "sources.limit.responses": {
    text: "Responses are candidates, not recommendations: nothing is decided or authorized.",
    kind: "ui",
    honesty: true,
  },
  "sources.limit.noEffect": {
    text: "No benefit, outcome or effect of a response is estimated.",
    kind: "ui",
    honesty: true,
  },
  "sources.limit.predictions": {
    text: "Each explanation is tested against predictions written down before any result was read.",
    kind: "ui",
  },
  "sources.limit.rules": {
    text: "Fixed rules in code set each verdict; a model wrote only the wording.",
    kind: "ui",
  },
  "sources.limit.notProof": {
    text: "A verdict describes the evidence; it is not proof, not a chance of being right, and not an order of the explanations.",
    kind: "ui",
    honesty: true,
  },
  "sources.limit.pairs": {
    text: "Which explanations a field check would tell apart is set when the case is set up, not measured.",
    kind: "ui",
  },
  "sources.limit.studies": {
    text: "Statements from studies repeat what the study says; they are not Siterra's findings, and no person has reviewed them.",
    kind: "ui",
    honesty: true,
  },
  "sources.limit.prepared": {
    text: "The analysis steps were prepared in advance for this demonstration; no model wrote them.",
    kind: "ui",
    honesty: true,
  },
  "sources.limit.views": {
    text: "Each view is built by fixed rules from the case's setup; no model wrote it.",
    kind: "ui",
  },

  // what the data cannot show: coverage, counted from the record
  "sources.coverage.span.policy": {
    text: "{name} is missing values for {n} of {total} months, all from {from} to {to}: less than {policy}% of the area could be used.",
    kind: "ui",
  },
  "sources.coverage.span": {
    text: "{name} is missing values for {n} of {total} months, all from {from} to {to}.",
    kind: "ui",
  },
  "sources.coverage.policy": {
    text: "{name} is missing values for {n} of {total} months: less than {policy}% of the area could be used.",
    kind: "ui",
  },
  "sources.coverage.months": {
    text: "{name} is missing values for {n} of {total} months.",
    kind: "ui",
  },
  "sources.coverage.periods": {
    text: "{name} is missing values for {n} of {total} periods.",
    kind: "ui",
  },
  "sources.bundle.missing": { text: "{label}: not available.", kind: "ui" },
  "sources.bundle.failed": { text: "{label}: could not be computed.", kind: "ui" },
  "sources.bundle.processing": { text: "{label}: still being computed.", kind: "ui" },
  "sources.limit.coverageCounts": {
    text: "Coverage counts how much data passed the cloud and snow mask, for the whole area only; it says nothing about the plants.",
    kind: "ui",
  },
  "sources.limit.anyClear": {
    text: "A date counts if any of its pixels is clear. No minimum was set, since one chosen after seeing the counts would bias the result.",
    kind: "ui",
  },
  "sources.limit.clearShare": {
    text: "A clear share says how often the land was seen, not how much was snow or cloud, or which of the two hid it. It relies on the satellite's own sorting, which errs on thin cloud and shadow.",
    kind: "ui",
  },
  "sources.limit.winterOnly": {
    text: "Visibility by height covers only the winter months of the monthly series.",
    kind: "ui",
  },

  // greenness
  "sources.limit.greenness": {
    text: "Greenness is how green the land looks from above, not how much forage it holds or which plants grow there.",
    kind: "ui",
    honesty: true,
  },
  "sources.limit.greenMix": {
    text: "Spiny shrubs, plants that livestock avoid, orchards and irrigated fields can all look as green as good pasture.",
    kind: "ui",
  },
  "sources.limit.greenParts": {
    text: "Grass, tree canopy and shrubs all add to greenness; the dry matter left on a pasture is a different quantity, measured on the ground.",
    kind: "ui",
  },
  "sources.limit.seasonValue": {
    text: "A season's value is a pixel's average over its usable images, not a measurement of a field or plant. A season with under half its images usable has none.",
    kind: "ui",
  },
  "sources.limit.quality": {
    text: "Only pixels the image maker flags as good or marginal are kept.",
    kind: "ui",
  },

  // satellite images
  "sources.limit.mixed": {
    text: "Each pixel blends the ground inside it, so one value can mix trees, fields, rock and grass.",
    kind: "ui",
  },
  "sources.limit.snowShade": {
    text: "Snow, snow edges and mountain shadow can pass the cloud mask, so winter and spring values partly reflect snow and shade.",
    kind: "ui",
  },
  "sources.limit.snowmelt": {
    text: "An earlier or later snowmelt can move spring greenness with no change in the plants.",
    kind: "ui",
  },
  "sources.limit.winterBias": {
    text: "In winter, snow and shade hide the higher and shaded slopes, so a winter value describes the low, sunny ground.",
    kind: "ui",
  },
  "sources.limit.drift": {
    text: "The Terra satellite now passes earlier in the morning than before 2020, so later years are seen with a lower sun. Longer shadows can then change greenness or snow readings with no change on the ground.",
    kind: "ui",
  },
  "sources.limit.fewImages": {
    text: "Cloud and gaps in the image archive leave some seasons with fewer images.",
    kind: "ui",
  },
  "sources.limit.versions": {
    text: "Sentinel-2 images were processed with different software versions over the years, which shifts their values slightly.",
    kind: "ui",
  },
  "sources.limit.tiles": {
    text: "Where two image tiles overlap, cloud and snow there are counted twice.",
    kind: "ui",
  },

  // land cover
  "sources.limit.oneMap": {
    text: "Land cover is a single year's map from satellite images, applied to every year; a class can differ from the ground.",
    kind: "ui",
  },
  "sources.limit.noPasture": {
    text: "No land cover class is a pasture, a grazing area or a management unit.",
    kind: "ui",
  },
  "sources.limit.treeCover": {
    text: "Tree cover may include orchards, open woodland or savanna.",
    kind: "ui",
  },
  "sources.limit.fields": {
    text: "Mapped fields and buildings are a small share of the area and are left out of the sampling bands, not read as sparse plants.",
    kind: "ui",
  },
  "sources.limit.areas": {
    text: "Areas are counted in map cells, not measured on the curved earth, and a cell on the edge counts when its center is inside.",
    kind: "ui",
  },

  // rainfall
  "sources.limit.rainGrid": {
    text: "Rainfall is estimated for 5 km squares from satellites and stations, not read from a rain gauge.",
    kind: "ui",
  },
  "sources.limit.noGauge": {
    text: "No rain gauge in or near the area was compared with these estimates.",
    kind: "ui",
  },
  "sources.limit.rainShare": {
    text: "Squares that lie partly outside the area count by the share inside it.",
    kind: "ui",
  },
  "sources.limit.rainSnow": {
    text: "A monthly rain total counts snow as rain and does not show when snow falls or melts.",
    kind: "ui",
  },
  "sources.limit.rainVersion": {
    text: "This rainfall version is wetter overall than the one before it, so the two are never mixed.",
    kind: "ui",
  },

  // snow cover
  "sources.limit.snowClear": {
    text: "Snow is seen only on clear days; cloudy days are left out, not filled, so a month's share describes its clear days.",
    kind: "ui",
  },
  "sources.limit.snowPixel": {
    text: "Each 500 m pixel counts as snow or not as a whole, so thin, patchy or shaded snow can be missed.",
    kind: "ui",
  },
  "sources.limit.snowDepth": {
    text: "Snow cover is not depth: it says nothing about how much water the snow holds.",
    kind: "ui",
  },
  "sources.limit.snowChecked": {
    text: "This snow data was checked against other data in other places; no check was made here.",
    kind: "ui",
  },
  "sources.limit.snowThresholds": {
    text: "Those checks found the usual threshold misses some snow, so a second, lower threshold is shown too.",
    kind: "ui",
  },
  "sources.limit.snowSample": {
    text: "The snow check covers a sample of winter months, so snow that came and went in between is not seen.",
    kind: "ui",
  },
  "sources.limit.snowNotRun": {
    text: "Where a sample shows almost no snow, snow cover is not computed; that does not mean snow never falls.",
    kind: "ui",
  },

  // species records
  "sources.limit.speciesSeen": {
    text: "Each record says someone saw or collected an organism at a place and time; some are museum specimens or fossils.",
    kind: "ui",
  },
  "sources.limit.speciesWhere": {
    text: "Records do not measure where species live or how common they are, and they follow roads, villages, trails and keen observers.",
    kind: "ui",
  },
  "sources.limit.speciesYears": {
    text: "Counts by year follow how much people looked, not the organisms, so they are not a trend.",
    kind: "ui",
  },
  "sources.limit.speciesKept": {
    text: "Locations are as precise as each observer made them, and only openly licensed records are kept.",
    kind: "ui",
  },
  "sources.limit.speciesLater": {
    text: "Records are added, corrected and withdrawn over time, so a later request can give other counts.",
    kind: "ui",
  },
  "sources.limit.speciesAbsent": {
    text: "No record of a plant does not mean it is absent, and names can be filed under synonyms.",
    kind: "ui",
  },

  // what the analysis assumes
  "sources.limit.shortRecord": {
    text: "The Sentinel-2 record is short: nothing in it is a trend, and its months are compared with its own years, not a long-term normal.",
    kind: "ui",
  },
  "sources.limit.chance": {
    text: "Over a short record, months can move together by chance.",
    kind: "ui",
  },
  "sources.limit.departure": {
    text: "A departure says how a month differs from the same month in other years, not why.",
    kind: "ui",
  },
  "sources.limit.spread": {
    text: "The spread given is how values vary across the area, not an uncertainty range.",
    kind: "ui",
  },
  "sources.limit.noMask": {
    text: "Fields and orchards count toward the area's greenness; no crop or irrigation mask is applied.",
    kind: "ui",
  },
  "sources.limit.cooccur": {
    text: "Counting months when rain and greenness move together shows that they co-occur, not how much of a change rain explains.",
    kind: "ui",
  },
  "sources.limit.zero": {
    text: "A month whose change is exactly zero has no direction and is left out of both counts.",
    kind: "ui",
  },
  "sources.limit.bothRefs": {
    text: "Counts are given for both reference periods; with the all-years one, more months show exactly zero change.",
    kind: "ui",
  },
  "sources.limit.manyPixels": {
    text: "With thousands of pixels, some show change by chance alone, so the shares come with a check for chance results.",
    kind: "ui",
  },
  "sources.limit.slopeOnly": {
    text: "The trend map shows each pixel's slope, not which pixels pass that check.",
    kind: "ui",
  },
  "sources.limit.neighbors": {
    text: "Neighboring pixels share weather and sensor effects, so a patch of change can have one shared cause; the chance check assumes independent pixels.",
    kind: "ui",
  },
  "sources.limit.manyPairs": {
    text: "Each band and season pair has its own range; shown together, some ranges show change by chance alone.",
    kind: "ui",
  },
  "sources.limit.pairCheck": {
    text: "Every pair is shown, each with the chance check.",
    kind: "ui",
  },
  "sources.limit.miss": {
    text: "A trend can miss real change, so a range that includes zero does not show that nothing changed.",
    kind: "ui",
    honesty: true,
  },
  "sources.limit.notRainAdjusted": {
    text: "The long-record trends are not adjusted for rain; a separate rain-adjusted trend shows how closely greenness follows earlier rain.",
    kind: "ui",
  },
  "sources.limit.residual": {
    text: "The rain-adjusted trend still holds everything else that changes greenness, such as temperature, snow, water, crops, grazing, fire and sensor changes. It does not measure the effect of grazing or a decline of the land.",
    kind: "ui",
    honesty: true,
  },
  "sources.limit.stepping": {
    text: "The season values feed the trend and are not a second analysis. Stepping through them shows runs of high or low years, not a trend or a cause.",
    kind: "ui",
  },
  "sources.limit.windowsFixed": {
    text: "Season windows were fixed before any value was read; other windows can give other slopes, so every window is kept.",
    kind: "ui",
  },
  "sources.limit.windowsRead": {
    text: "The windows follow the growing season as read for this case, not dates taken from a published source.",
    kind: "ui",
  },
  "sources.limit.summerWindow": {
    text: "The June to September window spans the late spring closing of high pastures and the open summer grazing after it. Opening dates vary by village and year.",
    kind: "ui",
  },
  "sources.limit.dryWindow": {
    text: "In the dry-season window it is not known which plants stay green, so its trend is not read as a trend in grazed grass.",
    kind: "ui",
  },
  "sources.limit.bands": {
    text: "Elevation bands split the area by height to organize sampling; they are not vegetation types, grazing zones or management boundaries.",
    kind: "ui",
  },
  "sources.limit.straddle": {
    text: "A pixel that falls in two bands counts toward each by its share inside.",
    kind: "ui",
  },
  "sources.limit.reservoir": {
    text: "Greenness near a reservoir changes with its water, not only its plants, so its shore is kept as a separate zone.",
    kind: "ui",
  },
  "sources.limit.reservoirZone": {
    text: "That zone is the largest mapped water body plus a margin; it follows no year's water level and leaves out small ponds.",
    kind: "ui",
  },
  "sources.limit.rainReference": {
    text: "Rain is compared with a 30-year average and each wet season placed among those years. Neither is a dryness index, and neither says why.",
    kind: "ui",
  },
  "sources.limit.national": {
    text: "Agreement with a national report compares directions only; the report can differ from this area and still be right for its own.",
    kind: "ui",
  },
  "sources.limit.pixelOne": {
    text: "The pixel taken apart is an illustration chosen among a rule's candidates, not a sample, and says nothing about other pixels.",
    kind: "ui",
    honesty: true,
  },
  "sources.limit.pixelMix": {
    text: "Its mix of land cover comes from one clear day and one map, so its greenness is modeled, not measured.",
    kind: "ui",
  },
  "sources.limit.pixelSeries": {
    text: "Its seasons are not adjusted for rain, and its trend is descriptive, with no test for chance.",
    kind: "ui",
  },
  "sources.limit.pixelWindow": {
    text: "Its monthly greenness was computed for that pixel alone; no monthly series exists for the whole area.",
    kind: "ui",
  },
  "sources.limit.postHoc": {
    text: "Some rules were added or changed after the first data or results were seen; each change is logged with its date and effect.",
    kind: "ui",
    honesty: true,
  },

  // what the map does not show
  "sources.limit.area": {
    text: "The area is the land that drains to one outlet; it is not a pasture, lease, parcel, administrative or management boundary.",
    kind: "ui",
    honesty: true,
  },
  "sources.limit.reviewed": { text: "No expert has reviewed the area's boundary.", kind: "ui" },
  "sources.limit.surface": {
    text: "Heights come from a 30 m surface model, not a survey: trees, buildings, steep walls and radar errors distort it, and narrow gorges are blurred.",
    kind: "ui",
  },
  "sources.limit.accuracy": {
    text: "Heights carry the model's stated accuracy of a few meters.",
    kind: "ui",
  },
  "sources.limit.resample": {
    text: "Each height is resampled onto a 30 m grid, not measured at that spot, and finer cells take the height of their 30 m cell.",
    kind: "ui",
  },
  "sources.limit.ring": {
    text: "A ring of cells outside the area helps draw its edge and is not part of the analysis.",
    kind: "ui",
  },
  "sources.limit.traced": {
    text: "Streams are traced on the elevation model, not mapped or checked on the ground, and a traced line can leave the real channel.",
    kind: "ui",
  },
  "sources.limit.start": {
    text: "A stream is drawn wherever enough land drains to a point, so it marks no real source and does not tell seasonal from year-round flow.",
    kind: "ui",
  },
  "sources.limit.uphill": {
    text: "Where the model was filled across hollows, gorges or water, a stream can run uphill. Those parts are marked and say nothing about water.",
    kind: "ui",
  },
  "sources.limit.upstream": {
    text: "Upstream area counts the land that drains to a point, not the rain that reaches it, and ignores canals, withdrawals and groundwater.",
    kind: "ui",
  },
  "sources.limit.order": {
    text: "Stream order counts how channels join; it says nothing about their size, their flow or whether water is present.",
    kind: "ui",
  },
  "sources.limit.spacing": {
    text: "Profiles are sampled every 30 m, so a boundary is placed to within about 15 m and narrower features can fall between samples.",
    kind: "ui",
  },
  "sources.limit.floor": {
    text: "The floor segment of a profile follows a published height range, not a measured flat bottom.",
    kind: "ui",
  },
  "sources.limit.axis": {
    text: "The long profile follows the main channel, not the middle between the slopes, and shares the limits of the stream lines.",
    kind: "ui",
  },
  "sources.limit.waterSurface": {
    text: "Over water the model gives the surface, not the bed, so a profile does not show the water's depth.",
    kind: "ui",
  },
  "sources.limit.routes": {
    text: "Walking routes are the quickest path over the elevation model, not surveyed paths or tracks, and not safe or permitted routes.",
    kind: "ui",
    honesty: true,
  },
  "sources.limit.unchecked": {
    text: "The model cannot see cliffs, scree, snow, river crossings, fences, fields or channels, and no route was checked for them.",
    kind: "ui",
  },
  "sources.limit.times": {
    text: "Walking times are one way, for an adult on trackless ground with no load, rest, weather or snow; real times can differ widely.",
    kind: "ui",
  },
  "sources.limit.climb": {
    text: "Climb and descent include the model's roughness, so they are larger than a smoothed profile would give.",
    kind: "ui",
  },
  "sources.limit.sites": {
    text: "Sites are picked by a fixed rule, not a sampling design; reaching one needs local agreement, land access and permission that no route gives.",
    kind: "ui",
    honesty: true,
  },
  "sources.limit.villages": {
    text: "Village points are published positions, not surveyed points or the extent of a village or its pastures.",
    kind: "ui",
  },
  "sources.limit.labels": {
    text: "Place names are placed for reading; they are not boundaries, and a gazetteer's own position can lie elsewhere.",
    kind: "ui",
  },
  "sources.limit.outlet": {
    text: "The outlet is where all of the area drains on the elevation grid, not a gauge or a surveyed point.",
    kind: "ui",
  },
  "sources.limit.outletInput": {
    text: "The outlet was placed from one public coordinate, not from a survey.",
    kind: "ui",
  },
  "sources.limit.gaugeRecords": { text: "The gauge's own records were not used.", kind: "ui" },
  "sources.limit.display": {
    text: "The colored map of each month's change is for display; every number comes from the measurements.",
    kind: "ui",
  },
} as const satisfies Record<string, Message>;

export type SourcesMessageId = keyof typeof sc;

/** Lint exceptions by string ID with the reason (as en.ts's LINT_ALLOWLIST). */
export const SOURCES_LINT_ALLOWLIST: Partial<
  Record<SourcesMessageId, { rules: string[]; reason: string }>
> = {
  "sources.name.modis-13Q1-061": {
    rules: ["VT-08"],
    reason: "MODIS is the instrument's name; the row names the product as NASA's archive lists it.",
  },
  "sources.name.modis-10A1-061": {
    rules: ["VT-08"],
    reason:
      "MODIS is the instrument's name; the row names the product as the data centre lists it.",
  },
  "sources.name.gbif-occurrence-search": {
    rules: ["VT-08"],
    reason:
      "GBIF is the data source's own name, written as it writes it, like source.gbif in en.ts.",
  },
};

export function sformat(
  id: SourcesMessageId,
  values: Record<string, string | number> = {},
): string {
  return sc[id].text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

/** The datasets with a name here, in the order the overlay lists them; any other dataset follows in record order. */
export const DATASET_ORDER = [
  "modis-13Q1-061",
  "sentinel-2-l2a",
  "CHIRPS-3.0-monthly-final",
  "esa-worldcover-v200",
  "copernicus-dem-glo-30",
  "modis-10A1-061",
  "gbif-occurrence-search",
] as const;

/** What a dataset measured, or its name, by its dataset ID; a dataset with no name here keeps the record's ID. */
export function datasetTerm(kind: "measured" | "name", datasetId: string): string {
  const id = `sources.${kind}.${datasetId}`;
  if (id in sc) return sc[id as SourcesMessageId].text;
  return kind === "name" ? datasetId : sc["sources.measured.other"].text;
}
