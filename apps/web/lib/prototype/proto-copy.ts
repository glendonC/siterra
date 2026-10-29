// Hero 1.3 valley sequence strings for /prototype (docs/reference/microcopy.md sections 1 and 1a,
// docs/reference/components.md, docs/reference/scenes.md).

export const protoCopy = {
  // Top-centre mode line (mono 11/16, opens the scope popover)
  modeLine: "High Atlas Rangelands · Real data, field unverified",

  // Ground labels on the land (IBM Plex Sans Medium on a paper halo, never inside a box)
  valleyName: "Aït Bouguemez valley",
  valleyRegion: "High Atlas Mountains, Morocco",
  outletLabel: "Outlet: the whole catchment drains here",
  studyAreaLabel: "Valley catchment: 417.0 km²",
  studyAreaLimit: "Not a pasture, agdal, or management boundary.",
  bandLowerLabel: "Lower band: below 2,317 m",
  bandMiddleLabel: "Middle band: 2,317 to 2,815 m",
  bandUpperLabel: "Upper band: 2,815 m and above",
  excludedFloorLabel: "Mapped cropland and buildings: not sampled",
  gapHatchLabel: "No usable April view: left out",

  // Beat 1: Arrival
  question: "Is grazing changing the shared pastures of the Aït Bouguemez valley?",
  keyStart: "Start investigation",
  keyReadFlat: "Read flat",

  // Beat 2: Work (plan card + catchment-cut sheets lifting and descending onto the valley)
  workStatus: "Planning: 4 steps to answer this question",
  workStep1Num: "1",
  workStep1: "Rainfall: 84 months, 2019 to 2025",
  workStep2Num: "2",
  workStep2: "Vegetation: loading 26 springs (2000 to 2025) & 56 months",
  workStep3Num: "3",
  workStep3: "National reports: 5",
  workStep4Num: "4",
  workStep4: "Explanations: 5",
  sheet01N: "01",
  sheet01Label: "Was the season unusually dry?",
  sheet02N: "02",
  sheet02Label: "Did greenness change?",
  sheet03N: "03",
  sheet03Label: "Where did 10 m departures occur?",
  keyLockPredictions: "Lock predictions",

  // Beat 3: Predictions Locked / Evidence (stems on the valley + pre-registration card)
  lockedStatus: "Revision 1 · Predictions locked before data",
  lockedClaim:
    "A published study gives coordinates for villages in this valley. The stem marks one, Aït Ouchi, not a pasture boundary.",
  lockedLimit:
    "Five explanations commit their testable predictions at Revision 1 before host code reads the 26-season record.",
  lockedSource: "Aakairi et al. 2026, People and Nature (SCI-04) · Pre-registration rev 1",
  lockedMeaning: "Meaning: a location and locked test rules, not a finding about grazing.",
  lockedOpenReports: "5 national reports for Morocco",
  lockedOpenBranches:
    "5 explanations locked before scoring (Expected decline, Low rainfall, Late snow, Orchards, Grazing)",
  stemOuchi: "Aït Ouchi",
  stemTabant: "Tabant",
  stemDecline: "Expected decline · Rev 1",
  stemRain: "Low rainfall · Rev 1",
  stemSnow: "Late snow · Rev 1",
  keyTestRecord: "Test the 26-year record",

  // Beat 4: The Record Answers / Dry-year challenge (season stems beside the catchment + 250 m trend)
  challengeBranch: "Could drought explain this instead?",
  challengeStatus: "Simulated answer.",
  challengeClaim: "Rainfall fell from the upper third, 650 mm, to the lower third, 349 mm.",
  challengeLimit:
    "Across 26 springs (2000 to 2025), greenness rose in all 3 elevation bands (+0.01 NDVI per decade; R squared 0.04 with rain).",
  challengeSource: "CHIRPS v3.0, 1991 to 2020 · MODIS MOD13Q1 250 m, 2000 to 2025",
  challengeMeaning: "Meaning: a dry season. Not evidence about grazing.",
  stemsBand: "Near normal: 509 to 603 mm",
  stemsMean: "Mean 562 mm",
  stemsCaption: "Wet seasons 1991/92 to 2022/23 · MODIS springs 2000 to 2025 (+0.0091 NDVI/dec)",
  stemsPrevious: "2021/22: 650 mm",
  stemsOnShow: "2022/23: 349 mm",
  keyShowVerdict: "Show the verdict",

  // Beat 5: Verdict (48px two-tone Sky Statement in the paper sky + figure card on the right)
  skyStatus: "Simulated answer.",
  skyClaim: "Grazing: cannot be assessed with current data.",
  skyLimit:
    "April NDVI in 2022 and 2023 stayed within about 0.01 of other Aprils, and 26-spring greenness rose in all three bands.",
  verdictFigureLabel: "Wet season 2022/23",
  verdictFigureValue: "349",
  verdictFigureUnit: "mm",
  verdictFigureContext: "Lower third of 1991 to 2020 · 26-spring trend +0.0091 NDVI/decade",
  verdictSource: "CHIRPS v3.0, 33 cells · MODIS MOD13Q1 250 m (8,094 pixels)",
  verdictMethod: "season_summary 1.0.0 · restrend_long_record 1.0.0",
  verdictMeaning:
    "Meaning: a dry season, and rising 26-year band greenness. Neither separates palatable grass from thorny shrubs.",
  verdictFlags: "April views: snow suspected; cloud screening reduced.",
  verdictFlagsNote: "Cloud screening used the scene classification only.",
  verdictWhyChip: "Why",
  verdictWhyText: "year-to-year rainfall can hide a real decline in the vegetation record (SCI-29)",
  verdictWhyNote:
    "Wessels et al. 2012 (SCI-29): in simulations, a vegetation-index slope only became statistically detectable once 30 to 40 per cent of vegetation had been degraded.",
  keyShowPlan: "Show the field plan",

  // Beat 6: Field Plan & Assembly Brief (3 elevation bands on the relief + right-hand card, no modal)
  planClaim: "Proposed: measure plant cover on the ground in each of the three elevation bands.",
  planLimit: "They are not pasture units or boundaries.",
  planLimitNote:
    "Each band holds a third of the study area (139.1 km²). Forest agdal study in this valley (Auclair et al. 2011, SCI-20) is context by analogy, not pasture evidence.",
  planMeasurePrefix: "To measure:",
  planMeasureBody:
    "animal numbers and timing, the current access calendar, field vegetation surveys",
  planPrecedentOpen:
    "Seasonal rest (agdal): forest canopy kept 1964 to 2002 (SCI-20, context only)",
  planProposalOnly: "Proposal only. Nothing has been arranged with the villages.",
  keyReadBrief: "Read assembly brief",
  keyPrintPlan: "Print the field plan",
  keyRestart: "Restart sequence",

  // Assembly Brief inside the 392px right-hand card (EN / FR toggle in place)
  briefStatusEn: "Assembly brief · Field unverified · Prepared, nothing sent",
  briefStatusFr: "Note pour l'assemblée · Terrain non vérifié · Rien n'a été envoyé",
  briefChipEn: "EN",
  briefChipFr: "FR",
  briefClaimEn:
    "Spring greenness (2000 to 2025) rose +0.01 NDVI per decade across all three elevation bands.",
  briefLimitEn:
    "Satellite greenness cannot separate palatable pasture grass from thorny shrubs or valley-floor orchards.",
  briefClaimFr:
    "Verdure de printemps (2000 à 2025) en hausse de +0,01 NDVI par décennie dans les trois étages.",
  briefLimitFr:
    "Le satellite ne sépare pas les espèces appétentes des buissons épineux ou des vergers.",
  briefLine1En: "Wet season 2022/23: 349 mm after 650 mm in 2021/22 (1991 to 2020 average 562 mm).",
  briefLine2En:
    "Field checks: fixed plots in low (< 2,317 m), middle (2,317 to 2,815 m) and high (> 2,815 m) bands, plus herd counts with herders.",
  briefLine3En:
    "Decision: the village assembly sets agdal opening dates. This brief holds measurements only.",
  briefLine1Fr: "Pluie d'hiver 2022/23 : 349 mm après 650 mm en 2021/22 (moyenne 562 mm).",
  briefLine2Fr:
    "Terrain : placettes fixes en bas (< 2 317 m), au milieu et en haut (> 2 815 m), et comptage avec les éleveurs.",
  briefLine3Fr: "Décision : l'assemblée du village fixe les dates d'ouverture de l'agdal.",
  briefSource:
    "MODIS MOD13Q1 (2000 to 2025) · Sentinel-2 L2A (2019 to 2025) · CHIRPS v3.0 · SCI-20",

  // Key slot (bottom-left at left: 40px, bottom: 92px)
  keySlotNdviTitle: "NDVI departure, Apr 2023, compared with other Aprils",
  keySlotNdviLow: "−0.10",
  keySlotNdviHigh: "+0.10",
  keySlotNdviNote: "No cropland mask is applied: valley-floor fields and orchards are included.",
  keySlotRainTitle: "Rain per cell, 2022/23",
  keySlotRainC1: "under 400",
  keySlotRainC2: "400 to 550",
  keySlotRainC3: "550 mm and over",
  keySlotRainNote: "Display classes only, not the 1991 to 2020 thirds.",

  // Citation chip 1
  cite1Chip: "1",
  cite1Note:
    "MODIS MOD13Q1 250 m (2000 to 2025, 26 springs) & Sentinel-2 L2A 10 m (2019 to 2025, 56 of 84 months). Stored in restrend_long_record and ndvi_departure.",
  cite2Chip: "2",
  cite2Note:
    "CHIRPS v3.0 rainfall (1991 to 2025, 33 cells intersecting the catchment), Climate Hazards Center, UC Santa Barbara.",
} as const;
