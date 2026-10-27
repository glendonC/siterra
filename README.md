<h1 align="center">Siterra</h1>

<p align="center"><strong>Satellites show that land is changing. Siterra investigates why, and what to check before anyone acts.</strong></p>

<p align="center">
  <a href="docs/explanation/problem.md">The problem</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#how-it-scales">How it scales</a> ·
  <a href="#sources">Sources</a> ·
  <a href="docs/README.md">Documentation</a>
</p>

Siterra is an investigation workspace for environmental concerns about real places. You name a place and a worry. Siterra is designed to measure the land from satellite and rainfall records, read the research written about it, test the competing explanations against the evidence, and prepare a field plan and a brief for the people who decide. It is designed so that every statement links to its source, and so that when the data cannot settle a question it says so and names the field work that would.

<!-- Hero frame of the drought challenge goes here once the founder approves it. -->

## The problem

Rangelands cover 80 million km², over 54 per cent of the terrestrial surface, and support the livelihoods of approximately 2 billion people [1]. FAO estimates that roughly half of rangelands may be degraded [2]. The UNCCD report puts negative trends at about 20 per cent in some recent assessments and says they may significantly underestimate the loss [1]. The United Nations declared 2026 the International Year of Rangelands and Pastoralists and called on states, the UN system, the private sector and academia to fill knowledge gaps on rangelands and pastoralism [3].

The data to watch them is free. Sentinel-2 imagery is free, full and open by EU law [4], and after Landsat imagery became free in 2008 its use rose twentyfold [5]. Yet the global assessment of land degradation found that remote sensing, open data and decision-support platforms exist "yet they are not commonly used", and that most decision tools assess only the biophysical state of land [6]. Rangeland data collection and real-time monitoring can be expensive and hard to perform, and lack of monitoring and evaluation capacity is often a challenge for project managers and implementing agencies [1].

A satellite record shows change, and it rarely shows the cause. Greenness follows rainfall closely: in simulations, a vegetation-index trend only became statistically detectable once 30 to 40 per cent of the vegetation had been degraded [7]. A browner valley can mean heavier grazing, a dry year, late snow, new orchards or a poor image, and the answer decides which grazing rules, herd measures or restoration funds follow.

Getting the cause wrong has a record in Morocco. In the protectorate, the 1917 forest decree banned grazing for six years in burned or harvested forests and restricted or criminalized most customary forest uses, and officials treated forest grazing, transhumance above all, as the main cause of deforestation. Fossil pollen evidence contradicts the large deforestation estimates [9]. In Morocco's dryland farming areas, land degradation is commonly blamed on pastoral overgrazing, while existing documentation points to ploughing of marginal land and over-irrigation [10]. In African savanna rangelands, not snow-fed Atlas pastures, where rainfall varies widely it affects plant growth more than marginal changes in stocking density [11]. The opposite error is real too: in many rangelands stocking is at or above long-term capacity [6]. Blaming herds wrongly and missing real grazing pressure both lead to the wrong rules. Siterra is designed to investigate the question carefully, one place at a time, before a decision rests on it.

## How it works

Siterra is designed to work like this; the workspace is specified and not built yet. It plans the investigation and runs it as visible steps. It measures vegetation and rainfall over the area from validated data packages, reads the published research in its original language, and places each piece of evidence on the map where it applies. When you ask what else could explain a change, it starts new work and the evidence regroups around the competing explanations.

Each explanation carries a plain status, for example "consistent with available evidence" or "cannot be assessed with current data". Every gap becomes a measurement in the field plan. Numbers are computed by code from the data packages, never written by a model, and each analysis records which of its rules were fixed before any result was seen and which changed after. Siterra prepares the work; sending, spending and decisions about the land stay with the people who hold that authority.

## First case: the Aït Bouguemez valley

The first case asks whether grazing is putting pressure on the shared pastures of the Aït Bouguemez valley in Morocco's Central High Atlas. These parts exist in the repository with their procedures and checksums:

