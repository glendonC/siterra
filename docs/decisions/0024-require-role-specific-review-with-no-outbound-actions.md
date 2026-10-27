---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Require role-specific review with no outbound actions

## Context and Problem Statement

Siterra prepares a field-validation plan and candidate responses that concern a real community's land and livelihoods. Local authority, representation and permissions have not been established, and no button in an application can create them ([Human review and authority](../reference/review-and-authority.md)). How should review and real-world action work in the product?

## Considered Options

* Role-specific review (scientific, community and livelihood, program), demo mode labeled everywhere, actions ending at prepared, no outbound tools
* A single approval of AI output
* Outbound actions after approval (messages, contacts, bookings)

## Decision Outcome

Chosen option: "Role-specific review (scientific, community and livelihood, program), demo mode labeled everywhere, actions ending at prepared, no outbound tools", because authority sits outside the application.

Each review decision records the role, the exact entity versions reviewed, the decision, its conditions and its mode. In the demonstration every decision carries `mode: demo` and cannot satisfy a real authorization; the community and livelihood role cannot be completed inside the demonstration and offers only "Mark consultation required". `OperationalAction` ends at `prepared`, and no email, messaging, payment, publishing or land-management tool exists.

### Consequences

* Good, because a review binds to an exact revision and goes stale when its inputs change, so an approval never outlives the evidence it covered.
* Good, because an instruction injected into a source cannot cause outreach: there is no outbound tool to call.
* Bad, because the demonstration cannot show a complete authorization; the action reaches "Prepared (demo)" with community consultation still listed as outstanding.
* Bad, because every review screen must state what a decision means and does not mean, and demo labels must survive export.

### Confirmation

SA-01 to SA-09, DF-05 and SV-07 in [acceptance criteria](../project/acceptance-criteria.md).

## Pros and Cons of the Options

### A single approval of AI output

* Bad, because scientific, community and program decisions mean different things, and a blanket "Approve AI" button would imply an authority that no role in the application holds.

### Outbound actions after approval (messages, contacts, bookings)

* Bad, because a real implementation would need a named authorized actor, exact content and recipients, and an explicit bounded approval; none exists, and a demonstration click must never look like consent.

## More Information

The stance behind this boundary: [ADR-0033](0033-keep-the-autonomous-firm-stance-with-human-authority.md).
