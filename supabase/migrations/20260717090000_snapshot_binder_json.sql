-- Store the binder's printable CONTENT (title + layoutStyle + pages) on each purchased-version
-- snapshot. The archive bucket keeps the exact bytes from the spend, but bytes are frozen —
-- print OPTIONS (color-owned tint, cutting-margin layout) can't apply to them. With the content
-- itself frozen here, a purchased version can be REGENERATED with whatever options the user
-- picks at download time, forever — even after the binder is edited or deleted.
alter table public.binder_pdf_snapshots
  add column if not exists binder_json jsonb;

comment on column public.binder_pdf_snapshots.binder_json is
  'The binder content this version was spent on ({title, layoutStyle, pages}) — regenerable with any print options. NULL on rows from before this column existed (those fall back to the archived bytes).';
