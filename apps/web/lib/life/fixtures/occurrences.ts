// SYNTHETIC: a small asset in the stored format of species_occurrences 1.0.0 (occurrences.json: columns of equal
// length joined to taxon, dataset, basis and licence tables), for the recorded life layer's tests and frames until the
// real bundles reach this branch (the lead, 21:14). Not GBIF data: the dataset says so. The points lie in the first
// place's catchment; the taxa are real names, the records are made up. One fossil specimen, and stated uncertainties
// of none, 30 m, 1.5 km and 2.5 km, so every line of the layer's cards is shown.

export const SYNTHETIC_LIFE_BUNDLE = "bundle_species_occurrences_synthetic";

const points: [number, number][] = [
  [31.654839, -6.449316],
  [31.649728, -6.457944],
  [31.637485, -6.486857],
  [31.63, -6.41],
  [31.58, -6.47],
  [31.65, -6.35],
];

// [point, taxon, year, event date, basis, uncertainty (m), licence]
const rows: [number, number, number | null, string | null, number, number | null, number][] = [
  [0, 0, 2012, "2012-04-04", 0, null, 0],
  [0, 0, 2012, "2012-04-07", 0, null, 0],
  [0, 1, 2014, "2014-05-11", 0, null, 1],
  [0, 2, 2019, "2019-06-02", 0, 30, 0],
  [0, 3, 2021, "2021-04-20", 1, 30, 1],
  [1, 0, 2016, "2016-05", 0, null, 0],
  [1, 4, 2018, "2018-07-14", 0, null, 0],
  [2, 3, 1936, null, 1, 2500, 0],
  [2, 3, 1951, "1951-06", 1, 1500, 0],
  [3, 5, 2023, "2023-05-30", 0, 30, 1],
  [4, 1, null, null, 0, null, 0],
  [5, 2, 2025, "2025-04-18", 0, 30, 0],
  [5, 6, 1890, null, 2, null, 0],
];

export const syntheticOccurrences = {
  recipeId: "species_occurrences",
  version: "1.0.0",
  computed: "2026-10-30T20:23:52Z",
  records: rows.length,
  how_to_read: "SYNTHETIC fixture in the stored format; not GBIF data.",
  tables: {
    taxa: [
      {
        scientific_name: "Alectoris barbara (Bonnaterre, 1790)",
        species: "Alectoris barbara",
        kingdom: "Animalia",
        class: "Aves",
        order: "Galliformes",
        family: "Phasianidae",
      },
      {
        scientific_name: "Apus apus (Linnaeus, 1758)",
        species: "Apus apus",
        kingdom: "Animalia",
        class: "Aves",
        order: "Apodiformes",
        family: "Apodidae",
      },
      {
        scientific_name: "Thymus satureioides Coss.",
        species: "Thymus satureioides",
        kingdom: "Plantae",
        class: "Magnoliopsida",
        order: "Lamiales",
        family: "Lamiaceae",
      },
      {
        scientific_name: "Juniperus thurifera L.",
        species: "Juniperus thurifera",
        kingdom: "Plantae",
        class: "Pinopsida",
        order: "Pinales",
        family: "Cupressaceae",
      },
      {
        scientific_name: "Papilio machaon Linnaeus, 1758",
        species: "Papilio machaon",
        kingdom: "Animalia",
        class: "Insecta",
        order: "Lepidoptera",
        family: "Papilionidae",
      },
      {
        scientific_name: "Atlantoxerus getulus (Linnaeus, 1758)",
        species: "Atlantoxerus getulus",
        kingdom: "Animalia",
        class: "Mammalia",
        order: "Rodentia",
        family: "Sciuridae",
      },
      {
        scientific_name: "Ammonoidea",
        species: null,
        kingdom: "Animalia",
        class: "Cephalopoda",
        order: null,
        family: null,
      },
    ],
    datasets: [
      {
        key: "synthetic-1",
        title: "Synthetic fixture A, not GBIF data",
        publisher: "Siterra test fixture",
        doi: null,
      },
      {
        key: "synthetic-2",
        title: "Synthetic fixture B, not GBIF data",
        publisher: "Siterra test fixture",
        doi: null,
      },
    ],
    basis_of_record: ["HUMAN_OBSERVATION", "PRESERVED_SPECIMEN", "FOSSIL_SPECIMEN"],
    license: ["CC-BY-4.0", "CC0-1.0"],
  },
  columns: {
    gbif_id: rows.map((_, i) => 900_000_000 + i),
    taxon: rows.map((r) => r[1]),
    year: rows.map((r) => r[2]),
    event_date: rows.map((r) => r[3]),
    basis_of_record: rows.map((r) => r[4]),
    lat: rows.map((r) => points[r[0]]?.[0] ?? 0),
    lon: rows.map((r) => points[r[0]]?.[1] ?? 0),
    uncertainty_m: rows.map((r) => r[5]),
    dataset: rows.map((_, i) => (i % 3 === 2 ? 1 : 0)),
    license: rows.map((r) => r[6]),
  },
};
