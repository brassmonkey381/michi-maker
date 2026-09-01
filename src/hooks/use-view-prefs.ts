/**
 * HOW YOU LAST LOOKED AT YOUR BINDER, remembered.
 *
 * Three pills sit above every binder — Owned, Scans and Double-sided — and all three were
 * session-only. Double-sided in particular is not a per-visit decision: a collector who keeps a
 * physical binder open at a spread wants it open at a spread every time, and re-flipping it on
 * every visit is exactly the small tax that makes a feature not worth switching on. Owned and
 * Scans are the same shape of choice — "show me my own copies" is a standing preference about the
 * collection, not about this page.
 *
 * `Double-sided` had a module-level `let` that survived remounts within one page load, which is
 * the shape of the right idea with none of its reach: it forgot on reload and never crossed to
 * another device.
 *
 * The doctrine is `useCardLabelPrefs`, followed deliberately rather than approximately:
 *
 *   - device-local (AsyncStorage), so the choice is there on the first paint before any network
 *     call resolves, and so it works at all for guests, who have no profile to write to;
 *   - account (`profiles.preferences.binderView`), authoritative once the profile loads, so the
 *     choice follows the collector to their phone;
 *   - resolved by PRECEDENCE, not by overwriting: what you just chose beats the account, which
 *     beats this device, which beats the defaults. An effect per source calling setState is a race
 *     dressed up as code — the two stores resolve asynchronously and whichever landed last would
 *     win rather than whichever should.
 *
 * Both caches carry the identity they were read for, so a sign-out or an account switch derives
 * back to defaults in the same render rather than briefly showing the previous account's view —
 * which matters here, because two of these three pills reveal what someone owns.
 *
 * Account writes are FAIL-SOFT: losing one costs a re-tapped pill, which is not worth an error in
 * front of someone looking at their binder.
 *
 * (This duplicates the machinery in `use-card-label-prefs.ts` rather than sharing it. The two
 * could fold into one `useAccountPref<T>`, and should — but not in the same change that introduces
 * the second caller, because that would refactor a working preference and add a new one in one
 * step, and only one of those is easy to unpick if it goes wrong.)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { VIEW_PREF_DEFAULTS, normalizeViewPrefs, type ViewPrefs } from '@/data/viewPrefs';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';

/** Guests share one bucket; accounts get their own. */
function storageKey(userId: string | null): string {
  return `michi.binderView.${userId ?? 'guest'}`;
}

export type { ViewPrefs } from '@/data/viewPrefs';

export interface ViewPrefsState extends ViewPrefs {
  setPref: (key: keyof ViewPrefs, on: boolean) => void;
}

export function useViewPrefs(): ViewPrefsState {
  const { user, profile } = useAuth();
  const userId = user?.id ?? null;

  const [edited, setEdited] = useState<{ userId: string | null; prefs: ViewPrefs } | null>(null);
  const [device, setDevice] = useState<{ userId: string | null; prefs: ViewPrefs } | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(storageKey(userId))
      .then((raw) => {
        if (!active || !raw) return;
        const stored = normalizeViewPrefs(JSON.parse(raw));
        if (stored) setDevice({ userId, prefs: stored });
      })
      .catch(() => {
        // Absent or corrupt: the defaults are a perfectly good answer.
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const account = useMemo(() => {
    const bag = (profile?.preferences ?? null) as { binderView?: unknown } | null;
    return bag ? normalizeViewPrefs(bag.binderView) : null;
  }, [profile]);

  const prefs =
    (edited?.userId === userId ? edited.prefs : null) ??
    account ??
    (device?.userId === userId ? device.prefs : null) ??
    VIEW_PREF_DEFAULTS;

  const persist = useCallback(
    (next: ViewPrefs) => {
      AsyncStorage.setItem(storageKey(userId), JSON.stringify(next)).catch(() => {});
      // Real accounts only: an anonymous session's profile is thrown away with the session, so
      // writing to it spends a round trip on something nobody will ever read back.
      if (supabase && user && !user.is_anonymous) {
        // Spread into a plain JSON shape: the generated `preferences` type is a recursive Json
        // union, and a typed interface is not assignable to it however JSON-shaped it is.
        const merged = {
          ...((profile?.preferences as object) ?? {}),
          binderView: { owned: next.owned, scans: next.scans, doubleSided: next.doubleSided },
        };
        void supabase
          .from('profiles')
          .update({ preferences: merged })
          .eq('id', user.id)
          .then(
            () => {},
            () => {},
          );
      }
    },
    [userId, user, profile],
  );

  const setPref = useCallback(
    (key: keyof ViewPrefs, on: boolean) => {
      const next = { ...prefs, [key]: on };
      setEdited({ userId, prefs: next });
      persist(next);
    },
    [persist, prefs, userId],
  );

  return { ...prefs, setPref };
}
