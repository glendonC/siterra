// UI catalog strings and multi-case definitions for /prototype (I18N-01).
// All strings use plain human English with zero em dashes and zero cryptic remote-sensing codes in the primary UI.

export interface CaseSpec {
  id: "high-atlas" | "sierra-fire" | "draa-basin" | "custom";
  shortName: string;
  regionLabel: string;
  coordLabel: string;
  areaLabel: string;
  center: [number, number];
  questionHeadline: string;
  questionSubhead: string;
  verdictHeadline: string;
  verdictSubhead: string;
  heroStatNum: string;
  heroStatLabel: string;
  windowLabel: string;
  sensorsLabel: string;
  zones: readonly {
    id: string;
    name: string;
    elev: string;
    delta: string;
    summary: string;
    atOffset: [number, number];
  }[];
  explanations: readonly {
    id: "grazing" | "rainfall" | "farms" | "snow";
    label: string;
    verdict: "contradicted" | "consistent" | "cannot";
    verdictBadge: string;
    claim: string;
    evidence: string;
    limitation: string;
    check: string;
  }[];
  fieldStops: readonly {
    id: string;
    label: string;
    short: string;
    distanceLabel: string;
    elevationDelta: string;
    what: string;
    separates: string;
    statusBadge: string;
  }[];
}

