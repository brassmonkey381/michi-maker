/**
 * One-off: re-home guest binders onto the accounts their owners created seconds later.
 *
 * Until 56e656f (2026-10-29) the account sheet opened on "Sign in" for guests, so a guest's Google
 * tap minted a NEW auth user instead of linking onto the anonymous one, and the guest's binder stayed
 * behind on a uid nobody can reach. analytics-studio matched 77 such hops (Aug to Oct 2026) in
 * orphans_full.json: account uid, guest uid, gap in seconds, whether the account's first session
 * landed on /auth-callback, and the guest's binder/card counts from events.
 *
 *   node scripts/zz-rehome-orphans.mjs <orphans.json> [--write]
 *
 * Without --write it only reads. Rules:
 *  - confident rows only: callback_landing true and gap_s <= 20; the rest are listed as SKIP.
 *  - the guest must still be an anonymous auth user with zero identities, the account a
 *    non-anonymous one; both re-checked live.
 *  - only binders with at least one slot move (pages and slots follow by binder_id); an empty
 *    binder is not worth a stranger's shelf space. is_demo rows never move.
 *  - the title gets " (from your first visit)" so someone who rebuilt can tell the two apart.
 *  - binders.owner_id only. Collections / portfolio_entries / saved_cards are tcgscan sync tables
 *    with their own merge rules (AGENTS.md) and are left where they are; counted and reported.
 *  - idempotent: a second run finds no guest binders and moves nothing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { appSql, q } from './lib/michi.mjs';

const file = process.argv[2];
const write = process.argv.includes('--write');
const includeWeak = process.argv.includes('--include-weak');
if (!file) { console.error('usage: node scripts/zz-rehome-orphans.mjs <orphans.json> [--write]'); process.exit(2); }
const rows = JSON.parse(readFileSync(file, 'utf8'));
const NOTE = ' (from your first visit)';

const moved = [];
let totals = { rows: 0, binders: 0, slots: 0 };
for (const r of rows) {
  const tag = `${(r.username ?? r.acc_uid.slice(0, 8)).padEnd(18)} gap=${String(r.gap_s).padStart(2)}s`;
  if (!includeWeak && (!r.callback_landing || r.gap_s > 20)) { console.log(`SKIP  ${tag}  weak match (callback=${r.callback_landing})`); continue; }
  const users = await appSql(`
    select u.id, u.is_anonymous, (select count(*) from auth.identities i where i.user_id = u.id)::int as idents
    from auth.users u where u.id in (${q(r.guest_uid)}::uuid, ${q(r.acc_uid)}::uuid);`);
  const guest = users.find((u) => u.id === r.guest_uid);
  const acc = users.find((u) => u.id === r.acc_uid);
  if (!guest || !acc || !guest.is_anonymous || guest.idents !== 0 || acc.is_anonymous) {
    console.log(`SKIP  ${tag}  identity check failed (guest=${JSON.stringify(guest)}, acc=${JSON.stringify(acc)})`); continue;
  }
  const binders = await appSql(`
    select b.id, b.title, b.is_demo,
      (select count(*) from public.binder_pages p where p.binder_id = b.id)::int as pages,
      (select count(*) from public.binder_slots s left join public.binder_pages sp on sp.id = s.page_id where sp.binder_id = b.id or s.binder_id = b.id)::int as slots
    from public.binders b where b.owner_id = ${q(r.guest_uid)}::uuid order by b.created_at;`);
  const other = await appSql(`
    select (select count(*) from public.collections where user_id = ${q(r.guest_uid)}::uuid)::int as collections,
           (select count(*) from public.portfolio_entries where user_id = ${q(r.guest_uid)}::uuid)::int as entries,
           (select count(*) from public.saved_cards where user_id = ${q(r.guest_uid)}::uuid)::int as saved,
           (select count(*) from public.binders where owner_id = ${q(r.acc_uid)}::uuid)::int as acc_binders;`);
  const movable = binders.filter((b) => !b.is_demo && b.slots > 0);
  const empty = binders.length - movable.length;
  const o = other[0];
  const extra = [o.collections && `${o.collections} collection(s)`, o.entries && `${o.entries} entries`, o.saved && `${o.saved} saved`].filter(Boolean).join(', ');
  if (!movable.length) { console.log(`NONE  ${tag}  ${binders.length} binder(s), none with cards${extra ? ` [left: ${extra}]` : ''}`); continue; }
  const slots = movable.reduce((n, b) => n + b.slots, 0);
  console.log(`${write ? 'MOVE' : 'PLAN'}  ${tag}  ${movable.length} binder(s), ${slots} cards -> account with ${o.acc_binders} binder(s)${empty ? `; ${empty} empty left` : ''}${extra ? ` [left: ${extra}]` : ''}`);
  for (const b of movable) console.log(`        ${b.id}  "${b.title}"  pages=${b.pages} slots=${b.slots}`);
  totals = { rows: totals.rows + 1, binders: totals.binders + movable.length, slots: totals.slots + slots };
  if (!write) continue;
  for (const b of movable) {
    const done = await appSql(`
      update public.binders set owner_id = ${q(r.acc_uid)}::uuid, cap_exempt = true,
        title = case when title like '%' || ${q(NOTE)} then title else left(title, 120 - length(${q(NOTE)})) || ${q(NOTE)} end
      where id = ${q(b.id)}::uuid and owner_id = ${q(r.guest_uid)}::uuid returning id, owner_id, title;`);
    if (done.length !== 1) { console.error(`FAILED to move ${b.id}`); process.exit(1); }
    moved.push({ binder_id: b.id, from: r.guest_uid, to: r.acc_uid, username: r.username, slots: b.slots, title: done[0].title });
  }
}
console.log(`\n${write ? 'moved' : 'would move'}: ${totals.binders} binder(s), ${totals.slots} cards, across ${totals.rows} account(s)`);
if (write && moved.length) {
  const out = file.replace(/\.json$/, '') + `.moved-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(out, JSON.stringify(moved, null, 2));
  console.log(`ledger: ${out}`);
}
