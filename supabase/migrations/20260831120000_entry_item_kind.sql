-- portfolio_entries.item_kind: what KIND of thing a lot is. Null = a card (every row that
-- existed before the field did); 'sealed' = a sealed product, whose card_id is then a sealed
-- productId from the tcgscan-data sealed catalog. Cards and sealed share one global TCGPlayer
-- id space, so the id itself never collides — this column is the discriminator, not a namespace.
--
-- A BIRTH FIELD, same doctrine as scan_path (20260828120000): written in the entry's first
-- version and never after, because sync merges whole rows by updated_at and a later write would
-- be erased by any other device's edit. Old clients omit the key on edits, so the value survives.
--
-- Nullable, no default, no CHECK, no FK — the batch-poisoning rule: the entries sync push is ONE
-- upsert and a single rejected row poisons the queue indefinitely, so a value the client can
-- plausibly produce must never be enforced here. Vocabulary lives in the client.
--
-- MUST BE LIVE BEFORE ANY CLIENT THAT PUSHES IT: PostgREST rejects a payload column the table
-- does not have, and that rejection is the poison-batch failure this project documents.

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'portfolio_entries'
                    and column_name = 'item_kind') then
    alter table public.portfolio_entries add column item_kind text;
  end if;
end $$;