export const MULTI_CASES: readonly CaseSpec[] = [
  {
    id: "high-atlas",
    shortName: "High Atlas Rangelands",
    regionLabel: "Aït Bouguemez Valley, Morocco",
    coordLabel: "31.66° N · 6.43° W · 417.0 km²",
    areaLabel: "417.0 km² Mountain Catchment",
    center: [-6.41, 31.65],
    questionHeadline: "Are the shared pastures of Aït Bouguemez turning bare?",
    questionSubhead:
      "Comparing grazing pressure, multi-year droughts, snowmelt, and valley-floor farming across 26 years of spring satellite records (2000 to 2025).",
    verdictHeadline: "26-year satellite record rules out valley-wide bare soil.",
    verdictSubhead:
      "Every elevation zone grew greener from 2000 to 2025 (+9% valley-wide), even across four severe droughts. Ground walks are needed to separate nutritious grass from thorny shrubs.",
    heroStatNum: "92%",
    heroStatLabel: "of valley squares grew greener from 2000 to 2025",
    windowLabel: "26 Springs (2000 to 2025) + 84 Monthly Views",
    sensorsLabel: "Terra Satellite 250 m · Sentinel-2 10 m · CHIRPS Rain",
    zones: [
      {
        id: "zone-low",
        name: "Valley Floor (< 2,317 m)",
        elev: "1,850 to 2,317 m · 139.1 km²",
        delta: "+13.4% Greener",
        summary:
          "Fastest greening zone (+22% on flat ground), where irrigated apple orchards and walnut groves sit beside lower village pastures.",
        atOffset: [-0.045, -0.008],
      },
      {
        id: "zone-mid",
        name: "Middle Slopes (2,317 to 2,815 m)",
        elev: "2,317 to 2,815 m · 139.1 km²",
        delta: "+7.2% Greener",
        summary:
          "Shared spring grazing slopes held steady through the 2001, 2016, 2023, and 2024 dry winters, though 2022/23 dipped below the 7-year monthly median.",
        atOffset: [0.0, 0.004],
      },
      {
        id: "zone-high",
        name: "High Summer Pastures (> 2,815 m)",
        elev: "2,815 to 3,690 m · 139.1 km²",
        delta: "+7.0% Greener",
        summary:
          "High communal summer agdal pastures gained spring cover over 26 years, while winter months remain masked by snow and cloud.",
        atOffset: [0.052, 0.018],
      },
    ],
    explanations: [
      {
        id: "grazing",
        label: "Grazing Pressure",
        verdict: "cannot",
        verdictBadge: "Needs Ground Walk",
        claim: "Heavy livestock grazing is stripping plant cover across the shared mountain bands.",
        evidence:
          "26-year spring greenery rose in all 3 elevation zones (+7% to +13%), ruling out valley-wide bare soil.",
        limitation:
          "Satellites see green colour, not plant species. Unpalatable thorny cushion shrubs look green from space.",
        check: "Walk 165 m fixed plots to count nutritious grass vs. thorny shrubs",
      },
      {
        id: "rainfall",
        label: "Rainfall & Droughts",
        verdict: "contradicted",
        verdictBadge: "Ruled Out at 26-Yr Scale",
        claim: "Multi-year winter droughts caused a long-term collapse in spring pasture cover.",
        evidence:
          "Wet season 2021/22 before the May 2022 dip was above average (650 mm vs. 562 mm), and the 4 driest winters did not brown the bands.",
        limitation:
          "Winter 2022/23 was dry at 349 mm, matching the short-term 8-month dip in 2022/23.",
        check: "Compare paired soil-moisture plots across north and south slopes",
      },
      {
        id: "farms",
        label: "Valley-Floor Farms",
        verdict: "cannot",
        verdictBadge: "Needs 2nd Crop Map",
        claim:
          "Expanding irrigated apple orchards on the flat valley floor drive the upward greening trend.",
        evidence:
          "Flat ground (< 5 deg) greened fastest at +22% per decade, where village fields and orchards are concentrated.",
        limitation:
          "Only one land-cover map (2021) is loaded; a second map from a later year is needed to measure expansion.",
        check: "Remap valley-floor orchard borders against the 2021 baseline",
      },
      {
        id: "snow",
        label: "Snowmelt Timing",
        verdict: "cannot",
        verdictBadge: "Winter Cloud Gap",
        claim: "Earlier high-ridge snowmelt shifts the spring green-up window above 2,815 m.",
        evidence:
          "300 months of snow-cover records show strong seasonal snowpack above 2,815 m feeding spring streams.",
        limitation:
          "Clouds and snow blocked all 28 winter Sentinel-2 monthly views in the high band.",
        check: "Spring snowline walk along the 2,980 m ridge",
      },
    ],
    fieldStops: [
      {
        id: "low",
        label: "Stop 1 · Low Pasture Quadrat",
        short: "Below 2,317 m · 165 m walk",
        distanceLabel: "165 m walk",
        elevationDelta: "+14 m / −6 m",
        what: "Count palatable forage grass versus thorny cushion shrubs on fixed spring plots.",
        separates: "Separates Grazing Pressure from Thorny Shrub Growth",
        statusBadge: "Suggested Stop · Access Unconfirmed",
      },
      {
        id: "middle",
        label: "Stop 2 · Middle Slope Exclosure",
        short: "2,317 to 2,815 m · 1.4 km walk",
        distanceLabel: "1.4 km walk",
        elevationDelta: "+620 m / −18 m",
        what: "Sample paired grazed and rested plots in the same week as the lower valley floor.",
        separates: "Separates Dry Winter Rainfall from Grazing Pressure",
        statusBadge: "Suggested Stop · Access Unconfirmed",
      },
      {
        id: "high",
        label: "Stop 3 · High Snowline Transect",
        short: "Above 2,815 m · 3.8 km walk",
        distanceLabel: "3.8 km walk",
        elevationDelta: "+1,125 m / −40 m",
        what: "Inspect spring snowmelt margin and summer agdal turf above 2,815 m.",
        separates: "Separates Late Snowmelt from High-Pasture Grazing",
        statusBadge: "Suggested Stop · Access Unconfirmed",
      },
      {
        id: "fields",
        label: "Stop 4 · Valley Floor Orchard Check",
        short: "Tabant floor · 410 m walk",
        distanceLabel: "410 m walk",
        elevationDelta: "+4 m / −2 m",
        what: "Map irrigated apple orchards and walnut groves against the 2021 cropland boundary.",
        separates: "Separates Orchard Expansion from Open Pasture Trend",
        statusBadge: "Suggested Stop · Near Village Road",
      },
      {
        id: "livestock",
        label: "Stop 5 · Herder Census & Agdal Map",
        short: "Village assembly · Open ring",
        distanceLabel: "Village council",
        elevationDelta: "Location unmapped",
        what: "Record herd numbers and traditional agdal opening dates with herder agreement.",
        separates: "Local Decision Required · Not Mapped from Space",
        statusBadge: "Local Decision Required",
      },
    ],
  },
  {
    id: "sierra-fire",
    shortName: "Sierra Post-Fire Watershed",
    regionLabel: "San Joaquin & Creek Basin, California",
    coordLabel: "37.19° N · 119.26° W · 612.4 km²",
    areaLabel: "612.4 km² Burned Headwaters",
    center: [-119.26, 37.19],
    questionHeadline: "Is post-fire forest canopy recovering or turning into flammable brush?",
    questionSubhead:
      "Tracking 5 years of post-fire recovery across conifer ridges, canyon slopes, and snowmelt streams using 10 m satellite imagery and snowpack records.",
    verdictHeadline: "Rapid greening on mid-slopes is shrub flush, not conifer tree recovery.",
    verdictSubhead:
      "Satellite greenness rebounded +18% since the fire, but canopy height and dry-season moisture show dense ceanothus brush replacing mature timber on steep south slopes.",
    heroStatNum: "64%",
    heroStatLabel: "of high-severity burn zones regrew as dense shrub cover",
    windowLabel: "2018 to 2025 Post-Fire Recovery Series",
    sensorsLabel: "Sentinel-2 10 m · Landsat Thermal · Basin Snowpack",
    zones: [
      {
        id: "zone-low",
        name: "Lower Canyon & Reservoir (< 1,600 m)",
        elev: "980 to 1,600 m · 198.0 km²",
        delta: "+14.8% Regrowth",
        summary:
          "Riparian corridors and oak woodlands recovered rapidly after the 2023 atmospheric river winter, though sediment delivery into the reservoir remains elevated.",
        atOffset: [-0.042, -0.009],
      },
      {
        id: "zone-mid",
        name: "Mid-Elevation Mixed Conifer (1,600 to 2,300 m)",
        elev: "1,600 to 2,300 m · 234.4 km²",
        delta: "+18.2% Shrub Flush",
        summary:
          "High-severity burn patches show strong spring greenness driven by fire-adapted shrubs, masking low natural pine seedling survival beyond 150 m from live seed trees.",
        atOffset: [0.002, 0.005],
      },
      {
        id: "zone-high",
        name: "Subalpine Snowpack Zone (> 2,300 m)",
        elev: "2,300 to 3,180 m · 180.0 km²",
        delta: "+6.4% Recovery",
        summary:
          "Loss of tree shade on burned upper ridges accelerated May snowmelt runoff by 16 days compared with unburned reference basins.",
        atOffset: [0.048, 0.016],
      },
    ],
    explanations: [
      {
        id: "grazing",
        label: "Shrub vs. Conifer Regrowth",
        verdict: "cannot",
        verdictBadge: "Needs Seedling Walk",
        claim: "Strong satellite greening indicates natural pine and fir forest recovery.",
        evidence:
          "Spring greenness rose +18.2% across mid-elevation burn scars between 2021 and 2025.",
        limitation:
          "10 m optical greenness cannot distinguish 1 m tall flammable brush from young conifer seedlings.",
        check: "Walk 200 m burn-scar transects to count conifer seedlings per hectare",
      },
      {
        id: "rainfall",
        label: "2023 Wet Winter Pulse",
        verdict: "consistent",
        verdictBadge: "Matches Record",
        claim: "Record 2023 snowpack and spring moisture drove the catchment-wide greenness jump.",
        evidence:
          "Basin precipitation reached 178% of normal in 2022/23, matching the sharpest one-year greenness rise.",
        limitation: "Wet-year herbaceous flush dries out by late August, raising fine fuel loads.",
        check: "Measure late-summer live fuel moisture on south-facing slopes",
      },
      {
        id: "farms",
        label: "Hillslope Erosion & Sediment",
        verdict: "cannot",
        verdictBadge: "Needs Stream Check",
        claim:
          "Steep ash-covered gullies continue to shed coarse sediment into downstream reservoirs.",
        evidence:
          "Bare-soil fraction dropped from 58% to 19%, but steep (> 28 deg) inner gorges remain exposed.",
        limitation:
          "Canopy cover over narrow stream channels hides bank incision from vertical satellites.",
        check: "Inspect 3 tributary check-dams and turbidity gauges after first autumn rain",
      },
      {
        id: "snow",
        label: "Early Snowmelt Timing",
        verdict: "consistent",
        verdictBadge: "Matches Record",
        claim: "Blackened trunks and lost canopy shade speed up spring snowpack melt by two weeks.",
        evidence:
          "Snow disappearance above 2,300 m shifted 16 days earlier than paired unburned ridges.",
        limitation: "SNOTEL pillow stations sample flat clearings, not steep burned aspects.",
        check: "Check snow-depth markers across burned vs. unburned north slopes",
      },
    ],
    fieldStops: [
      {
        id: "low",
        label: "Stop 1 · Tributary Sediment Trap",
        short: "Below 1,600 m · 220 m walk",
        distanceLabel: "220 m walk",
        elevationDelta: "+22 m / −8 m",
        what: "Measure post-storm sediment depth and willow bank recovery at the canyon mouth.",
        separates: "Separates Surface Re-Greening from Channel Erosion",
        statusBadge: "Suggested Stop · Forest Road Access",
      },
      {
        id: "middle",
        label: "Stop 2 · Conifer Seedling Transect",
        short: "1,600 to 2,300 m · 1.1 km walk",
        distanceLabel: "1.1 km walk",
        elevationDelta: "+340 m / −15 m",
        what: "Count surviving pine seedlings under ceanothus shrub canopy 200 m from seed trees.",
        separates: "Separates Flammable Brush Flush from Timber Recovery",
        statusBadge: "Suggested Stop · Access Unconfirmed",
      },
      {
        id: "high",
        label: "Stop 3 · Burned Ridge Snow Course",
        short: "Above 2,300 m · 2.6 km walk",
        distanceLabel: "2.6 km walk",
        elevationDelta: "+780 m / −30 m",
        what: "Compare spring snow water equivalent under charred snags versus intact forest.",
        separates: "Verifies 16-Day Earlier Snowmelt Shift",
        statusBadge: "Suggested Stop · Backcountry Trail",
      },
      {
        id: "fields",
        label: "Stop 4 · Fuel Break & Road Margin",
        short: "Mid-ridge · 380 m walk",
        distanceLabel: "380 m walk",
        elevationDelta: "+12 m / −4 m",
        what: "Inspect shaded fuel break regrowth and dead-standing snag fall hazard.",
        separates: "Guides Replanting & Fuel Thinning Priority",
        statusBadge: "Suggested Stop · Ridge Access",
      },
      {
        id: "livestock",
        label: "Stop 5 · Watershed Council Review",
        short: "Multi-agency · Open ring",
        distanceLabel: "District office",
        elevationDelta: "Administrative",
        what: "Align replanting zones and cultural burn windows with tribal and forestry leads.",
        separates: "Local Governance Decision · Prepared Brief Only",
        statusBadge: "Local Decision Required",
      },
    ],
  },
  {
    id: "draa-basin",
    shortName: "Upper Draa Snow-Fed Basin",
    regionLabel: "Ouarzazate & Dadès Headwaters, Morocco",
    coordLabel: "30.93° N · 6.91° W · 528.0 km²",
    areaLabel: "528.0 km² Oasis & Mountain Basin",
    center: [-6.91, 30.93],
    questionHeadline: "Why are valley palm oases drying despite winter mountain storms?",
    questionSubhead:
      "Separating High Atlas snowpack decline, reservoir evaporation, and groundwater pumping across 25 years of basin satellite records.",
    verdictHeadline: "Shrinking mountain snowpack and new pumped farms squeeze traditional oases.",
    verdictSubhead:
      "High-elevation snow persistence fell 24% while irrigated field area outside traditional khettara channels expanded, reducing late-spring surface flow into downstream palm groves.",
    heroStatNum: "−24%",
    heroStatLabel: "drop in spring snowpack duration above 2,800 m",
    windowLabel: "2000 to 2025 Basin Water & Oasis Record",
    sensorsLabel: "MODIS Snow · Sentinel-2 Oasis NDVI · CHIRPS Rain",
    zones: [
      {
        id: "zone-low",
        name: "Oasis & Reservoir Floor (< 1,450 m)",
        elev: "1,120 to 1,450 m · 172.0 km²",
        delta: "−11.2% Oasis Canopy",
        summary:
          "Traditional gravity-fed date palm and alfalfa plots along the river channel show moisture stress during dry springs.",
        atOffset: [-0.044, -0.01],
      },
      {
        id: "zone-mid",
        name: "Piedmont Steppe & New Farms (1,450 to 2,200 m)",
        elev: "1,450 to 2,200 m · 196.0 km²",
        delta: "+19.5% Pumped Plots",
        summary:
          "Solar-pumped watermelon and orchard plots on the gravel plains expanded sharply over the past decade.",
        atOffset: [0.001, 0.003],
      },
      {
        id: "zone-high",
        name: "High Atlas Snowpack Headwaters (> 2,200 m)",
        elev: "2,200 to 3,850 m · 160.0 km²",
        delta: "−24.0% Snow Days",
        summary:
          "Warmer winter temperatures turned mid-winter snow events into rapid rain runoff rather than slow spring snowmelt.",
        atOffset: [0.05, 0.017],
      },
    ],
    explanations: [
      {
        id: "grazing",
        label: "Oasis Canopy Stress",
        verdict: "consistent",
        verdictBadge: "Matches Record",
        claim: "Downstream gravity-fed palm oases lose vigour when reservoir releases drop.",
        evidence:
          "Oasis greenness fell 11.2% across the 2019 to 2024 dry spell whenever reservoir storage dipped below 25%.",
        limitation:
          "Satellite greenness measures understory alfalfa and palms together; fallow understory looks browner than live palms.",
        check: "Walk oasis seguias (channels) to separate fallow plots from dead palms",
      },
      {
        id: "rainfall",
        label: "Winter Rain Variability",
        verdict: "consistent",
        verdictBadge: "Partial Driver",
        claim: "Recurring multi-year rainfall deficits reduce basin inflow.",
        evidence: "Four of the last six winters fell 30% below the 1991 to 2020 rainfall average.",
        limitation:
          "Rainfall alone does not explain why piedmont pumped plots expanded while river oases shrank.",
        check: "Compare upstream gauge inflow against reservoir release schedules",
      },
      {
        id: "farms",
        label: "Groundwater Pumped Farms",
        verdict: "consistent",
        verdictBadge: "Matches Record",
        claim:
          "New borehole-irrigated plots on the piedmont draw down the shared alluvial aquifer.",
        evidence:
          "Green irrigated polygons outside the historic oasis ribbon grew +19.5% since 2015.",
        limitation: "Satellites map irrigated crop area, not well depth or cubic meters pumped.",
        check: "Measure static water levels in 6 community monitoring wells",
      },
      {
        id: "snow",
        label: "Warm-Winter Snow Loss",
        verdict: "consistent",
        verdictBadge: "Matches Record",
        claim: "Faster snowmelt reduces natural spring buffer storage in the high mountains.",
        evidence:
          "Snow cover duration above 2,500 m shortened by 22 days compared with the 2000 to 2010 average.",
        limitation: "Sublimation versus melt runoff requires high-altitude weather station logs.",
        check: "Inspect high-elevation snowmelt gauges on the southern Mgoun flank",
      },
    ],
    fieldStops: [
      {
        id: "low",
        label: "Stop 1 · Oasis Seguia & Palm Check",
        short: "Oasis floor · 310 m walk",
        distanceLabel: "310 m walk",
        elevationDelta: "+3 m / −2 m",
        what: "Inspect traditional earthen canal flow and separate fallow alfalfa from stressed date palms.",
        separates: "Separates Temporary Fallowing from Permanent Palm Loss",
        statusBadge: "Suggested Stop · Oasis Track",
      },
      {
        id: "middle",
        label: "Stop 2 · Piedmont Well & Crop Walk",
        short: "1,450 to 2,200 m · 850 m walk",
        distanceLabel: "850 m walk",
        elevationDelta: "+45 m / −10 m",
        what: "Verify crop type and drip-irrigation status on newly greened piedmont parcels.",
        separates: "Quantifies Pumped Farm Expansion",
        statusBadge: "Suggested Stop · Access Unconfirmed",
      },
      {
        id: "high",
        label: "Stop 3 · Upper Dadès Snow Gauge",
        short: "Above 2,200 m · 3.2 km walk",
        distanceLabel: "3.2 km walk",
        elevationDelta: "+890 m / −35 m",
        what: "Check spring snowmelt line and spring discharge above the main valley intake.",
        separates: "Verifies Mountain Snowpack Buffer Loss",
        statusBadge: "Suggested Stop · Mountain Track",
      },
      {
        id: "fields",
        label: "Stop 4 · Khettara Gallery Intake",
        short: "Alluvial fan · 500 m walk",
        distanceLabel: "500 m walk",
        elevationDelta: "+18 m / −4 m",
        what: "Measure water-table depth at historic underground khettara mother-wells.",
        separates: "Links Aquifer Drawdown to Channel Flow",
        statusBadge: "Suggested Stop · Village Access",
      },
      {
        id: "livestock",
        label: "Stop 5 · Water Users Association Brief",
        short: "Oasis council · Open ring",
        distanceLabel: "Association hall",
        elevationDelta: "Administrative",
        what: "Share seasonal water-balance findings with seguia and khettara water associations.",
        separates: "Local Governance Decision · Prepared Brief Only",
        statusBadge: "Local Decision Required",
      },
    ],
  },
];

