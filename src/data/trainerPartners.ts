/**
 * Trainer → partner-Pokémon knowledge, served by the shared tcgscan-data server
 * (`trainer_partners` table — see tcgscan-data supabase/migrations/20260711_19_partner_tables.sql,
 * where the curated rows live). Powers the composer's "Trainer page" (michi Trainer method).
 *
 * Row shape:
 *  - `signature` — the partner(s) the trainer is famous for; first entry is THE one.
 *  - `pokemon`   — other Pokémon they canonically own, vibe with, or are strongly associated with.
 *  - `associates`— other trainers they're canonically linked with (future: cross-trainer pages).
 *  - `tokens`    — name-match overrides for risky short names ("N" only matches "N's …").
 *
 * Load-once fetch with a sync snapshot (same pattern as prices): callers kick off
 * `loadTrainerPartners()` (the AutoFill sheet does, on open) and the sync lookups read whatever
 * has arrived. Fails soft to an empty table — the Trainer method just doesn't appear.
 */
import { getApiKey, getApiUrl } from 'tcgscan-browse';

import { hasToken } from '@/data/nameMatch';

export interface TrainerEntry {
  /** Canonical display name, e.g. "Misty". */
  name: string;
  /** Iconic partner(s), most famous first. */
  signature: string[];
  /** Other canonical team members / associations. */
  pokemon: string[];
  /** Trainers they're canonically linked with. */
  associates?: string[];
  /** Name-match overrides (defaults to the lowercase name). */
  tokens?: string[];
}

let loadPromise: Promise<void> | null = null;
let trainers: TrainerEntry[] = [];

/** Load-once fetch of the trainer_partners table (shared by every caller). */
export function loadTrainerPartners(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const res = await fetch(`${getApiUrl()}/trainer_partners?select=*`, {
          headers: { apikey: getApiKey() },
        });
        if (!res.ok) return;
        const rows = (await res.json()) as {
          name: string;
          signature: string[] | null;
          pokemon: string[] | null;
          associates: string[] | null;
          tokens: string[] | null;
        }[];
        trainers = rows.map((r) => ({
          name: r.name,
          signature: r.signature ?? [],
          pokemon: r.pokemon ?? [],
          associates: r.associates ?? [],
          tokens: r.tokens ?? undefined,
        }));
      } catch {
        // fail-soft: the Trainer method simply isn't offered
      }
    })();
  }
  return loadPromise;
}

/** The loaded table (empty until loadTrainerPartners resolves). */
export function trainerPartnersSnapshot(): TrainerEntry[] {
  return trainers;
}

/** Find the trainer a card name references, or null. Longest token wins across entries. */
export function trainerFor(cardName: string): TrainerEntry | null {
  const n = cardName.toLowerCase();
  let best: { entry: TrainerEntry; len: number } | null = null;
  for (const entry of trainers) {
    for (const token of entry.tokens ?? [entry.name.toLowerCase()]) {
      if ((n === token || hasToken(n, token)) && (!best || token.length > best.len)) {
        best = { entry, len: token.length };
      }
    }
  }
  return best?.entry ?? null;
}
