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
 *
 * The button's destination differs by tier and comes from `limitCta`: paid-capable accounts get
 * the plans page, guests get the auth sheet. The sheet is owned HERE rather than by each caller,
 * and deliberately outlives the toast — the toast is dismissed the moment the button is pressed,
 * so a sheet mounted inside the `spec` branch would unmount with it and never open.
 */

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { AuthSheet } from '@/components/auth/AuthSheet';
import { TopLayer } from '@/components/binder/TopLayer';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import type { LimitCta } from '@/data/limitMessages';

export interface ToastSpec {
  /** Bumped on every show so repeated identical messages still re-trigger. */
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** 'limit' = the prominent card described above. Anything else is the quiet pill. */
  tone?: 'default' | 'limit';
  cta?: LimitCta;
  /**
   * A word INSIDE the message that goes somewhere — the binder a card just landed in. The thing
   * the message names is the thing you want to reach, so it is the thing you press; a separate
   * "Open" button makes you read the name and then aim somewhere else for it.
   *
   * `text` must appear in `message` verbatim; if it does not, the message renders plainly and
   * nothing is lost.
   */
  link?: { text: string; onPress: () => void };
}

// 3.5s was not long enough to notice a confirmation, read the binder's name in it, and decide
// whether to follow it — and now that the name is a target, the toast has to outlive the reading.
const DISMISS_MS = { default: 5000, limit: 9000 } as const;
const PLANS: Href = '/plans';

export function Toast({ spec, onDismiss }: { spec: ToastSpec | null; onDismiss: () => void }) {
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);
  const id = spec?.id;
  const tone = spec?.tone ?? 'default';

  useEffect(() => {
    if (id == null) return;
    const handle = setTimeout(onDismiss, DISMISS_MS[tone]);
    return () => clearTimeout(handle);
  }, [id, tone, onDismiss]);

  const runCta = (cta: LimitCta) => {
    onDismiss();
    if (cta.kind === 'plans') router.push(PLANS);
    else setAuthOpen(true);
  };

  return (
    <>
      {/* ON A LAYER ABOVE EVERY MODAL. A cap message explains why the thing you just tried did
          not happen, so it must not be the thing that gets covered — and it was: the multi-select
          sheet, the confirm dialog and the docked picker are all modals, which react-native-web
          portals out of the app entirely, over anything still inside it (see TopLayer). The
          AuthSheet below stays put; it is a modal itself and belongs on the app's own layer. */}
      {spec && tone === 'limit' ? (
        <TopLayer>
          <View pointerEvents="box-none" style={styles.wrap}>
            <View style={styles.card}>
              {/* The dismiss sits OUTSIDE the flow rather than beside the message: in a row it
                  stole width from one side only, so a centred message was centred against the
                  text's box and visibly off-centre in the card. */}
              <Pressable
                onPress={onDismiss}
                hitSlop={10}
                accessibilityLabel="Dismiss"
                style={styles.close}>
                <ThemedText type="small" style={styles.closeGlyph}>
                  ✕
                </ThemedText>
              </Pressable>
              <ThemedText type="default" style={styles.cardMessage} numberOfLines={3}>
                {spec.message}
              </ThemedText>
              {spec.cta ? (
                <Pressable
                  onPress={() => runCta(spec.cta!)}
                  style={({ pressed }) => [styles.ctaBtn, pressed && styles.dim]}>
                  <ThemedText type="smallBold" style={styles.ctaText}>
                    {spec.cta.label}
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          </View>
        </TopLayer>
      ) : null}

      {spec && tone !== 'limit' ? (
        <TopLayer>
          <View pointerEvents="box-none" style={styles.wrap}>
            <View style={styles.toast}>
              {/* Three lines, not two: the catalogue-art notes ride the END of already-long
                  messages (binder titles are uncapped), and a two-line clamp ate exactly the new
                  information on narrow screens. */}
              <ThemedText type="small" style={styles.message} numberOfLines={3}>
                {/* Split around the linked word so the rest of the sentence stays plain text — one
                    Text, so it wraps as a sentence rather than as three boxes in a row. */}
                {(() => {
                  const link = spec.link;
                  const at = link ? spec.message.indexOf(link.text) : -1;
                  if (!link || at < 0) return spec.message;
                  return (
                    <>
                      {spec.message.slice(0, at)}
                      <ThemedText
                        type="smallBold"
                        style={styles.link}
                        accessibilityRole="link"
                        onPress={() => {
                          link.onPress();
                          onDismiss();
                        }}>
                        {link.text}
                      </ThemedText>
                      {spec.message.slice(at + link.text.length)}
                    </>
                  );
                })()}
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
        </TopLayer>
      ) : null}

      {/* Mounted only while open: the toast that launched it is already gone by then, and an
          always-mounted Modal in every screen that renders a Toast earns nothing. */}
      {authOpen ? <AuthSheet visible onClose={() => setAuthOpen(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  link: { color: Palette.accent, textDecorationLine: 'underline' },
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
    justifyContent: 'center',
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
  message: { color: Palette.white, flexShrink: 1, textAlign: 'center' },
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
  cardMessage: {
    color: Palette.white,
    lineHeight: 21,
    fontWeight: Weight.semibold,
    textAlign: 'center',
    // Clear of the pinned dismiss, on BOTH sides, so the centre line stays the card's centre.
    paddingHorizontal: Spacing.four,
  },
  close: { position: 'absolute', top: Spacing.two, right: Spacing.three, zIndex: 1 },
  closeGlyph: { color: Palette.white, opacity: 0.7 },
  ctaBtn: {
    alignSelf: 'center',
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
