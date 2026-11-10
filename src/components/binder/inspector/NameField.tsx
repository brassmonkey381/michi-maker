/**
 * A NAME OR DESCRIPTION FIELD (MIC-034). Two jobs on top of the plain LabeledInput:
 *
 * 1. It saves 600 ms after the last keystroke (and when the field loses focus), not on every
 *    keystroke: page and binder text used to write one row per letter typed.
 * 2. With auto names on, a field the app is still filling says so and offers Keep. Typing in it,
 *    or Keep, makes it the owner's for good (the caller sets the lock).
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LabeledInput } from '@/components/binder/inspector/controls';
import { FontSize, Palette, Radius, Weight } from '@/constants/theme';

const SAVE_MS = 600;

export function NameField({
  label,
  value,
  onSave,
  auto,
  onKeep,
  placeholder,
  multiline,
  testID,
}: {
  label: string;
  value: string;
  /** The owner's words, debounced. The caller locks the field with them. */
  onSave: (text: string) => void;
  /** The app is still filling this field from the cards: show the note and Keep. */
  auto?: boolean;
  onKeep?: () => void;
  placeholder?: string;
  multiline?: boolean;
  testID?: string;
}) {
  const [text, setText] = useState(value);
  const [typing, setTyping] = useState(false);
  // Follow the stored value (an auto name changing, another tab's edit) while nothing is pending.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (!typing) setText(value);
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const save = useRef(onSave);
  useEffect(() => {
    save.current = onSave;
  }, [onSave]);
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current !== null) {
      const t = pending.current;
      pending.current = null;
      save.current(t);
    }
    setTyping(false);
  };
  // Closing the sheet mid-word still saves the word.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current !== null) save.current(pending.current);
    },
    [],
  );
  return (
    <View>
      <LabeledInput
        label={label}
        value={text}
        onChangeText={(t) => {
          setText(t);
          setTyping(true);
          pending.current = t;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(flush, SAVE_MS);
        }}
        onBlur={flush}
        placeholder={placeholder}
        multiline={multiline}
        testID={testID}
      />
      {auto && value.trim() ? (
        <View style={styles.autoRow}>
          <Text style={styles.autoText}>Filled from the cards; it follows them until you edit it.</Text>
          <Pressable onPress={onKeep} accessibilityRole="button" accessibilityLabel={`Keep this ${label.toLowerCase()}`} testID={testID ? `${testID}-keep` : undefined} style={styles.keep}>
            <Text style={styles.keepText}>Keep</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  autoText: { flex: 1, fontSize: FontSize.sm, color: Palette.muted },
  keep: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill, backgroundColor: Palette.panel, borderWidth: 1, borderColor: Palette.hairline },
  keepText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink },
});
