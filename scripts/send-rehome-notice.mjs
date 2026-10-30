/**
 * Tell the people whose guest binder came back (2026-10-30) that it is back.
 *
 *   node scripts/send-rehome-notice.mjs state/orphans_full.moved-2026-10-30.json [--to email] [--send]
 *   node scripts/send-rehome-notice.mjs <ledger> --test you@example.com --send
 *
 * `--test <address>` sends ONE real message, the first recipient's text with a [TEST] subject, to
 * that address instead of to anyone in the ledger. It is how the Resend key, the sending domain
 * and the rendering get checked before the 32 go out.
 *
 * WITHOUT `--send` it is a dry run: it resolves every recipient from the ledger, prints each message,
 * and sends nothing. Run it that way first.
 *
 * This is a SERVICE notice about the recipient's own data, not a promotion, so it goes to every
 * account in the ledger whether or not they are enrolled for product email; it still carries the
 * one-click unsubscribe and the postal address, because a footer that is always there is a footer
 * nobody has to remember. The ledger is the audience: an address that is not in it cannot be
 * mailed, and an account that no longer owns its returned binder is skipped.
 *
 * Secrets come from tcgscan.secrets and are never printed:
 *   RESEND_API_KEY, UNSUBSCRIBE_SECRET, SUPABASE_ACCESS_TOKEN
 */
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';
const FROM = 'michi-maker <hello@tcgscan.ai>';
const REPLY_TO = 'support@michi-maker.com';
const SUBJECT = 'The binder you started before signing up is back';
const POSTAL = 'michi-maker\n2350 Saratoga St\nAlameda, CA 94501';
const SUFFIX = ' (from your first visit)';

class Bail extends Error { constructor(msg, code) { super(msg); this.code = code; } }
const fail = (msg, code = 2) => { throw new Bail(msg, code); };

function secret(name) {
  const raw = readFileSync(SECRETS, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && line.slice(0, i).trim() === name) return line.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
  return null;
}

try {
  const args = process.argv.slice(2);
  const file = args.find((a) => a.endsWith('.json'));
  const live = args.includes('--send');
  const toIdx = args.indexOf('--to');
  const only = toIdx >= 0 ? args[toIdx + 1] : null;
  const testIdx = args.indexOf('--test');
  const testTo = testIdx >= 0 ? args[testIdx + 1] : null;
  if (testTo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testTo)) fail('--test needs an email address');
  if (!file) fail('give the moved ledger json');

  const pat = secret('SUPABASE_ACCESS_TOKEN');
  const unsubSecret = secret('UNSUBSCRIBE_SECRET');
  const resendKey = secret('RESEND_API_KEY');
  if (!pat) fail('SUPABASE_ACCESS_TOKEN missing from tcgscan.secrets.');
  if (!unsubSecret) fail('UNSUBSCRIBE_SECRET missing from tcgscan.secrets.');
  if (live && !resendKey) fail('RESEND_API_KEY missing from tcgscan.secrets. Create one at resend.com/api-keys and add RESEND_API_KEY=re_... as a new line. Dry runs work without it.', 3);

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
  const token = (userId) => {
    const sig = createHmac('sha256', unsubSecret).update(userId).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${userId}.${sig}`;
  };

  console.log('Step 1: resolving the audience from the ledger...');
  const ledger = JSON.parse(readFileSync(file, 'utf8'));
  const byAcc = new Map();
  for (const l of ledger) {
    const e = byAcc.get(l.to) ?? { uid: l.to, binders: [] };
    e.binders.push(l);
    byAcc.set(l.to, e);
  }
  const ids = [...byAcc.keys()].map((u) => `'${u}'`).join(',');
  const rows = await sql(`
    select u.id, u.email, p.username,
      (select count(*) from public.binders b where b.owner_id = u.id and b.cap_exempt)::int as returned
    from auth.users u left join public.profiles p on p.id = u.id
    where u.id in (${ids}) order by u.email;`);
  let targets = rows.filter((r) => r.email && r.returned > 0);
  const skipped = rows.length - targets.length;
  if (only) {
    targets = targets.filter((r) => r.email.toLowerCase() === only.toLowerCase());
    if (!targets.length) fail(`${only} is not in the ledger audience; refusing to send.`, 5);
  }
  console.log(`  OK (${targets.length} to mail${skipped ? `, ${skipped} skipped: no email or binder no longer on the account` : ''})`);

  console.log('Step 2: building the messages...');
  function build(r) {
    const mine = byAcc.get(r.id).binders;
    const names = mine.map((b) => `“${b.title.endsWith(SUFFIX) ? b.title.slice(0, -SUFFIX.length) : b.title}”`);
    const cards = mine.reduce((n, b) => n + b.slots, 0);
    const hi = r.username ? `Hi ${r.username},` : 'Hi,';
    const what = mine.length > 1
      ? `the binders you started before you had an account (${names.join(', ')}) were left behind`
      : `the binder you started before you had an account, ${names[0]}, was left behind`;
    const body = `${hi}

Quick note from michi-maker. A bug on our side meant that ${what} when you signed up with Google. That was our mistake, and it is fixed.

${mine.length > 1 ? 'They are' : 'It is'} back on your shelf now, ${cards === 1 ? 'the one card' : `all ${cards} cards`} included, with "(from your first visit)" on the title so you can tell ${mine.length > 1 ? 'them' : 'it'} apart from anything you built since. ${mine.length > 1 ? 'They do' : 'It does'} not count toward your binder limit.

https://michi-maker.com/my-binders

If anything looks wrong, reply to this email. It comes straight to me.

Brian
michi-maker

---
Service notice about your michi-maker account.

Unsubscribe from product email: https://tcgscan.ai/unsubscribe?t=${token(r.id)}
One click, takes effect straight away, no sign-in. Account email (sign-in,
receipts, plan notices) still reaches you.

${POSTAL}
`;
    for (const [what, re] of [['opt-out link', /https:\/\/tcgscan\.ai\/unsubscribe\?t=/], ['postal address', /2350 Saratoga St/]]) {
      if (!re.test(body)) fail(`built message is missing its ${what}`, 6);
    }
    return body;
  }

  if (testTo) {
    // One message, to the tester, with the first recipient's text; the ledger is otherwise untouched.
    targets = [{ ...targets[0], email: testTo }];
    console.log(`  TEST: sending only the first message, to ${testTo}`);
  }
  const subject = testTo ? `[TEST] ${SUBJECT}` : SUBJECT;
  for (const r of targets) {
    const body = build(r);
    const headers = {
      'List-Unsubscribe': `<https://tcgscan.ai/unsubscribe?t=${token(r.id)}>, <mailto:unsubscribe@tcgscan.ai?subject=${token(r.id)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
    if (!live) {
      console.log(`\n--- DRY RUN, nothing sent -> ${r.email} ---\nSubject: ${subject}\n\n${body}`);
      continue;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [r.email], reply_to: REPLY_TO, subject, text: body, headers }),
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
