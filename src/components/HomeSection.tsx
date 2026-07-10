/**
 * A collapsible home-screen section: an uppercase title (with a disclosure chevron) over its
 * content, plus an optional right-aligned `action` (e.g. "+ New"). Tapping the title toggles the
 * body open/closed; the action stays its own tap target. Used for every home section so they read
 * and behave alike.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Spacing, Weight } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function HomeSection({
  title,
  action,
  children,
  initiallyCollapsed = false,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  /** Start collapsed (e.g. a long secondary feed). Default: expanded. */
  initiallyCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Pressable
          onPress={() => setCollapsed((c) => !c)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityState={{ expanded: !collapsed }}
          style={styles.titleTap}>
          <Text style={[styles.chevron, { color: theme.textSecondary }]}>{collapsed ? '▸' : '▾'}</Text>
          <ThemedText type="smallBold" style={styles.title} numberOfLines={1}>
            {title}
          </ThemedText>
        </Pressable>
        {action}
      </View>
      {collapsed ? null : children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Spacing.five },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  titleTap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexShrink: 1 },
  chevron: { fontSize: FontSize.label, fontWeight: Weight.bold, width: 12 },
  title: { textTransform: 'uppercase', letterSpacing: 0.5 },
});
