/**
 * MIC-069: the body of the Invite Friends page, with no data access, so the page and a preview
 * with demo data draw the same thing. The page (src/app/invite.tsx) owns the reads and the buttons.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, MaxContentWidth, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { referralCounts, type ReferralSummary } from '@/data/referralCore';

export function InviteBody({
  summary,
  link,
  copied,
  canShare,
  error,
  onCopy,
  onShare,
}: {
  summary: ReferralSummary | null;
  link: string | null;
  copied: boolean;
  canShare: boolean;
  error: string | null;
  onCopy: () => void;
  onShare: () => void;
}) {
  const counts = referralCounts(summary?.invites ?? []);
  return (
      <View style={styles.prose}>
        {error ? (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        ) : null}
        {!summary && !error ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : null}

        {link ? (
          <View style={styles.card} testID="invite-link-card">
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
              Your invite link
            </ThemedText>
            <ThemedText type="default" selectable style={styles.link} testID="invite-link">
              {link}
            </ThemedText>
            <View style={styles.row}>
              <Pressable
                onPress={onCopy}
                accessibilityRole="button"
                testID="invite-copy"
                style={({ pressed }) => [styles.btn, pressed && styles.dim]}>
                <Text style={styles.btnText}>{copied ? 'Copied' : 'Copy link'}</Text>
              </Pressable>
              {canShare ? (
                <Pressable
                  onPress={onShare}
                  accessibilityRole="button"
                  testID="invite-share"
                  style={({ pressed }) => [styles.btnQuiet, pressed && styles.dim]}>
                  <Text style={styles.btnQuietText}>Share</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {summary ? (
          <View style={styles.stats} testID="invite-stats">
            <Stat value={counts.trialled} label="started the trial" />
            <Stat value={counts.paid} label="paid" />
            <Stat value={summary.creditsLeft} label={summary.creditsLeft === 1 ? 'free print left' : 'free prints left'} />
          </View>
        ) : null}

        {summary && summary.creditsLeft > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            To use a free print, open one of your binders, open its print sheet, and press &quot;Use a free print&quot;.
          </ThemedText>
        ) : null}

        <View style={styles.rules}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
            How it works
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            1. A friend opens your link and starts the free trial: you get 1 free print.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            2. When their trial ends and they pay: you each get 1 more.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Invite as many friends as you like, and free prints never run out. A friend counts once, for the first link
            they used. If a friend’s payment is refunded, the unused prints it earned are removed. Cancelling a trial
            removes nothing.
          </ThemedText>
        </View>
      </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  prose: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  center: { paddingVertical: Spacing.six, alignItems: 'center' },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.lg,
    backgroundColor: Palette.panelAlt,
  },
  label: { textTransform: 'uppercase', letterSpacing: 0.5 },
  link: { fontWeight: Weight.semibold },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  btn: {
    minHeight: 44,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.control,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: Palette.accentText, fontSize: FontSize.md, fontWeight: Weight.bold },
  btnQuiet: {
    minHeight: 44,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnQuietText: { color: Palette.ink, fontSize: FontSize.md, fontWeight: Weight.semibold },
  dim: { opacity: 0.7 },
  stats: { flexDirection: 'row', gap: Spacing.three },
  stat: {
    flex: 1,
    minWidth: 0,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.lg,
    gap: Spacing.one,
  },
  statValue: { fontSize: 28, fontWeight: Weight.bold, color: Palette.ink },
  rules: { gap: Spacing.two },
});
