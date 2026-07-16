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
  collapsible = true,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  /** Start collapsed (e.g. a long secondary feed). Default: expanded. */
  initiallyCollapsed?: boolean;
  /** Allow tapping the title to collapse the body. Default: true. Pass false for an
   *  always-open section (no chevron, always shows its content). */
  collapsible?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(collapsible && initiallyCollapsed);
  const theme = useTheme();
  const open = collapsible ? !collapsed : true;
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        {collapsible ? (
          <Pressable
            onPress={() => setCollapsed((c) => !c)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityState={{ expanded: open }}
            style={styles.titleTap}>
            <Text style={[styles.chevron, { color: theme.textSecondary }]}>{open ? '▾' : '▸'}</Text>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title} numberOfLines={1}>
              {title}
            </ThemedText>
          </Pressable>
        ) : (
          <View style={styles.titleTap}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title} numberOfLines={1}>
              {title}
            </ThemedText>
          </View>
        )}
        {action}
      </View>
      {open ? children : null}
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
