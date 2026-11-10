/**
 * A NAME OR DESCRIPTION FIELD (MIC-034). Two jobs on top of the plain LabeledInput:
 *
 * 1. It saves 600 ms after the last keystroke (and when the field loses focus), not on every
 *    keystroke: page and binder text used to write one row per letter typed.
 * 2. With auto names on, a field the app is still filling says so and offers Keep. Typing in it,
 *    or Keep, makes it the owner's for good (the caller sets the lock).
 * 3. ✨ asks for three options (part 2); tapping one saves it as the owner's choice.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LabeledInput } from '@/components/binder/inspector/controls';
import type { NameIdeasResult } from '@/lib/nameIdeas';
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
  ideas,
}: {
  /** ✨: three options on request. Absent hides the button (no cards to read yet). */
  ideas?: () => Promise<NameIdeasResult>;
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
  const [asked, setAsked] = useState<{ busy: boolean; options: string[]; note: string | null } | null>(null);
  const ask = () => {
    if (!ideas || asked?.busy) return;
    setAsked({ busy: true, options: [], note: null });
    void ideas().then((r) => {
      if ('options' in r) setAsked({ busy: false, options: r.options, note: null });
      else if ('limit' in r)
        setAsked({ busy: false, options: [], note: r.limit === 'subject' ? 'That is all the ideas for this one today. More tomorrow.' : 'That is all your ideas for today. More tomorrow.' });
      else setAsked({ busy: false, options: [], note: 'No ideas came back. Try again in a moment.' });
    });
  };
  const pick = (o: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    setText(o);
    setTyping(false);
    setAsked(null);
    save.current(o);
  };
  return (
    <View>
      {ideas ? (
        <Pressable
          onPress={ask}
          disabled={!!asked?.busy}
          accessibilityRole="button"
          accessibilityLabel={`Suggest three options for the ${label.toLowerCase()}`}
          testID={testID ? `${testID}-ideas` : undefined}
          style={styles.spark}>
          <Text style={styles.sparkText}>{asked?.busy ? '✨ Thinking…' : '✨ Ideas'}</Text>
        </Pressable>
      ) : null}
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
      {asked && (asked.options.length || asked.note) ? (
        <View style={styles.ideas} testID={testID ? `${testID}-options` : undefined}>
          {asked.options.map((o) => (
            <Pressable key={o} onPress={() => pick(o)} accessibilityRole="button" accessibilityLabel={`Use: ${o}`} style={styles.idea}>
              <Text style={styles.ideaText}>{o}</Text>
            </Pressable>
          ))}
          {asked.note ? <Text style={styles.autoText}>{asked.note}</Text> : null}
        </View>
      ) : null}
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
  spark: { position: 'absolute', right: 0, top: -2, zIndex: 2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill },
  sparkText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.accent },
  ideas: { gap: 6, marginTop: 6 },
  idea: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radius.control, borderWidth: 1, borderColor: Palette.hairlineStrong, backgroundColor: Palette.panel },
  ideaText: { fontSize: FontSize.sm, color: Palette.ink },
  keepText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink },
});
