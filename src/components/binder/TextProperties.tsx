/**
 * TEXT'S OWN PROPERTIES — the words, the face, the size, the weight, the alignment, the ink, and
 * what it sits on. Standard text-editor controls, laid out the way a properties panel lays them
 * out, above the shared position/size/order block.
 *
 * The words themselves are edited here rather than on the canvas: a text box on a 400px cover is
 * a small target, and a field with the caret in it is a better place to type than a rotated,
 * tilted, four-percent-of-the-width box. The field commits on blur or Enter, so a sentence is one
 * undo entry rather than forty.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ColorField } from '@/components/binder/ColorField';
import { NumField } from '@/components/binder/DecorationProperties';
import { Seg, segGroupStyle } from '@/components/binder/StudioControls';
import { FontSize, Fonts, Palette, Radius, Weight } from '@/constants/theme';
import { flatChip } from '@/constants/ui';
import type { CoverTextBgShape, CoverTextDecoration } from '@/data/binderTypes';
import { TEXT_SIZE_PRESETS } from '@/data/coverDecorations';
import { DECORATION_FONTS, fontFamilyFor } from '@/data/decorationFonts';

const BG_SHAPES: { id: CoverTextBgShape; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'rect', label: 'Box' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'postit', label: 'Post-it' },
  { id: 'notecard', label: 'Notecard' },
  { id: 'postcard', label: 'Postcard' },
  { id: 'circle', label: 'Circle' },
  { id: 'tag', label: 'Tag' },
];

/** The colour a background starts as, per shape — a post-it is yellow before anyone says so. */
const BG_DEFAULT_COLOUR: Partial<Record<CoverTextBgShape, string>> = {
  postit: '#fff3a8',
  notecard: '#fffdf4',
  postcard: '#f7f1e3',
  tag: '#f4e2c4',
  rect: '#ffffff',
  rounded: '#ffffff',
  circle: '#ffffff',
};

