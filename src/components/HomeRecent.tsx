/**
 * "Recent & Upcoming" — the newest and not-yet-released sets + card strips, at the top of the
 * home screen. A thin wrapper over the shared `RecentProducts` feed, which is the SINGLE
 * implementation for every auth state:
 *
 *  - signed-in (catalog loaded)  → the feed reads from the in-memory catalog.
 *  - guest / cold start          → `catalog` is null and the feed fetches its own slim data
 *                                  from the public cards/sets tables — SAME three carousels.
 *
 * Don't add a parallel guest-only feed here — that's how the earlier HomeSets duplicate
 * happened. Anything the feed needs should go into the kit's RecentProducts.
 *
 * `useCatalog(true)` asks for the catalog when the tier allows (signed-in); for guests it's a
 * cheap subscribe. `onFindSimilar` / `onViewSet` / `onOpenSet` bubble up so the home screen can
 * drive the "Browse all cards" browser below (see index.tsx).
 */
import { RecentProducts } from 'tcgscan-browse';

import { HomeSection } from '@/components/HomeSection';
import { useCatalog } from '@/hooks/use-catalog';

export function HomeRecent({
  onFindSimilar,
  onViewSet,
  onOpenSet,
  onAddToBinder,
}: {
  onFindSimilar?: (cardId: string) => void;
  onViewSet?: (cardId: string) => void;
  /** Open a whole set (from a set tile tap) in the home browser below. */
  onOpenSet?: (setId: string, series: string) => void;
  /** Drop a tapped feed card into a binder — surfaced as "Add to a binder…". */
  onAddToBinder?: (cardId: string) => void;
}) {
  const { catalog } = useCatalog(true);
  return (
    // A collapsible section like the rest of the home screen. The shared header supplies the title
    // + disclosure, so the feed's own header is suppressed (title="").
    <HomeSection title="Recent & Upcoming">
      <RecentProducts
        catalog={catalog}
        title=""
        onFindSimilar={(card) => onFindSimilar?.(card.id)}
        onViewSet={(card) => onViewSet?.(card.id)}
        onOpenSet={(set) => onOpenSet?.(set.id, set.seriesId)}
        onAddToBinder={(card) => onAddToBinder?.(card.id)}
      />
    </HomeSection>
  );
}