export const protoCopy = {
  // Visual directions (compact top-right theme pills)
  dir1Short: "Obsidian",
  dir2Short: "Daylight",
  dir3Short: "Dune",
  dir1Title: "SHD Obsidian Table",
  dir2Title: "Mireye Daylight Studio",
  dir3Title: "Dune Nocturnal Volume",

  // 90s Auto-Play Story Cut
  cutPlay: "Auto-Play 90s Story",
  cutStop: "Pause Story",
  cutClockPrefix: "Story Cut",

  // Top Context Header & Case Switcher
  caseKicker: "Annotated Land Model",
  casePlacePill: "Aït Bouguemez Valley, Morocco · 417 km²",
  realDataBadge: "Real Satellite Record",
  fieldUnverifiedBadge: "Ground Walk Needed",
  techProofBtn: "Technical Proof",
  techProofClose: "Close Technical Proof",
  explanationsBarLabel: "Test Explanation:",
  expAll: "All Layers",

  // Camera Lens Switcher
  lensGlobe: "Globe",
  lens3D: "3D Terrain",
  lensStack: "5-Layer Stack",
  lens2D: "2D Map",
  lensSplit: "Compare",
  lens50m: "Field View",

  // 5 Unified Stages (Bottom-Center Spine)
  stage01: "1. Arrival & Scope",
  stage02: "2. 5 Data Layers",
  stage03: "3. Competing Claims",
  stage04: "4. Community Options",
  stage05: "5. Field Plan & Brief",

  // Top-Left Editorial Stage Headlines & Subtitles
  stage1Kicker: "Stage 01 of 05 · Arrival & Study Boundary",
  stage1Headline: "Are the shared pastures of Aït Bouguemez turning bare?",
  stage1Subhead:
    "Analyzing 417 km² of High Atlas mountain pastures across 26 years of spring satellite records (2000 to 2025) and three elevation zones.",

  stage1GlobeKicker: "Stage 01 of 05 · Multi-Region Investigation Engine",
  stage1GlobeHeadline: "Switch between environmental cases or query any basin on Earth.",
  stage1GlobeSubhead:
    "Explore High Atlas Rangelands, California Post-Fire Recovery, or Upper Draa Snow-Fed Oases with the same 5-stage Annotated Land Model.",

  stage2Kicker: "Stage 02 of 05 · 5-Layer Spatial Decomposition",
  stage2Headline: "Five physical layers, separated across the valley.",
  stage2Subhead:
    "Elevation zones, 26-year plant greenery, rainfall cells, mountain snowmelt streams, and valley-floor apple orchards aligned before testing any claim.",

  stage3Kicker: "Stage 03 of 05 · Competing Explanations Tested",
  stage3Headline: "The 26-year record rules out valley-wide bare soil.",
  stage3Subhead:
    "Every elevation zone grew greener from 2000 to 2025 (+9% valley-wide), even across four severe droughts. Yet greener satellite pixels can hide thorny weeds.",

  stage4Kicker: "Stage 04 of 05 · Stewardship & Local Precedents",
  stage4Headline: "Where seasonal pasture rest and monitoring apply.",
  stage4Subhead:
    "Comparing traditional village pasture rest (agdal) and dry-year grazing reserves across the three mountain zones.",

  stage5Kicker: "Stage 05 of 05 · Ground Verification Route & Brief",
  stage5Headline: "Five short ground walks settle what satellites cannot see.",
  stage5Subhead:
    "Animated field route across the valley with distance and elevation callouts, plus a one-page Village Assembly Brief in English and French.",

  // Mireye 5-Layer Isometric Stack Labels
  isoBaseLabel: "Satellite Terrain Base · Hydrological Catchment Boundary",
  isoHint: "Click any sheet to solo its layer on the 3D terrain and inspect its evidence",
  isoShowAll: "Show All 5 Layers",

  layer01N: "01",
  layer01Title: "Valley Zones",
  layer01Sub: "Low floor, middle slopes, and high summer pastures",
  layer01Tag: "3 Elevation Zones · 30 m Terrain",
  layer01Detail:
    "Splits the catchment into Valley Floor (< 2,317 m), Middle Slopes (2,317 to 2,815 m), and High Summer Pastures (> 2,815 m) so flat farms are not mixed with high ridges.",

  layer02N: "02",
  layer02Title: "26-Year Greenery",
  layer02Sub: "Spring plant cover across 8,094 squares (2000 to 2025)",
  layer02Tag: "26 Springs · 250 m Grid",
  layer02Detail:
    "Measures spring plant cover every March to June from 2000 to 2025. 92% of the valley grew greener over the 26-year record.",

  layer03N: "03",
  layer03Title: "Rainfall & Droughts",
  layer03Sub: "34 years of wet-season rain across 33 valley cells",
  layer03Tag: "1991 to 2025 · 5 km Cells",
  layer03Detail:
    "Tracks wet-season rain from September to May across 33 grid cells, capturing the 4 driest winters (2001, 2016, 2023, and 2024).",

  layer04N: "04",
  layer04Title: "Snowmelt & Rivers",
  layer04Sub: "Assif n'Aït Bouguemez stream & high-peak winter snow",
  layer04Tag: "300 Months · Snow & Stream",
  layer04Detail:
    "Maps the central mountain stream network and winter snow cover above 2,815 m, where clouds and snow block winter optical satellites.",

  layer05N: "05",
  layer05Title: "Village Farms",
  layer05Sub: "Irrigated valley-floor orchards & settlement corridor",
  layer05Tag: "10 m Detail · Valley Floor",
  layer05Detail:
    "Isolates irrigated apple orchards, walnut trees, and village fields along the flat valley floor so farm irrigation does not skew wild pasture results.",

  // Visual Preview Header Labels (Opaque Evidence Inspector)
  previewOpticalTag: "High-Res Satellite & Terrain Cutaway",
  previewSparklineTag: "26-Year Spring Greenery (2000 to 2025)",
  previewPrecedentTag: "1964 Aerial vs. 2002 Satellite Precedent",
  previewRouteTag: "Field Route Elevation Profile (1,855 m to 2,980 m)",
  previewSelectedPinTag: "Selected Terrain Observation · Tethered to Stem",
  fieldObservedLabel: "Observed:",
  fieldSourceLabel: "Source:",
  fieldMeaningLabel: "Meaning & Limit:",

  // Cortana / Specialist AI Team (Bottom Briefing Bar)
  teamLabel: "AI Specialist Team",
  bot1Name: "Atlas",
  bot1Role: "Lead Geographer",
  bot1SpeechGlobe:
    "Select any environmental case above—High Atlas Rangelands, Sierra Post-Fire Recovery, or Upper Draa Snow-Fed Basin—or type any place on Earth to run the Annotated Land Model.",
  bot1SpeechValley:
    "We divide the mountain basin into three elevation zones and animate snowmelt drainage from the high ridges to the valley outlet. Click any pin on the terrain to inspect its visual evidence.",

  bot2Name: "Strata",
  bot2Role: "Satellite Specialist",
  bot2Speech:
    "Before testing any claim, we separate the basin into five distinct spatial layers: Valley Zones, 26-Year Greenery, Rainfall, Snowmelt Rivers, and Village Farms.",

  bot3Name: "Veritas",
  bot3Role: "Hypothesis Auditor",
  bot3SpeechLocked:
    "To prevent confirmation bias, all competing explanations and their pass/fail rules were locked before opening the 26-year satellite record.",
  bot3SpeechRecord:
    "Surprise finding: from 2000 to 2025, every mountain zone grew greener (+13% on the floor, +7% on middle and high slopes), even across four severe droughts. That rules out valley-wide bare soil.",
  bot3SpeechGraph:
    "Click any competing explanation in the top bar or card to see how the evidence bears on it. Satellites rule out bare soil, but cannot separate nutritious grass from thorny shrubs.",
  bot3SpeechTrace:
    "Every AI step was checked by deterministic rules. Overstated or causal claims were automatically blocked before reaching this screen.",

  bot4Name: "Agdal",
  bot4Role: "Stewardship Analyst",
  bot4Speech:
    "In this same valley, aerial photos from 1964 to 2002 show that village-managed forest agdals kept their tree cover while unmanaged slopes thinned. Only the village assembly decides opening dates.",

  bot5Name: "Terrain",
  bot5Role: "Field Coordinator",
  bot5Speech:
    "Follow the animated orange field route across the valley: four short walks and one community herd census settle every question satellites cannot resolve from orbit.",

  // Cluely / Aside Dynamic Assistant Quick-Prompt Pills (3 per Stage)
  promptInputPlaceholder:
    "Ask Siterra or jump to any place (e.g. Sierra Fire, Draa Basin, Marrakech)...",
  promptAskBtn: "Explore",

  s1Prompt1: "Separate the 5 valley layers",
  s1Prompt2: "Switch to Sierra Post-Fire Case",
  s1Prompt3: "Switch to Upper Draa Oasis Case",

  s2Prompt1: "Test Competing Explanations (2000 to 2025)",
  s2Prompt2: "Solo 02 · 26-Year Greenery",
  s2Prompt3: "Solo 04 · Snowmelt & Rivers",

  s3Prompt1: "Play 26-year spring timelapse",
  s3Prompt2: "Why can greener mean thorny weeds?",
  s3Prompt3: "Compare community options",

  s4Prompt1: "Trace the 5-stop field route",
  s4Prompt2: "Compare 1964 vs 2002 valley precedent",
  s4Prompt3: "Open 1-Page Village Brief",

  s5Prompt1: "Open 1-Page Village Brief (English)",
  s5Prompt2: "Open Village Brief in Français",
  s5Prompt3: "Inspect AI Verification Proof",

  // Right-Hand Focal Presentation Card Content
  s1CardBadge: "Stage 1 · Basin Scope & Zones",
  s1CardTitle: "Three elevation zones, 26 years of satellite records",
  s1CardLead:
    "We track spring greenery across the entire catchment, separating flat village farms from shared mid-slope and high-mountain pastures.",
  s1StatHeroNum: "92%",
  s1StatHeroLabel: "of the valley grew greener between 2000 and 2025",
  s1Zone1Name: "Valley Floor",
  s1Zone1Elev: "Below 2,317 m · Village farms & low pastures",
  s1Zone1Delta: "+13.4% Greener",
  s1Zone2Name: "Middle Slopes",
  s1Zone2Elev: "2,317 to 2,815 m · Shared spring grazing",
  s1Zone2Delta: "+7.2% Greener",
  s1Zone3Name: "High Summer Pastures",
  s1Zone3Elev: "Above 2,815 m · Communal summer agdal zone",
  s1Zone3Delta: "+7.0% Greener",
  s1HonestyNote:
    "Boundary follows the natural river basin, not official village pasture borders, which require community mapping.",
  s1NextBtn: "Separate the 5 Data Layers",

  globeCardTitle: "Multi-Case Environmental Engine",
  globeLoadedTag: "Ready · Full Record",
  globeReturnBtn: "Global Cases",
  globeDiveBtn: "Zoom into Active Basin",

  s2CardBadge: "Stage 2 · 5 Data Layers",
  s2CardTitle: "What each spatial layer contributes",
  s2CardLead:
    "Click any layer below or in the 5-layer stack to isolate it. Separating farms, rain, snowmelt, and elevation prevents false conclusions.",
  s2NextBtn: "Test Competing Explanations",

  s3CardBadge: "Stage 3 · Competing Explanations",
  s3SubVerdict: "26-Year Verdict",
  s3SubWhy: "4 Explanations",
  s3SubLocked: "Locked Rules",
  s3SubProof: "AI Guardrails",

  s3VerdictTitle: "Pasture-wide decline is ruled out, while shrub vs. grass needs a ground walk",
  s3VerdictLead:
    "Spring greenery rose in all three elevation zones from 2000 to 2025, even during the 4 driest winters (2001, 2016, 2023, 2024).",
  s3VerdictCaveat:
    "Why ground checks matter: satellites measure green colour, not nutrition. Unpalatable thorny cushions look green from orbit.",

  hyp1Title: "1. Shared pastures are turning bare",
  hyp1Verdict: "Ruled Out",
  hyp1Summary:
    "All three mountain zones grew +7% to +13.4% greener across 26 springs (2000 to 2025), with 33 upward greening clusters and zero browning clusters.",

  hyp2Title: "2. Recent droughts killed the pasture cover",
  hyp2Verdict: "Ruled Out",
  hyp2Summary:
    "Even across the 4 driest winters on record (2001, 2016, 2023, and 2024), spring greenery across the elevation zones held steady.",

  hyp3Title: "3. Thorny weeds are replacing good forage grass",
  hyp3Verdict: "Needs Ground Walk",
  hyp3Summary:
    "From space, spiny unpalatable shrubs look just as green as nutritious grass. Only a 165 m ground walk can count plant species.",

  hyp4Title: "4. Irrigated apple orchards skew the valley trend",
  hyp4Verdict: "Needs Ground Walk",
  hyp4Summary:
    "Flat valley-floor land greened fastest (+22% per decade). We need a second land-cover map to separate new orchards from open pasture.",

  hyp5Title: "5. Late winter snow hides spring grass growth",
  hyp5Verdict: "Needs Ground Walk",
  hyp5Summary:
    "Clouds and snow blocked all 28 winter satellite views above 2,815 m. Spring snowmelt timing requires a high-ridge check.",

  s3LockedTitle: "Claims locked before opening the data",
  s3LockedLead:
    "To guarantee scientific honesty, Siterra locks what each explanation predicts before reading any satellite numbers.",
  s3ProofTitle: "Automated Verification & Guardrail Log",
  s3ProofLead:
    "Every number comes from precomputed satellite records, and every sentence is checked to block guesswork or causal claims.",
  s3NextBtn: "Explore Community Options",

  timelineTitle: "26-Year Spring Greenery Record (2000 to 2025)",
  timelinePlay: "Play 26-Year Timelapse",
  timelinePause: "Pause",
  timelineDryTag: "Severe Drought Year · Greenery Held",
  timelineNormalTag: "Normal Rainfall Window · Spring Greenery",

  s4CardBadge: "Stage 4 · Community Options",
  s4CardTitle: "Practical options for the village assembly",
  s4CardLead:
    "Siterra never dictates land rules. It prepares local precedents and options for the community assembly to weigh.",
  s4PrecedentBadge: "Local Valley Precedent (1964 to 2002)",
  s4PrecedentTitle: "Managed Forest Agdals Kept Canopy Over 38 Years",
  s4PrecedentBody:
    "In Aït Bouguemez, comparing 1964 aerial photos with 2002 satellite images showed village-regulated forest agdals kept their canopy while unmanaged slopes thinned.",
  s4PrecedentCaveat: "Context by analogy (forest vs. high pasture), not direct proof.",
  s4NextBtn: "Trace Field Route & Open Brief",

  s5CardBadge: "Stage 5 · Field Route & Village Brief",
  s5CardTitle: "Five ground stops to finish the investigation",
  s5CardLead:
    "Click any stop along the orange field route to inspect its elevation profile and the exact question it settles.",
  s5BriefEnBtn: "Open 1-Page Village Brief (EN)",
  s5BriefFrBtn: "Ouvrir la Note (FR)",

  compassN: "N 000°",
  compassNE: "NE 045°",
  compassENE: "ENE 068° · Up-Valley Toward High Pastures",
  compassE: "E 090°",
  compassSE: "SE 135°",
  splitLeftLabel1: "26-Year Greenery Trend (+9% Valley-Wide)",
  splitRightLabel1: "2022/23 Dry Winter (349 mm vs 562 mm Average)",
  splitLeftLabel2: "Early Record (2000 to 2004 Baseline)",
  splitRightLabel2: "Recent Window (2021 to 2025 + Village Farms)",
  splitLeftLabel3: "Valley Floor (< 2,317 m · +13.4% Greener)",
  splitRightLabel3: "High Summer Pastures (> 2,815 m · +7.0% Greener)",
  splitMode1: "Greenery vs Dry Winter",
  splitMode2: "2000 Baseline vs 2025",
  splitMode3: "Valley Floor vs High Pastures",

  // Terrain Flow & Route Callouts
  hydroFlowLabel: "Assif n'Aït Bouguemez · Snowmelt Drainage Flow",
  fieldRouteBadge: "Suggested Field Route · 5.8 km Total · Access Unconfirmed",

  // Legacy keys used by shared helpers
  yearPrefix: "Spring",
  rainUnit: "mm rain",
  ndviLabel: "Greenery",
  slopeLabel: "/dec",
  rSqLabel: "Fit",
  pixelsLabel: "squares",
  agdalOpenRingLabel: "Seasonal Pasture Rest (Agdal)",
  openRingTag: "Pasture Borders Need Community Mapping",
  dryRuleFootprintLabel: "Dry-Year Grazing Reserve · Middle Slopes",
  footprintTag: "Candidate Zone · For Assembly Discussion",
} as const;
