/**
 * THE PROPERTIES PANEL — what the selected decoration IS, as numbers you can type.
 *
 * Direct manipulation on the canvas is how most edits happen; this is for the rest: the exact
 * angle, the width you want to match another piece to, a mask, the stacking order. It reads like
 * Photoshop's Properties panel because that is the vocabulary people already have — X Y W H and
 * rotation with units, flips as two buttons, order as four.
 *
 * Every field writes through the same list operations the canvas and the tray use, so an edit
 * here is one undo entry, exactly like a drag.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ImageProperties } from '@/components/binder/ImageProperties';
import { IconBtn } from '@/components/binder/StudioControls';
import { TextProperties } from '@/components/binder/TextProperties';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Weight } from '@/constants/theme';
import { flatChip } from '@/constants/ui';
import type { CoverDecoration, CoverImageDecoration, CoverMaskShape } from '@/data/binderTypes';
import {
  MAX_TILT,
  MAX_W,
  MIN_W,
  duplicateDecoration,
  moveDecoration,
  normalizeAngle,
  patchDecoration,
  removeDecoration,
} from '@/data/coverDecorations';

/**
 * A number you can type. Local text while focused, committed on blur or Enter, so a half-typed
 * "0." does not write NaN into the cover; ± steppers with press-and-hold, in the given step.
 */
export function NumField({
  label,
  value,
  onCommit,
  step = 1,
  min,
  max,
  unit,
  decimals = 0,
  testID,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  decimals?: number;
  testID?: string;
}) {
  const fmt = (v: number) => v.toFixed(decimals);
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  // A value changed from OUTSIDE (a drag on the canvas) replaces the text — unless the field is
  // being typed in, when the typist wins. Adjusted during render against the previous value, the
  // sanctioned shape; an effect would paint the stale number for a frame first.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (!focused) setText(fmt(value));
  }
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const commit = () => {
    const v = parseFloat(text);
    if (Number.isFinite(v)) onCommit(clamp(v));
    else setText(fmt(value));
  };
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldRow}>
        <IconBtn label="−" onPress={() => onCommit(clamp(value - step))} repeat accessibilityLabel={`${label} down`} />
        <TextInput
          testID={testID}
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onSubmitEditing={commit}
          keyboardType="numeric"
          selectTextOnFocus
          style={styles.input}
        />
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
        <IconBtn label="+" onPress={() => onCommit(clamp(value + step))} repeat accessibilityLabel={`${label} up`} />
      </View>
    </View>
  );
}

function Chip({ label, on, onPress, testID }: { label: string; on?: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      style={({ pressed }) => [flatChip.base, on && flatChip.active, pressed && styles.pressed]}>
      <Text style={[flatChip.text, on && flatChip.textActive]}>{label}</Text>
    </Pressable>
  );
}

const MASKS: { id: CoverMaskShape; label: string }[] = [
  { id: 'rect', label: 'Square' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'ellipse', label: 'Oval' },
];

