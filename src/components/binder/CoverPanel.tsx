/**
 * THE COVER PANEL — the Art dock's Cover tab while a surface is being decorated.
 *
 * Three bands, top to bottom, the way an image editor's right-hand side reads:
 *
 *   HEAD      which surface (FC · Front cover), the other three one tap away, and the one
 *             binder-level switch that belongs here — whether the shelf shows this cover.
 *   TOOLBAR   add (text, art), snap and grid, undo and redo, and how many of the twelve are used.
 *   PROPERTIES the selected decoration's numbers, or a hint when nothing is selected.
 *
 * The Layers tray is NOT in here: it is rendered by the dock under its own header so it stays on
 * screen on the Artwork and Inserts tabs too — fetching a piece should not lose sight of the stack.
 *
 * Every write goes through the same list operations the canvas and the tray use, via
 * ctx.onChange → BinderPages.writeCover → one store update, one undo entry.
 */
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ArtUploadButton } from '@/components/binder/ArtUploadButton';
import { CoverArtSection } from '@/components/binder/CoverArtSection';
import { StickerLibrary } from '@/components/binder/StickerLibrary';
import type { CoverToolsContext } from '@/components/binder/BinderPages';
import { COVER_ABBR, withSurface } from '@/components/binder/CoverEditor';
import { DecorationProperties } from '@/components/binder/DecorationProperties';
import { IconBtn } from '@/components/binder/StudioControls';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { flatChip, pillChip } from '@/constants/ui';
import { COVER_SURFACES, COVER_SURFACE_LABELS, type CoverSurfaceId } from '@/data/binderModels';
import type { CoverDecoration, CoverImageDecoration } from '@/data/binderTypes';
import { MAX_DECORATIONS_PER_SURFACE, NEW_DECORATION_W, addDecoration, defaultText } from '@/data/coverDecorations';
import { uuidv4 } from '@/data/binderTypes';
import type { ViewPrefsState } from '@/hooks/use-view-prefs';

