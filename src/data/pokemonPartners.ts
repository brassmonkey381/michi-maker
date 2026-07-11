/**
 * Pokémon → partner-Pokémon knowledge, from two sources:
 *
 *  1. Curated groups served by the shared tcgscan-data server (`pokemon_partner_groups` table —
 *     see tcgscan-data supabase/migrations/20260711_19_partner_tables.sql): species that
 *     canonically belong together (mascot duos, counterpart pairs, legendary trios/quartets).
 *  2. Card-name co-appearances, parsed locally — a multi-Pokémon card name is PROOF those
 *     species share the card's art ("Gengar & Mimikyu-GX" definitely shows both), so TAG TEAM /
 *     duo prints are parsed as associations for free and stay correct as the catalog grows.
 *
 * Groups use the same load-once + sync-snapshot pattern as trainerPartners; fails soft to
 * empty (the Friends method just doesn't appear).
 */
import { getApiKey, getApiUrl } from 'tcgscan-browse';

import { hasToken } from '@/data/nameMatch';
import type { Catalog, CatalogCard } from '@/lib/catalog';

let loadPromise: Promise<void> | null = null;
let partnerGroups: string[][] = [];

/** Load-once fetch of the pokemon_partner_groups table (shared by every caller). */
export function loadPokemonPartners(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const res = await fetch(`${getApiUrl()}/pokemon_partner_groups?select=members&order=id`, {
          headers: { apikey: getApiKey() },
        });
        if (!res.ok) return;
        const rows = (await res.json()) as { members: string[] | null }[];
        partnerGroups = rows.map((r) => r.members ?? []).filter((m) => m.length > 1);
      } catch {
        // fail-soft: curated groups stay empty (name-parsed co-appearances still work)
      }
    })();
  }
  return loadPromise;
}

/** The loaded groups (empty until loadPokemonPartners resolves). */
export function partnerGroupsSnapshot(): string[][] {
  return partnerGroups;
}

/** Curated partners of a species (lowercase), excluding itself. */
export function curatedPartners(species: string): string[] {
  const s = species.toLowerCase();
  const out = new Set<string>();
  for (const group of partnerGroups) {
    if (group.includes(s)) {
      for (const member of group) if (member !== s) out.add(member);
    }
  }
  return [...out];
}

/**
 * Species vocabulary for name parsing, built from the catalog's evolution-line enrichment
 * (every family member of every card) plus the curated groups. Cached per catalog + groups
 * snapshot (the groups arrive async, so the cache invalidates when they land).
 */
let vocabCache: { catalog: Catalog; groups: string[][]; vocab: string[] } | null = null;
export function speciesVocab(catalog: Catalog): string[] {
  if (vocabCache && vocabCache.catalog === catalog && vocabCache.groups === partnerGroups) {
    return vocabCache.vocab;
  }
  const set = new Set<string>();
  for (const card of catalog.listAll()) {
    for (const species of card.evolutionLine) set.add(species.toLowerCase());
  }
  for (const group of partnerGroups) for (const s of group) set.add(s);
  // Longest-first so compound names ("mr. mime", "tapu koko") win before their fragments.
  const vocab = [...set].sort((a, b) => b.length - a.length);
  vocabCache = { catalog, groups: partnerGroups, vocab };
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
