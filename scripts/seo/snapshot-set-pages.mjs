/**
 * SNAPSHOT THE DATA FOR THE /sets PILOT PAGES (MIC-037, SEO plan action 9).
 *
 * Run by hand, not in the build:
 *   node scripts/seo/snapshot-set-pages.mjs --catalog <catalog.json> --prices <prices-summary.json> --images <images.json>
 * Inputs are the three public browse files (the catalog as michi-maker.com/browse/catalog.json
 * serves it; prices and the image manifest from the data server's browse bucket, which carries
 * current prices). Writes:
 *   scripts/seo/set-pages.json  everything the pages print, for the PILOT sets only
 *   api/_sets.json              slug, name, date: the sitemap's list
 *
 * WHY A COMMITTED SNAPSHOT. The 12 MB catalog is gitignored and moving behind a gate
 * (DATA-PROTECTION-PLAN), so the build cannot count on it. The build renders from this file with no
 * network, and a page's prices carry the date they were read. Re-run it to refresh.
 *
 * WHAT A "CARD" IS HERE. The catalog lists TCGplayer products, so one card number can appear
 * several times: Prismatic Evolutions' "001/131 Exeggcute" is also "(Poke Ball Pattern)" and
 * "(Master Ball Pattern)". A set's checklist is one card per number (the plain printing, the
 * dearest when two plain entries share a number); the patterns are counted as variants, which a
 * master set includes, as is one reverse holo of every card TCGplayer lists one for.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k) => {
  const i = process.argv.indexOf(`--${k}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`missing --${k} <path>`);
  return process.argv[i + 1];
};
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/**
 * THE PILOT: 26 sets. How they were chosen (MIC-037 phase B):
 *   - every main and special expansion of the two current eras (Mega Evolution and Scarlet &
 *     Violet, 2023 to 2026): the sets people are opening and building master-set binders for now;
 *     promo, energy, McDonald's and trick-or-trade lists left out (not binder projects);
 *   - five classics with lasting binder demand: Base Set, Jungle and Fossil (the original
 *     binders), Evolving Skies and Crown Zenith (the Sword & Shield sets with the most expensive
 *     modern chase cards).
 * No more until Search Console has read these (plan: 2 to 4 weeks).
 */
export const PILOT = [
  24655, 24587, 24541, 24448, 24380, // Mega Evolution
  24325, 24326, 24269, 24073, 23821, 23651, 23537, 23529, 23473, 23381, 23353, 23286, 23237, 23228, 23120, 22873, // Scarlet & Violet
  17688, 2848, 604, 635, 630, // classics
];

/** "SV07: Stellar Crown" -> "Stellar Crown"; "SV: Scarlet & Violet 151" -> "Scarlet & Violet 151". */
export const cleanName = (name) => String(name).replace(/^(SV|ME|SWSH|SM|XY)\d*[A-Z]?:\s*/, '').trim();
export const slugOf = (name) =>
  cleanName(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// A trailing parenthetical marks another printing of a numbered card: "(Poke Ball Pattern)",
// "(Master Ball Pattern)", "(Energy Symbol Pattern)", "(Black Dot Error)". When it is the only entry
// at its number it is the card itself (e.g. a trainer named for its art), so the count below
// treats it as a variant only when a plain printing exists beside it.
const PATTERN = /\([^)]*\)\s*$/;
/** A price older than this, against the newest in the set, is not printed (it would mislead). */
const STALE_DAYS = 45;
const numParts = (n) => {
  const m = /^(\d+)\/(\d+)$/.exec(String(n || ''));
  return m ? { at: Number(m[1]), of: Number(m[2]) } : null;
};

function priceOf(prices, id) {
  const p = prices[id];
  if (!p || typeof p.cur !== 'number') return null;
  return { cur: Math.round(p.cur * 100) / 100, date: p.date || null, reverse: !!(p.variants && p.variants['Reverse Holofoil']) };
}

function imageOf(manifest, id) {
  const row = manifest.cards && manifest.cards[id];
  if (!row) return null;
  if (manifest.schema === 2) {
    const [lang, , small] = row;
    const base = manifest.base[lang] && manifest.base[lang].image_small;
    return base && small ? `${base}/${small}` : null;
  }
  const base = manifest.base && manifest.base.image_small;
  return base && row[1] ? `${base}/${row[1]}` : null;
}

