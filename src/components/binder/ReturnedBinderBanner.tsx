/**
 * "Your first binder is back."
 *
 * Until 56e656f (2026-10-29) a guest who pressed Continue with Google on the Sign in tab got a NEW
 * account instead of their guest account upgraded, and the binder they had just built stayed behind
 * on a uid nobody could reach. On 2026-10-30 those binders were moved onto the accounts their
 * owners created seconds later (scripts/zz-rehome-orphans.mjs), flagged `cap_exempt` so they sit
 * outside the Free binder cap, and titled "… (from your first visit)".
 *
 * A binder appearing on a shelf with no explanation reads as a glitch, so this says what happened,
 * once, to exactly the people it happened to: anyone whose shelf holds a cap-exempt binder. Opening
 * the binder or pressing Got it retires it, and the answer is kept on the profile so a second
 * device does not ask again. Renders nothing for everyone else.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { useAuth } from '@/store/auth';
import { useBinders } from '@/store/binders';

const PREF_KEY = 'returnedBinderNotice';
const SUFFIX = ' (from your first visit)';

export function ReturnedBinderBanner() {
  const router = useRouter();
  const { binders } = useBinders();
  const { profile, isGuest, updateProfile } = useAuth();
  const [closed, setClosed] = useState(false);

  const returned = useMemo(() => binders.filter((b) => b.capExempt && !b.isExample), [binders]);
  const bag = profile?.preferences as Record<string, unknown> | null | undefined;
  const seen = !!(bag && typeof bag[PREF_KEY] === 'object' && bag[PREF_KEY] && (bag[PREF_KEY] as { at?: unknown }).at);
  const show = returned.length > 0 && !seen && !closed && !isGuest;

  const shown = useRef(false);
  useEffect(() => {
    if (show && !shown.current) {
      shown.current = true;
      track('returned_binder.shown', { binders: returned.length });
    }
  }, [show, returned.length]);

  const retire = useCallback(
    (how: 'open' | 'dismiss') => {
      setClosed(true);
      track(`returned_binder.${how}`, { binders: returned.length });
      void updateProfile({ preferences: { ...(bag ?? {}), [PREF_KEY]: { at: new Date().toISOString(), how } } }).catch(() => {});
    },
    [bag, returned.length, updateProfile],
  );

  if (!show) return null;

  const first = returned[0];
  const name = first.title.endsWith(SUFFIX) ? first.title.slice(0, -SUFFIX.length) : first.title;
  const many = returned.length > 1;
  const cards = returned.reduce((n, b) => n + b.pages.reduce((m, p) => m + p.slots.length, 0), 0);

  return (
    <View style={styles.banner} accessibilityRole="summary">
      <View style={styles.stripe} />
      <View style={styles.body}>
        <ThemedText type="small" style={styles.eyebrow}>
          WELCOME BACK
        </ThemedText>
        <ThemedText type="subtitle" style={styles.title}>
          {many ? 'Your first binders are back' : 'Your first binder is back'}
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.text}>
          {many
            ? `You started ${returned.length} binders before you had an account, and they were left behind when you signed up. `
            : `You started “${name}” before you had an account, and it was left behind when you signed up. `}
          {cards > 0 ? `All ${cards} cards are here. ` : ''}
          {many ? 'They are on your shelf again, and they do not count toward your binder limit.' : 'It is on your shelf again, and it does not count toward your binder limit.'}
        </ThemedText>
        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              retire('open');
              router.push({ pathname: '/binder/[id]', params: { id: first.id } });
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={styles.primaryText}>
              {many ? 'Open the first one' : 'Open it'}
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => retire('dismiss')} accessibilityRole="button" hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Got it
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    marginBottom: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.accentSoft,
    overflow: 'hidden',
  },
  stripe: { width: 6, backgroundColor: Palette.accent },
  body: { flex: 1, padding: Spacing.four, gap: Spacing.two },
  eyebrow: { color: Palette.accent, letterSpacing: 1.2, fontSize: FontSize.xs },
  title: { marginTop: -2 },
  text: { lineHeight: 21, maxWidth: 560 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four, marginTop: Spacing.two, flexWrap: 'wrap' },
  primary: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    backgroundColor: Palette.accent,
  },
  primaryText: { color: Palette.accentText, fontSize: FontSize.control },
  pressed: { opacity: 0.7 },
});
