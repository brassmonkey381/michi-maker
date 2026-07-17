-- Purchased binder PDFs become a VERSION HISTORY. Each spent purchase now archives as its own
-- version (one row per (user, binder, fingerprint)) instead of overwriting the single snapshot —
-- so a user who buys, edits, and buys again keeps EVERY purchased version downloadable and can
-- pick among them in the print sheet. `pdf_path` records where that version's bytes live in the
-- binder-pdfs bucket (new spends use versioned paths `<uid>/<binderId>-<fp16>.pdf`; rows from
-- before this migration are backfilled to the legacy `<uid>/<binderId>.pdf` path).

alter table public.binder_pdf_snapshots
  add column pdf_path text;

-- Backfill the pre-versioning rows to the legacy single-archive path.
update public.binder_pdf_snapshots
  set pdf_path = user_id::text || '/' || binder_id || '.pdf'
  where pdf_path is null;

alter table public.binder_pdf_snapshots
  drop constraint binder_pdf_snapshots_pkey;

alter table public.binder_pdf_snapshots
  add primary key (user_id, binder_id, fingerprint);

comment on table public.binder_pdf_snapshots is
  'Spent per-binder PDF purchases, one row per purchased VERSION (user, binder, fingerprint). Bytes at pdf_path in the binder-pdfs bucket. A purchase is unspent while entitlements.granted_at is newer than the latest version''s updated_at.';
