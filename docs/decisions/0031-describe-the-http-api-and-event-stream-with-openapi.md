---
status: accepted
date: 2026-10-26
decision-makers: maintainer
---

# Describe the HTTP API and event stream with OpenAPI

## Context and Problem Statement

The application exposes a small HTTP API (case snapshot, commands, cancellation, reviews, trace) and a Server-Sent Events stream of persisted domain events. The routes are described in a Markdown table ([Runtime view](../architecture/06-runtime-view.md#api-and-stream)), and the event payloads in [case.schema.json](../../schemas/case.schema.json). Parallel lanes need a machine-readable description of both that tests can check. Which specification should describe them?

## Considered Options

* OpenAPI 3.2, with the event stream described as `text/event-stream` using `itemSchema`
* AsyncAPI 3.1 for the event stream, with OpenAPI for the HTTP routes
* The Markdown route table only

## Decision Outcome

Chosen option: "OpenAPI 3.2, with the event stream described as `text/event-stream` using `itemSchema`", because one document then covers the HTTP routes and the stream, and OpenAPI 3.2 defines `itemSchema` for sequential media types, including `text/event-stream`.

* The document is `schemas/openapi.json`, written against OpenAPI 3.2.0 and its 3.2.1 text clarifications.
* The stream route `GET /api/cases/{id}/events` returns `text/event-stream`, whose `itemSchema` models one Server-Sent Event as in the specification's generic `text/event-stream` schema: a required string `data`, strings `event` and `id`, and an integer `retry`.
* The JSON inside `data` is described with `contentMediaType: application/json` and a `contentSchema` that references the Event definition in `case.schema.json`.

Specification: [OpenAPI 3.2.0](https://spec.openapis.org/oas/v3.2.0.html).

### Consequences

* Good, because routes, request bodies and streamed events are described once, next to the JSON Schema contracts they reference ([ADR-0013](0013-define-contracts-in-json-schema-mirrored-in-zod.md)).
* Good, because it needs no second specification language.
* Bad, because `contentSchema` is not validated by default, so contract tests must validate each event payload against the Event schema themselves.
* Bad, because tool support for OpenAPI 3.2 features such as `itemSchema` was not verified; generators and linters must be checked before relying on them.

### Confirmation

`schemas/openapi.json` validates as an OpenAPI 3.2 document; a contract test checks that every route in the [Runtime view](../architecture/06-runtime-view.md#api-and-stream) exists in it and that every streamed event in the end-to-end tests validates against the Event schema; RL-03 in [acceptance criteria](../project/acceptance-criteria.md) covers replay over the stream.

## Pros and Cons of the Options

### AsyncAPI 3.1 for the event stream, with OpenAPI for the HTTP routes

* Good, because AsyncAPI is designed for message-driven interfaces.
* Bad, because AsyncAPI 3.1 defines no Server-Sent Events binding (the binding proposal was closed without merging), and two documents would describe one small API ([asyncapi/bindings](https://github.com/asyncapi/bindings)).

### The Markdown route table only

* Good, because it already exists and reads easily.
* Bad, because no test can check code or events against it.
