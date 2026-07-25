/**
 * eBay Partner Network affiliate links — the "link out to eBay" monetization path.
 *
 * We ONLY link out (a tracked deep link); there is no eBay API, backend, or permission
 * flow involved. eBay attributes a resulting sale to campaign 5339173456 ("TCGScan",
 * shared by tcgscan.ai + michi-maker) via the smart-link params below. Those params were
 * confirmed straight from EPN's own link generator for the US marketplace (site 0):
 * `mkevt=1` + `mkcid`/`mkrid` are what actually make click attribution fire — a bare
 * `campid` on a plain eBay URL does not track. `customid` segments EPN reporting by the
 * surface the click came from, so it's a required arg here.
 *
 * NOTE: this is a per-app copy of tcgscan-app's src/lib/ebay.ts (same campaign, different
 * customids). When the two apps' tcgscan-browse pins converge, lift this into the shared
 * kit and pass the surface in — until then each app keeps its own copy.
 */

/** EPN campaign id — "TCGScan" (shared across both apps). */
const CAMPID = '5339173456';

/** eBay's "Pokémon TCG" category. Scoping a search to it via `_sacat` keeps results on
 *  cards instead of sealed/lots/accessories. */
const POKEMON_TCG_CATEGORY = '2536';

/**
 * Which michi-maker surface a click originated from — becomes the EPN `customid` so
 * reporting can attribute sales per surface without juggling multiple campaigns.
 */
export type EbaySurface = 'michi-browse' | 'michi-collection';

/** The fixed US-marketplace tracking tail (everything after the base URL's own params). */
function trackingTail(surface: EbaySurface): string {
  return [
    'mkcid=1',
    'mkrid=711-53200-19255-0',
    'siteid=0',
    `campid=${CAMPID}`,
    `customid=${encodeURIComponent(surface)}`,
    'toolid=10001',
    'mkevt=1',
  ].join('&');
}

/** Build a search query for a card from its display fields (name + set + collector number),
 *  dropping the blanks — the more specific, the tighter the eBay results. */
export function ebayCardQuery(name: string, setName?: string | null, number?: string | null): string {
  return [name, setName, number].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
}

/**
 * A tracked eBay search deep link for `query`, scoped to the Pokémon TCG category.
 * `surface` sets the EPN customid. Use this for per-card "Find on eBay" links.
 */
export function ebaySearchLink(query: string, surface: EbaySurface): string {
  const q = query.trim();
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=${POKEMON_TCG_CATEGORY}&${trackingTail(surface)}`;
}
