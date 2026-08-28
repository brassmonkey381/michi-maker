/**
 * The in-app prompts that open on their own, declared in one place.
 *
 * Before this there were two of them, each deciding for itself who it was for, where it appeared
 * and when it was allowed back, in the component that drew it. Nothing said what prompts the app
 * has, and answering "who sees this and when" meant reading two components and a lib. Four things
 * belong together and now live together:
 *
 *   WHO      `audience` in prose, `due()` in code, and the two must agree.
 *   WHERE    the surfaces it may appear on. A prompt with no surface never shows, by construction.
 *   WHEN     the cadence, inside `due()`.
 *   TRACKING `status()`: whether it has been seen, and what came back.
 *
 * INVITED DIALOGS ARE NOT PROMPTS. Share, Print and Report open because someone tapped something
 * and are none of this file's business. This is only for the ones that appear uninvited, which is
 * exactly the set that needs a rule about not ganging up on people.
 *
 * WHAT `status()` HOLDS, and what it does not. Each prompt stores its own `*_prompt_at` (seen) and
 * its own acceptance stamp (`rights_attested_at`, `avatar_consented_at`). Those are the CADENCE and
 * the CONSENT RECORD: they gate re-asking, they must survive a dropped request, and one of them is
 * evidence that a user affirmed something. They answer "seen?" and "accepted?" and nothing else — a
 * dialog closed with the X and one closed by navigating away both write nothing, so `response` here
 * can only ever read 'accepted' or 'no-answer'.
 *
 * The missing half is now MEASURED RATHER THAN STORED. `prompt.shown` / `prompt.answered` in
 * src/lib/analytics.ts carry the four real endings — accepted, declined, dismissed, abandoned — on
 * the event spine that already exists, which is what the `prompt_events` table sketched here was
 * for, without the migration or the second place to look. The two are deliberately allowed to
 * disagree: an event lost to a closed tab costs a row in a report, while a lost stamp would cost
 * the user a repeat of a question they already answered. Do not read the stream for cadence, and
 * do not add response columns here for reporting.
 */

export type PromptId = 'avatar-consent' | 'rights-attestation' | 'pro-trial-offer';

/** Where a prompt is allowed to open. A surface renders the prompts that list it. */
export type PromptSurface = 'home' | 'my-binders' | 'binder';

export type PromptResponse = 'accepted' | 'no-answer';

export interface PromptStatus {
  /** When it was last put in front of them, or null if never. */
  seenAt: string | null;
  /** When they accepted, or null. */
  acceptedAt: string | null;
  response: PromptResponse;
}

/** The profile fields any prompt may read. Kept structural so tests need no database. */
export interface PromptProfile {
  username?: string | null;
  rights_attested_at?: string | null;
  rights_prompt_at?: string | null;
  avatar_consented_at?: string | null;
  avatar_prompt_at?: string | null;
  avatar_url?: string | null;
  /** One-time recovery cohort, set only by migration 20260827140000. The app never sets it true. */
  pro_trial_offer_due?: boolean | null;
  pro_trial_prompt_at?: string | null;
}

export interface PromptContext {
  profile: PromptProfile | null | undefined;
  /** auth.users.is_anonymous. Guests are never prompted: they have no account to record on. */
  isGuest: boolean;
  /** The photo the OAuth provider still holds, if any. Only the avatar prompt reads it. */
  providerAvatarUrl?: string | null;
  /**
   * Whether start_pro_trial() would still say yes (useTrial().state === 'eligible'). Only the
   * trial prompt reads it, and it is what RETIRES that prompt: there is no "accepted" stamp on the
   * profile, because the acceptance record is the pro_trials row the RPC writes in the same
   * transaction as the grant — server-side and un-droppable, which is better evidence than
   * anything the client could stamp.
   */
  trialEligible?: boolean;
  now?: number;
}

export interface PromptDefinition {
  id: PromptId;
  /** Who this is for, in prose. `due()` is the same sentence in code; keep them honest together. */
  audience: string;
  /** When they meet it. */
  when: string;
  surfaces: PromptSurface[];
  /**
   * Lower goes first when more than one is due on the same screen. The avatar offer outranks the
   * attestation because it is a correction to something already done to the user, and the
   * attestation is an invitation that can wait a screen.
   */
  priority: number;
  due(ctx: PromptContext): boolean;
  status(profile: PromptProfile | null | undefined): PromptStatus;
}

