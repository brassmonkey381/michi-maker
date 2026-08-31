/**
 * Says out loud that this tab isn't the one that saves.
 *
 * Editing follows focus, so in the ordinary two-tab case nobody ever sees this: click into a tab
 * and it takes the lease before you can touch anything. It shows in the arrangement where two
 * windows are visible at once — side by side on a wide screen — and the one you aren't typing in
 * has gone read-only. The alternative was letting that window accept edits it would never save,
 * or worse, save them over a view that was hours stale.
 *
 * `resyncing` is the short beat right after a hand-off while the server's state is being pulled,
 * and it is worth showing rather than hiding: it is the moment this tab stops being wrong.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { useBinders } from '@/store/binders';

export function EditLockBanner() {
  const { editLockStatus, takeOverEditing } = useBinders();

  if (editLockStatus === 'holder' || editLockStatus === 'unsupported') return null;

  const syncing = editLockStatus === 'resyncing';

  return (
    <View style={styles.banner}>
      <View style={styles.textCol}>
        <ThemedText type="smallBold">
          {syncing ? 'Catching up…' : 'Editing is open in another tab'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
          {syncing
            ? 'Loading the latest version of your binders before you make changes here.'
            : 'This tab is read-only so the two tabs can’t save over each other. Click here to edit in this tab instead.'}
        </ThemedText>
      </View>
      {syncing ? null : (
        <Pressable
          onPress={takeOverEditing}
          accessibilityRole="button"
          accessibilityLabel="Edit in this tab"
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={styles.btnText}>
            Edit here
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
  },
  textCol: { flex: 1, gap: 2 },
  body: { lineHeight: 18 },
  btn: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    backgroundColor: Palette.accent,
  },
  pressed: { opacity: 0.7 },
  btnText: { color: Palette.accentText, fontSize: FontSize.control },
});
