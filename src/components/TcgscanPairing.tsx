/**
 * THE SISTER APP, SAID PLAINLY. TCGScan is the phone app that scans cards into a collection, and
 * that collection is what the curator builds binders from — the two products are one loop:
 * scan it there, compose it here, print it, fill the real binder. Until now TCGScan surfaced only
 * in fine print and a synergy note on the import sheet; a visitor could use michi-maker for a
 * month without learning it existed.
 *
 * One block, the same on every surface it appears on (Home, Welcome, My binders), with the loop
 * drawn as three steps and one button. The button goes through openTcgscan, which mints the SSO
 * handoff so a signed-in member lands on tcgscan.ai already signed in.
 *
 * THE THREE STEPS ARE DRAWN WITH THE APP'S OWN PAGES, NOT EMOJI. A camera, a book and a printer
 * glyph read as machine-made, and visitors hold that against a site. Each step now shows a real
 * example page rendered by the same BinderGrid that draws every binder here: one card on a phone
 * screen for Scan, the finished page for Compose, and for Share or Print a printer putting out the
 * fill sheet (the same page, half its pockets still empty) beside the liked heart from the binder's
 * own like button.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BinderGrid } from '@/components/binder/BinderGrid';
import { openTcgscan } from '@/components/monetization/BundleOffer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Shadows, Spacing, Weight } from '@/constants/theme';
import type { DemoPage } from '@/data/binderTypes';
import { track } from '@/lib/analytics';
import { useBinders } from '@/store/binders';

type StepKind = 'scan' | 'compose' | 'share';

const STEPS: { kind: StepKind; head: string; body: string }[] = [
  { kind: 'scan', head: 'Scan', body: 'Point TCGScan at a card, a page, a whole binder. It reads them into your collection.' },
  {
    kind: 'compose',
    head: 'Compose',
    body:
      'Your collection syncs here. Binder pages keep their structure and layout. Fill and curate ' +
      'binder pages using cards you actually own.',
  },
  {
    kind: 'share',
    head: 'Share or Print',
    body:
      'Publish the binder at your @username and collect likes, or print the fill sheets at true ' +
      'size and swap the placeholders as the cards come in.',
  },
];

/** Every illustration sits in a box this tall (a 3×3 page at PAGE_W is ~190px), so the three headings line up beneath them. */
const ART_H = 204;
/** The finished page (Compose) draws at this width; the printed sheet (Share or Print) is narrower. */
const PAGE_W = 132;
const SHEET_PAGE_W = 96;
const SHEET_PAD = 6;
/** The printer: a body the sheet rises out of, overlapping it so the paper reads as still emerging. */
const PRINTER_W = 156;
const PRINTER_H = 54;
const PRINTER_OVERLAP = 30;
/** The phone (Scan): bezel outer size, and the one-card page drawn on its screen. */
const PHONE_W = 74;
const PHONE_H = 150;
const PHONE_PAD = 5;

/**
 * The example page each illustration is built from: the first example binder page that has a
 * card in it (the same page the curate callout shows as its "after").
 */
function useExamplePage(): DemoPage | undefined {
  const store = useBinders();
  return (
    store.exampleBinders.find((b) => b.pages[0]?.slots?.some((s) => s.cardId))?.pages[0] ?? store.exampleBinders[0]?.pages[0]
  );
}

/**
 * One card, as the phone sees it: the page's first card pocket alone on a 1×1 page. Drawn inside
 * a dark bezel with the four corner brackets of a scanner's reticle over it.
 */
function ScanArt({ page }: { page: DemoPage }) {
  const one = useMemo<DemoPage | null>(() => {
    const slot = page.slots.find((s) => s.type === 'card' && s.cardId);
    if (!slot) return null;
    return { id: `${page.id}-scan`, rows: 1, cols: 1, slots: [{ ...slot, row: 0, col: 0, rowSpan: 1, colSpan: 1 }] };
  }, [page]);
  return (
    <View style={styles.phone}>
      <View style={styles.screen}>
        {one ? <BinderGrid page={one} width={PHONE_W - PHONE_PAD * 2} instantImages /> : null}
        <View pointerEvents="none" style={styles.reticle}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
      </View>
    </View>
  );
}

/** The finished page, exactly as the binder draws it. */
function ComposeArt({ page }: { page: DemoPage }) {
  return (
    <View style={styles.pageShadow}>
      <BinderGrid page={page} width={PAGE_W} instantImages />
    </View>
  );
}

/**
 * Share or Print: a printer with the fill sheet coming out of it — the Compose page with every
 * other pocket still empty, the placeholders you swap out as the real cards arrive — and, beside
 * it, the binder's like button in its liked state (the filled heart and a count), the same pill
 * LikeButton draws on a public binder.
 */
function ShareArt({ page }: { page: DemoPage }) {
  const half = useMemo<DemoPage>(
    () => ({ ...page, id: `${page.id}-fill`, backgroundColor: undefined, slots: page.slots.filter((_, i) => i % 2 === 0) }),
    [page],
  );
  return (
    <View style={styles.shareArt}>
      <View style={styles.paper}>
        <BinderGrid page={half} width={SHEET_PAGE_W} instantImages />
      </View>
      <View style={styles.printer}>
        <View style={styles.printerSlot} />
        <View style={styles.printerLight} />
      </View>
      <View style={styles.likePill}>
        <Text style={styles.likeHeart}>♥</Text>
        <Text style={styles.likeCount}>12</Text>
      </View>
    </View>
  );
}

