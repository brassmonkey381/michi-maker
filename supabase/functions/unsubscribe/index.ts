/**
 * unsubscribe — turns off product email for one account, with no session and no sign-in.
 *
 *   POST  ?t=<token>   body: List-Unsubscribe=One-Click   → RFC 8058 one-click, 200, no page read
 *   GET   ?t=<token>                                      → unsubscribes, shows a confirmation
 *   POST  ?t=<token>   body: action=resubscribe           → undoes it (from that page's button)
 *
 * ── Why this exists at all ────────────────────────────────────────────────────────────────────
 * Both privacy policies now promise "a one-click unsubscribe that takes effect immediately and
 * for good". `List-Unsubscribe-Post: List-Unsubscribe=One-Click` in a message is a promise to the
 * RECIPIENT'S MAIL CLIENT that it may unsubscribe them without asking them anything, so shipping
 * that header without a working endpoint behind it is worse than shipping no header: it advertises
 * an exit that silently does nothing. This is that endpoint.
 *
 * ── Deployment: JWT verification MUST be off ──────────────────────────────────────────────────
 * Gmail POSTs this URL directly. There is no Authorization header, no apikey, and no cookie in
 * that request, so the function has to be deployed with `--no-verify-jwt`. With verification on,
 * every one-click unsubscribe in the world fails with a 401 that nobody ever sees.
 *
 * ── The token, and why it is signed ───────────────────────────────────────────────────────────
 * Format: `<uuid>.<base64url(HMAC-SHA256(uuid, UNSUBSCRIBE_SECRET))>`.
 *
 * The obvious design is to put the user id in the link and update that row. That hands anyone who
 * can guess a uuid the ability to unsubscribe a stranger, and worse, it turns the endpoint into a
 * membership oracle: try an id, see whether it 200s, learn whether that account exists. The HMAC
 * closes both. It is verified in constant time, and an unrecognised token gets the same neutral
 * page as a valid one so the response reveals nothing either way.
 *
 * Tokens deliberately DO NOT EXPIRE. Someone who finds a two-year-old message in a search must
 * still be able to get out of the list; an expired unsubscribe link is a broken promise with extra
 * steps.
 *
 * ── GET unsubscribes too, and that is on purpose ──────────────────────────────────────────────
 * A GET that changes state is normally wrong, and mail scanners do prefetch links, so this will
 * occasionally unsubscribe someone who never clicked. That trade is deliberate: the alternative is
 * a confirmation page, which makes the visible link a TWO-click unsubscribe and is precisely the
 * dark pattern the policy language rules out. The prefetch case is repaired by the button on the
 * confirmation page, which POSTs (so it cannot itself be triggered by a scanner).
 *
 * Secrets: UNSUBSCRIBE_SECRET, APP_SECRET_KEY (see _shared/keys.ts).
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { secretKey } from '../_shared/keys.ts';

const SECRET = Deno.env.get('UNSUBSCRIBE_SECRET') ?? '';

const HTML = {
  'Content-Type': 'text/html; charset=utf-8',
  // No indexing, and no referrer: the token is in the URL and must not leak to anything the
  // confirmation page happens to link to.
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

function b64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(userId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(userId)));
}

/** Length-safe, branch-free comparison. A fast reject on a wrong signature is a timing oracle. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The user id a token vouches for, or null. Never throws, never distinguishes failure modes. */
async function userIdFrom(token: string): Promise<string | null> {
  if (!SECRET) return null; // misconfigured: refuse everything rather than trust anything
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const id = token.slice(0, dot);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return sameString(await sign(id), token.slice(dot + 1)) ? id : null;
}

function page(title: string, body: string, token?: string): Response {
  // Self-contained: an email client's browser may block everything external.
  const undo = token
    ? `<form method="post" action="?t=${encodeURIComponent(token)}">
         <input type="hidden" name="action" value="resubscribe">
         <button type="submit">That was a mistake, turn it back on</button>
       </form>`
    : '';
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${title}</title><style>
       body{font:16px/1.6 system-ui,sans-serif;max-width:34rem;margin:12vh auto;padding:0 1.5rem;
            color:#1c1c1e;background:#fff}
       h1{font-size:1.35rem;margin:0 0 .75rem}
       p{margin:0 0 1rem;color:#3a3a3c}
       button{font:inherit;padding:.6rem 1.1rem;border:1px solid #c7c7cc;border-radius:999px;
              background:#f2f2f7;cursor:pointer}
       @media(prefers-color-scheme:dark){body{background:#000;color:#f2f2f7}p{color:#aeaeb2}
         button{background:#1c1c1e;color:#f2f2f7;border-color:#3a3a3c}}
     </style></head><body><h1>${title}</h1>${body}${undo}</body></html>`,
    { status: 200, headers: HTML },
  );
}

async function setConsent(userId: string, consent: boolean): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) return false;
  const db = createClient(url, secretKey(), { auth: { persistSession: false } });
  const { error } = await db.rpc('set_marketing_consent', {
    p_user_id: userId, p_consent: consent,
  });
  if (error) console.error('set_marketing_consent failed', error.message);
  return !error;
}

Deno.serve(async (req: Request) => {
  const token = new URL(req.url).searchParams.get('t') ?? '';
  const userId = await userIdFrom(token);

  if (req.method === 'POST') {
    const form = new URLSearchParams(await req.text());

    // RFC 8058: the mail client sends exactly this body, reads only the STATUS, and shows the
    // user nothing. Answer 200 even for a bad token — a non-2xx makes Gmail report a failure for
    // something the reader cannot act on, and a token we cannot verify is our problem, not theirs.
    if (form.get('List-Unsubscribe') === 'One-Click') {
      if (userId) await setConsent(userId, false);
      return new Response('OK', { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }

    // The confirmation page's own button.
    const resubscribing = form.get('action') === 'resubscribe';
    if (userId) await setConsent(userId, resubscribing);
    return resubscribing
      ? page('Product email is back on', '<p>You will hear from us about the product again. You can turn it off any time.</p>')
      : page('Unsubscribed', '<p>You will not get product email from us again.</p>', token);
  }

  if (req.method === 'GET') {
    // Neutral copy for a bad token: it must not reveal whether the account exists, and the reader
    // needs a path that actually works rather than an error code.
    if (!userId) {
      return page(
        'That link did not work',
        '<p>It may have been cut short by your email app. Email <a href="mailto:support@michi-maker.com">support@michi-maker.com</a> from this address and we will take you off the list by hand.</p>',
      );
    }
    const ok = await setConsent(userId, false);
    return ok
      ? page('Unsubscribed', '<p>You will not get product email from us again. Messages about your account, like password resets and receipts, still reach you.</p>', token)
      : page('Something went wrong', '<p>We could not save that. Email <a href="mailto:support@michi-maker.com">support@michi-maker.com</a> and we will do it by hand.</p>');
  }

  return new Response('method not allowed', { status: 405 });
});
