/**
 * `/feedback` — the one place anybody, signed in or not, can say what is working, what is not,
 * and what they want built. Reached from the rail under My Purchases and from the site footer.
 *
 * A ROUTE, NOT A MODAL, deliberately. The rail is web-only and hides itself below 900px, so a
 * modal hung off a rail item would be invisible to every phone visitor and to anyone inside the
 * binder editor. A route works on all three targets, survives a refresh, and can be linked to
 * from an email or a post.
 *
 * WHAT THIS FILE OWNS: getting a session, gathering what the app already knows, submitting, and
 * the thank-you. The questions live in data/surveys/michiFeedback.ts and the drawing lives in
 * components/survey. Swapping in another survey is a one-line change here.
 */
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { PageShell } from '@/components/layout/PageShell';
import { AuthSheet } from '@/components/auth/AuthSheet';
import { SurveyForm } from '@/components/survey/SurveyForm';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, MaxContentWidth, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { toPayload } from '@/data/survey/surveyState';
import { submitSurvey } from '@/data/survey/surveyRepo';
import type { AnswerMap } from '@/data/survey/surveyTypes';
import { MICHI_FEEDBACK } from '@/data/surveys/michiFeedback';
import { track } from '@/lib/analytics';
import { useTier } from '@/hooks/use-tier';
import { useAuth } from '@/store/auth';
import { useBinders } from '@/store/binders';

/** Where an unsent draft waits. Per browser, cleared on send. */
const DRAFT_KEY = 'michi.feedback.draft.v1';

