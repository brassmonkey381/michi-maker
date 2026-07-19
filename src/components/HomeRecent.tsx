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
import { useState } from 'react';
import { RecentProducts, type CardLanguage } from 'tcgscan-browse';

import { HomeSection } from '@/components/HomeSection';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useCardSize } from '@/lib/cardSizePref';
import { isPremiumRarity } from '@/data/premiumRarity';
import { useCatalog } from '@/hooks/use-catalog';
import { useBrowseTheme } from '@/lib/browseTheme';

// Session-sticky so the choice survives collapsing/remounting the section (mirrors viewModePref).
let recentLangPref: CardLanguage[] | null = null;

export function HomeRecent({
  onFindSimilar,
  onViewSet,
  onOpenSet,
  onAddToBinder,
  languages,
}: {
  onFindSimilar?: (cardId: string) => void;
  onViewSet?: (cardId: string) => void;
  /** Open a whole set (from a set tile tap) in the home browser below. */
  onOpenSet?: (setId: string, series: string) => void;
  /** Drop a tapped feed card into a binder — surfaced as "Add to a binder…". */
  onAddToBinder?: (cardId: string) => void;
  /** Printing language(s) to show; undefined = all. Threads to the kit's RecentProducts. */
  languages?: CardLanguage[];
}) {
  const { catalog } = useCatalog(true);
  const browseTheme = useBrowseTheme();
  const [cardSize] = useCardSize();
  // EN / JP filter for THIS section's Sets + Cards carousels — EN only by default.
  const [langs, setLangs] = useState<CardLanguage[]>(() => recentLangPref ?? languages ?? ['en']);
  const changeLangs = (v: CardLanguage[]) => {
    recentLangPref = v;
    setLangs(v);
  };
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
        cardSize={cardSize}
        onFindSimilar={(card) => onFindSimilar?.(card.id)}
        onViewSet={(card) => onViewSet?.(card.id)}
        onOpenSet={(set) => onOpenSet?.(set.id, set.seriesId)}
        onAddToBinder={(card) => onAddToBinder?.(card.id)}
      />
    </HomeSection>
  );
}
