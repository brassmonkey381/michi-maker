/**
 * The one binder page-browsing surface, shared by every place a binder is shown — the owner's
 * editor and inspector (`BinderScreen`) and the public shared-link viewer (`app/binder/[id]`).
 *
 * It owns the *browsing mechanics* — the ‹ Page X/N › arrows, the wide-screen prev · current ·
 * next spread, the tappable page filmstrip, and the Card-labels toggle — so all surfaces navigate
 * a binder identically. What differs per mode (edit vs inspect vs read-only) is only what each
 * page's grid *does*, which the caller supplies through `renderGrid(role)`:
 *   - inspect / public → a read-only <BinderGrid>; neighbours become tap-to-flip targets.
 *   - edit            → an editable <BinderGrid> wired for slot editing + cross-page drag, and
 *                       `onReorderPages` enables drag-to-reorder in the filmstrip.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { CaptionControls, CaptionFieldRow } from '@/components/binder/CaptionControls';
import { PageStrip } from '@/components/binder/PageStrip';
import { ThemedText } from '@/components/themed-text';
import { BinderPageMaxWidth } from '@/constants/theme';
import { pillChip } from '@/constants/ui';
import { DEFAULT_CAPTION_FIELDS, type CaptionFieldKey } from '@/data/cardCaption';
import type { DemoBinder, DemoPage, DemoSlot } from '@/data/binderTypes';
import { allocateScanFaces } from '@/data/scanFaces';
import { useOwnedCards } from '@/hooks/use-owned-cards';
import { useScanImages } from '@/hooks/use-scan-images';

/** Which slot a rendered grid occupies — lets the caller wire the right handlers/refs per grid.
 *  'partner' is the facing page of a double-sided spread: fully interactive in edit mode (the
 *  first touch makes it the active page), read-only otherwise. */
export type GridRole = 'single' | 'prev' | 'current' | 'next' | 'partner';

// Session-wide preference: real binders are double-sided, so remember the reader's choice
// across binder opens (module state, like the browse state — deliberately not persisted).
let doubleSidedPref = false;

export interface BinderPagesProps {
  binder: DemoBinder;
  /** Caller-owned current page (clamped here for display). */
  pageIndex: number;
  onPageChange: (index: number) => void;
  /** Usable content width (viewport minus horizontal padding) — drives the spread breakpoint. */
  availableWidth: number;
  /** Edit vs inspect: read-only neighbours flip on tap; editable ones stay drag surfaces. */
  editable: boolean;
  /** Build the <BinderGrid> for one slot of the layout — the single per-mode difference. */
  renderGrid: (args: {
    page: DemoPage;
    width: number;
    role: GridRole;
    captionFields: CaptionFieldKey[];
    ownedIds?: ReadonlySet<string>;
    /** Real-scan lookup while the Scans pill is on (owner-only; see useScanImages). */
    scanUrlOf?: (slot: DemoSlot) => string | undefined;
  }) => ReactNode;
  /**
   * Does the person looking at this own it? Gates the Real-scans pill, and defaults to FALSE so
   * a call site that forgets it shows catalog art rather than the wrong person's photos.
   *
   * The lookup behind the pill (useScanImages) reads the VIEWER's own portfolio under owner-RLS
   * and knows nothing about whose binder is on screen, so on a stranger's public binder it would
   * happily paint the viewer's photos into the owner's pockets. Nothing leaks today only because
   * the public viewer's renderGrid drops the prop; that is a call site remembering, not a
   * guarantee. This makes it one.
   */
  viewerIsOwner?: boolean;
  /** Enables drag-to-reorder in the filmstrip (edit only). Omit → tap-to-jump only. */
  onReorderPages?: (from: number, to: number) => void;
  /** Optional override for the per-page title/description area (edit passes text inputs here);
   *  omit to show the page's title/description read-only. */
  pageHeader?: ReactNode;
  /** Shared "which spread column is mid-drag" value, so that column lifts above its neighbours
   *  (edit only). Omit on read-only surfaces. */
  dragCol?: SharedValue<number>;
}

