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
 * 1. Scale & Gap (Blue): Over half of Earth's land, 2B livelihoods, free images rarely used in decisions.
 * 2. Why Maps Mislead (Red): Crops & weeds look just as green from space as healthy grass; 30-40% lost before trends show.
 * 3. Real-World Harm (Yellow): colonial Morocco blamed herders for forest loss that fossil pollen later contradicted.
 * 4. What Siterra Does (Green): Pick any place on Earth and ask what is changing the land.
 */
export const STORY_BEATS: readonly StoryBeat[] = [
  {
    id: "opening.beat.1",
    tone: "blue",
    globeLon: -18,
    globeLat: 24,
    ink: "Over half of Earth's land is open pasture and rangeland, supporting the livelihoods of about two billion people.",
    grey: "Free satellite images cover all of it, yet they rarely shape decisions about the land, and checking one valley on the ground can be costly and hard.",
    citations: [
      {
        id: "UNCCD",
        label: "UNCCD Global Land Outlook, 2024",
        title: "Global Land Outlook Thematic Report on Rangelands and Pastoralists",
        venue: "United Nations Convention to Combat Desertification",
        finding:
          "Rangelands cover 80 million km², over 54% of the terrestrial surface, and support the livelihoods of about 2 billion people; monitoring them can be expensive and hard, and projects often lack the capacity.",
        href: "https://digitallibrary.un.org/record/4058928/files/1413651-EN.pdf",
      },
      {
        id: "IPBES",
        label: "IPBES Land Degradation Assessment, 2018",
        title: "Assessment Report on Land Degradation and Restoration, Summary for Policymakers",
        venue: "Intergovernmental Science-Policy Platform (CC BY 4.0)",
        finding:
          "Land degradation negatively impacts the well-being of at least 3.2 billion people; remote sensing and open data exist, yet they are not commonly used in land decisions.",
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
    grey: "From space, irrigated crops and thorny weeds blend right in with healthy grass, and in simulations, satellite trends missed the damage until 30 to 40% of the vegetation was lost.",
    citations: [
      {
        id: "RSE",
        label: "Wessels et al., 2012",
        title:
          "Limits to detectability of land degradation by trend analysis of vegetation index data",
        venue: "Remote Sensing of Environment · Vol. 125, pp. 10–22",
        finding:
          "In simulations, 30–40% vegetation loss is required before a standard satellite vegetation trend becomes statistically detectable under variable rainfall.",
        href: "https://doi.org/10.1016/j.rse.2012.06.022",
      },
      {
        id: "LANDSAT",
        label: "Zhu et al., 2019",
        title: "Benefits of the free and open Landsat data policy",
        venue: "Remote Sensing of Environment · Vol. 224, pp. 382–385",
        finding: "After Landsat data became free in 2008, its use rose 20-fold.",
        href: "https://doi.org/10.1016/j.rse.2019.02.016",
      },
    ],
  },
  {
    id: "opening.beat.3",
    tone: "yellow",
    globeLon: -52,
    globeLat: 12,
    ink: "When governments act on a misleading map, the land and the people who depend on it pay the price.",
    grey: "In colonial Morocco, officials blamed herders for vast forest loss and outlawed most of their traditional forest uses. Fossil pollen later showed the loss was far smaller.",
    citations: [
      {
        id: "DAVIS",
        label: "Davis, 2005 · Environmental History",
        title:
          "Potential Forests: Degradation Narratives, Science, and Environmental Policy in Protectorate Morocco, 1912–1956",
        venue: "Environmental History · Vol. 10, No. 2, pp. 211–238",
        finding:
          "The 1917 forest decree banned grazing for six years in burned or harvested forests and restricted or criminalized most customary forest uses; officials treated forest grazing as the main cause of deforestation, yet fossil pollen evidence contradicts the large deforestation estimates.",
        href: "https://doi.org/10.1093/envhis/10.2.211",
      },
    ],
  },
  {
    id: "opening.beat.4",
    tone: "green",
    globeLon: -6.5,
    globeLat: 31.6,
    ink: "Pick any place on Earth and ask what is changing the land.",
    grey: "Siterra cross-checks decades of satellite imagery, rainfall records, and scientific studies to test every explanation side by side, then maps the exact spots to check on foot.",
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
