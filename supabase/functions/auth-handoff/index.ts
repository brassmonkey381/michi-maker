/**
 * auth-handoff — cross-app single sign-on for the michi-maker ⇄ tcgscan bundle flow.
 *
 *  POST {} → { tokenHash }
 *    Mints a ONE-TIME magic-link token hash for the CALLER's own account (admin generateLink,
 *    no email is sent). The client appends it to the sibling app's URL as a #fragment; the
 *    sibling redeems it with supabase.auth.verifyOtp({ token_hash, type: 'email' }) and the
 *    visitor is signed in as the same account there. Fragments never reach servers, logs, or
 *    referrer headers; the hash is single-use and expires with the project's email-OTP window.
 *
 * Security shape:
 *  - JWT verification is ON (default) AND the user is re-resolved here; the token is minted
 *    only for the caller's own identity — there is no way to mint for someone else.
 *  - ANONYMOUS (guest) sessions are refused: guests have no email identity to link, and the
 *    handoff would otherwise hand out session-granting URLs to throwaway sessions.
 *  - The link is minted ON CLICK, never pre-rendered into a page, so an unredeemed hash only
 *    ever exists in the clicking user's own navigation.
 *
 * Deployed alongside stripe-checkout / payments-webhook (same shared project). See
 * docs/SYNERGY.md for the cross-app shape.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  // Resolve the caller from their JWT (token passed explicitly — see stripe-checkout).
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );
  const {
    data: { user },
  } = await authClient.auth.getUser(token);
  if (!user) return json(401, { error: 'not signed in' });
  if ((user as { is_anonymous?: boolean }).is_anonymous || !user.email) {
    return json(403, { error: 'handoff requires a real signed-in account' });
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data, error } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    return json(500, { error: error?.message ?? 'could not mint handoff token' });
  }
  return json(200, { tokenHash });
});
