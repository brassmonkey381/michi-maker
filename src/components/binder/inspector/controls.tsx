/**
 * THE INSPECTOR'S CONTROLS: the rows every section is built from.
 *
 * These began life inside BinderScreen, spread across three modals (View, Binder details, Page
 * details) and the pocket colour dialog. They are here so the same rows can be laid out in a
 * modal today and in the docked inspector next (see the inspector plan, 2026-09-14), with no
 * layout of their own: a section is a column of rows, and whatever holds the section decides the
 * width, the scrolling and the chrome.
 */
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ColorField } from '@/components/binder/ColorField';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Weight } from '@/constants/theme';
import { WEAR_NONE, resolveWear } from '@/data/pageStyle';
import { useTheme } from '@/hooks/use-theme';

/** A labelled row: the name on the left, its controls wrapping after it. */
export function Row({ label, children, testID }: { label: string; children: React.ReactNode; testID?: string }) {
  return (
    <View style={styles.inlineRow} testID={testID}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.inlineLabel}>
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

/** A segmented control: one of a short list, the chosen one lifted. */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  labelOf,
}: {
  options: readonly { id: T; label: string; blurb?: string }[];
  value: T;
  onChange: (id: T) => void;
  /** The accessible name when the label alone does not say enough. */
  labelOf?: (o: { id: T; label: string; blurb?: string }) => string;
}) {
  return (
    <View style={styles.segGroup}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={labelOf ? labelOf(o) : o.blurb ? `${o.label}: ${o.blurb}` : o.label}
            style={[styles.seg, active && styles.segActive]}>
            <Text style={[styles.segText, active && styles.segTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A chip that is on or off, for a set where several can be on at once. */
export function ToggleChip({ label, on, onPress, accessibilityLabel }: { label: string; on: boolean; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={accessibilityLabel ?? label}>
      <View style={[styles.chip, on && styles.chipActive]}>
        <Text style={[styles.chipText, on && styles.chipTextActive]}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function PillButton({
  label,
  onPress,
  tone = 'default',
  disabled = false,
  active = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** The pill names the current state (a chosen option), not an action: outlined in the brand colour. */
  active?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        styles.pill,
        tone === 'danger' && styles.pillDanger,
        active && styles.pillActive,
        pressed && styles.pressed,
        disabled && styles.pillDisabled,
      ]}>
      <Text style={[styles.pillText, tone === 'danger' && styles.pillTextDanger, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** A colour swatch in the width every colour row shares, so the rows line up. */
export function ColorBox({ fieldKey, value, onChange }: { fieldKey: string; value?: string; onChange: (hex: string) => void }) {
  return (
    <View style={styles.colorFieldBox}>
      <ColorField key={fieldKey} value={value} onChange={onChange} />
    </View>
  );
}

/**
 * ONE ROW OF WHAT A POCKET WEARS: a sleeve colour, or an art backing, at the binder, the page or
 * the pocket. Three states (owner, 2026-09-14): a colour of its own, "None" (bare here even if the
 * layer above wears one), or nothing set, which inherits. The colour swatch always shows what is
 * in effect so the picker opens on it; `inherit` is the pill that hands the choice back up (absent
 * at the binder, which has nothing above it, so there "None" and clearing are the same thing).
 */
export function WearRow({
  label,
  fieldKey,
  own,
  above,
  inherit,
  onChange,
  testID,
}: {
  label: string;
  fieldKey: string;
  /** This layer's own value: a colour, WEAR_NONE, or nothing. */
  own: string | null | undefined;
  /** What the layers above resolve to, already reduced. */
  above?: string;
  /** Label of the hand-it-back pill, e.g. "Use binder's". Omit at the top layer. */
  inherit?: string;
  /** A colour, WEAR_NONE, or null to inherit. */
  onChange: (value: string | null) => void;
  testID?: string;
}) {
  const isNone = own === WEAR_NONE;
  const inEffect = resolveWear(own, above);
  return (
    <Row label={label}>
      <ColorBox fieldKey={`${fieldKey}-${isNone ? 'none' : 'colour'}`} value={inEffect ?? '#ffffff'} onChange={onChange} />
      <PillButton label="None" active={isNone} onPress={() => onChange(inherit ? WEAR_NONE : null)} testID={testID ? `${testID}-none` : undefined} />
      {inherit && own ? <PillButton label={inherit} onPress={() => onChange(null)} testID={testID ? `${testID}-inherit` : undefined} /> : null}
    </Row>
  );
}

export function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  style,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  style?: object;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View style={style}>
      <Text style={[styles.fieldMiniLabel, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        multiline={multiline}
        testID={testID}
        style={[
          styles.fieldInput,
          multiline && styles.fieldInputMulti,
          { color: theme.text, borderColor: theme.backgroundSelected, backgroundColor: theme.backgroundElement },
        ]}
      />
    </View>
  );
}

export const styles = StyleSheet.create({
  /** A section: rows down a column, the same gap the modals used. */
  section: { gap: 10, alignSelf: 'stretch' },
  inlineRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  inlineLabel: { marginRight: 2 },
  colorFieldBox: { width: 170 },
  segGroup: { flexDirection: 'row', alignItems: 'center', backgroundColor: Palette.panel, borderRadius: Radius.pill, padding: 2 },
  seg: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.pill },
  segActive: {
    backgroundColor: Palette.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segText: { fontSize: FontSize.label, color: Palette.muted, fontWeight: Weight.medium },
  segTextActive: { color: Palette.ink, fontWeight: Weight.semibold },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.pill, backgroundColor: Palette.panel },
  chipActive: { backgroundColor: Palette.accent },
  chipText: { fontSize: FontSize.label, color: Palette.ink2 },
  chipTextActive: { color: Palette.accentText, fontWeight: Weight.semibold },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.pill, backgroundColor: Palette.panel },
  pillDisabled: { opacity: 0.4 },
  pillDanger: { backgroundColor: Palette.dangerBg },
  pillActive: { backgroundColor: Palette.surface, borderWidth: 1.5, borderColor: Palette.accent, paddingVertical: 6.5, paddingHorizontal: 12.5 },
  pillText: { fontSize: FontSize.body, fontWeight: Weight.semibold, color: Palette.ink2 },
  pillTextDanger: { color: Palette.dangerAlt },
  pillTextActive: { color: Palette.accent },
  pressed: { opacity: 0.7 },
  fieldMiniLabel: { fontSize: FontSize.xs, fontWeight: Weight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  fieldInput: { borderWidth: 1, borderRadius: Radius.control, paddingHorizontal: 10, paddingVertical: 6, fontSize: FontSize.control },
  fieldInputMulti: { minHeight: 36, textAlignVertical: 'top' },
});
