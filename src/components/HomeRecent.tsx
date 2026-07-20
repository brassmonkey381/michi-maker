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
 * `useCatalog(false)` (P4 lazy-load): home never FORCES the ~9 MB catalog fetch/parse — the feed
 * runs on its slim server fetches for everyone at first paint, then flips to the in-memory
 * catalog automatically if another surface (the Browse page, the card picker) loads it. That
 * keeps home's cold start catalog-free. `onFindSimilar` / `onViewSet` / `onOpenSet` bubble up so
 * the home screen can drive the "Browse all cards" browser below (see index.tsx).
 */
import { RecentProducts } from 'tcgscan-browse';

import { HomeSection } from '@/components/HomeSection';
import { LanguageToggle } from '@/components/LanguageToggle';
import { isPremiumRarity } from '@/data/premiumRarity';
import { useCatalog } from '@/hooks/use-catalog';
import { useBrowseTheme } from '@/lib/browseTheme';
import { useLanguagePref } from '@/store/languagePref';

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
  const { catalog } = useCatalog(false);
  const browseTheme = useBrowseTheme();
  // EN / JP filter for THIS section's Sets + Cards carousels. The app-wide, persisted preference
  // (shared with the Browse page) — EN only by default, remembered per account across devices.
  const [langs, changeLangs] = useLanguagePref();
  return (
    // A collapsible section like the rest of the home screen. The shared header supplies the title
    // + disclosure, so the feed's own header is suppressed (title="").
    <HomeSection title="Recent & Upcoming" action={<LanguageToggle value={langs} onChange={changeLangs} />}>
      <RecentProducts
        theme={browseTheme}
        catalog={catalog}
        title=""
        // Show every UPCOMING set plus released sets from the last 6 months, and EVERY premium
        // card (above Double Rare — full arts / secret / special, promos included) from them,
        // newest-set-first. The rarity filter keeps the card strip tight, so no cap (Infinity).
        monthsBack={6}
        cardLimit={Infinity}
        rarityFilter={(card) => isPremiumRarity(card.rarity)}
        languages={langs}
        onFindSimilar={(card) => onFindSimilar?.(card.id)}
        onViewSet={(card) => onViewSet?.(card.id)}
        onOpenSet={(set) => onOpenSet?.(set.id, set.seriesId)}
        onAddToBinder={(card) => onAddToBinder?.(card.id)}
      />
    </HomeSection>
  );
}
