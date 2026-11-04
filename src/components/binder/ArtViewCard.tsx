/**
 * THE ART VIEW'S TWO PIECES (data/artView.ts), shared by the binder grid and the daily puzzle:
 * a card's art filling a box, and the stock card that sets the art window over the card's text.
 * Neither knows where its picture comes from: the caller hands in `renderImage`, so the grid can
 * draw its tiered, scan-first CardImage and the puzzle its plain one, through the same cut.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';

import { Fonts, Weight } from '@/constants/theme';
import { ART_WINDOW, cutFor, placement, rectAspect, stockCardText, WINDOW_CUT, type FrameClass, type SheetCut } from '@/data/artView';
import { luminanceUnder, matFieldOfRow, matName, matPalette, matShows, withAlphaHex, type MatAlign, type MatStyle } from '@/data/matStyle';
import type { CatalogCard } from '@/lib/catalog';
import { usePictureLuminance } from '@/lib/pictureLuminance';

const ALIGN_ITEMS: Record<MatAlign, 'flex-start' | 'center' | 'flex-end'> = { left: 'flex-start', center: 'center', right: 'flex-end' };

/** Draws the whole card picture, cover-fit, filling whatever box it is given. */
export type RenderCardImage = () => ReactNode;

/**
 * A card's ART WINDOW filling its box: the whole scan is drawn larger than the box and offset so
 * the window lands exactly on it, and the box clips the rest (windowPlacement). The scan keeps
 * its own proportions, so nothing is rescaled in one direction only. Measured from the box, so
 * it follows the pocket. `cut` says which rectangle of the card lands on the box (artView.ts
 * SheetCut): the page's cut on a connected sheet, the card's own frame on a stock card.
 */
export function ArtWindow({ renderImage, radius = 0, cut = WINDOW_CUT }: { renderImage: RenderCardImage; radius?: number; cut?: SheetCut }) {
  const [boxW, setBoxW] = useState(0);
  const place = boxW > 0 ? placement(boxW, cut.rect) : null;
  return (
    <View onLayout={(e) => setBoxW(e.nativeEvent.layout.width)} style={[styles.fill, { overflow: 'hidden', borderRadius: radius, backgroundColor: '#000' }]}>
      {place ? (
        <View style={{ position: 'absolute', left: place.left, top: place.top, width: place.width, height: place.height }}>{renderImage()}</View>
      ) : null}
    </View>
  );
}

/**
 * THE STOCK CARD (owner, 2026-10-24): the art window at the full width of a plain black card, no
 * rescaling, and under it the name, a type and stage line, and the card's references in a ruled
 * table. The window keeps its measured height, so the text block takes what is left; on a small
 * pocket only the name fits, and the rest is left off rather than shrunk to dust. `frame` is the
 * card's own class (artView.ts cardFrame): a V's bleed cut is taller than a window and takes the
 * room from the table, which is the right trade; the art is what the view is for.
 */
