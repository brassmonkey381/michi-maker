/**
 * The six controls a survey is made of. Each draws ONE question kind and knows nothing about
 * which survey it is in, which is what lets a sibling app reuse the lot with a new definition.
 *
 * WHAT THE DESIGN IS DOING, because these are the decisions that make survey data honest:
 *
 *   - Every scale labels both ends, and negative is always on the left. Never flipped "to catch
 *     inattentive respondents": it catches careful ones too.
 *   - Every skippable scale carries its way out as a real, visible control, not a shrug. A rating
 *     of a feature somebody has never opened is noise wearing the costume of data.
 *   - A picked value can be un-picked. A radio group with no escape turns a mis-tap into a
 *     permanent answer, and people abandon rather than submit something they did not mean.
 *   - Scales are radiogroups with labelled children, so a screen reader hears "3 of 5, Ease of
 *     use" and not "button".
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

/** One question's heading block: the prompt, and one quiet line of scope under it. */
export function QuestionHead({ prompt, help }: { prompt: string; help?: string }) {
  return (
    <View style={styles.head}>
      <ThemedText type="smallBold" style={styles.prompt}>
        {prompt}
      </ThemedText>
      {help ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.help}>
          {help}
        </ThemedText>
      ) : null}
    </View>
  );
}

/**
 * A row of numbers with both ends named. Used for every bounded judgement in the app: 0-10
 * recommendation, 1-5 satisfaction, 1-5 agreement, 1-5 effort.
 *
 * The buttons wrap rather than shrink. An eleven-point scale squeezed into a phone width gives
 * every option a tap target smaller than a fingertip, and mis-taps on a scale are invisible
 * errors: nobody checks what they scored.
 */
