/**
 * The dialog a cap wall opens on its first hit of the day (see src/lib/capPromptPacing.ts for the
 * pacing, and CapGateOffer for what it offers).
 *
 * WHY A DIALOG AT ALL. A toast that fades in nine seconds was the entire response to the highest
 * intent moment the product has: the user asked for something and the plan refused. The offer they
 * needed was on a page they had to go and find. So the first refusal each day stops and says what
 * the wall is and what opens it; every refusal after that is the toast, which still carries its
 * button. Once a day, per wall.
 *
 * INVITED, so it does NOT take a turn from promptQueue. This opens because the user tapped
 * something and it is the answer to that tap, which is exactly the case the queue's own header
 * excludes. It cannot collide with the uninvited prompts in practice either: those are modal, so
 * there is no "+ New" to press behind them.
 */
import { Pressable, StyleSheet } from 'react-native';

import { SignInPerk } from '@/components/auth/SignInPerk';
import { CapGateOffer } from '@/components/monetization/CapGateOffer';
import { ThemedText } from '@/components/themed-text';
import { DialogCard } from '@/components/ui/DialogCard';
import { Palette, Spacing } from '@/constants/theme';
import type { CapSurface } from '@/lib/analytics';

/**
 * The two ways a user can close a cap dialog on purpose. `navigate` (they left the screen with it
 * open) is not one of these: nobody chose it, and it is raised by useCapGate's unmount cleanup.
 */
export type CapDismissal = 'not_now' | 'close';

/** Everything a wall needs to describe and answer itself. */
export interface CapWall {
  /** The tier_caps limit_key, verbatim ('binders', 'pagesPerBinder', 'artUploads'). */
  limit: string;
  surface: CapSurface;
  /** Guests get the free account, never a plan pitch: the free tier is what lifts their cap. */
  isGuest: boolean;
  /** The wall in the user's terms. Same sentence the toast would have carried. */
  message: string;
  /** The same wall phrased as what the trial opens. Omit where a trial would unlock nothing. */
  trialMessage?: string;
  /** Dialog heading. Short, and never a pitch. */
  title: string;
}

/**
 * THREE WAYS OUT, and the stream has to keep them apart (see trackCapGateDismissed).
 *
 *   onDismiss('not_now') — the explicit decline at the foot of the dialog
 *   onDismiss('close')   — the X, which is a softer version of the same
 *   onResolve()          — they pressed the offer. The dialog closes so the trial, the plans page
 *                          or the auth sheet is actually visible, and NOTHING is recorded here:
 *                          this exit is a conversion, and the old single `onClose` counted it as
 *                          a back-out because it was the same function.
 */
export function CapGateDialog({
  wall,
  onDismiss,
  onResolve,
}: {
  wall: CapWall | null;
  onDismiss: (via: CapDismissal) => void;
  onResolve: () => void;
}) {
  if (!wall) return null;
  return (
    <DialogCard visible title={wall.title} onClose={() => onDismiss('close')} maxWidth={420}>
      {wall.isGuest ? (
        <SignInPerk message={wall.message} />
      ) : (
        <CapGateOffer
          message={wall.message}
          trialMessage={wall.trialMessage}
          surface={wall.surface}
          onBeforePress={onResolve}
        />
      )}
      <Pressable onPress={() => onDismiss('not_now')} hitSlop={6} style={styles.later}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.laterText}>
          Not now
        </ThemedText>
      </Pressable>
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  later: { alignSelf: 'center', marginTop: Spacing.three },
  laterText: { color: Palette.muted },
});
