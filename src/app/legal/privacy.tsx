/**
 * `/legal/privacy` — Privacy Policy DRAFT, written to reflect what the app actually does
 * (Supabase auth including anonymous guests, binders and profiles with public flags, art
 * uploads, tcgscan portfolio imports, on-device preferences). Ships with a visible draft
 * banner and inline [PLACEHOLDER] markers for passages that need verification or counsel.
 */
import { StyleSheet, View } from 'react-native';

import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { Fonts, FontSize, Palette, Radius, Spacing } from '@/constants/theme';

const LAST_UPDATED = 'July 16, 2026';

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
      'Your data is stored with Supabase, our database and authentication provider.',
      '[PLACEHOLDER: hosting region and subprocessor details.]',
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
      '[PLACEHOLDER pending verification: statements about advertising trackers, analytics tooling, and data sale. The intent is: no ads, no selling data; confirm the analytics inventory before finalizing.]',
    ],
  },
  {
    heading: '6. Payments',
    paragraphs: [
      'There are no payments today. When paid plans open, a payment provider will process them; michi-maker will not store your card details. This policy will be updated before any charge is made.',
    ],
  },
  {
    heading: '7. Data retention and deletion',
    paragraphs: [
      'Your binders and profile persist until you delete them. Deleting a binder removes its pages and contents.',
      '[PLACEHOLDER: account-deletion path and timelines; verify the current mechanism before finalizing this section.]',
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
    paragraphs: ['[PLACEHOLDER: contact email or form for privacy questions.]'],
  },
];

export default function PrivacyScreen() {
  return (
    <PageShell title="Privacy Policy" description="How michi-maker handles your data.">
      <View style={styles.draftBanner}>
        <ThemedText type="smallBold" style={styles.draftTitle}>
          Draft
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.draftText}>
          This document is awaiting legal review. Passages marked [PLACEHOLDER] are not final.
        </ThemedText>
      </View>

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
            <ThemedText
              key={i}
              type="small"
              themeColor="textSecondary"
              style={[styles.para, p.startsWith('[PLACEHOLDER') && styles.placeholder]}>
              {p}
            </ThemedText>
          ))}
        </View>
      ))}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  draftBanner: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panelAlt,
    borderRadius: Radius.panel,
    padding: Spacing.three,
    gap: 2,
    marginBottom: Spacing.four,
  },
  draftTitle: { fontSize: FontSize.label, textTransform: 'uppercase', letterSpacing: 0.5 },
  draftText: { fontSize: FontSize.sm, lineHeight: 18 },
  h1: { fontFamily: Fonts?.brand, marginBottom: Spacing.one },
  updated: { fontSize: FontSize.sm, marginBottom: Spacing.five },
  section: { marginBottom: Spacing.four, gap: Spacing.two },
  heading: { fontSize: FontSize.control },
  para: { lineHeight: 20 },
  placeholder: { fontStyle: 'italic', color: Palette.muted3 },
});
