/**
 * Why is a binder write being refused? Read-only, and everything it tries is rolled back.
 *
 * The app's saves are optimistic: the screen updates, the write goes out behind it, and a refusal
 * surfaces only as "A change didn't save". The message that would name the cause is on the
 * Supabase side. This reproduces the app's own writes AS A REAL SIGNED-IN USER — role
 * `authenticated` with a genuine uid in request.jwt.claims, so RLS and every trigger apply exactly
 * as they do in the browser — and prints whatever each one raises.
 *
 * NOTHING IS KEPT. The whole probe runs inside a DO block that ends in RAISE EXCEPTION, so the
 * transaction rolls back and the results arrive as the error message. Same pattern as
 * supabase/tests/contest_rls_test.sql, for the same reason: a diagnostic that can leave rows
 * behind is one you hesitate to run when you most need it.
 *
 * Run through diagnose-binder-writes.ps1 (which loads SUPABASE_ACCESS_TOKEN).
 */
const PROJECT_REF = 'piikwvntldytjejxmcla';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.log('FAILED: SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');
  process.exit(2);
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) return { error: text.slice(0, 4000) };
  return { rows: text ? JSON.parse(text) : [] };
}

const line = (s = '') => console.log(s);

try {
  line('WHAT IS INSTALLED');
  const objs = await sql(`
    select
      (select count(*) from pg_proc where proname = 'contest_lock_guard') as contest_guard,
      (select count(*) from pg_proc where proname = 'contest_lock_guard'
         and prosrc like '%coalesce(new, old)%') as guard_is_broken,
      (select count(*) from pg_class where relname = 'contest_finalists') as finalists_table,
      (select count(*) from public.contest_finalists where locked) as locked_binders;
  `);
  line(JSON.stringify(objs.rows?.[0] ?? objs.error, null, 1));

  line();
  line('EVERY TRIGGER THAT CAN REFUSE A BINDER WRITE');
  const trg = await sql(`
    select c.relname as tbl, t.tgname, t.tgenabled = 'O' as enabled, p.proname as fn
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal and c.relname in ('binders','binder_pages','binder_slots')
    order by c.relname, t.tgname;
  `);
  for (const r of trg.rows ?? []) line(`  ${r.tbl.padEnd(13)} ${r.tgname.padEnd(30)} ${r.fn}`);

  line();
  line('THE APP\u2019S OWN WRITES, AS A REAL SIGNED-IN USER (all rolled back)');
  // Every step is its own sub-block: a refusal is recorded and the probe carries on, so one
  // failure does not hide the three behind it.
  const probe = await sql(`
    do $$
    declare
      v_uid    uuid;
      v_binder uuid;
      v_page   uuid;
      v_slot   uuid;
      v_out    text := '';
    begin
      -- Pick a real account BEFORE dropping to its role: auth.users is not readable afterwards.
      select b.owner_id into v_uid
      from public.binders b group by b.owner_id order by count(*) desc limit 1;
      if v_uid is null then select id into v_uid from auth.users order by created_at limit 1; end if;
      v_out := v_out || 'acting as owner ' || coalesce(v_uid::text, '(none found)');

      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

      begin
        insert into public.binders (owner_id, title) values (v_uid, 'write probe') returning id into v_binder;
        v_out := v_out || E'\\n  INSERT binders      : ok';
      exception when others then
        v_out := v_out || E'\\n  INSERT binders      : REFUSED -> ' || sqlstate || ' ' || sqlerrm;
      end;

      if v_binder is not null then
        begin
          insert into public.binder_pages (binder_id, position, rows, cols)
          values (v_binder, 0, 3, 3) returning id into v_page;
          v_out := v_out || E'\\n  INSERT binder_pages : ok';
        exception when others then
          v_out := v_out || E'\\n  INSERT binder_pages : REFUSED -> ' || sqlstate || ' ' || sqlerrm;
        end;
      end if;

      if v_page is not null then
        begin
          insert into public.binder_slots (page_id, row_index, col_index)
          values (v_page, 0, 0) returning id into v_slot;
          v_out := v_out || E'\\n  INSERT binder_slots : ok';
        exception when others then
          v_out := v_out || E'\\n  INSERT binder_slots : REFUSED -> ' || sqlstate || ' ' || sqlerrm;
        end;

        begin
          update public.binder_pages set title = 'probe' where id = v_page;
          v_out := v_out || E'\\n  UPDATE binder_pages : ok';
        exception when others then
          v_out := v_out || E'\\n  UPDATE binder_pages : REFUSED -> ' || sqlstate || ' ' || sqlerrm;
        end;

        begin
          delete from public.binder_slots where id = v_slot;
          v_out := v_out || E'\\n  DELETE binder_slots : ok';
        exception when others then
          v_out := v_out || E'\\n  DELETE binder_slots : REFUSED -> ' || sqlstate || ' ' || sqlerrm;
        end;
      end if;

      if v_binder is not null then
        begin
          delete from public.binders where id = v_binder;
          v_out := v_out || E'\\n  DELETE binders      : ok';
        exception when others then
          v_out := v_out || E'\\n  DELETE binders      : REFUSED -> ' || sqlstate || ' ' || sqlerrm;
        end;
      end if;

      -- Rolls the whole thing back, and carries the report out as the message.
      raise exception '%', v_out;
    end $$;
  `);
  const report = probe.error ?? JSON.stringify(probe.rows);
  const m = report.match(/acting as owner[\s\S]*?(?=\\n\s*"|"}|$)/);
  line(
    (m ? m[0] : report)
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"'),
  );

  line();
  line('If every line above says ok, the database is not what is refusing the save:');
  line('read the browser console for "[michi-maker] cloud save failed: ..." instead.');
} catch (e) {
  line(`DIAGNOSTIC FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
