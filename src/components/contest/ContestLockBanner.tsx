/**
 * Says why this binder has gone read-only: it is a contest finalist, frozen as it qualified.
 *
 * The lock itself is a database trigger (`contest_lock_guard`, the stage-two migration), not this
 * banner and not the hidden Edit button. That is the point: a prize round judged on frozen entries
 * cannot be enforced by the client the entrant is holding. What the UI owes them is the reason,
 * before they go looking for the button that used to be there.
 *
 * Renders nothing for everyone else, which is almost everyone — at most sixty binders in the world
 * are ever in this state.
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { categoryLabel, CONTEST } from '@/data/contest';
import type { Finalist } from '@/data/contestRepo';

export function ContestLockBanner({ finalist }: { finalist: Finalist | null }) {
  if (!finalist?.locked) return null;
  return (
    <View style={styles.banner}>
      <ThemedText type="smallBold">
        🏆 Finalist · {categoryLabel(finalist.category)} · seeded #{finalist.seed}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
        This binder is in the Final of the {CONTEST.name}, so it is locked exactly as it qualified
        and cannot be edited while voting runs. Your other binders are unaffected.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignSelf: 'stretch',
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.accent,
    backgroundColor: Palette.selectionSoft,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    gap: 2,
  },
  body: { fontSize: FontSize.sm, lineHeight: 18 },
});
