-- MIC-029, PART 1 OF 2: the light image safety check's queue. Changes NOTHING anyone sees.
--
-- Owner, 2026-11-09 (after explicit images were put in a public binder): check custom images only
-- when it matters (a binder going public, an image added to a public binder) with the smallest
-- Claude model; flagged images stay owner-only and wait in Studio; never auto-delete. Part 2
-- (20261109120100_image_review_policy.sql) is what hides unapproved images from visitors. It is
-- applied only after the backfill has labelled the existing public images, so they do not blank.
--
-- 1. binder_slots.image_review: pending | approved | flagged | unchecked (+ when, and the label).
-- 2. public.image_reviews: the queue and the log (one row per check), Studio's review list.
-- 3. Triggers: an image added or changed in a slot is pending again; a binder going public, or an
--    image landing in a public binder, queues a check.
-- 4. pg_cron drains the queue every minute through the image-review edge function (guarded like
--    the scan janitor: needs pg_net and the vault secret image_review_secret).

-- ── 1. the slot's verdict ────────────────────────────────────────────────────────────────────────
alter table public.binder_slots
  add column if not exists image_review text not null default 'pending'
    check (image_review in ('pending', 'approved', 'flagged', 'unchecked')),
  add column if not exists image_reviewed_at timestamptz,
  add column if not exists image_review_label text;

comment on column public.binder_slots.image_review is
  'MIC-029: the safety check''s verdict on image_url. Visitors see an image only when approved '
  '(policy in 20261109120100). pending until checked; flagged = suggestive or explicit, held for '
  'Studio review; unchecked = the image could not be fetched or classified, also held.';

-- ── 2. the queue and the log ─────────────────────────────────────────────────────────────────────
create table if not exists public.image_reviews (
  id            bigint generated always as identity primary key,
  slot_id       uuid not null references public.binder_slots(id) on delete cascade,
  binder_id     uuid not null references public.binders(id) on delete cascade,
  owner_id      uuid not null,
  image_url     text not null,
  status        text not null default 'queued' check (status in ('queued', 'working', 'done', 'error')),
  -- held: not judged unsafe itself, but on the same page as an explicit image (a sliced picture's
  -- harmless-looking pieces), so a person looks at the whole page.
  label         text check (label in ('safe', 'suggestive', 'explicit', 'refused', 'unchecked', 'held')),
  minor_concern boolean,
  reason        text,
  model         text,
  attempts      integer not null default 0,
  created_at    timestamptz not null default now(),
  checked_at    timestamptz,
  -- Studio's decision on a flagged image: approved (shown) or removed (cleared, file deleted).
  decision      text check (decision in ('approved', 'removed')),
  decided_by    uuid,
  decided_at    timestamptz,
  -- When the admin was emailed about this flag (batched; see image-review).
  notified_at   timestamptz
);
create index if not exists image_reviews_queue on public.image_reviews (status, created_at) where status in ('queued', 'error');
create index if not exists image_reviews_open on public.image_reviews (created_at desc) where decision is null and label in ('suggestive', 'explicit', 'refused', 'unchecked', 'held');

-- The last time the admin was emailed, so flags batch into at most one email an hour.
create table if not exists public.admin_notices (
  kind         text primary key,
  last_sent_at timestamptz not null
);
alter table public.admin_notices enable row level security; -- no policies: service role only
-- One open check per slot and image: re-queueing the same image is a no-op.
create unique index if not exists image_reviews_one_open on public.image_reviews (slot_id, image_url) where status in ('queued', 'working');

alter table public.image_reviews enable row level security;
-- Studio only. The edge function uses the service role and bypasses RLS.
drop policy if exists "Admins read image reviews" on public.image_reviews;
create policy "Admins read image reviews"
  on public.image_reviews for select to authenticated
  using (public.is_admin());
drop policy if exists "Admins decide image reviews" on public.image_reviews;
create policy "Admins decide image reviews"
  on public.image_reviews for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── 3. triggers ──────────────────────────────────────────────────────────────────────────────────
