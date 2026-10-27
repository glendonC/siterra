---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Host on Railway with Render as fallback

## Context and Problem Statement

Siterra deploys a web service, a persistent worker that keeps running when the browser closes, and PostgreSQL. The event stream uses Server-Sent Events, which need long-lived HTTP responses, and the worker must reach Meta's API. Spending on any plan is the founder's decision. Where should the demonstration run?

## Considered Options

* Railway, Hobby plan
* Render
* Fly.io
* Vercel
* A local deployment

## Decision Outcome

Chosen option: "Railway, Hobby plan", because web, worker and PostgreSQL run as services in one project from one repository (TECH-23), and SSE works within Railway's per-request limits with the planned heartbeat and reconnect (TECH-50).

Railway HTTP requests, including SSE, run up to 15 minutes while data flows and close after 5 minutes without data, so the 15-second heartbeat and `Last-Event-ID` reconnect are required. The trial is not used: an unverified Limited Trial restricts outbound network access, which would block calls to `api.meta.ai`. Behind any proxy, the SSE route disables response buffering (TECH-54). Details: [Deployment view](../architecture/07-deployment-view.md#hosting).

### Consequences

* Good, because one platform hosts all three services, including a persistent worker.
* Bad, because the 15-minute request cap makes reconnect and replay mandatory, not optional.
* Bad, because hosting cannot be confirmed until an account exists. If the worker or the stream fails there (RISK-08 and RISK-22 in the [risk register](../project/risk-register.md)), the fallback is Render, then a local deployment with a persistent database, disclosed in the submission.

### Confirmation

GATE-04, the hosting gate ([Deployment view](../architecture/07-deployment-view.md#deployment-checks)): on the deployment, the worker survives the browser closing, the stream reconnects across the 15-minute cap, and map asset requests with a Range header return 206. AF-03 and RL-03 in [acceptance criteria](../project/acceptance-criteria.md) pass on the deployment.

## Pros and Cons of the Options

Platform facts: TECH-50 to TECH-54 in the [technology source register](../../research/technology/source-register.md).

### Render

* Good, because it runs a web service, a background worker and PostgreSQL, and allows HTTP responses of up to 100 minutes (TECH-51).
* Bad, because it has no free worker and its free PostgreSQL expires; the smallest paid set is about USD 20 per month at list prices. It is the fallback.

### Fly.io

* Good, because one app can run web and worker process groups on low-cost machines (TECH-52).
* Bad, because Managed Postgres starts at USD 38 per month, and trial machines stop after 5 minutes.

### Vercel

* Bad, because function duration ceilings (300 s on Hobby, 800 s on Pro) cut the stream and cannot host a persistent pg-boss worker, and the Hobby plan is for non-commercial use only (TECH-53).

### A local deployment

* Good, because it has no platform limits.
* Bad, because it must be labeled and disclosed in the submission text; it is the last fallback.
