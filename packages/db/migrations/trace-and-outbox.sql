-- Internal spans (OpenTelemetry GenAI names, allowlisted attributes only) and the outbox the
-- dispatcher reads to enqueue pg-boss jobs with a stable key.

create table spans (
  case_id text not null references cases (id) on delete cascade,
  span_id text not null,
  trace_id text not null,
  parent_span_id text,
  task_id text,
  name text not null,
  kind text not null check (kind in ('INTERNAL', 'CLIENT')),
  status text not null check (status in ('unset', 'ok', 'error')),
  started_at timestamptz not null,
  ended_at timestamptz,
  attributes jsonb not null default '{}'::jsonb,
  primary key (case_id, span_id),
  check (jsonb_typeof(attributes) = 'object')
);
comment on column spans.trace_id is 'The command ID: one trace per command';
create index spans_by_trace on spans (case_id, trace_id, started_at);

create table outbox (
  id bigint generated always as identity primary key,
  case_id text not null references cases (id) on delete cascade,
  command_id text,
  queue text not null,
  job_key text not null unique,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz
);
create index outbox_pending on outbox (id) where dispatched_at is null;
