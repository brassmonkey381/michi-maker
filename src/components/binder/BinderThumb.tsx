import { Pressable, StyleSheet, View } from 'react-native';

import { BinderGrid } from '@/components/binder/BinderGrid';
import { ThemedText } from '@/components/themed-text';
import type { DemoBinder } from '@/data/binderTypes';

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
      <ThemedText type="smallBold" numberOfLines={1} style={styles.title}>
        {binder.title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.meta}>
        {pageCount} {pageCount === 1 ? 'page' : 'pages'}
      </ThemedText>
      {firstPage ? (
        <BinderGrid page={firstPage} width={width} />
      ) : (
        <View style={[styles.placeholder, { width, height: width * 1.2 }]} />
      )}
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
    marginBottom: 2,
  },
  meta: {
    marginBottom: 8,
  },
});