const DAY = 86_400_000;
/** How long before an unanswered prompt may ask again. Long enough not to be a nag. */
export const PROMPT_GAP_MS = 7 * DAY;

/** Shared cadence: never if answered, immediately if never asked, otherwise after the gap. */
function cadence(seenAt: string | null | undefined, answeredAt: string | null | undefined, now: number): boolean {
  if (answeredAt) return false;
  if (!seenAt) return true;
  const last = Date.parse(seenAt);
  return Number.isNaN(last) || now - last >= PROMPT_GAP_MS;
}

const statusFrom = (seenAt?: string | null, acceptedAt?: string | null): PromptStatus => ({
  seenAt: seenAt ?? null,
  acceptedAt: acceptedAt ?? null,
  response: acceptedAt ? 'accepted' : 'no-answer',
});

export const PROMPTS: PromptDefinition[] = [
  {
    id: 'avatar-consent',
    audience:
      'Signed-in accounts whose provider photo we copied and then withdrew, and who have not yet '
      + 'said whether to publish it. Only while the provider still holds a photo to offer.',
    when: 'Anywhere, as soon as the app is ready after they sign in — including the home page.',
    // Everywhere, because it is a correction owed to them rather than a feature to discover, and
    // the population it was written for may never open a binder again.
    surfaces: ['home', 'my-binders', 'binder'],
    priority: 1,
    due: ({ profile, isGuest, providerAvatarUrl, now = Date.now() }) => {
      if (isGuest || !profile) return false;
      if (!providerAvatarUrl) return false; // nothing to offer them
      if (profile.avatar_url) return false; // they already have one showing
      return cadence(profile.avatar_prompt_at, profile.avatar_consented_at, now);
    },
    status: (p) => statusFrom(p?.avatar_prompt_at, p?.avatar_consented_at),
  },
  {
    id: 'rights-attestation',
    audience:
      'Signed-in accounts with a username that have not accepted the sharing attestation. Guests '
      + 'are excluded (nothing to record it on) and so are the nameless: the username gate comes '
      + 'first, because a binder credited to nobody is not worth publishing.',
    when:
      'On their own binders and on My binders — the two places a returning builder actually lands.',
    surfaces: ['my-binders', 'binder'],
    priority: 2,
    due: ({ profile, isGuest, now = Date.now() }) => {
      if (isGuest || !profile) return false;
      if (!profile.username) return false;
      return cadence(profile.rights_prompt_at, profile.rights_attested_at, now);
    },
    status: (p) => statusFrom(p?.rights_prompt_at, p?.rights_attested_at),
  },
  {
    id: 'pro-trial-offer',
    audience:
      'The accounts that were shown the free PRO trial back when it only lived on /plans and the '
      + 'print gate — nearly all of them minutes into their first session, before they had a '
      + 'binder worth upgrading for, and four of them into a server bug that refused the trial '
      + 'outright. Flagged once by migration 20260827140000 from the impressions we actually '
      + 'recorded, and only while they are still eligible. Nothing in the app adds anyone.',
    when:
      'Once, on Home or My binders, next time they open the app. Never again after that — see the '
      + 'cadence note below.',
    surfaces: ['home', 'my-binders'],
    // Last. The photo is a correction we owe them and the attestation gates their sharing; an
    // offer, however well aimed, waits behind both.
    priority: 3,
    due: ({ profile, isGuest, trialEligible }) => {
      if (isGuest || !profile) return false;
      if (!profile.pro_trial_offer_due) return false;
      // They started one (or never could) — the offer has nothing left to say.
      if (!trialEligible) return false;
      // Deliberately NOT `cadence`: this asks exactly once, ever. The other two prompts ask again
      // after a week because the thing they want is still outstanding; this one is a second
      // chance at an offer already ignored, and a third would be the nagging that putting the
      // offer at the cap gates exists to make unnecessary.
      return !profile.pro_trial_prompt_at;
    },
    status: (p) => statusFrom(p?.pro_trial_prompt_at, null),
  },
];

export const promptById = (id: PromptId): PromptDefinition =>
  PROMPTS.find((p) => p.id === id) as PromptDefinition;

/**
 * Everything due on this surface, most important first. The caller opens the first one it can;
 * the rest wait their turn (see src/lib/promptQueue.ts) rather than being dropped.
 */
export function duePrompts(surface: PromptSurface, ctx: PromptContext): PromptDefinition[] {
  return PROMPTS.filter((p) => p.surfaces.includes(surface) && p.due(ctx)).sort(
    (a, b) => a.priority - b.priority,
  );
}
