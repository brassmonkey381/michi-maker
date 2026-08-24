/**
 * Mint the {{token}} that goes in each recipient's List-Unsubscribe URL.
 *
 * The token is `<user-id>.<base64url(HMAC-SHA256(user-id, UNSUBSCRIBE_SECRET))>` and must match
 * supabase/functions/unsubscribe/index.ts exactly — the same secret, the same message, the same
 * encoding. If the two ever disagree every unsubscribe link in the wild stops working, which is
 * why both sides are one line of the same shape and neither has options.
 *
 * Usage, through the .ps1 wrapper that loads the secret without printing it:
 *   node scripts/unsubscribe-token.mjs               # every consented recipient, as TSV
 *   node scripts/unsubscribe-token.mjs <user-id>     # just one, for a test send
 *
 * The no-argument form reads public.marketing_recipients, which is the ONE definition of who may
 * be mailed. Do not assemble a send from a hand-written query: the view exists so a condition
 * cannot be forgotten.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';

function fail(msg, code = 2) {
  console.log(`FAILED: ${msg}`);
  process.exit(code);
}

function fromSecrets(name) {
  try {
    return readFileSync(SECRETS, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`)))
      .find(Boolean)?.[1] ?? null;
  } catch {
    return null;
  }
}

const secret = process.env.UNSUBSCRIBE_SECRET ?? fromSecrets('UNSUBSCRIBE_SECRET');
if (!secret) fail('UNSUBSCRIBE_SECRET is not set (apply-marketing-consent.ps1 creates it).');

/** Must stay byte-identical to the edge function's sign(). */
function token(userId) {
  const sig = createHmac('sha256', secret).update(userId).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${userId}.${sig}`;
}

const one = process.argv[2];
if (one) {
  if (!/^[0-9a-f-]{36}$/i.test(one)) fail(`not a user id: ${one}`);
  console.log(token(one));
  process.exit(0);
}

const pat = process.env.SUPABASE_ACCESS_TOKEN ?? fromSecrets('SUPABASE_ACCESS_TOKEN');
if (!pat) fail('SUPABASE_ACCESS_TOKEN is not set, needed to read the recipient list.');

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'select user_id, email, username from public.marketing_recipients order by email',
  }),
});
if (!res.ok) fail(`recipient query: ${res.status} ${(await res.text()).slice(0, 300)}`);
const rows = await res.json();

if (!rows.length) {
  console.log('No consented recipients. Nothing to send, and that is the correct result until');
  console.log('someone has actually opted in (see EMAIL-MARKETING.md).');
  process.exit(0);
}
console.log(['email', 'username', 'token'].join('\t'));
for (const r of rows) console.log([r.email, r.username ?? '', token(r.user_id)].join('\t'));
console.error(`\n${rows.length} recipient(s).`);