export function DecorationProperties({
  d,
  items,
  onChange,
  onSelect,
  surfaceAspect,
}: {
  d: CoverDecoration;
  items: CoverDecoration[];
  onChange: (next: CoverDecoration[]) => void;
  onSelect: (id: string | null) => void;
  /** Surface width ÷ height, so Y and H can be shown in the same percent-of-width unit as X and W. */
  surfaceAspect: number;
}) {
  const commit = (next: CoverDecoration[]) => {
    if (next !== items) onChange(next);
  };
  const patch = (change: Partial<CoverDecoration>) => commit(patchDecoration(items, d.id, change as never));
  const index = items.findIndex((it) => it.id === d.id);
  const isImage = d.kind !== 'text';
  const image = isImage ? (d as CoverImageDecoration) : null;
  const locked = !!d.locked;
  const pct = (v: number) => Math.round(v * 1000) / 10;
  const fromPct = (v: number) => v / 100;

  return (
    <View style={styles.panel} testID="cover-properties">
      <View style={styles.titleRow}>
        <ThemedText type="smallBold">{d.kind === 'text' ? 'Text' : d.kind === 'sticker' ? 'Sticker' : 'Art'}</ThemedText>
        {locked ? <Text style={styles.lockedNote}>Locked — unlock to move or resize</Text> : null}
      </View>

      {/* Text first: what it says and how it is set, above the box everything shares. */}
      {d.kind === 'text' ? <TextProperties d={d} onPatch={(change) => patch(change as Partial<CoverDecoration>)} /> : null}

      {/* Position and size, as percentages of the surface's width — one unit for all four, which
          is the only way "make it as wide as that one" is a number you can read off. */}
      <View style={styles.grid}>
        <NumField label="X" value={pct(d.x)} onCommit={(v) => !locked && patch({ x: fromPct(v) })} step={0.5} min={0} max={100} unit="%" decimals={1} testID="prop-x" />
        <NumField label="Y" value={pct(d.y / surfaceAspect)} onCommit={(v) => !locked && patch({ y: fromPct(v) * surfaceAspect })} step={0.5} min={0} max={100 / surfaceAspect} unit="%" decimals={1} testID="prop-y" />
        <NumField label="W" value={pct(d.w)} onCommit={(v) => !locked && patch({ w: fromPct(v) })} step={0.5} min={MIN_W * 100} max={MAX_W * 100} unit="%" decimals={1} testID="prop-w" />
        <NumField label="H" value={pct(d.h ?? d.w)} onCommit={(v) => !locked && patch({ h: fromPct(v) })} step={0.5} min={MIN_W * 100} max={MAX_W * 100} unit="%" decimals={1} testID="prop-h" />
      </View>

      <View style={styles.grid}>
        <NumField label="Rotation" value={d.rot ?? 0} onCommit={(v) => !locked && patch({ rot: normalizeAngle(v) })} step={1} unit="°" testID="prop-rot" />
        <NumField label="Opacity" value={Math.round((d.opacity ?? 1) * 100)} onCommit={(v) => patch({ opacity: v >= 100 ? undefined : v / 100 })} step={5} min={0} max={100} unit="%" />
      </View>

      {/* Perspective tilt — the one non-affine look every platform draws the same way. */}
      <View style={styles.grid}>
        <NumField label="Tilt ↕" value={d.tiltX ?? 0} onCommit={(v) => !locked && patch({ tiltX: v === 0 ? undefined : v })} step={1} min={-MAX_TILT} max={MAX_TILT} unit="°" />
        <NumField label="Tilt ↔" value={d.tiltY ?? 0} onCommit={(v) => !locked && patch({ tiltY: v === 0 ? undefined : v })} step={1} min={-MAX_TILT} max={MAX_TILT} unit="°" />
      </View>

      <View style={styles.chipRow}>
        <Chip label="Straighten" onPress={() => !locked && patch({ rot: undefined, tiltX: undefined, tiltY: undefined })} />
        {isImage ? (
          <>
            <Chip label="Flip ↔" on={!!d.flipH} onPress={() => !locked && patch({ flipH: !d.flipH || undefined })} />
            <Chip label="Flip ↕" on={!!d.flipV} onPress={() => !locked && patch({ flipV: !d.flipV || undefined })} />
          </>
        ) : null}
      </View>

      {image ? (
        <ImageProperties
          d={image}
          surfaceAspect={surfaceAspect}
          onReplace={(next) => commit(items.map((it) => (it.id === next.id ? next : it)))}
        />
      ) : null}

      {image ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Mask</Text>
          <View style={styles.chipRow}>
            {MASKS.map((m) => (
              <Chip
                key={m.id}
                label={m.label}
                on={(d.mask?.shape ?? 'rect') === m.id}
                onPress={() => patch({ mask: m.id === 'rect' ? undefined : { shape: m.id, radius: 0.12 } })}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Order</Text>
        <View style={styles.chipRow}>
          <Chip label="To front" onPress={() => commit(moveDecoration(items, d.id, items.length - 1))} />
          <Chip label="Forward" onPress={() => commit(moveDecoration(items, d.id, index + 1))} />
          <Chip label="Back" onPress={() => commit(moveDecoration(items, d.id, index - 1))} />
          <Chip label="To back" onPress={() => commit(moveDecoration(items, d.id, 0))} />
        </View>
      </View>

      <View style={styles.chipRow}>
        <Chip label={locked ? 'Unlock' : 'Lock'} on={locked} onPress={() => patch({ locked: !locked || undefined })} />
        <Chip
          label="Duplicate"
          onPress={() => {
            const next = duplicateDecoration(items, d.id);
            if (next !== items) {
              onChange(next);
              onSelect(next[next.length - 1].id);
            }
          }}
          testID="prop-duplicate"
        />
        <Pressable
          onPress={() => {
            commit(removeDecoration(items, d.id));
            onSelect(null);
          }}
          accessibilityRole="button"
          testID="prop-delete"
          style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}>
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  lockedNote: { fontSize: FontSize.sm, color: Palette.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { minWidth: 120, flexGrow: 1, flexBasis: 120, gap: 3 },
  fieldLabel: { fontSize: FontSize.sm, color: Palette.muted, fontWeight: Weight.medium, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  input: {
    flex: 1,
    minWidth: 40,
    height: 34,
    paddingHorizontal: 8,
    borderRadius: Radius.control,
    backgroundColor: Palette.panel,
    color: Palette.ink,
    fontSize: FontSize.control,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  unit: { fontSize: FontSize.sm, color: Palette.muted, width: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  section: { gap: 4 },
  sectionLabel: { fontSize: FontSize.sm, color: Palette.muted, fontWeight: Weight.medium, textTransform: 'uppercase', letterSpacing: 0.4 },
  deleteBtn: { marginLeft: 'auto', paddingVertical: 5, paddingHorizontal: 10, borderRadius: Radius.control, backgroundColor: Palette.dangerBg },
  deleteText: { fontSize: FontSize.label, color: Palette.dangerAlt, fontWeight: Weight.semibold },
  pressed: { opacity: 0.6 },
});
