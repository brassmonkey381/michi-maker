/**
 * THE FREE-TASTE API every PRO gate asks (data/tastes for the rules, lib/tasteSeen for the device
 * copy). One instance lives in the binder store as `store.taste`, because every gate already holds
 * `store` for its tier; nothing else should call this hook.
 *
 *   active(f)          the taste of `f` is running THIS visit: the control is open, no wall.
 *   offer(f)           a free account that has not tasted `f` yet.
 *   use(f, surface)    take the taste: record it (device + profile), open `f` for this visit, track
 *                      taste.used. False, and nothing happens, when there is none on offer.
 *   pass(f, has, s)    the one-line gate: 'has' when the tier has it, 'tasted' when this tap took
 *                      the taste (the caller may toast), false when the wall stands.
 *
 * TWO SHAPES OF GATE. A gate that RETURNS early ("if (!hasX) { wall; return }") calls pass() and
 * goes on through on the same tap. A gate that is a LOCK FLAG on a control (tracksLocked and its
 * onTracksLocked) calls use() in the locked handler: the lock lifts in place, the toast says why,
 * and the next tap works. Both are one record and one event.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { EMPTY_TASTES, mergeTastes, normalizeTastes, tasteOffered, type TasteFeature, type TasteRecord } from '@/data/tastes';
import type { Tier } from '@/data/tiers';
import { trackTasteUsed } from '@/lib/analytics';
import { hydrateTastes, readTastes, writeTastes } from '@/lib/tasteSeen';
import { useAuth } from '@/store/auth';

const PREF_KEY = 'tastes';

export interface TasteApi {
  active: (feature: TasteFeature) => boolean;
  offer: (feature: TasteFeature) => boolean;
  use: (feature: TasteFeature, surface: string) => boolean;
  pass: (feature: TasteFeature, has: boolean, surface: string) => 'has' | 'tasted' | false;
}

export function useTastes(tier: Tier): TasteApi {
  const { user, profile, updateProfile } = useAuth();
  const userId = user?.id ?? null;
  const isGuest = !!user?.is_anonymous;

  // The device half, held with the identity it was read for (lib/walkthroughSeen discipline).
  const [device, setDevice] = useState<{ userId: string | null; rec: TasteRecord } | null>(null);
  useEffect(() => {
    let live = true;
    void hydrateTastes(userId).then(() => {
      if (live) setDevice({ userId, rec: readTastes(userId) ?? EMPTY_TASTES });
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const accountRec = useMemo(() => {
    const bag = profile?.preferences as Record<string, unknown> | null | undefined;
    return normalizeTastes(bag?.[PREF_KEY]);
  }, [profile?.preferences]);

  const record = useMemo(
    () => mergeTastes(device && device.userId === userId ? device.rec : EMPTY_TASTES, accountRec),
    [device, userId, accountRec],
  );

  // What is open THIS visit. Keyed by identity so a sign-out does not carry a taste to the next
  // person on the device; the record above is what stops a repeat for the same account.
  const [activeFor, setActiveFor] = useState<{ userId: string | null; set: ReadonlySet<TasteFeature> }>({ userId, set: new Set() });
  const activeSet = useMemo(() => (activeFor.userId === userId ? activeFor.set : new Set<TasteFeature>()), [activeFor, userId]);

  const active = useCallback((f: TasteFeature) => activeSet.has(f), [activeSet]);
  const offer = useCallback((f: TasteFeature) => !isGuest && tasteOffered(tier, record, f), [isGuest, tier, record]);

  const use = useCallback(
    (f: TasteFeature, surface: string): boolean => {
      if (!offer(f)) return false;
      const next: TasteRecord = { v: 1, used: { ...record.used, [f]: new Date().toISOString() } };
      writeTastes(userId, next);
      setDevice({ userId, rec: next });
      setActiveFor((prev) => ({ userId, set: new Set([...(prev.userId === userId ? prev.set : []), f]) }));
      if (userId) {
        const bag = (profile?.preferences as Record<string, unknown> | null | undefined) ?? {};
        // Fire and forget, like the walkthrough record: a failed account write costs one extra
        // taste on another device, never anything this tap can see.
        void updateProfile({ preferences: { ...bag, [PREF_KEY]: { v: 1, used: next.used } } }).catch(() => {});
      }
      trackTasteUsed(f, surface);
      return true;
    },
    [offer, record, userId, profile?.preferences, updateProfile],
  );

  const pass = useCallback(
    (f: TasteFeature, has: boolean, surface: string): 'has' | 'tasted' | false => {
      if (has || active(f)) return 'has';
      return use(f, surface) ? 'tasted' : false;
    },
    [active, use],
  );

  return useMemo(() => ({ active, offer, use, pass }), [active, offer, use, pass]);
}
