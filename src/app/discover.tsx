/**
 * Discover — everyone's public binders. Two views share one screen:
 *
 *   • TYPED QUERY — the debounced `search_binders` RPC (title / description / page titles / owner @username).
 *   • NO QUERY (the default) — Public binders, ordered by likes or by when they were made public
 *     (the reader picks; likes is the default), then the house account's own reference binders,
 *     which are deliberately last, then one card pointing at the contest.
 *
 * THE CONTEST LIVES ON /contest-binders (owner call, 2026-09-15). Its category boards and entry
 * feed used to sit at the top of this page, above the search box, so everyone who came here to
 * search scrolled past them; and the field had no page of its own to link to. What is left here is
 * the card at the bottom. Contest entries are ordinary public binders again in the shelf above —
 * nothing shows them twice now, so nothing needs to exclude them.
 *
 * Results render as a responsive grid of the shared BinderThumb; tapping one opens `/binder/[id]`.
 * Guests can browse too (every RPC here is granted to anon) — this is discovery, not a personal
 * surface. Reached from the web rail's Explore group and, where the rail is hidden, the Home
 * quick-nav.
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { expandThemeFields, parseQuery, searchCards, srgbToLab } from 'tcgscan-browse';

import { cardsInFamily, PAGE_MATCH_MIN_CARDS, PAGE_MATCH_SHARE } from '@/data/colourFamilies';
import { loadedColorIndexes, loadPokemonColorIndexes } from '@/lib/colorIndexes';

import { AccountButton } from '@/components/auth/AccountButton';
import { PeopleSearch } from '@/components/people/PeopleSearch';
import { flag } from '@/lib/flags';
import { BinderCoverGrid } from '@/components/binder/BinderCoverGrid';
import { BinderThumb } from '@/components/binder/BinderThumb';
import { Seg } from '@/components/binder/inspector/controls';
import { CurateCallout } from '@/components/CurateCallout';
import { PagedCarousel } from '@/components/PagedCarousel';
import { ProfileAvatarButton, TILE_AVATAR } from '@/components/people/ProfileAvatarButton';
import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { CONTEST, contestPhase } from '@/data/contest';
import { discoverHref, shelfFromParam } from '@/data/backLink';
import {
  BottomTabInset,
  FontSize,
  MaxContentWidthWide,
  Palette,
  Radius,
  Spacing,
} from '@/constants/theme';
import {
  fetchDiscoverBinders,
  fetchDiscoverPage,
  OFFICIAL_AUTHOR,
  searchBindersPage,
  searchBindersByCardsRows,
  searchBinderPagesByShares,
  discoverByQuery,
  hydrateRankedBinders,
  type RankedBinderRow,
  type BinderListCursor,
  type DiscoverSort,
} from '@/data/binderRepo';
import type { DemoBinder } from '@/data/binderTypes';
import { fetchAvatarsByUsername } from '@/data/profileRepo';
import { isSupabaseConfigured } from '@/lib/env';
import { useImageManifest } from '@/lib/catalogConfig';

const GRID_GAP = Spacing.four;
const MIN_TILE = 220;

/**
 * THE THREE SHELVES ARE CAROUSELS, ONE SCREENFUL PER SLOT.
 *
 * Contest entries, Public binders and From michi-maker each rendered every row they had, one under
 * the next. Three open-ended grids on one page means the third heading starts below however many
 * binders the first two happened to return — the house shelf was a scroll away on a good week —
 * and a reader looking for the sections has to scroll past the contents to find them.
 *
 * Ten tiles a slot (5 × 2) is a shelf you can take in at a glance, and every heading stays within
 * a screen of the last. 5 rather than the 6 the grid fits at 1440 because a wider tile reads its
 * cover better, and the arithmetic is the same one the grid already does: the column count only
 * falls below 5 when the tiles would go under MIN_TILE.
 */
const SHELF_COLS = 5;
const SHELF_ROWS = 2;

/**
 * Slice `items` into carousel pages of `perPage`, each a wrapped grid of `tile(item)`.
 *
 * The tile callback returns a keyed element (the caller knows the id); the page `View` is keyed by
 * its start index, which is stable for a given list and ordering.
 */
function shelfPages<T>(items: T[], perPage: number, tile: (item: T) => ReactNode): ReactNode[] {
  const pages: ReactNode[] = [];
  for (let i = 0; i < items.length; i += perPage) {
    pages.push(
      <View key={i} style={[styles.grid, styles.shelfPage, { gap: GRID_GAP }]}>
        {items.slice(i, i + perPage).map(tile)}
      </View>,
    );
  }
  return pages;
}

