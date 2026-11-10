/**
 * AUTO NAMES (MIC-034, owner 2026-11-10: "can we auto suggest page names and descriptions? Since we
 * have so much knowledge of what's in the page pockets"). Rule templates on the device: the page's
 * cards in, a short title and a one-sentence description out, from the strongest thing the page
 * has in common (one Pokémon, an evolution line, an artist, a scene, a type, a set), else its names.
 *
 * Free, instant, offline, no reads: the cards come from what the editor already holds. Pure, so the
 * same cards always give the same words (no flicker while a page is edited).
 *
 * COPY RULES: plain words, no em dashes, never how the binder was made or how cards are tagged.
 */
import type { CatalogCard } from 'tcgscan-browse';

import { speciesOf } from './pageCompleter.ts';

/**
 * Is this field the owner's? Edited or kept means yes. Never set (a field from before auto names,
 * or a column not written yet) means yes when it has text: nothing typed is ever replaced.
 */
export function isFieldLocked(locked: boolean | undefined, text: string | undefined): boolean {
  return locked ?? !!text?.trim();
}

/** The fields the rules read; a CatalogCard has them all. */
export type NameCard = Pick<CatalogCard, 'name' | 'types' | 'illustrator' | 'setName' | 'evolutionLine'> & {
  sceneTags?: readonly string[];
};

export interface AutoText {
  title: string;
  description: string;
}

/** How much of the page one value must cover to name it. */
const DOMINANT = 0.6;
/** A scene shared by this share of the cards that carry scene words names the page. */
const SCENE_SHARE = 0.5;

