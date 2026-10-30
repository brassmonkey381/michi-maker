/**
 * THE ART VIEW'S TWO PIECES (data/artView.ts), shared by the binder grid and the daily puzzle:
 * a card's art filling a box, and the stock card that sets the art window over the card's text.
 * Neither knows where its picture comes from: the caller hands in `renderImage`, so the grid can
 * draw its tiered, scan-first CardImage and the puzzle its plain one, through the same cut.
 */
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Fonts, Weight } from '@/constants/theme';
import { ART_WINDOW, cutFor, placement, rectAspect, stockCardText, WINDOW_CUT, type FrameClass, type SheetCut } from '@/data/artView';
import type { CatalogCard } from '@/lib/catalog';

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
export function StockCard({ card, radius, small, renderImage, frame }: { card: CatalogCard | undefined; radius: number; small: boolean; renderImage: RenderCardImage; frame?: FrameClass }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const rect = frame ?? ART_WINDOW;
  const cut = cutFor(rect, frame?.kind ?? 'window');
  const text = stockCardText(card, '');
  // The card's own margins: 7% of its width each side, as the mock-up had them.
  const margin = Math.round(box.w * 0.07);
  const windowW = Math.max(0, box.w - margin * 2);
  const windowH = windowW * rectAspect(rect);
  // Type follows the pocket: at a 300px card the name is 27px and a table row is 12.5px.
  const unit = box.w / 300;
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
      style={[styles.fill, styles.stockCard, { borderRadius: radius }]}>
      {box.w > 0 ? (
        <>
          <View style={{ position: 'absolute', left: margin, top: margin, width: windowW, height: windowH }}>
            <ArtWindow renderImage={renderImage} cut={cut} />
          </View>
          {text.dex ? (
            // The dex number, large and a shade above the card's black, in the bottom corner as the
            // mock-up had it. Drawn before the text so the rows sit over it.
            <Text style={[styles.stockDex, { right: margin, bottom: 6 * unit, fontSize: 56 * unit, lineHeight: 56 * unit }]}>{text.dex}</Text>
          ) : null}
          <View style={{ position: 'absolute', left: margin, right: margin, top: margin + windowH + 10 * unit }}>
            <Text numberOfLines={1} style={[styles.stockName, { fontSize: nameSize, lineHeight: nameSize * 1.15 }]}>{text.name}</Text>
            {!small && text.sub ? (
              <Text numberOfLines={1} style={[styles.stockSub, { fontSize: labelSize * 1.15, letterSpacing: 1.6 * unit, marginTop: 4 * unit }]}>{text.sub.toUpperCase()}</Text>
            ) : null}
            {rows.length ? <View style={[styles.stockRule, { marginTop: 10 * unit }]} /> : null}
            {rows.map((r) => (
              <View key={r.label} style={[styles.stockRow, { height: rowH }]}>
                <Text numberOfLines={1} style={[styles.stockLabel, { fontSize: labelSize, letterSpacing: 1.4 * unit }]}>{r.label.toUpperCase()}</Text>
                <Text numberOfLines={1} style={[styles.stockValue, { fontSize: rowSize }]}>{r.value}</Text>
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
  stockSub: { color: '#a39e8e' },
  stockRule: { height: 1, backgroundColor: '#34343c' },
  stockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#1f1f25' },
  stockLabel: { color: '#7d7868' },
  stockValue: { color: '#e4dfd0', marginLeft: 6, flexShrink: 1, textAlign: 'right' },
});
