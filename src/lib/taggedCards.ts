/**
 * THE TAGGED SET, for the Story Binder planner: every captioned card with its scene tags in
 * published rank order, read in bulk through this app project's `theme-search` function.
 *
 * The artwork captions left the catalog bundle on 2026-09-07, so the in-memory catalog no longer
 * carries `sceneTags` and the planner (which scores every tagged card against every theme in one
 * pass) has to be fed from the server. The data project's `tagged_cards` RPC (its migration 44)
 * returns exactly the planner's slice, ordered by id and paged by offset; execute on it is granted
 * to service_role alone, so the only way in is the entitled hop: theme-search checks the ledger
 * and forwards with the data project's key. A caller the function refuses (guest, free) gets an
 * error here, not an empty binder.
 *
 * The default set is the blind run (about 1.5k cards); `p_all` would add the older crawl on
 * non-full-art cards, which is noise for a themed binder and is not asked for.
 */
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
  if (!token) throw new TaggedCardsError(401, 'Sign in to build a story binder.');
  const out: StoryCard[] = [];
  let offset = 0;
  for (;;) {
    const res = await fetch(`${supabaseUrl}/functions/v1/theme-search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rpc: 'tagged_cards', p_limit: PAGE, p_offset: offset }),
    });
    if (res.status === 403) throw new TaggedCardsError(403, 'Story binders are a PRO feature.');
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
