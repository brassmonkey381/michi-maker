/**
 * The little quality badges on a binder — "Artistic", "New", "Deep".
 *
 * Sized to sit in a tile's title row next to the like count and the author avatar, which is a
 * crowded 220px. `max` exists for that: the thresholds are set so most binders earn nothing and a
 * few earn one, but a binder CAN earn all three, and three pills plus a count plus an avatar is a
 * dashboard rather than a tile. Two is the cap on a tile; the binder page passes a higher one
 * because it has the room.
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { binderBadges, type BinderBadge } from '@/data/binderBadges';
import type { DemoBinder } from '@/data/binderTypes';

const TINT: Record<BinderBadge['key'], string> = {
  artistic: Palette.accent,
  new: Palette.success,
  deep: Palette.warning,
};

export function BinderBadges({
  binder,
  max = 2,
  size = 'small',
}: {
  binder: DemoBinder;
  max?: number;
  size?: 'small' | 'regular';
}) {
  const badges = binderBadges(binder).slice(0, max);
  if (badges.length === 0) return null;
  const pad = size === 'small' ? 5 : 8;
  return (
    <View style={styles.row}>
      {badges.map((b) => (
        <View
          key={b.key}
          // The hint is the only place the RULE is visible to a reader; without it a badge is a
          // word with no explanation.
          accessibilityLabel={`${b.label}: ${b.hint}`}
          style={[
            styles.pill,
            { borderColor: TINT[b.key], paddingHorizontal: pad, paddingVertical: pad / 2.5 },
          ]}>
          <ThemedText
            style={[styles.text, { color: TINT[b.key], fontSize: size === 'small' ? 10 : 12 }]}>
            {b.label}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  pill: {
    borderWidth: 1,
    borderRadius: Radius.control,
    // No fill: these sit over a cream page and over binder art, and a tinted outline reads on both
    // without competing with the cards underneath.
    backgroundColor: 'transparent',
  },
  text: { fontWeight: '700', letterSpacing: 0.2 },
});
