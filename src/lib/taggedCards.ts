/**
 * THE TAGGED SET: every captioned card with its scene tags in published rank order, read in bulk
 * through this app project's `theme-search` function. Three tools plan from it: the Story Binder
 * (whole binders by theme), Build a binder (a share of scene pages among the clusters) and the
 * fill sheet's "Same scene" method (a page around one card's picture).
 *
 * The artwork captions left the catalog bundle on 2026-09-07, so the in-memory catalog no longer
 * carries `sceneTags` and anything that scores cards by theme has to be fed from the server. The
 * data project's `tagged_cards` RPC (its migration 44) returns exactly the planner's slice,
 * ordered by id and paged by offset; execute on it is granted to service_role alone, so the only
 * way in is the entitled hop: theme-search checks the ledger and forwards with the data project's
 * key. A caller the function refuses (guest, free) gets `null` from the shared loader, and the
 * tools offer no scene pages rather than empty ones.
 *
 * The default set is the blind run (about 1.5k cards); `p_all` would add the older crawl on
 * non-full-art cards, which is noise for a themed page and is not asked for.
 *
 * ONE READ PER SESSION. The set is a few hundred KB and changes only when the pipeline publishes,
 * so `loadTaggedCards` caches the promise for the life of the page; a failed read is forgotten so
 * the next opening retries.
 */
import { useEffect, useState } from 'react';

import type { StoryCard } from '@/data/storyBinder';
import { freshToken } from '@/lib/catalogSource';
import { supabaseUrl } from '@/lib/env';

interface TaggedRow {
  id: number | string;
  name: string;
  rarity: string | null;
  illustrator: string | null;
  set_name?: string | null;
  number?: string | null;
  full_art_kind?: string | null;
  evolution_line?: string[] | null;
  language?: string | null;
  scene_tags: string[] | null;
  total_count: number | string;
}

const PAGE = 500;

export class TaggedCardsError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

/** Every tagged card, planner-shaped. Throws TaggedCardsError (403: not entitled) on refusal. */
export async function fetchTaggedCards(): Promise<StoryCard[]> {
  if (!supabaseUrl) throw new TaggedCardsError(0, 'Supabase is not configured.');
  const token = await freshToken();
  if (!token) throw new TaggedCardsError(401, 'Sign in to build from scenes.');
  const out: StoryCard[] = [];
  let offset = 0;
  for (;;) {
    const res = await fetch(`${supabaseUrl}/functions/v1/theme-search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rpc: 'tagged_cards', p_limit: PAGE, p_offset: offset }),
    });
    if (res.status === 401 || res.status === 403) throw new TaggedCardsError(res.status, 'Scene pages come with PRO and VIP.');
    if (!res.ok) throw new TaggedCardsError(res.status, 'The tagged cards could not be loaded. Try again in a moment.');
    const rows = (await res.json()) as TaggedRow[];
    for (const r of rows) {
      out.push({
        id: String(r.id),
        name: r.name,
        rarity: r.rarity ?? '',
        illustrator: r.illustrator ?? undefined,
        sceneTags: r.scene_tags ?? [],
        evolutionLine: r.evolution_line ?? undefined,
        language: r.language ?? undefined,
      });
    }
    const total = Number(rows[0]?.total_count) || out.length;
    offset += rows.length;
    if (rows.length === 0 || offset >= total) break;
  }
  return out;
}

let cached: Promise<StoryCard[]> | null = null;

/**
 * The tagged set, read once and shared. Rejects like fetchTaggedCards (the Story Binder shows the
 * reason); a rejection is not cached, so the next caller retries.
 */
export function loadTaggedCards(): Promise<StoryCard[]> {
  if (!cached) {
    cached = fetchTaggedCards().catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}

/** Card id → its scene tags, strongest first. Empty when the read was refused or failed. */
export type SceneTagMap = ReadonlyMap<string, readonly string[]>;

export function sceneTagMap(cards: readonly StoryCard[]): SceneTagMap {
  const m = new Map<string, readonly string[]>();
  for (const c of cards) if (c.sceneTags && c.sceneTags.length > 0) m.set(c.id, c.sceneTags);
  return m;
}

const EMPTY: SceneTagMap = new Map();

/**
 * The tag map for a tool that can do without it: `null` while loading, the (possibly empty) map
 * once the read has settled. A refusal settles to an empty map, silently: the tools that use this
 * simply offer no scene pages, and the plans table says why.
 */
export function useSceneTags(active: boolean): SceneTagMap | null {
  const [map, setMap] = useState<SceneTagMap | null>(null);
  useEffect(() => {
    if (!active || map) return;
    let live = true;
    loadTaggedCards().then(
      (cards) => { if (live) setMap(sceneTagMap(cards)); },
      () => { if (live) setMap(EMPTY); },
    );
    return () => { live = false; };
  }, [active, map]);
  return map;
}
