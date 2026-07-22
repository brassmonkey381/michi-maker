/**
 * `/legal/terms` — Terms of Service. Finalized 2026-07-22 at billing go-live (owner-approved
 * refund/billing defaults; draft banner retired). The IP / fan-content disclaimer is folded in
 * as its own section. Contact routes through support@michi-maker.com.
 */
import { StyleSheet, View } from 'react-native';

import { PageShell } from '@/components/layout/PageShell';
import { FAN_DISCLAIMER } from '@/components/layout/SiteFooter';
import { ThemedText } from '@/components/themed-text';
import { Fonts, FontSize, Spacing } from '@/constants/theme';

const LAST_UPDATED = 'July 22, 2026';

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
      'michi-maker is a fan-made hobby tool under active development. Features may change, break, or be removed while we build. We will always try to treat your data carefully, but you should not treat michi-maker as the only copy of anything you cannot afford to lose.',
      'michi-maker is a neutral tool for content you supply. Our service is the software: arranging cards and art into binder-page layouts, engineering true-size, cut-ready print output, and exporting a file. We do not provide, license, or sell the artwork you place — you bring your own art, and any print-ready file is generated on your device from your arrangement, for you to print yourself for personal use. Paid plans pay for the software and the arrangement and print-layout engineering, never for artwork.',
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
    heading: '4. Your content and the art you add',
    paragraphs: [
      'Binders, page layouts, notes, and images you upload remain yours. By marking a binder or profile public, you give us permission to display it to other visitors (that is what public means); flip it back to private any time and it disappears from public view.',
      'You are responsible for every image and piece of art you add, whether uploaded, pasted by URL, or dragged in. By adding art you represent that you own it or have the right to use and display it on michi-maker, and that doing so does not infringe anyone’s copyright or other rights. Only add art you have explicitly sourced and are licensed or otherwise permitted to use. Do not add or copy art you do not have the right to use — attribution alone (crediting an artist or source) does not give you that right, and michi-maker does not grant you any right to third-party art.',
      'When you add art from a URL, michi-maker saves a copy to your own account and serves that copy — we host what you bring; we do not hotlink or embed images from other sites. For content you add, you grant michi-maker a non-exclusive, worldwide, royalty-free license to host, store, display, and reproduce it as needed to run the service and the features you use (including, for content you mark public, showing it to other visitors, and, for print features, generating your printable output on your device). This license ends for a given piece when you remove it, except for copies already made by others or retained as required by law.',
      'You agree to indemnify michi-maker for claims arising from art or content you added in violation of these terms.',
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
    heading: '7. Copyright and takedowns',
    paragraphs: [
      'We respond to copyright takedown requests. If you believe content on michi-maker infringes your copyright, see our Copyright / DMCA policy for how to file a notice, our counter-notice process, and our repeat-infringer policy. Any visitor can also report a public binder from its page.',
    ],
  },
  {
    heading: '8. Paid plans, billing, and refunds',
    paragraphs: [
      'michi-maker is free to start. Optional paid plans (PRO and VIP, described on the Plans page) and a one-time per-binder print unlock are available. Payments are processed by Stripe, our payment provider; michi-maker never sees or stores your card details. Prices are shown before you buy, plus any taxes where required.',
      'Subscriptions renew automatically, monthly or yearly, until you cancel. You can cancel any time from Manage billing: your plan stays active through the end of the period you already paid for, and you will not be charged again. Upgrading mid-term charges the exact upgrade price the app quotes at the moment you confirm.',
      'Because plans deliver their value immediately (higher limits, print credits, digital output), we do not refund partial billing periods, except where the law of your country requires it. The one-time binder PDF unlock is delivered digital content: once your download has been generated it cannot be refunded. If a charge went wrong or you believe you were billed in error, contact support@michi-maker.com and we will make it right.',
      'The free 14-day PRO trial requires no card and never turns into a charge on its own. When a trial or subscription ends and you are over the free limits, your extra binders are locked, not deleted: after a 3-day grace period the excess is archived, and it comes back when you subscribe again.',
    ],
  },
  {
    heading: '9. Termination',
    paragraphs: [
      'You can stop using michi-maker at any time. We may suspend or close accounts that break these terms or that we reasonably believe are harming the service or other users.',
    ],
  },
  {
    heading: '10. Disclaimers and limitation of liability',
    paragraphs: [
      'michi-maker is provided as is and as available, without warranties of any kind, express or implied, including fitness for a particular purpose and non-infringement, to the extent permitted by law.',
      'To the fullest extent permitted by law, michi-maker and its operator are not liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, data, or goodwill, arising from your use of the service. Our total liability for any claim is limited to the greater of $20 or the amount you paid us in the 12 months before the claim arose. Some jurisdictions do not allow some of these limits, so parts of this section may not apply to you.',
    ],
  },
  {
    heading: '11. Changes to these terms',
    paragraphs: [
      'We may update these terms as the product evolves. Material changes will be reflected in the date above, and continued use after a change means you accept the updated terms.',
    ],
  },
  {
    heading: '12. Contact',
    paragraphs: ['Questions about these terms: support@michi-maker.com.'],
  },
];

export default function TermsScreen() {
  return (
    <PageShell title="Terms of Service" description="michi-maker terms of service.">
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