/**
 * The orderings offered for the "everything else" section. This list is the chip ORDER only — the
 * default lives where the state is initialised (`useState<DiscoverSort>` below), so change it
 * there, not by reordering this.
 *
 * The default is "recently public" (owner, 2026-09-29). It used to be "most liked", on the
 * argument that a first-time visitor should meet the community's best work. What that actually
 * produced was a shelf that barely moves: the same few binders hold the top of a leaderboard, so
 * a reader who comes back a week later sees the page they already saw, and a binder published
 * today has to climb past them to be seen at all. Recency gives every new binder its day at the
 * front and gives returning readers a reason to return. "Most liked" is still one chip away.
 */
const SORTS: { key: DiscoverSort; label: string }[] = [
  { key: 'recent', label: 'Recently public' },
  { key: 'likes', label: 'Most liked' },
];

/** Fewest letters that run a search. See the note where the search fires. */
const MIN_QUERY = 2;

/** The public binders loaded so far, per ordering, kept across this page's unmounts (see `shelfCache` below). */
const shelfCache = new Map<DiscoverSort, { binders: DemoBinder[]; next: BinderListCursor | null; at: number }>();
const SHELF_CACHE_MS = 10 * 60 * 1000;
const keptShelf = (sort: DiscoverSort) => {
  const kept = shelfCache.get(sort);
  return kept && Date.now() - kept.at < SHELF_CACHE_MS ? kept : undefined;
};

/**
 * SEARCH RESULTS, A PAGE AT A TIME (owner, 2026-11-11: "it takes a long time to load every binder
 * because we display a huge grid amount at once ... land in a carousel that scrolls left/right and
 * has Load more binders"). The ranking arrives whole (`rows`, cheap: ids and scores); each binder's
 * tile loads only when its carousel page is reached, `batch` at a time. The feed's own shapes: a
 * paged carousel on wider screens, a two-across grid on a phone, Load more under both. `extra` are
 * binders found another way (title matches), shown after every ranked row, with their own next page.
 */
function RankedResults({
  rows,
  extra,
  extraNext,
  onMoreExtra,
  moreExtraBusy,
  batch,
  phone,
  contentW,
  tileW,
  perShelf,
  onOpen,
  testID,
}: {
  rows: readonly RankedBinderRow[];
  extra?: readonly DemoBinder[];
  extraNext?: boolean;
  onMoreExtra?: () => void;
  moreExtraBusy?: boolean;
  batch: number;
  phone: boolean;
  contentW: number;
  tileW: number;
  perShelf: number;
  onOpen: (b: DemoBinder) => void;
  testID: string;
}) {
  const [shown, setShown] = useState<{ upTo: number; binders: DemoBinder[] }>({ upTo: 0, binders: [] });
  const [busy, setBusy] = useState(false);
  const loadRows = (from: number) => {
    if (busy || from >= rows.length) return;
    setBusy(true);
    const slice = rows.slice(from, from + batch);
    hydrateRankedBinders([...slice])
      .then((more) => setShown((cur) => (cur.upTo === from ? { upTo: from + slice.length, binders: [...cur.binders, ...more] } : cur)))
      .catch(() => setShown((cur) => (cur.upTo === from ? { ...cur, upTo: from + slice.length } : cur)))
      .finally(() => setBusy(false));
  };
  // The first page, once (the list is keyed by its query, so a new search is a new list).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    loadRows(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rowsLeft = shown.upTo < rows.length;
  const ranked = new Set(rows.map((r) => r.binder_id));
  const list = rowsLeft ? shown.binders : [...shown.binders, ...(extra ?? []).filter((b) => !ranked.has(b.id))];
  const more = rowsLeft || !!extraNext;
  const loadMore = () => (rowsLeft ? loadRows(shown.upTo) : onMoreExtra?.());
  const tile = (b: DemoBinder) => (
    <BinderThumb key={b.id} binder={b} width={phone ? tileW : tileW} matchPages={b.matchPages} onPress={() => onOpen(b)} />
  );
  if (!list.length) {
    return busy || rowsLeft ? (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    ) : null;
  }
  return (
    <View testID={testID}>
      {phone ? (
        <View style={[styles.grid, { gap: GRID_GAP }]}>{list.map(tile)}</View>
      ) : (
        <PagedCarousel
          width={contentW}
          prevLabel="Previous binders"
          nextLabel="More binders"
          onReachEnd={more ? loadMore : undefined}
          pages={shelfPages(list, perShelf, tile)}
        />
      )}
      {more ? <LoadMore busy={busy || !!moreExtraBusy} onPress={loadMore} testID={`${testID}-more`} /> : null}
    </View>
  );
}

