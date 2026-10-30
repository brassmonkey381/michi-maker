/** One-off: apply supabase/migrations/20261030090000_cap_exempt_binders.sql to the app project. */
import { readFileSync } from 'node:fs';
import { appSql } from './lib/michi.mjs';

const sql = readFileSync(new URL('../supabase/migrations/20261030090000_cap_exempt_binders.sql', import.meta.url), 'utf8');
await appSql(sql);
const trig = await appSql("select tgname from pg_trigger where tgrelid='public.binders'::regclass and not tgisinternal order by 1;");
if (!trig.some((t) => t.tgname === 'binders_guard_cap_exempt')) { console.error('FAILED: guard trigger missing after apply'); process.exit(1); }
console.log('cap_exempt migration applied; triggers:', trig.map((t) => t.tgname).join(', '));
