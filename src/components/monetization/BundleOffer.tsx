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
import { useCallback, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { mintHandoffHash, withHandoffHash } from '@/data/handoff';
import { CHECKOUT_OPEN, TCGSCAN_PLANS_URL, TCGSCAN_URL } from '@/data/subscriptions';
import { useTier } from '@/hooks/use-tier';

export { TCGSCAN_URL };

/**
 * EVERY WAY OUT TO TCGSCAN goes through here: the rail link, the pairing card's button, the inline
 * mentions and the bundle card. A signed-in member gets a one-time handoff hash on the link so
 * they land on tcgscan.ai already signed in (tcgscan redeems it on any arrival page since
 * 2026-09-06); a guest, a signed-out visitor or a failed mint gets the plain link. Same-tab on
 * web: window.open after an await trips popup blockers.
 */
export function openTcgscan(): Promise<void> {
  return openTcgscanUrl(TCGSCAN_URL);
}

/**
 * Any tcgscan.ai address, with the handoff; a non-tcgscan address opens plainly.
 *
 * AWAITABLE, because it is not instant. Minting the ticket is a round trip to the edge function
 * and the navigation is another, so a second or two passes between the press and the page
 * changing — during which this used to look like a button that did nothing, and a second press
 * minted a second ticket. Every caller should hold a pending state over it; `useTcgscanOpen` is
 * that state, and the reason this returns a promise rather than firing and forgetting.
 */
export function openTcgscanUrl(url: string): Promise<void> {
  return (async () => {
    const isTcgscan = /^https:\/\/([a-z0-9-]+\.)?tcgscan\.ai(\/|$)/i.test(url);
    const target = isTcgscan ? withHandoffHash(url, await mintHandoffHash()) : url;
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.assign(target);
    else await Linking.openURL(target).catch(() => {});
  })();
}

/**
 * A press that opens TCGScan, and whether one is in flight.
 *
 * `opening` stays true until the navigation happens, which on web means until this page is
 * replaced — so the button reads as working for the whole wait rather than for a frame. A second
 * press while it is true is ignored: two tickets for one journey is a wasted mint, and the second
 * would be the one redeemed while the first went stale.
 */
export function useTcgscanOpen(): { opening: boolean; open: (url?: string) => void } {
  const [opening, setOpening] = useState(false);
  const open = useCallback(
    (url?: string) => {
      setOpening((was) => {
        if (was) return was;
        void openTcgscanUrl(url ?? TCGSCAN_URL).finally(() => setOpening(false));
        return true;
      });
    },
    [],
  );
  return { opening, open };
}

/** Inline tappable "tcgscan" word for prose mentions — always points at the landing page. */
export function TcgscanLink({ label = 'TCGScan' }: { label?: string }) {
  // A word in a sentence, so the pending state is an ellipsis rather than a spinner: enough to
  // say the press landed, little enough not to reflow the paragraph around it.
  const { opening, open } = useTcgscanOpen();
  return (
    <ThemedText type="small" style={styles.inlineLink} onPress={() => open()}>
      {opening ? `${label}…` : label}
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
  const { michiIsPaid, hasTcgscanPro, loading } = useTier();
  const [busy, setBusy] = useState(false);
  // michiIsPaid, not isPaid: isPaid is true on a TRIAL, and the copy below both calls the
  // reader a member and promises 60% - neither of which a trial has earned.
  if (loading || !michiIsPaid || hasTcgscanPro) return null;
  const onPress = async () => {
    if (busy) return;
    if (!CHECKOUT_OPEN) {
      // Held busy over the open for the same reason every other way out is: the handoff is minted
      // before the page moves, and until it does the button must not look idle or take a second press.
      setBusy(true);
      try {
        await openTcgscan();
      } finally {
        setBusy(false);
      }
      return;
    }
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
      message="You’re a Michi member, save 60% on your TCGScan add-on: scan, price-track & value this exact collection."
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
  // Called before the early return so hook order never varies with the tier read landing.
  const { opening, open } = useTcgscanOpen();
  if (loading || hasTcgscanPro) return null;
  return (
    <CrossAppCard
      message="Powered by TCGScan. Scan your cards to keep this collection accurate & valued, TCGScan Pro members get live prices and ROI."
      cta="Meet TCGScan →"
      onPress={() => open()}
      busy={opening}
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
