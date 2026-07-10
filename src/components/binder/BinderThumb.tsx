import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BinderGrid } from '@/components/binder/BinderGrid';
import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import type { DemoBinder } from '@/data/binderTypes';

interface BinderThumbProps {
  binder: DemoBinder;
  width: number;
  onPress: () => void;
  /** Optional trailing control in the title row (e.g. the ⋯ actions button). */
  accessory?: ReactNode;
}

export function BinderThumb({ binder, width, onPress, accessory }: BinderThumbProps) {
  const firstPage = binder.pages[0];
  const pageCount = binder.pages.length;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width }, pressed && styles.pressed]}>
      <View style={styles.titleRow}>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.title}>
          {binder.title}
        </ThemedText>
        {accessory}
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.meta} numberOfLines={1}>
        {binder.authorName ? `by ${binder.authorName} · ` : ''}
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
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  title: {
    flex: 1,
    marginBottom: 2,
  },
  meta: {
    marginBottom: 8,
  },
});
