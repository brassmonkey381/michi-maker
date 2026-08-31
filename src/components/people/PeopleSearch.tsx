/**
 * "Find people" window. Opened from the home header; searches public profiles by username
 * (debounced). Tapping a row opens their public profile (`/u/[id]`), where their public binders
 * (and binder likes) live. Private and nameless (guest) profiles never appear, for a typed query
 * exactly as for an empty one: both go through the one `search_profiles` RPC and its one
 * `is_public` gate.
 *
 * The two modes reach different sets on purpose. Scrolling BROWSES people who have published at
 * least one public binder, ranked by profile upvotes then total binder votes. Typing SEARCHES
 * everyone, ranked by how well the name matches first. Both page in blocks of PAGE rather than
 * stopping at a fixed 30, which is what used to make an account late in the alphabet unreachable
 * by scrolling however long you scrolled.
 */
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing, Weight } from '@/constants/theme';
import { profileHandle, searchProfiles, type PersonResult } from '@/data/profileRepo';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/store/auth';

/** Rows per request. Also the "is there another page" test: a short page is the last page. */
const PAGE = 30;

export function PeopleSearch({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonResult[] | null>(null);
  /** Whether the last page came back full, i.e. there may be another one. */
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const reqId = useRef(0);

  // Debounced first page; also loads the top profiles for an empty query when the window opens.
  // Every keystroke and every open bumps reqId, which is what invalidates anything in flight.
  useEffect(() => {
    if (!visible) return;
    const id = ++reqId.current;
    const handle = setTimeout(async () => {
      try {
        const rows = await searchProfiles(query.trim(), PAGE, 0);
        if (id !== reqId.current) return; // a newer query superseded this one
        setResults(rows);
        setMore(rows.length === PAGE);
      } catch {
        if (id === reqId.current) {
          setResults([]);
          setMore(false);
        }
      }
    }, 220);
    return () => clearTimeout(handle);
  }, [query, visible, user]);

  /**
   * The next page, appended. Guarded by the SAME reqId as the debounce: a keystroke landing while
   * this is in flight must discard the page rather than stitch another query's rows onto the list.
   */
  const loadMore = async () => {
    if (loadingMore || !results) return;
    const id = reqId.current;
    setLoadingMore(true);
    try {
      const rows = await searchProfiles(query.trim(), PAGE, results.length);
      if (id !== reqId.current) return;
      setResults((prev) => [...(prev ?? []), ...rows]);
      setMore(rows.length === PAGE);
    } catch {
      if (id === reqId.current) setMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  // `handle` is the person's username when they have one, else their id — see `profileHandle`.
  const open = (handle: string) => {
    onClose();
    // Cast: the typed-routes generator registers `/u/[id]` on the next dev-server run.
    router.push(`/u/${handle}` as Href);
  };

  const placeholder = useMemo(() => 'Search people by name…', []);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.header}>
              <ThemedText type="subtitle" style={styles.title}>
                Find people
              </ThemedText>
              <Pressable onPress={onClose} hitSlop={8}>
                <ThemedText type="link" themeColor="textSecondary">
                  Close
                </ThemedText>
              </Pressable>
            </View>

            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={placeholder}
              placeholderTextColor={Palette.muted}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />

            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {results === null ? (
                <View style={styles.center}>
                  <ActivityIndicator />
                </View>
              ) : results.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                  {query.trim()
                    ? `No people match “${query.trim()}”.`
                    : 'No one has published a public binder yet.'}
                </ThemedText>
              ) : (
                results.map((p) => {
                  const name = p.username ? `@${p.username}` : 'Unnamed collector';
                  const initial = (p.username || '?').trim().charAt(0).toUpperCase();
                  return (
                    <View key={p.id} style={styles.row}>
                      <Pressable style={styles.rowMain} onPress={() => open(profileHandle(p))} hitSlop={4}>
                        {p.avatarUrl ? (
                          <Image source={{ uri: p.avatarUrl }} style={styles.avatar} contentFit="cover" />
                        ) : (
                          <View style={styles.avatar}>
                            <ThemedText style={styles.avatarText}>{initial}</ThemedText>
                          </View>
                        )}
                        <View style={styles.nameCol}>
                          <ThemedText type="smallBold" numberOfLines={1}>
                            {name}
                          </ThemedText>
                        </View>
                      </Pressable>
                    </View>
                  );
                })
              )}

              {more ? (
                <Pressable
                  onPress={loadMore}
                  disabled={loadingMore}
                  style={styles.more}
                  accessibilityRole="button"
                  hitSlop={4}>
                  {loadingMore ? (
                    <ActivityIndicator />
                  ) : (
                    <ThemedText type="link" themeColor="textSecondary">
                      Show more
                    </ThemedText>
                  )}
                </Pressable>
              ) : null}
            </ScrollView>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Palette.scrim45,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  cardWrap: { width: '100%', maxWidth: 460 },
  card: { borderRadius: Radii.page, padding: Spacing.four, gap: Spacing.three, maxHeight: '92%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: FontSize.h2, lineHeight: 26 },
  input: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: FontSize.control,
  },
  // A fixed height (not a cap) so the window is roomy even with few results — about twice the
  // old 380 cap; the card's maxHeight still protects short viewports.
  list: { height: 720 },
  center: { paddingVertical: Spacing.five, alignItems: 'center' },
  more: { paddingVertical: Spacing.three, alignItems: 'center' },
  empty: { paddingVertical: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Palette.hairline,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.md },
  nameCol: { flex: 1 },
});