export default function FeedbackScreen() {
  const router = useRouter();
  const auth = useAuth();
  const { tier, loading: tierLoading } = useTier();
  const store = useBinders();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [minted, setMinted] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  // The account's own address, so a signed-in visitor does not type what we already have. A guest
  // has none and gets an empty box.
  const prefill = useMemo<AnswerMap>(() => {
    const email = auth.user?.email;
    const out: AnswerMap = {};
    if (email) out.email = email;
    return out;
  }, [auth.user?.email]);

  const onSubmit = async (answers: AnswerMap) => {
    // Nothing goes out before the auth bootstrap has settled. Submitting into that window is how
    // this project lost a real trial.start event: the identity was not attached yet, so the write
    // went out as nobody and the row's own context described the wrong person.
    if (!auth.ready) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitSurvey({
        def: MICHI_FEEDBACK,
        answers,
        context: {
          // A tier read while it is still loading reports 'guest' for a real subscriber, which is
          // a bug this project has already shipped once. Record nothing rather than a wrong thing.
          tier: tierLoading ? null : tier,
          platform: Platform.OS,
          // The account's OWN binders. store.binders also carries the examples and the demo, so
          // the raw length says "3 binders" about somebody who has never made one.
          binders: store.loading ? null : store.binderCount,
        },
        hasSession: !!auth.user,
        continueAsGuest: auth.continueAsGuest,
      });
      if (result.ok) {
        try {
          globalThis.localStorage?.removeItem(DRAFT_KEY);
        } catch {
          /* the draft is a convenience */
        }
        // Counts only. The prose stays in its own table: analytics props are contractually
        // ids-and-numbers, and feedback text is the one thing that must never leak into them.
        // Counted from what was actually SENT, not from the working map: the working map holds
        // hidden follow-ups, a prefilled address nobody typed, and blank strings, so counting it
        // would report a fuller survey than the one that landed.
        const sent = toPayload(MICHI_FEEDBACK, answers);
        track('feedback.submitted', {
          survey: MICHI_FEEDBACK.id,
          version: MICHI_FEEDBACK.version,
          answered: Object.keys(sent).length,
          has_score: typeof sent.nps === 'number',
          has_text: ['one_thing', 'broken', 'want_other'].some((k) => typeof sent[k] === 'string'),
        });
        setMinted(result.mintedSession);
        setDone(true);
        return;
      }
      if (result.reason === 'no-session') setAuthOpen(true);
      setError(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not send. Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell
      title="Leave Feedback"
      description="Tell us what is working in michi-maker, what is not, and which card games and features you want next. Two minutes, no account needed.">
      <View style={styles.prose}>
        {done ? (
          <ThanksPanel
            title={MICHI_FEEDBACK.thanks.title}
            body={
              minted
                ? `${MICHI_FEEDBACK.thanks.body} Sending needed a session, so this browser now has a guest one. You can sign out again from the account menu.`
                : MICHI_FEEDBACK.thanks.body
            }
            onHome={() => router.push('/my-binders' as Href)}
            onAgain={() => {
              setDone(false);
              setError(null);
            }}
          />
        ) : (
          <>
            {/* THE MASTHEAD: chip, headline, lede, in the format the plans page uses, so a
                second full-width page does not invent a third way of opening. */}
            <View style={styles.masthead}>
              <ThemedText style={styles.chip}>michi-maker feedback</ThemedText>
              <ThemedText type="subtitle" style={styles.h1}>
                {MICHI_FEEDBACK.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
                {MICHI_FEEDBACK.lede}
              </ThemedText>
            </View>
            {auth.anonymousUnavailable && !auth.user ? (
              <ThemedText type="small" style={styles.notice}>
                Sending needs a session and this browser could not start one. Signing in will fix it.
              </ThemedText>
            ) : null}
            <SurveyForm
              def={MICHI_FEEDBACK}
              prefill={prefill}
              submitting={submitting || !auth.ready}
              error={error}
              onSubmit={onSubmit}
              draftKey={DRAFT_KEY}
            />
            {/* Above the site footer, under a rule: it is the small print for the form, and it
                should read as that rather than as one more thing to fill in. */}
            <View style={styles.footNote}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.foot}>
                We store your answers, and your email only if you give one. Nothing here is added
                to a mailing list, and deleting your account removes the address. See the{' '}
                <ThemedText type="linkPrimary" onPress={() => router.push('/legal/privacy')}>
                  privacy policy
                </ThemedText>{' '}
                for what happens to it.
              </ThemedText>
            </View>
          </>
        )}
      </View>
      <AuthSheet visible={authOpen} onClose={() => setAuthOpen(false)} />
    </PageShell>
  );
}

/** What happens after. Never a dead end: one onward step, and a way back in to add more. */
function ThanksPanel({
  title,
  body,
  onHome,
  onAgain,
}: {
  title: string;
  body: string;
  onHome: () => void;
  onAgain: () => void;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.thanks} testID="feedback-thanks">
      <ThemedText type="subtitle" style={styles.h1}>
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
        {body}
      </ThemedText>
      <View style={styles.thanksRow}>
        <Pressable
          onPress={onHome}
          accessibilityRole="button"
          testID="feedback-home"
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <ThemedText style={styles.primaryText}>Back to my binders</ThemedText>
        </Pressable>
        <Pressable
          onPress={onAgain}
          accessibilityRole="button"
          testID="feedback-again"
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <ThemedText style={styles.secondaryText}>Say something else</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  prose: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.four },
  masthead: { gap: Spacing.two, marginBottom: Spacing.one },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: Palette.panel,
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 11,
    fontSize: FontSize.sm,
    fontWeight: Weight.semibold,
    color: Palette.ink2,
  },
  h1: { fontSize: FontSize.title, lineHeight: 30 },
  lede: { lineHeight: 21, maxWidth: 620 },
  notice: { color: Palette.warning, lineHeight: 18 },
  footNote: { borderTopWidth: 1, borderTopColor: Palette.hairline, paddingTop: Spacing.three },
  foot: { lineHeight: 18, maxWidth: 620 },
  thanks: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.accent,
    padding: Spacing.five,
    gap: Spacing.three,
  },
  thanksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  pressed: { opacity: 0.7 },
  primary: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: 10,
    paddingHorizontal: Spacing.four,
  },
  primaryText: { color: Palette.accentText, fontWeight: Weight.semibold, fontSize: FontSize.body },
  secondary: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.pill,
    paddingVertical: 10,
    paddingHorizontal: Spacing.four,
  },
  secondaryText: { color: Palette.ink2, fontWeight: Weight.semibold, fontSize: FontSize.body },
});
