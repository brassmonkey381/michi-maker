-- Page search tags (MIC-068, owner 2026-11-25): "use claude API credits to tag public page changes
-- a few times a day, only changed public pages. and we need a table to track it. Don't need full
-- history, just latest".
--
-- WHAT THIS ADDS
--   page_search_tags  the LATEST tags per page (colours, themes, moods, art styles, a one-line
--                     description, the source hash they were made from). One row per page, no
--                     history. Written only by the page-tags edge function (service role).
--   page_tag_queue    pages changed since they were last looked at. Filled by triggers on
--                     binder_slots (insert, update AND delete: updated_at alone misses a card
--                     taken off a page), binder_pages (new page; title, background, public or
--                     hold changed) and binders (made public).
--   page_tag_runs     one row per Claude batch: pages, tokens, estimated cost. Pruned at 90 days.
--   page_tags_sweep() the nightly catch-up: queues every visible public page with no tags, or
--                     whose page or cards changed after it was tagged.
--   search_binders    gains a fifth branch: a typed word that is one of a visible page's tags, or
--                     a phrase in its description, finds the binder. It keeps MIC-070's gate.
--
-- WHAT SPENDS MONEY. Only the page-tags function, and only for a PUBLIC, VISIBLE page whose text
-- (title, background, cards and their art captions) differs from what it was last tagged from: a
-- queued page whose source hash is unchanged costs nothing. It sends text, never images, to
-- Claude Haiku 5.5 through the Message Batches API with a cached system prompt.
--
-- COST PER 1,000 PAGES, at batch prices for claude-haiku-5-5 ($0.05 input, $0.25 output, $0.005
-- cache read per million tokens): about 1,000 system-prompt tokens (cached), 250-450 page tokens
-- and 60-120 output tokens per page come to about $0.04-$0.06 per 1,000 pages, and about $0.10 per
-- 1,000 if the cache never hits. page_tag_runs records the real tokens and cost of every batch.
-- The first runs tag every public page once (at most 2,000 per run, so a backlog spreads over a
-- day). After that, only changed pages.
--
-- CADENCE (UTC): sweep 02:30; submit 03:00, 09:00, 15:00, 21:00; collect every 15 minutes, but
-- only while a batch is open. The schedule is the CRON block at the end, which needs the vault
-- secret page_tags_secret: state/deploy-page-tags.ps1 creates it, sets the same value as the
-- function's PAGE_TAGS_SECRET and re-runs that block. Without it this migration schedules nothing
-- and spends nothing.
--
-- Applied with `supabase db query --linked -f`, not `db push` (the project is shared with the
-- tcgscan repos, whose migrations are not in this repo). Builds on 20261125120000 (MIC-070).

begin;

-- ── 1. tables ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public.page_search_tags (
  page_id     uuid primary key references public.binder_pages(id) on delete cascade,
  binder_id   uuid not null references public.binders(id) on delete cascade,
  colours     text[] not null default '{}',
  themes      text[] not null default '{}',
  moods       text[] not null default '{}',
  art_styles  text[] not null default '{}',
  terms       text[] not null default '{}',
  description text not null default '',
  source_hash text not null,
  model       text not null,
  tagged_at   timestamptz not null default now()
);
create index if not exists page_search_tags_terms_idx on public.page_search_tags using gin (terms);
create index if not exists page_search_tags_binder_idx on public.page_search_tags (binder_id);
do $$
declare s text;
begin
  select n.nspname into s from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
  execute format('create index if not exists page_search_tags_description_trgm_idx on public.page_search_tags using gin (description %I.gin_trgm_ops)', s);
end $$;

create table if not exists public.page_tag_queue (
  page_id  uuid primary key references public.binder_pages(id) on delete cascade,
  dirty_at timestamptz not null default now()
);

create table if not exists public.page_tag_runs (
  id                 bigserial primary key,
  created_at         timestamptz not null default now(),
  batch_id           text unique,
  status             text not null default 'submitted' check (status in ('submitted', 'done', 'failed')),
  pages              integer not null default 0,
  page_hashes        jsonb not null default '{}'::jsonb,
  succeeded          integer,
  errored            integer,
  input_tokens       bigint,
  cache_write_tokens bigint,
  cache_read_tokens  bigint,
  output_tokens      bigint,
  cost_usd           numeric(12, 6),
  ended_at           timestamptz,
  note               text
);

-- Server only: RLS on and no policies. The function uses the service role; search_binders and the
-- triggers below are security definer.
alter table public.page_search_tags enable row level security;
alter table public.page_tag_queue enable row level security;
alter table public.page_tag_runs enable row level security;
revoke all on public.page_search_tags, public.page_tag_queue, public.page_tag_runs from anon, authenticated;

