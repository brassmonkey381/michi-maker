/**
 * CROSS-APP synergy surfaces (michi side). michi-maker and tcgscan share one account + one
 * `entitlements` ledger, so each app can see the other's Pro grant and cross-sell the bundle.
 * See docs/SYNERGY.md.
 *
 *   <BundleOffer/>          — shown to a MICHI PRO/VIP member who does NOT yet hold TCGScan Pro:
 *                            "add TCGScan Pro at a launch discount". This is the bundle upsell.
 *   <TcgscanSynergyNote/>   — contextual note on scan-powered features (Build-a-binder-from-your-
 *                            collection): TCGScan makes your collection real; Pro unlocks more.
 *
 * Checkout is provider-agnostic and not wired yet (see docs/PAYMENTS.md), so the button opens the
 * sibling app rather than a purchase flow. Nothing here removes access — these are additive CTAs.
 */
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { useTier } from '@/hooks/use-tier';

/** The sibling app's web home. Native deep-link scheme is `tcgscanexpo://` if ever needed. */
export const TCGSCAN_URL = 'https://idontgitit.com';

function openTcgscan() {
  void Linking.openURL(TCGSCAN_URL).catch(() => {});
}

/** Shared presentational card: a synergy message + a link button to TCGScan. */
function CrossAppCard({ message, cta }: { message: string; cta: string }) {
  return (
    <View style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
        {message}
      </ThemedText>
      <Pressable
        onPress={openTcgscan}
        hitSlop={6}
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
        <ThemedText type="smallBold" style={styles.btnText}>
          {cta}
        </ThemedText>
      </Pressable>
    </View>
  );
}

/**
 * Bundle cross-sell: a paying michi member who hasn't bought TCGScan Pro gets a discounted
 * add-on offer. Renders nothing for guests, free users (they see michi's own UpgradePerk first),
 * or anyone who already holds TCGScan Pro.
 */
export function BundleOffer() {
  const { isPaid, hasTcgscanPro, loading } = useTier();
  if (loading || !isPaid || hasTcgscanPro) return null;
  return (
    <CrossAppCard
      message="You’re a Michi member — add TCGScan Pro (scan, price-track & value your collection) at a launch discount."
      cta="Add TCGScan Pro →"
    />
  );
}

/**
 * Contextual synergy note for scan-powered features. Only shows when the user hasn't got TCGScan
 * Pro — a soft "this is better with the other app" nudge, never a block.
 */
export function TcgscanSynergyNote() {
  const { hasTcgscanPro, loading } = useTier();
  if (loading || hasTcgscanPro) return null;
  return (
    <CrossAppCard
      message="Powered by TCGScan. Scan your cards to keep this collection accurate & valued — TCGScan Pro members get live prices and ROI."
      cta="Open TCGScan →"
    />
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
    maxWidth: 460,
  },
  text: { flex: 1, lineHeight: 18 },
  btn: {
    backgroundColor: Palette.accent,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  btnText: { color: Palette.accentText, fontSize: FontSize.label },
  pressed: { opacity: 0.7 },
});
