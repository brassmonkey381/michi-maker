import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ART_TEMPLATES } from './artTemplates.ts';
import { fillIdentity, findIdentities, hueFamily, planPages, speciesOf, type PagesProviders, type PoolCard } from './storyPages.ts';
import type { Similarity } from '../lib/similarity.ts';

const FULL = 'illustration_rare';
let n = 0;
const card = (id: string, name: string, extra: Partial<PoolCard> = {}): PoolCard => ({
  id,
  name,
  strength: 1,
  fullArtKind: FULL,
  illustrator: `ill-${(n += 1)}`,
  palette: [{ L: 50, a: 0, b: 40, w: 1 }],
  types: ['Grass'],
  evolutionLine: [],
  ...extra,
});

/** Symmetric pairwise likeness from a list of [a, b, sim]. */
function simOf(pairs: [string, string, number][]): Similarity {
  const m = new Map<string, Map<string, number>>();
  const put = (a: string, b: string, v: number) => {
    if (!m.has(a)) m.set(a, new Map());
    m.get(a)!.set(b, v);
  };
  for (const [a, b, v] of pairs) {
    put(a, b, v);
    put(b, a, v);
  }
  return m;
}

const EEVEE = ['eevee', 'vaporeon', 'jolteon', 'flareon'];

test('speciesOf reads the line member out of the name, else strips decorations', () => {
  assert.equal(speciesOf({ name: 'Vaporeon VMAX', evolutionLine: EEVEE }), 'vaporeon');
  assert.equal(speciesOf({ name: 'Pikachu ex', evolutionLine: [] }), 'pikachu');
});

test('hueFamily bins saturated colours by hue and names the darks and pales', () => {
  assert.equal(hueFamily(card('a', 'A', { palette: [{ L: 50, a: 0, b: 40, w: 1 }] })), 'hue90');
  assert.equal(hueFamily(card('b', 'B', { palette: [{ L: 20, a: 2, b: -3, w: 1 }] })), 'darks');
  assert.equal(hueFamily(card('c', 'C', { palette: [{ L: 80, a: 2, b: -3, w: 1 }] })), 'pales');
  assert.equal(hueFamily(card('d', 'D', { palette: [{ L: 50, a: 2, b: -3, w: 1 }] })), null);
  assert.equal(hueFamily(card('e', 'E', { palette: [] })), null);
});

test('findIdentities: an evolution family seeds one print per species, an illustrator needs four, a hue family six', () => {
  const pool: PoolCard[] = [
    card('e1', 'Eevee', { evolutionLine: EEVEE }),
    card('v1', 'Vaporeon V', { evolutionLine: EEVEE }),
    card('v2', 'Vaporeon VMAX', { evolutionLine: EEVEE }),
    card('j1', 'Jolteon', { evolutionLine: EEVEE }),
    ...Array.from({ length: 4 }, (_, i) => card(`a${i}`, `Art ${i}`, { illustrator: 'Same Hand', palette: [{ L: 50, a: 40, b: 0, w: 1 }] })),
    ...Array.from({ length: 6 }, (_, i) => card(`p${i}`, `Pal ${i}`, { palette: [{ L: 40, a: -10, b: -40, w: 1 }] })),
  ];
  const ids = findIdentities(pool, new Map());
  const fam = ids.find((i) => i.kind === 'lines')!;
  assert.equal(fam.name, 'The Eevee family');
  assert.deepEqual(new Set(fam.seeds.map((c) => speciesOf(c))), new Set(['eevee', 'vaporeon', 'jolteon']));
  assert.equal(fam.seeds.length, 4, 'both Vaporeon prints, one as a species seed and one as an extra');
  const hand = ids.find((i) => i.kind === 'artist')!;
  assert.equal(hand.name, 'By Same Hand');
  assert.ok(hand.seeds.length >= 3 && hand.seeds.every((c) => c.illustrator === 'Same Hand'));
  const pal = ids.find((i) => i.kind === 'palette')!;
  assert.equal(pal.name, 'Blues');
  assert.equal(pal.seeds.length, 4);
  assert.ok(ids.every((i) => i.kind !== 'alike'), 'no likeness, no clique');
});

test('findIdentities: a clique grows from the best-connected card and takes only mutually alike cards', () => {
  const pool = ['k1', 'k2', 'k3', 'k4', 'x'].map((id) => card(id, id.toUpperCase()));
  const sim = simOf([
    ['k1', 'k2', 0.8],
    ['k1', 'k3', 0.79],
    ['k2', 'k3', 0.76],
    ['k1', 'k4', 0.75],
    ['k2', 'k4', 0.5],
    ['x', 'k1', 0.3],
  ]);
  const clique = findIdentities(pool, sim).find((i) => i.kind === 'alike')!;
  assert.deepEqual(clique.seeds.map((c) => c.id).sort(), ['k1', 'k2', 'k3'], 'k4 is alike to k1 only');
});