-- The binder a slot belongs to (page slots; tray slots carry binder_id directly).
create or replace function public.slot_binder_id(p_page_id uuid, p_binder_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(p_binder_id, (select binder_id from public.binder_pages where id = p_page_id));
$$;

create or replace function public.image_review_enqueue(p_slot_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  select bs.id, bs.image_url, b.id as binder_id, b.owner_id, b.is_public, b.removed_at
    into s
    from public.binder_slots bs
    join public.binders b on b.id = public.slot_binder_id(bs.page_id, bs.binder_id)
   where bs.id = p_slot_id;
  if s.id is null or s.image_url is null or not s.is_public or s.removed_at is not null then
    return;
  end if;
  insert into public.image_reviews (slot_id, binder_id, owner_id, image_url)
  values (s.id, s.binder_id, s.owner_id, s.image_url)
  on conflict do nothing;
end $$;

-- A new or changed image is unreviewed again; in a public binder it is queued at once.
create or replace function public.binder_slots_image_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.image_url is distinct from old.image_url then
    if new.image_url is null then
      new.image_review := 'approved'; -- a card slot: nothing to check
    else
      new.image_review := 'pending';
      new.image_reviewed_at := null;
      new.image_review_label := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists binder_slots_image_review on public.binder_slots;
create trigger binder_slots_image_review
  before insert or update of image_url on public.binder_slots
  for each row execute function public.binder_slots_image_review();

create or replace function public.binder_slots_image_enqueue()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.image_url is not null and new.image_review = 'pending' then
    perform public.image_review_enqueue(new.id);
  end if;
  return null;
end $$;
drop trigger if exists binder_slots_image_enqueue on public.binder_slots;
create trigger binder_slots_image_enqueue
  after insert or update of image_url on public.binder_slots
  for each row execute function public.binder_slots_image_enqueue();

-- A binder going public queues every image of it that is not approved yet.
create or replace function public.binders_image_enqueue()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
begin
  if new.is_public and not coalesce(old.is_public, false) then
    for sid in
      select bs.id from public.binder_slots bs
       where public.slot_binder_id(bs.page_id, bs.binder_id) = new.id
         and bs.image_url is not null and bs.image_review <> 'approved'
    loop
      perform public.image_review_enqueue(sid);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists binders_image_enqueue on public.binders;
create trigger binders_image_enqueue
  after update of is_public on public.binders
  for each row execute function public.binders_image_enqueue();

-- Card slots never need a check: mark existing ones approved so only images wait.
update public.binder_slots set image_review = 'approved' where image_url is null and image_review <> 'approved';

-- The backfill: every image already in a public binder is queued once. Images in private binders
-- stay pending and are queued when (if) their binder goes public.
insert into public.image_reviews (slot_id, binder_id, owner_id, image_url)
select bs.id, b.id, b.owner_id, bs.image_url
  from public.binder_slots bs
  join public.binders b on b.id = public.slot_binder_id(bs.page_id, bs.binder_id)
 where bs.image_url is not null and b.is_public and b.removed_at is null
on conflict do nothing;

-- ── 3b. a flagged picture makes its PAGE private, and the flag follows the picture ──────────────
-- Owner, 2026-11-09: "make sure they are never able to show the suggestive content in public binder
-- pages ... follow the flagged art and force any page with it to be PRIVATE, just the page itself."
--
-- binder_pages.moderation_hold: set while any image on the page is flagged or unchecked. Visitors
-- see a page only when is_public AND NOT moderation_hold (part 2's policy), so the rest of the binder
-- stays public; the owner's own is_public choice is never overwritten. Only moderation (Studio, the
-- service role) can change it: the owner cannot lift a hold.
alter table public.binder_pages add column if not exists moderation_hold boolean not null default false;
comment on column public.binder_pages.moderation_hold is
  'MIC-029: true while an image on this page is flagged or unchecked by the safety check. Hides the '
  'page from visitors (policy in 20261109120100); the owner still sees it. Managed by moderation.';

create or replace function public.binder_pages_guard_moderation_hold()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.moderation_hold is distinct from old.moderation_hold then
    if (select auth.uid()) is not null and not public.is_admin() then
      raise exception 'moderation_hold is managed by moderation';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists binder_pages_guard_moderation_hold on public.binder_pages;
create trigger binder_pages_guard_moderation_hold
  before update of moderation_hold on public.binder_pages
  for each row execute function public.binder_pages_guard_moderation_hold();

-- Recompute one page's hold from its images.
create or replace function public.refresh_page_hold(p_page_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.binder_pages pg
     set moderation_hold = exists (
           select 1 from public.binder_slots bs
            where bs.page_id = pg.id and bs.image_url is not null
              and bs.image_review in ('flagged', 'unchecked'))
   where pg.id = p_page_id
     and pg.moderation_hold is distinct from exists (
           select 1 from public.binder_slots bs
            where bs.page_id = pg.id and bs.image_url is not null
              and bs.image_review in ('flagged', 'unchecked'));
$$;

-- The hold follows the image: a verdict, a move to another page, a removed image or a deleted slot
-- re-checks the pages involved.
create or replace function public.binder_slots_page_hold()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.page_id is not null then
    perform public.refresh_page_hold(old.page_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.page_id is not null
     and (tg_op = 'INSERT' or new.page_id is distinct from old.page_id) then
    perform public.refresh_page_hold(new.page_id);
  end if;
  if tg_op = 'UPDATE' and new.page_id is not null and new.page_id = old.page_id then
    perform public.refresh_page_hold(new.page_id);
  end if;
  return null;
end $$;
drop trigger if exists binder_slots_page_hold on public.binder_slots;
create trigger binder_slots_page_hold
  after insert or delete or update of image_url, image_review, page_id on public.binder_slots
  for each row execute function public.binder_slots_page_hold();

-- Fingerprints of every flagged picture, so a re-upload (a new random path), a copy into another
-- binder or a move is recognised without asking the model again. sha256 matches the exact file;
-- dhash (64-bit difference hash, 16 hex chars) matches the same picture re-encoded or resized.
-- status: flagged (blocks matches), approved (Studio cleared it), removed (Studio removed it; still
-- blocks re-uploads).
create table if not exists public.flagged_images (
  id         bigint generated always as identity primary key,
  sha256     text not null,
  dhash      text,
  label      text not null,
  status     text not null default 'flagged' check (status in ('flagged', 'approved', 'removed')),
  first_review_id bigint references public.image_reviews(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists flagged_images_sha on public.flagged_images (sha256);
alter table public.flagged_images enable row level security;
drop policy if exists "Admins read flagged images" on public.flagged_images;
create policy "Admins read flagged images"
  on public.flagged_images for select to authenticated
  using (public.is_admin());

-- image_reviews remembers the file's fingerprint too (for Studio's decisions).
alter table public.image_reviews add column if not exists sha256 text;
alter table public.image_reviews add column if not exists dhash text;

-- ── 4. drain the queue every minute ──────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not enabled: image review NOT scheduled.';
  elsif not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net not enabled: image review NOT scheduled. Enable pg_net, add the vault '
                 'secret image_review_secret, and re-run this block.';
  elsif not exists (select 1 from vault.decrypted_secrets where name = 'image_review_secret') then
    raise notice 'vault secret image_review_secret missing: image review NOT scheduled.';
  else
    perform cron.unschedule('image-review')
      where exists (select 1 from cron.job where jobname = 'image-review');
    perform cron.schedule('image-review', '* * * * *', $j$
      select net.http_post(
        url     := 'https://piikwvntldytjejxmcla.supabase.co/functions/v1/image-review',
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'x-image-review-secret',
                     (select decrypted_secret from vault.decrypted_secrets where name = 'image_review_secret')),
        body    := '{}'::jsonb);
    $j$);
  end if;
end $$;
