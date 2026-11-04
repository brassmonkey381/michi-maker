/**
 * THE ARTISTS PANEL in Studio (owner, 2026-11-03): the review queue for artist pieces, and the
 * one place an account is made an artist. Admin-only through the admin_* RPCs (data/artists.ts);
 * the panel never writes a table itself.
 */
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { ARTIST_SURFACE_LABELS, type AdminArtist, type AdminPiece, type PieceStatus, adminArtistPieces, adminListArtists, adminReviewPiece, adminSetArtistByUsername, adminSetArtistPrints } from '@/data/artists';

type Tab = 'pending' | 'approved' | 'rejected';

export function ArtistsPanel() {
  const [tab, setTab] = useState<Tab>('pending');
  const [pieces, setPieces] = useState<AdminPiece[] | null>(null);
  const [artists, setArtists] = useState<AdminArtist[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [handle, setHandle] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    adminArtistPieces(tab).then(setPieces).catch((e) => setError((e as Error).message));
    adminListArtists().then(setArtists).catch(() => setArtists([]));
  }, [tab]);
  useEffect(load, [load]);

  const review = (p: AdminPiece, status: PieceStatus) => {
    if (busy) return;
    setBusy(p.id);
    adminReviewPiece(p.id, status, status === 'rejected' ? note.trim() || null : null)
      .then(() => { setNote(''); load(); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(null));
  };

  const setPrints = (a: AdminArtist, on: boolean) => {
    if (busy) return;
    setBusy(`prints-${a.id}`);
    setError(null);
    adminSetArtistPrints(a.id, on)
      .then(load)
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(null));
  };

  const grant = (on: boolean) => {
    if (busy || !handle.trim()) return;
    setBusy('grant');
    setError(null);
    adminSetArtistByUsername(handle, on)
      .then(() => { setHandle(''); load(); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(null));
  };

  return (
    <View style={styles.panel} testID="artists-panel">
      <View style={styles.headerRow}>
        <ThemedText type="smallBold">Artists</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {artists.length} artist account{artists.length === 1 ? '' : 's'}
        </ThemedText>
      </View>

      <View style={styles.grantRow}>
        <TextInput
          value={handle}
          onChangeText={setHandle}
          placeholder="@username"
          placeholderTextColor={Palette.muted3}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          testID="artists-handle"
        />
        <Pressable onPress={() => grant(true)} disabled={busy === 'grant'} style={styles.quietBtn} testID="artists-grant">
          <ThemedText type="small" style={styles.quietText}>Make artist</ThemedText>
        </Pressable>
        <Pressable onPress={() => grant(false)} disabled={busy === 'grant'} style={styles.dangerBtn}>
          <ThemedText type="small" style={styles.dangerText}>Remove</ThemedText>
        </Pressable>
      </View>
      {artists.length ? (
        // Each artist with a Prints switch: on, their placed pieces print as pictures; off, a
        // placeholder named for them prints (the default, preview only).
        <View style={styles.artistList}>
          {artists.map((a) => (
            <View key={a.id} style={styles.artistRow} testID={`artists-account-${a.id}`}>
              <ThemedText type="small" style={styles.artistName} numberOfLines={1}>
                {a.username ? `@${a.username}` : a.displayName ?? a.id.slice(0, 8)}
              </ThemedText>
              <Pressable onPress={() => setPrints(a, !a.prints)} disabled={busy === `prints-${a.id}`} style={a.prints ? styles.quietBtn : styles.ghostBtn} testID={`artists-prints-${a.id}`}>
                <ThemedText type="small" style={a.prints ? styles.quietText : styles.ghostText}>{a.prints ? 'Prints as shown' : 'Preview only'}</ThemedText>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.tabs}>
        {(['pending', 'approved', 'rejected'] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
            <ThemedText type="small" style={[styles.tabText, tab === t && styles.tabTextOn]}>{t === 'pending' ? 'To review' : t === 'approved' ? 'Offered' : 'Not accepted'}</ThemedText>
          </Pressable>
        ))}
      </View>

      {error ? <ThemedText type="small" style={styles.error}>{error}</ThemedText> : null}
      {pieces === null ? (
        <ActivityIndicator color={Palette.accent} />
      ) : pieces.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">Nothing here.</ThemedText>
      ) : (
        pieces.map((p) => (
          <View key={p.id} style={styles.row} testID={`artists-piece-${p.id}`}>
            <Pressable onPress={() => Linking.openURL(p.url).catch(() => {})}>
              <Image source={{ uri: p.url }} style={styles.thumb} contentFit="cover" />
            </Pressable>
            <View style={styles.rowText}>
              <ThemedText type="smallBold" numberOfLines={1}>{p.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                {p.artistUsername ? `@${p.artistUsername}` : p.artistName ?? p.artistId.slice(0, 8)} · {p.surfaces.map((s) => ARTIST_SURFACE_LABELS[s]).join(', ') || 'no surfaces'}
                {p.width && p.height ? ` · ${p.width}×${p.height}` : ''}
              </ThemedText>
              {p.reviewNote ? <ThemedText type="small" themeColor="textSecondary">Note: {p.reviewNote}</ThemedText> : null}
              <View style={styles.actions}>
                {p.status !== 'approved' ? (
                  <Pressable onPress={() => review(p, 'approved')} disabled={busy === p.id} style={styles.quietBtn} testID={`artists-approve-${p.id}`}>
                    <ThemedText type="small" style={styles.quietText}>Approve</ThemedText>
                  </Pressable>
                ) : null}
                {p.status !== 'rejected' ? (
                  <Pressable onPress={() => review(p, 'rejected')} disabled={busy === p.id} style={styles.dangerBtn}>
                    <ThemedText type="small" style={styles.dangerText}>{p.status === 'approved' ? 'Take down' : 'Reject'}</ThemedText>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        ))
      )}
      {tab === 'pending' && pieces?.length ? (
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Note to the artist when rejecting (optional)"
          placeholderTextColor={Palette.muted3}
          style={styles.input}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
  },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.two },
  grantRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  artistList: { gap: 4 },
  artistRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  artistName: { flexShrink: 1 },
  ghostBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: Palette.hairlineStrong },
  ghostText: { color: Palette.muted },
  input: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: Palette.hairlineStrong, borderRadius: Radius.control, paddingHorizontal: Spacing.two, paddingVertical: 6, fontSize: FontSize.sm, color: Palette.ink },
  tabs: { flexDirection: 'row', gap: Spacing.two },
  tab: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: Palette.hairlineStrong },
  tabOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  tabText: { fontWeight: Weight.semibold },
  tabTextOn: { color: Palette.accentText },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  rowText: { flex: 1, gap: 2 },
  thumb: { width: 64, height: 64, borderRadius: Radius.control, backgroundColor: Palette.panel },
  actions: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center', marginTop: 4 },
  quietBtn: { paddingHorizontal: Spacing.two, paddingVertical: 4, borderRadius: Radius.control, borderWidth: 1, borderColor: Palette.hairlineStrong },
  quietText: { fontWeight: Weight.semibold, fontSize: FontSize.sm },
  dangerBtn: { paddingHorizontal: Spacing.two, paddingVertical: 4, borderRadius: Radius.control, borderWidth: 1, borderColor: Palette.danger },
  dangerText: { fontWeight: Weight.semibold, fontSize: FontSize.sm, color: Palette.danger },
  error: { color: Palette.danger },
});
