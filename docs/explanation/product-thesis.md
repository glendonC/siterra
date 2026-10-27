# Product thesis

What Siterra is, who it is for, why it should exist alongside today's AI agents and environmental tools, and what it must not pretend to do. Labels follow the [documentation index](../README.md#evidence-labels): **[V]** verified from a cited source, **[D]** decision, **[H]** hypothesis to test, **[U]** unverified. Nothing here claims validated demand, a working service or a field result.

## The decision

Build one environmental case end to end: a commissioned investigation that ends in a field-validation plan people can review [D]. The build shows research, measurement, interpretation and preparation inside clear limits of authority. It does not show land management, outreach or outcomes, because software cannot honestly claim them. Gates in the [delivery plan](../project/delivery-plan.md#gates) can stop or narrow the build: Meta model access with tool calling, one validated observation bundle, a working end-to-end slice by the end of day 3, and the honesty checks in the [acceptance criteria](../project/acceptance-criteria.md).

## The problem it answers

Free satellite and rainfall data has not made rangeland decisions easier, because the analysis that turns data into a fair decision about one place is expensive and rare where it is most needed [H]. Rangelands cover more than half of Earth's land and support about two billion people, and 2026 is the UN International Year of Rangelands and Pastoralists [V]. The facts, the Moroccan context and the figures Siterra avoids are in [the problem](problem.md).

## What Siterra is

A client commissions a case. Siterra plans the investigation, retrieves and checks sources, loads reproducible satellite and climate observations for a defined area, compares competing explanations, lists livelihood and governance constraints, screens candidate responses, and prepares a field-validation plan with the reviews it needs. The case persists, every statement links to its evidence, and every action stops at "prepared" until a person with the right authority decides. In consulting terms, the result is the scoping phase of an engagement: a desk review, a remote-sensing baseline, a screening of options and terms of reference for fieldwork [D].

The working product promise is "Give Siterra an environmental question. Get an evidence-backed plan for what to check next." The working tagline is "Environmental intelligence, put to work." Both are provisional and live in the brand configuration, never in schema names.

Siterra does the investigative work end to end and prepares actions; people with authority decide anything that happens in the world ([ADR-0033](../decisions/0033-keep-the-autonomous-firm-stance-with-human-authority.md)). "Autonomous environmental services firm" is the mission phrase for pitches. Inside the product the actor is always Siterra ("Siterra retrieved 6 sources"), never a team, analysts or named personas, because no accountable professionals stand behind the work and a staffed, AI-assisted monitoring service already exists ([MKT-11](../../research/competitive/source-register.md)).

## Who it is for

The primary user is an environmental program manager, restoration lead or agricultural development officer who has to decide whether and how to act on a reported concern, without GIS or remote-sensing staff of their own. The second is a local initiator, such as a tour operator in the High Atlas who wants to raise a concern with officials and community groups and needs a brief they can read, in French first ([users and flows](users-and-flows.md#second-role-local-initiator), [ADR-0034](../decisions/0034-build-translation-ready-and-ship-french-first.md)). Both are design personas; no interviews have been run [U].

What they need is to turn a loosely reported concern into a next step they can fund, staff and defend. Today that is a consultant's scoping study measured in weeks [H].

## Why not a general AI agent with a map tool

The realistic alternative is a general agent used alongside an environmental tool such as Global Nature Watch Horizon or Trends.Earth, which already provide reproducible analyses and climate-corrected productivity methods [V]. Neither is documented to keep one case in which competing explanations stay open until evidence separates them, livelihood and governance unknowns block conclusions, reviews bind to an exact revision and authority, changed inputs mark dependent findings as stale, and an unresolved cause becomes a traceable field plan [H]. That case discipline is the product. Reproducible measurement and synchronized views are prerequisites. The tests that would show it are in [competitive position](competitive-position.md#testable-differentiation-acceptance-tests-df-01-to-df-06).

## What the user sees and does

Siterra produces a task plan, retrieved sources with page locators, summarized observations with their coverage, a hypothesis ledger, livelihood and governance constraints, screened response options, a field-validation plan with strata, measurements, roles and permissions, review requests and a decision brief, all saved and linked.

The user does four things: confirms the analysis area, answers targeted questions or marks them unknown, challenges interpretations, and records review decisions for their role. They never arrange charts or assign agents.

Trust comes from what can be checked. Every statement carries its claim kind and opens to its source, area, period, method and coverage. Siterra says when the data is insufficient. Measurements are computed by code, never by the model. Live and replayed runs are labeled.

Autonomy shows in the work itself. One commission produces a multi-step plan that runs without further input, with real tool calls in the trace. A challenge starts new tasks rather than producing a paragraph. When data quality blocks a conclusion, Siterra names the missing input and adds the step that would supply it. What separates Siterra from a visual research assistant is that it keeps the case over time: open questions, stale evidence, pending reviews and next actions persist and change state.

Within minutes of commissioning, the user should see the real valley on a relief map, the observed vegetation record with its coverage, rainfall on its true coarse grid, competing explanations with their evidence, and a field plan a team could act on [H]. The hackathon build can credibly show one case, real precomputed observations, live model planning and tool use, persistence and reload, honest failure states and demo-mode reviews.

It must not show an overgrazing diagnosis from vegetation indices; biomass, carrying capacity or animal units; causal percentages; recovery or income forecasts; household counts or impacts; consent, partnerships or approvals presented as real; outreach, payments or land decisions; translations presented as reviewed; or voice as a dependency.

## Known weaknesses

| Weakness | How the design responds |
|---|---|
| The data may not show anything conclusive | An inconclusive result that names what would decide it is a full result and becomes the core of the field plan |
| A map with panels can look like a dashboard | One place, one focused question at a time, sections that fill as work completes, and evidence that visibly moves when the user challenges an explanation ([UX architecture](../reference/ux-architecture.md)) |
| Autonomy claims are easy to fake | The trace shows real task, model, tool and validation events, and replayed runs are labeled on every screen |
| Ten days is short | A strict P0 scope in the [delivery plan](../project/delivery-plan.md), precomputed science, one case only |
| Demand is unproven | The persona is stated as a hypothesis, with a blinded comparison test proposed in [competitive position](competitive-position.md) |

## Other places the same method could help

These are possibilities, not capabilities [H]. Siterra is specified for one case and has not been built or tested on any of them. What would carry over is the case discipline, not a model; each use needs its own recipes, sources, validation and map of who decides, and the rules on comparable places ([ADR-0037](../decisions/0037-show-comparable-places-as-context-by-analogy.md)) and forecasting ([ADR-0039](../decisions/0039-forecast-nothing-until-a-backtest-shows-skill.md)) apply everywhere. Each need below is verified on its source [V].

| Use | The need | What it would take |
|---|---|---|
| Recovery after wildfire | The frequency of the most energetic wildfire events increased 2.2-fold from 2003 to 2023 (SCI-138) | A burn-severity recipe, fire perimeters, field calibration |
| Land-degradation reporting | Most assessments put 20 to 40% of land as degraded or degrading (SCI-128) | SDG 15.3.1 sub-indicators following the good practice guidance (SCI-06); never presented as an official assessment |
| Checking restoration and carbon projects | Across 26 avoided-deforestation project sites, most did not significantly reduce deforestation (SCI-137) | Counterfactual recipes, project and registry data, legal review; no ratings |
| Protected and conserved areas | Only 4.78% of the world's land is covered by protected areas whose management effectiveness has been assessed (SCI-136) | Alignment with existing effectiveness frameworks; never a substitute for a formal assessment |
| Water decisions in drylands | 3.2 billion people live in agricultural areas with high or very high water shortages or scarcity (SCI-139) | Water-accounting recipes and irrigation maps; no hydrological modelling claims |
| Pastoral drought decisions elsewhere | Drylands host 69% of global livestock production (SCI-129) | Local sources in their own languages, native-speaker review, monitoring only |

## What has not been tested

There have been no user interviews, comparative usability trials, willingness-to-pay studies, ecological outcomes, local partnerships or professional language evaluations. Before any pilot, Siterra needs testing with real program staff and a remote-sensing reviewer, and appropriate local consultation pathways. None of these planned activities may be presented as traction.
