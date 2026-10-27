/**
 * `/wishlist`: what should we build next (owner, 2026-10-27). Premade ideas as one-click votes,
 * everyone's counts on each, and a free-text box for anything not on the list. Reached from the
 * rail directly above Leave Feedback and from the site footer.
 *
 * TWO STORES, ON PURPOSE. A click is a row in feature_votes (toggle: a second click deletes it)
 * through data/featureVotesRepo; the text is a survey response in feedback_responses through the
 * same pipeline as /feedback (data/surveys/michiWishlist), so wishes are read next to feedback.
 *
 * CLICKS ARE OPTIMISTIC. The page flips the chip and the count at once and writes behind; a write
 * that fails flips it back and says why. The first click of a visitor with no session mints a
 * guest one first, as /feedback does, and the page tells them.
 */
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AuthSheet } from '@/components/auth/AuthSheet';
import { PageShell } from '@/components/layout/PageShell';
import { SurveyForm } from '@/components/survey/SurveyForm';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, MaxContentWidth, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { FEATURE_IDEAS, VOTE_CAP, applyToggle, rankedIdeas, type VoteState } from '@/data/featureIdeas';
import { loadVotes, writeVote } from '@/data/featureVotesRepo';
import { submitSurvey } from '@/data/survey/surveyRepo';
import { toPayload } from '@/data/survey/surveyState';
import type { AnswerMap } from '@/data/survey/surveyTypes';
import { MICHI_WISHLIST } from '@/data/surveys/michiWishlist';
import { useTier } from '@/hooks/use-tier';
import { track } from '@/lib/analytics';
import { useAuth } from '@/store/auth';
import { useBinders } from '@/store/binders';

const DRAFT_KEY = 'michi.wishlist.draft.v1';