test('fillIdentity: kin first, then likeness, never below the floor, never a species twice, never the other art class', async () => {
  const seeds = [card('e1', 'Eevee', { evolutionLine: EEVEE }), card('v1', 'Vaporeon', { evolutionLine: EEVEE }), card('j1', 'Jolteon', { evolutionLine: EEVEE })];
  const pool: PoolCard[] = [
    ...seeds,
    card('f1', 'Flareon', { evolutionLine: EEVEE }),
    card('v2', 'Vaporeon VMAX', { evolutionLine: EEVEE }),
    card('like', 'Lapras'),
    card('meh', 'Snorlax'),
    card('win', 'Gyarados', { fullArtKind: 'standard' }),
  ];
  const centre = new Map([
    ['f1', 0.66],
    ['v2', 0.9],
    ['like', 0.75],
    ['meh', 0.5],
    ['win', 0.95],
  ]);
  const ident = { kind: 'lines' as const, name: 'The Eevee family', seeds, fill: 'lines' as const, quality: 1 };
  const out = await fillIdentity(ident, pool, new Set(), simOf([['e1', 'v1', 0.7], ['e1', 'j1', 0.7], ['v1', 'j1', 0.7]]), 12, 0.68, {
    likenessToCentre: async () => centre,
  });
  const ids = out.cards.map((c) => c.id);
  assert.deepEqual(ids.slice(0, 3), ['e1', 'v1', 'j1'], 'seeds first');
  assert.ok(ids.includes('f1'), 'kin may sit a little under the floor');
  assert.ok(!ids.includes('v2'), 'a species already on the page is not placed again');
  assert.ok(ids.includes('like'), 'alike enough');
  assert.ok(!ids.includes('meh'), 'not alike enough');
  assert.ok(!ids.includes('win'), 'a windowed card never joins a full-art page');
  assert.match(out.why, /likeness stopped at 0\.50/);
});

test('planPages: pages are trimmed to a template size, arranged with exact-fit templates, titled by identity, no holes', async () => {
  // Fourteen alike cards of one hand: the identity fills to 12, the page is The Complete Run.
  // Seven cards of one family: trimmed to 6, a six-pocket template, one art job.
  const hand = Array.from({ length: 14 }, (_, i) => card(`h${i}`, `Hand ${i}`, { illustrator: 'One Hand', strength: 2 }));
  const fam = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s, i) => card(`l${i}`, `${s.toUpperCase()}mon`, { evolutionLine: ['amon', 'bmon', 'cmon'], name: ['Amon', 'Bmon', 'Cmon', 'Amon V', 'Bmon V', 'Cmon V', 'Amon ex'][i], illustrator: 'Other' }));
  const pool = [...hand, ...fam];
  const providers: PagesProviders = {
    likenessToCentre: async (_seeds, ids) => new Map(ids.map((id) => [id, 0.9])),
    pairwise: async (ids) => {
      const m = new Map<string, Map<string, number>>();
      for (const a of ids) m.set(a, new Map(ids.filter((b) => b !== a).map((b) => [b, 0.8])));
      return m;
    },
  };
  let k = 0;
  const plan = await planPages(pool, providers, { shape: { rows: 3, cols: 4 }, maxPages: 4, mkId: () => `id${(k += 1)}`, art: { queries: ['q'], kind: 'any', label: 'T' } });
  const sizes = ART_TEMPLATES.filter((t) => t.rows === 3 && t.cols === 4 && !t.spread).map((t) => t.cardPockets);
  assert.ok(plan.pages.length >= 2, `pages: ${plan.pages.map((p) => p.identity.name).join(', ')}`);
  for (const p of plan.pages) {
    const cards = p.page.slots.filter((s) => s.type === 'card');
    const art = p.page.slots.filter((s) => s.type === 'artwork');
    assert.ok(sizes.includes(cards.length) || cards.length === 12, `${p.identity.name}: ${cards.length} cards is a template size`);
    const cells = new Set<string>();
    for (const s of p.page.slots) for (let r = s.row; r < s.row + s.rowSpan; r += 1) for (let c = s.col; c < s.col + s.colSpan; c += 1) cells.add(`${r},${c}`);
    assert.equal(cells.size, 12, `${p.identity.name}: every pocket is a card or art, no hole`);
    assert.equal(p.arrangement.held.length, 0, 'nothing to the tray');
    assert.equal(p.page.title, p.identity.name);
    assert.equal(art.length, plan.artJobs.filter((j) => j.pageIndex === plan.pages.indexOf(p)).length, 'one art job per panel');
  }
  const ids = plan.pages.flatMap((p) => p.cards.map((c) => c.id));
  assert.equal(new Set(ids).size, ids.length, 'no card on two pages');
  assert.ok(plan.pages.some((p) => p.cards.length === 12), 'the alike cards fill a complete page');
  assert.ok(plan.pages.some((p) => p.cards.length < 12 && p.page.slots.some((s) => s.type === 'artwork')), 'a short page took an art template');
});
