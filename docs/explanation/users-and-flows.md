# Users and flows

These are role assumptions for design and testing, not interview findings or real stakeholder endorsements.

## Primary role

The primary user is an environmental program manager or restoration project lead, accountable for deciding what investigation to commission, understanding what the evidence supports, and coordinating a feasible next step. The MVP assumes enough environmental literacy to review a concise brief, without requiring GIS operation. Actual literacy, procurement needs, budget authority and willingness to use Siterra remain untested.

The primary job: “Help me turn a concern about shared pasture resilience into an evidence-backed investigation and a reviewable plan for field verification.” Success is a useful next decision, including the decision to collect missing evidence before acting.

## Second role: local initiator

**A local actor without technical staff who wants to raise a concern.** Example: a tour operator in the Central High Atlas who notices pasture change along the routes they guide and wants to raise it with commune officials, a pastoral cooperative or community groups. They need a credible, plain account of what is known and what is not, in a language those groups read (French first; see [accessibility and language](../reference/accessibility-and-language.md#the-translation-layer)), a field plan others can check, and a way to share it themselves.

Boundaries: Siterra prepares; the initiator decides whether and how to share. Siterra never contacts officials or communities, and commissioning a case gives no one authority over shared land or the right to speak for a community. Whether such actors would commission an investigation, pay for it, or be heard by officials is untested.

## Supporting roles and separate authority

| Role | Needs from the case | Can review | Must not be implied |
|---|---|---|---|
| Environmental / remote-sensing specialist | Measurement definitions, spatial scope, processing, confounders and provenance | Scientific method and interpretation | Scientific expertise grants land-management authority |
| Community participant or appropriately mandated representative | Understandable proposal, livelihood effects, language access and ability to disagree | Local relevance, impacts, representation and consent questions | One speaker represents all users or automatically holds authority over shared land |
| Program manager | Dependencies, proposed resources, responsible roles, alternatives and status | Work within their actual mandate | App membership grants external authority |
| Field practitioner | Specific observations to collect, sampling rationale, safe access and permission requirements | Feasibility of field-validation plan | A generated plan establishes permission to enter or sample |
| Observer / demo viewer | What the system actually did and what remains hypothetical | Read-only inspection | Viewing or a demo button creates real approval |

Real role verification and stakeholder identification are deployment prerequisites. The demo uses explicitly labeled illustrative reviewer roles and never claims to have identified a legally sufficient consent pathway.

## Main flow

| Step | User objective and input | System work and visible result | Boundary or failure |
|---|---|---|---|
| Arrive | Understand the case and start with one action | Show named study context, bounded selection, central question and “Start investigation” | No diagnosis, invented site visit or implied community partnership |
| Commission | Confirm the objective and permitted analytical area | Create a case revision and actual tasks; show concise milestones | If the area/data cannot be validated, show the exact missing dependency |
| Inspect evidence | Understand what was observed and where it came from | Compose map, timeline and evidence summary from structured results | Insufficient coverage is missing data, never a zero observation |
| Explore history | Choose an available observation period | Synchronize selected period across map, chart, labels and evidence | An unavailable date has an explicit disabled/missing state |
| Challenge attribution | Type “Could drought explain this instead?” | Launch a relevant comparison, link it to the existing hypothesis and state limits | Correlation does not settle causality; unavailable rainfall or masking details remain visible |
| Raise livelihoods | Type “What about households relying on grazing?” | Add qualitative constraints and a list of local facts needed | No fabricated household count, income loss, affordability or consent |
| Compare responses | Ask for practical options | Present evidence, prerequisites, trade-offs, unknowns and field requirements | Candidate approaches are options for review, not prescriptions |
| Prepare next work | Ask for a field-validation package | Produce linked knowns, unknowns, measurements, dependencies, roles and draft actions | Drafting a contact list or message does not send it |
| Review | Inspect proposal and record a scoped demo decision | Separate scientific review, local consultation requirements and program authorization | Approval applies to the specified revision; unmet conditions remain unmet |
| Share (P1) | Export the brief or create a read-only link | Export states its language, translation status and demo labels; the user shares it | Siterra sends nothing; a machine-drafted translation is labeled for local review |
| Return | Reload and continue or inspect an earlier revision | Restore artifacts, evidence, selections and task/review state | Never replay completed tasks or duplicate actions just because the page reloaded |

The [experience storyboard](../reference/experience-storyboard.md) specifies visual moments. The [review specification](../reference/review-and-authority.md) defines decision semantics.

## Contextual director contract

Typed commands are P0. Every request carries case ID, case revision, geographic selection, selected period and focused artifact IDs. A user can inspect and clear these context indicators. The UI must not silently assume a different mountain, period or component from the one visible.

Show a concise command receipt (“Compare rainfall for the selected period”), actual progress, and links to the changed artifacts. Preserve the user's input when a task fails and offer a targeted retry. If an instruction would require an external side effect, prepare a proposal and state the boundary. Do not translate a general instruction such as “prepare next steps” into authority to contact people.

Use task status in plain language: queued, running, needs information, completed, failed, cancelled. Distinguish a complete research task from a confirmed ecological conclusion. “Analysis complete” cannot stand in for “grazing caused degradation.”

## Early user tests

Before polishing optional features, ask an unfamiliar reader to explain the product and first action within 15 seconds. Ask a program-role tester to locate one evidence source, issue a drought challenge, find the missing livelihood information and explain the proposed next action. Ask a scientific reviewer whether the presented observations justify each interpretation. Record misunderstandings and revise the work product. Do not recruit only the builder as the usability evaluator or claim these tests have already passed.
