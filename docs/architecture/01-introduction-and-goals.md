# Introduction and goals

What Siterra must do, the quality goals the architecture is judged against, and who has a stake in it. Product reasoning is in [product thesis and challenge](../explanation/product-thesis.md); the main flow is in [users and flows](../explanation/users-and-flows.md).

## Requirements overview

Siterra is planned as an autonomous environmental services firm in software. A client commissions an investigation of an environmental concern; Siterra plans the work, reads the research, loads reproducible satellite and climate observations, keeps competing explanations open until evidence separates them, surfaces livelihood and governance constraints, and prepares a field-validation plan with the human reviews it needs. Nothing is sent, spent or decided on anyone's behalf. In consulting terms the deliverable is the scoping phase of an engagement: desk review, remote-sensing baseline, options screening and terms of reference for fieldwork [D].

The first and only case in scope is pasture resilience in the Aït Bouguemez valley, Central High Atlas, Morocco: how communities can assess grazing-related pressure on shared pastures and evaluate practical responses without undermining pastoral livelihoods. It is framed as a question, never a diagnosis.

Requirements that shape the architecture:

| Requirement | Consequence for the architecture | Acceptance |
|---|---|---|
| One commission produces a multi-step plan that executes without further input, with real tool calls in the trace | Durable command, task and event records; a worker that runs a model-proposed task graph | AF-01 |
| A challenge triggers new tasks, not a paragraph | Commands start new work against the current case revision | AF-02 |
| Every statement carries its claim type and opens to its source, area, period, method and coverage | Typed evidence with provenance; the case record is the only source of facts for every view | TR-01 |
| Measurements are computed deterministically, never by the model | Offline, validated observation bundles; deterministic tools; a numeric provenance check on model text | AF-05, SV-01, SV-02 |
| The firm says "insufficient" when it is | Missing data is a value; blocked tasks name the missing dependency | SV-04, RL-02 |
| The case persists over time | Reload restores the case without re-executing completed work | RL-04 |
| Every action stops at "prepared" until an appropriate human decides | No outbound tools or endpoints; role-specific review records bound to exact revisions | SA-01 to SA-09 |

Acceptance IDs are defined in acceptance criteria. The user's attention is limited to four things: confirming the analysis area, answering targeted questions (or marking them unknown), challenging interpretations, and recording role-specific review decisions.

## Quality goals

| Goal | Meaning for Siterra | Scenarios |
|---|---|---|
| Traceability | Every accepted evidence item opens to its source or measurement, area, period, method, coverage and the task, model calls and tool calls that produced it | [Traceability](10-quality-requirements.md#traceability) |
| Scientific validity | Numbers come from records; measurements reproduce from validated bundles; gaps stay gaps; no prohibited claim | [Scientific validity](10-quality-requirements.md#scientific-validity) |
| Reliability and continuity | Provider failures, stream loss, worker crashes and stale tabs never corrupt or duplicate case state | [Reliability](10-quality-requirements.md#reliability) |
| Authority and safety | Actions end at "prepared"; reviews are role-specific and revision-bound; retrieved text cannot change permissions | [Authority and safety](10-quality-requirements.md#authority-and-safety) |
| Accessibility | The complete flow works with a keyboard and without voice, drag gestures or terrain rendering; target WCAG 2.2 AA | [Accessibility](10-quality-requirements.md#accessibility) |
| Performance | The workspace responds within the acceptance targets on the demo laptop | [Performance](10-quality-requirements.md#performance) |

## Stakeholders

Roles are design assumptions, not interview findings [U]; see [users and flows](../explanation/users-and-flows.md).

| Stakeholder | Expectations relevant to the architecture |
|---|---|
| Environmental program manager or restoration project lead (primary user) | Commission once, see real work, understand what the evidence supports, challenge it, and get a reviewable next step without operating GIS tools |
| Environmental or remote-sensing specialist | Measurement definitions, spatial scope, processing, confounders and provenance |
| Community participant or appropriately mandated representative | Understandable proposal, livelihood effects, language access and the ability to disagree |
| Field practitioner | Specific observations to collect, sampling rationale, safe access and permission requirements |
| Observer or demo viewer | What the system actually did and what remains hypothetical; mode labels on every screen |
| Implementation lanes: platform, agent runtime, science and map data, workspace UI, quality | Fixed contracts, owned directories and integration rules (delivery plan) |
| Maintainer | Chooses the project license and approves publication or any change of repository visibility |
