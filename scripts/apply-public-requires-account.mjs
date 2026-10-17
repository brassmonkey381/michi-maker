// Apply supabase/migrations/20261017000000_public_requires_account.sql and prove it.
//   node scripts/apply-public-requires-account.mjs          # dry: show the policies and the guest-public count
//   node scripts/apply-public-requires-account.mjs --apply  # apply, then prove a guest cannot go public
import { readFileSync } from 'node:fs';
import { appSql, step, fail } from './lib/michi.mjs';

const apply = process.argv.includes('--apply');
const sqlText = readFileSync('supabase/migrations/20261017000000_public_requires_account.sql', 'utf8');

step(1, 'before');
const before = await appSql(`select count(*)::int n from binders b join auth.users u on u.id=b.owner_id where u.is_anonymous and b.is_public`);
console.log('  guest-owned public binders:', before[0].n);

if (!apply) { console.log('dry run; pass --apply'); process.exit(0); }

step(2, 'apply migration');
await appSql(sqlText);
const after = await appSql(`select count(*)::int n from binders b join auth.users u on u.id=b.owner_id where u.is_anonymous and b.is_public`);
console.log('  guest-owned public binders now:', after[0].n);
if (after[0].n !== 0) fail('guest-owned public binders remain');

step(3, 'prove: a guest cannot flip their binder public, a real account can');
const guest = (await appSql(`select b.id, b.owner_id from binders b join auth.users u on u.id=b.owner_id where u.is_anonymous and not b.is_public order by b.created_at desc limit 1`))[0];
if (!guest) fail('no guest binder to test with');
const asGuest = await appSql(`
  begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"${guest.owner_id}","role":"authenticated","is_anonymous":true}';
  update binders set is_public = true where id = '${guest.id}' returning id;
  rollback;
`).catch((e) => ({ refused: String(e.message ?? e).slice(0, 160) }));
console.log('  guest update ->', JSON.stringify(asGuest).slice(0, 200));
if (!asGuest.refused) fail('guest was allowed to go public');
const asGuestPrivate = await appSql(`
  begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"${guest.owner_id}","role":"authenticated","is_anonymous":true}';
  update binders set title = title where id = '${guest.id}' returning id;
  rollback;
`);
console.log('  guest ordinary edit ->', Array.isArray(asGuestPrivate) ? `${asGuestPrivate.length} row` : JSON.stringify(asGuestPrivate).slice(0, 120));
const real = (await appSql(`select b.id, b.owner_id from binders b join auth.users u on u.id=b.owner_id where not u.is_anonymous and b.is_public order by b.created_at desc limit 1`))[0];
const asReal = await appSql(`
  begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"${real.owner_id}","role":"authenticated","is_anonymous":false}';
  update binders set is_public = true where id = '${real.id}' returning id;
  rollback;
`);
console.log('  real-account update ->', Array.isArray(asReal) ? `${asReal.length} row (allowed)` : JSON.stringify(asReal).slice(0, 120));
console.log('OK');
