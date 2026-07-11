/**
 * Pokémon → partner-Pokémon knowledge, from two sources:
 *
 *  1. `POKEMON_PARTNERS` — curated groups of species that canonically belong together
 *     (version-mascot duos/trios, counterpart pairs, famous rivalries/friendships).
 *  2. Card-name co-appearances — a multi-Pokémon card name is PROOF those species share the
 *     card's art ("Gengar & Mimikyu-GX" definitely shows both), so TAG TEAM / duo prints are
 *     parsed as associations for free. `speciesInName` extracts every species a name mentions.
 *
 * Like trainerPartners, this is deliberately plain data + pure functions — slated to move
 * upstream into the tcgscan-data server (`pokemon_partners` + a parsed `card_species` table);
 * keep it JSON-serializable.
 */
import { hasToken } from '@/data/nameMatch';
import type { Catalog, CatalogCard } from '@/lib/catalog';

/** Curated groups — every member is associated with every other member of its group. */
export const POKEMON_PARTNERS: string[][] = [
  // mascots & famous friendships / rivalries
  ['pikachu', 'eevee'],
  ['pikachu', 'meowth'],
  ['pikachu', 'togepi'],
  ['gengar', 'mimikyu'],
  ['jigglypuff', 'clefairy'],
  ['plusle', 'minun'],
  ['pichu', 'pikachu', 'raichu'],
  ['mew', 'mewtwo'],
  ['nidoran♀', 'nidoran♂', 'nidoqueen', 'nidoking'],
  ['zangoose', 'seviper'],
  ['sawk', 'throh'],
  ['heatmor', 'durant'],
  ['mawile', 'sableye'],
  ['solrock', 'lunatone'],
  ['illumise', 'volbeat'],
  ['gothitelle', 'reuniclus'],
  ['escavalier', 'accelgor'],
  ['slowpoke', 'shellder', 'slowbro', 'slowking'],
  ['remoraid', 'mantine', 'octillery'],
  ['falinks', 'copperajah'],
  ['charizard', 'blastoise', 'venusaur'],
  ['tyranitar', 'salamence', 'metagross', 'garchomp', 'hydreigon', 'dragapult'],
  // legendary duos / trios / quartets
  ['latias', 'latios'],
  ['lugia', 'ho-oh'],
  ['articuno', 'zapdos', 'moltres'],
  ['raikou', 'entei', 'suicune'],
  ['groudon', 'kyogre', 'rayquaza'],
  ['regirock', 'regice', 'registeel', 'regigigas', 'regieleki', 'regidrago'],
  ['dialga', 'palkia', 'giratina', 'arceus'],
  ['uxie', 'mesprit', 'azelf'],
  ['reshiram', 'zekrom', 'kyurem'],
  ['cobalion', 'terrakion', 'virizion', 'keldeo'],
  ['tornadus', 'thundurus', 'landorus', 'enamorus'],
  ['xerneas', 'yveltal', 'zygarde'],
  ['solgaleo', 'lunala', 'necrozma', 'cosmog', 'cosmoem'],
  ['tapu koko', 'tapu lele', 'tapu bulu', 'tapu fini'],
  ['zacian', 'zamazenta', 'eternatus'],
  ['glastrier', 'spectrier', 'calyrex'],
  ['koraidon', 'miraidon'],
  ['ogerpon', 'terapagos'],
  ['ting-lu', 'chien-pao', 'wo-chien', 'chi-yu'],
];

/** Curated partners of a species (lowercase), excluding itself. */
export function curatedPartners(species: string): string[] {
  const s = species.toLowerCase();
  const out = new Set<string>();
  for (const group of POKEMON_PARTNERS) {
    if (group.includes(s)) {
      for (const member of group) if (member !== s) out.add(member);
    }
  }
  return [...out];
}

/**
 * Species vocabulary for name parsing, built from the catalog's evolution-line enrichment
 * (every family member of every card) plus the curated groups. Built once per catalog.
 */
const vocabCache = new WeakMap<Catalog, string[]>();
export function speciesVocab(catalog: Catalog): string[] {
  const cached = vocabCache.get(catalog);
  if (cached) return cached;
  const set = new Set<string>();
  for (const card of catalog.listAll()) {
    for (const species of card.evolutionLine) set.add(species.toLowerCase());
  }
  for (const group of POKEMON_PARTNERS) for (const s of group) set.add(s);
  // Longest-first so compound names ("mr. mime", "tapu koko") win before their fragments.
  const vocab = [...set].sort((a, b) => b.length - a.length);
  vocabCache.set(catalog, vocab);
  return vocab;
}

/**
 * Every species a card NAME mentions — for a multi-Pokémon print this is proof the art shows
 * them together ("Gengar & Mimikyu-GX" → ['gengar','mimikyu']). Boundary-aware, so "Mewtwo"
 * never yields "mew".
 */
export function speciesInName(name: string, vocab: string[]): string[] {
  const out: string[] = [];
  for (const species of vocab) {
    if (hasToken(name, species)) {
      // Skip fragments of an already-matched longer species ("mime jr." vs "mr. mime" overlap
      // is fine — only suppress when the shorter is a substring of a matched longer name).
      if (!out.some((m) => m.includes(species))) out.push(species);
    }
  }
  return out;
}

/**
 * Species that co-appear with `species` on multi-Pokémon card names across the catalog —
 * the parsed complement to the curated groups (TAG TEAMs, duo promos, …).
 */
export function coAppearingSpecies(species: string, catalog: Catalog): string[] {
  const s = species.toLowerCase();
  const vocab = speciesVocab(catalog);
  const out = new Set<string>();
  for (const card of catalog.listAll()) {
    if (!hasToken(card.name, s)) continue;
    const mentioned = speciesInName(card.name, vocab);
    if (mentioned.length < 2) continue; // single-species name → no co-appearance proof
    for (const other of mentioned) if (other !== s) out.add(other);
  }
  return [...out];
}

/** All partners of a species: curated groups first, then parsed co-appearances. */
export function partnersFor(species: string, catalog: Catalog): string[] {
  const curated = curatedPartners(species);
  const seen = new Set(curated);
  const parsed = coAppearingSpecies(species, catalog).filter((s) => !seen.has(s));
  return [...curated, ...parsed];
}

/** Convenience: the species set for a specific card (its name parsed against the vocab). */
export function speciesInCard(card: CatalogCard, catalog: Catalog): string[] {
  return speciesInName(card.name, speciesVocab(catalog));
}