const cap = (s: string) => s.replace(/(^|[\s-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
const numberWord = (n: number) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][n] ?? String(n);

/** The most common non-empty value, its count, and how many cards had a value at all. */
function top(values: readonly string[]): { value: string; count: number; of: number; distinct: number } {
  const n = new Map<string, number>();
  for (const v of values) if (v) n.set(v, (n.get(v) ?? 0) + 1);
  let value = '';
  let count = 0;
  for (const [k, c] of n) if (c > count || (c === count && k < value)) { value = k; count = c; }
  return { value, count, of: values.filter(Boolean).length, distinct: n.size };
}

/** "a, b and c" */
function list(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** The facts a page's cards share, strongest first. */
export interface PageFacts {
  n: number;
  species: ReturnType<typeof top>;
  type: ReturnType<typeof top>;
  artist: ReturnType<typeof top>;
  set: ReturnType<typeof top>;
  scene: ReturnType<typeof top>;
  /** The evolution line most of the page belongs to: its stages, and how many are here. */
  line: { stages: string[]; present: number } | null;
  /** Species in reading order, first appearance. */
  names: string[];
}

export function pageFacts(cards: readonly NameCard[]): PageFacts {
  const species = cards.map((c) => speciesOf(c as CatalogCard) || c.name.toLowerCase());
  const lineKey = top(cards.map((c) => (c.evolutionLine.length >= 2 ? c.evolutionLine.join('>') : '')));
  let line: PageFacts['line'] = null;
  if (lineKey.value && lineKey.count >= 2) {
    const stages = lineKey.value.split('>');
    const here = new Set(species);
    line = { stages, present: stages.filter((s) => here.has(s)).length };
  }
  const names: string[] = [];
  for (const s of species) if (s && !names.includes(s)) names.push(s);
  return {
    n: cards.length,
    species: top(species),
    type: top(cards.map((c) => c.types[0] ?? '')),
    artist: top(cards.map((c) => c.illustrator.trim())),
    set: top(cards.map((c) => c.setName)),
    scene: top(cards.flatMap((c) => (c.sceneTags ?? []).slice(0, 3).map((t) => t.toLowerCase()))),
    line,
    names,
  };
}

const share = (t: { count: number }, n: number) => (n ? t.count / n : 0);

/** The page's title and description. Empty strings for an empty page. */
export function autoPageText(cards: readonly NameCard[]): AutoText {
  if (!cards.length) return { title: '', description: '' };
  const f = pageFacts(cards);
  const used = new Set<string>();
  let title = '';
  const sceneCards = cards.filter((c) => c.sceneTags?.length).length;
  if (f.n >= 2 && share(f.species, f.n) >= DOMINANT) {
    const sp = cap(f.species.value);
    if (share(f.artist, f.n) >= DOMINANT && f.artist.count >= 2) { title = `${sp} by ${f.artist.value}`; used.add('artist'); }
    else if (f.set.distinct >= 3) { title = `${sp} through the sets`; used.add('set'); }
    else title = sp;
    used.add('species');
  } else if (f.line && f.line.present >= 2) {
    const first = cap(f.line.stages[0]);
    title = f.line.present === f.line.stages.length ? `The ${first} line, complete` : `The ${first} line`;
    used.add('line');
  } else if (f.n >= 2 && share(f.artist, f.n) >= DOMINANT && f.artist.count >= 2) {
    title = `Art by ${f.artist.value}`;
    used.add('artist');
  } else if (sceneCards >= 2 && f.scene.count >= 2 && f.scene.count / sceneCards >= SCENE_SHARE) {
    title = `${cap(f.scene.value)} scenes`;
    used.add('scene');
  } else if (f.n >= 2 && share(f.type, f.n) >= DOMINANT) {
    title = `${f.type.value} types`;
    used.add('type');
  } else if (f.n >= 2 && share(f.set, f.n) >= DOMINANT) {
    title = f.set.value;
    used.add('set');
  } else {
    const shown = f.names.slice(0, 3).map(cap);
    title = f.names.length > 3 ? `${shown.slice(0, 2).join(', ')} and ${f.names.length - 2} more` : list(shown);
  }

  // The description: what the title did not already say, two facts at most.
  const parts: string[] = [];
  if (!used.has('line') && f.line && f.line.present >= 2) {
    parts.push(f.line.present === f.line.stages.length ? `the whole ${cap(f.line.stages[0])} line` : `${numberWord(f.line.present)} of ${numberWord(f.line.stages.length)} ${cap(f.line.stages[0])} stages`);
  }
  if (!used.has('type') && f.type.value && share(f.type, f.n) >= DOMINANT && f.n >= 2) parts.push(share(f.type, f.n) === 1 ? `all ${f.type.value}` : `mostly ${f.type.value}`);
  if (!used.has('artist') && f.artist.value) {
    if (f.n >= 2 && share(f.artist, f.n) >= DOMINANT) parts.push(`drawn by ${f.artist.value}`);
    else if (f.artist.distinct >= 3) parts.push(`${numberWord(f.artist.distinct)} artists`);
  }
  if (!used.has('scene') && sceneCards >= 2 && f.scene.count >= 2 && f.scene.count / sceneCards >= SCENE_SHARE) parts.push(`${f.scene.value} scenes`);
  if (!used.has('set') && f.set.value) {
    if (f.n >= 2 && share(f.set, f.n) >= DOMINANT) parts.push(`from ${f.set.value}`);
    else if (f.set.distinct >= 3) parts.push(`from ${numberWord(f.set.distinct)} sets`);
  }
  const lead = `${cap(numberWord(f.n))} card${f.n === 1 ? '' : 's'}`;
  const description = parts.length ? `${lead}: ${list(parts.slice(0, 2))}.` : f.n === 1 ? `${cap(f.names[0] ?? cards[0].name)}.` : `${lead}: ${list(f.names.slice(0, 4).map(cap))}.`;
  return { title, description };
}

/** The binder's title and description, from every page's cards (pages in order). */
export function autoBinderText(pages: readonly (readonly NameCard[])[]): AutoText {
  const all = pages.flat();
  if (!all.length) return { title: '', description: '' };
  const f = pageFacts(all);
  const n = f.n;
  let title: string;
  if (share(f.species, n) >= 0.4 && f.species.count >= 2) title = `${cap(f.species.value)} collection`;
  else if (f.line && f.line.present >= 2 && share({ count: all.filter((c) => c.evolutionLine.join('>') === f.line!.stages.join('>')).length }, n) >= 0.4) title = `The ${cap(f.line.stages[0])} line`;
  else if (share(f.artist, n) >= DOMINANT && f.artist.count >= 3) title = `${f.artist.value} collection`;
  else if (share(f.type, n) >= DOMINANT && n >= 3) title = `${f.type.value} binder`;
  else if (share(f.set, n) >= DOMINANT && n >= 3) title = `${f.set.value} binder`;
  else {
    const two = f.names.slice(0, 2).map(cap);
    title = f.names.length > 2 ? `${two[0]} and friends` : list(two);
  }
  const filled = pages.filter((p) => p.length).length;
  const featuring = f.names.slice(0, 3).map(cap);
  const extra = f.names.length > 3 ? ` and ${f.names.length - 3} more` : '';
  const typeBit = f.type.value && share(f.type, n) >= 0.4 ? `, mostly ${f.type.value}` : '';
  const description = `${cap(numberWord(n))} card${n === 1 ? '' : 's'} on ${numberWord(filled)} page${filled === 1 ? '' : 's'}: ${extra ? featuring.join(', ') : list(featuring)}${extra}${typeBit}.`;
  return { title, description };
}
