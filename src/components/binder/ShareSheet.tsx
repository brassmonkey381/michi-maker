/**
 * Share a binder. Flips the binder's public flag (persisted via the store → `is_public`)
 * and surfaces the shareable `/binder/[id]` link. Web copies to the clipboard; native uses
 * the system share sheet. Only shown for the owner's own cloud binders.
 */
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { sheet } from '@/constants/ui';
import { artNeedingSource, type UnsourcedArt } from '@/data/artAttributionCheck';
import type { DemoBinder } from '@/data/binderTypes';
import { useTheme } from '@/hooks/use-theme';
import { binderShareUrl } from '@/lib/appUrl';

export function ShareSheet({
  visible,
  binder,
  isPublic,
  onClose,
  onSetPublic,
}: {
  visible: boolean;
  binder: DemoBinder;
  isPublic: boolean;
  onClose: () => void;
  onSetPublic: (v: boolean) => void;
}) {
  const theme = useTheme();
  const url = binderShareUrl(binder.id);
  const [copied, setCopied] = useState(false);
  // Public-binder attribution gate: art without a source blocks going public (private is
  // unrestricted). Computed on demand when the user tries to flip the switch.
  const [unsourced, setUnsourced] = useState<UnsourcedArt[] | null>(null);

  const handleToggle = (next: boolean) => {
    if (!next) {
      setUnsourced(null);
      onSetPublic(false); // going private is always allowed
      return;
    }
    const missing = artNeedingSource(binder);
    if (missing.length > 0) {
      setUnsourced(missing); // block — show what needs a source
      return;
    }
    setUnsourced(null);
    onSetPublic(true);
  };

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
              <Switch value={isPublic} onValueChange={handleToggle} trackColor={{ true: Palette.accent, false: theme.backgroundSelected }} />
            </View>

            {unsourced && unsourced.length > 0 ? (
              <View style={styles.gateBox}>
                <ThemedText type="smallBold">Add a source before going public</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.gateText}>
                  Public binders credit every artwork, like The Art of Pokémon does. {unsourced.length}{' '}
                  {unsourced.length === 1 ? 'piece needs' : 'pieces need'} a source link (the
                  original post, shop, or artist page). Open each in Slice Studio and add its
                  source, then try again.
                </ThemedText>
                <ScrollView style={styles.gateList} contentContainerStyle={styles.gateListInner}>
                  {unsourced.map((u) => (
                    <ThemedText key={u.slotId} type="small" themeColor="textSecondary">
                      • Page {u.page}, row {u.row} col {u.col}
                    </ThemedText>
                  ))}
                </ScrollView>
              </View>
            ) : null}

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
  gateBox: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
  },
  gateText: { lineHeight: 18 },
  gateList: { maxHeight: 96 },
  gateListInner: { gap: 2 },
});
