/**
 * THE SHARE SHEET'S TWO NEW WINDOWS (MIC-017 piece 9, behind 'share-minimal'):
 *
 * - Instagram: the open page as a Story (9:16), a Square post or the Page as it is, each previewed,
 *   with a caption ready to copy and one button to share or save the one picked.
 * - QR code: the binder's link as a QR code to show on screen, and a printable QR card to put in
 *   the physical binder.
 *
 * Both draw in the browser (lib/shareFormats); every button that waits shows it (busy buttons).
 */
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DialogCard } from '@/components/ui/DialogCard';
import { FontSize, Palette, Radius, Weight } from '@/constants/theme';
import { track } from '@/lib/analytics';
import type { PageImageInput } from '@/lib/pageImage';
import { buildQrCard, buildSocialImage, qrDataUrl, savePicture, SOCIAL_FORMATS, type SocialFormat } from '@/lib/shareFormats';

const slug = (t: string) => (t || 'binder').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'binder';

export function InstagramFormatsSheet({
  visible,
  input,
  link,
  onClose,
  onToast,
}: {
  visible: boolean;
  input: PageImageInput | null;
  link: string;
  onClose: () => void;
  onToast?: (m: string) => void;
}) {
  const [format, setFormat] = useState<SocialFormat>('story');
  const [previews, setPreviews] = useState<Partial<Record<SocialFormat, string>>>({});
  const [busy, setBusy] = useState(false);
  // The caption: the owner's edit for this page, else the default.
  const [edited, setEdited] = useState<{ key: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const inputKey = input ? `${input.page.id}:${input.pageNo}` : '';
  const caption =
    edited && edited.key === inputKey
      ? edited.text
      : input
        ? `${input.title}, page ${input.pageNo}. Made with michi-maker.com\n${link}\n#pokemontcg #pokemoncards #tcgbinder`
        : '';
  const setCaption = (text: string) => setEdited({ key: inputKey, text });

  // The three previews, drawn once per page when the window opens.
  useEffect(() => {
    if (!visible || !input) return;
    let live = true;
    const made: string[] = [];
    for (const f of SOCIAL_FORMATS) {
      buildSocialImage(input, f.key)
        .then((blob) => {
          if (!live) return;
          const url = URL.createObjectURL(blob);
          made.push(url);
          setPreviews((p) => ({ ...p, [f.key]: url }));
        })
        .catch(() => {});
    }
    return () => {
      live = false;
      for (const u of made) URL.revokeObjectURL(u);
      setPreviews({});
    };
    // inputKey stands in for input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, inputKey, link]);

  const share = () => {
    if (!input || busy) return;
    setBusy(true);
    track('share.format', { format });
    buildSocialImage(input, format)
      .then((blob) => savePicture(blob, `${slug(input.title)}-page-${input.pageNo}-${format}.${format === 'page' ? 'png' : 'jpg'}`, caption))
      .then((how) => onToast?.(how === 'shared' ? 'Shared' : 'Saved to your downloads'))
      .catch(() => onToast?.('The picture could not be made. Try again.'))
      .finally(() => setBusy(false));
  };
  const copyCaption = () => {
    void navigator.clipboard
      ?.writeText(caption)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  };

  return (
    <DialogCard visible={visible} onClose={onClose} maxWidth={560} title="Share to Instagram">
      <View style={styles.formats} testID="ig-formats">
        {SOCIAL_FORMATS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFormat(f.key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: format === f.key }}
            testID={`ig-format-${f.key}`}
            style={[styles.format, format === f.key && styles.formatOn]}>
            <View style={[styles.previewBox, { aspectRatio: f.key === 'story' ? 9 / 16 : f.key === 'square' ? 1 : 3 / 4 }]}>
              {previews[f.key] ? <Image source={{ uri: previews[f.key] }} style={styles.previewImg} contentFit="contain" /> : <Text style={styles.drawing}>Drawing…</Text>}
            </View>
            <Text style={styles.formatLabel}>{f.label}</Text>
            <Text style={styles.formatSize}>{f.size}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.captionLabel}>Caption</Text>
      <TextInput value={caption} onChangeText={setCaption} multiline style={styles.caption} testID="ig-caption" />
      <View style={styles.actions}>
        <Pressable onPress={copyCaption} accessibilityRole="button" style={styles.btn} testID="ig-copy-caption">
          <Text style={styles.btnText}>{copied ? 'Copied ✓' : 'Copy caption'}</Text>
        </Pressable>
        <Pressable onPress={share} disabled={busy || !input} accessibilityRole="button" style={[styles.btn, styles.btnPrimary, busy && styles.dim]} testID="ig-share">
          <Text style={[styles.btnText, styles.btnPrimaryText]}>{busy ? 'Making the picture…' : `Share the ${SOCIAL_FORMATS.find((f) => f.key === format)!.label.toLowerCase()}`}</Text>
        </Pressable>
      </View>
    </DialogCard>
  );
}

export function QrSheet({
  visible,
  link,
  title,
  onClose,
  onToast,
}: {
  visible: boolean;
  link: string;
  title: string;
  onClose: () => void;
  onToast?: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const src = useMemo(() => (visible ? qrDataUrl(link, 8) : ''), [visible, link]);
  const save = () => {
    if (busy) return;
    setBusy(true);
    track('share.qr', { action: 'card' });
    buildQrCard(link, title)
      .then((blob) => savePicture(blob, `${slug(title)}-qr.png`, title))
      .then((how) => onToast?.(how === 'shared' ? 'Shared' : 'QR card saved to your downloads'))
      .catch(() => onToast?.('The QR card could not be made. Try again.'))
      .finally(() => setBusy(false));
  };
  return (
    <DialogCard visible={visible} onClose={onClose} maxWidth={380} title="QR code">
      <View style={styles.qrWrap} testID="qr-sheet">
        {src ? <Image source={{ uri: src }} style={styles.qr} contentFit="contain" /> : null}
        <Text style={styles.qrTitle}>{title}</Text>
        <Text style={styles.qrHint}>Scan to open this binder. Print the card and slip it in the front pocket of the real one.</Text>
        <Pressable onPress={save} disabled={busy} accessibilityRole="button" style={[styles.btn, styles.btnPrimary, busy && styles.dim]} testID="qr-save">
          <Text style={[styles.btnText, styles.btnPrimaryText]}>{busy ? 'Making the card…' : 'Save the QR card'}</Text>
        </Pressable>
      </View>
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  formats: { flexDirection: 'row', gap: 10 },
  format: { flex: 1, alignItems: 'center', gap: 4, padding: 6, borderRadius: Radius.control, borderWidth: 2, borderColor: 'transparent' },
  formatOn: { borderColor: Palette.accent },
  previewBox: { width: '100%', maxHeight: 220, borderRadius: 8, backgroundColor: Palette.hairline, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  previewImg: { width: '100%', height: '100%' },
  drawing: { fontSize: FontSize.sm, color: Palette.muted },
  formatLabel: { fontSize: FontSize.sm, fontWeight: Weight.bold, color: Palette.ink },
  formatSize: { fontSize: FontSize.tag, color: Palette.muted },
  captionLabel: { marginTop: 14, marginBottom: 4, fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.muted },
  caption: { minHeight: 84, borderWidth: 1, borderColor: Palette.hairlineStrong, borderRadius: Radius.control, padding: 10, fontSize: FontSize.sm, color: Palette.ink, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, justifyContent: 'flex-end' },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.hairlineStrong, alignItems: 'center' },
  btnPrimary: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  btnText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink },
  btnPrimaryText: { color: Palette.accentText },
  dim: { opacity: 0.6 },
  qrWrap: { alignItems: 'center', gap: 10, paddingBottom: 6 },
  qr: { width: 240, height: 240 },
  qrTitle: { fontSize: FontSize.md, fontWeight: Weight.bold, color: Palette.ink },
  qrHint: { fontSize: FontSize.sm, color: Palette.muted, textAlign: 'center' },
});
