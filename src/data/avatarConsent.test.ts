/**
 * The avatar consent rules. Run: `npm test`.
 *
 * These decide whether we ask someone to publish their own face. Both directions matter: not
 * asking leaves twelve people's photos withdrawn forever, and asking too often is nagging
 * somebody about a personal photograph they already said no to.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AVATAR_PROMPT_GAP_MS,
  avatarOfferDeclinedAt,
  avatarOfferDue,
  isGeneratedAvatar,
  providerAvatarUrl,
  withAvatarOfferAccepted,
  withAvatarOfferDeclined,
} from './avatarConsent.ts';

const NOW = Date.parse('2026-08-26T12:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const PHOTO = 'https://lh3.googleusercontent.com/a/ACg8ocExample=s96-c';
/** An account that has cleared the UsernameGate and had its copied photo withdrawn. */
const withdrawn = (p: Record<string, unknown> = {}) => ({
  username: 'collector',
  avatar_url: null,
  avatar_consented_at: null,
  avatar_prompt_at: null,
  ...p,
});

test('a withdrawn photo is offered back on the next login', () => {
  assert.equal(avatarOfferDue(withdrawn(), PHOTO, NOW), true);
});

test('no photo in the session means no prompt', () => {
  assert.equal(avatarOfferDue(withdrawn(), null, NOW), false);
});

test('never over the UsernameGate', () => {
  assert.equal(avatarOfferDue(withdrawn({ username: null }), PHOTO, NOW), false);
});

test('an account that already has a photo is left alone', () => {
  // Uploaded by hand through the account sheet...
  assert.equal(
    avatarOfferDue(withdrawn({ avatar_url: 'https://x/storage/v1/object/public/avatars/a/b.png' }), PHOTO, NOW),
    false,
  );
  // ...or accepted here earlier and since removed. Consent is not re-asked.
  assert.equal(avatarOfferDue(withdrawn({ avatar_consented_at: iso(0) }), PHOTO, NOW), false);
});

test('closing the dialog re-offers after the gap, not before', () => {
  assert.equal(
    avatarOfferDue(withdrawn({ avatar_prompt_at: iso(AVATAR_PROMPT_GAP_MS - 60_000) }), PHOTO, NOW),
    false,
  );
  assert.equal(
    avatarOfferDue(withdrawn({ avatar_prompt_at: iso(AVATAR_PROMPT_GAP_MS + 60_000) }), PHOTO, NOW),
    true,
  );
});

test('an unparseable stamp is treated as overdue rather than as never', () => {
  assert.equal(avatarOfferDue(withdrawn({ avatar_prompt_at: 'not a date' }), PHOTO, NOW), true);
});

test('"No thanks" ends it, however long ago it was said', () => {
  const declined = withdrawn({
    preferences: { avatarOfferDeclined: iso(AVATAR_PROMPT_GAP_MS * 52) },
    avatar_prompt_at: iso(AVATAR_PROMPT_GAP_MS * 52),
  });
  assert.equal(avatarOfferDue(declined, PHOTO, NOW), false);
});

test('the decline merges into preferences and can be lifted', () => {
  const prefs = { cardLanguages: ['en'] };
  const declined = withAvatarOfferDeclined(prefs, iso(0));
  assert.deepEqual(declined.cardLanguages, ['en']);
  assert.equal(avatarOfferDeclinedAt(declined), iso(0));
  const lifted = withAvatarOfferAccepted(declined);
  assert.deepEqual(lifted.cardLanguages, ['en']);
  assert.equal(avatarOfferDeclinedAt(lifted), null);
});

test('a missing or malformed preferences blob is not a decline', () => {
  assert.equal(avatarOfferDeclinedAt(null), null);
  assert.equal(avatarOfferDeclinedAt('nonsense'), null);
  assert.equal(avatarOfferDeclinedAt({ avatarOfferDeclined: 42 }), null);
  assert.equal(avatarOfferDue(withdrawn({ preferences: 'nonsense' }), PHOTO, NOW), true);
});

test('the provider photo is read from either metadata key, http(s) only', () => {
  assert.equal(providerAvatarUrl({ avatar_url: PHOTO }), PHOTO);
  assert.equal(providerAvatarUrl({ picture: PHOTO }), PHOTO);
  // avatar_url wins when a provider writes both, which Google does.
  assert.equal(providerAvatarUrl({ avatar_url: PHOTO, picture: 'https://other/x.png' }), PHOTO);
  assert.equal(providerAvatarUrl({ avatar_url: '  ' + PHOTO + ' ' }), PHOTO);
  assert.equal(providerAvatarUrl(null), null);
  assert.equal(providerAvatarUrl({}), null);
  // Not an endpoint for inline bytes.
  assert.equal(providerAvatarUrl({ avatar_url: 'data:image/png;base64,AAAA' }), null);
  assert.equal(providerAvatarUrl({ avatar_url: 'blob:https://michi-maker.com/x' }), null);
});

test('a generated monogram is recognised; a photograph is not', () => {
  // The four monograms actually found among the withdrawn twelve.
  for (const size of [408, 410, 799, 1053]) {
    assert.equal(isGeneratedAvatar({ type: 'image/png', size }), true);
  }
  // ...and the real photos alongside them.
  assert.equal(isGeneratedAvatar({ type: 'image/jpeg', size: 2972 }), false);
  assert.equal(isGeneratedAvatar({ type: 'image/png', size: 9755 }), false);
  assert.equal(isGeneratedAvatar({ type: 'image/png', size: 18273 }), false);
  // Unknown shape: treated as a photo, so it gets asked about.
  assert.equal(isGeneratedAvatar({ type: null, size: 900 }), false);
  assert.equal(isGeneratedAvatar({ type: 'image/png', size: 0 }), false);
});
