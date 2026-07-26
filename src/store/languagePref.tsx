/**
 * Shared EN/JP browse-language preference — the app-side ADAPTER over the kit's shared store.
 *
 * The value itself now lives in `tcgscan-browse` (`useBrowseLanguages`), because the kit is what
 * has to act on it: the choice is passed as an ARGUMENT to every server call it makes — query
 * search, facets, the set drill-down, the recent feed, embedding similarity, and colour search —
 * so results are cut BEFORE the top-N rather than filtered after. A value that lived only here
 * could never reach the similarity call the browser fires internally.
 *
 * This file owns the two things the kit deliberately has no access to, storage and auth:
 *
 *   - device-local:  AsyncStorage — instant first paint, and the ONLY store for guests. Wired to
 *                    the kit via `configureBrowse({ languageStore })` in `lib/catalogConfig.ts`.
 *   - account:       profiles.preferences.cardLanguages — authoritative when signed in (adopted
 *                    when the profile loads, and written through on every change).
 *
 * Account writes are FAIL-SOFT: before the `preferences` column migration lands they no-op and
 * the app quietly degrades to device-local, so nothing breaks in the meantime.
 *
 * At least one language is always selected (a browse surface constrained to nothing shows no
 * cards); the kit's LanguageToggle enforces that on input and `normalizeLanguages` re-enforces it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect } from 'react';
import {
  normalizeLanguages,
  setBrowseLanguages,
  useBrowseLanguages,
  type CardLanguage,
  type LanguageStore,
} from 'tcgscan-browse';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';

const STORAGE_KEY = 'michi.cardLanguages';

/**
 * michi-maker opens on ENGLISH ONLY when nothing is stored, unlike the kit's both-languages
 * default — a new collector here is browsing English printings until they say otherwise.
 * `catalogConfig.ts` also applies this synchronously at startup so first paint is EN before
 * AsyncStorage resolves.
 */
export const LANGUAGE_DEFAULT: CardLanguage[] = ['en'];

/**
 * Device-local persistence handed to `configureBrowse`. `load` runs once at startup; returning
 * LANGUAGE_DEFAULT for an empty store is what pins the EN-only opening state.
 */
export const languageStore: LanguageStore = {
  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      return raw ? normalizeLanguages(JSON.parse(raw)) : LANGUAGE_DEFAULT;
    } catch {
      return LANGUAGE_DEFAULT; // absent / corrupt cache
    }
  },
  save: (langs) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(langs)).catch(() => {});
  },
};

/**
 * The app-wide EN/JP preference and a setter. Thin wrapper over the kit store that additionally
 * syncs the signed-in account: the profile's saved choice is adopted when it loads, and every
 * change is written back so it follows the collector across devices.
 */
export function useLanguagePref(): [CardLanguage[], (v: CardLanguage[]) => void] {
  const [langs, setKit] = useBrowseLanguages();
  const { user, profile } = useAuth();

  // Account is authoritative once the profile loads — adopt its saved choice WITHOUT persisting,
  // so adopting doesn't echo straight back to storage as if the user had just picked it.
  useEffect(() => {
    const prefs = (profile?.preferences ?? null) as { cardLanguages?: unknown } | null;
    if (prefs && Array.isArray(prefs.cardLanguages)) {
      setBrowseLanguages(normalizeLanguages(prefs.cardLanguages), { persist: false });
    }
  }, [profile]);

  const setLangs = useCallback(
    (v: CardLanguage[]) => {
      const next = normalizeLanguages(v);
      setKit(next); // kit store + AsyncStorage (via languageStore.save)
      // account: real (non-guest) sessions only. Fail-soft — pre-migration this errors and we
      // simply keep the device-local copy.
      if (supabase && user && !user.is_anonymous) {
        const merged = { ...((profile?.preferences as object) ?? {}), cardLanguages: next };
        void supabase.from('profiles').update({ preferences: merged }).eq('id', user.id).then(
          () => {},
          () => {},
        );
      }
    },
    [setKit, user, profile],
  );

  return [langs, setLangs];
}
