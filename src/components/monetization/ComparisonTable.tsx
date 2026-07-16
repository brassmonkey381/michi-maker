/**
 * The plan capability comparison on /pricing. Wide: a 4-column hairline grid. Narrow: one
 * stacked block per capability. Pure StyleSheet, data from src/data/pricing.ts.
 */
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Breakpoints, FontSize, Palette, Spacing } from '@/constants/theme';
import type { CompareRow } from '@/data/pricing';

const TIERS: { key: 'free' | 'pro' | 'vip'; label: string }[] = [
  { key: 'free', label: 'Free' },
  { key: 'pro', label: 'PRO' },
  { key: 'vip', label: 'VIP' },
];

export function ComparisonTable({ rows }: { rows: CompareRow[] }) {
  const { width } = useWindowDimensions();
  const wide = width >= Breakpoints.rail;

  if (!wide) {
    return (
      <View style={styles.stack}>
        {rows.map((r) => (
          <View key={r.capability} style={styles.stackRow}>
            <ThemedText type="smallBold" style={styles.stackCap}>
              {r.capability}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.stackVals}>
              Free {r.free} · PRO {r.pro} · VIP {r.vip}
            </ThemedText>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View>
      <View style={[styles.row, styles.headRow]}>
        <View style={styles.capCell} />
        {TIERS.map((t) => (
          <ThemedText key={t.key} type="smallBold" themeColor="textSecondary" style={styles.headCell}>
            {t.label}
          </ThemedText>
        ))}
      </View>
      {rows.map((r) => (
        <View key={r.capability} style={styles.row}>
          <ThemedText type="small" style={styles.capCell}>
            {r.capability}
          </ThemedText>
          {TIERS.map((t) => (
            <ThemedText key={t.key} type="small" themeColor="textSecondary" style={styles.cell}>
              {r[t.key]}
            </ThemedText>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  headRow: { borderBottomColor: Palette.hairlineStrong },
  capCell: { flex: 1.4, fontSize: FontSize.label },
  headCell: {
    flex: 1,
    fontSize: FontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  cell: { flex: 1, fontSize: FontSize.label, textAlign: 'center', lineHeight: 18 },
  stack: { gap: Spacing.three },
  stackRow: { gap: 2 },
  stackCap: { fontSize: FontSize.label },
  stackVals: { fontSize: FontSize.sm, lineHeight: 18 },
});
