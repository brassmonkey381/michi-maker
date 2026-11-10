/**
 * THE NEW-BINDER CHAT (MIC-017 piece 7, the sweep's "A conversation" option). A binder made by
 * answering a few questions, every answer a tap (or typed): which Pokémon, which look; page one
 * builds beside the chat as you answer, and "Make it" opens it in the editor.
 *
 * Same data and the same binder as the step wizard it sits behind (/new-binder): the cards are the
 * server's public card search (data/guestFill), the binder is store.createBinder with
 * pagesForCards, capped at the account's page limit. Behind the 'newbinder-chat' dev flag; the ad
 * funnel's step wizard is unchanged without it.
 */
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { CatalogCard } from 'tcgscan-browse';

import { ThemedView } from '@/components/themed-view';
import { Fonts, FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { pagesForCards } from '@/data/binderTypes';
import { fetchCardsWhere } from '@/data/guestFill';
import { where } from '@/data/guestFillQuery';
import { track } from '@/lib/analytics';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';
import { useBinders } from '@/store/binders';

type Msg = { from: 'bot' | 'me'; text: string };
type Look = 'rarest' | 'newest' | 'oldest' | 'mixed';

const FAVOURITES = ['Pikachu', 'Charizard', 'Eevee', 'Umbreon', 'Gengar', 'Mew'];
const LOOKS: { key: Look; label: string; says: string }[] = [
  { key: 'rarest', label: 'The rarest art', says: 'the rarest art first' },
  { key: 'newest', label: 'Newest first', says: 'the newest cards first' },
  { key: 'oldest', label: 'Oldest first', says: 'the oldest cards first' },
  { key: 'mixed', label: 'A bit of everything', says: 'a mix across the years' },
];
/** Rarer printings first, by the words their rarity carries. */
const RARITY_RANK = ['special illustration', 'hyper', 'illustration', 'secret', 'ultra', 'rainbow', 'full art', 'holo'];
const rarityRank = (c: CatalogCard) => {
  const r = c.rarity.toLowerCase();
  const i = RARITY_RANK.findIndex((w) => r.includes(w));
  return i < 0 ? RARITY_RANK.length : i;
};

/** Cards out by today (an unreleased printing has no picture yet). */
function released(cards: CatalogCard[]): CatalogCard[] {
  const today = new Date().toISOString().slice(0, 10);
  return cards.filter((c) => !c.releaseDate || c.releaseDate <= today);
}

function ordered(cards: readonly CatalogCard[], look: Look): CatalogCard[] {
  const xs = [...cards];
  if (look === 'rarest') return xs.sort((a, b) => rarityRank(a) - rarityRank(b) || b.releaseDate.localeCompare(a.releaseDate));
  if (look === 'newest') return xs.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  if (look === 'oldest') return xs.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  // A mix: every few years, round-robin by set, so page one is not one era.
  const bySet = new Map<string, CatalogCard[]>();
  for (const c of xs.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))) bySet.set(c.setId, [...(bySet.get(c.setId) ?? []), c]);
  const lanes = [...bySet.values()];
  const out: CatalogCard[] = [];
  for (let i = 0; out.length < xs.length; i += 1) for (const l of lanes) if (l[i]) out.push(l[i]);
  return out;
}

