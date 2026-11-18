/**
 * ONE OF MANY = A DROPDOWN (MIC-017 rules, standing since MIC-058, 2026-11-18). The kit's
 * SelectTrigger (the chosen value in a field with a chevron box) opens a small list under itself:
 * a transparent Modal at window coordinates, the same way Browse's game menu opens, so it is never
 * clipped by a column and closes on a tap anywhere else. Rows are 44 px tall, text 15 px.
 */
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type View as ViewType } from 'react-native';
import { SelectTrigger } from 'tcgscan-ui';

import { Palette } from '@/constants/theme';

export interface DropdownOption<T extends string> {
  id: T;
  label: string;
  /** A second, quieter line under the label. */
  hint?: string;
}

export function DropdownSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  display,
  testID,
  minWidth = 160,
  caption = true,
}: {
  /** Said before the value to a screen reader, and as the small caption above the field. */
  label: string;
  value: T;
  options: readonly DropdownOption<T>[];
  onChange: (id: T) => void;
  /** What the closed field shows, when it should differ from the option's label. */
  display?: string;
  testID?: string;
  minWidth?: number;
  /** Off where a step heading above already names the choice. */
  caption?: boolean;
}) {
  const ref = useRef<ViewType>(null);
  const [at, setAt] = useState<{ x: number; y: number; w: number } | null>(null);
  const { width: winW, height: winH } = useWindowDimensions();
  const current = options.find((o) => o.id === value);
  const open = () => ref.current?.measureInWindow((x, y, w, h) => setAt({ x, y: y + h + 4, w }));
  const listW = Math.max(minWidth, at?.w ?? 0, 220);
  return (
    <View style={styles.wrap} testID={testID}>
      {caption ? <Text style={styles.caption}>{label}</Text> : null}
      <View ref={ref} collapsable={false} style={{ minWidth }}>
        <SelectTrigger
          value={display ?? current?.label ?? ''}
          onPress={open}
          expanded={!!at}
          accessibilityLabel={`${label}: ${display ?? current?.label ?? ''}`}
        />
      </View>
      {at ? (
        <Modal visible transparent animationType="none" onRequestClose={() => setAt(null)}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAt(null)} accessibilityLabel="Close" />
          <View
            style={[
              styles.card,
              { top: Math.min(at.y, winH - 120), left: Math.max(8, Math.min(at.x, winW - listW - 8)), width: listW, maxHeight: Math.max(160, winH - at.y - 16) },
            ]}
            testID={testID ? `${testID}-list` : undefined}>
            <ScrollView>
              {options.map((o) => {
                const on = o.id === value;
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => {
                      setAt(null);
                      if (!on) onChange(o.id);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    testID={testID ? `${testID}-${o.id}` : undefined}
                    style={({ pressed }) => [styles.item, on && styles.itemOn, pressed && styles.itemPressed]}>
                    <Text style={[styles.itemText, on && styles.itemTextOn]} numberOfLines={1}>
                      {o.label}
                    </Text>
                    {o.hint ? (
                      <Text style={[styles.itemHint, on && styles.itemTextOn]} numberOfLines={2}>
                        {o.hint}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, minWidth: 0 },
  caption: { fontSize: 13, fontWeight: '600', color: Palette.muted },
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
  item: { minHeight: 44, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 14, marginHorizontal: 6, borderRadius: 8 },
  itemOn: { backgroundColor: Palette.accent },
  itemPressed: { opacity: 0.8 },
  itemText: { fontSize: 15, fontWeight: '600', color: Palette.ink },
  itemTextOn: { color: Palette.accentText },
  itemHint: { fontSize: 13, color: Palette.muted, marginTop: 2 },
});
