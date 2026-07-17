/**
 * `/legal/terms` — Terms of Service DRAFT. Ships with a visible draft banner and inline
 * [PLACEHOLDER] markers; the owner (and counsel) finalize those passages before the draft
 * banner comes down. The IP / fan-content disclaimer is folded in as its own section.
 */
import { StyleSheet, View } from 'react-native';

import { PageShell } from '@/components/layout/PageShell';
import { FAN_DISCLAIMER } from '@/components/layout/SiteFooter';
import { ThemedText } from '@/components/themed-text';
import { Fonts, FontSize, Palette, Radius, Spacing } from '@/constants/theme';

const LAST_UPDATED = 'July 16, 2026';

interface Section {
  heading: string;
  paragraphs: string[];
}

const SECTIONS: Section[] = [
  {
    heading: '1. Accepting these terms',
    paragraphs: [
      'michi-maker is a web and mobile app for planning and printing curated trading-card binder pages. By creating an account, continuing as a guest, or simply using the app, you agree to these terms. If you do not agree, please do not use michi-maker.',
    ],
  },
  {
    heading: '2. What michi-maker is',
    paragraphs: [
      'michi-maker is a fan-made hobby tool, currently in beta. Features may change, break, or be removed while we build. We will always try to treat your data carefully, but during beta you should not treat michi-maker as the only copy of anything you cannot afford to lose.',
    ],
  },
  {
    heading: '3. Accounts',
    paragraphs: [
      'You can use michi-maker as a guest: a private anonymous account is created for you so your binders save immediately. You can later upgrade a guest session to a full account with an email address or a Google or Apple sign-in, keeping everything you made.',
      'Usernames are permanent once claimed. You are responsible for activity on your account and for keeping your sign-in method secure.',
    ],
  },
  {
    heading: '4. Your content',
    paragraphs: [
      'Binders, page layouts, notes, and images you upload remain yours. By marking a binder or profile public, you give us permission to display it to other visitors (that is what public means); flip it back to private any time and it disappears from public view.',
      'You are responsible for content you upload. Only upload images you have the right to use.',
    ],
  },
  {
    heading: '5. Acceptable use',
    paragraphs: [
      'Do not use michi-maker to host or spread content that is illegal, infringing, hateful, or abusive; do not attempt to break, overload, or reverse the service; do not scrape other collectors’ data.',
    ],
  },
  {
    heading: '6. Intellectual property and fan content',
    paragraphs: [
      FAN_DISCLAIMER,
      'The Michi Method is credited to the collector Michi (@peeplop on Instagram), who created and popularised it. michi-maker exists to make the method easier to plan and is not affiliated with or endorsed by Michi.',
      'Printing features are intended for personal collection display: filling your own physical binder pages. You are responsible for how you use printed output.',
    ],
  },
  {
    heading: '7. Paid plans',
    paragraphs: [
      'michi-maker is free while in beta. Paid plans (described on the Plans page) are planned but not yet open. When they open, billing will be handled by a payment provider and these terms will be updated with billing and refund policies before any charge is made.',
      '[PLACEHOLDER: billing, renewal, and refund terms pending payment provider selection.]',
    ],
  },
  {
    heading: '8. Termination',
    paragraphs: [
      'You can stop using michi-maker at any time. We may suspend or close accounts that break these terms or that we reasonably believe are harming the service or other users.',
    ],
  },
  {
    heading: '9. Disclaimers and limitation of liability',
    paragraphs: [
      'michi-maker is provided as is, without warranties of any kind, to the extent permitted by law.',
      '[PLACEHOLDER: full disclaimer and limitation-of-liability clause pending counsel review.]',
    ],
  },
  {
    heading: '10. Changes to these terms',
    paragraphs: [
      'We may update these terms as the product evolves. Material changes will be reflected in the date above, and continued use after a change means you accept the updated terms.',
    ],
  },
  {
    heading: '11. Contact',
    paragraphs: ['[PLACEHOLDER: contact email or form for terms questions.]'],
  },
];

export default function TermsScreen() {
  return (
    <PageShell title="Terms of Service" description="michi-maker terms of service.">
      <View style={styles.draftBanner}>
        <ThemedText type="smallBold" style={styles.draftTitle}>
          Draft
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.draftText}>
          This document is awaiting legal review. Passages marked [PLACEHOLDER] are not final.
        </ThemedText>
      </View>

      <ThemedText type="subtitle" style={styles.h1}>
        Terms of Service
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
