// Apply supabase/migrations/20261017000000_public_requires_account.sql and prove it.
//   node scripts/apply-public-requires-account.mjs          # dry: show the policies and the guest-public count
//   node scripts/apply-public-requires-account.mjs --apply  # apply, then prove a guest cannot go public
import { readFileSync } from 'node:fs';
import { appSql, step, fail } from './lib/michi.mjs';

const apply = process.argv.includes('--apply');
const proveOnly = process.argv.includes('--prove');
const sqlText = readFileSync('supabase/migrations/20261017000000_public_requires_account.sql', 'utf8');

step(1, 'before');
const before = await appSql(`select count(*)::int n from binders b join auth.users u on u.id=b.owner_id where u.is_anonymous and b.is_public`);
console.log('  guest-owned public binders:', before[0].n);

if (!apply && !proveOnly) { console.log('dry run; pass --apply, or --prove to only run the policy proof'); process.exit(0); }

if (!proveOnly) {
step(2, 'apply migration');
await appSql(sqlText);
const after = await appSql(`select count(*)::int n from binders b join auth.users u on u.id=b.owner_id where u.is_anonymous and b.is_public`);
console.log('  guest-owned public binders now:', after[0].n);
if (after[0].n !== 0) fail('guest-owned public binders remain');
}

step(3, 'prove: a guest cannot flip their binder public, a real account can');
// Each attempt runs as the user (role + JWT claims), inside a DO block that records the outcome in
// a transaction-local setting, so a refusal is a result rather than a failed request. The updates
// are no-ops (a value the row already has) so nothing changes if one is allowed.
const attempt = async (uid, anon, update) => {
  const rows = await appSql(`
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated","is_anonymous":${anon}}';
    do $$ begin
      ${update};
      perform set_config('proof.outcome', 'ALLOWED', true);
    exception when others then
      perform set_config('proof.outcome', 'REFUSED: ' || sqlerrm, true);
    end $$;
    select current_setting('proof.outcome', true) as outcome;
  `);
  return rows[0]?.outcome ?? '(no outcome)';
};
const guest = (await appSql(`select b.id, b.owner_id from binders b join auth.users u on u.id=b.owner_id where u.is_anonymous and not b.is_public order by b.created_at desc limit 1`))[0];
if (!guest) fail('no guest binder to test with');
const g1 = await attempt(guest.owner_id, true, `update binders set is_public = true where id = '${guest.id}'`);
console.log('  guest -> public:', g1);
if (!g1.startsWith('REFUSED')) fail('a guest was allowed to go public');
const g2 = await attempt(guest.owner_id, true, `update binders set title = title where id = '${guest.id}'`);
console.log('  guest ordinary edit:', g2);
if (g2 !== 'ALLOWED') fail('a guest cannot edit their own binder');
const real = (await appSql(`select b.id, b.owner_id from binders b join auth.users u on u.id=b.owner_id where not u.is_anonymous and b.is_public order by b.created_at desc limit 1`))[0];
const r1 = await attempt(real.owner_id, false, `update binders set is_public = true where id = '${real.id}'`);
console.log('  real account -> public:', r1);
if (r1 !== 'ALLOWED') fail('a real account was refused');
console.log('OK');