export function BinderPages({
  binder,
  pageIndex,
  onPageChange,
  availableWidth,
  editable,
  viewerIsOwner = false,
  renderGrid,
  onReorderPages,
  pageHeader,
  dragCol,
}: BinderPagesProps) {
  const [labelsOn, setLabelsOn] = useState(false);
  const [labelFields, setLabelFields] = useState<CaptionFieldKey[]>(DEFAULT_CAPTION_FIELDS);
  const toggleLabelField = (key: CaptionFieldKey) =>
    setLabelFields((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  const captionFields = labelsOn ? labelFields : [];
  // The viewer's owned cards → an optional green ✓ on card slots they own. Undefined for guests /
  // empty inventory (the "Owned" pill then stays hidden). Off by default; the pill flips it.
  const ownedCards = useOwnedCards();
  const [showOwned, setShowOwned] = useState(false);
  const ownedIds = showOwned ? ownedCards : undefined;
  // Real scans: card pockets show the owner's own photo of each card instead of catalog art.
  // Session-only like the other pills; the map is undefined for guests, for accounts with no
  // scanned lots, and for anyone who does not own this binder (see viewerIsOwner), which hides
  // the pill entirely rather than offering a toggle that would show the wrong person's photos.
  const ownScans = useScanImages();
  const scanImages = viewerIsOwner ? ownScans : undefined;
  const [showScans, setShowScans] = useState(false);
  // ALLOCATED, not looked up: a stamped pocket wears its own copy's photo, an unclaimed pocket
  // draws from the card's photos no other pocket is wearing, and when those run out it shows
  // catalog art. Binder-wide (all pages at once) so two pages cannot both spend the same photo,
  // and so the binder never presents more scans of a card than the user owns — the old
  // newest-per-card fallback put the same photo on every claimless copy, in unlimited number.
  // See scanFaces.ts for the full doctrine.
  const scanFaces = useMemo(() => {
    if (!showScans || !scanImages) return undefined;
    return allocateScanFaces(binder.pages.flatMap((p) => p.slots), scanImages.copiesByCard);
  }, [showScans, scanImages, binder]);
  const scanUrlOf = scanFaces ? (slot: DemoSlot) => scanFaces.get(slot.id) : undefined;
  // Double-sided: pages pair like a physical binder — page 1 alone (the cover face), then
  // 2·3 facing, 4·5, … Both sides of the open spread are shown (and edited) together.
  const [doubleSided, setDoubleSided] = useState(doubleSidedPref);
  const toggleDoubleSided = () =>
    setDoubleSided((v) => {
      doubleSidedPref = !v;
      return !v;
    });

  const count = binder.pages.length;
  const idx = Math.max(0, Math.min(pageIndex, count - 1));
  const page = binder.pages[idx];

  const spreadGap = 12;
  const showSpread = !doubleSided && availableWidth >= 900 && count > 1;
  const pageWidth = Math.min(availableWidth, BinderPageMaxWidth);
  const spreadWidth = showSpread
    ? Math.min(Math.floor((availableWidth - spreadGap * 2) / 3), BinderPageMaxWidth)
    : pageWidth;
  const prevPage = idx > 0 ? binder.pages[idx - 1] : null;
  const nextPage = idx < count - 1 ? binder.pages[idx + 1] : null;

  // The open double-sided spread around the active page: [cover] alone, then [odd, odd+1].
  const bookGap = 16;
  const bookW = Math.min(Math.floor((availableWidth - bookGap) / 2), BinderPageMaxWidth);
  const spreadLeftIdx = idx === 0 ? -1 : idx % 2 === 1 ? idx : idx - 1;
  const spreadRightIdx = idx === 0 ? 0 : spreadLeftIdx + 1 < count ? spreadLeftIdx + 1 : -1;
  const leftPage = spreadLeftIdx >= 0 ? binder.pages[spreadLeftIdx] : null;
  const rightPage = spreadRightIdx >= 0 ? binder.pages[spreadRightIdx] : null;

  // Web: flip pages with the mouse wheel while hovering the page area. Consumes the wheel only
  // when there's a page to move to in that direction — at the first/last page it falls through to
  // the normal vertical scroll, so you can still reach the rest of the editor.
  const pageWrapRef = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || count <= 1 || typeof window === 'undefined') return;
    const el = pageWrapRef.current as unknown as HTMLElement | null;
    if (!el) return;
    let cooldown = -Infinity;
    // Double-sided flips by SPREAD: cover → [1·2] → [3·4] → …; single mode flips by page.
    const leftOfSpread = idx === 0 ? 0 : idx % 2 === 1 ? idx : idx - 1;
    const forward = doubleSided ? (idx === 0 ? 1 : leftOfSpread + 2) : idx + 1;
    const backward = doubleSided ? (leftOfSpread === 0 ? -1 : Math.max(0, leftOfSpread - 2)) : idx - 1;
    const onWheel = (e: WheelEvent) => {
      // Flip ONLY when the pointer is directly over a page rectangle (data-binder-page, set on the
      // BinderGrid root). A wheel over the surrounding mat, the gaps between spread columns, or the
      // empty bands beside the centred pages falls straight through to normal editor scrolling.
      let node = e.target as HTMLElement | null;
      let overPage = false;
      while (node && node !== el) {
        if (node.dataset?.binderPage) {
          overPage = true;
          break;
        }
        node = node.parentElement;
      }
      if (!overPage) return;
      const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 2) return;
      const next = delta > 0 ? forward : backward;
      if (next < 0 || next >= count) return; // at an edge → let the editor scroll
      e.preventDefault();
      if (e.timeStamp - cooldown < 300) return; // one page per gesture, not per event
      cooldown = e.timeStamp;
      onPageChange(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [idx, count, doubleSided, onPageChange]);

  return (
    <>
      {/* Per-page title/description — caller override (edit inputs) or read-only. */}
      {pageHeader ??
        (page && (page.title || page.description) ? (
          <View style={styles.pageDetailsRead}>
            {page.title ? (
              <ThemedText type="smallBold" style={styles.pageTitle}>
                {page.title}
              </ThemedText>
            ) : null}
            {page.description ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.pageDescription}>
                {page.description}
              </ThemedText>
            ) : null}
          </View>
        ) : null)}

      {/* View controls: double-sided (book spreads) + card labels. Page flipping is the
          filmstrip / mouse wheel / neighbour taps / arrow keys — no ‹ m/n › readout. */}
      <View style={styles.labelsRow}>
        <View style={styles.viewToggles}>
          <Pressable
            onPress={toggleDoubleSided}
            style={[pillChip.base, doubleSided && pillChip.active]}>
            <Text style={[pillChip.text, doubleSided && pillChip.textActive]}>
              {doubleSided ? '✓ Double-sided' : 'Double-sided'}
            </Text>
          </Pressable>
          <CaptionControls
            enabled={labelsOn}
            onToggle={() => setLabelsOn((v) => !v)}
            fields={labelFields}
            onToggleField={toggleLabelField}
          />
          {/* Owned overlay, only offered when the viewer has an inventory (own cards). A green ✓
              corner badge lights up on card slots they own. */}
          {ownedCards ? (
            <Pressable
              onPress={() => setShowOwned((v) => !v)}
              style={[pillChip.base, showOwned && pillChip.active]}>
              <Text style={[pillChip.text, showOwned && pillChip.textActive]}>
                {showOwned ? '✓ Owned' : 'Owned'}
              </Text>
            </Pressable>
          ) : null}
          {/* Real scans: pockets show the owner's own photos (cards they scanned into their
              collection). Only offered when they have any. */}
          {scanImages ? (
            <Pressable
              onPress={() => setShowScans((v) => !v)}
              style={[pillChip.base, showScans && pillChip.active]}>
              <Text style={[pillChip.text, showScans && pillChip.textActive]}>
                {showScans ? '✓ Scans' : 'Scans'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {/* The field chips get their own line. Inline they widened the Card labels pill and pushed
            Double-sided, Owned and Scans sideways every time labels were switched on. */}
        <CaptionFieldRow
          enabled={labelsOn}
          fields={labelFields}
          onToggleField={toggleLabelField}
        />
      </View>

      {/* The page — a prev · current · next spread on wide screens, else the single page. */}
      <View ref={pageWrapRef} style={styles.pageWrap}>
        {!page ? (
          <ThemedText type="small" themeColor="textSecondary">
            This binder doesn’t have any pages yet.
          </ThemedText>
        ) : doubleSided ? (
          // The open book: left/right facing pages (the cover face sits alone on the right).
          // The non-active side is a full 'partner' surface; its label focuses it.
          <View style={[styles.spreadRow, { gap: bookGap }]}>
            <SpreadColumn
              page={leftPage}
              width={bookW}
              label={leftPage ? `Page ${spreadLeftIdx + 1}` : ''}
              onFocus={
                leftPage && spreadLeftIdx !== idx ? () => onPageChange(spreadLeftIdx) : undefined
              }
              editable={editable}
              dragCol={dragCol}
              columnIndex={0}>
              {leftPage
                ? renderGrid({
                    page: leftPage,
                    width: bookW,
                    role: spreadLeftIdx === idx ? 'current' : 'partner',
                    captionFields,
                    ownedIds,
                    scanUrlOf,
                  })
                : null}
            </SpreadColumn>
            <SpreadColumn
              page={rightPage}
              width={bookW}
              label={rightPage ? `Page ${spreadRightIdx + 1}` : ''}
              onFocus={
                rightPage && spreadRightIdx !== idx ? () => onPageChange(spreadRightIdx) : undefined
              }
              editable={editable}
              dragCol={dragCol}
              columnIndex={2}>
              {rightPage
                ? renderGrid({
                    page: rightPage,
                    width: bookW,
                    role: spreadRightIdx === idx ? 'current' : 'partner',
                    captionFields,
                    ownedIds,
                    scanUrlOf,
                  })
                : null}
            </SpreadColumn>
          </View>
        ) : showSpread ? (
          <View style={[styles.spreadRow, { gap: spreadGap }]}>
            <SpreadColumn
              page={prevPage}
              width={spreadWidth}
              label={prevPage ? `‹ Page ${idx}` : ''}
              onFocus={() => onPageChange(idx - 1)}
              editable={editable}
              dragCol={dragCol}
              columnIndex={0}>
              {prevPage
                ? renderGrid({ page: prevPage, width: spreadWidth, role: 'prev', captionFields, ownedIds, scanUrlOf })
                : null}
            </SpreadColumn>
            <SpreadColumn
              page={page}
              width={spreadWidth}
              label={`Page ${idx + 1}`}
              editable={editable}
              dragCol={dragCol}
              columnIndex={1}>
              {renderGrid({ page, width: spreadWidth, role: 'current', captionFields, ownedIds, scanUrlOf })}
            </SpreadColumn>
            <SpreadColumn
              page={nextPage}
              width={spreadWidth}
              label={nextPage ? `Page ${idx + 2} ›` : ''}
              onFocus={() => onPageChange(idx + 1)}
              editable={editable}
              dragCol={dragCol}
              columnIndex={2}>
              {nextPage
                ? renderGrid({ page: nextPage, width: spreadWidth, role: 'next', captionFields, ownedIds, scanUrlOf })
                : null}
            </SpreadColumn>
          </View>
        ) : (
          renderGrid({ page, width: pageWidth, role: 'single', captionFields, ownedIds, scanUrlOf })
        )}
      </View>

      {/* Page filmstrip — tap a thumbnail to flip to it; long-press-drag reorders (edit only). */}
      {count > 1 ? (
        <PageStrip
          pages={binder.pages}
          currentIndex={idx}
          onSelect={onPageChange}
          onReorder={onReorderPages}
        />
      ) : null}
    </>
  );
}

/**
 * One column of the spread: a page label above a grid. The current column is static; a neighbour
 * flips to its page — via its label always, and (read-only only) by tapping the whole page. When
 * editable the grid stays a bare drag surface. `dragCol` lifts the mid-drag column above the rest.
 */
function SpreadColumn({
  page,
  width,
  label,
  onFocus,
  editable,
  dragCol,
  columnIndex,
  children,
}: {
  page: DemoPage | null;
  width: number;
  label: string;
  onFocus?: () => void;
  editable: boolean;
  dragCol?: SharedValue<number>;
  columnIndex: number;
  children: ReactNode;
}) {
  const fallback = useSharedValue(-1);
  const col = dragCol ?? fallback;
  const columnStyle = useAnimatedStyle(() => ({ zIndex: col.value === columnIndex ? 30 : 1 }));
  if (!page) return <View style={{ width }} />;
  const labelEl = (
    <ThemedText type="small" themeColor="textSecondary" style={styles.neighborLabel} numberOfLines={1}>
      {label}
    </ThemedText>
  );
  return (
    <Animated.View style={[styles.neighbor, columnStyle]}>
      {onFocus ? (
        <Pressable onPress={onFocus} hitSlop={6} accessibilityLabel={label}>
          {labelEl}
        </Pressable>
      ) : (
        labelEl
      )}
      {onFocus && !editable ? (
        <Pressable style={styles.neighborGrid} onPress={onFocus} accessibilityLabel={label}>
          {children}
        </Pressable>
      ) : (
        <View style={styles.neighborGrid}>{children}</View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  labelsRow: { alignItems: 'center', marginTop: 10 },
  viewToggles: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  pageDetailsRead: { alignItems: 'center', marginTop: 8 },
  pageWrap: { alignItems: 'center', marginVertical: 18 },
  spreadRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  neighbor: { alignItems: 'center' },
  neighborLabel: { marginBottom: 6 },
  neighborGrid: { opacity: 0.92 },
  pageTitle: { textAlign: 'center' },
  pageDescription: { marginTop: 4, textAlign: 'center' },
});
