/**
 * Shared EN/JP browse-language preference — ONE setting for the whole app (the Home "Recent &
 * Upcoming" feed and the Browse page read/write the same value). Persisted so it survives page
 * refresh / app reload and, for signed-in accounts, follows the collector across devices:
 *
 *   - device-local:  AsyncStorage — instant first paint, and the ONLY store for guests.
 *   - account:       profiles.preferences.cardLanguages — authoritative when signed in (adopted
 *                    when the profile loads, and written through on every change).
 *
 * Account writes are FAIL-SOFT: before the `preferences` column migration lands they no-op and
 * the app quietly degrades to device-local, so nothing breaks in the meantime.
 *
 * At least one language is always selected (a browse surface constrained to nothing shows no
 * cards); the LanguageToggle enforces that on input and `normalize` re-enforces it here.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { type CardLanguage } from 'tcgscan-browse';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';

const DEFAULT: CardLanguage[] = ['en'];
const STORAGE_KEY = 'michi.cardLanguages';
const ORDER: CardLanguage[] = ['en', 'ja'];

/** Canonical order, valid codes only, never empty. */
function normalize(v: unknown): CardLanguage[] {
  const arr = Array.isArray(v) ? v : [];
  const picked = ORDER.filter((c) => arr.includes(c));
  return picked.length ? picked : DEFAULT;
}
function same(a: CardLanguage[], b: CardLanguage[]): boolean {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}

// Module-level shared store so every consumer resolves to ONE value (and one identity, which
// useSyncExternalStore requires between renders unless it actually changes).
let current: CardLanguage[] = DEFAULT;
const listeners = new Set<() => void>();
function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
function getSnapshot(): CardLanguage[] {
  return current;
}
function set(next: CardLanguage[]): void {
  const norm = normalize(next);
  if (same(norm, current)) return; // no-op keeps the snapshot identity stable
  current = norm;
  listeners.forEach((l) => l());
}

let localHydrated = false;
async function hydrateLocal(): Promise<void> {
  if (localHydrated) return;
  localHydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) set(JSON.parse(raw) as CardLanguage[]);
  } catch {
    /* absent/corrupt cache — DEFAULT stands */
  }
}

/** The app-wide EN/JP browse-language preference and a setter that persists it (local + account). */
export function useLanguagePref(): [CardLanguage[], (v: CardLanguage[]) => void] {
  const langs = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT);
  const { user, profile } = useAuth();

  // 1) Device-local first — fast, and the only store guests have.
  useEffect(() => {
    void hydrateLocal();
  }, []);

  // 2) Account is authoritative once the profile loads — adopt its saved choice.
  useEffect(() => {
    const prefs = (profile?.preferences ?? null) as { cardLanguages?: unknown } | null;
    if (prefs && Array.isArray(prefs.cardLanguages)) set(normalize(prefs.cardLanguages));
  }, [profile]);

  const setLangs = useCallback(
    (v: CardLanguage[]) => {
      set(v);
      const next = current;
      // device-local: always (survives reload; covers guests)
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      // account: real (non-guest) sessions only — the choice then follows the collector across
      // devices. Fail-soft: pre-migration this errors and we simply keep the device-local copy.
      if (supabase && user && !user.is_anonymous) {
        const merged = { ...((profile?.preferences as object) ?? {}), cardLanguages: next };
        void supabase.from('profiles').update({ preferences: merged }).eq('id', user.id).then(
          () => {},
          () => {},
        );
      }
    },
    [user, profile],
  );

  return [langs, setLangs];
}
