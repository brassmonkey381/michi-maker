/**
 * `/legal/privacy` — Privacy Policy, written to reflect what the app actually does (Supabase
 * auth including anonymous guests, binders and profiles with public flags, art uploads,
 * tcgscan portfolio imports, Stripe payments, on-device preferences). Finalized 2026-07-22 at
 * billing go-live: subprocessors verified (Supabase on AWS us-east-1, Vercel, Stripe), the
 * no-ads/no-trackers claim checked against the dependency tree (only @vercel/og, which is OG
 * image generation, not analytics), and account deletion routed through support email (no
 * in-app path exists yet — if one ships, update §7).
 */
import { StyleSheet, View } from 'react-native';

import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { Fonts, FontSize, Spacing } from '@/constants/theme';

const LAST_UPDATED = 'July 22, 2026';

interface Section {
  heading: string;
  paragraphs: string[];
}

const SECTIONS: Section[] = [
  {
    heading: '1. What we collect',
    paragraphs: [
      'Account identity: an email address, or a Google or Apple sign-in, handled by our backend provider (Supabase). Guests get an anonymous account with no personal details until they choose to upgrade it.',
      'Profile: your permanent username, optional avatar, and a public or private flag you control.',
      'Your work: binders, pages, pocket contents, notes, saved art slices, and images you upload.',
      'Collection data: card inventory you import from TCGScan or by CSV, if you use those features.',
      'On this device: small preferences like your theme choice and whether you have seen the landing page, stored locally.',
    ],
  },
  {
    heading: '2. How we use it',
    paragraphs: [
      'To run the product: saving your binders, syncing them across your devices, and showing your public pages to others only when you have marked them public. We do not use your content for anything else.',
    ],
  },
  {
    heading: '3. Where it lives',
    paragraphs: [
      'Your data is stored with Supabase, our database and authentication provider, which runs on Amazon Web Services in the US East (Northern Virginia) region.',
      'Two other providers handle parts of the service: Vercel hosts the web app, and Stripe processes payments (see Payments below). Each stores only what it needs to do its job.',
    ],
  },
  {
    heading: '4. What is public',
    paragraphs: [
      'Public binders and public profiles are visible to anyone with the link (and may appear in Featured or People search), along with likes and upvotes on them. The Public profile switch in Settings controls this: turned off, every one of your binders is hidden from everyone but you.',
    ],
  },
  {
    heading: '5. What we do not do',
    paragraphs: [
      'No ads, no ad trackers, and no third-party analytics tools run in michi-maker. We never sell your personal information or share it for advertising. Beyond the content you create, the only records are the standard infrastructure logs our hosting providers keep to run and secure the service.',
    ],
  },
  {
    heading: '6. Payments',
    paragraphs: [
      'Paid plans and one-time unlocks are processed by Stripe, our payment provider. Your card details go directly to Stripe and are never seen or stored by michi-maker. We keep the records needed to run your plan: what you bought, the term it covers, and the Stripe customer reference that links your account to your subscription. Receipts and invoices come from Stripe.',
    ],
  },
  {
    heading: '7. Data retention and deletion',
    paragraphs: [
      'Your binders and profile persist until you delete them. Deleting a binder removes its pages and contents.',
      'To delete your account entirely, email support@michi-maker.com from the address on the account. We will delete the account and its data within 30 days, except records we are required to keep (such as payment records) for legal or accounting reasons.',
    ],
  },
  {
    heading: '8. Children',
    paragraphs: [
      'michi-maker is not directed at children under 13, and we do not knowingly collect personal information from them.',
    ],
  },
  {
    heading: '9. Changes',
    paragraphs: [
      'We may update this policy as the product evolves; material changes will be reflected in the date above.',
    ],
  },
  {
    heading: '10. Contact',
    paragraphs: ['Privacy questions and data requests: support@michi-maker.com.'],
  },
];

export default function PrivacyScreen() {
  return (
    <PageShell title="Privacy Policy" description="How michi-maker handles your data.">
      <ThemedText type="subtitle" style={styles.h1}>
        Privacy Policy
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.updated}>
        Last updated {LAST_UPDATED}
      </ThemedText>

      {SECTIONS.map((s) => (
        <View key={s.heading} style={styles.section}>
          <ThemedText type="smallBold" style={styles.heading}>
            {s.heading}
          </ThemedText>
          {s.paragraphs.map((p, i) => (
            <ThemedText key={i} type="small" themeColor="textSecondary" style={styles.para}>
              {p}
            </ThemedText>
          ))}
        </View>
      ))}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: Fonts?.brand, marginBottom: Spacing.one },
  updated: { fontSize: FontSize.sm, marginBottom: Spacing.five },
  section: { marginBottom: Spacing.four, gap: Spacing.two },
  heading: { fontSize: FontSize.control },
  para: { lineHeight: 20 },
});
