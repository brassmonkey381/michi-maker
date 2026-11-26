/**
 * MIC-069: the body of the Invite Friends page, with no data access, so the page and a preview
 * with demo data draw the same thing. The page (src/app/invite.tsx) owns the reads and the buttons.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, MaxContentWidth, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import {
  printCodeReasonText,
  printCodeStatusText,
  referralCounts,
  type PrintCode,
  type ReferralSummary,
} from '@/data/referralCore';

export function InviteBody({
  summary,
  link,
  copied,
  canShare,
  error,
  onCopy,
  onShare,
  copiedCode,
  onCopyCode,
}: {
  summary: ReferralSummary | null;
  link: string | null;
  copied: boolean;
  canShare: boolean;
  error: string | null;
  onCopy: () => void;
  onShare: () => void;
  /** The print code just copied, to show "Copied" on its row. */
  copiedCode: string | null;
  onCopyCode: (code: string) => void;
}) {
  const counts = referralCounts({ invites: summary?.invites ?? [], printCodes: summary?.printCodes ?? [] });
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
            <Stat value={counts.paid} label={counts.paid === 1 ? 'paid subscriber' : 'paid subscribers'} />
            <Stat value={counts.ready} label={counts.ready === 1 ? 'free print code' : 'free print codes'} />
          </View>
        ) : null}

        {summary && summary.printCodes.length > 0 ? (
          <View style={styles.codes} testID="print-codes">
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
              Your free print codes
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Each code is one free binder PDF. In a binder&apos;s print sheet, press &quot;Unlock this binder&quot;, then
              enter the code under &quot;Add promotion code&quot; at checkout. Anyone can use a code, so you can give one
              away.
            </ThemedText>
            {summary.printCodes.map((c, i) => (
              <CodeRow key={c.code ?? `making-${i}`} c={c} copied={!!c.code && copiedCode === c.code} onCopy={onCopyCode} />
            ))}
          </View>
        ) : null}

        <View style={styles.rules}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
            How it works
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            1. A friend opens your link and starts the trial: you get 1 code for a free print unlock.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            2. That friend becomes a paying subscriber: you each get 1 additional code.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Invite as many friends as you like. Each code works for a year from the day you get it. A friend counts once, for the first
            link they used. If a friend’s payment is refunded, the unused codes it earned stop working. Cancelling a
            trial changes nothing.
          </ThemedText>
        </View>
      </View>
  );
}

function CodeRow({ c, copied, onCopy }: { c: PrintCode; copied: boolean; onCopy: (code: string) => void }) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const usable = c.state === 'ready' && !!c.code;
  const done = c.state === 'redeemed' || c.state === 'expired' || c.state === 'voided';
  return (
    <View style={[styles.codeRow, done && styles.codeRowDone]} testID="print-code-row">
      <View style={styles.codeMain}>
        <Text style={[styles.codeText, done && styles.codeTextDone]} selectable>
          {c.code ?? '······'}
        </Text>
        <ThemedText type="small" themeColor="textSecondary">
          {printCodeStatusText(c, fmt)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.reason}>
          {printCodeReasonText(c.reason)}
        </ThemedText>
      </View>
      {usable ? (
        <Pressable
          onPress={() => onCopy(c.code!)}
          accessibilityRole="button"
          accessibilityLabel={`Copy code ${c.code}`}
          style={({ pressed }) => [styles.btnQuiet, pressed && styles.dim]}>
          <Text style={styles.btnQuietText}>{copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
      ) : null}
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
  codes: { gap: Spacing.two },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.lg,
  },
  codeRowDone: { backgroundColor: Palette.panelAlt },
  codeMain: { flex: 1, minWidth: 0, gap: 2 },
  codeText: { fontSize: 20, fontWeight: Weight.bold, letterSpacing: 3, color: Palette.ink, fontVariant: ['tabular-nums'] },
  codeTextDone: { color: Palette.muted, textDecorationLine: 'line-through' },
  reason: { fontSize: 13 },
});
