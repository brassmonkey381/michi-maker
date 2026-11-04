-- tcgscan-app: BOXES HOLD STACKS, and every unit gets a CODE (owner, 2026-11-03).
--
-- Two decisions from the BiBo rebrand:
--
--   1. Bo stands for Boxes. A stack is a pile of cards that lives INSIDE a box, and one box holds
--      several stacks. Every stack lives in a box. So `kind` gains 'box', and a unit gains
--      `parent_id`: the box a stack sits in. Binders and boxes have no parent.
--
--   2. Codes plus nicknames. Each binder, box and stack is known by a code, "Bi 3", "Bo 2", "S 5",
--      numbered per ACCOUNT and per kind, so "Bi 3" names one binder across all collections. The
--      code is `code`; the prefix comes from `kind`. `name` stays, as the optional nickname
--      ('' = none). A new unit takes the lowest free number by default and the person may pick
--      another free one; a deleted unit's number is free again.
--
-- THE SYNC RULES STILL HOLD (20260827130000): no FK on parent_id (push order is not guaranteed,
-- and a hard FK would poison the batch), no UNIQUE on (user_id, kind, code) (two devices offline
-- can mint the same number; the client resolves it at merge by moving the later one to the next
-- free number), no defaults that disagree with an old client, no updated_at trigger.
--
-- DEPLOY ORDER: apply this BEFORE any client that writes kind 'box' ships, OTA included. A 'box'
-- row against the old CHECK is rejected, and one rejected row fails the whole sync batch.
-- Old clients keep working: they never write 'box', and parent_id / code are nullable.
--
-- THE BACKFILL, idempotent (it only fills what is still empty):
--   a. each collection that has stacks without a box gets ONE box, id 'box-' || md5(user||collection)
--      so a re-run finds the same box, and those stacks move into it;
--   b. every unit without a code is numbered after the highest code its owner already has for that
--      kind, oldest first;
--   Names are left as they are. A default name ("Binder 1", "New stack 2") is hidden by the app,
--   which shows the code instead; clearing it here would blank every title on an app that has not
--   updated yet.
-- Every changed row gets updated_at = now(), so devices take it on their next reconcile.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
alter table public.storage_units drop constraint if exists storage_units_kind_check;
alter table public.storage_units
  add constraint storage_units_kind_check check (kind in ('binder', 'stack', 'box', 'other'));

alter table public.storage_units add column if not exists parent_id text;
alter table public.storage_units add column if not exists code integer;

comment on column public.storage_units.parent_id is
  'The box a stack sits in (storage_units.id, same user). Soft reference: no FK, because sync '
  'pushes one batch and must not be poisoned by ordering. Null for binders, boxes and other.';
comment on column public.storage_units.code is
  'The unit''s number within its owner''s units of the same kind: Bi n (binder), Bo n (box), '
  'S n (stack). Not unique on purpose: two offline devices can mint the same number and the '
  'client moves the later one at merge. Null = not yet numbered (an old client''s row).';

-- ---------------------------------------------------------------------------
-- 2. Backfill
-- ---------------------------------------------------------------------------
-- a. One box per collection for its loose stacks.
insert into public.storage_units (id, user_id, collection_id, name, kind, created_at, updated_at)
select 'box-' || md5(s.user_id::text || '/' || s.collection_id), s.user_id, s.collection_id, '', 'box',
       min(s.created_at), now()
from public.storage_units s
where s.kind = 'stack' and s.parent_id is null
group by s.user_id, s.collection_id
on conflict (user_id, id) do nothing;

update public.storage_units s
set parent_id = 'box-' || md5(s.user_id::text || '/' || s.collection_id), updated_at = now()
where s.kind = 'stack' and s.parent_id is null;

-- b. Codes, oldest first, after the highest code already held.
with numbered as (
  select u.user_id, u.id,
         coalesce((select max(x.code) from public.storage_units x
                   where x.user_id = u.user_id and x.kind = u.kind), 0)
         + row_number() over (partition by u.user_id, u.kind order by u.created_at, u.id) as n
  from public.storage_units u
  where u.code is null and u.kind in ('binder', 'box', 'stack')
)
update public.storage_units s
set code = numbered.n, updated_at = now()
from numbered
where s.user_id = numbered.user_id and s.id = numbered.id;