export function ScaleRow({
  min,
  max,
  value,
  minLabel,
  maxLabel,
  skipLabel,
  skipped,
  onPick,
  onSkip,
  label,
  testID,
}: {
  min: number;
  max: number;
  value: number | undefined;
  minLabel: string;
  maxLabel: string;
  skipLabel?: string;
  skipped?: boolean;
  onPick: (n: number) => void;
  onSkip?: () => void;
  label: string;
  testID?: string;
}) {
  const points = useMemo(
    () => Array.from({ length: max - min + 1 }, (_, i) => min + i),
    [min, max],
  );
  return (
    <View style={styles.scaleWrap} accessibilityRole="radiogroup" accessibilityLabel={label} testID={testID}>
      <View style={styles.scaleRow}>
        {points.map((n) => {
          const on = value === n;
          return (
            <Pressable
              key={n}
              onPress={() => onPick(n)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${n}${n === min ? `, ${minLabel}` : ''}${n === max ? `, ${maxLabel}` : ''}`}
              testID={testID ? `${testID}-${n}` : undefined}
              style={({ pressed }) => [styles.scaleDot, on && styles.scaleDotOn, pressed && styles.pressed]}>
              <ThemedText style={[styles.scaleDotText, on && styles.scaleDotTextOn]}>{n}</ThemedText>
            </Pressable>
          );
        })}
        {skipLabel && onSkip ? (
          <Pressable
            onPress={onSkip}
            accessibilityRole="radio"
            accessibilityState={{ checked: !!skipped }}
            accessibilityLabel={skipLabel}
            testID={testID ? `${testID}-skip` : undefined}
            style={({ pressed }) => [styles.skip, skipped && styles.skipOn, pressed && styles.pressed]}>
            <ThemedText style={[styles.skipText, skipped && styles.skipTextOn]}>{skipLabel}</ThemedText>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.ends}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.endText}>
          {minLabel}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={[styles.endText, styles.endRight]}>
          {maxLabel}
        </ThemedText>
      </View>
    </View>
  );
}

/**
 * Several rows sharing one scale. The points are named on every row rather than once in a header
 * because a header only works on a wide screen, and this has to read on a phone where each row
 * stacks under its own label.
 */
export function MatrixRow({
  label,
  points,
  value,
  skipLabel,
  skipped,
  onPick,
  onSkip,
  divided,
  testID,
}: {
  label: string;
  points: { value: number; label: string }[];
  value: number | undefined;
  skipLabel?: string;
  skipped?: boolean;
  onPick: (n: number) => void;
  onSkip?: () => void;
  /** Rule above this row. Set on every row but the first. */
  divided?: boolean;
  testID?: string;
}) {
  return (
    <View style={[styles.matrixRow, divided && styles.matrixDivided]}>
      <ThemedText type="small" style={styles.matrixLabel}>
        {label}
      </ThemedText>
      {/* flexBasis + wrap rather than a JS breakpoint: the row puts its buttons beside the label
          while they fit and drops them underneath when they do not, at whatever width that is. */}
      <View style={styles.matrixPoints} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {points.map((p) => {
          const on = value === p.value;
          return (
            <Pressable
              key={p.value}
              onPress={() => onPick(p.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${label}: ${p.label}`}
              testID={testID ? `${testID}-${p.value}` : undefined}
              style={({ pressed }) => [styles.point, on && styles.pointOn, pressed && styles.pressed]}>
              <ThemedText style={[styles.pointText, on && styles.pointTextOn]}>{p.label}</ThemedText>
            </Pressable>
          );
        })}
        {skipLabel && onSkip ? (
          <Pressable
            onPress={onSkip}
            accessibilityRole="radio"
            accessibilityState={{ checked: !!skipped }}
            accessibilityLabel={`${label}: ${skipLabel}`}
            testID={testID ? `${testID}-skip` : undefined}
            style={({ pressed }) => [styles.skip, skipped && styles.skipOn, pressed && styles.pressed]}>
            <ThemedText style={[styles.skipText, skipped && styles.skipTextOn]}>{skipLabel}</ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Multi-select (or single, when max is 1) as a wrapping field of chips. */
export function ChoiceChips({
  options,
  selected,
  onToggle,
  single,
  label,
  testID,
}: {
  options: { id: string; label: string; note?: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  single?: boolean;
  /** The question, so a radio group announces what it is choosing between. */
  label?: string;
  testID?: string;
}) {
  return (
    <View
      style={styles.chips}
      // Radios need an owning group to be announced as "1 of N"; checkboxes stand alone, and an
      // aria-label on a roleless element is not exposed at all, so the role is only set here.
      accessibilityRole={single ? 'radiogroup' : undefined}
      accessibilityLabel={single ? label : undefined}
      testID={testID}>
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <Pressable
            key={o.id}
            onPress={() => onToggle(o.id)}
            accessibilityRole={single ? 'radio' : 'checkbox'}
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.note ? `${o.label}, ${o.note}` : o.label}
            testID={testID ? `${testID}-${o.id}` : undefined}
            style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}>
            <ThemedText style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</ThemedText>
            {o.note ? (
              <ThemedText style={[styles.chipNote, on && styles.chipTextOn]}>{o.note}</ThemedText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A text answer with a live count that only appears near the limit. A counter sitting there from
 * the first keystroke reads as a word budget and shortens what people write, which is the
 * opposite of what an open question is for.
 */
export function SurveyTextInput({
  value,
  onChangeText,
  placeholder,
  lines = 1,
  maxLength,
  label,
  testID,
  keyboard,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  lines?: number;
  maxLength: number;
  label: string;
  testID?: string;
  keyboard?: 'email-address';
}) {
  const theme = useTheme();
  const multiline = lines > 1;
  const near = value.length > maxLength * 0.8;
  return (
    <View style={styles.inputWrap}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        multiline={multiline}
        numberOfLines={multiline ? lines : undefined}
        maxLength={maxLength}
        keyboardType={keyboard === 'email-address' ? 'email-address' : 'default'}
        autoCapitalize={keyboard === 'email-address' ? 'none' : 'sentences'}
        autoCorrect={keyboard !== 'email-address'}
        accessibilityLabel={label}
        testID={testID}
        style={[
          styles.input,
          multiline && { minHeight: 22 * lines + 20, textAlignVertical: 'top' },
          { color: theme.text, borderColor: theme.backgroundSelected, backgroundColor: theme.backgroundElement },
        ]}
      />
      {near ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.count}>
          {`${value.length} / ${maxLength}`}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** A single opt-in. The whole row is the target, because a 16px box is not one. */
export function ConsentRow({
  label,
  checked,
  onToggle,
  testID,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.consent, pressed && styles.pressed]}>
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? <ThemedText style={styles.tick}>✓</ThemedText> : null}
      </View>
      <ThemedText type="small" style={styles.consentText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { gap: 2 },
  prompt: { lineHeight: 20 },
  help: { lineHeight: 18 },
  pressed: { opacity: 0.7 },

  scaleWrap: { gap: 4 },
  scaleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  /**
   * `flexGrow` with a small basis: the points share the width evenly on a wide screen and wrap
   * into even rows on a narrow one, instead of eleven fixed cells that leave a ragged tail.
   */
  scaleDot: {
    flexGrow: 1,
    flexBasis: 38,
    minWidth: 38,
    maxWidth: 72,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
    alignItems: 'center',
  },
  scaleDotOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  scaleDotText: { fontSize: FontSize.body, fontWeight: Weight.semibold, color: Palette.ink2 },
  scaleDotTextOn: { color: Palette.accentText },
  ends: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  endText: { fontSize: FontSize.sm, flexShrink: 1 },
  endRight: { textAlign: 'right' },

  matrixRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.three,
    rowGap: 6,
    paddingVertical: 7,
  },
  matrixLabel: { lineHeight: 18, flexGrow: 1, flexBasis: 190, minWidth: 150 },
  matrixPoints: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flexGrow: 1, flexShrink: 0 },
  /** A hairline between rows: five unseparated rows of buttons is one grey field to the eye. */
  matrixDivided: { borderTopWidth: 1, borderTopColor: Palette.hairline },
  point: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
  },
  pointOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  pointText: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink2 },
  pointTextOn: { color: Palette.accentText },

  // The way out is styled as a quiet outline, never as a peer of the scale: it is an answer, but
  // it is not a rating, and it should not look like the end of the scale.
  skip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Palette.hairlineStrong,
  },
  skipOn: { backgroundColor: Palette.panel, borderStyle: 'solid', borderColor: Palette.muted },
  skipText: { fontSize: FontSize.label, color: Palette.muted },
  skipTextOn: { color: Palette.ink2, fontWeight: Weight.semibold },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
  },
  chipOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  chipText: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink2 },
  chipNote: { fontSize: FontSize.sm, color: Palette.muted },
  chipTextOn: { color: Palette.accentText },

  inputWrap: { gap: 2 },
  input: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: FontSize.body,
  },
  count: { textAlign: 'right', fontSize: FontSize.sm },

  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, paddingVertical: 4 },
  box: {
    width: 20,
    height: 20,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  tick: { color: Palette.accentText, fontSize: FontSize.label, fontWeight: Weight.bold, lineHeight: 18 },
  consentText: { flex: 1, lineHeight: 20 },
});
