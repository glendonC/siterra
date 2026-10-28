// Additional UI catalog strings for the rebuilt /prototype views and instruments (I18N-01).
// All strings pass copy-lint rules (no em dashes, no first person, no "you", no banned words).

export const protoCopy = {
  // Visual directions (top right optic selector)
  dir1Short: "1: SHD Obsidian",
  dir2Short: "2: Mireye Daylight",
  dir3Short: "3: Dune Volume",
  dir1Title: "Direction 1 · SHD Obsidian Survey Table",
  dir2Title: "Direction 2 · Mireye Architectural Daylight",
  dir3Title: "Direction 3 · Dune Nocturnal Volume",

  // 90s Judge Cut
  cutPlay: "Play 90s Cut",
  cutStop: "Stop Cut",
  cutClockPrefix: "Judge Cut",

  // Stage 1: Globe & Scope
  globeTitle: "Global Rangeland Engine",
  globeSubtitle: "Rangeland Biomes · Potential Extent (Rangelands Atlas Method)",
  globeCaseBadge: "Active Case · High Atlas Rangelands",
  globeCasePlace: "Aït Bouguemez Valley, Morocco",
  globeCaseCoord: "31.64° N · 6.37° W · 417.0 km²",
  globeDiveBtn: "Dive To Valley",
  globeReturnBtn: "Globe View",
  scopePastureTitle: "Pasture Boundaries",
  scopeStrataTitle: "Comparison Strata (Copernicus DEM 30 m)",
  scopeStratumLow: "Lower Band · Below 2,317 m (139.1 km²)",
  scopeStratumMid: "Middle Band · 2,317 to 2,815 m (139.1 km²)",
  scopeStratumHigh: "Upper Band · Above 2,815 m (139.1 km²)",
  scopeAspectNote: "5 Aspect Classes: North, East, South, West, Level (< 5 deg)",

  // Stage 2: Evidence & Layer Stack
  stackHeader: "Exploded Layer Stack",
  stackSub: "5 Measured Layers Cut To Catchment Outline",
  stackHoldBtn: "Hold Stack Open",
  stackReleaseBtn: "Resume Descent",
  sourceHeading: "Retrieved Case Sources (12 of 14 Opened)",
  meaningHeading: "MEANING",
  sourceFieldHeading: "SOURCE",

  // Stage 3: Hypothesis Testing ("Predictions Locked", "The Record Answers", "Branch Graph")
  hypModeLocked: "Predictions Locked",
  hypModeRecord: "The Record Answers",
  hypModeGraph: "Branch Graph",
  lockedBanner: "Revision 1 · Committed Before Any Bundle Value Is Read (DF-07)",
  lockedInstruction:
    "Each explanation states its testable prediction on the land before host code reads the 26-season record.",
  scoreTriggerBtn: "Run 26-Season Record",
  recordTitle: "The Record Answers · 2000 to 2025",
  recordSubtitle: "MODIS MOD13Q1 250 m (March to June) & CHIRPS v3.0 Rainfall (Sep to May)",
  recordRulersTitle: "Elevation-Band Stem Rulers (26 Springs)",
  recordDryPulseTag: "Dry-Year Rainfall Pulse (CHIRPS 5 km Cells)",
  recordNormalRainTag: "Rainfall Within Normal Range",
  recordVerdictTitle: "Expected Decline: Contradicted At Band Scale",
  recordVerdictClaim:
    "Unadjusted spring greenness rose in all 3 elevation bands (+0.01 NDVI per decade catchment-wide; +0.02 on level ground).",
  recordVerdictGrey:
    "Greener is not better forage. Shrubs, unpalatable species or valley-floor orchards can raise greenness.",
  recordMeaning:
    "Greenness barely tracks Sep to May rainfall (R squared 0.04; precondition not met). The 4 driest years (2001, 2016, 2023, 2024) did not brown the bands.",
  branchMergeTitle: "BranchMerge (merge@1 · DF-08 & DF-09)",
  branchMergeSub: "2 Contradicted · 3 Open To Field Verification",
  branchOpenTarget: "Feeds Stage 5 Field Verification Plan",

  // Trace Drill-Down (CMP-16)
  traceTitle: "Technical Trace & Validator Log (CMP-16)",
  traceSub: "Every Model Call And Deterministic Check Recorded At Revision 7",
  traceClose: "Close Trace",

  // Split Comparison View
  splitTitle: "Split Stratum & Record Comparison",
  splitMode1: "Spring NDVI Trend vs CHIRPS Rain",
  splitMode2: "Early Record (2000) vs Recent (2025)",
  splitMode3: "Valley Floor (< 2,317 m) vs Upper (> 2,815 m)",
  splitLeftLabel1: "MODIS 26-Spring NDVI Slope (+0.01/dec Upward)",
  splitRightLabel1: "CHIRPS 2022/23 Dry Winter (349 mm vs 562 mm Mean)",
  splitLeftLabel2: "Early Baseline (2000 to 2004) · 1985 Landsat Not Loaded",
  splitRightLabel2: "Recent Window (2021 to 2025) · WorldCover 2021 Hatch",
  splitLeftLabel3: "Lower Band & Level Ground (+0.02/dec · Orchards Included)",
  splitRightLabel3: "Upper Band (> 2,815 m · +0.01/dec · Winter Snow Masked)",

  // Stage 4: Interventions & Precedents
  precedentDrawerTitle: "Precedent Side View · Context, Not Evidence (ADR-0037)",
  precedentStillCaption: "Sentinel-2 True-Colour Still · Ait Bouguemez Forest Agdal Zone",
  precedentCloseBtn: "Close Precedent",
  openRingTag: "Open Ring · Pastures Not Mapped",
  footprintTag: "Dashed Survey Footprint · Proposed Only",

  // Stage 5: Field Verification & Viewpoint 50m
  viewpointHudTitle: "Ground-Proximate Viewpoint · 50 m Above Tabant (1,855 m)",
  viewpointCompassLabel: "Horizon Bearing Ring · Looking ENE Up-Valley (68 deg)",
  viewpointProposedTag: "Proposed Site. Access Not Confirmed.",
  wristMapLabel: "Catchment Frustum Locator",
  unmappedReqTitle: "Requirements Without Mapped Coordinates (Open Rings)",

  // Overview Scale & Instruments
  scaleBarLabel: "0 to 5 to 10 km · Planar Survey Scale",
  reliefBadge: "Relief x2 · Copernicus GLO-30",
  northBadge: "N 000°",

  // Top Bar & View Bar Labels
  stage01: "01 Scope & Baseline",
  stage02: "02 Evidence",
  stage03: "03 Hypothesis Testing",
  stage04: "04 Interventions & Precedents",
  stage05: "05 Field Verification",
  viewOverview: "Overview",
  viewOblique: "Oblique",
  viewStack: "Layer Stack",
  viewRecord: "Time Record",
  viewSplit: "Split View",
  viewViewpoint: "Viewpoint 50m",
  opticLabel: "OPTIC",
  viewLabel: "CAMERA",
  packHeaderBadge: "Region Pack: High Atlas Rangelands",

  // Stage 1 Baseline & Pixel Summary
  baseline2025Badge: "Spring 2025: 23rd of 26 · +0.0162 NDVI Above Median",
  baseline2025Sub: "MODIS 250 m March to June · 2025 NDVI 0.2200 vs 0.2039 Median",
  pixelTrendHeader: "250 m Per-Pixel Trend (8,094 MODIS Cells · 2000 to 2025)",
  pixelTrendStats: "Median Theil-Sen +0.00757 NDVI/dec · 91.73% Positive Slopes",
  pixelTrendFdr: "BH-FDR (q = 0.05): 24.70% Increasing · 0.09% Decreasing",
  pixelTrendClusters: "Spatial Clusters (>= 4 Pixels): 33 Upward · 0 Downward",
  pastureCovBadge: "Pasture Boundaries: Coverage Required",
  globeCoordBadge: "31.64° N · 6.37° W · 417.0 km² · 3 Elevation Bands",
  globeBiomesStat: "Global Rangelands · 54% Terrestrial Surface · 1 Loaded Pack",
  queryPromptLabel: "SURVEY TARGET OR REGION QUERY",

  // Stage 2 Exploded Stack
  stackCardTitle: "5-Layer Evidence Stack · Catchment Cut",
  stackCardMeaning:
    "Precomputed rasters align on the 417.0 km² hydrological boundary before hypothesis scoring runs.",
  stackCardSource: "MODIS MOD13Q1 & MOD10A1 · CHIRPS v3.0 · Sentinel-2 L2A · Copernicus GLO-30",
  activityCollapsedPrefix: "6 Steps · 2 Contradicted · Code + Muse Spark",

  // Stage 3 Sub-modes & Rulers
  subLocked: "1 · Predictions Locked",
  subRecord: "2 · The Record Answers",
  subGraph: "3 · Branch Graph & Scoring",
  subTrace: "4 · Trace (CMP-16)",
  rulerPanelTitle: "3 Elevation-Band Stem Rulers (2000 to 2025)",
  rulerPanelSub: "MODIS 250 m Spring NDVI · R² = 0.04 (precondition_not_met)",
  scanFrontLabel: "Constant-Speed Outlet-To-Ridge Scan Front · 250 m Trend Cells",
  seasonPlayBtn: "Play 26 Seasons",
  seasonPauseBtn: "Pause",
  seasonDryYearAlert: "Dry Winter Pulse (CHIRPS < 425 mm): Band Greenness Still Held",
  seasonNormalYearNote: "Spring Greenness vs Wet-Season Rainfall (Sep to May)",
  lockedCardTitle: "5 Explanations Locked At Revision 1",
  lockedCardMeaning:
    "Each branch commits its directional test before host code reads the 26-season record.",
  lockedCardSource: "Pre-Registration Event rev-6 · Schema SA-10 & DF-07",
  graphCardTitle: "Scored Explanation Graph · BranchMerge",
  graphCardMeaning:
    "Satellite greenness rules out catchment-wide decline, but cannot separate forage from shrubs or orchards.",
  graphCardSource: "Deterministic Scorer merge@1 · Feeds Minimum Field Plan (DF-09)",

  // Stage 4 Interventions & Precedents
  stage4CardTitle: "Candidate Responses & Valley Precedents",
  stage4CardMeaning:
    "Precedents provide local institutional context by analogy, never proof of current pasture state.",
  stage4CardSource: "Auclair et al. 2011 (SCI-20) · Hammi et al. 2010 (SCI-21) · ADR-0037",
  precedentToggleBtn: "Inspect Precedent Still",
  precedentCompareLeft: "1964 Aerial Survey · Regulated Forest Agdal",
  precedentCompareRight: "2002 SPOT Multispectral · Canopy Maintained",
  precedentCompareDiff: "Adjacent Unmanaged Slopes Thinned Over 38-Year Window",
  agdalOpenRingLabel: "Seasonal Rest (Agdal): Pastures Not Mapped",
  dryRuleFootprintLabel: "Dry-Year Grazing Rule · Middle Band Stratum",

  // Stage 5 Field Verification & Brief
  stage5CardTitle: "Minimum Separating Field Plan (DF-09)",
  stage5CardMeaning:
    "4 ground transects and 1 herder-agreed census separate the 3 explanations satellite data cannot resolve.",
  stage5CardSource: "BranchMerge.fieldPlan · Tabant 50 m Viewpoint Bearing 68 deg ENE",
  compassN: "N 000°",
  compassNE: "NE 045°",
  compassENE: "ENE 068° · UP-VALLEY AXIS",
  compassE: "E 090°",
  compassSE: "SE 135°",
  briefOpenEnBtn: "Open Assembly Brief (EN)",
  briefOpenFrBtn: "Note Assemblée (FR)",
  briefPrintHint: "One-Page Printable Village Dossier · Prepared. Nothing Sent.",

  // Additional HUD instrument labels (I18N-01 compliant)
  cardSourceTag: "SOURCE",
  cardMeaningTag: "MEANING",
  cardRevTag: "REV 7 · DETERMINISTIC",
  cardTargetTag: "TERRAIN TARGET · 31.64° N 6.37° W",
  globeLatGrid: "31.64° N · HIGH ATLAS CORRIDOR",
  globeLonGrid: "06.37° W · AZILAL PROVINCE",
  globeActiveDot: "LOADED PACK · AIT BOUGUEMEZ",
  globeUnloadedDot: "PACK NOT LOADED",
  strataLegendLow: "Low < 2,317 m (+0.0134/dec)",
  strataLegendMid: "Mid 2,317 to 2,815 m (+0.0072/dec)",
  strataLegendHigh: "High > 2,815 m (+0.0070/dec)",
  strataLegendLevel: "Level < 5 deg (+0.0222/dec)",
  strataLegendCatchment: "Catchment (+0.0091/dec)",
  branchColBranch: "EXPLANATION",
  branchColLocked: "LOCKED PREDICTION (REV 1)",
  branchColVerdict: "VERDICT",
  branchColField: "SEPARATING CHECK",
  traceColActor: "ACTOR / MODEL",
  traceColRule: "VALIDATOR CHECK",
  traceColStatus: "STATUS",
  splitDragHint: "SPLIT CURTAIN",
  viewpointAltTag: "ALT 1,855 m (+50 m AGL)",
  viewpointFovTag: "FOV 55° · RELIEF x2.2",
  precedentRoleBadge: "Context, Not Evidence (ADR-0037)",
  openRingBadge: "Open Ring · Pastures Not Mapped",
  yearPrefix: "SPRING",
  rainUnit: "mm",
  ndviLabel: "NDVI",
  slopeLabel: "/dec",
  rSqLabel: "R²",
  pixelsLabel: "px",
  codeBadge: "Code · Deterministic",
  museBadge: "Meta · muse-spark-1.3",
} as const;
