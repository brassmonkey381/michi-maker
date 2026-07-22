/**
 * CROSS-APP synergy surfaces (michi side). michi-maker and tcgscan share one account + one
 * `entitlements` ledger, so each app can see the other's Pro grant and cross-sell the bundle.
 * See docs/SYNERGY.md.
 *
 *   <BundleOffer/>          — shown to a MICHI PRO/VIP member who does NOT yet hold TCGScan Pro:
 *                            "add TCGScan at a bundle discount". When checkout is open this opens
 *                            TCGScan's PLANS page (?bundle=1) so the member picks PRO or VIP
 *                            themselves — the 60% coupon is applied server-side at checkout after
 *                            sibling-ownership verification, whichever tier they choose. (It used
 *                            to jump straight into a tcgscan_pro checkout; the owner wanted the
 *                            choice.) The click also mints a one-time SSO handoff hash
 *                            (data/handoff.ts) so the member arrives at tcgscan ALREADY signed
 *                            in; mint failure degrades to the plain link and tcgscan's banner
 *                            sign-in button. Closed → links to TCGScan's landing page.
 *   <TcgscanSynergyNote/>   — contextual note on scan-powered features (Build-a-binder-from-your-
 *                            collection): TCGScan makes your collection real; Pro unlocks more.
 *
 * Every TCGScan mention links to its landing page (TCGSCAN_URL → tcgscan.ai/welcome).
 * Nothing here removes access — these are additive CTAs.
 */
import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { mintHandoffHash, withHandoffHash } from '@/data/handoff';
import { CHECKOUT_OPEN, TCGSCAN_PLANS_URL, TCGSCAN_URL } from '@/data/subscriptions';
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
  if (loading || !isPaid || hasTcgscanPro) return null;
  const onPress = async () => {
    if (!CHECKOUT_OPEN) {
      openTcgscan();
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      // Open TCGScan's plans page rather than a pre-picked checkout: the member chooses PRO
      // or VIP there, and the coupon rides along server-side either way. The handoff hash
      // signs them in over there; null (guest / mint failure) falls back to the plain link.
      const url = withHandoffHash(TCGSCAN_PLANS_URL, await mintHandoffHash());
      // Same-tab on web: window.open after an await trips popup blockers.
      if (Platform.OS === 'web') window.location.assign(url);
      else void Linking.openURL(url).catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  return (
    <CrossAppCard
      message="You’re a Michi member — save 60% on your TCGScan add-on: scan, price-track & value this exact collection."
      cta={CHECKOUT_OPEN ? 'Save 60% on TCGScan →' : 'Add TCGScan Pro →'}
      onPress={() => void onPress()}
      busy={busy}
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
  // Stacked: message ABOVE the button — a side-by-side row squeezed the text into a sliver
  // inside narrow containers (the Settings sheet).
  card: {
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
    maxWidth: 460,
  },
  text: { lineHeight: 18 },
  btn: {
    backgroundColor: Palette.accent,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    alignSelf: 'flex-start',
  },
  btnText: { color: Palette.accentText, fontSize: FontSize.label },
  pressed: { opacity: 0.7 },
});