function StepArt({ kind, page }: { kind: StepKind; page: DemoPage | undefined }) {
  if (!page) return <View style={styles.art} />;
  return (
    <View style={styles.art} pointerEvents="none">
      {kind === 'scan' ? <ScanArt page={page} /> : kind === 'compose' ? <ComposeArt page={page} /> : <ShareArt page={page} />}
    </View>
  );
}

export function TcgscanPairing({ surface, compact = false }: { surface: string; compact?: boolean }) {
  const page = useExamplePage();
  const go = () => {
    track('tcgscan.pairing_click', { surface });
    openTcgscan();
  };
  return (
    <ThemedView type="backgroundElement" style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.head}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>TCGScan</Text>
        </View>
        <ThemedText type="smallBold" style={styles.kicker}>
          Pairs with michi-maker
        </ThemedText>
      </View>
      <ThemedText type="subtitle" style={styles.title}>
        Scan your cards on your phone. Build the binder here.
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
        TCGScan is our sister app for iPhone and Android: it scans cards into a collection, tracks what you own
        and what it is worth, and shares one account with michi-maker, so what you scan is what you can build with.
      </ThemedText>
      {!compact ? (
        <View style={styles.steps}>
          {STEPS.map((s, i) => (
            <View key={s.head} style={styles.step}>
              <StepArt kind={s.kind} page={page} />
              <ThemedText type="smallBold">
                {i + 1}. {s.head}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.stepBody}>
                {s.body}
              </ThemedText>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Pressable onPress={go} accessibilityRole="link" style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Get TCGScan</Text>
        </Pressable>
        <ThemedText type="small" themeColor="textSecondary">
          Free Forever. Unlimited on device scanning.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const CORNER = 14;
const CORNER_STROKE = 2;

const styles = StyleSheet.create({
  card: {
    padding: Spacing.four,
    gap: Spacing.two,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    ...Shadows.page,
  },
  cardCompact: { padding: Spacing.three },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  badge: { backgroundColor: Palette.chrome, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: '#F5EFE4', fontSize: FontSize.label, fontWeight: Weight.bold, letterSpacing: 0.3 },
  kicker: { color: Palette.accent, textTransform: 'uppercase', letterSpacing: 0.6, fontSize: FontSize.label },
  title: { marginTop: 2 },
  lede: { maxWidth: 620 },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, marginTop: Spacing.two },
  step: { flex: 1, minWidth: 180, gap: 2 },
  // The illustration box: a fixed height so the three headings sit on one line, content at the
  // bottom-left so a shorter drawing (the phone) hangs from the same baseline as the pages.
  art: { height: ART_H, justifyContent: 'flex-end', alignItems: 'flex-start', marginBottom: Spacing.two },
  pageShadow: { borderRadius: Radii.pageSmall, ...Shadows.page },
  // Scan: a dark phone bezel around a screen, the card centred on it, a reticle over the card.
  phone: {
    width: PHONE_W,
    height: PHONE_H,
    padding: PHONE_PAD,
    borderRadius: 12,
    backgroundColor: Palette.chromeDeep,
    ...Shadows.page,
  },
  screen: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: Palette.panelAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  reticle: { position: 'absolute', top: 10, right: 6, bottom: 10, left: 6 },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: Palette.accent },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_STROKE, borderLeftWidth: CORNER_STROKE, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_STROKE, borderRightWidth: CORNER_STROKE, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_STROKE, borderLeftWidth: CORNER_STROKE, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_STROKE, borderRightWidth: CORNER_STROKE, borderBottomRightRadius: 4 },
  // Share or Print: the sheet rises out of the printer (the printer is drawn over its lower edge),
  // the liked pill floats at the printer's right shoulder.
  shareArt: { width: PRINTER_W + 44, alignItems: 'flex-start' },
  paper: {
    marginLeft: (PRINTER_W - SHEET_PAGE_W - SHEET_PAD * 2 - 2) / 2,
    padding: SHEET_PAD,
    backgroundColor: Palette.white,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Palette.hairline,
    ...Shadows.page,
  },
  printer: {
    width: PRINTER_W,
    height: PRINTER_H,
    marginTop: -PRINTER_OVERLAP,
    borderRadius: 10,
    backgroundColor: Palette.chromeDeep,
    ...Shadows.page,
  },
  printerSlot: {
    position: 'absolute',
    top: 8,
    left: 14,
    right: 14,
    height: 4,
    borderRadius: 2,
    backgroundColor: Palette.muted,
  },
  printerLight: { position: 'absolute', right: 14, bottom: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: Palette.accent },
  // The like button, liked: LikeButton.tsx's pill with the accent border, filled heart and count.
  likePill: {
    position: 'absolute',
    right: 0,
    bottom: PRINTER_H - 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.accent,
    backgroundColor: Palette.white,
    ...Shadows.page,
  },
  likeHeart: { fontSize: FontSize.md, lineHeight: 20, color: Palette.accent },
  likeCount: { fontSize: FontSize.label, lineHeight: 20, fontWeight: Weight.bold, color: Palette.accent },
  stepBody: { lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  primary: { backgroundColor: Palette.accent, borderRadius: Radius.pill, paddingHorizontal: Spacing.four, paddingVertical: 8 },
  primaryText: { color: Palette.accentText, fontSize: FontSize.body, fontWeight: Weight.semibold },
  pressed: { opacity: 0.75 },
});
