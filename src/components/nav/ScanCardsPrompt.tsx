/**
 * THE "SCAN CARDS" PROMPT (TCG-030, owner 2026-11-17). The rail's and the phone menu's "Scan Cards"
 * used to jump straight to the scanner site. It now asks first, on the kit's Dialog (the one
 * MIC-045 standardised every confirmation on; see ConfirmDialog): what BiBoScan is (our own
 * card-scanning website, a new tab), that the same account works on both, and that scans land in
 * "My collection" on "My Binders" in real time (portfolio_entries roll up into user_cards, which
 * MyCollection reads live). The grey block is the friendly heads-up about web scanning.
 *
 * "Open BiBoScan" goes through useTcgscanOpen, so a signed-in member still arrives signed in
 * (the one-time #th ticket), and its new tab is opened inside this press, which a popup blocker
 * allows.
 *
 * APP INSTALL SPOT: hidden until BiBoScan is approved on the App Store. Then set
 * SHOW_APP_INSTALL to true and fill in APP_STORE_URL; the slot renders as the dialog's children.
 */
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { Dialog } from 'tcgscan-ui';

import { useTcgscanOpen } from '@/components/monetization/BundleOffer';
import { TCGSCAN_URL } from '@/data/subscriptions';

/** Off until BiBoScan's App Store approval (TCG-015). Do not switch on before the listing is live. */
const SHOW_APP_INSTALL = false;
/** The App Store listing, once it exists. Empty on purpose. */
const APP_STORE_URL = '';

const BIBO_MARK = require('@/assets/images/bibo-icon.png');

export function ScanCardsPrompt({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { opening, open } = useTcgscanOpen();
  return (
    <Dialog
      visible={visible}
      closeButton
      maxWidth={440}
      title="Scan cards on BiBoScan"
      body={
        'Scanning happens on BiBoScan (biboscan.com), our own card-scanning website, made by the Michi-Maker team. ' +
        'It opens in a new tab. Use the same account on both, and every card you scan shows up in your Michi-Maker ' +
        'collection, under “My collection” on “My Binders”, in real time.'
      }
      consequence={{
        title: 'Heads up: scanning on the web is still a little rough',
        detail: 'It can be buggy for now. We are working hard on a phone app, coming soon.',
        thumb: <Image source={BIBO_MARK} style={styles.mark} contentFit="contain" accessibilityLabel="BiBoScan" />,
      }}
      onClose={onClose}
      cancel={{ label: 'Not now', onPress: onClose }}
      confirm={{
        label: opening ? 'Opening…' : 'Open BiBoScan',
        disabled: opening,
        onPress: () => {
          open(TCGSCAN_URL, { newTab: true });
          onClose();
        },
      }}>
      {SHOW_APP_INSTALL && APP_STORE_URL ? (
        // APP INSTALL SPOT (TCG-030): QR code + App Store link go here after approval.
        <View testID="scan-cards-install" />
      ) : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  mark: { width: 40, height: 40, borderRadius: 10 },
});
