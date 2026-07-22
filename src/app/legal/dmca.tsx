/**
 * `/legal/dmca` — DMCA / copyright takedown policy. Explains how a rights holder files a
 * notice, our counter-notice process, and the repeat-infringer policy. Designated agent:
 * "Copyright Compliance Agent" (a registered position, not a person), filed with the US
 * Copyright Office 2026-07-22 (listing confirmed), notices to support@michi-maker.com.
 * Renewal due 2029 (3-year term) or safe harbor lapses.
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
    heading: 'Our approach',
    paragraphs: [
      'michi-maker is a layout tool for content our users supply: people compose binder pages with art they add, and when a user adds art we host a copy of it on their behalf. We respect copyright and respond to valid takedown requests. If you believe content a user has posted on michi-maker infringes your copyright, tell us using the process below and we will review it promptly.',
      'You can also flag a public binder directly from its page with the “Report this binder” link — useful for a quick report. The formal notice below is the route for rights holders who want a documented takedown.',
    ],
  },
  {
    heading: 'Filing a takedown notice',
    paragraphs: [
      'Send a written notice to our designated agent (below) that includes: (1) your physical or electronic signature; (2) identification of the copyrighted work you claim was infringed; (3) identification of the material you say is infringing and enough information for us to find it (a link to the binder or page); (4) your contact information; (5) a statement that you have a good-faith belief the use is not authorized by the copyright owner, its agent, or the law; and (6) a statement, under penalty of perjury, that the information is accurate and that you are the copyright owner or authorized to act on their behalf.',
      'When we receive a valid notice, we remove or disable access to the material and make a good-faith effort to notify the person who posted it.',
    ],
  },
  {
    heading: 'Counter-notice',
    paragraphs: [
      'If your content was removed and you believe that was a mistake or misidentification, you may send a counter-notice to our designated agent including: (1) your signature; (2) identification of the material and where it appeared before removal; (3) a statement under penalty of perjury that you have a good-faith belief the material was removed by mistake or misidentification; and (4) your name, address, and phone number, and a statement consenting to the jurisdiction of the appropriate court.',
      'If we receive a valid counter-notice, we may restore the material as permitted by law unless the original complainant files a court action.',
    ],
  },
  {
    heading: 'Repeat infringers',
    paragraphs: [
      'We may suspend or terminate accounts of users who are the subject of repeated valid takedown notices.',
    ],
  },
  {
    heading: 'Designated agent',
    paragraphs: [
      'Copyright Compliance Agent, michi-maker. Email: support@michi-maker.com (subject line DMCA). This agent is designated with the US Copyright Office; the full listing, including mailing address, appears in the Office’s public DMCA Designated Agent Directory at dmca.copyright.gov.',
    ],
  },
];

export default function DmcaScreen() {
  return (
    <PageShell title="Copyright / DMCA" description="How to file a copyright takedown on michi-maker.">
      <ThemedText type="subtitle" style={styles.h1}>
        Copyright &amp; DMCA policy
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
