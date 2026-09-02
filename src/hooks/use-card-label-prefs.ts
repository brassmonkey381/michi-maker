/**
 * WHICH CARD LABELS YOU LAST CHOSE, remembered.
 *
 * Turning labels on and picking your fields is a settled preference, not a per-visit decision — a
 * collector who wants the price and the set on every card wants it on every card, and re-picking
 * them on each visit is the kind of small tax that makes a feature not worth switching on.
 *
 * Two stores, exactly the doctrine `languagePref` already follows here:
 *
 *   - device-local: AsyncStorage, so the choice is there on the first paint before any network
 *     call resolves, and so it works at all for guests, who have no profile to write to.
 *   - account: `profiles.preferences.cardLabels`, authoritative once the profile loads, so the
 *     choice follows the collector to their phone.
 *
 * Account writes are FAIL-SOFT. A failed write leaves the device-local copy in place and says
 * nothing, because the cost of losing a label preference is that you re-tick a chip, and that is
 * not worth an error in front of someone looking at their binder.
 *
 * DEVICE STORAGE IS KEYED BY ACCOUNT. Two people sharing a laptop should not inherit each other's
 * labels, and a signed-out visitor should not see the last account's choices — which matters more
 * than it sounds, since one of the fields is the print finish of cards you own.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CAPTION_FIELDS, DEFAULT_CAPTION_FIELDS, type CaptionFieldKey } from '@/data/cardCaption';
import { isCurrentEpoch, stamp } from '@/data/prefsEpoch';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';

export interface CardLabelPrefs {
  /** The master toggle. */
  on: boolean;
  /** Which fields are ticked. */
  fields: CaptionFieldKey[];
}

const DEFAULTS: CardLabelPrefs = { on: true, fields: DEFAULT_CAPTION_FIELDS };

/**
 * The 2026-09-01 rollout, applied to a bag stored before it (see `prefsEpoch`): labels on, and the
 * five fields in `DEFAULT_CAPTION_FIELDS`.
 *
 * The FIELDS are replaced rather than merged, which is the one place this rollout overwrites an
 * answer someone gave. Merging would leave everybody who ever switched labels on carrying the old
 * default's rarity code forever, since that is what they were handed and never chose. One set of
 * five, the same for everyone today, and anybody who wants a sixth back is one chip away.
 */
function applyEpoch(): CardLabelPrefs {
  return { on: true, fields: [...DEFAULT_CAPTION_FIELDS] };
}

/** Guests share one bucket; accounts get their own. */
function storageKey(userId: string | null): string {
  return `michi.cardLabels.${userId ?? 'guest'}`;
}

/**
 * Anything stored can be stale: a field can be renamed or dropped between releases, and a saved
 * preference naming it would otherwise put a key into the render path that no longer resolves.
 * Unknown keys are discarded rather than trusted.
 */
function normalize(value: unknown): CardLabelPrefs | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { on?: unknown; fields?: unknown };
  if (typeof raw.on !== 'boolean' || !Array.isArray(raw.fields)) return null;
  const known = new Set(CAPTION_FIELDS.map((f) => f.key as string));
  const fields = raw.fields.filter((f): f is CaptionFieldKey => typeof f === 'string' && known.has(f));
  // Written before the current rollout: hand back that rollout's answer instead. Pure and
  // idempotent, so it re-applies on every read until this person saves a choice of their own.
  return isCurrentEpoch(raw) ? { on: raw.on, fields } : applyEpoch();
}

export interface CardLabelPrefsState extends CardLabelPrefs {
  setOn: (on: boolean) => void;
  toggleField: (key: CaptionFieldKey) => void;
}

export function useCardLabelPrefs(): CardLabelPrefsState {
  const { user, profile } = useAuth();
  const userId = user?.id ?? null;

  /**
   * THREE SOURCES, RESOLVED BY PRECEDENCE RATHER THAN BY OVERWRITING EACH OTHER. What the user
   * just chose beats what the account remembers, which beats what this device remembers, which
   * beats the defaults. Written as a derivation because the alternative — an effect per source
   * calling setState — is a race dressed up as code: the account and the device both resolve
   * asynchronously, and whichever landed last would win rather than whichever should.
   *
   * Both cached values carry the identity they were read for, so a sign-out or an account switch
   * derives back to defaults during the very same render instead of briefly showing the previous
   * account's choices — one of which is the print finish of cards they own.
   */
  const [edited, setEdited] = useState<{ userId: string | null; prefs: CardLabelPrefs } | null>(null);
  const [device, setDevice] = useState<{ userId: string | null; prefs: CardLabelPrefs } | null>(null);

  // Device-local: resolves in milliseconds, and is the only store guests have.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(storageKey(userId))
      .then((raw) => {
        if (!active || !raw) return;
        const stored = normalize(JSON.parse(raw));
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
    const bag = (profile?.preferences ?? null) as { cardLabels?: unknown } | null;
    return bag ? normalize(bag.cardLabels) : null;
  }, [profile]);

  const prefs =
    (edited?.userId === userId ? edited.prefs : null) ??
    account ??
    (device?.userId === userId ? device.prefs : null) ??
    DEFAULTS;

  const persist = useCallback(
    (next: CardLabelPrefs) => {
      // Stamped with the current prefs epoch, so the rollout above stops applying to this person
      // the moment they say otherwise (see `prefsEpoch`).
      const bag = stamp({ on: next.on, fields: [...next.fields] });
      AsyncStorage.setItem(storageKey(userId), JSON.stringify(bag)).catch(() => {});
      // Real accounts only: an anonymous session's profile is thrown away with the session, so
      // writing to it spends a round trip on something nobody will ever read back.
      if (supabase && user && !user.is_anonymous) {
        // Spread into a plain JSON shape: the generated `preferences` type is a recursive Json
        // union, and a typed interface is not assignable to it however JSON-shaped it happens to
        // be. This is a widening, not a cast away from anything real.
        const merged = {
          ...((profile?.preferences as object) ?? {}),
          cardLabels: bag,
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

  const apply = useCallback(
    (next: CardLabelPrefs) => {
      setEdited({ userId, prefs: next });
      persist(next);
    },
    [persist, userId],
  );

  const setOn = useCallback((on: boolean) => apply({ ...prefs, on }), [apply, prefs]);

  const toggleField = useCallback(
    (key: CaptionFieldKey) =>
      apply({
        ...prefs,
        fields: prefs.fields.includes(key)
          ? prefs.fields.filter((k) => k !== key)
          : [...prefs.fields, key],
      }),
    [apply, prefs],
  );

  return { ...prefs, setOn, toggleField };
}