export function CoverPanel({
  ctx,
  view,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onToast,
  surfaceAspect,
}: {
  ctx: CoverToolsContext;
  view: ViewPrefsState;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToast: (message: string) => void;
  /** Surface width ÷ height, for the properties panel's Y and H units. */
  surfaceAspect: number;
}) {
  const items: CoverDecoration[] = ctx.cover.surfaces?.[ctx.surface] ?? [];
  const selected = items.find((d) => d.id === ctx.selected) ?? null;
  const full = items.length >= MAX_DECORATIONS_PER_SURFACE;

  const write = (next: CoverDecoration[]) => {
    if (next !== items) ctx.onChange(withSurface(ctx.cover, ctx.surface, next));
  };
  /** Every add path lands here: the cap says no as one toast, not as a silent nothing. */
  const add = (d: CoverDecoration) => {
    const next = addDecoration(items, d);
    if (next === items) {
      onToast(`This surface already holds ${MAX_DECORATIONS_PER_SURFACE} — remove one first.`);
      return;
    }
    write(next);
    ctx.onSelect(d.id);
  };
  const addArt = (url: string) => {
    const d: CoverImageDecoration = {
      id: uuidv4(),
      kind: 'art',
      imageUrl: url,
      x: 0.5,
      y: 0.5,
      w: NEW_DECORATION_W,
      attribution: { sourceName: 'Your upload', origin: 'upload' },
    };
    add(d);
  };

  return (
    <View style={styles.panel} testID="cover-panel">
      {/* HEAD */}
      <View style={styles.head}>
        <View style={styles.headText}>
          <ThemedText type="subtitle">{COVER_ABBR[ctx.surface]} · {COVER_SURFACE_LABELS[ctx.surface]}</ThemedText>
          <Text style={styles.hint}>
            {selected ? 'Drag it to move, drag a corner to resize.' : items.length ? 'Tap something on the cover, or a layer, to edit it.' : 'Nothing here yet — add text or art below.'}
          </Text>
        </View>
        <View style={styles.surfaceChips}>
          {COVER_SURFACES.map((id: CoverSurfaceId) => (
            <Pressable
              key={id}
              onPress={() => ctx.onFocusSurface(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: id === ctx.surface }}
              accessibilityLabel={COVER_SURFACE_LABELS[id]}
              testID={`cover-surface-${id}`}
              style={[flatChip.base, id === ctx.surface && flatChip.active]}>
              <Text style={[flatChip.text, id === ctx.surface && flatChip.textActive]}>{COVER_ABBR[id]}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.shelfRow}>
          <Text style={styles.shelfLabel}>Show this cover on the shelf</Text>
          <Switch
            value={!!ctx.cover.showCover}
            onValueChange={(on) => ctx.onChange({ ...ctx.cover, showCover: on || undefined })}
            accessibilityLabel="Show this cover on the shelf"
          />
        </View>
      </View>

      {/* TOOLBAR */}
      <View style={styles.toolbar}>
        <Pressable
          onPress={() => add(defaultText())}
          disabled={full}
          accessibilityRole="button"
          testID="cover-add-text"
          style={({ pressed }) => [pillChip.base, styles.addBtn, pressed && styles.pressed, full && styles.disabled]}>
          <Text style={pillChip.text}>＋ Text</Text>
        </Pressable>
        <View style={full ? styles.disabled : undefined} pointerEvents={full ? 'none' : 'auto'}>
          <ArtUploadButton onUploaded={addArt} onError={onToast} />
        </View>
        <Text style={[styles.count, full && styles.countFull]}>
          {items.length} / {MAX_DECORATIONS_PER_SURFACE}
        </Text>
      </View>
      <View style={styles.toolbar}>
        <Pressable
          onPress={() => view.setPref('coverSnap', !view.coverSnap)}
          accessibilityRole="switch"
          accessibilityState={{ checked: view.coverSnap }}
          style={[flatChip.base, view.coverSnap && flatChip.active]}>
          <Text style={[flatChip.text, view.coverSnap && flatChip.textActive]}>{view.coverSnap ? '✓ Snap' : 'Snap'}</Text>
        </Pressable>
        <Pressable
          onPress={() => view.setPref('coverGrid', !view.coverGrid)}
          accessibilityRole="switch"
          accessibilityState={{ checked: view.coverGrid }}
          style={[flatChip.base, view.coverGrid && flatChip.active]}>
          <Text style={[flatChip.text, view.coverGrid && flatChip.textActive]}>{view.coverGrid ? '✓ Grid' : 'Grid'}</Text>
        </Pressable>
        <View style={styles.spacer} />
        <IconBtn label="↶" onPress={onUndo} disabled={!canUndo} accessibilityLabel="Undo" testID="cover-undo" />
        <IconBtn label="↷" onPress={onRedo} disabled={!canRedo} accessibilityLabel="Redo" testID="cover-redo" />
      </View>

      {/* WHERE PICTURES COME FROM. Below the properties when something is selected, above the
          empty hint otherwise — the thing you are most likely to want next is nearest the top. */}
      {!selected ? (
        <>
          <CoverArtSection onAdd={add} onToast={onToast} disabled={full} />
          <StickerLibrary onPick={add} disabled={full} />
        </>
      ) : null}

      {/* PROPERTIES */}
      {selected ? (
        <DecorationProperties
          d={selected}
          items={items}
          onChange={write}
          onSelect={ctx.onSelect}
          onLivePatch={ctx.onLivePatch}
          surfaceAspect={surfaceAspect}
          naturalAspect={ctx.naturalAspects[selected.id]}
        />
      ) : (
        <View style={styles.emptyProps}>
          <Text style={styles.hint}>Select a layer to see its position, size, rotation and order.</Text>
        </View>
      )}
      {selected ? (
        <>
          <CoverArtSection onAdd={add} onToast={onToast} disabled={full} />
          <StickerLibrary onPick={add} disabled={full} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: Spacing.three, paddingBottom: Spacing.three },
  head: { gap: 8 },
  headText: { gap: 2 },
  hint: { fontSize: FontSize.sm, color: Palette.muted },
  surfaceChips: { flexDirection: 'row', gap: 6 },
  shelfRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  shelfLabel: { fontSize: FontSize.label, color: Palette.ink2 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  addBtn: { backgroundColor: Palette.accent },
  spacer: { flex: 1 },
  count: { fontSize: FontSize.sm, color: Palette.muted, marginLeft: 'auto', fontVariant: ['tabular-nums'] },
  countFull: { color: Palette.danger, fontWeight: Weight.semibold },
  emptyProps: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: Radius.control, backgroundColor: Palette.panel },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
});