/** "Load more": the next page of a list that has one. */
function LoadMore({ busy, onPress, testID }: { busy: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      testID={testID}
      style={({ pressed }) => [styles.moreBtn, (pressed || busy) && styles.moreBtnDim]}>
      {busy ? <ActivityIndicator size="small" /> : null}
      <ThemedText type="smallBold">{busy ? 'Loading…' : 'Load more binders'}</ThemedText>
    </Pressable>
  );
}

/** MIC-017 piece 8 ('dev'): card-ranked search, colour and theme, Binders | Makers. */
const DISCOVER_V2 = flag('discover-v2');
/** The colours Discover offers, with a name to say back. */
const SWATCHES = [
  { hex: '#d93b30', name: 'red' },
  { hex: '#f08a24', name: 'orange' },
  { hex: '#f2c94c', name: 'yellow' },
  { hex: '#3fa34d', name: 'green' },
  { hex: '#2f8fe0', name: 'blue' },
  { hex: '#8e5bd1', name: 'purple' },
  { hex: '#e86fae', name: 'pink' },
  { hex: '#2b2b33', name: 'black' },
] as const;
/**
 * A search as cards: the card server answers the query (names, theme:, the full grammar), and the
 * binders those cards fill most come back ranked. Null when there is nothing to rank by.
 */
/** A search body for the card server's search_cards. */
function cardSearchBody(parsed: ReturnType<typeof parseQuery>, fields: ReturnType<typeof parseQuery>['fields']): Record<string, unknown> {
  return {
    p_words: parsed.words,
    p_fields: expandThemeFields(fields, { on: true, game: 'pokemon' }).fields,
    p_compares: parsed.comparisons.map((c) => ({ field: c.field, op: c.op, value: c.value })),
    p_facets: null,
    p_min_price: parsed.minPrice,
    p_max_price: parsed.maxPrice,
    p_sort: parsed.sort,
    p_dir: parsed.sortDir,
    p_limit: 400,
    p_offset: 0,
  };
}

async function rankByCards(q: string): Promise<RankedBinderRow[] | null> {
  const parsed = parseQuery(q);
  // PLAIN WORDS ARE ALSO WHAT THE ART SHOWS (owner, 2026-11-11: search binders by theme, scenery,
  // art style). "watercolor" or "rainy city" with no field words is asked twice: as words (names,
  // card text) and as themes (every word must be in the art); the name matches lead.
  const plain = parsed.words.length > 0 && parsed.fields.length === 0 && parsed.comparisons.length === 0;
  const [byWords, byArt] = await Promise.all([
    discoverByQuery(cardSearchBody(parsed, parsed.fields)),
    plain
      ? discoverByQuery(cardSearchBody({ ...parsed, words: [] }, parsed.words.map((w) => ({ key: 'theme', value: w }))))
      : Promise.resolve(null),
  ]);
  const viaServer = byWords || byArt ? [...(byWords ?? []), ...(byArt ?? []).filter((x) => !(byWords ?? []).some((y) => y.binder_id === x.binder_id))] : null;
  if (viaServer) return viaServer;
  try {
    const page = await searchCards(parseQuery(q), { limit: 400 });
    if (page.failed || !page.cards.length) return null;
    return await searchBindersByCardsRows(page.cards.map((c) => c.id), 60);
  } catch {
    return null;
  }
}

