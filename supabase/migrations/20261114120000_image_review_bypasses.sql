-- MIC-029 audit 2026-11-14, gaps 1 and 5 (owner "fix all art check gaps").
--
-- 1. OWNER SELF-APPROVE. binder_slots.image_review was writable by the owner through the API, so a
--    picture could be marked approved in a private binder and then made public unchecked. Now a
--    signed-in non-admin cannot change image_review / image_reviewed_at / image_review_label unless
--    image_url changes in the same write (which resets them to pending). The safety check (service
--    role) and admins still can. Mirrors binder_pages_guard_moderation_hold.
-- 5a. PROCEDURAL BYPASS. Any data:image/svg without image/href/url() was auto-approved, so a
--    hand-drawn vector picture skipped the check. Now only the exact shape our theme backgrounds
--    take (src/data/proceduralSvgGrammar.ts, same pattern) is auto-approved. Slots approved as
--    'procedural' that do not match go back to pending and into the queue (hidden from visitors
--    until checked; a person decides if the check cannot read them). Never deleted.
-- 5b. MOVED SLOTS. A pending picture moved from a private binder into a public one was never queued.
--    The enqueue trigger now also fires on page_id / binder_id changes.

begin;

create or replace function public.url_decode(p text)
returns text language sql immutable strict set search_path = '' as $$
  select convert_from(coalesce(string_agg(
           case when t.m[1] ~ '^%[0-9A-Fa-f]{2}$' then decode(substr(t.m[1], 2, 2), 'hex')
                else convert_to(t.m[1], 'UTF8') end, ''::bytea order by t.n), ''::bytea), 'UTF8')
    from regexp_matches(p, '(%[0-9A-Fa-f]{2}|[^%]+|%)', 'g') with ordinality as t(m, n);
$$;

create or replace function public.is_procedural_svg(p_url text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  s text;
begin
  if p_url is null or left(p_url, 19) <> 'data:image/svg+xml,' or length(p_url) > 200000 then
    return false;
  end if;
  begin
    s := public.url_decode(substr(p_url, 20));
  exception when others then
    return false;
  end;
  return s ~ '^<svg xmlns="http://www\.w3\.org/2000/svg" viewBox="0 0 -?[0-9]+(?:\.[0-9]+)? -?[0-9]+(?:\.[0-9]+)?" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g-[a-z0-9-]+" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#[0-9a-fA-F]{3,8}"/><stop offset="1" stop-color="#[0-9a-fA-F]{3,8}"/></linearGradient></defs><rect width="-?[0-9]+(?:\.[0-9]+)?" height="-?[0-9]+(?:\.[0-9]+)?" fill="url\(#g-[a-z0-9-]+\)"/>(?:<path d="(?:M0,-1 C0\.55,-0\.35 0\.5,0\.35 0,1 C-0\.5,0\.35 -0\.55,-0\.35 0,-1 Z|M0,-1 C0\.7,-0\.3 0\.7,0\.5 0,1 C-0\.7,0\.5 -0\.7,-0\.3 0,-1 Z|M-1,0\.2 Q-0\.5,-0\.7 0,0\.2 Q0\.5,1\.1 1,0\.2 L1,1 L-1,1 Z|M-0\.15,-1 L0\.35,-0\.15 L0\.05,-0\.15 L0\.25,1 L-0\.35,0\.1 L-0\.02,0\.1 Z|M0,-1 L0\.75,-0\.1 L0\.45,1 L-0\.45,1 L-0\.75,-0\.1 Z|M0,-1 L0\.28,0\.9 L0,1 L-0\.28,0\.9 Z|M0,-1 L0\.18,-0\.18 L1,0 L0\.18,0\.18 L0,1 L-0\.18,0\.18 L-1,0 L-0\.18,-0\.18 Z|M0,-1 C0\.55,-1 1,-0\.55 1,0 C1,0\.55 0\.55,1 0,1 C-0\.55,1 -1,0\.55 -1,0 C-1,-0\.55 -0\.55,-1 0,-1 Z|M0,-1 L0\.22,-0\.31 L0\.95,-0\.31 L0\.36,0\.12 L0\.59,0\.81 L0,0\.38 L-0\.59,0\.81 L-0\.36,0\.12 L-0\.95,-0\.31 L-0\.22,-0\.31 Z|M0,-1 L0\.87,-0\.5 L0\.87,0\.5 L0,1 L-0\.87,0\.5 L-0\.87,-0\.5 Z|M0,-1 C0\.62,-0\.55 0\.62,0\.55 0,1 C-0\.62,0\.55 -0\.62,-0\.55 0,-1 Z|M0,-0\.3 L1,0\.5 L0\.5,0\.55 L0,0\.1 L-0\.5,0\.55 L-1,0\.5 Z|M0,-1 L0\.65,0 L0,1 L-0\.65,0 Z)" transform="translate\(-?[0-9]+(?:\.[0-9]+)? -?[0-9]+(?:\.[0-9]+)?\) rotate\(-?[0-9]+(?:\.[0-9]+)?\) scale\(-?[0-9]+(?:\.[0-9]+)?\)" fill="#[0-9a-fA-F]{3,8}" opacity="-?[0-9]+(?:\.[0-9]+)?"/>)*</svg>$';
end $$;

create or replace function public.binder_slots_image_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.image_url is not distinct from old.image_url then
    if (new.image_review, new.image_reviewed_at, new.image_review_label)
         is distinct from (old.image_review, old.image_reviewed_at, old.image_review_label)
       and (select auth.uid()) is not null and not public.is_admin() then
      raise exception 'image_review is managed by the safety check';
    end if;
    return new;
  end if;
  if new.image_url is null then
    new.image_review := 'approved'; -- a card slot: nothing to check
  elsif public.is_procedural_svg(new.image_url) then
    new.image_review := 'approved';
    new.image_reviewed_at := now();
    new.image_review_label := 'procedural';
  else
    new.image_review := 'pending';
    new.image_reviewed_at := null;
    new.image_review_label := null;
  end if;
  return new;
end $$;
drop trigger if exists binder_slots_image_review on public.binder_slots;
create trigger binder_slots_image_review
  before insert or update on public.binder_slots
  for each row execute function public.binder_slots_image_review();

drop trigger if exists binder_slots_image_enqueue on public.binder_slots;
create trigger binder_slots_image_enqueue
  after insert or update of image_url, page_id, binder_id on public.binder_slots
  for each row execute function public.binder_slots_image_enqueue();

-- 5a: re-check procedural approvals that are not our own backgrounds. The safety check writes
-- these columns as service role; this migration runs without a signed-in user, so the guard allows it.
update public.binder_slots
   set image_review = 'pending', image_reviewed_at = null, image_review_label = null
 where image_review_label = 'procedural' and not public.is_procedural_svg(image_url);

-- Queue every pending picture already sitting in a public binder (moved there before 5b, or reset
-- just above). image_review_enqueue skips private and removed binders; on conflict keeps one open row.
select public.image_review_enqueue(bs.id)
  from public.binder_slots bs
 where bs.image_url is not null and bs.image_review = 'pending';

commit;
