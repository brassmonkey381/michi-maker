/**
 * Send the free-limit / PRO-trial message through Resend.
 *
 *   node scripts/send-campaign.mjs --to someone@example.com [--send]
 *   node scripts/send-campaign.mjs --all [--send]
 *
 * WITHOUT `--send` it is a dry run: it resolves the recipient, mints the real unsubscribe token,
 * prints the exact message, and sends nothing. Run it that way first, every time.
 *
 * ── The refusals, and why each one exists ─────────────────────────────────────────────────────
 * This is the script that can annoy real people, so it would rather stop than guess:
 *
 *   · A recipient must appear in `campaign_free_limit_reached`. That view is enrolment AND
 *     targeting in one, so a typo'd address, a paying customer, or somebody nowhere near a cap
 *     simply is not there and cannot be mailed by accident.
 *   · `--all` is a separate flag from `--to`. Sending to everybody must be a thing you asked for,
 *     never the default that happens when an argument is missing.
 *   · The four CAN-SPAM footer elements are asserted on the built body, not trusted. Three of the
 *     seven rules live in that footer and it is exactly the part that gets "tidied".
 *
 * Secrets come from tcgscan.secrets and are never printed:
 *   RESEND_API_KEY         (re_...) — create at resend.com/api-keys, add the line yourself
 *   UNSUBSCRIBE_SECRET     created by apply-marketing-consent.ps1
 *   SUPABASE_ACCESS_TOKEN  to read the audience
 */
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';

const FROM = 'michi-maker <hello@tcgscan.ai>';
const REPLY_TO = 'support@michi-maker.com';
const SUBJECT = 'Your michi-maker binders, and the PRO trial that needs no card';
const POSTAL = 'michi-maker\n2350 Saratoga St\nAlameda, CA 94501';

/**
 * Bail with a clear line and a distinct exit code. It THROWS rather than calling process.exit()
 * because exiting while undici still holds a socket trips a libuv assertion on Windows, and a
 * failure that ends in "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" buries the actual
 * reason under a crash that looks like a different bug.
 */
class Bail extends Error {
  constructor(msg, code) {
    super(msg);
    this.code = code;
  }
}
function fail(msg, code = 2) {
  throw new Bail(msg, code);
}

// Split on the FIRST '=' only. A base64 secret can contain '=' padding, and a regex that is
// even slightly wrong here silently truncates a credential instead of erroring.
function secret(name) {
  let raw;
  try {
    raw = readFileSync(SECRETS, 'utf8');
  } catch (e) {
    fail(`cannot read ${SECRETS}: ${e.message}`);
  }
  for (const line of raw.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && line.slice(0, i).trim() === name) return line.slice(i + 1).trim();
  }
  return null;
}

try {

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};

const to = val('--to');
const all = flag('--all');
const live = flag('--send');
if (!to && !all) fail('give --to <email>, or --all to mail the whole audience.');
if (to && all) fail('--to and --all are mutually exclusive.');

const pat = secret('SUPABASE_ACCESS_TOKEN');
const unsubSecret = secret('UNSUBSCRIBE_SECRET');
const resendKey = secret('RESEND_API_KEY');
if (!pat) fail('SUPABASE_ACCESS_TOKEN missing from tcgscan.secrets.');
if (!unsubSecret) fail('UNSUBSCRIBE_SECRET missing. Run apply-marketing-consent.ps1 first.');
if (live && !resendKey) {
  fail('RESEND_API_KEY missing from tcgscan.secrets. Create one at resend.com/api-keys and add\n'
    + '        RESEND_API_KEY=re_...\n'
    + '        as a new line. Dry runs work without it.', 3);
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}

/** Byte-identical to the edge function's sign(). */
function token(userId) {
  const sig = createHmac('sha256', unsubSecret).update(userId).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${userId}.${sig}`;
}

console.log('Step 1: resolving the audience...');
let audience;
try {
  audience = await sql(`
    select user_id, email, username, binders, biggest_binder_pages
    from public.campaign_free_limit_reached order by email
  `);
} catch (e) {
  if (/campaign_free_limit_reached/.test(e.message)) {
    fail('the campaign view does not exist. Run apply-marketing-optout.ps1 first: it enrols '
      + 'accounts and creates the view. Without it nobody is enrolled and an unsubscribe would '
      + 'change nothing observable.', 4);
  }
  fail(`audience: ${e.message}`, 4);
}
console.log(`  OK (${audience.length} in the audience)`);

let targets = audience;
if (to) {
  targets = audience.filter((r) => r.email.toLowerCase() === to.toLowerCase());
  if (!targets.length) {
    console.log(`  ${to} is NOT in campaign_free_limit_reached. Either they are not enrolled,`);
    console.log('  not on the free tier, or not at a cap. Refusing to send.');
    console.log('  The audience is:');
    for (const r of audience) console.log(`    ${r.email}`);
    fail(`${to} is not a valid recipient for this campaign`, 5);
  }
}

console.log('Step 2: building the message...');
function build(r) {
  const hi = r.username ? `Hi ${r.username},` : 'Hi,';
  const body = `${hi}

You have run into michi-maker's free limits: 3 binders, 16 pages each. The PRO
trial lifts those to 12 binders and 40 pages.

It needs no credit card. Nothing renews, there is nothing to cancel, and after
14 days the account goes back to Free on its own.

https://michi-maker.com/plans

If it does not work, reply and tell me what it said. It comes straight to me.

Brian
michi-maker

---
Promotional message from michi-maker. You are getting it because you have an
account with us.

Unsubscribe from product email: https://tcgscan.ai/unsubscribe?t=${token(r.user_id)}
One click, takes effect straight away, no sign-in. Account email (sign-in,
receipts, plan notices) still reaches you.

${POSTAL}
`;
  // CAN-SPAM lives in the footer. Assert it rather than trusting the template above.
  const need = [
    ['ad disclosure (rule 3)', /Promotional message from michi-maker/],
    ['opt-out link (rule 5)', /https:\/\/tcgscan\.ai\/unsubscribe\?t=/],
    ['postal address (rule 4)', /2350 Saratoga St/],
  ];
  for (const [what, re] of need) if (!re.test(body)) fail(`built message is missing its ${what}`, 6);
  return body;
}

for (const r of targets) {
  const body = build(r);
  const headers = {
    'List-Unsubscribe': `<https://tcgscan.ai/unsubscribe?t=${token(r.user_id)}>, `
      + `<mailto:unsubscribe@tcgscan.ai?subject=${token(r.user_id)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };

  if (!live) {
    console.log(`\n--- DRY RUN, nothing sent -> ${r.email} ---`);
    console.log(`From: ${FROM}\nReply-To: ${REPLY_TO}\nTo: ${r.email}\nSubject: ${SUBJECT}`);
    for (const [k, v] of Object.entries(headers)) console.log(`${k}: ${v}`);
    console.log(`\n${body}`);
    continue;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM, to: [r.email], reply_to: REPLY_TO, subject: SUBJECT, text: body, headers,
    }),
  });
  const out = await res.text();
  if (!res.ok) fail(`Resend rejected the send to ${r.email}: ${res.status} ${out.slice(0, 300)}`, 7);
  console.log(`  SENT ${r.email} -> ${JSON.parse(out).id}`);
}

console.log(live ? '\nDONE: sent.' : '\nDONE: dry run. Add --send to actually send.');

} catch (e) {
  console.log(`FAILED: ${e.message}`);
  process.exitCode = e instanceof Bail ? e.code : 1;
}
