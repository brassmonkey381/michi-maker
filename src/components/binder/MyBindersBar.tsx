/**
 * MIC-072 (owner 2026-11-25): the view bar at the top of My Binders. One compact horizontal row:
 * "Owned" (how much of each binder you own, on every cover), "Prices" (each binder's value), and
 * the order and filter of the covers. "Make sure it's a horizontal UI toolbar, well aligned and
 * spaced, and doesn't take up too much vertical space."
 *
 * Owned and Prices are THE SAME settings as a binder's My view (the view's `owned`, the card
 * labels' Price field), so turning one on here turns it on there and the other way round.
 *
 * Never two rows: on a desk the toggles sit left and "Show" and "Sort" right; on a phone "Show"
 * folds into the "Sort" menu (no sideways-scrolling bars on a phone). 44 px taps, 13 px floor.
 */
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type View as ViewType } from 'react-native';

import { Palette } from '@/constants/theme';
import { toggleChip } from '@/constants/ui';
import type { BinderSort } from '@/data/viewPrefs';

export interface MenuOption<T extends string> {
  id: T;
  label: string;
}

interface MenuSection {
  title: string;
  options: readonly MenuOption<string>[];
  value: string;
  onPick: (id: string) => void;
}

/** A chip that opens a small list of one or more single-choice sections under itself. */
function MenuChip({ text, a11y, sections, testID }: { text: string; a11y: string; sections: MenuSection[]; testID: string }) {
  const ref = useRef<ViewType>(null);
  const [at, setAt] = useState<{ x: number; y: number; w: number } | null>(null);
  const { width: winW, height: winH } = useWindowDimensions();
  const open = () => ref.current?.measureInWindow((x, y, w, h) => setAt({ x, y: y + h + 4, w }));
  const listW = 220;
  return (
    <View ref={ref} collapsable={false}>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityState={{ expanded: !!at }}
        testID={testID}
        style={({ pressed }) => [toggleChip.base, styles.menuChip, pressed && styles.pressed]}>
        <Text style={toggleChip.text} numberOfLines={1}>
          {text} <Text style={styles.chev}>▾</Text>
        </Text>
      </Pressable>
      {at ? (
        <Modal visible transparent animationType="none" onRequestClose={() => setAt(null)}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAt(null)} accessibilityLabel="Close" />
          <View
            style={[
              styles.card,
              {
                top: Math.min(at.y, winH - 160),
                left: Math.max(8, Math.min(at.x + at.w - listW, winW - listW - 8)),
                width: listW,
                maxHeight: Math.max(200, winH - at.y - 16),
              },
            ]}
            testID={`${testID}-list`}>
            <ScrollView>
              {sections.map((s) => (
                <View key={s.title}>
                  {sections.length > 1 ? <Text style={styles.sectionTitle}>{s.title}</Text> : null}
                  {s.options.map((o) => {
                    const on = o.id === s.value;
                    return (
                      <Pressable
                        key={o.id}
                        onPress={() => {
                          setAt(null);
                          if (!on) s.onPick(o.id);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        testID={`${testID}-${o.id}`}
                        style={({ pressed }) => [styles.item, on && styles.itemOn, pressed && styles.pressed]}>
                        <Text style={[styles.itemText, on && styles.itemTextOn]} numberOfLines={1}>
                          {o.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const SORT_LABELS: Record<BinderSort, string> = {
  recent: 'Recent',
  name: 'Name',
  owned: 'Most owned',
  value: 'Most valuable',
};

export function MyBindersBar<V extends string>({
  narrow,
  owned,
  onOwned,
  prices,
  onPrices,
  sort,
  onSort,
  show,
}: {
  /** Phone width: "Show" folds into the "Sort" menu. */
  narrow: boolean;
  /** Null hides the Owned toggle (no account, so no collection to count). */
  owned: boolean | null;
  onOwned: (on: boolean) => void;
  prices: boolean;
  onPrices: (on: boolean) => void;
  sort: BinderSort;
  onSort: (s: BinderSort) => void;
  /** The All / Public / Private / Puzzles filter, when there is more than one kind to filter. */
  show?: { value: V; options: readonly MenuOption<V>[]; onPick: (v: V) => void } | null;
}) {
  // Most owned only means something with Owned on, most valuable only with Prices on.
  const sorts = (['recent', 'name', 'owned', 'value'] as BinderSort[]).filter(
    (s) => (s !== 'owned' || owned) && (s !== 'value' || prices),
  );
  const effective = sorts.includes(sort) ? sort : 'recent';
  const sortSection: MenuSection = {
    title: 'Sort',
    options: sorts.map((s) => ({ id: s, label: SORT_LABELS[s] })),
    value: effective,
    onPick: (id) => onSort(id as BinderSort),
  };
  const showSection: MenuSection | null = show
    ? { title: 'Show', options: show.options, value: show.value, onPick: (id) => show.onPick(id as V) }
    : null;
  const showLabel = show?.options.find((o) => o.id === show.value)?.label ?? '';
  return (
    <View style={styles.bar} testID="my-binders-bar">
      <View style={styles.group}>
        {owned !== null ? (
          <Pressable
            onPress={() => onOwned(!owned)}
            accessibilityRole="switch"
            accessibilityState={{ checked: owned }}
            accessibilityLabel="Owned: show how much of each binder you own"
            testID="bar-owned"
            style={[toggleChip.base, styles.toggle, owned && toggleChip.active]}>
            <Text style={[toggleChip.text, owned && toggleChip.textActive]}>{owned ? '✓ Owned' : 'Owned'}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => onPrices(!prices)}
          accessibilityRole="switch"
          accessibilityState={{ checked: prices }}
          accessibilityLabel="Prices: show what each binder is worth"
          testID="bar-prices"
          style={[toggleChip.base, styles.toggle, prices && toggleChip.active]}>
          <Text style={[toggleChip.text, prices && toggleChip.textActive]}>{prices ? '✓ Prices' : 'Prices'}</Text>
        </Pressable>
      </View>
      <View style={styles.group}>
        {showSection && !narrow ? (
          <MenuChip text={`Show: ${showLabel}`} a11y={`Show: ${showLabel}`} sections={[showSection]} testID="bar-show" />
        ) : null}
        <MenuChip
          text={narrow ? 'Sort' : `Sort: ${SORT_LABELS[effective]}`}
          a11y={`Sort: ${SORT_LABELS[effective]}${showSection && narrow ? `. Show: ${showLabel}` : ''}`}
          sections={showSection && narrow ? [sortSection, showSection] : [sortSection]}
          testID="bar-sort"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 },
  group: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  toggle: { paddingHorizontal: 12 },
  menuChip: { paddingHorizontal: 12 },
  chev: { fontSize: 13, color: Palette.muted },
  pressed: { opacity: 0.8 },
  card: {
    position: 'absolute',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.panel,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Palette.muted, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  item: { minHeight: 44, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 14, marginHorizontal: 6, borderRadius: 8 },
  itemOn: { backgroundColor: Palette.accent },
  itemText: { fontSize: 15, fontWeight: '600', color: Palette.ink },
  itemTextOn: { color: Palette.accentText },
});
