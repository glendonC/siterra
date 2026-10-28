-- The case record: cases, every revision of every record, commits, commands and events.
-- Records and events are append-only: a revision is never rewritten (data-contracts.md, principles).

create table sessions (
  id text primary key,
  owner_scope_id text not null,
  kind text not null check (kind in ('local', 'demo')),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
comment on column sessions.id is 'SHA-256 hex of the session token; the token itself is never stored';

create table cases (
  id text primary key,
  owner_scope_id text not null,
  revision integer not null check (revision >= 1),
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  record jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cases_owner on cases (owner_scope_id);

-- Each EnvironmentalCase revision, so a past case revision stays readable.
create table case_revisions (
  case_id text not null references cases (id) on delete cascade,
  revision integer not null check (revision >= 1),
  record jsonb not null,
  commit_id text,
  created_at timestamptz not null default now(),
  primary key (case_id, revision)
);

create table commits (
  case_id text not null references cases (id) on delete cascade,
  id text not null,
  command_id text,
  task_id text,
  idempotency_key text not null,
  result_key text,
  expected_case_revision integer not null check (expected_case_revision >= 1),
  new_case_revision integer not null check (new_case_revision = expected_case_revision + 1),
  committed_at timestamptz not null default now(),
  primary key (case_id, id),
  unique (case_id, idempotency_key),
  unique (case_id, result_key)
);
comment on column commits.result_key is 'Logical task result key (caseId, commandId, task kind, inputHash); a retry finds the committed result';

create table records (
  case_id text not null references cases (id) on delete cascade,
  entity_id text not null,
  revision integer not null check (revision >= 1),
  record_type text not null,
  record jsonb not null,
  commit_id text,
  case_revision integer not null check (case_revision >= 1),
  created_at timestamptz not null default now(),
  primary key (case_id, entity_id, revision),
  check (record ->> 'id' = entity_id),
  check ((record ->> 'revision')::integer = revision),
  check (record ->> 'recordType' = record_type)
);
create index records_by_type on records (case_id, record_type, entity_id, revision desc);

create table commands (
  case_id text not null references cases (id) on delete cascade,
  id text not null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null check (
    status in ('accepted', 'running', 'succeeded', 'partial', 'failed', 'cancelled', 'rejected_stale')
  ),
  record jsonb not null,
  cancel_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (case_id, id),
  unique (id),
  unique (case_id, idempotency_key)
);
comment on column commands.request_hash is 'SHA-256 of the canonical request body; the same key with a different body answers 422';

create table events (
  case_id text not null references cases (id) on delete cascade,
  sequence bigint not null check (sequence >= 1),
  id text not null,
  kind text not null,
  command_id text,
  task_id text,
  dedupe_key text not null,
  record jsonb not null,
  occurred_at timestamptz not null,
  primary key (case_id, sequence),
  unique (case_id, id),
  unique (case_id, dedupe_key),
  check ((record ->> 'sequence')::bigint = sequence)
);
create index events_by_command on events (case_id, command_id, sequence);

-- Role-specific review decisions, stored apart from generated records (review-and-authority.md).
create table review_records (
  case_id text not null references cases (id) on delete cascade,
  entity_id text not null,
  revision integer not null check (revision >= 1),
  idempotency_key text,
  request_hash text,
  record jsonb not null,
  created_at timestamptz not null default now(),
  primary key (case_id, entity_id, revision),
  unique (case_id, idempotency_key),
  check (record ->> 'recordType' = 'ReviewDecision'),
  check (record ->> 'id' = entity_id)
);

-- Append-only guards: no UPDATE, DELETE or TRUNCATE on the record and event history. The one
-- exception is deleting a whole case (an expired demo copy): that transaction runs
-- set local siterra.case_deletion = 'on' and deletes the cases row. Only the foreign-key cascade
-- from that delete passes (it runs inside the cascade trigger, so pg_trigger_depth() > 1); a
-- direct DELETE of a single row is refused even with the setting on.
create function reject_rewrite() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1
     and coalesce(current_setting('siterra.case_deletion', true), '') = 'on' then
    return old;
  end if;
  raise exception '% on % is refused: rows are append-only; write a new revision instead', tg_op, tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

create trigger records_append_only before update or delete on records
  for each row execute function reject_rewrite();
create trigger events_append_only before update or delete on events
  for each row execute function reject_rewrite();
create trigger case_revisions_append_only before update or delete on case_revisions
  for each row execute function reject_rewrite();
create trigger review_records_append_only before update or delete on review_records
  for each row execute function reject_rewrite();
create trigger records_no_truncate before truncate on records
  for each statement execute function reject_rewrite();
create trigger events_no_truncate before truncate on events
  for each statement execute function reject_rewrite();
create trigger case_revisions_no_truncate before truncate on case_revisions
  for each statement execute function reject_rewrite();
create trigger review_records_no_truncate before truncate on review_records
  for each statement execute function reject_rewrite();
