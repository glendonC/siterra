export interface BeatCitation {
  id: string;
  label: string;
  title: string;
  venue: string;
  finding: string;
  href?: string;
}

export type BeatTone = "blue" | "red" | "yellow" | "green";

export interface StoryBeat {
  id: string;
  tone: BeatTone;
  /** Target longitude for the globe limb during this beat. */
  globeLon: number;
  /** Target latitude for the globe limb during this beat. */
  globeLat: number;
  /** Primary lead clause in full ink (--ink). */
  ink: string;
  /** Plain grey continuation (--grey). */
  grey: string;
  citations: readonly BeatCitation[];
}

/**
 * Four crystal-clear, everyday-English story beats:
 * 1. Scale & Gap (Blue): Over half of Earth's land, 2B people, free maps vs. months of expert work.
 * 2. Why Maps Mislead (Red): Crops & weeds look just as green from space as healthy grass; 30-40% lost before trends show.
 * 3. Real-World Harm (Yellow): 26 conservation projects failed; herders blamed for drought.
 * 4. What Siterra Does (Green): Pick any place on Earth and ask what is changing the land.
 */
export const STORY_BEATS: readonly StoryBeat[] = [
  {
    id: "opening.beat.1",
    tone: "blue",
    globeLon: -18,
    globeLat: 24,
    ink: "Over half of Earth's land is open pasture and rangeland, supporting two billion people.",
    grey: "Free satellite maps cover the entire planet, yet figuring out what is actually happening to a single valley still takes months of expensive expert work.",
    citations: [
      {
        id: "UNCCD",
        label: "UNCCD Global Land Outlook, 2024",
        title: "Global Land Outlook Thematic Report on Rangelands and Pastoralists",
        venue: "United Nations Convention to Combat Desertification",
        finding:
          "Rangelands cover over 54% of terrestrial land (80M km²) and support ~2 billion people globally, while local site-level monitoring capacity remains scarce.",
        href: "https://digitallibrary.un.org/record/4058928/files/1413651-EN.pdf",
      },
      {
        id: "IPBES",
        label: "IPBES Global Assessment, 2018",
        title: "Global Assessment Report on Land Degradation and Restoration",
        venue: "Intergovernmental Science-Policy Platform (CC BY 4.0)",
        finding:
          "Land degradation impacts 3.2 billion people worldwide, yet open Earth-observation data is rarely combined with local land knowledge in decisions.",
        href: "https://doi.org/10.5281/zenodo.3237411",
      },
    ],
  },
  {
    id: "opening.beat.2",
    tone: "red",
    globeLon: 16,
    globeLat: 18,
    ink: "A satellite map can look healthy and green while the land on the ground is actually worsening.",
    grey: "From space, irrigated crops and thorny weeds blend right in with healthy grass—and satellite trends often miss the damage until 30 to 40% of the plants are already gone.",
    citations: [
      {
        id: "RSE",
        label: "Wessels et al., 2012",
        title: "Limits to detectability of land degradation by trend analysis of vegetation index data",
        venue: "Remote Sensing of Environment · Vol. 125, pp. 10–22",
        finding:
          "In simulations, 30–40% vegetation loss is required before a standard satellite vegetation trend becomes statistically detectable under variable rainfall.",
        href: "https://doi.org/10.1016/j.rse.2012.06.022",
      },
      {
        id: "LANDSAT",
        label: "Zhu et al., 2019",
        title: "Benefits of the free and open Landsat data policy & sub-pixel limits",
        venue: "Remote Sensing of Environment · Vol. 224, pp. 382–385",
        finding:
          "Open satellite archives expanded global observation 20-fold, but coarse optical pixels still blend different plant types together without higher-resolution separation.",
        href: "https://doi.org/10.1016/j.rse.2019.02.016",
      },
    ],
  },
  {
    id: "opening.beat.3",
    tone: "yellow",
    globeLon: -52,
    globeLat: 12,
    ink: "When governments or climate projects act on a misleading map, both the land and local people pay the price.",
    grey: "Across 26 studied conservation projects in six countries, most failed to stop land loss—and local herders are routinely blamed for damage actually caused by drought.",
    citations: [
      {
        id: "SCIENCE",
        label: "West et al., 2023 · Science",
        title: "Action needed to make carbon offsets from forest conservation work for climate change mitigation",
        venue: "Science · Vol. 381, Issue 6660",
        finding:
          "Audit across 26 conservation sites in six countries showing that most projects failed to reduce land loss because they lacked a verified baseline.",
        href: "https://doi.org/10.1126/science.ade3535",
      },
      {
        id: "IIED",
        label: "Behnke & Scoones, 1992",
        title: "Rethinking Range Ecology: Implications for Rangeland Management",
        venue: "IIED & ODI · Global Drylands Synthesis",
        finding:
          "Demonstrates that in dryland ecosystems, multi-year rainfall swings drive plant changes far more than livestock numbers, refuting top-down overgrazing assumptions.",
        href: "https://www.iied.org/7282iied",
      },
    ],
  },
  {
    id: "opening.beat.4",
    tone: "green",
    globeLon: -6.5,
    globeLat: 31.6,
    ink: "Pick any place on Earth and ask what is changing the land.",
    grey: "Siterra cross-checks decades of satellite imagery, rainfall records, and scientific studies to test every explanation side by side—then maps the exact spots to check on foot.",
    citations: [
      {
        id: "METHOD",
        label: "Chamberlin, 1965 · Science",
        title: "The Method of Multiple Working Hypotheses",
        venue: "Science · Vol. 148, Issue 3671",
        finding:
          "Establishes why rigorous investigations must test competing explanations side by side rather than cherry-picking data to fit a single story.",
        href: "https://doi.org/10.1126/science.148.3671.754",
      },
      {
        id: "BMC",
        label: "Gould et al., 2025 · BMC Biology",
        title: "Same data, different analysts: variation in effect sizes in ecology",
        venue: "BMC Biology · Vol. 23, Art. 35 (246 Analysts)",
        finding:
          "Study across 174 research teams showing why standardized, reproducible analysis pipelines are required so conclusions do not flip based on analyst bias.",
        href: "https://doi.org/10.1186/s12915-024-02101-x",
      },
    ],
  },
];
