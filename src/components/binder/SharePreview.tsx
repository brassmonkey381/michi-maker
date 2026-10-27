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

import { ImageLinkField, PillButton, Seg } from '@/components/binder/inspector/controls';
import { PresetPictureGrid } from '@/components/binder/PresetPictureGrid';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing } from '@/constants/theme';
import type { DemoBinder } from '@/data/binderTypes';
import { DEFAULT_SHARE_IMAGE, SHARE_ART_VIEWS, SHARE_IMAGE_STYLES, binderQuickPreviewUrl, downloadBinderHiresImage, type ShareImageOptions } from '@/lib/appUrl';
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
        <>
          {/* Twenty themes to tap (owner, 2026-10-13), then the link field for a picture of your own. */}
          <PresetPictureGrid
            kind="theme"
            value={binder.shareBackdrop}
            onPick={(shareBackdrop) => store.updateBinder(binder.id, { shareBackdrop })}
            testID="share-backdrop-presets"
          />
          <ImageLinkField
            value={binder.shareBackdrop ?? undefined}
            onChange={(shareBackdrop) => store.updateBinder(binder.id, { shareBackdrop })}
            testID="share-backdrop-link"
          />
        </>
      ) : null}
    </View>
  );
}

export function QuickPreviewButton({ binder, options = DEFAULT_SHARE_IMAGE, label = 'Quick look at the share image' }: { binder: DemoBinder; options?: ShareImageOptions; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PillButton label={label} onPress={() => setOpen(true)} testID="share-quick-look" />
      {open ? <QuickPreviewModal binder={binder} options={options} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * THE EXTRA STEP (owner, 2026-10-27: the share preview and full-size hotkeys "need an extra step
 * (clean, soft, with art view, etc)"). Q and F open this first: the picture's style and which
 * cards it draws, then the quick look or the download. `intent` puts the key's own action first.
 */
export function SharePictureChooser({
  intent,
  onClose,
  onQuick,
  onDownload,
}: {
  intent: 'quick' | 'download';
  onClose: () => void;
  onQuick: (opts: ShareImageOptions) => void;
  onDownload: (opts: ShareImageOptions) => void;
}) {
  const [opts, setOpts] = useState<ShareImageOptions>(DEFAULT_SHARE_IMAGE);
  const styleBlurb = SHARE_IMAGE_STYLES.find((s) => s.id === opts.style)?.blurb;
  const viewBlurb = SHARE_ART_VIEWS.find((v) => v.id === opts.artView)?.blurb;
  const quick = (
    <Pressable
      key="quick"
      onPress={() => onQuick(opts)}
      accessibilityRole="button"
      testID="picture-step-quick"
      style={({ pressed }) => [intent === 'quick' ? styles.dlBtn : styles.altBtn, pressed && styles.dim]}>
      <ThemedText type="smallBold" style={intent === 'quick' ? styles.dlText : undefined}>Quick look</ThemedText>
    </Pressable>
  );
  const download = (
    <Pressable
      key="download"
      onPress={() => onDownload(opts)}
      accessibilityRole="button"
      testID="picture-step-download"
      style={({ pressed }) => [intent === 'download' ? styles.dlBtn : styles.altBtn, pressed && styles.dim]}>
      <ThemedText type="smallBold" style={intent === 'download' ? styles.dlText : undefined}>Download full-size image</ThemedText>
    </Pressable>
  );
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" testID="picture-step">
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <ThemedText type="smallBold">The share picture</ThemedText>
          <View style={styles.block}>
            <ThemedText type="small" themeColor="textSecondary">Style</ThemedText>
            <Seg options={SHARE_IMAGE_STYLES} value={opts.style} onChange={(style) => setOpts((o) => ({ ...o, style }))} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>{styleBlurb}</ThemedText>
          </View>
          <View style={styles.block}>
            <ThemedText type="small" themeColor="textSecondary">Cards</ThemedText>
            <Seg options={SHARE_ART_VIEWS} value={opts.artView} onChange={(artView) => setOpts((o) => ({ ...o, artView }))} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>{viewBlurb}</ThemedText>
          </View>
          <View style={styles.row}>{intent === 'quick' ? [quick, download] : [download, quick]}</View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
            The quick look takes a few seconds; the download about half a minute. Esc closes.
          </ThemedText>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** The quick share image in a modal: the Share sheet's button opens it, and so does Q (owner, 2026-09-16). */
export function QuickPreviewModal({ binder, options = DEFAULT_SHARE_IMAGE, onClose }: { binder: DemoBinder; options?: ShareImageOptions; onClose: () => void }) {
  const [src] = useState(() => binderQuickPreviewUrl(binder.id, binder.updatedAt, options));
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading');
  // THE DOWNLOAD FROM THE PREVIEW (owner, 2026-10-26): what you are looking at is what the
  // full-size file will be, so the button to get it belongs right here, in the same style.
  const [hires, setHires] = useState<'idle' | 'busy' | 'failed'>('idle');
  const downloadHires = async () => {
    if (hires === 'busy') return;
    setHires('busy');
    try {
      await downloadBinderHiresImage(binder.id, binder.updatedAt, options);
      setHires('idle');
    } catch {
      setHires('failed');
    }
  };
  const { width, height } = useWindowDimensions();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close the preview" testID="quick-preview">
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
          <View style={styles.actions}>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                void downloadHires();
              }}
              disabled={hires === 'busy' || state !== 'ok'}
              accessibilityRole="button"
              testID="quick-preview-download"
              style={({ pressed }) => [styles.dlBtn, (pressed || hires === 'busy' || state !== 'ok') && styles.dim]}>
              {hires === 'busy' ? <ActivityIndicator size="small" color={Palette.accentText} /> : null}
              <ThemedText type="smallBold" style={styles.dlText}>
                {hires === 'busy' ? 'Rendering, about half a minute…' : 'Download full-size image'}
              </ThemedText>
            </Pressable>
            <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
              {hires === 'failed' ? 'That render did not finish. Try again in a moment.' : 'A low-resolution look. The download is the full version.'}
            </ThemedText>
          </View>
        </View>
      </Pressable>
    </Modal>
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
  actions: { alignItems: 'center', gap: 6 },
  dlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.control,
    backgroundColor: Palette.accent,
  },
  dlText: { color: Palette.accentText },
  dim: { opacity: 0.6 },
  card: { backgroundColor: Palette.surface, borderRadius: Radius.panel, padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: 520 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  altBtn: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
  },
});
