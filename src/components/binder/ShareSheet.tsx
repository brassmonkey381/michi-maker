/**
 * Share a binder. Flips the binder's public flag (persisted via the store → `is_public`)
 * and surfaces the shareable `/binder/[id]` link. Web copies to the clipboard; native uses
 * the system share sheet. Only shown for the owner's own cloud binders.
 */
import { useState } from 'react';
import { Modal, Platform, Pressable, Share, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { sheet } from '@/constants/ui';
import { useTheme } from '@/hooks/use-theme';
import { binderShareUrl } from '@/lib/appUrl';

export function ShareSheet({
  visible,
  binderId,
  isPublic,
  onClose,
  onSetPublic,
}: {
  visible: boolean;
  binderId: string;
  isPublic: boolean;
  onClose: () => void;
  onSetPublic: (v: boolean) => void;
}) {
  const theme = useTheme();
  const url = binderShareUrl(binderId);
  const [copied, setCopied] = useState(false);

  const onShare = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } else {
        await Share.share({ message: url, url });
      }
    } catch {
      // user cancelled the share sheet, or clipboard denied — no-op
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={sheet.dialogBackdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={sheet.dialogCard}>
            <View style={styles.header}>
              <ThemedText type="subtitle" style={styles.title}>
                Share binder
              </ThemedText>
              <Pressable onPress={onClose} hitSlop={8}>
                <ThemedText type="link" themeColor="textSecondary">
                  Close
                </ThemedText>
              </Pressable>
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <ThemedText type="smallBold">Anyone with the link</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {isPublic
                    ? 'Public: anyone with the link can view this binder.'
                    : 'Private: only you can see it.'}
                </ThemedText>
              </View>
              <Switch value={isPublic} onValueChange={onSetPublic} trackColor={{ true: Palette.accent, false: theme.backgroundSelected }} />
            </View>

            {isPublic ? (
              <View style={styles.linkArea}>
                <View style={[styles.linkBox, { borderColor: theme.backgroundSelected }]}>
                  <ThemedText type="small" numberOfLines={1} style={styles.linkText}>
                    {url}
                  </ThemedText>
                </View>
                <Pressable onPress={onShare} style={styles.copyBtn} hitSlop={6}>
                  <ThemedText type="smallBold" style={styles.copyText}>
                    {copied ? 'Copied ✓' : Platform.OS === 'web' ? 'Copy link' : 'Share'}
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                Turn on public sharing to get a link you can send to anyone.
              </ThemedText>
            )}
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cardWrap: { width: '100%', maxWidth: 420 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: FontSize.h2, lineHeight: 26 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  toggleText: { flex: 1, gap: 2 },
  linkArea: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  linkBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  linkText: { color: Palette.accent },
  copyBtn: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.control,
    backgroundColor: Palette.accent,
  },
  copyText: { color: Palette.accentText },
  hint: { lineHeight: 20 },
});
