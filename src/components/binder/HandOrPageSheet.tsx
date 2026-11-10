/**
 * WHERE DO THESE CARDS GO? (MIC-017 editor-hand, owner 2026-11-10: "let browse based search from
 * the card dock and the hand search to both allow multi-select and adding to the HAND area, as
 * well as the page if desired"). The browser's multi-select "Add all" opens this: the cards go to
 * the hand (up to its 24) or into this page's empty pockets. Both choices on both paths; the one
 * the search started from is first. Each says up front how many will fit.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DialogCard } from '@/components/ui/DialogCard';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

export type HandOrPage = 'hand' | 'page';

const fits = (n: number, room: number, full: string) =>
  room <= 0 ? full : n <= room ? `All ${n} fit` : `${room} of ${n} fit`;

export function HandOrPageSheet({
  count,
  handRoom,
  pageRoom,
  first,
  onPick,
  onClose,
}: {
  /** How many cards were selected. */
  count: number;
  /** Free places in the hand (24 minus what it holds, minus selected cards it already holds). */
  handRoom: number;
  /** Empty pockets on this page. */
  pageRoom: number;
  /** Which choice leads: where the search was started from. */
  first: HandOrPage;
  onPick: (to: HandOrPage) => void;
  onClose: () => void;
}) {
  const options: { key: HandOrPage; title: string; detail: string; room: number }[] = [
    { key: 'hand', title: 'Add to hand', detail: fits(count, handRoom, 'Your hand is full (24 cards)'), room: handRoom },
    { key: 'page', title: 'Add to this page', detail: fits(count, pageRoom, 'This page has no empty pockets'), room: pageRoom },
  ];
  if (first === 'page') options.reverse();
  // A choice with no room never leads: the other one does, and the full one says why below it.
  if (options[0].room <= 0 && options[1].room > 0) options.reverse();
  return (
    <DialogCard title={`Add ${count} card${count === 1 ? '' : 's'}`} onClose={onClose} maxWidth={420}>
      <View style={styles.list} testID="hand-or-page">
        {options.map((o, i) => (
          <Pressable
            key={o.key}
            disabled={o.room <= 0}
            onPress={() => onPick(o.key)}
            accessibilityRole="button"
            accessibilityLabel={`${o.title}. ${o.detail}`}
            testID={`add-to-${o.key}`}
            style={({ pressed }) => [styles.option, i === 0 && styles.optionFirst, o.room <= 0 && styles.optionOff, pressed && styles.pressed]}>
            <Text style={[styles.title, i === 0 && styles.titleFirst]}>{o.title}</Text>
            <ThemedText type="small" style={i === 0 ? styles.detailFirst : undefined} themeColor={i === 0 ? undefined : 'textSecondary'}>
              {o.detail}
            </ThemedText>
          </Pressable>
        ))}
      </View>
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two, paddingBottom: Spacing.two },
  option: { borderRadius: Radius.control, borderWidth: 1, borderColor: Palette.hairlineStrong, paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, gap: 2 },
  optionFirst: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  optionOff: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  title: { fontSize: FontSize.md, fontWeight: Weight.bold, color: Palette.ink },
  titleFirst: { color: Palette.accentText },
  detailFirst: { color: Palette.accentText },
});
