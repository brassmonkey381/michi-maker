/**
 * FIND ART FOR THIS PAGE (owner, 2026-10-13). The page's cards name the subject; the sheet offers
 * one tuned search per source, in a new tab, and the person brings back what they choose through
 * the paste or Upload path that already hosts it as their own art. See data/pageArtSubject.ts for
 * why this finds and never fetches.
 *
 * The subject is editable: a page the parser reads as "Pikachu" may be meant as "Pikachu in the
 * rain", and a page with no pattern is simply a box to type in.
 */
import { useMemo, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { sheet } from '@/constants/ui';
import { track } from '@/lib/analytics';
import { resolveCatalogCardWith } from '@/data/cardResolver';
import { type PageSubject, artSearchLinks, pageSubject } from '@/data/pageArtSubject';
import { useCatalog } from '@/hooks/use-catalog';
import { useTheme } from '@/hooks/use-theme';

/**
 * The subject of a page, from its card ids. Loads the catalog when `enabled` (the sheet is open),
 * the way CardPicker does on open, so an editor session that never asks never pays for it.
 */
export function usePageArtSubject(cardIds: readonly string[], title: string | null | undefined, enabled: boolean): {
  subject: PageSubject;
  loading: boolean;
} {
  const { catalog, loading } = useCatalog(enabled);
  const subject = useMemo(() => {
    const cards = cardIds
      .map((id) => resolveCatalogCardWith(catalog, id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ name: c.name, isPokemon: c.hp != null || c.cardType.some((t) => /pok[eé]mon/i.test(t)) }));
    return pageSubject(cards, title);
  }, [catalog, cardIds, title]);
  return { subject, loading: enabled && !catalog && loading };
}

export function openArtSearch(url: string) {
  track('art.link');
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
  else void Linking.openURL(url).catch(() => {});
}

export function FindArtSheet({
  cardIds,
  pageTitle,
  onClose,
}: {
  cardIds: readonly string[];
  pageTitle?: string | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { subject, loading } = usePageArtSubject(cardIds, pageTitle, true);
  // Null until the person types, so the box follows the parser's answer, which lands once the
  // catalog has loaded, and then stops following it.
  const [typed, setTyped] = useState<string | null>(null);
  const query = (typed ?? subject.query).trim();
  const links = query ? artSearchLinks(query) : [];
  const basis =
    subject.basis === 'species'
      ? `Most of the cards on this page are ${subject.label}.`
      : subject.basis === 'pair'
        ? `This page is mostly ${subject.label}.`
        : subject.basis === 'title'
          ? 'The cards share no one Pokémon, so this is the page title.'
          : loading
            ? 'Reading the cards on this page…'
            : 'No pattern in these cards. Type what you are looking for.';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={sheet.dialogBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <ThemedView type="backgroundElement" style={[sheet.dialogCard, styles.card]} testID="find-art-sheet">
          <View style={styles.head}>
            <ThemedText type="subtitle">Find art for this page</ThemedText>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.basis}>{basis}</Text>
          <TextInput
            value={typed ?? subject.query}
            onChangeText={setTyped}
            placeholder="What to search for"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            testID="find-art-query"
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected, backgroundColor: theme.background }]}
          />
          <ScrollView contentContainerStyle={styles.list}>
            <Text style={styles.responsibility}>
              michi-maker is a layout tool for art you supply. Each link below searches one site for
              this page&apos;s subject. Only use pictures you have the right to use, and credit the
              artist and source. You are responsible for the art you add.
            </Text>
            {links.map((l) => (
              <Pressable
                key={l.title}
                onPress={() => openArtSearch(l.url)}
                accessibilityRole="link"
                testID={`find-art-${l.title.split(/[ ,]/)[0].toLowerCase()}`}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <View style={styles.rowHead}>
                  <Text style={styles.rowTitle}>{l.title} ↗</Text>
                  <Text style={[styles.tag, l.dragFriendly ? styles.tagGood : styles.tagWarn]}>
                    {l.dragFriendly ? 'drag-drop OK' : 'save, then Upload'}
                  </Text>
                </View>
                <Text style={styles.blurb}>{l.blurb}</Text>
              </Pressable>
            ))}
            {links.length ? (
              <Text style={styles.note}>
                Open a search in its own tab. Drag a picture straight onto the Slice Studio, or save
                it and Upload it there. What you bring is stored with your binder, as your own art.
              </Text>
            ) : null}
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 520, maxHeight: '85%', gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { fontSize: FontSize.md, fontWeight: Weight.semibold, color: Palette.accent },
  basis: { fontSize: FontSize.sm, color: Palette.muted, lineHeight: 17 },
  input: { borderWidth: 1, borderRadius: Radius.control, paddingHorizontal: 10, paddingVertical: 8, fontSize: FontSize.control },
  list: { gap: 10, paddingBottom: 12 },
  responsibility: { fontSize: FontSize.sm, color: Palette.ink4, lineHeight: 17 },
  row: { gap: 2, padding: 10, borderRadius: Radius.control, backgroundColor: Palette.panel },
  pressed: { opacity: 0.7 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowTitle: { fontSize: FontSize.md, fontWeight: Weight.semibold, color: Palette.accent },
  tag: { fontSize: FontSize.xs, fontWeight: Weight.semibold },
  tagGood: { color: Palette.accent },
  tagWarn: { color: Palette.muted2 },
  blurb: { fontSize: FontSize.sm, color: Palette.ink4, lineHeight: 17 },
  note: { fontSize: FontSize.sm, color: Palette.muted3, marginTop: 6, lineHeight: 16 },
});
