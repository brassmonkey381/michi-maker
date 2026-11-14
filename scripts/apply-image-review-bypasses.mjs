/**
 * MIC-029 gaps 1 and 5: applies supabase/migrations/20261114120000_image_review_bypasses.sql, then
 * PROVES each bypass is closed against the live database. Every proof runs inside a transaction
 * that ends by raising an exception, so nothing it touches is kept.
 *
 *   --dry   only step 1: what the migration WOULD change, measured inside a rolled-back transaction.
 *
 * Run through state/apply-image-review-bypasses.ps1.
 */
import fs from 'node:fs';
import { APP_REF, ROOT, fail, step } from './lib/michi.mjs';
import { themeBackgroundDataUri, THEME_BACKGROUNDS } from '../src/data/themeBackgrounds.ts';

const DRY = process.argv.includes('--dry');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

/** Run SQL; resolves { ok, rows } or { ok: false, error } instead of exiting. */
async function run(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${APP_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return res.ok ? { ok: true, rows: JSON.parse(text) } : { ok: false, error: text };
}
/** A block that must end in `raise exception '<tag> ...'`: returns the text after the tag. */
async function rolledBack(tag, query) {
  const r = await run(`begin;\n${query}\ncommit;`);
  if (r.ok) fail(`${tag}: the transaction committed, which it must never do`);
  const m = r.error.match(new RegExp(`${tag}([^"\\\\]*)`));
  if (!m) fail(`${tag}: unexpected error: ${r.error.slice(0, 400)}`);
  return m[1].trim();
}

const file = `${ROOT}/supabase/migrations/20261114120000_image_review_bypasses.sql`;
const migration = fs.readFileSync(file, 'utf8');
const body = migration.replace(/^\s*begin;\s*$/m, '').replace(/^\s*commit;\s*$/m, '');

step(1, 'what the migration would change (rolled back)');
const before = await run(`select
  (select count(*) from public.binder_slots where image_review_label = 'procedural') as procedural_before,
  (select count(*) from public.image_reviews where status = 'queued') as queued_before;`);
if (!before.ok) fail(`count refused: ${before.error.slice(0, 300)}`);
console.log(`  before: ${JSON.stringify(before.rows[0])}`);
const dry = await rolledBack('DRY', `${body}
do $$
declare still int; queued int; public_svgs int;
begin
  select count(*) into still from public.binder_slots where image_review_label = 'procedural';
  select count(*) into queued from public.image_reviews where status = 'queued';
  select count(*) into public_svgs from public.image_reviews where status = 'queued' and image_url like 'data:%';
  raise exception 'DRY procedural_after=% queued_after=% of_which_svg_in_public_binders=%', still, queued, public_svgs;
end $$;`);
console.log(`  ${dry}`);
if (DRY) {
  console.log('OK: dry run, nothing changed.');
  process.exit(0);
}

step(2, 'apply the migration');
const applied = await run(migration);
if (!applied.ok) fail(`migration refused: ${applied.error.slice(0, 600)}`);
console.log('  applied');

step(3, 'proof: our own theme backgrounds still auto-approve, a hand-drawn SVG does not');
const ours = THEME_BACKGROUNDS.slice(0, 6).map((t, i) => themeBackgroundDataUri(t.id, { seed: i * 31 + 1 }));
const drawn = ours[0].replace(encodeURIComponent('</svg>'), encodeURIComponent('<path d="M10,10 L200,300 L50,300 Z" fill="#000"/></svg>'));
const lit = (s) => `'${s.replace(/'/g, "''")}'`;
const p3 = await run(`select ${ours.map((u, i) => `public.is_procedural_svg(${lit(u)}) as ours_${i}`).join(', ')},
  public.is_procedural_svg(${lit(drawn)}) as hand_drawn;`);
if (!p3.ok) fail(`proof 3 query refused: ${p3.error.slice(0, 300)}`);
const r3 = p3.rows[0];
const oursOk = Object.entries(r3).filter(([k]) => k.startsWith('ours_')).every(([, v]) => v === true);
if (!oursOk || r3.hand_drawn !== false) fail(`proof 3 FAILED: ${JSON.stringify(r3)}`);
console.log('  PASS: 6 of 6 theme backgrounds approved, hand-drawn SVG not approved');

step(4, 'proof: an owner cannot approve their own picture through the API (rolled back)');
const p4 = await rolledBack('PROOF4', `
do $$
declare sid uuid; own uuid;
begin
  select bs.id, b.owner_id into sid, own
    from public.binder_slots bs
    join public.binders b on b.id = public.slot_binder_id(bs.page_id, bs.binder_id)
    join public.profiles p on p.id = b.owner_id
   where bs.image_url is not null and not coalesce(p.is_admin, false)
   limit 1;
  if sid is null then raise exception 'PROOF4 SKIP: no non-admin slot with a picture'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    update public.binder_slots
       set image_review = case when image_review = 'approved' then 'pending' else 'approved' end
     where id = sid;
  exception when others then
    if sqlerrm like '%managed by the safety check%' then
      raise exception 'PROOF4 PASS: refused (%)', sqlerrm;
    end if;
    raise exception 'PROOF4 FAIL: other error %', sqlerrm;
  end;
  raise exception 'PROOF4 FAIL: the owner changed image_review (% row(s) visible to them)',
    (select count(*) from public.binder_slots where id = sid);
end $$;`);
console.log(`  ${p4}`);
if (!p4.startsWith('PASS')) fail('proof 4 did not pass');

step(5, 'proof: a picture moved from a private binder into a public page gets queued (rolled back)');
const p5 = await rolledBack('PROOF5', `
do $$
declare priv uuid; pub_page uuid; sid uuid; n int;
begin
  select b.id into priv from public.binders b where not b.is_public and b.removed_at is null limit 1;
  select pg.id into pub_page from public.binder_pages pg join public.binders b on b.id = pg.binder_id
   where b.is_public and b.removed_at is null limit 1;
  if priv is null or pub_page is null then raise exception 'PROOF5 SKIP: no private binder or public page'; end if;
  insert into public.binder_slots (binder_id, page_id, slot_type, row_index, col_index, image_url)
  values (priv, null, 'artwork', 900001, 900001, 'https://example.invalid/mic029-proof.png')
  returning id into sid;
  select count(*) into n from public.image_reviews where slot_id = sid;
  if n <> 0 then raise exception 'PROOF5 FAIL: queued while still private (%)', n; end if;
  update public.binder_slots set page_id = pub_page, binder_id = null where id = sid;
  select count(*) into n from public.image_reviews where slot_id = sid and status = 'queued';
  if n = 1 then raise exception 'PROOF5 PASS: queued on the move into the public binder'; end if;
  raise exception 'PROOF5 FAIL: not queued after the move (%)', n;
end $$;`);
console.log(`  ${p5}`);
if (!p5.startsWith('PASS') && !p5.startsWith('SKIP')) fail('proof 5 did not pass');

step(6, 'state after');
const after = await run(`select
  (select count(*) from public.image_reviews where status in ('queued','working')) as reviews_waiting,
  (select count(*) from public.binder_slots where image_review_label = 'procedural') as procedural_approved,
  (select count(*) from public.binder_pages where moderation_hold) as pages_held;`);
console.log(`  ${JSON.stringify(after.ok ? after.rows[0] : after.error.slice(0, 200))}`);
console.log('OK: gaps 1 and 5 closed and proven. Nothing was deleted.');
