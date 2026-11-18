/**
 * MIC-059: "Label: X of Y owned · N%" with a bar, the one look for completion wherever it shows
 * (the Set Binders preview, My collection's Sets view, a binder tile, the pages inside a binder).
 * Counts come from data/completion.ts so every surface says the same number.
 *
 * 13 px floor (MIC-017 rules). `compact` drops the label onto the same line as the bar for the
 * narrow binder tiles.
 */
import { StyleSheet, Text, View } from 'react-native';

import { FontSize, Palette, Spacing, Weight } from '@/constants/theme';
import type { Completion } from '@/data/completion';
import { formatUsd } from '@/lib/prices';

const DONE = '#2e9e5b';

export function CompletionMeter({
  c,
  label,
  compact = false,
  finish,
  wrapText = false,
  inline = false,
  testID,
}: {
  c: Completion;
  /** "Whole set", "Page 3"; omitted on a tile, where the tile itself is the subject. */
  label?: string;
  compact?: boolean;
  /** MIC-060: the market price of the missing cards; shown when a number (Owned and Price both on). */
  finish?: number | null;
  /** Let the line wrap (a narrow side card) instead of truncating. */
  wrapText?: boolean;
  /** MIC-060: text and bar on one line (the strip above a binder's pages). */
  inline?: boolean;
  testID?: string;
}) {
  // Blue while partial, green only when complete (owner, 2026-11-18).
  const done = c.total > 0 && c.have === c.total;
  const showFinish = typeof finish === 'number' && !done;
  const text = (
    <Text style={[styles.text, inline && styles.textInline]} numberOfLines={wrapText ? undefined : 1} testID={testID}>
      {label ? `${label}: ` : ''}
      <Text style={styles.strong}>{`${c.have} of ${c.total}`}</Text>
      {compact ? ` · ${c.pct}%` : ` owned · ${c.pct}%`}
      {showFinish ? (
        <>
          {' · '}
          <Text style={styles.strong}>{formatUsd(finish)}</Text>
          {' to finish'}
        </>
      ) : done ? ' · complete' : ''}
    </Text>
  );
  return (
    <View
      style={inline ? styles.inline : compact ? styles.compact : styles.wrap}
      accessible
      accessibilityLabel={`${label ? `${label}, ` : ''}${c.have} of ${c.total} owned, ${c.pct} percent${showFinish ? `, ${formatUsd(finish)} to finish` : ''}`}>
      {text}
      <View style={[styles.track, inline && styles.trackInline]}>
        <View style={[styles.fill, { width: `${c.pct}%` }, done && styles.fillDone]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, minWidth: 0 },
  compact: { gap: 3, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  trackInline: { flex: 1, minWidth: 48, marginRight: 0 },
  text: { fontSize: FontSize.label, color: Palette.muted },
  textInline: { flexShrink: 1 },
  strong: { fontSize: FontSize.label, fontWeight: Weight.bold, color: Palette.ink },
  track: { height: 6, borderRadius: 99, backgroundColor: Palette.hairline, overflow: 'hidden', marginRight: Spacing.one },
  fill: { height: '100%', backgroundColor: Palette.accent },
  fillDone: { backgroundColor: DONE },
});