- The valley catchment, frozen at native 30 m resolution from the Copernicus DEM before any vegetation index was computed: 417.04 km² (geodesic) ([study area](research/geospatial/study-area.md)).
- A validated monthly rainfall record for 2019 to 2025 on the 33 CHIRPS grid cells that touch the catchment. One month was recomputed from a separate copy of the source with no difference, and an independent rerun of three months and all twelve monthly reference values matched ([data packages](data/bundles/catalog.json)).
- A validated monthly vegetation record from Sentinel-2 (NDVI at 10 m) for 2019 to 2025: 68 months have enough clear pixels and 16 months from December to March do not, and each gap is recorded with its reason. An independent rerun of one month matched every stored digit ([data packages](data/bundles/catalog.json)).
- A wet-season rule registered before any comparison ran: each November to April season is placed in the lower, middle or upper third of the 30 wet seasons that start in 1991 to 2020 ([analysis recipes](docs/reference/analysis-recipes.md#season-summary-and-the-near-normal-band)). The other analyses say which of their parts were fixed before any data was read and which were written with their first run; one is marked post hoc ([recipe entries](docs/reference/analysis-recipes.md#p0-recipe-entries)).

National figures set the context and are never scaled down to the valley: Morocco's 2024 cereal production was over 40 per cent below average, and 700 000 tonnes of subsidized barley were distributed to livestock farmers in the most drought-affected regions in 2022 [8].

## How it scales

The foundation is standard and not specific to this valley. Sentinel-2 imagery, CHIRPS rainfall and the Copernicus elevation model are free, and every validated data package is described in the SpatioTemporal Asset Catalog (STAC) format that other tools already read. Analyses come from a fixed library of methods. A new place is a new boundary and its data review, run through the same pipeline. A new concern, such as forest loss set against drought or a shrinking wetland set against irrigation, is a new set of explanations on the same machinery.

Place-data services give AI agents cited facts about what is at a location. Siterra investigates a question about a place over time: what is happening there, what could explain it, and what would settle it. Its outputs (validated data packages, cited event records and the case itself) are designed as structured records that other software can read; the rainfall package already is one.

## Meta models

Each Meta model job has a check that does not depend on that model ([model map](docs/decisions/0041-give-each-meta-model-one-job-with-an-independent-check.md); further jobs [proposed](docs/decisions/0045-extend-the-meta-model-map-to-event-records-figures-and-whole-corpus-reading.md)).

| Model | Job | Independent check |
|---|---|---|
| Muse Spark | Plans the investigation, reads the research and FAO's country briefs, drafts statements | Every quoted excerpt must match the stored source text, checked by code |
| Muse Glimmer (later; open weights, runs locally) | Rereads each statement against its source and flags overreach | Scored on hand-labeled examples before any result is shown |
| Muse Image (later) | Draws wordless field-protocol illustrations, labeled as illustrations, never maps, data or scenery of the valley | A Spark checklist (no text, faces, maps or charts) and a community and livelihood review |

The model integration is specified and not built yet.

## What exists and what does not

| Part | State |
|---|---|
| Frozen catchment and the validated rainfall record, with the bundle's lock file | Built and checked |
| Wet-season rule | Registered before any comparison; results for seven seasons in the season bundle |
| Vegetation record from Sentinel-2 | Built and checked |
| Pipeline code | Not in the repository yet |
| Investigation workspace, model integration, field plan, brief | Designed, not built |
| Diagnosis of overgrazing, forecasts, savings in time or cost, any field result | Not claimed |

## Sources

1. Herrera, P.M. (2024). *Global Land Outlook Thematic Report on Rangelands and Pastoralists*. UNCCD, Bonn. [PDF](https://digitallibrary.un.org/record/4058928/files/1413651-EN.pdf) (SCI-127)
2. FAO (2025). *FAO launches the International Year of Rangelands and Pastoralists 2026*, news release, 2 December 2025. [FAO newsroom](https://www.fao.org/newsroom/detail/fao-launches-the-international-year-of-rangelands-and-pastoralists-2026-to-strengthen-these-ecosystems-and-support-the-people-who-sustain-them/en) (SCI-126)
3. United Nations General Assembly (2022). *International Year of Rangelands and Pastoralists, 2026*. Resolution A/RES/76/253. [PDF](https://digitallibrary.un.org/record/3965711/files/A_RES_76_253-EN.pdf) (SCI-125)
4. European Commission. *Legal notice on use of Copernicus Sentinel data*. [Licence](https://cds.climate.copernicus.eu/licences/ec-sentinel) (SCI-18)
5. NASA Science (2019). *Landsat science team members support the free and open Landsat data policy*, 20 March 2019. [NASA Science](https://science.nasa.gov/missions/landsat/landsat-science-team-members-support-the-free-and-open-landsat-data-policy) (SCI-134)
6. IPBES (2018). *Summary for policymakers of the assessment report on land degradation and restoration*. [doi:10.5281/zenodo.3237411](https://doi.org/10.5281/zenodo.3237411) (SCI-129)
7. Wessels, K.J., van den Bergh, F., Scholes, R.J. (2012). Limits to detectability of land degradation by trend analysis of vegetation index data. *Remote Sensing of Environment* 125: 10-22. [doi:10.1016/j.rse.2012.06.022](https://doi.org/10.1016/j.rse.2012.06.022) (SCI-29)
8. FAO GIEWS. *Country Brief: Morocco*, with the archive of briefs from 2010 to 2026. [Current brief](https://www.fao.org/giews/countrybrief/country.jsp?code=MAR) (SCI-25)
9. Davis, D.K. (2005). Potential Forests: Degradation Narratives, Science, and Environmental Policy in Protectorate Morocco, 1912–1956. *Environmental History* 10(2): 211-238. [doi:10.1093/envhis/10.2.211](https://doi.org/10.1093/envhis/10.2.211) (SCI-145)
10. Davis, D.K. (2006). Neoliberalism, environmentalism, and agricultural restructuring in Morocco. *The Geographical Journal* 172(2): 88-105. [doi:10.1111/j.1475-4959.2006.00204.x](https://doi.org/10.1111/j.1475-4959.2006.00204.x) (SCI-148)
11. Behnke, R.H., Scoones, I. (1992). *Rethinking Range Ecology: Implications for Rangeland Management in Africa*. Drylands Issues Paper 33, IIED and ODI. [IIED](https://www.iied.org/7282iied) (SCI-149)

Every source, with what it supports and its limits, is in the [science source register](research/science/source-register.md).

## Documentation

Start with the [documentation index](docs/README.md): reading paths for judges, builders and scientific reviewers, the [decision log](docs/decisions/README.md) and the [delivery plan](docs/project/delivery-plan.md).

## License

No project license has been chosen yet. Datasets, libraries and color maps keep their own terms ([CONTRIBUTING.md](CONTRIBUTING.md#ownership-and-licensing)).
