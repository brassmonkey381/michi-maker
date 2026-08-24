/**
 * A lightweight auto-dismissing toast for the binder editor: brief confirmation of an action,
 * with an optional inline action (e.g. "Undo"). Re-arms its dismiss timer whenever the message
 * changes (keyed by the caller). Positioned by the parent.
 *
 * TWO TONES. The default is the quiet pill: an action succeeded, here is a word about it. The
 * `limit` tone is for a cap the user just hit, which is a different kind of message — it is the
 * only thing standing between them and the thing they were trying to do, and it carries a route
 * out. That one renders as a card rather than a pill, states the limit on its own line, offers a
 * real button instead of a bare word, and lives long enough to read and press (a 3.5s pill is not
 * long enough to notice, parse and hit a target). It also gets an explicit dismiss, because
 * anything that lingers needs a way to go away.
 */

import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

/** Where a limit toast sends the user. Guests are never given one: their next step is a free
 *  account, not a price table, and that is an AuthSheet rather than a route. */
export interface ToastCta {
  label: string;
  href: Href;
}

export interface ToastSpec {
  /** Bumped on every show so repeated identical messages still re-trigger. */
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** 'limit' = the prominent card described above. Anything else is the quiet pill. */
  tone?: 'default' | 'limit';
  cta?: ToastCta;
}

const DISMISS_MS = { default: 3500, limit: 9000 } as const;

export function Toast({ spec, onDismiss }: { spec: ToastSpec | null; onDismiss: () => void }) {
  const router = useRouter();
  const id = spec?.id;
  const tone = spec?.tone ?? 'default';
  useEffect(() => {
    if (id == null) return;
    const handle = setTimeout(onDismiss, DISMISS_MS[tone]);
    return () => clearTimeout(handle);
  }, [id, tone, onDismiss]);

  if (!spec) return null;

  if (tone === 'limit') {
    return (
      <View pointerEvents="box-none" style={styles.wrap}>
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <ThemedText type="default" style={styles.cardMessage} numberOfLines={3}>
              {spec.message}
            </ThemedText>
            <Pressable onPress={onDismiss} hitSlop={10} accessibilityLabel="Dismiss">
              <ThemedText type="small" style={styles.close}>
                ✕
              </ThemedText>
            </Pressable>
          </View>
          {spec.cta ? (
            <Pressable
              onPress={() => {
                const { href } = spec.cta!;
                onDismiss();
                router.push(href);
              }}
              style={({ pressed }) => [styles.ctaBtn, pressed && styles.dim]}>
              <ThemedText type="smallBold" style={styles.ctaText}>
                {spec.cta.label}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={styles.toast}>
        <ThemedText type="small" style={styles.message} numberOfLines={2}>
          {spec.message}
        </ThemedText>
        {spec.actionLabel && spec.onAction ? (
          <Pressable
            onPress={() => {
              spec.onAction?.();
              onDismiss();
            }}
            hitSlop={8}>
            <ThemedText type="smallBold" style={styles.action}>
              {spec.actionLabel}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 28,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    maxWidth: 420,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: Radius.pill,
    backgroundColor: Palette.toast,
    shadowColor: Palette.black,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  message: { color: Palette.white, flexShrink: 1 },
  action: { color: Palette.accentSoft },

  // --- the `limit` tone ---------------------------------------------------------------------
  card: {
    gap: Spacing.two,
    width: '92%',
    maxWidth: 460,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.accent,
    backgroundColor: Palette.toast,
    shadowColor: Palette.black,
    shadowOpacity: 0.34,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  cardMessage: {
    color: Palette.white,
    flexShrink: 1,
    lineHeight: 21,
    fontWeight: Weight.semibold,
  },
  close: { color: Palette.white, opacity: 0.7 },
  ctaBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: Palette.accentText, fontSize: FontSize.md, fontWeight: Weight.semibold },
  dim: { opacity: 0.6 },
});
