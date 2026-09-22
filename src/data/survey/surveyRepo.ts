/**
 * Sending a survey response (supabase/migrations/20260922120000_feedback_responses.sql).
 *
 * Insert-only from the client, `to authenticated`, capped at five a day by the insert policy
 * itself. Guests are covered because this app signs everyone in anonymously, but there is one
 * visitor class that has no session at all (someone who explicitly signed out, which this app
 * remembers and honours), and for them `auth.uid()` is null and the insert fails with a
 * permissions error they could not possibly interpret. So the submit path MINTS A SESSION FIRST
 * and only then writes. That ordering is the whole reason this file is not three lines.
 *
 * App-agnostic: the app id comes from the definition. A sibling app copies this file unchanged.
 */
import { requireSupabase } from '@/lib/supabase';
import type { AnswerMap, SurveyDef } from './surveyTypes';
import { anchorScore, contactOf, toPayload } from './surveyState';

/** What the app knew without asking. Only things already held, never anything derived about a person. */
export interface SurveyContext {
  /** 'guest' | 'free' | 'pro' | … as the app knew it at the moment of writing, or null if unsettled. */
  tier: string | null;
  /** 'web' | 'ios' | 'android'. */
  platform: string;
  /** The route they were on when they opened the form, if they arrived from one. */
  from?: string | null;
  /** Rough counts that make an answer legible. Numbers only. */
  binders?: number | null;
  /** The analytics session this belongs to, so a response can be put next to what they did. */
  sessionId?: string | null;
}

export type SubmitOutcome =
  /**
   * `mintedSession` is true when this submit had to start a guest session to write at all. The
   * page says so afterwards, because somebody who deliberately signed out has just been signed
   * back in as a guest, and finding that out by noticing the header changed is not acceptable.
   */
  | { ok: true; mintedSession: boolean }
  | { ok: false; reason: 'no-session' | 'rate-limited' | 'error'; message: string };

/**
 * Ensure there is a session before writing. Returns false when the project has anonymous
 * sign-in switched off, which is the one case the page has to explain rather than retry.
 */
async function ensureSession(
  hasSession: boolean,
  continueAsGuest: () => Promise<{ error?: string | null }>,
): Promise<boolean> {
  if (hasSession) return true;
  const result = await continueAsGuest();
  return !result?.error;
}

export async function submitSurvey(input: {
  def: SurveyDef;
  answers: AnswerMap;
  context: SurveyContext;
  /** Whether the app already holds a session (auth.user is non-null). */
  hasSession: boolean;
  /** auth.continueAsGuest, passed in so this module never imports the auth store. */
  continueAsGuest: () => Promise<{ error?: string | null }>;
}): Promise<SubmitOutcome> {
  const { def, answers, context, hasSession, continueAsGuest } = input;
  const mintedSession = !hasSession;

  if (!(await ensureSession(hasSession, continueAsGuest))) {
    return {
      ok: false,
      reason: 'no-session',
      message: 'We could not start a session to send this. Sign in and try again.',
    };
  }

  const supabase = requireSupabase();
  const contact = contactOf(def, answers);
  // user_id, was_guest and created_at are all server-owned: defaulted or stamped by trigger,
  // never sent from here.
  const { error } = await supabase.from('feedback_responses').insert({
    app: def.app,
    survey_id: def.id,
    survey_version: def.version,
    answers: toPayload(def, answers),
    context: { ...context },
    nps: anchorScore(def, answers),
    contact_email: contact.email,
    contact_ok: contact.ok,
  });

  if (!error) return { ok: true, mintedSession };

  // The daily cap is enforced inside the insert policy, so hitting it looks exactly like any
  // other RLS refusal. Say the true thing rather than "something went wrong".
  const rls = error.code === '42501' || /row-level security|violates row-level/i.test(error.message);
  if (rls) {
    return {
      ok: false,
      reason: 'rate-limited',
      message: 'That is as much feedback as one account can send in a day. Try again tomorrow, and thank you.',
    };
  }
  return { ok: false, reason: 'error', message: error.message };
}
