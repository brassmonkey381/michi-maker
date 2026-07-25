/**
 * Upsell shown when a FREE user taps the locked "Color match · tri-color" composer method in the
 * AutoFill sheet. Explains what the Tri-Color Search does — and, with a small self-contained
 * infographic, shows the payoff: pick up to three colours and every pocket on the page is
 * palette-matched so a whole binder spread flows edge to edge. CTA routes to /plans.
 *
 * The infographic is pure procedural Views (no images, no licensing) — a triad of swatches (the
 * tri-color picker) resolving into a 3×3 "binder page" of harmonised tiles with a couple of tonal
 * inserts, echoing the real composer output.
 */
import { StyleSheet, View } from 'react-native';

import { DialogCard } from '@/components/ui/DialogCard';
import { UpgradePerk } from '@/components/monetization/UpgradePerk';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Radius, Spacing } from '@/constants/theme';

// The three colours the "tri-color" picker stands for (a violet → magenta → coral triad).
const TRIAD = ['#6C4DFF', '#D64AA8', '#FB8C4E'] as const;

// The composed page: 9 pockets flowing across the triad. `insert` tiles are the pale tonal
// negative-space inserts the real composer scatters in (~1 per 4 pockets).
const PAGE: { color: string; insert?: boolean }[] = [
  { color: '#6C4DFF' },
  { color: '#8A4DF0' },
  { color: '#EADBFF', insert: true },
  { color: '#C24AC0' },
  { color: '#D64AA8' },
  { color: '#E84A8F' },
  { color: '#F25C77' },
  { color: '#FFE3D3', insert: true },
  { color: '#FB8C4E' },
];

export function TriColorUpsell({
  visible,
  onClose,
  /** Runs just before navigating to /plans — close the covering AutoFill sheet so /plans shows. */
  onBeforeUpgrade,
}: {
  visible: boolean;
  onClose: () => void;
  onBeforeUpgrade?: () => void;
}) {
  return (
    <DialogCard
      visible={visible}
      onClose={onClose}
      maxWidth={420}
      title={
        <>
          Color match · tri-color <ThemedText type="smallBold" style={styles.proTag}>PRO</ThemedText>
        </>
      }>
      <ThemedText type="small" themeColor="textSecondary" style={styles.lead}>
        The premium composer. Instead of matching one energy type, it ranks every card by its actual
        palette so a whole page reads as one deliberate colour story.
      </ThemedText>

      {/* Infographic: tri-color picker → a palette-matched binder page. */}
      <View style={styles.info}>
        <View style={styles.swatchRow}>
          {TRIAD.map((c) => (
            <View key={c} style={[styles.swatch, { backgroundColor: c }]} />
          ))}
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
          Pick up to three colours
        </ThemedText>

        <ThemedText type="small" themeColor="textSecondary" style={styles.arrow}>
          ↓
        </ThemedText>

        <View style={styles.page}>
          {PAGE.map((tile, i) => (
            <View
              key={i}
              style={[
                styles.pocket,
                { backgroundColor: tile.color },
                tile.insert && styles.pocketInsert,
              ]}>
              {/* A faint top strip so each pocket reads as a card, not a flat swatch. */}
              {!tile.insert ? <View style={styles.pocketSheen} /> : null}
            </View>
          ))}
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
          Every pocket palette-matched — the whole page flows edge to edge
        </ThemedText>
      </View>

      <ThemedText type="small" themeColor="textSecondary" style={styles.lead}>
        Free plans keep <ThemedText type="smallBold">Color by type</ThemedText> — a simple match on
        the seed’s energy type. Tri-color is included with any PRO or VIP plan.
      </ThemedText>

      <UpgradePerk
        message="Unlock tri-color color match (and every upgraded composer) with PRO or VIP."
        cta="See plans"
        onBeforePress={() => {
          onClose();
          onBeforeUpgrade?.();
        }}
      />
    </DialogCard>
  );
}

// Grid geometry (kept explicit so 3 pockets always fit per row: width = 3·pocket + 2·gap + 2·pad).
const POCKET_W = 64;
const POCKET_H = 84;
const GAP = 4;
const PAD = 8;

const styles = StyleSheet.create({
  proTag: {
    fontSize: FontSize.label,
    color: '#6C4DFF',
    letterSpacing: 0.5,
  },
  lead: { lineHeight: 20 },
  info: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  swatchRow: { flexDirection: 'row', gap: Spacing.two },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  caption: { textAlign: 'center', lineHeight: 18, maxWidth: 300 },
  arrow: { fontSize: FontSize.h2, lineHeight: 22 },
  page: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 3 * POCKET_W + 2 * GAP + 2 * PAD,
    gap: GAP,
    padding: PAD,
    borderRadius: Radius.panel,
    backgroundColor: 'rgba(120,120,140,0.12)',
  },
  pocket: {
    width: POCKET_W,
    height: POCKET_H,
    borderRadius: Radius.thumb,
    overflow: 'hidden',
  },
  pocketInsert: {
    borderWidth: 1,
    borderColor: 'rgba(120,120,140,0.35)',
    borderStyle: 'dashed',
  },
  pocketSheen: {
    height: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
});