export function StockCard({ card, radius, small, renderImage, frame, mat, slice }: { card: CatalogCard | undefined; radius: number; small: boolean; renderImage: RenderCardImage; frame?: FrameClass; mat?: MatStyle; /** This pocket's slice of a page-wide mat picture (matStyle.ts spreadSlice); absent means the whole picture. */ slice?: { left: number; top: number; width: number; height: number } }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const rect = frame ?? ART_WINDOW;
  const cut = cutFor(rect, frame?.kind ?? 'window');
  // The card's own margins: 7% of its width each side, as the mock-up had them.
  const margin = Math.round(box.w * 0.07);
  const windowW = Math.max(0, box.w - margin * 2);
  const windowH = windowW * rectAspect(rect);
  // THE MAT (matStyle.ts): the paper, a picture over it, the ink, the face and which lines show.
  // An ink that follows the picture reads the brightness under this mat's text block: within
  // the whole picture, or within this pocket's slice of a page-wide one.
  const sample = usePictureLuminance(mat?.autoInk ? mat.picture : undefined);
  const luminance =
    sample && box.w > 0
      ? luminanceUnder(
          sample,
          slice ? { width: slice.width, height: slice.height } : { width: box.w, height: box.h },
          { left: (slice ? -slice.left : 0) + margin, top: (slice ? -slice.top : 0) + margin + windowH, width: windowW, height: Math.max(1, box.h - margin - windowH) },
        )
      : undefined;
  const pal = matPalette(mat, luminance);
  const family = Fonts[pal.font];
  const all = stockCardText(card, '');
  const text = {
    ...all,
    name: matName(mat, all.name),
    dex: matShows(mat, 'dex') ? all.dex : '',
    hp: matShows(mat, 'hp') ? all.hp : '',
    rarity: matShows(mat, 'rarity') ? all.rarity : '',
    rows: all.rows.filter((r) => {
      const f = matFieldOfRow(r.label);
      return !f || matShows(mat, f);
    }),
  };
  // Type follows the pocket: at a 300px card the name is 27px and a table row is 12.5px.
  const unit = box.w / 300;
  // THE OUTLINE (matStyle.ts halo): every line haloed in the ground colour. One shadow with no
  // offset is what react-native gives; the wide one is twice the blur and the small lines in
  // full ink (matPalette does the ink).
  const halo: TextStyle | undefined = pal.halo ? { textShadowColor: pal.ground, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: Math.max(1, (pal.halo === 'wide' ? 3 : 1.5) * unit) } : undefined;
  const align = mat?.align ?? {};
  const nameSize = Math.max(8, 27 * unit);
  const rowSize = Math.max(6, 12.5 * unit);
  const labelSize = Math.max(5, 9 * unit);
  const rowH = 24 * unit;
  // What fits under the window: the name always, then the rows while there is room for them.
  const nameBlock = (38 + 18 + 14) * unit;
  const spare = box.h - margin - windowH - nameBlock - 24 * unit;
  const rows = small ? [] : text.rows.slice(0, Math.max(0, Math.floor(spare / rowH)));
  return (
    <View
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[styles.fill, styles.stockCard, { borderRadius: radius, backgroundColor: pal.paper, borderColor: pal.rule }]}>
      {pal.picture ? <Image source={{ uri: pal.picture }} style={slice ? { position: 'absolute', ...slice } : StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={0} /> : null}
      {pal.picture && pal.scrim > 0 && box.w > 0 ? (
        // THE SCRIM (matStyle.ts scrim): the picture tinted toward the ground under the text
        // block only, fading in from the window's foot so the picture stays whole round the window.
        <>
          <LinearGradient pointerEvents="none" colors={[withAlphaHex(pal.ground, 0), withAlphaHex(pal.ground, pal.scrim)]} style={{ position: 'absolute', left: 0, right: 0, top: margin + windowH, height: Math.round(14 * unit) }} />
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: margin + windowH + Math.round(14 * unit), bottom: 0, backgroundColor: withAlphaHex(pal.ground, pal.scrim) }} />
        </>
      ) : null}
      {box.w > 0 ? (
        <>
          <View style={{ position: 'absolute', left: margin, top: margin, width: windowW, height: windowH }}>
            <ArtWindow renderImage={renderImage} cut={cut} />
          </View>
          {text.dex ? (
            // The dex number, large and a shade above the card's black, in the bottom corner as the
            // mock-up had it (or at the edge the alignment names). Drawn before the text so the rows sit over it.
            <Text
              style={[
                styles.stockDex,
                { bottom: 6 * unit, fontSize: 56 * unit, lineHeight: 56 * unit, fontFamily: family, color: pal.watermark },
                align.dex === 'left' ? { left: margin } : align.dex === 'center' ? { left: margin, width: windowW, textAlign: 'center' } : { right: margin },
                halo,
              ]}>
              {text.dex}
            </Text>
          ) : null}
          <View style={{ position: 'absolute', left: margin, right: margin, top: margin + windowH + 10 * unit }}>
            {align.name ? (
              // A packed name section (matStyle.ts MatAlign): the name over an "HP · RARITY" line, at one side.
              <View style={{ alignItems: ALIGN_ITEMS[align.name] }}>
                {text.name ? <Text numberOfLines={1} style={[styles.stockName, { fontSize: nameSize, lineHeight: nameSize * 1.15, fontFamily: family, color: pal.ink }, halo]}>{text.name}</Text> : null}
                {!small && (text.hp || text.rarity) ? (
                  <View style={styles.stockPackedCorner}>
                    {text.hp ? <Text numberOfLines={1} style={[styles.stockHp, { fontSize: rowSize * 1.1, lineHeight: rowSize * 1.3, fontFamily: family, color: pal.ink }, halo]}>{text.hp}</Text> : null}
                    {text.rarity ? <Text numberOfLines={1} style={[{ fontSize: labelSize, lineHeight: rowSize * 1.3, letterSpacing: 1.2 * unit, fontFamily: family, color: pal.sub }, halo]}>{text.rarity.toUpperCase()}</Text> : null}
                  </View>
                ) : null}
              </View>
            ) : text.name || (!small && (text.hp || text.rarity)) ? (
              <View style={styles.stockNameLine}>
                <Text numberOfLines={1} style={[styles.stockName, styles.stockNameText, { fontSize: nameSize, lineHeight: nameSize * 1.15, fontFamily: family, color: pal.ink }, halo]}>{text.name}</Text>
                {!small && (text.hp || text.rarity) ? (
                  // HP over rarity, right side of the name line (owner, 2026-11-03).
                  <View style={styles.stockCorner}>
                    {text.hp ? <Text numberOfLines={1} style={[styles.stockHp, { fontSize: rowSize * 1.1, lineHeight: rowSize * 1.3, fontFamily: family, color: pal.ink }, halo]}>{text.hp}</Text> : null}
                    {text.rarity ? <Text numberOfLines={1} style={[styles.stockRarity, { fontSize: labelSize, lineHeight: labelSize * 1.3, letterSpacing: 1.2 * unit, fontFamily: family, color: pal.sub }, halo]}>{text.rarity.toUpperCase()}</Text> : null}
                  </View>
                ) : null}
              </View>
            ) : null}
            {rows.length ? <View style={[styles.stockRule, { marginTop: 10 * unit, backgroundColor: pal.rule }]} /> : null}
            {rows.map((r) => (
              <View key={r.label} style={[styles.stockRow, { height: rowH, borderBottomColor: pal.rule }, align.rows ? { justifyContent: ALIGN_ITEMS[align.rows] } : null]}>
                <Text numberOfLines={1} style={[styles.stockLabel, { fontSize: labelSize, letterSpacing: 1.4 * unit, fontFamily: family, color: pal.label }, halo]}>{r.label.toUpperCase()}</Text>
                <Text numberOfLines={1} style={[styles.stockValue, { fontSize: rowSize, fontFamily: family, color: pal.value }, align.rows ? styles.stockValuePacked : null, halo]}>{r.value}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  /** The art view's stock card: near-black, a hairline inside its edge, the window and text laid absolutely. */
  stockCard: { backgroundColor: '#111114', borderWidth: 1, borderColor: '#2a2a30', overflow: 'hidden' },
  stockName: { fontFamily: Fonts.serif, fontWeight: Weight.bold, color: '#f2efe6' },
  stockDex: { position: 'absolute', fontFamily: Fonts.serif, color: '#1b1b20' },
  stockNameLine: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  stockNameText: { flexShrink: 1 },
  stockCorner: { alignItems: 'flex-end', marginLeft: 6, flexShrink: 0, maxWidth: '45%' },
  /** HP and rarity on one line under a packed name. */
  stockPackedCorner: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  stockHp: { fontWeight: Weight.bold, textAlign: 'right' },
  stockRarity: { textAlign: 'right' },
  stockRule: { height: 1, backgroundColor: '#34343c' },
  stockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#1f1f25' },
  stockLabel: { color: '#7d7868' },
  stockValue: { color: '#e4dfd0', marginLeft: 6, flexShrink: 1, textAlign: 'right' },
  /** A row packed to one side: the value sits beside its label instead of at the far edge. */
  stockValuePacked: { textAlign: 'left', marginLeft: 8 },
});
