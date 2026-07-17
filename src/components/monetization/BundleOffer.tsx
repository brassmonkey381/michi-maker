/**
 * CROSS-APP synergy surfaces (michi side). michi-maker and tcgscan share one account + one
 * `entitlements` ledger, so each app can see the other's Pro grant and cross-sell the bundle.
 * See docs/SYNERGY.md.
 *
 *   <BundleOffer/>          — shown to a MICHI PRO/VIP member who does NOT yet hold TCGScan Pro:
 *                            "add TCGScan Pro at a bundle discount". When checkout is open this
 *                            launches a REAL discounted tcgscan_pro checkout (the server verifies
 *                            sibling ownership before applying the coupon); the grant lands in the
 *                            shared ledger both apps read. Closed → links to TCGScan's landing page.
 *   <TcgscanSynergyNote/>   — contextual note on scan-powered features (Build-a-binder-from-your-
 *                            collection): TCGScan makes your collection real; Pro unlocks more.
 *
 * Every TCGScan mention links to its landing page (TCGSCAN_URL → idontgitit.com/welcome).
 * Nothing here removes access — these are additive CTAs.
 */
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { startCheckout } from '@/data/checkout';
import { CHECKOUT_OPEN, TCGSCAN_PRO_LOOKUP_KEY, TCGSCAN_URL } from '@/data/subscriptions';
import { useTier } from '@/hooks/use-tier';

export { TCGSCAN_URL };

function openTcgscan() {
  void Linking.openURL(TCGSCAN_URL).catch(() => {});
}

/** Inline tappable "tcgscan" word for prose mentions — always points at the landing page. */
export function TcgscanLink({ label = 'TCGScan' }: { label?: string }) {
  return (
    <ThemedText type="small" style={styles.inlineLink} onPress={openTcgscan}>
      {label}
    </ThemedText>
  );
}

/** Shared presentational card: a synergy message + an action button, with an optional footer. */
function CrossAppCard({
  message,
  cta,
  onPress,
  busy,
  footer,
}: {
  message: string;
  cta: string;
  onPress: () => void;
  busy?: boolean;
  footer?: string | null;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
          {message}
        </ThemedText>
        <Pressable
          onPress={onPress}
          disabled={busy}
          hitSlop={6}
          style={({ pressed }) => [styles.btn, (pressed || busy) && styles.pressed]}>
          <ThemedText type="smallBold" style={styles.btnText}>
            {busy ? '…' : cta}
          </ThemedText>
        </Pressable>
      </View>
      {footer ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>
          {footer}
        </ThemedText>
      ) : null}
    </View>
  );
}

/**
 * Bundle cross-sell: a paying michi member who hasn't bought TCGScan Pro gets a discounted
 * add-on offer — a real checkout when open, a landing-page link otherwise. Renders nothing for
 * guests, free users (they see michi's own UpgradePerk first), or existing TCGScan Pro holders.
 */
export function BundleOffer() {
  const { isPaid, hasTcgscanPro, loading } = useTier();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (loading || !isPaid || hasTcgscanPro) return null;
  const onPress = () => {
    if (!CHECKOUT_OPEN) {
      openTcgscan();
      return;
    }
    if (busy) return;
    setBusy(true);
    setNote(null);
    startCheckout(TCGSCAN_PRO_LOOKUP_KEY, { bundle: true })
      .catch((e) => setNote((e as Error).message))
      .finally(() => setBusy(false));
  };
  return (
    <CrossAppCard
      message="You’re a Michi member — add TCGScan Pro (scan, price-track & value your collection) at a bundle discount."
      cta={CHECKOUT_OPEN ? 'Add TCGScan Pro (discounted) →' : 'Add TCGScan Pro →'}
      onPress={onPress}
      busy={busy}
      footer={note}
    />
  );
}

/**
 * Contextual synergy note for scan-powered features. Only shows when the user hasn't got TCGScan
 * Pro — a soft "this is better with the other app" nudge, never a block. Links to the landing page.
 */
export function TcgscanSynergyNote() {
  const { hasTcgscanPro, loading } = useTier();
  if (loading || hasTcgscanPro) return null;
  return (
    <CrossAppCard
      message="Powered by TCGScan. Scan your cards to keep this collection accurate & valued — TCGScan Pro members get live prices and ROI."
      cta="Meet TCGScan →"
      onPress={openTcgscan}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two, maxWidth: 460 },
  footer: { paddingHorizontal: Spacing.three, lineHeight: 18 },
  inlineLink: { color: Palette.accent, fontWeight: '600' },
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
