/**
 * MIC-045 M1 ('auth-keep' dev flag): the pieces of the redesigned Create account / Sign in sheet
 * that the classic sheet does not have. The strip naming the guest's binder, the Google mark, and
 * the keyboard lift for the phone's bottom sheet. AuthSheet.tsx composes them; this file holds no
 * sign-in logic.
 */

import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';

import { BinderGrid, pageBoxHeight } from '@/components/binder/BinderGrid';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radii, Spacing, Weight } from '@/constants/theme';
import type { DemoBinder } from '@/data/binderTypes';
import { facePage } from '@/data/previewPages';
import { useBinders } from '@/store/binders';

const PERKS = ['Open and edit it on any device', 'Print fill sheets and share a link', 'Free, no card needed'] as const;

/** The guest's binder the strip names: the one touched last (an example binder has no updatedAt). */
function latestBinder(binders: readonly DemoBinder[]): DemoBinder | null {
  let best: DemoBinder | null = null;
  for (const b of binders) {
    if (!best || (b.updatedAt ?? '') > (best.updatedAt ?? '')) best = b;
  }
  return best;
}

/** A binder's face page drawn small (no caption): the account sheet's strip and the delete dialog. */
export function BinderFaceThumb({ binder, width }: { binder: { pages: Parameters<typeof facePage>[0]; pageStyle?: unknown }; width: number }) {
  const page = facePage(binder.pages);
  const h = page ? pageBoxHeight(width, page.rows, page.cols) : Math.round(width * 1.39);
  return (
    <View style={[styles.thumb, { width, minHeight: h }]} pointerEvents="none">
      {page ? (
        <BinderGrid page={page} width={width} pageStyle={binder.pageStyle as never} />
      ) : (
        <View style={[styles.thumbBlank, { width, height: h }]} />
      )}
    </View>
  );
}

/**
 * "Keep “Snorlax” and its 9 pages": the guest's binder and what an account gives it. Renders
 * nothing when the guest has no binder of their own yet. `compact` (the phone sheet) draws a
 * smaller page and folds the three perks into one line, as the phone mock-up does.
 */
export function KeepBinderStrip({ compact }: { compact: boolean }) {
  const { userBinders } = useBinders();
  const binder = latestBinder(userBinders);
  if (!binder) return null;

  const pages = binder.pageCount ?? binder.pages.length;
  const page = facePage(binder.pages);
  const thumbW = compact ? 44 : 62;
  const thumbH = page ? pageBoxHeight(thumbW, page.rows, page.cols) : Math.round(thumbW * 1.39);
  const title = binder.title?.trim() || 'your binder';

  return (
    <View style={[styles.strip, compact && styles.stripCompact]} testID="auth-keep-strip">
      <View style={[styles.thumb, { width: thumbW, minHeight: thumbH }]} pointerEvents="none">
        {page ? (
          <BinderGrid page={page} width={thumbW} pageStyle={binder.pageStyle} />
        ) : (
          <View style={[styles.thumbBlank, { width: thumbW, height: thumbH }]} />
        )}
      </View>
      <View style={styles.stripText}>
        <ThemedText type="smallBold" numberOfLines={2} style={compact ? styles.stripTitleCompact : styles.stripTitle}>
          Keep “{title}” and its {pages} {pages === 1 ? 'page' : 'pages'}
        </ThemedText>
        {compact ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.perkLine}>
            Edit it anywhere, print and share. Free.
          </ThemedText>
        ) : (
          PERKS.map((p) => (
            <View key={p} style={styles.perkRow}>
              <ThemedText style={styles.tick}>✓</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.perkLine}>
                {p}
              </ThemedText>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

/** Google's four-colour G. An SVG drawn by expo-image, since the app carries no SVG library. */
const GOOGLE_G =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
      '<path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z"/>' +
      '<path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/>' +
      '<path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z"/>' +
      '<path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z"/>' +
      '</svg>',
  );

export function GoogleMark() {
  return <Image source={{ uri: GOOGLE_G }} style={styles.gMark} contentFit="contain" accessible={false} />;
}

/**
 * How far the on-screen keyboard covers the bottom of the window, so the phone sheet can sit on
 * top of it. Web reads the visual viewport (a phone browser shrinks it, not the window, when the
 * keyboard opens); iOS reads the keyboard events. Android resizes the window itself, so 0 there.
 */
export function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (Platform.OS === 'web') {
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      if (!vv) return;
      const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
      update();
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
      return () => {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      };
    }
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', (e) => setInset(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardWillHide', () => setInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [active]);
  return active ? inset : 0;
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Palette.accentSoft,
    borderRadius: 12,
    paddingVertical: Spacing.two + 4,
    paddingHorizontal: Spacing.three + 2,
  },
  stripCompact: { paddingVertical: Spacing.two + 2, paddingHorizontal: Spacing.three, gap: Spacing.two + 4 },
  thumb: {
    borderRadius: Radii.slotSmall + 1,
    overflow: 'hidden',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  thumbBlank: { backgroundColor: Palette.hairline },
  stripText: { flex: 1, minWidth: 0, gap: 2 },
  stripTitle: { fontSize: FontSize.control, lineHeight: 20, marginBottom: 4 },
  stripTitleCompact: { fontSize: FontSize.body, lineHeight: 19 },
  perkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  tick: { color: Palette.accent, fontWeight: Weight.bold, fontSize: FontSize.label, lineHeight: 20 },
  perkLine: { fontSize: FontSize.label, lineHeight: 20, flexShrink: 1 },
  gMark: { width: 18, height: 18 },
});
