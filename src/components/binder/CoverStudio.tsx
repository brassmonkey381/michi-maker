/**
 * DRESSING THE BINDER — the four surfaces, and what goes on them.
 *
 * One surface at a time, drawn big, with the spine on its binding edge so you can see which way
 * round you are looking. Tabs move between them in the order you meet them opening a real binder:
 * front, inside front, inside back, back.
 *
 * PLACEMENT IS BY FRACTION, NOT BY PIXEL. A sticker knows it is at 0.4 across and a third of the
 * width wide, so the same cover is the same cover in this editor, in a thumbnail, and anywhere it
 * is drawn later. That is also why the editor can be any size it likes.
 *
 * SELECT, THEN ACT, rather than handles on the corners. Handles are fiddly at a sticker's real
 * size and worse on a touch screen, and they need hit areas that fight with the drag. Tapping
 * selects, dragging moves, and the selected sticker gets a toolbar with the four things anyone
 * actually wants: bigger, smaller, turn, remove.
 */
import { useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { runOnJS } from 'react-native-reanimated';

import { ArtUploadButton } from '@/components/binder/ArtUploadButton';
import { CoverSurface } from '@/components/binder/BinderCover';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import {
  binderColourway,
  binderModel,
  COVER_SURFACES,
  COVER_SURFACE_LABELS,
  coverAspect,
  surfaceSide,
  type CoverSurfaceId,
} from '@/data/binderModels';
import { uuidv4, type BinderCover, type CoverSticker, type DemoBinder } from '@/data/binderTypes';

/** How wide a new sticker lands, as a fraction of the cover. Big enough to grab, small enough to move. */
const NEW_STICKER_W = 0.34;
const MIN_W = 0.06;
const MAX_W = 1.6;
const STUDIO_W = 380;

function stickersOf(cover: BinderCover | undefined, surface: CoverSurfaceId): CoverSticker[] {
  return cover?.surfaces?.[surface] ?? [];
}

export function CoverStudio({
  binder,
  onChange,
}: {
  binder: DemoBinder;
  onChange: (cover: BinderCover) => void;
}) {
  const cover = binder.cover;
  const model = binderModel(cover?.modelId);
  const colour = binderColourway(model, cover?.colourway);
  const [surface, setSurface] = useState<CoverSurfaceId>('front');
  const [selected, setSelected] = useState<string | null>(null);
  /** The sticker being dragged and where it has got to, so a drag repaints without committing. */
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const width = STUDIO_W;
  const height = width / coverAspect(model);
  const stickers = stickersOf(cover, surface);
  const onLeft = surfaceSide(surface) === 'left';
  const spineStyle = { height, backgroundColor: colour.shell };

  /** Write one surface back, leaving the other three exactly as they were. */
  const writeSurface = (next: CoverSticker[]) => {
    onChange({
      modelId: model.id,
      colourway: colour.id,
      surfaces: { ...(cover?.surfaces ?? {}), [surface]: next },
    });
  };

  const addArt = (url: string) => {
    const sticker: CoverSticker = {
      id: uuidv4(),
      imageUrl: url,
      x: 0.5,
      y: 0.5,
      w: NEW_STICKER_W,
    };
    writeSurface([...stickers, sticker]);
    setSelected(sticker.id);
    setError(null);
  };

  const patch = (id: string, change: Partial<CoverSticker>) =>
    writeSurface(stickers.map((s) => (s.id === id ? { ...s, ...change } : s)));

  const remove = (id: string) => {
    writeSurface(stickers.filter((s) => s.id !== id));
    setSelected(null);
  };

  const chosen = stickers.find((s) => s.id === selected) ?? null;

  return (
    <View style={styles.wrap}>
      <View style={styles.stage}>
        {/* THE SPINE SITS ON THE BINDING EDGE, so it is obvious which surface you are looking at:
            a surface that sits on the left of an open binder is bound on its right, and the other
            way round for one that sits on the right. */}
        {onLeft ? null : <View style={[styles.spineHint, spineStyle]} />}
        <CoverSurface model={model} colourwayId={colour.id} surface={surface} width={width}>
          {/* The interactive layer, drawn over the finished material. */}
          {stickers.map((sticker) => {
            const live = drag && drag.id === sticker.id ? drag : sticker;
            const w = sticker.w * width;
            const on = sticker.id === selected;
            const pan = Gesture.Pan()
              .onStart(() => runOnJS(setSelected)(sticker.id))
              .onUpdate((e) => {
                // Clamped to the cover: a sticker dragged off the edge is lost, and undoing that
                // by hand is worse than simply not letting it happen.
                const nx = Math.min(1, Math.max(0, sticker.x + e.translationX / width));
                const ny = Math.min(1, Math.max(0, sticker.y + e.translationY / height));
                runOnJS(setDrag)({ id: sticker.id, x: nx, y: ny });
              })
              .onEnd((e) => {
                const nx = Math.min(1, Math.max(0, sticker.x + e.translationX / width));
                const ny = Math.min(1, Math.max(0, sticker.y + e.translationY / height));
                runOnJS(patch)(sticker.id, { x: nx, y: ny });
                runOnJS(setDrag)(null);
              });
            return (
              <GestureDetector key={sticker.id} gesture={pan}>
                <View
                  style={{
                    position: 'absolute',
                    left: live.x * width - w / 2,
                    top: live.y * height - w / 2,
                    width: w,
                    height: w,
                    transform: sticker.rot ? [{ rotate: `${sticker.rot}deg` }] : undefined,
                    borderWidth: on ? 2 : 0,
                    borderColor: Palette.accent,
                    borderRadius: 4,
                  }}
                />
              </GestureDetector>
            );
          })}
        </CoverSurface>
        {onLeft ? <View style={[styles.spineHint, spineStyle]} /> : null}
      </View>

      <View style={styles.side}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {COVER_SURFACES.map((id) => {
            const n = stickersOf(cover, id).length;
            const on = id === surface;
            return (
              <Pressable
                key={id}
                onPress={() => {
                  setSurface(id);
                  setSelected(null);
                }}
                style={[styles.tab, on && styles.tabOn]}>
                <ThemedText type="small" style={on ? styles.tabOnText : undefined}>
                  {COVER_SURFACE_LABELS[id]}
                  {n ? ` (${n})` : ''}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        <ArtUploadButton onUploaded={addArt} onError={setError} />
        {error ? (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        ) : null}

        {chosen ? (
          <View style={styles.tools}>
            <ThemedText type="small" themeColor="textSecondary">
              Drag it to move it.
            </ThemedText>
            <View style={styles.toolRow}>
              <Tool label="Bigger" onPress={() => patch(chosen.id, { w: Math.min(MAX_W, chosen.w * 1.15) })} />
              <Tool label="Smaller" onPress={() => patch(chosen.id, { w: Math.max(MIN_W, chosen.w / 1.15) })} />
            </View>
            <View style={styles.toolRow}>
              <Tool label="Turn left" onPress={() => patch(chosen.id, { rot: ((chosen.rot ?? 0) - 15) % 360 })} />
              <Tool label="Turn right" onPress={() => patch(chosen.id, { rot: ((chosen.rot ?? 0) + 15) % 360 })} />
            </View>
            <View style={styles.toolRow}>
              <Tool label="Straighten" onPress={() => patch(chosen.id, { rot: 0 })} />
              <Tool label="Remove" tone="danger" onPress={() => remove(chosen.id)} />
            </View>
          </View>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {stickers.length
              ? 'Tap something on the cover to move or resize it.'
              : 'Nothing on this surface yet. Add art to start.'}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

function Tool({ label, onPress, tone }: { label: string; onPress: () => void; tone?: 'danger' }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tool, pressed && styles.toolPressed]}>
      <ThemedText type="small" style={tone === 'danger' ? styles.dangerText : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  stage: { flexDirection: 'row', alignItems: 'center' },
  side: { flex: 1, gap: Spacing.two, minWidth: 200 },
  // A sliver of the spine, to place the surface you are looking at.
  spineHint: { width: 10, borderRadius: 2, opacity: 0.85 },
  tabs: { gap: 6, paddingRight: Spacing.two },
  tab: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tabOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  tabOnText: { color: Palette.accentText },
  tools: { gap: 6, marginTop: Spacing.one },
  toolRow: { flexDirection: 'row', gap: 6 },
  tool: {
    flex: 1,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.control,
    paddingVertical: 6,
    alignItems: 'center',
  },
  toolPressed: { opacity: 0.6 },
  dangerText: { color: Palette.danger, fontSize: FontSize.sm, fontWeight: Weight.semibold },
});
