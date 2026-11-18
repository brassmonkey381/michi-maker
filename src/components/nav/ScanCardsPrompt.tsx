/**
 * THE "SCAN CARDS" PROMPT (TCG-030, owner 2026-11-17). The rail's and the phone menu's "Scan Cards"
 * used to jump straight to the scanner site. It now asks first: what scanning in BiBoScan does for
 * a michi member (the cards land in "My collection" on "My Binders": portfolio_entries roll up into
 * user_cards, which MyCollection reads live), a plain warning that web scanning is still rough,
 * and one button to scan on the web anyway.
 *
 * "Scan on the web" goes through useTcgscanOpen, so a signed-in member still arrives signed in
 * (the one-time #th ticket), and its new tab is opened inside this press, which a popup blocker
 * allows.
 *
 * APP INSTALL SPOT: hidden until BiBoScan is approved on the App Store. Then set
 * SHOW_APP_INSTALL to true and fill in APP_STORE_URL; the block renders the QR code and the link.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DialogCard } from '@/components/ui/DialogCard';
import { useTcgscanOpen } from '@/components/monetization/BundleOffer';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { TCGSCAN_URL } from '@/data/subscriptions';

/** Off until BiBoScan's App Store approval (TCG-015). Do not switch on before the listing is live. */
const SHOW_APP_INSTALL = false;
/** The App Store listing, once it exists. Empty on purpose. */
const APP_STORE_URL = '';

export function ScanCardsPrompt({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { opening, open } = useTcgscanOpen();
  return (
    <DialogCard visible={visible} onClose={onClose} title="Scan your cards" maxWidth={460}>
      <View style={styles.body} testID="scan-cards-prompt">
        <Text style={styles.lead}>
          Cards you scan in BiBoScan land in your Michi-Maker collection. They show up under “My collection” on the “My
          Binders” screen, as long as you use the same account in both.
        </Text>

        {SHOW_APP_INSTALL && APP_STORE_URL ? (
          // APP INSTALL SPOT (TCG-030): QR code + App Store link go here after approval.
          <View style={styles.install} />
        ) : null}

        <View style={styles.warn}>
          <Text style={styles.warnText}>
            <Text style={styles.warnHead}>Heads up: </Text>
            scanning on the web is still rough and can be buggy. We are working hard to bring BiBoScan to phones soon.
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>Not now</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              open(TCGSCAN_URL, { newTab: true });
              onClose();
            }}
            disabled={opening}
            accessibilityRole="button"
            testID="scan-cards-web"
            style={({ pressed }) => [styles.primary, (pressed || opening) && styles.pressed]}>
            <Text style={styles.primaryText}>{opening ? 'Opening…' : 'Scan on the web'}</Text>
          </Pressable>
        </View>
      </View>
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.three },
  lead: { fontSize: FontSize.md, lineHeight: 24, color: Palette.ink },
  install: { minHeight: 0 },
  warn: { padding: Spacing.three, borderRadius: Radius.sm, backgroundColor: Palette.hairline },
  warnText: { fontSize: FontSize.sm, lineHeight: 20, color: Palette.ink },
  warnHead: { fontWeight: Weight.bold },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two, flexWrap: 'wrap', marginTop: Spacing.one },
  primary: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: Radius.pill, backgroundColor: Palette.accent },
  primaryText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.accentText },
  secondary: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.hairlineStrong },
  secondaryText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink },
  pressed: { opacity: 0.7 },
});
