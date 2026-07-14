/**
 * "Find people" search window. Opened from the home header; searches public profiles by name /
 * username (debounced) and lists them ranked by upvotes. Each row shows the person's upvote count
 * with an inline upvote control, and tapping a row opens their public profile (`/u/[id]`).
 * Private and nameless (guest) profiles never appear (the search RPC filters them out).
 */
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { UpvoteButton } from '@/components/people/UpvoteButton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing, Weight } from '@/constants/theme';
import { fetchUpvotedSet, searchProfiles, type PersonResult } from '@/data/profileRepo';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/store/auth';

export function PeopleSearch({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonResult[] | null>(null);
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [needAccount, setNeedAccount] = useState(false);
  const reqId = useRef(0);

  // Debounced search; also loads the top profiles for an empty query when the window opens.
  useEffect(() => {
    if (!visible) return;
    const id = ++reqId.current;
    const handle = setTimeout(async () => {
      try {
        const rows = await searchProfiles(query.trim());
        if (id !== reqId.current) return; // a newer query superseded this one
        setResults(rows);
        // Reflect which of these the signed-in user has already upvoted.
        if (user && rows.length > 0) {
          const set = await fetchUpvotedSet(
            user.id,
            rows.map((r) => r.id),
          );
          if (id === reqId.current) setVoted(set);
        } else {
          setVoted(new Set());
        }
      } catch {
        if (id === reqId.current) setResults([]);
      }
    }, 220);
    return () => clearTimeout(handle);
  }, [query, visible, user]);

  const open = (id: string) => {
    onClose();
    // Cast: the typed-routes generator registers `/u/[id]` on the next dev-server run.
    router.push(`/u/${id}` as Href);
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

            {needAccount ? (
              <ThemedText type="small" themeColor="textSecondary">
                Sign in with an account to upvote people.
              </ThemedText>
            ) : null}

            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {results === null ? (
                <View style={styles.center}>
                  <ActivityIndicator />
                </View>
              ) : results.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                  {query.trim() ? `No people match “${query.trim()}”.` : 'No public profiles yet.'}
                </ThemedText>
              ) : (
                results.map((p) => {
                  const name = p.username ? `@${p.username}` : 'Unnamed collector';
                  const initial = (p.username || '?').trim().charAt(0).toUpperCase();
                  return (
                    <View key={p.id} style={styles.row}>
                      <Pressable style={styles.rowMain} onPress={() => open(p.id)} hitSlop={4}>
                        <View style={styles.avatar}>
                          <ThemedText style={styles.avatarText}>{initial}</ThemedText>
                        </View>
                        <View style={styles.nameCol}>
                          <ThemedText type="smallBold" numberOfLines={1}>
                            {name}
                          </ThemedText>
                        </View>
                      </Pressable>
                      <UpvoteButton
                        profileId={p.id}
                        initialCount={p.upvotes}
                        initialUpvoted={voted.has(p.id)}
                        onNeedsAccount={() => setNeedAccount(true)}
                      />
                    </View>
                  );
                })
              )}
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
  card: { borderRadius: Radii.page, padding: Spacing.four, gap: Spacing.three, maxHeight: '82%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: FontSize.h2, lineHeight: 26 },
  input: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: FontSize.control,
  },
  list: { maxHeight: 380 },
  center: { paddingVertical: Spacing.five, alignItems: 'center' },
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
