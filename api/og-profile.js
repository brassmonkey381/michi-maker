/**
 * Open Graph preview for a public profile (`/u/:id`). Emits meta tags with the
 * collector's @username and a preview image — their avatar, or failing that the
 * cover of their first public binder. A private or missing profile falls back to a
 * generic preview.
 */
const { SITE, SITE_NAME, cardImage, sbSelect, ogHtml, sendHtml } = require('./_lib');

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

  const profs = await sbSelect(
    `profiles?id=eq.${encodeURIComponent(id)}&is_public=eq.true&select=id,username,avatar_url`,
  );
  const profile = Array.isArray(profs) ? profs[0] : null;
  if (!profile) return sendHtml(res, ogHtml(fallback));

  const name = profile.username ? `@${profile.username}` : 'A collector';
  let image = profile.avatar_url || null;
  if (!image) {
    const select = 'cover_card_id,binder_pages(position,binder_slots(card_id))';
    const binders = await sbSelect(
      `binders?owner_id=eq.${encodeURIComponent(id)}&is_public=eq.true&limit=1&select=${encodeURIComponent(select)}`,
    );
    image = binderCover(Array.isArray(binders) ? binders[0] : null);
  }

  const title = `${name} · ${SITE_NAME}`;
  const description = `${name}’s public michi binders on michi-maker.`;
  return sendHtml(res, ogHtml({ title, description, image, url, imageAlt: name }));
};
