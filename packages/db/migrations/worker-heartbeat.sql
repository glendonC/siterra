-- One row per worker process, refreshed while it runs, so the health route can tell whether a worker
-- is alive. Bookkeeping only: no case data, and rows of stopped workers simply age.
create table worker_heartbeats (
  worker_id text primary key,
  started_at timestamptz not null,
  last_seen_at timestamptz not null
);
