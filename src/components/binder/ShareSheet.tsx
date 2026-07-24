/**
 * Share a binder. Flips the binder's public flag (persisted via the store → `is_public`)
 * and surfaces the shareable `/binder/[id]` link. Web copies to the clipboard; native uses
 * the system share sheet. Only shown for the owner's own cloud binders.
 */
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DialogCard } from '@/components/ui/DialogCard';
import { Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { privateArtInBinder, type PrivateArtRef } from '@/data/artAttributionCheck';
import type { DemoBinder } from '@/data/binderTypes';
import { useTheme } from '@/hooks/use-theme';
import { binderShareUrl } from '@/lib/appUrl';

export function ShareSheet({
  visible,
  binder,
  isPublic,
  onClose,
  onSetPublic,
  onSetPagePublic,
}: {
  visible: boolean;
  binder: DemoBinder;
  isPublic: boolean;
  onClose: () => void;
  onSetPublic: (v: boolean) => void;
  /** Toggle a single page's visibility to public viewers (only meaningful when the binder is public). */
  onSetPagePublic: (pageId: string, isPublic: boolean) => void;
}) {
  const theme = useTheme();
  const url = binderShareUrl(binder.id);
  const [copied, setCopied] = useState(false);
  // Sharing gate. Two blockers before a binder can go public:
  //  1. PRIVATE art (pulled from a URL) — must be removed first.
  //  2. Rights attestation — the user must confirm they hold the rights to the remaining art.
  const [privateArt, setPrivateArt] = useState<PrivateArtRef[] | null>(null);
  const [awaitingAttest, setAwaitingAttest] = useState(false);
  const [attested, setAttested] = useState(false);

  const handleToggle = (next: boolean) => {
    if (!next) {
      setPrivateArt(null);
      setAwaitingAttest(false);
      onSetPublic(false); // going private is always allowed
      return;
    }
    const priv = privateArtInBinder(binder);
    if (priv.length > 0) {
      setPrivateArt(priv); // block — has URL-sourced (private) art
      setAwaitingAttest(false);
      return;
    }
    // Clean of private art → require the rights attestation before flipping public.
    setPrivateArt(null);
    setAwaitingAttest(true);
  };

  const confirmPublic = () => {
    if (!attested) return;
    setAwaitingAttest(false);
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
    <DialogCard visible={visible} onClose={onClose} maxWidth={420} title="Share binder">
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

            {/* Per-page visibility — a public binder can still keep individual pages private. Only
                meaningful once the binder itself is public, so it lives here rather than the editor. */}
            {isPublic && binder.pages.length > 0 ? (
              <View style={styles.pagesBlock}>
                <ThemedText type="smallBold">Pages shown publicly</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.pagesHint}>
                  Tap a page to hide it from public viewers. Hidden pages stay in your binder — only
                  you see them.
                </ThemedText>
                <View style={styles.pageChips}>
                  {binder.pages.map((p, i) => {
                    const pub = p.isPublic ?? true;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => onSetPagePublic(p.id, !pub)}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: pub }}
                        accessibilityLabel={`Page ${i + 1}, ${pub ? 'public' : 'hidden from public'}`}
                        style={[styles.pageChip, !pub && styles.pageChipHidden]}
                        hitSlop={4}>
                        <Text style={[styles.pageChipText, !pub && styles.pageChipTextHidden]}>
                          {pub ? `${i + 1}` : `⊘ ${i + 1}`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {privateArt && privateArt.length > 0 ? (
              <View style={styles.gateBox}>
                <ThemedText type="smallBold">Remove private art before sharing</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.gateText}>
                  {privateArt.length} art {privateArt.length === 1 ? 'piece was' : 'pieces were'}{' '}
                  brought in from a link, so {privateArt.length === 1 ? 'it stays' : 'they stay'}{' '}
                  private — a binder with them can’t be shared. Replace{' '}
                  {privateArt.length === 1 ? 'it' : 'them'} with your own uploaded art to share this
                  binder.
                </ThemedText>
                <ScrollView style={styles.gateList} contentContainerStyle={styles.gateListInner}>
                  {privateArt.map((u) => (
                    <ThemedText key={u.slotId} type="small" themeColor="textSecondary">
                      • Page {u.page}, row {u.row} col {u.col}
                    </ThemedText>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {awaitingAttest ? (
              <View style={styles.gateBox}>
                <ThemedText type="smallBold">Confirm you have the rights</ThemedText>
                <Pressable
                  onPress={() => setAttested((v) => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: attested }}
                  style={styles.attestRow}
                  hitSlop={4}>
                  <View style={[styles.checkbox, attested && styles.checkboxOn]}>
                    {attested ? <Text style={styles.checkTick}>✓</Text> : null}
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.attestText}>
                    I own, created, or have the rights to all art in this binder, and I agree to the
                    Terms of Service. I understand I am responsible for what I share.
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={confirmPublic}
                  disabled={!attested}
                  style={({ pressed }) => [styles.publicBtn, (!attested || pressed) && styles.dim]}>
                  <ThemedText type="smallBold" style={styles.publicBtnText}>
                    Make public
                  </ThemedText>
                </Pressable>
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
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  toggleText: { flex: 1, gap: 2 },
  pagesBlock: { gap: Spacing.two },
  pagesHint: { lineHeight: 18 },
  pageChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  pageChip: {
    minWidth: 34,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.accent,
    backgroundColor: Palette.selectionSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageChipHidden: { borderColor: Palette.hairlineStrong, backgroundColor: Palette.panel },
  pageChipText: { fontSize: 13, fontWeight: Weight.semibold, color: Palette.accent },
  pageChipTextHidden: { color: Palette.muted2, textDecorationLine: 'line-through' },
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
  attestRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: Radius.xs,
    borderWidth: 1.5,
    borderColor: Palette.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  checkTick: { color: Palette.accentText, fontSize: 12, fontWeight: Weight.bold, lineHeight: 14 },
  attestText: { flex: 1, lineHeight: 18 },
  publicBtn: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    marginTop: Spacing.one,
  },
  publicBtnText: { color: Palette.accentText },
  dim: { opacity: 0.5 },
});
