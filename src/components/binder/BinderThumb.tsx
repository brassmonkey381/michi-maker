import { Pressable, StyleSheet, View } from 'react-native';

import { BinderGrid } from '@/components/binder/BinderGrid';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { DemoBinder } from '@/data/binderTypes';
import { MICHI_LAYOUT_STYLES, type MichiLayoutStyle } from '@/types/domain';

const LAYOUT_LABELS: Record<MichiLayoutStyle, string> = MICHI_LAYOUT_STYLES.reduce(
  (acc, style) => ({ ...acc, [style.value]: style.label }),
  {} as Record<MichiLayoutStyle, string>,
);

export function layoutLabel(style: MichiLayoutStyle): string {
  return LAYOUT_LABELS[style] ?? style;
}

interface BinderThumbProps {
  binder: DemoBinder;
  width: number;
  onPress: () => void;
}

export function BinderThumb({ binder, width, onPress }: BinderThumbProps) {
  const firstPage = binder.pages[0];
  const pageCount = binder.pages.length;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width }, pressed && styles.pressed]}>
      {firstPage ? (
        <BinderGrid page={firstPage} width={width} />
      ) : (
        <View style={[styles.placeholder, { width, height: width * 1.2 }]} />
      )}
      <ThemedText type="smallBold" numberOfLines={1} style={styles.title}>
        {binder.title}
      </ThemedText>
      <View style={styles.metaRow}>
        <ThemedView type="backgroundElement" style={styles.badge}>
          <ThemedText type="small" themeColor="textSecondary">
            {layoutLabel(binder.layoutStyle)}
          </ThemedText>
        </ThemedView>
        <ThemedText type="small" themeColor="textSecondary">
          {pageCount} {pageCount === 1 ? 'page' : 'pages'}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.75,
  },
  placeholder: {
    borderRadius: 16,
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  title: {
    marginTop: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    gap: 8,
  },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
});
