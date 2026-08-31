/**
 * FORENSICS, READ ONLY: which binders have pages but no slots, whose they are, and when it happened.
 *
 * THE INCIDENT. binder_slots.source_entry_id shipped as uuid (20260829120000) while every portfolio
 * entry id is a client-minted `lot-...` string, so every slot row carrying a copy-stamp was rejected
 * by Postgres. That alone would only mean "the stamp did not save" — except replaceBinder
 * (src/data/binderRepo.ts) persists a binder by DELETING its pages (cascading their slots) and then
 * inserting the new ones. Delete first, insert second, no transaction: when the insert 400s, the
 * slots are gone and the pages remain. Exactly the reported shape.
 *
 * This script only ASKS. It runs SELECTs, prints counts, and writes nothing.
 *
 * Run through investigate-empty-binders.ps1 at the workspace root (it loads the token silently).
 */
const PROJECT_REF = 'piikwvntldytjejxmcla';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.log('FAILED: SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');
  process.exitCode = 2;
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : [];
}

const rows = (r) => (Array.isArray(r) ? r : []);
const show = (r) => console.log(JSON.stringify(r, null, 2));

try {
  console.log('Step 1: is the column still uuid? (uuid = the destroying path is STILL LIVE)');
  show(
    rows(
      await sql(`
      select data_type
        from information_schema.columns
       where table_schema = 'public' and table_name = 'binder_slots'
         and column_name = 'source_entry_id';`),
    ),
  );

  console.log('');
  console.log('Step 2: every binder with pages but ZERO slots, newest first.');
  // owner_id is shown as a prefix only: enough to count distinct victims and to spot whether this
  // is one account or many, without printing a table of user ids.
  show(
    rows(
      await sql(`
      select left(b.owner_id::text, 8) as owner_prefix,
             b.title,
             b.created_at,
             b.updated_at,
             count(distinct p.id) as pages
        from public.binders b
        join public.binder_pages p on p.binder_id = b.id
        left join public.binder_slots s on s.page_id = p.id
       where b.removed_at is null
       group by b.id, b.owner_id, b.title, b.created_at, b.updated_at
      having count(s.id) = 0
       order by b.updated_at desc
       limit 100;`),
    ),
  );

  console.log('');
  console.log('Step 3: how many owners, and how many of those binders were touched since the');
  console.log('        stamp shipped (2026-08-29). A binder created empty and never filled is');
  console.log('        indistinguishable from one emptied on its creation day - the split below');
  console.log('        is the honest proxy: an emptied binder was UPDATED long after it was MADE.');
  show(
    rows(
      await sql(`
      with empty as (
        select b.id, b.owner_id, b.created_at, b.updated_at
          from public.binders b
          join public.binder_pages p on p.binder_id = b.id
          left join public.binder_slots s on s.page_id = p.id
         where b.removed_at is null
         group by b.id, b.owner_id, b.created_at, b.updated_at
        having count(s.id) = 0
      )
      select count(*)                                                             as empty_binders,
             count(distinct owner_id)                                             as owners,
             count(*) filter (where updated_at > created_at + interval '5 minutes') as edited_then_emptied,
             count(*) filter (where updated_at >= '2026-08-29')                    as touched_since_stamp,
             min(updated_at)                                                       as earliest_touch,
             max(updated_at)                                                       as latest_touch
        from empty;`),
    ),
  );

  console.log('');
  console.log('Step 4: the same binders, but only those that look EMPTIED rather than never-filled');
  console.log('        (edited well after creation) - the likely victim list.');
  show(
    rows(
      await sql(`
      select left(b.owner_id::text, 8) as owner_prefix,
             b.title,
             b.created_at,
             b.updated_at,
             count(distinct p.id) as pages
        from public.binders b
        join public.binder_pages p on p.binder_id = b.id
        left join public.binder_slots s on s.page_id = p.id
       where b.removed_at is null
       group by b.id, b.owner_id, b.title, b.created_at, b.updated_at
      having count(s.id) = 0
         and b.updated_at > b.created_at + interval '5 minutes'
       order by b.updated_at desc
       limit 100;`),
    ),
  );

  console.log('');
  console.log('Step 5: is there anywhere to recover FROM? Any table holding past slot state.');
  show(
    rows(
      await sql(`
      select table_name
        from information_schema.tables
       where table_schema = 'public'
         and (table_name like '%slot%' or table_name like '%snapshot%'
              or table_name like '%history%' or table_name like '%audit%')
       order by table_name;`),
    ),
  );

  console.log('');
  console.log('Step 6: how much is at risk right now - stamped pockets that would be written back.');
  show(
    rows(
      await sql(`
      select count(*) as slots_with_stamp,
             count(*) filter (where source_entry_id::text like 'lot-%') as lot_shaped
        from public.binder_slots
       where source_entry_id is not null;`),
    ),
  );

  console.log('');
  console.log('Step 7: RECOVERY. binder_pdf_snapshots is the only table that has ever held a');
  console.log('        second copy of a binder layout. Does the emptied binder have one?');
  show(
    rows(
      await sql(`
      select left(b.owner_id::text, 8) as owner_prefix,
             b.title,
             s.updated_at as snapshot_taken,
             s.sheets,
             (s.binder_json is not null) as has_layout,
             length(coalesce(s.binder_json::text, '')) as layout_bytes
        from public.binders b
        join public.binder_pdf_snapshots s on s.binder_id::text = b.id::text
       where b.title = 'Private Pages Only'
       order by s.updated_at desc
       limit 20;`),
    ),
  );

  console.log('');
  console.log('Step 8: the bulk touch. Most empty binders share ONE updated_at to the microsecond,');
  console.log('        which is a script, not a person - so their timestamps date nothing.');
  show(
    rows(
      await sql(`
      select updated_at, count(*) as binders, count(distinct owner_id) as owners
        from public.binders
       where removed_at is null
       group by updated_at
      having count(*) > 3
       order by count(*) desc
       limit 5;`),
    ),
  );

  console.log('');
  console.log('Step 9: THE SIGNATURE. The old save deleted every page and re-inserted it, so a');
  console.log('        binder it emptied has pages whose created_at is LATER than the binder');
  console.log('        itself. A binder that was simply never filled has pages as old as it is.');
  console.log('        This tells the two apart, which updated_at cannot.');
  show(
    rows(
      await sql(`
      select left(b.owner_id::text, 8) as owner_prefix,
             b.title,
             b.created_at   as binder_made,
             min(p.created_at) as pages_rewritten,
             count(distinct p.id) as pages
        from public.binders b
        join public.binder_pages p on p.binder_id = b.id
        left join public.binder_slots s on s.page_id = p.id
       where b.removed_at is null
       group by b.id, b.owner_id, b.title, b.created_at
      having count(s.id) = 0
         and min(p.created_at) > b.created_at + interval '1 minute'
       order by min(p.created_at) desc;`),
    ),
  );

  console.log('');
  console.log('Step 10: the same signature on binders that still HAVE slots - a save that was');
  console.log('         rewritten and survived. Only the count matters: it is the population');
  console.log('         that went through the dangerous path and came out whole.');
  show(
    rows(
      await sql(`
      with rewritten as (
        select b.id, b.owner_id
          from public.binders b
          join public.binder_pages p on p.binder_id = b.id
         where b.removed_at is null
         group by b.id, b.owner_id, b.created_at
        having min(p.created_at) > b.created_at + interval '1 minute'
      )
      select count(*) as binders_rewritten, count(distinct owner_id) as owners
        from rewritten;`),
    ),
  );

  console.log('');
  console.log('DONE (nothing was written).');
} catch (e) {
  console.log(`FAILED: ${e.message}`);
  process.exitCode = 1;
}
