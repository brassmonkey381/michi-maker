/**
 * Open Graph preview for a shared binder (`/binder/:id`). Fetches the public binder
 * and emits meta tags so a Discord / iMessage / X / Slack / Reddit unfurl shows the
 * binder's title, description, and a real card image instead of a blank SPA shell.
 * A private or missing binder falls back to a generic michi-maker preview.
 */
const { SITE, SITE_NAME, cardImage, sbSelect, ogHtml, sendHtml } = require('./_lib');

/**
 * The most representative image for a binder: its chosen cover, else the first
 * placed card, else the first custom-art slot (already an absolute URL). Pages and
 * slots are ordered here so the pick is stable across requests.
 */
function pickImage(binder) {
  if (binder.cover_card_id) return cardImage(binder.cover_card_id);
  const pages = (binder.binder_pages || []).slice().sort((a, b) => a.position - b.position);
  for (const page of pages) {
    const slots = (page.binder_slots || [])
      .slice()
      .sort((a, b) => a.row_index - b.row_index || a.col_index - b.col_index);
    const card = slots.find((s) => s.card_id);
    if (card) return cardImage(card.card_id);
    const art = slots.find((s) => s.image_url);
    if (art) return art.image_url;
  }
  return null;
}

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '').trim();
  const url = `${SITE}/binder/${id}`;
  const fallback = {
    title: `A michi binder · ${SITE_NAME}`,
    description: 'Aesthetically curated Pokémon card binders — plan it, price it, print it.',
    image: null,
    url,
  };
  if (!id) return sendHtml(res, ogHtml(fallback));

  const select =
    'id,title,description,cover_card_id,' +
    'binder_pages(position,binder_slots(row_index,col_index,card_id,image_url))';
  const rows = await sbSelect(
    `binders?id=eq.${encodeURIComponent(id)}&is_public=eq.true&select=${encodeURIComponent(select)}`,
  );
  const binder = Array.isArray(rows) ? rows[0] : null;
  if (!binder) return sendHtml(res, ogHtml(fallback));

  const title = binder.title ? `${binder.title} · ${SITE_NAME}` : fallback.title;
  const description =
    binder.description || 'A michi-method Pokémon binder on michi-maker. Open to see the full layout.';
  return sendHtml(
    res,
    ogHtml({ title, description, image: pickImage(binder), url, imageAlt: binder.title }),
  );
};
