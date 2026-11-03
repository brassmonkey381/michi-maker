/**
 * THE ARTIST PANEL (owner, 2026-11-03), in the account sheet of an artist account: the link
 * collectors follow to commission them, the pieces they have offered with each one's review
 * state, and the way to offer another. Every new piece waits for the owner's approval in Studio
 * before anyone else sees it (data/artists.ts). Preview only: nothing here is printed or sold.
 *
 * Web only for the upload, like every other upload in the app (ArtUploadButton).
 */
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Image as RNImage, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ArtUploadButton } from '@/components/binder/ArtUploadButton';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { ARTIST_SURFACES, ARTIST_SURFACE_LABELS, type ArtistSurface, type MyPiece, addPiece, fetchMyPieces, updatePiece, withdrawPiece } from '@/data/artists';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/hooks/use-theme';

const STATUS_LABEL: Record<MyPiece['status'], string> = {
  pending: 'Waiting for review',
  approved: 'Offered',
  rejected: 'Not accepted',
  removed: 'Withdrawn',
};

const DEFAULT_SURFACES: ArtistSurface[] = ['slot', 'cover'];

export function ArtistPanel() {
  const auth = useAuth();
  const theme = useTheme();
  const [pieces, setPieces] = useState<MyPiece[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // The commission link: draft then save, like the bio.
  const savedLink = auth.profile?.artist_link ?? '';
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const link = linkDraft ?? savedLink;
  const linkDirty = link.trim() !== savedLink;
  const saveLink = () => {
    const v = link.trim();
    if (v && !/^https?:\/\/\S+$/i.test(v)) { setError('The link needs to start with https://'); return; }
    setBusy('link');
    void auth.updateProfile({ artist_link: v || null }).then((r) => { if (r.error) setError(r.error); else setLinkDraft(null); }).finally(() => setBusy(null));
  };

  // A new piece: picture first, then its title and surfaces, then Offer.
  const [draft, setDraft] = useState<{ url: string; width: number | null; height: number | null } | null>(null);
  const [title, setTitle] = useState('');
  const [surfaces, setSurfaces] = useState<ArtistSurface[]>(DEFAULT_SURFACES);

  const load = useCallback(() => {
    fetchMyPieces().then(setPieces).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(load, [load]);

  const onUploaded = (url: string) => {
    setError(null);
    if (Platform.OS === 'web') {
      RNImage.getSize(url, (w, h) => setDraft({ url, width: w, height: h }), () => setDraft({ url, width: null, height: null }));
    } else {
      setDraft({ url, width: null, height: null });
    }
  };

  const offer = () => {
    if (!draft || busy) return;
    if (!title.trim()) { setError('Give the piece a title.'); return; }
    if (surfaces.length === 0) { setError('Pick at least one place it can go.'); return; }
    setBusy('offer');
    setError(null);
    addPiece({ title, url: draft.url, width: draft.width, height: draft.height, surfaces })
      .then(() => { setDraft(null); setTitle(''); setSurfaces(DEFAULT_SURFACES); load(); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(null));
  };

  const toggleSurface = (s: ArtistSurface) => setSurfaces((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const withdraw = (p: MyPiece) => {
    if (busy) return;
    setBusy(p.id);
    withdrawPiece(p.id).then(load).catch((e) => setError((e as Error).message)).finally(() => setBusy(null));
  };

  const togglePieceSurface = (p: MyPiece, s: ArtistSurface) => {
    if (busy) return;
    const next = p.surfaces.includes(s) ? p.surfaces.filter((x) => x !== s) : [...p.surfaces, s];
    setBusy(p.id);
    updatePiece(p.id, { surfaces: next }).then(load).catch((e) => setError((e as Error).message)).finally(() => setBusy(null));
  };

  const offered = (pieces ?? []).filter((p) => p.status !== 'removed');

  return (
    <View style={styles.block} testID="artist-panel">
      <View style={styles.head}>
        <ThemedText type="smallBold">Your art</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Artist account
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Pieces you offer here can be previewed by anyone on their own binders, sleeves and covers, credited to you with your
        link. Nothing is printed or sold through the app.
      </ThemedText>

      <ThemedText type="small" style={styles.label}>Where collectors can commission you</ThemedText>
      <View style={styles.linkRow}>
        <TextInput
          value={link}
          onChangeText={setLinkDraft}
          placeholder="https://your shop, Reddit or Pinterest"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          testID="artist-link"
        />
        {linkDirty ? (
          <Pressable onPress={saveLink} disabled={busy === 'link'} style={({ pressed }) => [styles.save, (busy === 'link' || pressed) && styles.pressed]}>
            <ThemedText type="smallBold" style={styles.saveText}>{busy === 'link' ? 'Saving…' : 'Save'}</ThemedText>
          </Pressable>
        ) : null}
      </View>

      {/* Offer a piece */}
      <View style={styles.offerBox}>
        {draft ? (
          <>
            <View style={styles.draftRow}>
              <Image source={{ uri: draft.url }} style={styles.draftThumb} contentFit="cover" />
              <View style={styles.draftFields}>
                <TextInput
                  value={title}
                  onChangeText={(t) => setTitle(t.slice(0, 80))}
                  placeholder="Title of the piece"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                  testID="artist-piece-title"
                />
                <View style={styles.chips}>
                  {ARTIST_SURFACES.map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => toggleSurface(s)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: surfaces.includes(s) }}
                      style={[styles.chip, surfaces.includes(s) && styles.chipOn]}>
                      <ThemedText type="small" style={surfaces.includes(s) ? styles.chipTextOn : undefined}>{ARTIST_SURFACE_LABELS[s]}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable onPress={offer} disabled={busy === 'offer'} style={({ pressed }) => [styles.save, (busy === 'offer' || pressed) && styles.pressed]} testID="artist-offer">
                <ThemedText type="smallBold" style={styles.saveText}>{busy === 'offer' ? 'Offering…' : 'Offer this piece'}</ThemedText>
              </Pressable>
              <Pressable onPress={() => setDraft(null)} hitSlop={6}>
                <ThemedText type="small" themeColor="textSecondary">Cancel</ThemedText>
              </Pressable>
            </View>
          </>
        ) : Platform.OS === 'web' ? (
          <View style={styles.actions}>
            <ArtUploadButton onUploaded={onUploaded} onError={setError} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              Offer a new piece. It goes live once we have looked at it.
            </ThemedText>
          </View>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">Offer new pieces from the website.</ThemedText>
        )}
      </View>

      {error ? <ThemedText type="small" style={styles.error}>{error}</ThemedText> : null}

      {/* The pieces */}
      {pieces === null ? null : offered.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">No pieces offered yet.</ThemedText>
      ) : (
        offered.map((p) => (
          <View key={p.id} style={styles.piece} testID={`artist-piece-${p.id}`}>
            <Image source={{ uri: p.url }} style={styles.pieceThumb} contentFit="cover" />
            <View style={styles.pieceText}>
              <ThemedText type="smallBold" numberOfLines={1}>{p.title}</ThemedText>
              <ThemedText type="small" style={p.status === 'approved' ? styles.ok : p.status === 'rejected' ? styles.error : undefined}>
                {STATUS_LABEL[p.status]}{p.reviewNote ? ` · ${p.reviewNote}` : ''}
              </ThemedText>
              <View style={styles.chips}>
                {ARTIST_SURFACES.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => togglePieceSurface(p, s)}
                    disabled={busy === p.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: p.surfaces.includes(s) }}
                    style={[styles.chipSmall, p.surfaces.includes(s) && styles.chipOn]}>
                    <ThemedText type="small" style={[styles.chipSmallText, p.surfaces.includes(s) && styles.chipTextOn]}>{ARTIST_SURFACE_LABELS[s]}</ThemedText>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => withdraw(p)} disabled={busy === p.id} hitSlop={6} style={styles.withdraw}>
                <ThemedText type="small" style={styles.withdrawText}>{busy === p.id ? '…' : 'Withdraw'}</ThemedText>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairlineStrong },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label: { marginBottom: -Spacing.one },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: Radius.control, paddingHorizontal: Spacing.two, paddingVertical: 8, fontSize: FontSize.sm },
  save: { backgroundColor: Palette.accent, borderRadius: Radius.control, paddingHorizontal: Spacing.three, paddingVertical: 8 },
  saveText: { color: Palette.accentText },
  pressed: { opacity: 0.7 },
  offerBox: { gap: Spacing.two, padding: Spacing.two, borderRadius: Radius.control, backgroundColor: Palette.panel },
  draftRow: { flexDirection: 'row', gap: Spacing.two },
  draftThumb: { width: 72, height: 72, borderRadius: Radius.control, backgroundColor: Palette.panel },
  draftFields: { flex: 1, gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: Palette.hairlineStrong },
  chipSmall: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: Palette.hairlineStrong },
  chipSmallText: { fontSize: FontSize.xs },
  chipOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  chipTextOn: { color: Palette.accentText },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  error: { color: Palette.danger },
  ok: { color: Palette.success },
  piece: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  pieceThumb: { width: 56, height: 56, borderRadius: Radius.control, backgroundColor: Palette.panel },
  pieceText: { flex: 1, gap: 4 },
  withdraw: { alignSelf: 'flex-start' },
  withdrawText: { color: Palette.danger, textDecorationLine: 'underline', fontWeight: Weight.semibold },
});