export function NewBinderChat() {
  const router = useRouter();
  const store = useBinders();
  const manifestReady = useImageManifest();
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const [msgs, setMsgs] = useState<Msg[]>([{ from: 'bot', text: 'Which Pokémon do you love most?' }]);
  const [step, setStep] = useState<'who' | 'look' | 'make'>('who');
  const [name, setName] = useState('');
  const [typed, setTyped] = useState('');
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [look, setLook] = useState<Look>('rarest');
  // A question being answered by the server: the chips wait (owner, 2026-11-10: busy buttons).
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const say = (more: Msg[]) => {
    setMsgs((m) => [...m, ...more]);
  };

  const pageCap = store.limits.pagesPerBinder;
  const shown = useMemo(() => ordered(cards, look), [cards, look]);
  const capped = shown.slice(0, pageCap * 9);
  const pageOne = shown.slice(0, 9);

  const pickWho = (raw: string) => {
    const q = raw.trim();
    if (q.length < 2 || busy) return;
    const nice = q.replace(/^\w/, (ch) => ch.toUpperCase());
    say([{ from: 'me', text: nice }]);
    setTyped('');
    setBusy(true);
    fetchCardsWhere(where.nameHas(q), ['en'])
      .then((found) => {
        const out = released(found);
        if (!out.length) {
          say([{ from: 'bot', text: `I could not find ${nice}. Try another name?` }]);
          return;
        }
        setName(nice);
        setCards(out);
        setStep('look');
        track('wizard.chat', { step: 'who', cards: out.length });
        say([{ from: 'bot', text: `${out.length} ${nice} cards. How should page one look?` }]);
      })
      .catch(() => say([{ from: 'bot', text: 'The card search did not answer. Try again in a moment.' }]))
      .finally(() => setBusy(false));
  };

  const pickLook = (l: (typeof LOOKS)[number]) => {
    setLook(l.key);
    setStep('make');
    track('wizard.chat', { step: 'look', look: l.key });
    const pages = pagesForCards(capped.length ? ordered(cards, l.key).slice(0, pageCap * 9).map((c) => c.id) : []).length;
    say([
      { from: 'me', text: l.label },
      { from: 'bot', text: `Here is page one: ${name} with ${l.says}. The binder will hold ${Math.min(cards.length, pageCap * 9)} cards on ${pages} page${pages === 1 ? '' : 's'}. Make it?` },
    ]);
  };

  const make = () => {
    const pages = pagesForCards(capped.map((c) => c.id));
    const made = store.createBinder({ title: name, pages });
    track('wizard.create', { wizard: 'chat', kind: 'pokemon', cards: capped.length, pages: pages.length, capped: shown.length > capped.length, ok: !!made });
    if (!made) {
      say([{ from: 'bot', text: 'This browser cannot save right now (another tab may be editing). Close the other tab and try again.' }]);
      return;
    }
    router.replace(`/binder/${made.id}?edit=1` as Href);
  };

  const restart = () => {
    setStep('who');
    setCards([]);
    setName('');
    say([{ from: 'bot', text: 'Sure. Which Pokémon this time?' }]);
  };

  const chips: { label: string; onPress: () => void; primary?: boolean }[] =
    step === 'who'
      ? FAVOURITES.map((f) => ({ label: f, onPress: () => pickWho(f) }))
      : step === 'look'
        ? LOOKS.map((l) => ({ label: l.label, onPress: () => pickLook(l) }))
        : [
            { label: 'Make it', onPress: make, primary: true },
            ...LOOKS.filter((l) => l.key !== look).slice(0, 2).map((l) => ({ label: l.label, onPress: () => pickLook(l) })),
            { label: 'Another Pokémon', onPress: restart },
          ];

  const pageW = wide ? 420 : Math.min(260, width - 2 * Spacing.three);
  const cell = Math.floor((pageW - 2 * 10 - 2 * 6) / 3);
  const page = (
    <View style={styles.pageWrap} testID="chat-page">
      <View style={[styles.page, { width: pageW }]}>
        {[0, 1, 2].map((r) => (
          <View key={r} style={styles.pageRow}>
            {[0, 1, 2].map((k) => {
              const c = pageOne[r * 3 + k];
              return (
                <View key={k} style={[styles.pocket, { width: cell, height: Math.round(cell * 1.397) }]}>
                  {c ? <Image source={{ uri: manifestReady ? cardThumbUrl(c.id, 'full') : '' }} style={styles.cardImg} contentFit="cover" /> : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <Text style={styles.pageLabel}>{pageOne.length ? `Page one of ${name}` : 'Page one builds as you answer'}</Text>
    </View>
  );

  const chat = (
    <View style={styles.chat}>
      <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} style={styles.thread} contentContainerStyle={styles.threadInner} testID="chat-thread">
        {msgs.map((m, i) => (
          <View key={i} style={[styles.bubble, m.from === 'me' ? styles.me : styles.bot]}>
            <Text style={[styles.bubbleText, m.from === 'me' && styles.meText]}>{m.text}</Text>
          </View>
        ))}
        {busy ? (
          <View style={[styles.bubble, styles.bot, styles.thinking]}>
            <ActivityIndicator size="small" color={Palette.muted} />
            <Text style={styles.bubbleText}>Looking…</Text>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.chips}>
        {chips.map((c) => (
          <Pressable
            key={c.label}
            onPress={c.onPress}
            disabled={busy}
            accessibilityRole="button"
            testID="chat-chip"
            style={({ pressed }) => [styles.chip, c.primary && styles.chipPrimary, (pressed || busy) && styles.dim]}>
            <Text style={[styles.chipText, c.primary && styles.chipPrimaryText]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
      {step === 'who' ? (
        <TextInput
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={() => pickWho(typed)}
          editable={!busy}
          placeholder="Or type a Pokémon"
          placeholderTextColor={Palette.muted}
          returnKeyType="send"
          style={styles.input}
          testID="chat-input"
        />
      ) : null}
    </View>
  );

  return (
    <ThemedView style={styles.screen} testID="new-binder-chat">
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="link">
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.headTitle}>New binder</Text>
        <View style={{ width: 50 }} />
      </View>
      {wide ? (
        <View style={styles.wide}>
          <View style={styles.wideChat}>{chat}</View>
          <View style={styles.widePage}>{page}</View>
        </View>
      ) : (
        <View style={styles.narrow}>
          {page}
          {chat}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  back: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.accent },
  headTitle: { fontFamily: Fonts?.brand, fontSize: FontSize.md, fontWeight: Weight.bold, color: Palette.ink },
  wide: { flex: 1, flexDirection: 'row', gap: 30, paddingHorizontal: 40, paddingBottom: 24, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  wideChat: { flex: 1, minWidth: 0 },
  widePage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  narrow: { flex: 1, gap: 12, paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
  chat: { flex: 1, gap: 10, minHeight: 0 },
  thread: { flex: 1 },
  threadInner: { gap: 10, paddingVertical: 8 },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10 },
  bot: { alignSelf: 'flex-start', backgroundColor: Palette.panel, borderRadius: 16, borderBottomLeftRadius: 4 },
  me: { alignSelf: 'flex-end', backgroundColor: Palette.accent, borderRadius: 16, borderBottomRightRadius: 4 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bubbleText: { fontSize: FontSize.md, color: Palette.ink, lineHeight: 21 },
  meText: { color: Palette.accentText },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.hairlineStrong, backgroundColor: Palette.panel },
  chipPrimary: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  chipText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink },
  chipPrimaryText: { color: Palette.accentText },
  dim: { opacity: 0.55 },
  input: { borderWidth: 1, borderColor: Palette.hairlineStrong, borderRadius: Radius.control, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: Palette.ink, backgroundColor: Palette.panel },
  pageWrap: { alignItems: 'center', gap: 8 },
  page: { padding: 10, gap: 6, borderRadius: 10, borderWidth: 1, borderColor: Palette.hairline, backgroundColor: Palette.panel },
  pageRow: { flexDirection: 'row', gap: 6 },
  pocket: { borderRadius: 6, backgroundColor: Palette.hairline, overflow: 'hidden' },
  cardImg: { width: '100%', height: '100%' },
  pageLabel: { fontSize: FontSize.sm, color: Palette.muted },
});
