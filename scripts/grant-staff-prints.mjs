/**
 * Put one account on the staff allowlist (`staff_accounts`), which exempts it from the included
 * print cap: `record_print_event` skips the cap and `print_credits_left` reports uncapped.
 * Usage: node scripts/grant-staff-prints.mjs <email> [note]
 */
import { appSql, fail, step } from './lib/michi.mjs';

const [email, note = 'owner account: uncapped prints'] = process.argv.slice(2);
if (!email) fail('usage: node scripts/grant-staff-prints.mjs <email> [note]');
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

step(1, 'find the account');
const users = await appSql(`select id from auth.users where email = ${q(email)};`);
if (users.length !== 1) fail(`${users.length} auth users match that email`);
const id = users[0].id;
console.log(`  user ${id}`);

step(2, 'allowlist it');
await appSql(`insert into public.staff_accounts (user_id, note) values (${q(id)}, ${q(note)}) on conflict (user_id) do nothing;`);
const [{ staff }] = await appSql(`select public.is_staff(${q(id)}) as staff;`);
if (!staff) fail('is_staff is still false');
const [{ left }] = await appSql(`select public.print_credits_left(${q(id)}) as left;`);
console.log(`  is_staff: true, print_credits_left: ${left}`);
console.log('DONE: prints are uncapped for this account.');
