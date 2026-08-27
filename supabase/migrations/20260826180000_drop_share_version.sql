-- tcgscan-michi-maker: retire the share-link edit counter, now that the fingerprint is live.
--
-- 20260826170000 replaced binders.share_version with binders.share_key and deliberately LEFT THE
-- COUNTER IN PLACE. A migration and a deploy are not simultaneous: dropping it while the deployed
-- api/og-binder.js still selected it would have made PostgREST reject that whole select, and every
-- shared binder would have unfurled as the generic fallback for the length of the deploy.
--
-- THE PRECONDITION FOR THIS MIGRATION is that the deploy carrying share_key is live in production.
-- It is: /binder/<id> now emits ?v=00ba8ae0 rather than ?v=157, and no code path anywhere reads
-- share_version. Its trigger went with 20260826170000, so the column has been frozen and unread
-- since then.
--
-- WHY DROP IT AT ALL rather than leave a harmless dead column. Two columns that both claim to
-- version the same link is how one of them quietly becomes wrong: the next person to read the
-- schema has to work out which one the URL actually uses, and a frozen counter looks exactly like
-- a live one that stopped being bumped by mistake. The answer should be visible in the table.
--
-- NOTHING IS LOST THAT MATTERS. The values were a count of writes per binder, never displayed,
-- never compared, and reconstructible from nothing — share_key does not derive from them, and the
-- links people already posted carrying an old integer keep resolving because nothing reads v.

alter table public.binders
  drop column if exists share_version;
