/**
 * Catalog data-source configuration — the app-side shim for the shared
 * `tcgscan-browse` package.
 *
 * Expo inlines EXPO_PUBLIC_* env only in APP source (never in node_modules), so
 * this module reads the env and injects it into the package exactly once, at
 * import time. Everything else in the app keeps importing from here — the
 * package's helpers are re-exported below, so this stays the single seam.
 *
 * ⚠️ NATIVE: a bare `/browse` path has no origin on iOS/Android — set
 * EXPO_PUBLIC_CATALOG_BROWSE_URL to an absolute URL for native builds.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cardThumbUrl,
  configureBrowse,
  getApiKey,
  getApiUrl,
  hydrateImageManifest,
  resolveImageUrl,
  setBrowseLanguages,
  useImageManifest,
} from 'tcgscan-browse';

import { freshToken, gatedCatalogSource } from '@/lib/catalogSource';
import { supabaseUrl } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { LANGUAGE_DEFAULT, languageStore } from '@/store/languagePref';

/** Base URL the catalog JSON (and prices/alternates) are served from. */
export const browseUrl: string = process.env.EXPO_PUBLIC_CATALOG_BROWSE_URL ?? '/browse';

/** Base prepended to site-root-relative card image paths ('' on local web). */
export const imgBase: string = process.env.EXPO_PUBLIC_CATALOG_IMG_BASE ?? '';

// Inject once at import time — package fetches read this lazily, so any module
// that imports this shim (directly or transitively) is configured in time.
configureBrowse({
  browseUrl,
  imgBase,
  apiUrl: process.env.EXPO_PUBLIC_CATALOG_API_URL,
  apiKey: process.env.EXPO_PUBLIC_CATALOG_API_KEY ?? '',
  // Persist the content-hashed image manifest across launches so the home
  // screen resolves covers (cardThumbUrl) instantly without the ~25MB catalog.
  // AsyncStorage is async KV, which is exactly the ManifestCache shape.
  cache: {
    getItem: (k) => AsyncStorage.getItem(k),
    setItem: (k, v) => AsyncStorage.setItem(k, v),
  },
  // Gated catalog (encrypted, session-keyed) with public fallback — see lib/catalogSource.ts.
  catalogSource: gatedCatalogSource,
  // Affiliate deep-link template for outbound TCGPlayer links (empty = raw links, unchanged). Set
  // EXPO_PUBLIC_TCGPLAYER_DEEPLINK to the Impact tracking URL with a {url} token, e.g.
  // https://partner.tcgplayer.com/c/<ids>?subId1=michi&u={url}
  affiliateDeeplink: process.env.EXPO_PUBLIC_TCGPLAYER_DEEPLINK ?? '',
  // eBay Partner Network: campaign id (shared "TCGScan" campaign) + customid for the Recent &
  // Upcoming feed's "Find on eBay" links. Powers the kit's ebaySearchUrl (RecentProducts).
  ebayCampaignId: '5339173456',
  ebayCustomId: 'michi-recent',
  // Device-local persistence for the shared EN/JP preference. The kit holds the value (so it can
  // pass it to every search RPC); this supplies the storage and the EN-only default. The signed-in
  // account layer is added on top in store/languagePref.tsx.
  languageStore,
  // THE PAID PATH FOR ARTWORK SEARCH. theme:/art:/scene: queries always run on the server (the
  // captions left the catalog bundle on 2026-09-07, so a warm client cannot answer them itself);
  // the data project meters the direct call to the top few rows with a true total, and an
  // entitled caller goes through this app project's `theme-search` function instead, which
  // checks the ledger and forwards unclamped. A null token takes the metered path with no extra
  // round trip: guests and signed-out visitors are metered by definition. A signed-in account
  // the function refuses (403: free, or a plan the function does not entitle) falls back to the
  // same metered path, one round trip later.
  themedSearch: supabaseUrl
    ? {
        url: `${supabaseUrl}/functions/v1/theme-search`,
        getToken: async () => {
          if (!supabase) return null;
          const { data } = await supabase.auth.getSession();
          if (!data.session || data.session.user.is_anonymous) return null;
          return freshToken();
        },
      }
    : undefined,
});

// Pin the SYNCHRONOUS default before AsyncStorage resolves. The kit opens on both languages
// (unconstrained), michi opens on English — without this, first paint would show JP cards for the
// tick or two until languageStore.load() lands. Not persisted: it's a default, not a user choice,
// so a stored preference still wins the moment it arrives.
setBrowseLanguages(LANGUAGE_DEFAULT, { persist: false });

export { cardThumbUrl, resolveImageUrl, hydrateImageManifest, useImageManifest };

/** PostgREST endpoint + publishable key (resolved by the package config). */
export const catalogApiUrl: string = getApiUrl();
export const catalogApiKey: string = getApiKey();
