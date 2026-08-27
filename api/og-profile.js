/**
 * Open Graph preview for a public profile (`/u/:id`). Emits meta tags with the
 * collector's @username and a preview image — their avatar, or failing that the
 * cover of their first public binder. A private or missing profile falls back to a
 * generic preview.
 */
const { SITE, SITE_NAME, cardImage, sbSelect, ogHtml, sendHtml } = require('./_lib');

/** A UUID, as opposed to a username. See the note at the lookup below. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cover image for a profile's first public binder: chosen cover, else first placed card. */
function binderCover(binder) {
  if (!binder) return null;
  if (binder.cover_card_id) return cardImage(binder.cover_card_id);
  const pages = (binder.binder_pages || []).slice().sort((a, b) => a.position - b.position);
  for (const page of pages) {
    const slot = (page.binder_slots || []).find((s) => s.card_id);
    if (slot) return cardImage(slot.card_id);
  }
  return null;
}

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '').trim();
  const url = `${SITE}/u/${id}`;
  const fallback = {
    title: `A collector on ${SITE_NAME}`,
    description: 'Browse this collector’s public michi binders on michi-maker.',
    image: null,
    url,
  };
  if (!id) return sendHtml(res, ogHtml(fallback));

  // /u/:handle takes a username OR an id, and both are live: links are built from usernames now,
  // and every /u/<uuid> shared before that still has to unfurl. The two can never be confused —
  // a username is `^[a-z0-9_]{3,20}$` (20260711010000), so it has no dashes and is far too short.
  const match = UUID.test(id)
    ? `id=eq.${encodeURIComponent(id)}`
    : `username=eq.${encodeURIComponent(id.toLowerCase())}`;
  const profs = await sbSelect(`profiles?${match}&is_public=eq.true&select=id,username,avatar_url`);
  const profile = Array.isArray(profs) ? profs[0] : null;
  if (!profile) return sendHtml(res, ogHtml(fallback));

  const name = profile.username ? `@${profile.username}` : 'A collector';
  let image = profile.avatar_url || null;
  if (!image) {
    const select = 'cover_card_id,binder_pages(position,binder_slots(card_id))';
    // profile.id, NOT the URL param: the param may now be a username, and owner_id is a uuid.
    const binders = await sbSelect(
      `binders?owner_id=eq.${encodeURIComponent(profile.id)}&is_public=eq.true&limit=1&select=${encodeURIComponent(select)}`,
    );
    image = binderCover(Array.isArray(binders) ? binders[0] : null);
  }

  const title = `${name} · ${SITE_NAME}`;
  const description = `${name}’s public michi binders on michi-maker.`;
  return sendHtml(res, ogHtml({ title, description, image, url, imageAlt: name }));
};
