/**
 * CHOOSING WHICH BINDER YOUR PAGES LIVE IN.
 *
 * Two decisions, in the order anyone actually makes them: which binder, then which colour. The
 * preview beside them is the real renderer at a smaller size, not an illustration of it, so what
 * you pick is exactly what you get, down to the thread.
 *
 * A model carries its own page grid, and switching between a 9-pocket and a 12-pocket binder does
 * NOT re-page anything: the pages a binder already has are the owner's, and silently regridding
 * them would move cards. The mismatch is stated instead, and left to them.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CoverSurface } from '@/components/binder/BinderCover';
import { ThemedText } from '@/components/themed-text';
import { Palette, Spacing } from '@/constants/theme';
import {
  BINDER_MODELS,
  binderColourway,
  binderModel,
  COVER_SURFACES,
  COVER_SURFACE_LABELS,
  type BinderModel,
} from '@/data/binderModels';
import type { BinderCover, DemoBinder } from '@/data/binderTypes';

/** Whether a binder's pages match what this model's sheets actually hold. */
function pageMismatch(binder: DemoBinder, model: BinderModel): string | null {
  const off = binder.pages.filter((p) => p.rows !== model.rows || p.cols !== model.cols).length;
  if (off === 0) return null;
  const all = off === binder.pages.length;
  return `${all ? 'Your pages are' : `${off} of your pages are`} not ${model.cols}x${model.rows}. They are left exactly as they are; nothing is re-paged.`;
}

export function BinderCoverPicker({
  binder,
  onChange,
}: {
  binder: DemoBinder;
  onChange: (cover: BinderCover) => void;
}) {
  const current = binder.cover;
  const model = binderModel(current?.modelId);
  const colour = binderColourway(model, current?.colourway);
  // Which of the four surfaces the preview is showing. The front is what anyone wants to see first.
  const [surface, setSurface] = useState<(typeof COVER_SURFACES)[number]>('front');

  const choose = (next: BinderModel) => {
    // Keep the colourway if the new model sells one by that name, else take its default.
    const keep = next.colourways.some((c) => c.id === current?.colourway);
    onChange({
      modelId: next.id,
      colourway: keep && current ? current.colourway : next.defaultColourway,
      surfaces: current?.surfaces,
      // Changing the binder must not silently switch "show this cover on the shelf" back off.
      showCover: current?.showCover,
    });
  };

  const mismatch = pageMismatch(binder, model);

  return (
    <View style={styles.wrap}>
      <View style={styles.previewCol}>
        <CoverSurface model={model} colourwayId={colour.id} surface={surface} width={200} />
        <View style={styles.surfaceRow}>
          {COVER_SURFACES.map((id) => (
            <Pressable
              key={id}
              onPress={() => setSurface(id)}
              style={[
                styles.chip,
                surface === id && styles.chipOn,
              ]}>
              <ThemedText type="small" style={surface === id ? styles.chipOnText : undefined}>
                {COVER_SURFACE_LABELS[id]}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listInner}>
        {BINDER_MODELS.map((m) => {
          const on = m.id === model.id;
          return (
            <Pressable
              key={m.id}
              onPress={() => choose(m)}
              style={[styles.model, on && styles.modelOn]}>
              <ThemedText type="smallBold">{m.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {m.brand} · {m.cols}x{m.rows} pockets · {m.sheets} sheets · up to {m.capacity} cards
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.blurb}>
                {m.blurb}
              </ThemedText>
              {on ? (
                <View style={styles.swatchRow}>
                  {m.colourways.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => onChange({ modelId: m.id, colourway: c.id, surfaces: current?.surfaces, showCover: current?.showCover })}
                      accessibilityLabel={c.name}
                      style={[
                        styles.swatch,
                        { backgroundColor: c.shell, borderColor: c.id === colour.id ? Palette.accent : c.stitch },
                        c.id === colour.id && styles.swatchOn,
                      ]}
                    />
                  ))}
                </View>
              ) : null}
              {on ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {colour.name}
                </ThemedText>
              ) : null}
            </Pressable>
          );
        })}
        {mismatch ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            {mismatch}
          </ThemedText>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  previewCol: { alignItems: 'center', gap: Spacing.two },
  surfaceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 210 },
  chip: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  chipOnText: { color: Palette.accentText },
  list: { flex: 1, maxHeight: 420 },
  listInner: { gap: Spacing.two, paddingBottom: Spacing.two },
  model: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: 12,
    padding: Spacing.two,
    gap: 4,
  },
  modelOn: { borderColor: Palette.accent, backgroundColor: Palette.accentSoft },
  blurb: { marginTop: 2 },
  swatchRow: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
  swatchOn: { borderWidth: 3 },
  note: { marginTop: Spacing.one },
});
