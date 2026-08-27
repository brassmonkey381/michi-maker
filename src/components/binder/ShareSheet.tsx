/**
 * Share a binder. Flips the binder's public flag (persisted via the store → `is_public`)
 * and surfaces the shareable `/binder/[id]` link. Web copies to the clipboard; native uses
 * the system share sheet. Only shown for the owner's own cloud binders.
 */
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { ContestEntrySection } from '@/components/contest/ContestEntrySection';
import { ThemedText } from '@/components/themed-text';
import { DialogCard } from '@/components/ui/DialogCard';
import { Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { privateArtInBinder, type PrivateArtRef } from '@/data/artAttributionCheck';
import { fetchShareKey } from '@/data/binderRepo';
import type { DemoBinder } from '@/data/binderTypes';
import { CONTEST } from '@/data/contest';
import { useTheme } from '@/hooks/use-theme';
import { binderShareUrl, warmBinderPreview } from '@/lib/appUrl';
import { useAuth } from '@/store/auth';
import { useBinders } from '@/store/binders';

export function ShareSheet({
  visible,
  binder,
  isPublic,
  onClose,
  onSetPublic,
  onSetPagePublic,
  onSetSharePages,
  onToast,
}: {
  visible: boolean;
  binder: DemoBinder;
  isPublic: boolean;
  onClose: () => void;
  onSetPublic: (v: boolean) => void;
  /** Toggle a single page's visibility to public viewers (only meaningful when the binder is public). */
  onSetPagePublic: (pageId: string, isPublic: boolean) => void;
  /** Set the up-to-2 pages featured in the shared-link preview ([] = auto, the fullest pages). */
  onSetSharePages: (pageIds: string[]) => void;
  /** Surface a blocked action (e.g. the contest public-page cap) as a toast in the host screen. */
  onToast?: (message: string) => void;
}) {
  const theme = useTheme();
  // The up-to-2 pages featured in the link preview ([] = auto), as a comparable string. It is also
  // the input the server keys share_key on, so it drives the link refresh below as well as the
  // chips further down and the preview warmth at the bottom.
  const featured = (binder.sharePageIds ?? []).join(',');

  // THE LINK'S ?v=, kept current for as long as the sheet is open.
  //
  // share_key is written SERVER-SIDE by a trigger, so the store's copy goes stale the moment the
  // preview changes — and featuring a different page changes it. Re-reading it only when the sheet
  // OPENED was why "Copy link" kept handing over the previous link right through the re-render that
  // followed, until the sheet was closed and reopened. So it is re-read on every featured-page
  // change too: the tap that starts the preview rendering starts this.
  //
  // Held AGAINST the selection it was read for, so a key belonging to the old selection can never
  // be shown as the current one. The retries are not decoration: the featured-page write is
  // optimistic, so for a round trip the row still holds the previous share_page_ids and answers
  // with the key we already have. That answer means "not written yet", and asking again is the
  // whole fix — the last attempt takes whatever it gets rather than waiting for ever.
  const [liveKey, setLiveKey] = useState<{ featured: string; value: string } | null>(null);
  const lastRead = useRef<{ featured: string; value: string } | null>(null);
  useEffect(() => {
    if (!visible || binder.isExample) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    // Only a CHANGED selection has a key to out-wait; a sheet's first read takes what it gets.
    const stale =
      lastRead.current && lastRead.current.featured !== featured ? lastRead.current.value : null;
    const GAPS = [0, 400, 1200, 3000];
    const read = () => {
      timer = setTimeout(() => {
        void fetchShareKey(binder.id).then((value) => {
          if (!live) return;
          const last = attempt >= GAPS.length - 1;
          if (value != null && (value !== stale || last)) {
            lastRead.current = { featured, value };
            setLiveKey({ featured, value });
            return;
          }
          if (last) return; // the read itself failed; the store's key still opens the binder
          attempt += 1;
          read();
        });
      }, GAPS[attempt]);
    };
    read();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [visible, binder.id, binder.isExample, featured]);
  // While the new key is in flight the link on show still points at the previous preview — the box
  // dims and copying is held for the moment it takes, rather than putting a link at the old preview
  // on the clipboard. It resolves itself; nothing here needs the user to do anything.
  const linkStale = liveKey != null && liveKey.featured !== featured;
  const url = binderShareUrl(binder.id, liveKey?.value ?? binder.shareKey);
  const [copied, setCopied] = useState(false);

  // Park the link box at its FAR RIGHT, where ?v= lives. The tail is the only part that ever
  // changes, so keeping it in view is what makes a refreshed link visible at a glance.
  const linkScroll = useRef<ScrollView>(null);
  useEffect(() => {
    // A new key is the same LENGTH as the old one, so the content never resizes and
    // onContentSizeChange (which handles first layout) does not fire for it — this does.
    linkScroll.current?.scrollToEnd({ animated: true });
  }, [url]);
  // Whether this binder is a contest entry (reported up by ContestEntrySection, which loads it).
  // An ENTERED binder may show at most CONTEST.pageCap public pages, so flipping one more page
  // public past the cap is blocked here with a toast.
  const [entered, setEntered] = useState(false);
  const publicPageCount = binder.pages.filter((p) => p.isPublic ?? true).length;
  const setPagePublic = (pageId: string, next: boolean) => {
    if (next && entered && publicPageCount >= CONTEST.pageCap) {
      onToast?.(
        `Contest entries can show at most ${CONTEST.pageCap} public pages. Hide another page first.`,
      );
      return;
    }
    onSetPagePublic(pageId, next);
  };
  // Up-to-2 pages featured in the shared-link preview ([] = auto). Tap to add/remove.
  const sharePageIds = binder.sharePageIds ?? [];
  const toggleFeatured = (pageId: string) => {
    if (sharePageIds.includes(pageId)) onSetSharePages(sharePageIds.filter((x) => x !== pageId));
    else if (sharePageIds.length < 2) onSetSharePages([...sharePageIds, pageId]);
    else onToast?.('You can feature up to 2 pages. Tap one to remove it first.');
  };
  // Sharing gate. Two blockers before a binder can go public:
  //  1. PRIVATE art (copied from another binder, or a legacy unhosted hotlink): remove first.
  //  2. The rights attestation, ONCE PER ACCOUNT (profiles.rights_attested_at) rather than per
  //     binder. An account that accepted it (here, in the RightsPrompt, or in Settings) flips
  //     public with no further ceremony; accepting here records it for every future share too.
  const auth = useAuth();
  const store = useBinders();
  const accountAttested = !!auth.profile?.rights_attested_at;
  const [privateArt, setPrivateArt] = useState<PrivateArtRef[] | null>(null);
  const [awaitingAttest, setAwaitingAttest] = useState(false);
  const [attested, setAttested] = useState(false);
  const [attestBusy, setAttestBusy] = useState(false);
  // Converting hotlink art into copies we host. Since the only thing that still blocks sharing
  // is an image we do not serve, the blocker box offers to FIX itself: fetch each off-site
  // image, save it to the user's bucket, keep the credit. What converts is public-eligible;
  // what a site refuses to hand over stays private until uploaded by hand.
  const [converting, setConverting] = useState(false);
  const [convertNote, setConvertNote] = useState<string | null>(null);
  const rehost = () => {
    if (converting) return;
    setConverting(true);
    setConvertNote(null);
    void store
      .rehostBinderArt(binder.id)
      .then(({ fixed, failed, binder: updated }) => {
        const left = updated ? privateArtInBinder(updated) : privateArtInBinder(binder);
        if (left.length === 0) {
          // Everything converted: pick the flow up exactly where the toggle would have.
          setPrivateArt(null);
          if (accountAttested) onSetPublic(true);
          else setAwaitingAttest(true);
          if (fixed) onToast?.(`Saved ${fixed} ${fixed === 1 ? 'copy' : 'copies'} to your account.`);
        } else {
          setPrivateArt(left);
          setConvertNote(
            `Saved ${fixed} ${fixed === 1 ? 'copy' : 'copies'}. ${failed} couldn’t be fetched, ` +
              'download those images and use Upload in Slice Studio instead.',
          );
        }
      })
      .catch(() => setConvertNote('Couldn’t save copies just now. Try again in a moment.'))
      .finally(() => setConverting(false));
  };

  const handleToggle = (next: boolean) => {
    if (!next) {
      setPrivateArt(null);
      setAwaitingAttest(false);
      onSetPublic(false); // going private is always allowed
      return;
    }
    const priv = privateArtInBinder(binder);
    if (priv.length > 0) {
      setPrivateArt(priv); // block: copied art / unhosted legacy art
      setAwaitingAttest(false);
      return;
    }
    setPrivateArt(null);
    if (accountAttested) {
      onSetPublic(true); // the account already answered the rights question
      return;
    }
    setAwaitingAttest(true);
  };

  const confirmPublic = () => {
    if (!attested || attestBusy) return;
    setAttestBusy(true);
    // Persist the acceptance on the account, then flip. If the write fails the binder still goes
    // public (the user did just attest, on this device, with the box checked); the next share
    // will simply ask again, which is the safe direction to fail in.
    void auth
      .updateProfile({ rights_attested_at: new Date().toISOString() })
      .finally(() => {
        setAttestBusy(false);
        setAwaitingAttest(false);
        onSetPublic(true);
      });
  };

  // PREVIEW WARMTH. Composing the link-preview image takes ten seconds or more, and no link
  // scraper waits that long — so it is rendered here, up front, the moment this sheet opens.
  //
  // The result is stored AGAINST WHAT WAS WARMED rather than as a bare flag, because featuring a
  // different page changes the preview and must put the indicator honestly back to "preparing".
  // Deriving the state from that key means any change re-arms it with no reset to remember
  // (`featured` is declared at the top, with the link refresh the same input drives).
  // shareKey is the server's own "the preview changed" signal — a trigger rewrites it whenever the
  // image would differ — so it belongs in the key next to the featured pages. Without it, an edit
  // made while this sheet is open could leave a stale tick claiming a preview the link no longer
  // points at.
  const warmKey = `${binder.id}:${featured}:${binder.shareKey ?? ''}`;
  const [warmed, setWarmed] = useState<{ key: string; state: 'ready' | 'failed' } | null>(null);
  const warmth = !isPublic ? 'idle' : warmed?.key === warmKey ? warmed.state : 'warming';

  /* eslint-disable react-hooks/set-state-in-effect -- see the stale-failure note below. */
  useEffect(() => {
    if (!visible || !isPublic) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    // A failure recorded during a PREVIOUS opening of this sheet is stale — the preview has very
    // likely finished since. Drop it so this opening starts by re-checking rather than by showing
    // a red line about a picture that is now sitting in the CDN. Only ever clears a failure; a
    // "ready" is still true and is kept so the tick does not flicker on reopen.
    setWarmed((prev) => (prev?.state === 'failed' ? null : prev));

    // RETRIES — and the first gap is not merely a debounce for a burst of featured-page taps.
    //
    // Flipping a binder public is OPTIMISTIC: the store updates local state immediately and writes
    // to the database in the background, so `isPublic` is true here a round trip before the server
    // agrees. A warm sent inside that window asks about a binder the server still reads as private
    // and is answered "not public" — and with a single attempt that raced answer was FINAL. The
    // indicator then sat on "isn't ready" for a preview that was fine a moment later, because
    // nothing in the deps ever changed to make it look again.
    //
    // So a failure is not believed until the attempts run out. Anything transient — the publish
    // race, a network blip, a cold render that timed out — corrects itself, and the spinner goes
    // on saying "preparing", which is the honest thing to show while the answer isn't known yet.
    const GAPS = [400, 1500, 4000];
    const attemptWarm = () => {
      timer = setTimeout(() => {
        void warmBinderPreview(binder.id).then((state) => {
          if (!live) return;
          if (state === 'ready' || attempt >= GAPS.length - 1) {
            setWarmed({ key: warmKey, state });
            return;
          }
          attempt += 1;
          attemptWarm();
        });
      }, GAPS[attempt]);
    };
    attemptWarm();

    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [visible, isPublic, binder.id, warmKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const onShare = async () => {
    if (linkStale) return; // a re-read away from the current link; do not hand over the old one
    // A last attempt if the preview isn't already warm — this is the final moment before the link
    // is actually somewhere. Skipped when it's ready, since that call would only cost a CDN hit.
    if (warmth !== 'ready') {
      void warmBinderPreview(binder.id).then((state) => setWarmed({ key: warmKey, state }));
    }
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

            {/* Per-page visibility, a public binder can still keep individual pages private. Only
                meaningful once the binder itself is public, so it lives here rather than the editor. */}
            {isPublic && binder.pages.length > 0 ? (
              <View style={styles.pagesBlock}>
                <ThemedText type="smallBold">Pages shown publicly</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.pagesHint}>
                  Tap a page to hide it from public viewers. Hidden pages stay in your binder, only
                  you see them.
                </ThemedText>
                <View style={styles.pageChips}>
                  {binder.pages.map((p, i) => {
                    const pub = p.isPublic ?? true;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => setPagePublic(p.id, !pub)}
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

            {/* Which page(s) show in the link preview (og:image). Up to 2; blank = auto. Only public
                pages are offered — a hidden page can't be featured (and the OG endpoint skips it). */}
            {isPublic && binder.pages.filter((p) => p.isPublic ?? true).length > 1 ? (
              <View style={styles.pagesBlock}>
                <ThemedText type="smallBold">Featured in the link preview</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.pagesHint}>
                  Pick up to 2 pages to show in the image when you share the link. Leave blank to
                  auto-pick your fullest pages.
                </ThemedText>
                <View style={styles.pageChips}>
                  {binder.pages.map((p, i) =>
                    (p.isPublic ?? true) ? (
                      <Pressable
                        key={p.id}
                        onPress={() => toggleFeatured(p.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: sharePageIds.includes(p.id) }}
                        accessibilityLabel={`Feature page ${i + 1} in the link preview`}
                        style={[styles.pageChip, !sharePageIds.includes(p.id) && styles.featOff]}
                        hitSlop={4}>
                        <Text
                          style={[
                            styles.pageChipText,
                            !sharePageIds.includes(p.id) && styles.featOffText,
                          ]}>
                          {i + 1}
                        </Text>
                      </Pressable>
                    ) : null,
                  )}
                </View>
                {sharePageIds.length > 0 ? (
                  <Pressable onPress={() => onSetSharePages([])} hitSlop={6}>
                    <ThemedText type="small" style={styles.autoReset}>
                      Reset to auto
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {privateArt && privateArt.length > 0 ? (
              <View style={styles.gateBox}>
                <ThemedText type="smallBold">Some art isn’t saved to your account yet</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.gateText}>
                  {privateArt.length} art {privateArt.length === 1 ? 'piece links' : 'pieces link'}{' '}
                  to {privateArt.length === 1 ? 'an image' : 'images'} we don’t host, so{' '}
                  {privateArt.length === 1 ? 'it stays' : 'they stay'} private and this binder
                  can’t be shared yet. Save {privateArt.length === 1 ? 'a copy' : 'copies'} to
                  your account and sharing unlocks, with the original credited.
                </ThemedText>
                <Pressable
                  onPress={rehost}
                  disabled={converting}
                  style={({ pressed }) => [styles.publicBtn, (converting || pressed) && styles.dim]}>
                  <ThemedText type="smallBold" style={styles.publicBtnText}>
                    {converting ? 'Saving copies…' : 'Save copies to your account'}
                  </ThemedText>
                </Pressable>
                {convertNote ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.gateText}>
                    {convertNote}
                  </ThemedText>
                ) : null}
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
                    I own, created, or have the rights to the art I put in binders I share, and I
                    agree to the Terms of Service. I understand I am responsible for what I share.
                    This applies to binders I share from now on.
                    {auth.profile && !auth.isGuest
                      ? ' New binders will start out public.'
                      : ''}
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

            {/* Contest entry — entering requires a public binder, so it lives with sharing. */}
            {isPublic ? (
              <ContestEntrySection binder={binder} onEntryChange={(c) => setEntered(c != null)} />
            ) : null}

            {isPublic ? (
              <>
                <View style={styles.linkArea}>
                  <ScrollView
                    ref={linkScroll}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    onContentSizeChange={() => linkScroll.current?.scrollToEnd({ animated: false })}
                    style={[styles.linkBox, { borderColor: theme.backgroundSelected }]}
                    contentContainerStyle={styles.linkInner}>
                    <ThemedText
                      type="small"
                      numberOfLines={1}
                      style={[styles.linkText, linkStale && styles.dim]}>
                      {url}
                    </ThemedText>
                  </ScrollView>
                  <Pressable
                    onPress={onShare}
                    disabled={linkStale}
                    style={({ pressed }) => [styles.copyBtn, (linkStale || pressed) && styles.dim]}
                    hitSlop={6}>
                    <ThemedText type="smallBold" style={styles.copyText}>
                      {linkStale
                        ? 'Updating…'
                        : copied
                          ? 'Copied ✓'
                          : Platform.OS === 'web'
                            ? 'Copy link'
                            : 'Share'}
                    </ThemedText>
                  </Pressable>
                </View>
                {/* Says whether a link posted RIGHT NOW would carry a picture. Deliberately not a
                    blocker: the link works the moment it exists, and the only cost of posting
                    early is a preview without its image. */}
                <View style={styles.previewRow}>
                  {warmth === 'warming' ? (
                    <ActivityIndicator size="small" color={Palette.accent} />
                  ) : (
                    <ThemedText
                      type="small"
                      style={[
                        styles.previewMark,
                        { color: warmth === 'ready' ? Palette.success : Palette.warning },
                      ]}>
                      {warmth === 'ready' ? '✓' : '!'}
                    </ThemedText>
                  )}
                  <ThemedText type="small" themeColor="textSecondary" style={styles.previewText}>
                    {warmth === 'warming'
                      ? 'Building the preview image… you can share the link now, but it may post without a picture until this finishes.'
                      : warmth === 'ready'
                        ? 'Preview image ready. Shared links will show the page.'
                        : 'The preview image isn’t ready. The link works, but it may post without a picture.'}
                  </ThemedText>
                </View>
              </>
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
  // Featured-page picker: selected reuses pageChip (accent); unselected is a plain grey chip (no
  // strikethrough — it's an unpicked option, not a hidden page).
  featOff: { borderColor: Palette.hairlineStrong, backgroundColor: Palette.panel },
  featOffText: { color: Palette.muted2 },
  autoReset: { color: Palette.accent, fontWeight: Weight.semibold, marginTop: Spacing.one },
  linkArea: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  // A horizontal scroller rather than a box that ellipsises: the interesting end of a share link is
  // the right-hand one, and it is kept in view (see linkScroll). The padding lives on the content
  // container, since a ScrollView's own padding would scroll away with the text.
  linkBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.control,
  },
  linkInner: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  linkText: { color: Palette.accent },
  previewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, minHeight: 20 },
  previewMark: { width: 14, textAlign: 'center' },
  previewText: { flex: 1, lineHeight: 18 },
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