export default function DiscoverScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  // The scroller's own width, which is the window minus the navigation rail. Only accepted on a
  // real change so a sub-pixel wobble cannot loop; set from an event, never from an effect.
  const [frameW, setFrameW] = useState(0);
  const measureFrame = (w: number) => setFrameW((cur) => (Math.abs(cur - w) > 1 ? Math.round(w) : cur));
  // The way back rides in the address, so it survives a reload and a new tab.
  // A search result opens at its first matching page (MIC-017 piece 8, owner 2026-11-11).
  const openBinder = (id: string, page?: number) =>
    router.push(`/binder/${id}?back=${encodeURIComponent(returnTo.current)}${page ? `&page=${page}` : ''}` as Href);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DemoBinder[] | null>(null);
  // MIC-017 piece 8: binders ranked by how much of them the search's cards fill (null: not ranked).
  const [cardHits, setCardHits] = useState<RankedBinderRow[] | null>(null);
  const [colour, setColour] = useState<(typeof SWATCHES)[number] | null>(null);
  const [colourHits, setColourHits] = useState<RankedBinderRow[] | 'unavailable' | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const reqId = useRef(0);
  // A PAGE AT A TIME (2026-09-20). Both lists used to stop at 40 with no way past: the 41st public
  // binder existed only for someone who searched for it. Each list now remembers where it left
  // off (`next`, null when finished) and "Load more" asks for the rows after it.
  const [resultsNext, setResultsNext] = useState<BinderListCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState<'results' | 'others' | null>(null);
  /** Append a page, never a binder twice: likes move while someone reads, so a row can recur. */
  const appended = (have: DemoBinder[] | null, more: DemoBinder[]) => {
    const seen = new Set((have ?? []).map((b) => b.id));
    return [...(have ?? []), ...more.filter((b) => !seen.has(b.id))];
  };

  // Whether to show the card at the bottom that points at /contest-binders. The contest's own
  // views live there; this page only advertises it while a contest is running.
  const contestOn = contestPhase() !== 'ended' && contestPhase() !== 'upcoming' && isSupabaseConfigured;

  /**
   * THE SHELF POSITION AND THE ORDERING LIVE IN THE URL.
   *
   * `/discover?sort=likes&shelf=3`. They were held in a module-level Map, which worked and was the
   * wrong shape: nothing showed in the address bar, so a reload or a middle-click into a new tab
   * lost the position, and there was no way to see the state or tell whether it had worked.
   *
   * Both are read ONCE, as the initial state. Re-reading them would fight the reader: `setParams`
   * below rewrites the address as they page, and feeding that back in would make the carousel jump
   * to wherever the address said on the last render.
   */
  const params = useLocalSearchParams<{ sort?: string; shelf?: string }>();
  const [initialShelf] = useState(() => shelfFromParam(params.shelf));

  // The default ordering for public binders — see SORTS above for why it is recency.
  const [sort, setSort] = useState<DiscoverSort>(() =>
    (SORTS.some((s) => s.key === params.sort) ? (params.sort as DiscoverSort) : 'recent'));

  /**
   * The address a binder opened from here should come back to. Kept in a ref, not state: it
   * changes on every swipe and nothing renders from it, so making it state would re-render the
   * whole page for each one.
   */
  const returnTo = useRef(discoverHref(sort, initialShelf));
  const rememberShelf = (page: number) => {
    returnTo.current = discoverHref(sort, page);
    // `setParams` rewrites the current history entry rather than pushing one, so paging a shelf
    // does not fill the back button with a trail of shelf positions.
    router.setParams({ sort, shelf: page > 0 ? String(page) : undefined });
  };
  // THE LIST SURVIVES A LOOK AT A BINDER (owner, 2026-11-04). This page is unmounted the moment
  // a binder opens (the root layout is a Slot), so without this a return refetched page one and
  // every page that "load more" had added was gone, while the address still asked for shelf
  // seven. The shelf position rides in the address; the pages ride here, per ordering, for a
  // while: a stale like count on the way back is fine, a list that forgot is not.
  const [others, setOthers] = useState<DemoBinder[] | null>(() => keptShelf(sort)?.binders ?? null);
  const [othersNext, setOthersNext] = useState<BinderListCursor | null>(() => keptShelf(sort)?.next ?? null);
  useEffect(() => {
    if (others) shelfCache.set(sort, { binders: others, next: othersNext, at: Date.now() });
  }, [sort, others, othersNext]);

  // Re-fetches when the sort flips. Contest entries are INCLUDED here: since the contest moved to
  // its own page nothing else on Discover lists them, and leaving them out would hide public
  // binders from the one page that is meant to show every public binder. `others` is cleared to
  // null by the PRESS that changes the sort, so this effect only fetches and never sets state
  // synchronously. A fresh cached list (above) skips the fetch.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (keptShelf(sort)) return;
    let alive = true;
    fetchDiscoverPage(sort, { excludeAuthor: OFFICIAL_AUTHOR })
      .then((page) => {
        if (!alive) return;
        setOthers(page.binders);
        setOthersNext(page.next);
      })
      .catch(() => alive && setOthers([]));
    return () => {
      alive = false;
    };
  }, [sort]);

  // Avatars for the people whose binders are on show. Keyed by username because that is the only
  // thing a listed binder knows about its owner (`authorName`), and it is enough: the username is
  // also the profile's address. One query for the whole grid, resolved after the binders land so a
  // slow or failed avatar lookup never delays or blanks the tiles.
  const [avatars, setAvatars] = useState<Map<string, string | null>>(new Map());
  const authorNames = (others ?? []).map((b) => b.authorName).filter(Boolean) as string[];
  const authorKey = [...new Set(authorNames)].sort().join(',');
  useEffect(() => {
    if (!isSupabaseConfigured || !authorKey) return;
    let alive = true;
    fetchAvatarsByUsername(authorKey.split(','))
      .then((m) => alive && setAvatars(m))
      .catch(() => {
        /* no pictures; the lettered tiles still render */
      });
    return () => {
      alive = false;
    };
  }, [authorKey]);

  // The house account's own binders, kept out of the section above and shown last. Fetched once,
  // not re-fetched on the sort chips: this is a shelf of reference material rather than a ranking,
  // so newest-published is the only order it needs.
  const [house, setHouse] = useState<DemoBinder[] | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    fetchDiscoverBinders('recent', { author: OFFICIAL_AUTHOR, limit: 24 })
      .then((rows) => alive && setHouse(rows))
      .catch(() => alive && setHouse([]));
    return () => {
      alive = false;
    };
  }, []);

  // Covers resolve straight from card ids, so hydrate the lite image manifest for hashed URLs.
  useImageManifest();

  // Debounced search; the empty-query load (popular) also runs on first mount. When the backend
  // isn't configured we skip entirely — the render shows the "not available" note (results stay
  // null), so there's no synchronous setState here.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // Bump the request id even when we don't search, so an in-flight query that the user has
    // since cleared cannot land and repaint the grid behind the default sections.
    const id = ++reqId.current;
    // TWO LETTERS OR MORE. One letter matches nearly every title, and the trigram indexes that
    // make this search fast need three characters to narrow anything; two is the compromise
    // that still finds "XY". Below that the page keeps showing its shelves.
    if (query.trim().length < MIN_QUERY) return;
    const handle = setTimeout(async () => {
      try {
        const [page, ranked] = await Promise.all([
          searchBindersPage(query.trim()),
          DISCOVER_V2 ? rankByCards(query.trim()) : Promise.resolve(null),
        ]);
        if (id !== reqId.current) return; // a newer query superseded this one
        setResults(page.binders);
        setResultsNext(page.next);
        setCardHits(ranked);
      } catch {
        if (id === reqId.current) setResults([]);
      }
    }, 220);
    return () => clearTimeout(handle);
  }, [query]);

  /**
   * Responsive grid: cap the content column, then fit as many >=MIN_TILE tiles as the width allows.
   * Search results and a contest leaderboard stay plain grids — they are answers to a question the
   * reader asked, so they run as long as they need to.
   *
   * MEASURED, NOT DERIVED FROM THE WINDOW. This used to read `useWindowDimensions().width`, which
   * on web is the whole window and includes the navigation rail down the left. At 1280px that made
   * the column 1232 while the scroller was really 1016, so `perShelf` packed FIVE tiles onto a
   * shelf page where four fit: the fifth sat past the right edge and paging jumped a full page
   * over it, so roughly one binder in five could not be reached at all. Measuring the scroller
   * itself is also the only version that survives the rail changing width.
   *
   * The window width is the fallback for the first frame, before any layout has happened, so the
   * page renders something sane rather than a column of zero.
   */
  // Since the shared frame (MIC-017) the measured box is the column itself, inside the shell's
  // padding; only the window fallback still has the padding to take off.
  const contentW = frameW || Math.min(width, MaxContentWidthWide) - Spacing.four * 2;
  const cols = Math.max(2, Math.floor((contentW + GRID_GAP) / (MIN_TILE + GRID_GAP)));
  const tileW = Math.max(120, Math.floor((contentW - GRID_GAP * (cols - 1)) / cols));
  // The shelves cap at SHELF_COLS and take the width that frees as extra tile, so a slot is always
  // a whole number of columns wide and a page never half-shows an eleventh binder.
  const shelfCols = Math.min(SHELF_COLS, cols);
  const shelfTileW = Math.max(120, Math.floor((contentW - GRID_GAP * (shelfCols - 1)) / shelfCols));
  const perShelf = shelfCols * SHELF_ROWS;
  // A phone's column (under 600) scrolls a grid; anything wider pages the shelves (owner, 2026-11-08).
  const phone = contentW < 600;

  const q = query.trim();
  const searching = q.length >= MIN_QUERY;
  const pickColour = (sw: (typeof SWATCHES)[number]) => {
    if (colour?.hex === sw.hex) {
      setColour(null);
      setColourHits(null);
      return;
    }
    setColour(sw);
    setColourHits(null);
    setQuery('');
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(sw.hex.slice(i, i + 2), 16));
    // BY PAGE (owner, 2026-11-11: "binders with PAGEs that exhibit a lot of black"): each card's
    // share of the colour comes from the palette index, and a page matches when about a third of
    // its art is that colour (data/colourFamilies). The binders come back through those pages.
    loadPokemonColorIndexes()
      .then(() => {
        const indexes = loadedColorIndexes();
        if (!indexes.length) return null;
        const { ids, shares } = cardsInFamily(indexes, sw.name, srgbToLab(r, g, b));
        return searchBinderPagesByShares(ids, shares, { minShare: PAGE_MATCH_SHARE, minCards: PAGE_MATCH_MIN_CARDS });
      })
      .then((hits) => setColourHits(hits ?? 'unavailable'))
      .catch(() => setColourHits([]));
  };

  const loadMoreResults = async () => {
    if (!resultsNext || loadingMore) return;
    const id = reqId.current;
    setLoadingMore('results');
    try {
      const page = await searchBindersPage(q, { after: resultsNext });
      if (id !== reqId.current) return; // the query changed while this was in flight
      setResults((have) => appended(have, page.binders));
      setResultsNext(page.next);
    } catch {
      setResultsNext(null);
    } finally {
      setLoadingMore(null);
    }
  };
  const loadMoreOthers = async () => {
    if (!othersNext || loadingMore) return;
    const forSort = sort;
    setLoadingMore('others');
    try {
      const page = await fetchDiscoverPage(forSort, { excludeAuthor: OFFICIAL_AUTHOR, after: othersNext });
      setOthers((have) => appended(have, page.binders));
      setOthersNext(page.next);
    } catch {
      setOthersNext(null);
    } finally {
      setLoadingMore(null);
    }
  };

  return (
    // THE SHARED FRAME (MIC-017, layout only). Discover is a top-level page: no way back. The
    // grid still measures its own width, now from the column instead of the old scroll view.
    <PageShell maxWidth={MaxContentWidthWide} back={false} footer={false} keyboardShouldPersistTaps="handled">
      <View onLayout={(e) => measureFrame(e.nativeEvent.layout.width)}>
          {/* The account button top right, as on My Binders (owner, 2026-10-29): a visitor who
              arrives here from a shared binder has nowhere else to create an account. */}
          {/* A COMPACT HEADER (MIC-017, owner 2026-11-08): the title shares the account button's
              row, and the old description line now lives in the search field's placeholder. */}
          <View style={styles.topRow}>
            {/* On a phone the guest's wide sign-in button leaves ~120 pt, so the title runs smaller
                over two lines instead of truncating to "Dis…". */}
            <ThemedText type="title" style={[styles.h1, phone && styles.h1Phone]}>
              Discover Binders
            </ThemedText>
            <AccountButton />
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={DISCOVER_V2 ? 'Search binders by Pokémon, theme, scenery, art style, set…' : 'Search by title, page, description or creator'}
            placeholderTextColor={Palette.muted}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            style={styles.search}
          />

          {DISCOVER_V2 && isSupabaseConfigured ? (
            <View style={styles.v2Bar} testID="discover-v2-bar">
              <View style={styles.v2Row}>
                <Seg
                  options={[{ id: 'binders', label: 'Binders' }, { id: 'makers', label: 'Makers' }]}
                  value="binders"
                  onChange={(id) => id === 'makers' && setPeopleOpen(true)}
                />
                <View style={styles.swatches}>
                  {SWATCHES.map((sw) => (
                    <Pressable
                      key={sw.hex}
                      onPress={() => pickColour(sw)}
                      disabled={colour?.hex !== sw.hex && colour !== null && colourHits === null}
                      accessibilityRole="button"
                      accessibilityLabel={`Binders in ${sw.name}`}
                      testID="discover-swatch"
                      style={[styles.swatch, { backgroundColor: sw.hex }, colour?.hex === sw.hex && styles.swatchOn]}
                    />
                  ))}
                </View>
              </View>
              <PeopleSearch visible={peopleOpen} onClose={() => setPeopleOpen(false)} />
            </View>
          ) : null}

          {DISCOVER_V2 && colour && !searching ? (
            <View style={styles.section} testID="discover-colour">
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
                {`Binders in ${colour.name}`}
              </ThemedText>
              {colourHits === null ? (
                <View style={styles.center}>
                  <ActivityIndicator />
                </View>
              ) : colourHits === 'unavailable' ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                  Colour search is not ready yet.
                </ThemedText>
              ) : colourHits.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                  No public binders lean that way yet. Try another colour.
                </ThemedText>
              ) : (
                <RankedResults
                  key={`colour-${colour.hex}`}
                  rows={colourHits}
                  batch={phone ? 8 : perShelf}
                  phone={phone}
                  contentW={contentW}
                  tileW={phone ? tileW : shelfTileW}
                  perShelf={perShelf}
                  onOpen={(b) => openBinder(b.id, b.matchPages?.[0])}
                  testID="discover-colour-results"
                />
              )}
            </View>
          ) : null}

          {!isSupabaseConfigured ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              Public binder search isn’t available in this build.
            </ThemedText>
          ) : searching ? (
            results === null ? (
              <View style={styles.center}>
                <ActivityIndicator />
              </View>
            ) : results.length === 0 && !cardHits?.length ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                {`No public binders match “${q}”.`}
              </ThemedText>
            ) : (
              <>
                {cardHits && cardHits.length ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.note} testID="discover-ranked-note">
                    {`Binders with the most “${q}” come first.`}
                  </ThemedText>
                ) : null}
                <RankedResults
                  key={`q-${q}`}
                  rows={cardHits ?? []}
                  extra={results}
                  extraNext={!!resultsNext}
                  onMoreExtra={loadMoreResults}
                  moreExtraBusy={loadingMore === 'results'}
                  batch={phone ? 8 : perShelf}
                  phone={phone}
                  contentW={contentW}
                  tileW={phone ? tileW : shelfTileW}
                  perShelf={perShelf}
                  onOpen={(b) => openBinder(b.id, b.matchPages?.[0])}
                  testID="discover-results"
                />
              </>
            )
          ) : (
            <>
              {/* 1. Every public binder, in the order the reader chooses. */}
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <ThemedText
                    type="smallBold"
                    themeColor="textSecondary"
                    style={styles.sectionLabel}>
                    Public binders
                  </ThemedText>
                  {/* ONE CONTROL FOR THE ORDER (MIC-017): two 12 pt chips became a 44 pt segmented control. */}
                  <Seg
                    tall
                    options={SORTS.map((s) => ({ id: s.key, label: s.label }))}
                    value={sort}
                    onChange={(key) => {
                      if (key === sort) return;
                      // A list seen in the last few minutes comes straight back; the fetch effect skips it.
                      setOthers(keptShelf(key)?.binders ?? null);
                      setOthersNext(keptShelf(key)?.next ?? null);
                      setSort(key);
                    }}
                  />
                </View>
                {others === null ? (
                  <View style={styles.center}>
                    <ActivityIndicator />
                  </View>
                ) : others.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                    No public binders to show yet.
                  </ThemedText>
                ) : phone ? (
                  // A PHONE SCROLLS DOWN A GRID (MIC-017, owner 2026-11-08): two across, every
                  // binder in one column of rows; Load more adds the next page. The desk keeps
                  // its paged shelf below.
                  <BinderCoverGrid
                    binders={others}
                    onOpen={openBinder}
                    minTile={150}
                    minCols={2}
                    maxCols={2}
                    gap={GRID_GAP}
                    testID="discover-grid"
                    accessory={(b) =>
                      b.authorName ? (
                        <ProfileAvatarButton
                          username={b.authorName}
                          avatarUrl={avatars.get(b.authorName.toLowerCase())}
                          size={TILE_AVATAR}
                          onPress={() => router.push(`/u/${b.authorName}` as Href)}
                        />
                      ) : null
                    }
                  />
                ) : (
                  <PagedCarousel
                    width={contentW}
                    prevLabel="Previous binders"
                    nextLabel="More binders"
                    // Keyed by the ordering, so flipping the chip starts at the top of the new
                    // list instead of page four of a list that no longer has one.
                    key={`public-${sort}`}
                    initialPage={initialShelf}
                    onPageChange={rememberShelf}
                    // The next page loads itself as the reader reaches the last one (PagedCarousel onReachEnd).
                    onReachEnd={othersNext ? loadMoreOthers : undefined}
                    pages={shelfPages(others, perShelf, (b) => (
                      <BinderThumb
                        key={b.id}
                        binder={b}
                        width={shelfTileW}
                        onPress={() => openBinder(b.id)}
                        accessory={
                          b.authorName ? (
                            <ProfileAvatarButton
                              username={b.authorName}
                              avatarUrl={avatars.get(b.authorName.toLowerCase())}
                              size={TILE_AVATAR}
                              onPress={() => router.push(`/u/${b.authorName}` as Href)}
                            />
                          ) : null
                        }
                      />
                    ))}
                  />
                )}
                {othersNext ? (
                  <LoadMore busy={loadingMore === 'others'} onPress={loadMoreOthers} testID="discover-more-binders" />
                ) : null}
              </View>

              {/* The curator, between the shelves: the people browsing finished binders are the
                  ones who have not heard that theirs can be built from what they own. */}
              <View style={styles.section}>
                <CurateCallout surface="discover" />
              </View>

              {/* 2. The house account's reference binders. Hidden entirely when it has published
                  none, so the heading never sits above an empty shelf. */}
              {house && house.length > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHead}>
                    <ThemedText
                      type="smallBold"
                      themeColor="textSecondary"
                      style={styles.sectionLabel}>
                      From Michi-Maker
                    </ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.sectionNote}>
                    Reference binders from the house account: plain card layouts to copy and build
                    on, rather than finished pieces.
                  </ThemedText>
                  {phone ? (
                    <BinderCoverGrid binders={house} onOpen={openBinder} minTile={150} minCols={2} maxCols={2} gap={GRID_GAP} testID="discover-house" />
                  ) : (
                  <PagedCarousel
                    width={contentW}
                    prevLabel="Previous reference binders"
                    nextLabel="More reference binders"
                    pages={shelfPages(house, perShelf, (b) => (
                      <BinderThumb
                        key={b.id}
                        binder={b}
                        width={shelfTileW}
                        onPress={() => openBinder(b.id)}
                      />
                    ))}
                  />
                  )}
                </View>
              ) : null}

              {/* 3. The contest, LAST and as one card: the boards and the entry feed live on
                  /contest-binders since 2026-09-15. */}
              {contestOn ? (
                <View style={styles.contestBox}>
                  <View style={styles.contestHead}>
                    <ThemedText type="smallBold">🏆 {CONTEST.name}</ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.contestSub}>
                    {CONTEST.headline}
                  </ThemedText>
                  {/* Two SIBLING links, not a card-wide Pressable with a link inside it: a nested
                      Pressable's tap is swallowed by the outer one on web. */}
                  <View style={styles.contestLinks}>
                    <Pressable
                      onPress={() => router.push('/contest-binders' as Href)}
                      hitSlop={6}
                      style={({ pressed }) => [pressed && styles.dim]}>
                      <ThemedText type="small" style={styles.contestLink}>
                        See the entries ›
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => router.push('/contest' as Href)}
                      hitSlop={6}
                      style={({ pressed }) => [pressed && styles.dim]}>
                      <ThemedText type="small" style={styles.contestLink}>
                        Prizes & rules ›
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </>
          )}
      </View>
      <View style={styles.shellTail} />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  // MIC-017 piece 8: Binders | Makers, colour swatches, theme chips.
  v2Bar: { gap: 10, marginTop: 10, marginBottom: 6 },
  v2Row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: Palette.ink },
  // The old scroll view's bottom room, for the phone's menu button.
  shellTail: { height: BottomTabInset + Spacing.four },
  h1: { flexShrink: 1 },
  h1Phone: { fontSize: 26, lineHeight: 30 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three, marginBottom: Spacing.three },
  search: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: FontSize.control,
    color: Palette.ink,
    marginBottom: Spacing.four,
    maxWidth: 520,
  },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 0.5, fontSize: FontSize.sm },
  section: { marginBottom: Spacing.five },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  sectionNote: { lineHeight: 18, marginTop: -Spacing.two, marginBottom: Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // A carousel page is exactly as tall as its rows: `alignContent` stops a short last page (one
  // row, or a partial one) from spreading its tiles down the height the tallest page set.
  shelfPage: { alignContent: 'flex-start' },
  center: { paddingVertical: Spacing.six, alignItems: 'center' },
  moreBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    backgroundColor: Palette.panel,
  },
  moreBtnDim: { opacity: 0.6 },
  note: { paddingVertical: Spacing.three },
  contestBox: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.accent,
    backgroundColor: Palette.selectionSoft,
    marginBottom: Spacing.four,
  },
  contestHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  contestLink: { color: Palette.accent, fontWeight: '600' },
  contestLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.four, marginTop: Spacing.one },
  contestSub: { lineHeight: 18 },
  dim: { opacity: 0.7 },
});
