/**
 * The binder contest's second stage: schema now, snapshot on the day.
 *
 * TWO MODES, because they happen at different times and only one of them is reversible.
 *
 *   (default)    Apply 20260903120000_contest_stage_two.sql — the finalists table, the finals
 *                ballot, the edit-lock triggers and the finals leaderboard. Idempotent DDL, safe
 *                to run any time before the cutoff, and it changes nothing anyone can see: with no
 *                finalist rows the triggers never fire and the app stays in stage 1.
 *
 *   --snapshot   Freeze the field. Ranks every eligible entry by its stage-1 likes, writes the top
 *                N of each category into contest_finalists with the stage-2 window stamped on, and
 *                the edit lock takes hold the moment the rows land. RUN THIS AT THE CUTOFF.
 *
 * WHY THE SNAPSHOT IS A DELIBERATE ACT and not a scheduled job: it is the moment the contest stops
 * being a leaderboard and becomes a result. Ties on the tenth place, an entry we have decided to
 * disqualify, a category with fewer than N entries — all of them want a person looking at the
 * output before the lock goes on. `--snapshot` prints the field and refuses to run twice; re-cut it
 * with `--snapshot --force`, which clears the previous field first (and with it, since votes are
 * gated on a finalist row, any votes already cast).
 *
 * The window instants, the contest id and the field size are READ FROM src/data/contest.ts rather
 * than repeated here. The app and the database must agree about when voting closes, and the way to
 * guarantee that is to have one of them tell the other.
 *
 * Run through apply-contest-stage2.ps1 (which loads SUPABASE_ACCESS_TOKEN).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260903120000_contest_stage_two.sql');
const CONFIG = join(here, '..', 'src', 'data', 'contest.ts');

const args = new Set(process.argv.slice(2));
const SNAPSHOT = args.has('--snapshot');
const FORCE = args.has('--force');

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.log('FAILED: SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');
  process.exit(2);
}

/** Pull one literal out of the config. Throws rather than defaulting: a wrong window is worse than
 *  no run, and a silent fallback here would put a different close time in the database than the
 *  one the app is counting down to. */
function fromConfig(source, key, quoted = true) {
  const re = quoted ? new RegExp(`\\b${key}:\\s*'([^']+)'`) : new RegExp(`\\b${key}:\\s*(\\d+)`);
  const m = source.match(re);
  if (!m) throw new Error(`could not read ${key} from src/data/contest.ts`);
  return quoted ? m[1] : Number(m[1]);
}

const cfgSource = readFileSync(CONFIG, 'utf8');
const CONTEST_ID = fromConfig(cfgSource, 'id');
const FINALS_OPEN = fromConfig(cfgSource, 'finalsOpenAt');
const ENDS_AT = fromConfig(cfgSource, 'endsAt');
const PER_CATEGORY = fromConfig(cfgSource, 'finalistsPerCategory', false);

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

/** A single-quoted SQL literal. Every value here is ours (config or a fixed id), but building SQL
 *  by concatenation without one of these is how the habit gets lost. */
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