export function TextProperties({
  d,
  onPatch,
  onLivePatch,
}: {
  d: CoverTextDecoration;
  onPatch: (change: Partial<CoverTextDecoration>) => void;
  /** Every tick of a colour drag: repaints the cover through the live proxy, writes nothing. */
  onLivePatch: (change: Partial<CoverTextDecoration>) => void;
}) {
  const [draft, setDraft] = useState(d.text);
  const [seen, setSeen] = useState(d.text);
  // An outside change to the text (undo) replaces the draft; typing wins otherwise.
  if (seen !== d.text) {
    setSeen(d.text);
    setDraft(d.text);
  }
  const commitText = () => {
    const next = draft.trim() ? draft : d.text;
    if (next !== d.text) onPatch({ text: next });
  };
  const bg = d.bg && d.bg.shape !== 'none' ? d.bg : null;
  const presetOf = (size: number) =>
    (Object.entries(TEXT_SIZE_PRESETS).find(([, v]) => Math.abs(v - size) < 1e-6)?.[0] as keyof typeof TEXT_SIZE_PRESETS | undefined) ?? null;

  return (
    <View style={styles.panel} testID="text-properties">
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={commitText}
        onSubmitEditing={commitText}
        multiline
        blurOnSubmit
        placeholder="Your text"
        placeholderTextColor={Palette.muted}
        testID="text-input"
        style={[styles.textInput, { fontFamily: fontFamilyFor(d.font, Fonts as Record<string, string>) }]}
      />

      <Text style={styles.label}>Font</Text>
      <View style={styles.chipRow}>
        {DECORATION_FONTS.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => onPatch({ font: f.id })}
            accessibilityRole="button"
            accessibilityState={{ selected: d.font === f.id }}
            accessibilityLabel={`${f.label} — ${f.hint}`}
            testID={`text-font-${f.id}`}
            style={[flatChip.base, d.font === f.id && flatChip.active]}>
            <Text style={[flatChip.text, d.font === f.id && flatChip.textActive, { fontFamily: fontFamilyFor(f.id, Fonts as Record<string, string>) }]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>Size</Text>
          <View style={segGroupStyle}>
            {(Object.keys(TEXT_SIZE_PRESETS) as (keyof typeof TEXT_SIZE_PRESETS)[]).map((k) => (
              <Seg key={k} label={k} active={presetOf(d.size) === k} onPress={() => onPatch({ size: TEXT_SIZE_PRESETS[k] })} testID={`text-size-${k}`} />
            ))}
          </View>
        </View>
        <NumField label="Exact" value={Math.round(d.size * 1000) / 10} onCommit={(v) => onPatch({ size: v / 100 })} step={0.5} min={1} max={50} unit="%" decimals={1} />
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>Style</Text>
          <View style={styles.chipRow}>
            <Pressable onPress={() => onPatch({ weight: d.weight === 'bold' ? undefined : 'bold' })} accessibilityRole="button" accessibilityState={{ selected: d.weight === 'bold' }} style={[flatChip.base, d.weight === 'bold' && flatChip.active]}>
              <Text style={[flatChip.text, d.weight === 'bold' && flatChip.textActive, { fontWeight: '700' }]}>B</Text>
            </Pressable>
            <Pressable onPress={() => onPatch({ italic: !d.italic || undefined })} accessibilityRole="button" accessibilityState={{ selected: !!d.italic }} style={[flatChip.base, d.italic && flatChip.active]}>
              <Text style={[flatChip.text, d.italic && flatChip.textActive, { fontStyle: 'italic' }]}>I</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.col}>
          <Text style={styles.label}>Align</Text>
          <View style={segGroupStyle}>
            <Seg label="⇤" active={d.align === 'left'} onPress={() => onPatch({ align: 'left' })} testID="text-align-left" />
            <Seg label="☰" active={!d.align || d.align === 'center'} onPress={() => onPatch({ align: 'center' })} testID="text-align-center" />
            <Seg label="⇥" active={d.align === 'right'} onPress={() => onPatch({ align: 'right' })} testID="text-align-right" />
          </View>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>Ink</Text>
          <ColorField key={`ink-${d.id}`} value={d.color} onLive={(color) => onLivePatch({ color })} onChange={(color) => onPatch({ color })} />
        </View>
        <NumField label="Line height" value={Math.round((d.leading ?? 1.2) * 100)} onCommit={(v) => onPatch({ leading: v / 100 })} step={5} min={80} max={200} unit="%" />
      </View>

      <Text style={styles.label}>Background</Text>
      <View style={styles.chipRow}>
        {BG_SHAPES.map((s) => {
          const on = (d.bg?.shape ?? 'none') === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() =>
                onPatch({
                  bg:
                    s.id === 'none'
                      ? undefined
                      : { shape: s.id, color: d.bg?.color ?? BG_DEFAULT_COLOUR[s.id] ?? '#ffffff', opacity: d.bg?.opacity, pad: d.bg?.pad },
                })
              }
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              testID={`text-bg-${s.id}`}
              style={[flatChip.base, on && flatChip.active]}>
              <Text style={[flatChip.text, on && flatChip.textActive]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {bg ? (
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Background colour</Text>
            <ColorField key={`bg-${d.id}`} value={bg.color} onLive={(color) => onLivePatch({ bg: { ...bg, color } })} onChange={(color) => onPatch({ bg: { ...bg, color } })} />
          </View>
          <NumField label="Opacity" value={Math.round((bg.opacity ?? 1) * 100)} onCommit={(v) => onPatch({ bg: { ...bg, opacity: v >= 100 ? undefined : v / 100 } })} step={5} min={0} max={100} unit="%" />
          <NumField label="Padding" value={Math.round((bg.pad ?? 0.02) * 1000) / 10} onCommit={(v) => onPatch({ bg: { ...bg, pad: v / 100 } })} step={0.5} min={0} max={20} unit="%" decimals={1} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 8 },
  textInput: {
    minHeight: 64,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Radius.control,
    backgroundColor: Palette.panel,
    color: Palette.ink,
    fontSize: FontSize.body,
    textAlignVertical: 'top',
  },
  label: { fontSize: FontSize.sm, color: Palette.muted, fontWeight: Weight.medium, textTransform: 'uppercase', letterSpacing: 0.4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' },
  col: { gap: 4, minWidth: 120 },
});
