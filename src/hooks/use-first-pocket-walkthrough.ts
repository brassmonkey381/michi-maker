/**
 * THE FIRST-POCKET WALKTHROUGH'S TIMING AND MEMORY. What it says is in
 * src/data/firstPocketWalkthrough.ts; this decides whether to say it, and writes down that it did.
 *
 * NOT A PROMPT, on purpose. It takes no `promptQueue` turn and appears in `src/data/prompts.ts`
 * only as a comment: it is not a dialog, it covers nothing, and its audience is mostly guests,
 * whom every `due()` in that registry refuses by construction. Holding the queue's turn for the
 * life of an editor session would silence the rights attestation for the whole page.
 *
 * THE RECORD IS A DERIVATION, not a chain of effects. The device copy and the account copy are
 * merged on every render; `opens` is a max and `retiredAt` is the earlier of the two, so the order
 * writes land in cannot produce a wrong answer. Retiring writes to both and is monotone: once
 * `retiredAt` is set nothing here ever renders again, on any device, for any binder.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  EMPTY_RECORD,
  WALKTHROUGH_COPY,
  mergeRecord,
  normalizeRecord,
  resolveState,
  type WalkthroughCopy,
  type WalkthroughEnding,
  type WalkthroughRecord,
  type WalkthroughStep,
} from '@/data/firstPocketWalkthrough';
import { track } from '@/lib/analytics';
import { hydrateWalkthroughSeen, readWalkthroughSeen, writeWalkthroughSeen } from '@/lib/walkthroughSeen';
import { useAuth } from '@/store/auth';

const PREF_KEY = 'firstPocketWalkthrough';

export interface FirstPocketWalkthrough {
  /** The step being shown, or null when nothing is. */
  step: WalkthroughStep | null;
  /** The callout for that step, or null. */
  copy: WalkthroughCopy | null;
  /** One press: over for good. */
  dismiss: () => void;
}

export function useFirstPocketWalkthrough({
  hasCard,
  editing,
  studio,
  pickerOpen,
  width,
  tier,
}: {
  hasCard: boolean;
  editing: boolean;
  studio: boolean;
  pickerOpen: boolean;
  /** The window's width, so the report can tell a docked browser from a bottom sheet. */
  width: number;
  tier: string;
}): FirstPocketWalkthrough {
  const { user, profile, updateProfile } = useAuth();
  const userId = user?.id ?? null;
  const isGuest = !!user?.is_anonymous;

  // The device half. Held with the identity it was read for, so a sign-out cannot leave the
  // previous account's answer standing for one render.
  const [device, setDevice] = useState<{ userId: string | null; rec: WalkthroughRecord } | null>(null);
  useEffect(() => {
    let live = true;
    void hydrateWalkthroughSeen(userId).then(() => {
      if (live) setDevice({ userId, rec: readWalkthroughSeen(userId) ?? EMPTY_RECORD });
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const accountRec = useMemo(() => {
    const bag = profile?.preferences as Record<string, unknown> | null | undefined;
    return normalizeRecord(bag?.[PREF_KEY]);
  }, [profile?.preferences]);

  const record = useMemo(
    () => mergeRecord(device && device.userId === userId ? device.rec : EMPTY_RECORD, accountRec),
    [device, userId, accountRec],
  );

  const write = useCallback(
    (next: WalkthroughRecord) => {
      writeWalkthroughSeen(userId, next);
      setDevice({ userId, rec: next });
      // Guests have no row to write to, and a failed account write costs one repeat on a second
      // device rather than anything the reader would notice. Fire and forget, deliberately.
      if (!isGuest && userId) {
        const bag = (profile?.preferences as Record<string, unknown> | null | undefined) ?? {};
        // Spread into a plain object: `preferences` is the generated `Json` type, which an
        // interface with named fields does not satisfy (no index signature) even though its
        // values are all JSON. The shape is re-checked by normalizeRecord on the way back in.
        void updateProfile({
          preferences: { ...bag, [PREF_KEY]: { v: next.v, opens: next.opens, retiredAt: next.retiredAt } },
        }).catch(() => {});
      }
    },
    [userId, isGuest, profile?.preferences, updateProfile],
  );

  // WHAT THIS BINDER LOOKED LIKE WHEN WE ARRIVED, latched by the initialiser and never set again.
  // It is the difference between a binder the wizard filled (nothing to teach) and the first card
  // landing while somebody is being shown how (the whole point). State, not a ref, because it is
  // read during render and a ref read there is the thing the React rules forbid.
  const [hadCardOnArrival] = useState(hasCard);

  const state = resolveState({ hasCard, hadCardOnArrival, record, editing, studio, pickerOpen });
  const step = state.show ? state.step : null;

  /** The furthest step this session actually reached, for the ending event. Written in the effect
   *  that reports each step, never during render. */
  const lastStep = useRef<WalkthroughStep | null>(null);

  const retire = useCallback(
    (via: WalkthroughEnding) => {
      if (record.retiredAt) return;
      // `not-needed` is silent: nothing was shown, so there is nothing to report an ending for.
      if (via !== 'not-needed' && lastStep.current) {
        track('walkthrough.done', { walkthrough: 'first-pocket', via, last_step: lastStep.current });
      }
      write({ ...record, retiredAt: new Date().toISOString() });
    },
    [record, write],
  );

  // THE SILENT ENDINGS. A binder that already held a card (the wizard's, the story builder's, or
  // simply a second visit) and a reader who has opened the editor too many times without placing
  // one. Both are decided by resolveState; this only performs what it asked for.
  //
  // `retire` closes over the record, so it changes whenever that does; the effects below want the
  // latest without re-running on every change. Synced in an effect of its own, declared FIRST so
  // it has run before the ones that read it.
  const retireRef = useRef(retire);
  useEffect(() => {
    retireRef.current = retire;
  }, [retire]);
  const pendingRetire = state.show ? null : state.retire;
  useEffect(() => {
    if (pendingRetire) retireRef.current(pendingRetire);
  }, [pendingRetire]);

  // ONE OPEN PER MOUNT, counted only while this is still live. Not stamped on first paint: the
  // people it is for are exactly the ones who stall and leave, and stamping on show would give
  // that population a single attempt.
  const counted = useRef(false);
  useEffect(() => {
    if (counted.current || !state.show) return;
    counted.current = true;
    write({ ...record, opens: record.opens + 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount, by design
  }, [state.show]);

  // Shown once per mount, with what it can tell us about who saw it.
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current || !step) return;
    announced.current = true;
    track('walkthrough.shown', { walkthrough: 'first-pocket', width, tier });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the first step only
  }, [step]);

  // Each step it reaches, once, and the record of how far it got.
  const seenSteps = useRef(new Set<WalkthroughStep>());
  useEffect(() => {
    if (!step) return;
    lastStep.current = step;
    if (seenSteps.current.has(step)) return;
    seenSteps.current.add(step);
    track('walkthrough.step', { walkthrough: 'first-pocket', step });
  }, [step]);

  return {
    step,
    copy: step ? WALKTHROUGH_COPY[step] : null,
    dismiss: useCallback(() => retireRef.current('dismissed'), []),
  };
}
