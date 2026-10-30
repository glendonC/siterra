-- The seed case a demo copy was made from. A case configuration belongs to the seed, so a copy
-- resolves it through this column; null for a case that is not a copy.
alter table cases add column origin_case_id text;
