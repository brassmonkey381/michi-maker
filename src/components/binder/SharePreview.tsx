/**
 * THE SHARE SHEET'S PICTURE CONTROLS (owner, 2026-09-15): a backdrop of the owner's choosing
 * behind the share image, and a quick look at the image itself.
 *
 * The backdrop is a hotlinked address kept on the binder (binders.share_backdrop); the share
 * image draws it edge to edge in place of the blurred page art. It is a share setting, not a page
 * setting, so it lives here and nowhere in the editor.
 *
 * The quick look is the same composition at 1x (api/og-image-quick.js), a few seconds to draw,
 * so nobody has to wait for the preview to warm or the poster to render to find out a backdrop
 * is not what they expected.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ImageLinkField, PillButton } from '@/components/binder/inspector/controls';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import type { DemoBinder } from '@/data/binderTypes';
import { binderQuickPreviewUrl } from '@/lib/appUrl';
import { useBinders } from '@/store/binders';

export function ShareBackdropField({ binder }: { binder: DemoBinder }) {
  const store = useBinders();
  const [open, setOpen] = useState(!!binder.shareBackdrop);
  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <ThemedText type="smallBold">Picture behind the share image</ThemedText>
        {binder.shareBackdrop ? (
          <PillButton label="Remove" onPress={() => store.updateBinder(binder.id, { shareBackdrop: null })} testID="share-backdrop-remove" />
        ) : (
          <PillButton label={open ? 'Cancel' : 'Add a picture'} onPress={() => setOpen((v) => !v)} testID="share-backdrop-add" />
        )}
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        Shown edge to edge behind the page in link previews and the full-size download, in place of the blurred page art. It never prints.
      </ThemedText>
      {open || binder.shareBackdrop ? (
        <ImageLinkField
          value={binder.shareBackdrop ?? undefined}
          onChange={(shareBackdrop) => store.updateBinder(binder.id, { shareBackdrop })}
          testID="share-backdrop-link"
        />
      ) : null}
    </View>
  );
}

export function QuickPreviewButton({ binder }: { binder: DemoBinder }) {
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'failed'>('idle');
  const { width, height } = useWindowDimensions();
  const look = () => {
    setSrc(binderQuickPreviewUrl(binder.id, binder.updatedAt));
    setState('loading');
  };
  return (
    <>
      <PillButton label="Quick look at the share image" onPress={look} testID="share-quick-look" />
      {src ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSrc(null)}>
          <Pressable style={styles.backdrop} onPress={() => setSrc(null)} accessibilityLabel="Close the preview">
            <View style={[styles.frame, { width: Math.min(width - 32, 1100), height: Math.min(height - 120, ((Math.min(width - 32, 1100)) * 1512) / 2568 + 48) }]}>
              {state === 'loading' ? (
                <View style={styles.center}>
                  <ActivityIndicator color={Palette.accent} />
                  <ThemedText type="small" themeColor="textSecondary">Drawing a quick version, a few seconds…</ThemedText>
                </View>
              ) : null}
              {state === 'failed' ? (
                <View style={styles.center}>
                  <ThemedText type="small" themeColor="textSecondary">That did not draw. The binder has to be public, and the picture link has to load.</ThemedText>
                </View>
              ) : null}
              <Image
                source={{ uri: src }}
                style={[styles.img, state !== 'ok' && styles.hidden]}
                contentFit="contain"
                cachePolicy="none"
                onLoad={() => setState('ok')}
                onError={() => setState('failed')}
              />
              <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
                A low-resolution look. Links and the download use the full version.
              </ThemedText>
            </View>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two, marginTop: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  hint: { lineHeight: 18 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  frame: { backgroundColor: Palette.surface, borderRadius: Radius.panel, padding: 12, gap: 8, alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  img: { width: '100%', flex: 1 },
  hidden: { opacity: 0 },
  caption: { textAlign: 'center' },
});
