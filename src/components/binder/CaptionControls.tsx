/**
 * The "Card labels" control for a binder view: a master on/off toggle and — when on — a wrapped
 * row of field chips (Series, Set, Name, Artist, …). Presentational: the enabled state and the
 * selected fields live in the parent screen so it can feed them to `BinderGrid`. Shared by the
 * owner viewer (`BinderScreen`) and the public viewer (`/binder/[id]`).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { pillChip } from '@/constants/ui';
import { CAPTION_FIELDS, type CaptionFieldKey } from '@/data/cardCaption';

export function CaptionControls({
  enabled,
  onToggle,
  fields,
  onToggleField,
}: {
  enabled: boolean;
  onToggle: () => void;
  fields: CaptionFieldKey[];
  onToggleField: (key: CaptionFieldKey) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Pressable onPress={onToggle} style={[pillChip.base, enabled && pillChip.active]}>
        <Text style={[pillChip.text, enabled && pillChip.textActive]}>
          {enabled ? '✓ Card labels' : 'Card labels'}
        </Text>
      </Pressable>

      {enabled ? (
        <View style={styles.fieldRow}>
          {CAPTION_FIELDS.map((f) => {
            const on = fields.includes(f.key);
            return (
              <Pressable
                key={f.key}
                onPress={() => onToggleField(f.key)}
                style={[pillChip.base, on && pillChip.active]}>
                <Text style={[pillChip.text, on && pillChip.textActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: Spacing.two, marginTop: Spacing.three },
  fieldRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.one,
  },
});
