/**
 * Whether to offer someone back the profile photo we stopped serving, and how to remember their
 * answer. Pure rules (no React, no Supabase) so `npm test` pins them.
 *
 * THE BACKGROUND. Until 2026-08-26, signing in with Google copied the provider's photo into
 * public.profiles.avatar_url. Nothing rendered it for a year; the profile work started rendering
 * it, which turned a dormant column into publication of a personal photograph nobody was asked
 * about. Migration 20260826140000 withdrew every copied photo (avatar_url = null) and left the
 * originals where they came from, auth.users.raw_user_meta_data, which only the account itself can
 * read. This module is the other half: the ask that turns a withdrawal into a choice.
 *
 * THE OFFER IS THE ONLY WAY BACK. profiles.avatar_url is CHECK-constrained to our own avatars
 * bucket, so accepting cannot simply write the Google URL back; the bytes are re-hosted first.
 * That is the same rule binder art follows, and it means a photo we serve is one we hold.
 *
 * TWO KINDS OF NO, because they mean different things:
 *   "No thanks" is an answer. Recorded in profiles.preferences and never asked again; Account
 *   settings still offers the photo for anyone who changes their mind.
 *   Closing the dialog is not an answer. Stamped as a showing (profiles.avatar_prompt_at) and
 *   re-offered after the same 7-day gap the rights prompt uses.
 *
 * A NAME COMES FIRST, for the reason in sharingDefaults: the UsernameGate is a blocking modal, and
 * a prompt that opens over it asks about a public identity the account does not have yet.
 */
import { PROMPT_GAP_MS } from './sharingDefaults.ts';

/** Re-offer a dismissed (not declined) photo at most this often. Shared with the rights prompt. */
export const AVATAR_PROMPT_GAP_MS = PROMPT_GAP_MS;

/** Where the decline lives inside profiles.preferences. */
const DECLINED_KEY = 'avatarOfferDeclined';

export interface AvatarConsentFields {
  username?: string | null;
  avatar_url?: string | null;
  avatar_consented_at?: string | null;
  avatar_prompt_at?: string | null;
  preferences?: unknown;
}

/**
 * The photo the account arrived with, from the auth session's user_metadata. Google writes both
 * `avatar_url` and `picture`; other providers pick one, so both are read.
 *
 * Only http(s) is accepted: a data: or blob: URL in metadata is not something a provider put
 * there, and re-hosting arbitrary inline bytes on the strength of a claim is how a metadata field
 * becomes an upload endpoint.
 */
export function providerAvatarUrl(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  for (const key of ['avatar_url', 'picture']) {
    const v = m[key];
    if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) return v.trim();
  }
  return null;
}

/** When they said no, or null if they never did. */
export function avatarOfferDeclinedAt(preferences: unknown): string | null {
  if (!preferences || typeof preferences !== 'object') return null;
  const v = (preferences as Record<string, unknown>)[DECLINED_KEY];
  return typeof v === 'string' && v ? v : null;
}

/** The preferences object to write when they decline. Merges, so no other preference is lost. */
export function withAvatarOfferDeclined(preferences: unknown, at: string): Record<string, unknown> {
  const base = preferences && typeof preferences === 'object' ? (preferences as object) : {};
  return { ...base, [DECLINED_KEY]: at };
}

/** The preferences object to write when they accept after an earlier no, so the record is honest. */
export function withAvatarOfferAccepted(preferences: unknown): Record<string, unknown> {
  const base = preferences && typeof preferences === 'object' ? (preferences as object) : {};
  const next = { ...base } as Record<string, unknown>;
  delete next[DECLINED_KEY];
  return next;
}

/**
 * Should the photo be offered to this account right now?
 *
 * `providerUrl` is what the session actually carries: no photo to offer, no prompt. Note this is
 * deliberately independent of the rights attestation. They are different questions (my face, my
 * art) and an account that never shares a binder still has a profile page.
 */
export function avatarOfferDue(
  profile: AvatarConsentFields | null | undefined,
  providerUrl: string | null,
  now = Date.now(),
): boolean {
  if (!profile || !providerUrl) return false;
  // Not over the UsernameGate.
  if (!profile.username) return false;
  // Already has a photo, by upload or by an earlier acceptance: nothing to offer.
  if (profile.avatar_url) return false;
  if (profile.avatar_consented_at) return false;
  // "No thanks" was an answer. Account settings carries the offer from here.
  if (avatarOfferDeclinedAt(profile.preferences)) return false;
  if (!profile.avatar_prompt_at) return true; // never asked: this is the next-login moment
  const last = Date.parse(profile.avatar_prompt_at);
  return Number.isNaN(last) || now - last >= AVATAR_PROMPT_GAP_MS;
}

/**
 * Is this the provider's GENERATED avatar rather than a photograph the person chose?
 *
 * Google hands accounts with no photo a coloured circle holding their initial, served as a tiny
 * PNG (the twelve withdrawn avatars included four of them, 408 to 1053 bytes; the smallest real
 * photo among them was a 2972-byte JPEG, and photos always come back as JPEG or as PNGs an order
 * of magnitude larger). Offering one back is asking permission to publish the same letter in a
 * circle the app already draws for free, so those are skipped and never counted as a showing.
 *
 * Conservative on purpose: anything that is not a small PNG is treated as a real photo and asked
 * about. Being asked about a monogram is a wasted dialog; publishing a face unasked is the bug
 * this whole module exists because of.
 */
export function isGeneratedAvatar(image: { type?: string | null; size?: number | null }): boolean {
  const type = (image.type ?? '').toLowerCase();
  const size = image.size ?? 0;
  return type === 'image/png' && size > 0 && size <= 2500;
}
