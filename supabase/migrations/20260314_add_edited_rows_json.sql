-- Add editedRowsJson to report_results (safe: if not exists)
alter table public."report_results"
add column if not exists "editedRowsJson" jsonb;
