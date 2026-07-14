-- Live scan-to-screen: michi's "My collection" home section subscribes to postgres_changes on
-- user_cards, so a card scanned in tcgscan-app appears on the michi home screen in real time.
-- (RLS still governs which rows a subscriber sees — owner-only.)
alter publication supabase_realtime add table public.user_cards;