-- ── 2. the dirty marker ─────────────────────────────────────────────────────────────────────────
-- Statement-level, so a bulk save queues each page once. NEVER LETS A SAVE FAIL: an error here
-- becomes a warning, because a missed queue row is caught by the nightly sweep and a failed slot
-- save is lost work.
create or replace function public.page_tags_queue_ids(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.page_tag_queue (page_id)
  select distinct x from unnest(p_ids) as x
   where x is not null and exists (select 1 from public.binder_pages p where p.id = x)
  on conflict (page_id) do update set dirty_at = now();
exception when others then
  raise warning 'page_tag_queue not updated: %', sqlerrm;
end $$;
revoke all on function public.page_tags_queue_ids(uuid[]) from public, anon, authenticated;

create or replace function public.page_tags_mark_slots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.page_tags_queue_ids(array(select page_id from new_rows));
  elsif tg_op = 'UPDATE' then
    perform public.page_tags_queue_ids(array(select page_id from new_rows union select page_id from old_rows));
  else
    perform public.page_tags_queue_ids(array(select page_id from old_rows));
  end if;
  return null;
end $$;

drop trigger if exists page_tags_slots_ins on public.binder_slots;
drop trigger if exists page_tags_slots_upd on public.binder_slots;
drop trigger if exists page_tags_slots_del on public.binder_slots;
create trigger page_tags_slots_ins after insert on public.binder_slots
  referencing new table as new_rows for each statement execute function public.page_tags_mark_slots();
create trigger page_tags_slots_upd after update on public.binder_slots
  referencing old table as old_rows new table as new_rows for each statement execute function public.page_tags_mark_slots();
create trigger page_tags_slots_del after delete on public.binder_slots
  referencing old table as old_rows for each statement execute function public.page_tags_mark_slots();

create or replace function public.page_tags_mark_pages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.page_tags_queue_ids(array(select id from new_rows));
  else
    perform public.page_tags_queue_ids(array(
      select n.id from new_rows n join old_rows o on o.id = n.id
       where n.title is distinct from o.title
          or n.background_color is distinct from o.background_color
          or n.is_public is distinct from o.is_public
          or n.moderation_hold is distinct from o.moderation_hold));
  end if;
  return null;
end $$;

drop trigger if exists page_tags_pages_ins on public.binder_pages;
drop trigger if exists page_tags_pages_upd on public.binder_pages;
create trigger page_tags_pages_ins after insert on public.binder_pages
  referencing new table as new_rows for each statement execute function public.page_tags_mark_pages();
create trigger page_tags_pages_upd after update on public.binder_pages
  referencing old table as old_rows new table as new_rows for each statement execute function public.page_tags_mark_pages();

create or replace function public.page_tags_mark_binders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.page_tags_queue_ids(array(
    select p.id from new_rows n join old_rows o on o.id = n.id
      join public.binder_pages p on p.binder_id = n.id
     where n.is_public and not coalesce(o.is_public, false)));
  return null;
end $$;

drop trigger if exists page_tags_binders_upd on public.binders;
create trigger page_tags_binders_upd after update on public.binders
  referencing old table as old_rows new table as new_rows for each statement execute function public.page_tags_mark_binders();

-- ── 3. the nightly sweep ────────────────────────────────────────────────────────────────────────
-- Queues every page a visitor can see that has no tags yet, or whose page or cards changed after it
-- was tagged; prunes run rows older than 90 days. Spends nothing by itself: the submit step skips a
-- queued page whose source hash has not changed.
create or replace function public.page_tags_sweep()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  insert into public.page_tag_queue (page_id)
  select pg.id
    from public.binder_pages pg
    join public.binders b on b.id = pg.binder_id
    left join public.page_search_tags t on t.page_id = pg.id
   where b.is_public and b.removed_at is null and b.archived_at is null
     and coalesce(b.is_demo, false) = false
     and pg.is_public and not pg.moderation_hold
     and (t.page_id is null
          or pg.updated_at > t.tagged_at
          or exists (select 1 from public.binder_slots s where s.page_id = pg.id and s.updated_at > t.tagged_at))
  on conflict (page_id) do nothing;
  get diagnostics n = row_count;
  delete from public.page_tag_runs where created_at < now() - interval '90 days';
  return n;
end $$;
revoke all on function public.page_tags_sweep() from public, anon, authenticated;

-- ── 4. search_binders reads the tags ────────────────────────────────────────────────────────────
create or replace function public.search_binders(
  p_query       text default '',
  p_limit       integer default 40,
  p_after_likes bigint default null,
  p_after_at    timestamptz default null,
  p_after_id    uuid default null
)
returns table (
  binder_id      uuid,
  like_count     bigint,
  author_name    text,
  made_public_at timestamptz,
  page_count     integer,
  face_page_id   uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  -- ONE BRANCH PER TABLE, NOT ONE `or`. An `or` across tables cannot use an index on any of them;
  -- a union of single-table conditions can use each table's own index.
  with hits as (
    select b.id from public.binders b
     where b.is_public and btrim(coalesce(p_query, '')) = ''
    union
    select b.id from public.binders b
     where b.is_public and btrim(coalesce(p_query, '')) <> ''
       and (b.title ilike public.like_pattern(p_query) or b.description ilike public.like_pattern(p_query))
    union
    select b.id from public.binders b
      join public.profiles p on p.id = b.owner_id
     where b.is_public and btrim(coalesce(p_query, '')) <> ''
       and p.username ilike public.like_pattern(p_query)
    union
    -- Page titles: the binder is the result, the page is why. Only a page a visitor can see may
    -- match (is_public and not under moderation hold, the same rule as the page read policy), or a
    -- private page's title would be searchable through its public binder (MIC-070). The binder's
    -- own visibility is settled below, the same as every other branch.
    select pg.binder_id from public.binder_pages pg
      join public.binders b on b.id = pg.binder_id
     where b.is_public and btrim(coalesce(p_query, '')) <> ''
       and pg.is_public and not pg.moderation_hold
       and pg.title ilike public.like_pattern(p_query)
    union
    -- Page tags (MIC-068): a typed word that is one of a page's tags ("green", "cozy",
    -- "watercolor"), or a phrase in its one-line description. Same visible-page gate as titles.
    select t.binder_id from public.page_search_tags t
      join public.binder_pages pg on pg.id = t.page_id
      join public.binders b on b.id = t.binder_id
     where b.is_public and btrim(coalesce(p_query, '')) <> ''
       and pg.is_public and not pg.moderation_hold
       and (t.terms @> array[lower(btrim(p_query))]
            or t.description ilike public.like_pattern(p_query))
  ),
  visible as (
    select b.id,
           coalesce(c.like_count, 0)::bigint as likes,
           p.username,
           coalesce(b.made_public_at, b.created_at) as at
      from hits h
      join public.binders b on b.id = h.id
      join public.profiles p on p.id = b.owner_id
      left join public.binder_like_counts c on c.binder_id = b.id
     where b.is_public
       and b.removed_at is null
       and coalesce(b.hidden_from_feeds, false) = false
       and coalesce(p.is_public, true)
       and b.archived_at is null
       and coalesce(b.is_demo, false) = false
  ),
  ranked as (
    select v.*
      from visible v
     where p_after_id is null
        or (v.likes, v.at, v.id) < (p_after_likes, p_after_at, p_after_id)
     order by v.likes desc, v.at desc, v.id desc
     limit least(greatest(p_limit, 0), 100)
  )
  select r.id, r.likes, r.username, r.at,
         public.binder_public_page_count(r.id),
         public.binder_face_page(r.id)
    from ranked r
   order by r.likes desc, r.at desc, r.id desc;
$$;

commit;

-- CRON BEGIN (re-run by state/deploy-page-tags.ps1 once the vault secret exists)
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not enabled: page tags NOT scheduled.';
  elsif not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net not enabled: page tags NOT scheduled.';
  elsif not exists (select 1 from vault.decrypted_secrets where name = 'page_tags_secret') then
    raise notice 'vault secret page_tags_secret missing: page tags NOT scheduled (the deploy script adds it).';
  else
    perform cron.unschedule(j) from unnest(array['page-tags-sweep', 'page-tags-submit', 'page-tags-collect']) as j
      where exists (select 1 from cron.job where jobname = j);
    perform cron.schedule('page-tags-sweep', '30 2 * * *', $j$ select public.page_tags_sweep(); $j$);
    perform cron.schedule('page-tags-submit', '0 3,9,15,21 * * *', $j$
      select net.http_post(
        url     := 'https://piikwvntldytjejxmcla.supabase.co/functions/v1/page-tags',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-page-tags-secret',
                     (select decrypted_secret from vault.decrypted_secrets where name = 'page_tags_secret')),
        body    := '{"mode":"submit"}'::jsonb);
    $j$);
    -- Collect only while a batch is open: no open batch, no call.
    perform cron.schedule('page-tags-collect', '*/15 * * * *', $j$
      select net.http_post(
        url     := 'https://piikwvntldytjejxmcla.supabase.co/functions/v1/page-tags',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-page-tags-secret',
                     (select decrypted_secret from vault.decrypted_secrets where name = 'page_tags_secret')),
        body    := '{"mode":"collect"}'::jsonb)
       where exists (select 1 from public.page_tag_runs where status = 'submitted');
    $j$);
  end if;
end $$;
-- CRON END
