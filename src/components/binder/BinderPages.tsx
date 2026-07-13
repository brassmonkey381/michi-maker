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
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { CaptionControls } from '@/components/binder/CaptionControls';
import { PageStrip } from '@/components/binder/PageStrip';
import { ThemedText } from '@/components/themed-text';
import { BinderPageMaxWidth, FontSize, Weight } from '@/constants/theme';
import { DEFAULT_CAPTION_FIELDS, type CaptionFieldKey } from '@/data/cardCaption';
import type { DemoBinder, DemoPage } from '@/data/binderTypes';
import { useTheme } from '@/hooks/use-theme';

/** Which slot a rendered grid occupies — lets the caller wire the right handlers/refs per grid. */
export type GridRole = 'single' | 'prev' | 'current' | 'next';

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
  }) => ReactNode;
  /** Enables drag-to-reorder in the filmstrip (edit only). Omit → tap-to-jump only. */
  onReorderPages?: (from: number, to: number) => void;
  /** Optional content shown left of the arrows (e.g. a running-value badge). */
  metaBadge?: ReactNode;
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
  renderGrid,
  onReorderPages,
  metaBadge,
  pageHeader,
  dragCol,
}: BinderPagesProps) {
  const theme = useTheme();
  const [labelsOn, setLabelsOn] = useState(false);
  const [labelFields, setLabelFields] = useState<CaptionFieldKey[]>(DEFAULT_CAPTION_FIELDS);
  const toggleLabelField = (key: CaptionFieldKey) =>
    setLabelFields((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  const captionFields = labelsOn ? labelFields : [];

  const count = binder.pages.length;
  const idx = Math.max(0, Math.min(pageIndex, count - 1));
  const page = binder.pages[idx];

  const spreadGap = 12;
  const showSpread = availableWidth >= 900 && count > 1;
  const pageWidth = Math.min(availableWidth, BinderPageMaxWidth);
  const spreadWidth = showSpread
    ? Math.min(Math.floor((availableWidth - spreadGap * 2) / 3), BinderPageMaxWidth)
    : pageWidth;
  const prevPage = idx > 0 ? binder.pages[idx - 1] : null;
  const nextPage = idx < count - 1 ? binder.pages[idx + 1] : null;

  // Web: flip pages with the mouse wheel while hovering the page area. Consumes the wheel only
  // when there's a page to move to in that direction — at the first/last page it falls through to
  // the normal vertical scroll, so you can still reach the rest of the editor.
  const pageWrapRef = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || count <= 1 || typeof window === 'undefined') return;
    const el = pageWrapRef.current as unknown as HTMLElement | null;
    if (!el) return;
    let cooldown = -Infinity;
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 2) return;
      const next = idx + (delta > 0 ? 1 : -1);
      if (next < 0 || next >= count) return; // at an edge → let the editor scroll
      e.preventDefault();
      if (e.timeStamp - cooldown < 300) return; // one page per gesture, not per event
      cooldown = e.timeStamp;
      onPageChange(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [idx, count, onPageChange]);

  return (
    <>
      {/* One meta row: value badge · Card-labels controls · page navigation. Everything that
          describes "what you're looking at" sits on a single organised line (the labels' field
          chips wrap below the toggle inside the centre slot when switched on). */}
      <View style={styles.metaRow}>
        <View style={styles.metaSide}>{metaBadge}</View>
        <View style={styles.metaCenter}>
          <CaptionControls
            enabled={labelsOn}
            onToggle={() => setLabelsOn((v) => !v)}
            fields={labelFields}
            onToggleField={toggleLabelField}
          />
        </View>
        <View style={[styles.metaSide, styles.pageNav]}>
          <NavArrow label="‹" disabled={idx <= 0} onPress={() => onPageChange(idx - 1)} color={theme.text} />
          <ThemedText type="small" themeColor="textSecondary">
            Page {idx + 1} / {count}
          </ThemedText>
          <NavArrow
            label="›"
            disabled={idx >= count - 1}
            onPress={() => onPageChange(idx + 1)}
            color={theme.text}
          />
        </View>
      </View>

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

      {/* The page — a prev · current · next spread on wide screens, else the single page. */}
      <View ref={pageWrapRef} style={styles.pageWrap}>
        {!page ? (
          <ThemedText type="small" themeColor="textSecondary">
            This binder doesn’t have any pages yet.
          </ThemedText>
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
                ? renderGrid({ page: prevPage, width: spreadWidth, role: 'prev', captionFields })
                : null}
            </SpreadColumn>
            <SpreadColumn
              page={page}
              width={spreadWidth}
              label={`Page ${idx + 1}`}
              editable={editable}
              dragCol={dragCol}
              columnIndex={1}>
              {renderGrid({ page, width: spreadWidth, role: 'current', captionFields })}
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
                ? renderGrid({ page: nextPage, width: spreadWidth, role: 'next', captionFields })
                : null}
            </SpreadColumn>
          </View>
        ) : (
          renderGrid({ page, width: pageWidth, role: 'single', captionFields })
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

function NavArrow({
  label,
  disabled,
  onPress,
  color,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={disabled && styles.navDisabled}>
      <Text style={[styles.navArrow, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 6,
  },
  // Equal-width sides keep the labels toggle truly centred regardless of badge/nav width.
  metaSide: { flex: 1, minWidth: 96 },
  metaCenter: { flexShrink: 1, alignItems: 'center' },
  pageNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 },
  navArrow: { fontSize: FontSize.nav, lineHeight: 28, fontWeight: Weight.semibold },
  navDisabled: { opacity: 0.3 },
  pageDetailsRead: { alignItems: 'center', marginTop: 8 },
  pageWrap: { alignItems: 'center', marginVertical: 18 },
  spreadRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  neighbor: { alignItems: 'center' },
  neighborLabel: { marginBottom: 6 },
  neighborGrid: { opacity: 0.92 },
  pageTitle: { textAlign: 'center' },
  pageDescription: { marginTop: 4, textAlign: 'center' },
});