export default function WishlistScreen() {
  const router = useRouter();
  const auth = useAuth();
  const { tier, loading: tierLoading } = useTier();
  const store = useBinders();

  const announced = useRef(false);
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    track('wishlist.shown', { ideas: FEATURE_IDEAS.length });
  }, []);

  // THE VOTES. Loaded once the auth bootstrap has settled, so "mine" is read as the right person.
  const [votes, setVotes] = useState<VoteState | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [minted, setMinted] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const userId = auth.user?.id ?? null;
  useEffect(() => {
    if (!auth.ready) return;
    let active = true;
    loadVotes(!!userId)
      .then((v) => active && setVotes(v))
      .catch((e: unknown) => active && setVoteError(e instanceof Error ? e.message : 'The votes did not load.'));
    return () => {
      active = false;
    };
  }, [auth.ready, userId]);

  const busy = useRef(new Set<string>());
  const vote = async (id: string) => {
    if (!votes || !auth.ready || busy.current.has(id)) return;
    const next = applyToggle(votes, id);
    if (next.on && next.mine.size > VOTE_CAP) {
      setVoteError(`Up to ${VOTE_CAP} votes per account. Take one back to cast another.`);
      return;
    }
    busy.current.add(id);
    setVoteError(null);
    const before = votes;
    setVotes(next);
    try {
      if (!auth.user) {
        const r = await auth.continueAsGuest();
        if (r.error) {
          setVotes(before);
          setAuthOpen(true);
          return;
        }
        setMinted(true);
      }
      const out = await writeVote(id, next.on);
      if (!out.ok) {
        setVotes(before);
        setVoteError(out.message);
        track('wishlist.vote_failed', { feature: id, reason: out.reason });
        return;
      }
      track('wishlist.vote', { feature: id, on: next.on });
    } catch (e) {
      setVotes(before);
      setVoteError(e instanceof Error ? e.message : 'That vote did not land. Try again in a moment.');
    } finally {
      busy.current.delete(id);
    }
  };

  // THE WORDS. The same send path as /feedback, with this page's own survey.
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const prefill: AnswerMap = auth.user?.email ? { email: auth.user.email } : {};
  const onSubmit = async (answers: AnswerMap) => {
    if (!auth.ready) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitSurvey({
        def: MICHI_WISHLIST,
        answers,
        context: { tier: tierLoading ? null : tier, platform: Platform.OS, binders: store.loading ? null : store.binderCount, votes: votes ? [...votes.mine] : null },
        hasSession: !!auth.user,
        continueAsGuest: auth.continueAsGuest,
      });
      if (result.ok) {
        try {
          globalThis.localStorage?.removeItem(DRAFT_KEY);
        } catch {
          /* the draft is a convenience */
        }
        const sent = toPayload(MICHI_WISHLIST, answers);
        track('wishlist.submitted', { has_text: typeof sent.idea === 'string', votes: votes?.mine.size ?? 0 });
        if (result.mintedSession) setMinted(true);
        setDone(true);
        return;
      }
      track('wishlist.submit_failed', { reason: result.reason });
      if (result.reason === 'no-session') setAuthOpen(true);
      setError(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not send. Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  const ranked = rankedIdeas(votes?.counts ?? new Map());
  return (
    <PageShell
      title="What's Next"
      description="Vote on the features michi-maker builds next, one tap each, and tell us about anything not on the list.">
      <View style={styles.prose}>
        <View style={styles.masthead}>
          <ThemedText style={styles.chip}>what we build next</ThemedText>
          <ThemedText type="subtitle" style={styles.h1}>
            {MICHI_WISHLIST.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
            {MICHI_WISHLIST.lede}
          </ThemedText>
        </View>

        {/* THE BALLOT: one tap per idea. Most voted first, so the page is also the answer. */}
        <View style={styles.grid} testID="wishlist-ideas">
          {ranked.map((idea) => {
            const on = votes?.mine.has(idea.id) ?? false;
            const n = votes?.counts.get(idea.id) ?? 0;
            return (
              <Pressable
                key={idea.id}
                onPress={() => vote(idea.id)}
                disabled={!votes}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: !votes }}
                accessibilityLabel={`${idea.label}. ${idea.blurb} ${n} vote${n === 1 ? '' : 's'}.`}
                testID={`wishlist-idea-${idea.id}`}
                style={({ pressed }) => [styles.card, on && styles.cardOn, !votes && styles.cardOff, pressed && styles.pressed]}>
                <View style={styles.cardHead}>
                  <ThemedText type="smallBold" style={[styles.cardLabel, on && styles.cardLabelOn]}>
                    {on ? '✓ ' : ''}
                    {idea.label}
                  </ThemedText>
                  <ThemedText style={[styles.count, on && styles.countOn]}>{votes ? String(n) : '…'}</ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.blurb}>
                  {idea.blurb}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
        {voteError ? (
          <ThemedText type="small" style={styles.notice} testID="wishlist-vote-error">
            {voteError}
          </ThemedText>
        ) : minted ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
            Voting needed a session, so this browser now has a guest one. Sign in to keep your votes on another device.
          </ThemedText>
        ) : null}

        {/* THE BOX. */}
        <View style={styles.boxHead}>
          <ThemedText type="subtitle" style={styles.h2}>
            Not on the list?
          </ThemedText>
        </View>
        {done ? (
          <ThemedView type="backgroundElement" style={styles.thanks} testID="wishlist-thanks">
            <ThemedText type="subtitle" style={styles.h2}>
              {MICHI_WISHLIST.thanks.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
              {MICHI_WISHLIST.thanks.body}
            </ThemedText>
            <View style={styles.row}>
              <Pressable onPress={() => router.push('/my-binders' as Href)} accessibilityRole="button" style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                <ThemedText style={styles.primaryText}>Back to my binders</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => {
                  setDone(false);
                  setError(null);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                <ThemedText style={styles.secondaryText}>Add another idea</ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        ) : (
          <SurveyForm def={MICHI_WISHLIST} prefill={prefill} submitting={submitting || !auth.ready} error={error} onSubmit={onSubmit} draftKey={DRAFT_KEY} />
        )}

        <View style={styles.footNote}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.foot}>
            A vote is a wish, not a promise, and the counts steer what gets built. Votes are kept
            against your account and go when it does. Your email is kept only if you tick the box.
            See the{' '}
            <ThemedText type="linkPrimary" onPress={() => router.push('/legal/privacy')}>
              privacy policy
            </ThemedText>
            .
          </ThemedText>
        </View>
      </View>
      <AuthSheet visible={authOpen} onClose={() => setAuthOpen(false)} />
    </PageShell>
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
  h2: { fontSize: FontSize.lg, lineHeight: 26 },
  lede: { lineHeight: 21, maxWidth: 620 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  card: {
    flexGrow: 1,
    flexBasis: 260,
    maxWidth: 420,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: 4,
  },
  cardOn: { borderColor: Palette.accent, backgroundColor: Palette.panel },
  cardOff: { opacity: 0.6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  cardLabel: { flexShrink: 1, fontSize: FontSize.body },
  cardLabelOn: { color: Palette.accent },
  count: {
    minWidth: 28,
    textAlign: 'center',
    borderRadius: Radius.pill,
    backgroundColor: Palette.hairline,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: FontSize.sm,
    fontWeight: Weight.semibold,
    fontVariant: ['tabular-nums'],
  },
  countOn: { backgroundColor: Palette.accent, color: Palette.accentText },
  blurb: { lineHeight: 18 },
  notice: { color: Palette.warning, lineHeight: 18 },
  boxHead: { borderTopWidth: 1, borderTopColor: Palette.hairline, paddingTop: Spacing.four },
  footNote: { borderTopWidth: 1, borderTopColor: Palette.hairline, paddingTop: Spacing.three },
  foot: { lineHeight: 18, maxWidth: 620 },
  thanks: { borderRadius: Radius.lg, borderWidth: 1, borderColor: Palette.accent, padding: Spacing.five, gap: Spacing.three },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  pressed: { opacity: 0.7 },
  primary: { backgroundColor: Palette.accent, borderRadius: Radius.pill, paddingVertical: 10, paddingHorizontal: Spacing.four },
  primaryText: { color: Palette.accentText, fontWeight: Weight.semibold, fontSize: FontSize.body },
  secondary: { borderWidth: 1, borderColor: Palette.hairlineStrong, borderRadius: Radius.pill, paddingVertical: 10, paddingHorizontal: Spacing.four },
  secondaryText: { color: Palette.ink2, fontWeight: Weight.semibold, fontSize: FontSize.body },
});
