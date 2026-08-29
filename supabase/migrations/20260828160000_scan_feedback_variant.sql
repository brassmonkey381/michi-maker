-- scan_feedback records WHICH FINISH the card was, not only which card it was.
--
-- WHY THIS IS THE FIRST STEP OF THE FINISH CLASSIFIER (tcgscan-data-science
-- docs/FINISH-CLASSIFIER.md). Finish is price: the same card id in Normal and Reverse Holofoil is
-- different money, and portfolio_entries.variant is what a collection's value is computed from.
-- Today the app asks a person to guess it. A classifier could read it from how a card behaves
-- across looks, and the blocker is labels: the catalog has no finish field and rarity is not a
-- substitute, because a Common exists in both Normal and Reverse Holofoil with the same artwork
-- and the same id, which is exactly the pair that matters.
--
-- Prices bound the space but do not close it. Measured 2026-08-28 over the recorded sessions: of
-- 451 pockets a card could be named for, only 51 belong to cards whose price history names ONE
-- finish. The other 400 exist in both, and no amount of mining settles those.
--
-- So collect the answer instead. A person already tells us the finish every time they use the
-- detailed add sheet; the row that records their card choice simply threw it away.
--
-- VARIANT_SOURCE IS NOT OPTIONAL BOOKKEEPING. Most adds do not ask: the quick path takes whatever
-- the pricing lookup defaults to, and recording that as though a human said it would fill the
-- training set with the app's own guesses and teach the classifier to reproduce them. 'user' is a
-- label. 'default' is a prior. A trainer that cannot tell them apart is worse off than one with
-- fewer rows.
--
-- Nullable and unconstrained, like every other column here: this table is fire-and-forget from
-- the client and a rejected insert would lose training data for a scan that already happened.

alter table public.scan_feedback add column if not exists variant text;
alter table public.scan_feedback add column if not exists variant_source text;

comment on column public.scan_feedback.variant is
  'The finish recorded for this scan (Normal, Holofoil, Reverse Holofoil, ...), verbatim as the '
  'app writes it to portfolio_entries.variant. Null when the add path never named one.';

comment on column public.scan_feedback.variant_source is
  '''user'' = a person chose this finish in the add sheet, so it is a LABEL. ''default'' = the '
  'pricing lookup supplied it and nobody confirmed it, so it is the app''s own guess and must be '
  'filtered out of any training set. Null = unknown (rows written before 2026-08-28).';

-- Finding the labelled rows is the only query this table will be asked for by the finish work,
-- and it is a tiny slice of a growing table.
create index if not exists scan_feedback_variant_label_idx
  on public.scan_feedback (variant) where variant_source = 'user';