try {
  console.log(`contest: ${CONTEST_ID}`);
  console.log(`final:   ${FINALS_OPEN}  ->  ${ENDS_AT}   (top ${PER_CATEGORY} per category)`);
  console.log('');

  if (!SNAPSHOT) {
    console.log('Step 1: applying the stage-two migration...');
    await sql(readFileSync(MIGRATION, 'utf8'));
    console.log('   ok: contest_finalists, contest_finals_votes, the lock triggers and the RPC.');

    const [{ count }] = await sql(
      `select count(*)::int as count from public.contest_finalists where contest = ${lit(CONTEST_ID)};`,
    );
    console.log('');
    console.log(`Finalists currently frozen: ${count}`);
    console.log(
      count === 0
        ? 'Stage 1 is unaffected: with no finalist rows the lock triggers never fire.'
        : 'A field is already frozen. Re-cut it with --snapshot --force if that is wrong.',
    );
    console.log('');
    console.log('DONE. Run again with --snapshot at the cutoff to freeze the field.');
    process.exit(0);
  }

  // ── the snapshot ───────────────────────────────────────────────────────────────────────────
  const existing = await sql(
    `select count(*)::int as count from public.contest_finalists where contest = ${lit(CONTEST_ID)};`,
  );
  if (existing[0].count > 0 && !FORCE) {
    console.log(`FAILED: ${existing[0].count} finalists are already frozen for this contest.`);
    console.log('Re-cut deliberately with --snapshot --force (this clears the field and its votes).');
    process.exit(3);
  }
  if (existing[0].count > 0) {
    console.log(`Step 1: --force, clearing ${existing[0].count} existing finalists and their votes...`);
    await sql(`delete from public.contest_finals_votes where contest = ${lit(CONTEST_ID)};`);
    await sql(`delete from public.contest_finalists where contest = ${lit(CONTEST_ID)};`);
    console.log('   ok');
  }

  console.log('Step 2: ranking stage 1 and freezing the top of each category...');
  // The eligibility gate is character-for-character the one contest_leaderboard applies, so the
  // field that gets frozen is the field people were looking at.
  await sql(`
    with ranked as (
      select e.binder_id,
             e.category,
             b.owner_id,
             (select count(*) from public.binder_likes l where l.binder_id = e.binder_id) as votes,
             e.created_at
      from public.contest_entries e
      join public.binders b on b.id = e.binder_id
      join public.profiles p on p.id = b.owner_id
      where e.contest = ${lit(CONTEST_ID)}
        and b.is_public
        and coalesce(p.is_public, true)
        and b.archived_at is null
        and coalesce(b.is_demo, false) = false
    ),
    seeded as (
      select *,
             row_number() over (
               partition by category
               order by votes desc, created_at asc, binder_id
             ) as seed
      from ranked
    )
    insert into public.contest_finalists
      (contest, category, binder_id, owner_id, seed, stage1_votes, votes_open_at, votes_close_at, locked)
    select ${lit(CONTEST_ID)}, category, binder_id, owner_id, seed, votes,
           ${lit(FINALS_OPEN)}::timestamptz, ${lit(ENDS_AT)}::timestamptz, true
    from seeded
    where seed <= ${PER_CATEGORY};
  `);

  const field = await sql(`
    select f.category, f.seed, f.stage1_votes, b.title, p.username
    from public.contest_finalists f
    join public.binders b on b.id = f.binder_id
    join public.profiles p on p.id = b.owner_id
    where f.contest = ${lit(CONTEST_ID)}
    order by f.category, f.seed;
  `);

  console.log('');
  console.log(`THE FIELD (${field.length} finalists)`);
  let category = null;
  for (const row of field) {
    if (row.category !== category) {
      category = row.category;
      console.log('');
      console.log(`  ${category}`);
    }
    const title = String(row.title ?? 'Untitled').slice(0, 44);
    console.log(
      `    ${String(row.seed).padStart(2)}. ${title.padEnd(44)} @${row.username}  (${row.stage1_votes} votes)`,
    );
  }

  const thin = new Map();
  for (const row of field) thin.set(row.category, (thin.get(row.category) ?? 0) + 1);
  const short = [...thin.entries()].filter(([, n]) => n < PER_CATEGORY);
  if (short.length > 0) {
    console.log('');
    for (const [cat, n] of short) {
      console.log(`  NOTE: ${cat} has only ${n} finalists (fewer than ${PER_CATEGORY} eligible entries).`);
    }
  }

  console.log('');
  console.log('DONE. The field is frozen and every one of these binders is now locked against edits.');
  console.log(`Voting runs to ${ENDS_AT}; the app flips to the Final on its own at ${FINALS_OPEN}.`);
} catch (e) {
  console.log('');
  console.log(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
