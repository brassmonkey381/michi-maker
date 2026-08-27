/**
 * The one-time second chance at the free PRO trial, for the people who were shown it at a moment
 * that meant nothing to them (see migration 20260827140000 for who, and why, and how few of them
 * the server bug actually touched).
 *
 * THIS IS AN EXCEPTION AND IS BUILT TO STAY ONE. The rule set on 2026-08-27 is that the trial
 * belongs at a wall — the binder cap, the page cap, the artwork cap, the print gate — and nowhere
 * else, because three weeks of showing it to people three minutes into their first session
 * produced fourteen impressions and no starts. This prompt exists only to reach the accounts that
 * were spent under the old placement, it draws from a fixed list a migration wrote, and it asks
 * once: `pro_trial_prompt_at` is stamped when it opens and the registry never offers it again.
 * There is no path in the app that adds anyone to the cohort.
 *
 * The copy does not apologise for a bug. Four of these accounts plausibly hit one; the rest simply
 * never pressed a button, and opening with "sorry, something went wrong" would be a story twelve
 * of them do not recognise. What is true of all of them is the only thing it says: the 14 days are
 * still there.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { TrialCta } from '@/components/monetization/TrialCta';
import { ThemedText } from '@/components/themed-text';
import { DialogCard } from '@/components/ui/DialogCard';
import { promptById, type PromptSurface } from '@/data/prompts';
import { useTrial } from '@/hooks/use-trial';
import { endTurn, onTurnFree, takeTurn } from '@/lib/promptQueue';
import { useAuth } from '@/store/auth';

const ID = 'pro-trial-offer';

export function ProTrialPrompt({ surface }: { surface: PromptSurface }) {
  const auth = useAuth();
  const trial = useTrial();
  const [open, setOpen] = useState(false);
  // Re-check when another prompt hands the turn back — losing the turn is not losing the visit.
  const [, recheck] = useState(0);
  useEffect(() => onTurnFree(() => recheck((n) => n + 1)), []);
  // One showing per mount: stamping pro_trial_prompt_at re-renders the profile, and without this
  // the effect would re-evaluate a state it had just changed.
  const shownRef = useRef(false);

  /* eslint-disable react-hooks/set-state-in-effect -- open-once-on-conditions, as RightsPrompt */
  useEffect(() => {
    if (shownRef.current || open) return;
    if (!auth.ready || !auth.isSignedIn) return;
    // Wait for the real answer rather than asking on a default: useTrial reports 'ineligible'
    // while it loads, which would read as "not due" and burn the only mount we get on this screen.
    if (trial.loading) return;
    const def = promptById(ID);
    if (!def.surfaces.includes(surface)) return;
    if (!def.due({ profile: auth.profile, isGuest: !!auth.isGuest, trialEligible: trial.state === 'eligible' })) return;
    if (!takeTurn(ID)) return;
    shownRef.current = true;
    setOpen(true);
    // Stamped on SHOWING, not on answering: this prompt asks once either way, and a stamp that
    // waited for an answer would re-ask everyone who closed it.
    void auth.updateProfile({ pro_trial_prompt_at: new Date().toISOString() });
  }, [auth, surface, open, trial.loading, trial.state]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Hand the turn back on unmount, so navigating away mid-dialog never strands the queue.
  useEffect(() => () => endTurn(ID), []);

  const close = () => {
    endTurn(ID);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <DialogCard visible title="Your 14 free days of PRO are still here" onClose={close} maxWidth={420}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
        You were offered a free PRO trial when you first signed up, before you had much in here to
        use it on. It has been sitting unclaimed since. PRO holds 12 binders of 40 pages, keeps
        1,000 Slice Studio artworks, and prints a full binder as fill sheets.
      </ThemedText>
      {/* Renders null if they are somehow no longer eligible by the time this paints, which is the
          honest outcome — better an empty dialog than a button the server will refuse. */}
      <TrialCta surface="trial_recovery" onBeforeStart={close} />
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  body: { lineHeight: 20, marginBottom: 12 },
});