export function snapshotSet(catalog, prices, manifest, setId) {
  const meta = catalog.sets[setId];
  if (!meta) throw new Error(`set ${setId} not in the catalog`);
  const entries = Object.values(catalog.cards).filter((c) => c.set_id === Number(setId));
  const byNumber = new Map();
  for (const c of entries) {
    const p = priceOf(prices, c.id);
    const row = { id: c.id, number: c.number, name: c.name, rarity: c.rarity || '', price: p ? p.cur : null, priceDate: p ? p.date : null, reverse: !!(p && p.reverse) };
    const slot = byNumber.get(c.number) || byNumber.set(c.number, { base: null, variants: [] }).get(c.number);
    if (PATTERN.test(c.name)) slot.variants.push(row);
    else if (!slot.base || (row.price || 0) > (slot.base.price || 0)) slot.base = row;
  }
  let patterns = 0;
  for (const s of byNumber.values()) patterns += s.base ? s.variants.length : Math.max(0, s.variants.length - 1);
  const cards = [...byNumber.values()]
    .map((s) => s.base || s.variants[0])
    .filter(Boolean)
    .sort((a, b) => {
      const x = numParts(a.number);
      const y = numParts(b.number);
      if (x && y) return x.at - y.at;
      return String(a.number).localeCompare(String(b.number), 'en', { numeric: true });
    });
  // The printed set size: the commonest denominator ("/165"). A card numbered above it is a secret rare.
  const denoms = new Map();
  for (const c of cards) {
    const n = numParts(c.number);
    if (n) denoms.set(n.of, (denoms.get(n.of) || 0) + 1);
  }
  const printed = [...denoms.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? cards.length;
  const notable = entries
    .map((c) => ({ id: c.id, number: c.number, name: c.name, rarity: c.rarity || '', price: priceOf(prices, c.id)?.cur ?? null }))
    .filter((c) => c.price != null)
    .sort((a, b) => b.price - a.price)
    .slice(0, 12)
    .map((c) => ({ ...c, image: imageOf(manifest, c.id) }));
  const dates = entries.map((c) => prices[c.id] && prices[c.id].date).filter(Boolean).sort();
  const releases = entries.map((c) => c.release_date).filter(Boolean).sort();
  const asOf = dates[dates.length - 1] || null;
  const fresh = (d) => !!(asOf && d && Date.parse(asOf) - Date.parse(d) <= STALE_DAYS * 86400e3);
  // Numbers 1..printed the catalog has no card for (Base Set: 008/102 Machamp), said on the page.
  const have = new Set(cards.map((c) => numParts(c.number)?.at).filter(Boolean));
  const missing = [];
  for (let i = 1; i <= printed; i++) if (!have.has(i)) missing.push(i);
  return {
    id: Number(setId),
    slug: slugOf(meta.name),
    name: cleanName(meta.name),
    catalogName: meta.name,
    code: meta.code || null,
    series: meta.series || null,
    released: releases[0] || null,
    printed,
    patterns,
    pricesAsOf: asOf,
    missing,
    // Compact rows: [number, name, rarity, price or null, 1 when a reverse holo is listed].
    cards: cards.map((c) => [c.number, c.name, c.rarity, fresh(c.priceDate) ? c.price : null, c.reverse ? 1 : 0]),
    notable,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalog = read(arg('catalog'));
  const prices = read(arg('prices'));
  const manifest = read(arg('images'));
  const sets = PILOT.map((id) => snapshotSet(catalog, prices, manifest, id));
  const slugs = new Set(sets.map((s) => s.slug));
  if (slugs.size !== sets.length) throw new Error('two pilot sets share a slug');
  const taken = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(ROOT, 'scripts/seo/set-pages.json'), JSON.stringify({ taken, sets }) + '\n');
  fs.writeFileSync(
    path.join(ROOT, 'api/_sets.json'),
    JSON.stringify({ taken, sets: sets.map((s) => ({ slug: s.slug, name: s.name, pricesAsOf: s.pricesAsOf })) }, null, 2) + '\n',
  );
  for (const s of sets) console.log(`${s.slug}: ${s.cards.length} cards (${s.printed} printed), ${s.patterns} pattern variants, prices ${s.pricesAsOf}`);
}
