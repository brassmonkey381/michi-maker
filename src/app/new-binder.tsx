/**
 * THE NEW-BINDER WIZARD (owner, 2026-11-05: "make a seeded wizard for all other mobile traffic,
 * similar to pkmnbindr. Take them to the landing page first, but then next should be a new
 * binder wizard"). Three screens, one question each, one button at the foot:
 *
 *   1. What kind of binder?   One Pokémon · One set · One artist · Three cards I like
 *   2. Which one?             a search box, or the set list; the count updates as they type,
 *                             and Create binder is the foot of the same screen (owner,
 *                             2026-11-05: no preview step)
 *
 * The cards come from the same anonymous questions guest fill asks the data server (cards by a
 * filter on the public columns, cards of a set, cards by id), so a guest gets a full binder with
 * no account. "Three cards I like" seeds a page the way a Reddit arrival's is seeded, and hands
 * over to the seeded walkthrough, whose first step is Complete.
 *
 * A phone's landing CTAs come here (welcome.tsx); a wide screen keeps the plain editor.
 */
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { fetchSetCards, getApiKey, getApiUrl, type CatalogCard } from 'tcgscan-browse';

import { AuthSheet } from '@/components/auth/AuthSheet';
import { CardBrowse } from '@/components/binder/CardBrowse';
import { Toast, type ToastSpec } from '@/components/binder/Toast';
import { cardPictureAction } from '@/lib/cardPicture';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { pagesForCards } from '@/data/binderTypes';
import { fetchCardsWhere } from '@/data/guestFill';
import { where } from '@/data/guestFillQuery';
import { track } from '@/lib/analytics';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';
import { useCatalog } from '@/hooks/use-catalog';
import { useBinders } from '@/store/binders';

type Kind = 'pokemon' | 'set' | 'artist' | 'three';

interface SetMeta {
  id: string;
  name: string;
  series: string;
  cardCount: number;
  logoUrl: string;
  releaseDate: string;
}

/** Cards out by today: an unreleased printing has no picture yet, and showed as a blank tile. */
function released(cards: CatalogCard[]): CatalogCard[] {
  const today = new Date().toISOString().slice(0, 10);
  return cards.filter((c) => !c.releaseDate || c.releaseDate <= today);
}

/** Every set with cards, newest first: the kit's own set question plus the release date. */
async function fetchSets(): Promise<SetMeta[]> {
  const url = getApiUrl();
  const key = getApiKey();
  if (!url || !key) return [];
  try {
    const res = await fetch(`${url}/sets?select=id,name,series,card_count,logo_url,release_date&order=release_date.desc.nullslast`, { headers: { apikey: key } });
    if (!res.ok) return [];
    const rows = (await res.json()) as { id: number | string; name: string | null; series: string | null; card_count: number | null; logo_url: string | null; release_date: string | null }[];
    return rows
      .filter((r) => (r.card_count ?? 0) > 0)
      .map((r) => ({ id: String(r.id), name: r.name ?? '', series: r.series ?? '', cardCount: r.card_count ?? 0, logoUrl: r.logo_url ?? '', releaseDate: r.release_date ?? '' }));
  } catch {
    return [];
  }
}

const KINDS: { key: Kind; title: string; body: string; note?: string }[] = [
  { key: 'pokemon', title: 'One Pokémon', body: 'Every card of one Pokémon, across every set.', note: 'Most made' },
  { key: 'set', title: 'One set', body: 'Every card from one set, in order.' },
  { key: 'artist', title: 'One artist', body: 'Every card one illustrator drew.' },
  { key: 'three', title: 'Three cards I like', body: 'Pick three. Use tools to complete the page by color, similarity, and theme.' },
];

const PLACEHOLDER: Record<Exclude<Kind, 'set' | 'three'>, string> = {
  pokemon: 'Pikachu, Charizard, Eevee…',
  artist: 'Mitsuhiro Arita, Kagemaru Himeno…',
};

/** The question the second screen asks, by kind. */
const ASK: Record<Kind, string> = {
  pokemon: 'Which Pokémon?',
  set: 'Which set?',
  artist: 'Which artist?',
  three: 'Pick three cards',
};

export default function NewBinderScreen() {
  const router = useRouter();
  // THE PICTURE LIST, LOADED AND WATCHED (2026-11-08). cardThumbUrl names a card's picture from the
  // image manifest, and nothing on this route loaded it: a guest who lands here first (the Reddit
  // wizard arm) saw every preview tile grey, since an empty URL never repaints. Home, Discover and
  // My Binders each call this; the wizard now does too, and the tiles read it, so they repaint
  // the moment the list lands.
  const manifestReady = useImageManifest();
  const store = useBinders();
  const { width } = useWindowDimensions();
  const [kind, setKind] = useState<Kind | null>(null);
  // The card sheet's Share picture says where the picture went (MIC-032).
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const toastId = useRef(0);
  const showToast = (message: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, message });
  };
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [picked, setPicked] = useState<CatalogCard[]>([]);
  const [sets, setSets] = useState<SetMeta[]>([]);
  const [set, setSet] = useState<SetMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [refused, setRefused] = useState(false);
  // A GUEST WHOSE BINDER WANTS MORE THAN THE GUEST CAP (owner, 2026-11-05): a modal, as soon as a
  // set over the cap is picked or Create is pressed on a search, with two ways on: an account, or
  // the first pages of what they chose. `capSeen` is the selection it was shown for, so it asks
  // once per pick and not again on the way back.
  const [capAsk, setCapAsk] = useState(false);
  const [capSeen, setCapSeen] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  // THE THREE PICKS COME FROM THE KIT'S BROWSER (owner, 2026-11-05: "use the browse kit to find
  // the cards. its so much more user friendly"): the same browser as a pocket's Add, its ＋ pill
  // picking a card, up to three.
  const { catalog } = useCatalog(kind === 'three');

  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    track('wizard.shown', { wizard: 'new-binder', width });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  // The set list, once, when asked for (from the kind's press, not an effect).
  const loadSets = () => {
    if (sets.length) return;
    setLoading(true);
    fetchSets()
      .then(setSets)
      .finally(() => setLoading(false));
  };

  // The search, debounced: cards by name, by illustrator, or by name for the three picks.
  useEffect(() => {
    if (!kind || kind === 'set' || kind === 'three') return;
    const q = query.trim();
    if (q.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      const filters = kind === 'artist' ? [`illustrator=ilike.*${q}*`] : where.nameHas(q);
      fetchCardsWhere(filters, ['en'])
        .then((found) => {
          if (live) setCards(released(found));
        })
        .finally(() => live && setLoading(false));
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [kind, query]);

  const chooseSet = (s: SetMeta) => {
    setSet(s);
    setLoading(true);
    fetchSetCards(s.id, ['en'])
      .then((found) => setCards(released(found)))
      .finally(() => setLoading(false));
  };

  // What the binder will hold: the picks, or the search, newest first as the server gives them.
  // A search box wiped below two letters shows nothing, whatever the last answer was.
  const found = kind === 'set' || query.trim().length >= 2 ? cards : [];
  const chosen = kind === 'three' ? picked : found;
  const pageCap = store.limits.pagesPerBinder;
  const cardCap = pageCap * 9;
  const capped = chosen.slice(0, cardCap);
  const title =
    kind === 'set' ? (set?.name ?? 'New binder') : kind === 'three' ? 'My picks' : query.trim() ? query.trim().replace(/^\w/, (ch) => ch.toUpperCase()) : 'New binder';
  const ready = kind === 'three' ? picked.length === 3 : capped.length > 0;

  const wantPages = pagesForCards(chosen.map((c) => c.id)).length;
  const overCap = store.tier === 'guest' && chosen.length > capped.length;
  const askCap = () => {
    setCapAsk(true);
    track('wizard.cap_ask', { wizard: 'new-binder', kind, cards: chosen.length, pages: wantPages, cap: pageCap });
  };
  // A set is one pick, so the question comes with it; a typed name settles only on Create.
  const setKey = kind === 'set' && set && overCap && !loading ? set.id : null;
  if (setKey && capSeen !== setKey) {
    setCapSeen(setKey);
    askCap();
  }
  const createLabel = ready
    ? `Create binder · ${overCap ? `${capped.length} / ${chosen.length}` : capped.length} ${chosen.length === 1 ? 'card' : 'cards'}`
    : 'Create binder';
  const create = (truncate = false) => {
    if (!kind) return;
    if (!truncate && store.tier === 'guest' && chosen.length > capped.length) {
      askCap();
      return;
    }
    const pages = pagesForCards(capped.map((c) => c.id));
    const made = store.createBinder({ title, pages }, kind === 'three' ? { seed: { theme: 'wizard-three' } } : undefined);
    track('wizard.create', { wizard: 'new-binder', kind, cards: capped.length, pages: pages.length, capped: chosen.length > capped.length, ok: !!made });
    if (!made) {
      setRefused(true);
      return;
    }
    router.replace(`/binder/${made.id}?edit=1${kind === 'three' ? '&seeded=wizard' : ''}` as Href);
  };

  const step = kind ? 2 : 1;
  const back = () => {
    if (kind) {
      setKind(null);
      setQuery('');
      setCards([]);
      setPicked([]);
      setSet(null);
    } else if (router.canGoBack()) router.back();
    // Arrived by replace (the landing page's Start building): there is no history to go back to,
    // so Cancel did nothing (owner, 2026-11-05). Home is where a guest without a binder belongs.
    else router.replace('/');
  };

  const gridW = Math.min(width - Spacing.three * 2, 420);

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.top}>
        <Pressable onPress={back} hitSlop={10} accessibilityRole="button" accessibilityLabel={step === 1 ? 'Cancel' : 'Back'} testID="wizard-back">
          <Text style={styles.topLink}>{step === 1 ? 'Cancel' : '‹ Back'}</Text>
        </Pressable>
        <Text style={styles.stepText}>STEP {step} / 2</Text>
      </View>

      {step === 1 ? (
        <View style={styles.body}>
          <ThemedText type="title" style={styles.h1}>
            What kind of binder?
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.sub}>
            Pick a starting point. You can change anything later.
          </ThemedText>
          {KINDS.map((k) => (
            <Pressable
              key={k.key}
              onPress={() => {
                setKind(k.key);
                if (k.key === 'set') loadSets();
                track('wizard.kind', { wizard: 'new-binder', kind: k.key });
              }}
              accessibilityRole="button"
              testID={`wizard-kind-${k.key}`}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
              {k.note ? (
                <View style={styles.note}>
                  <Text style={styles.noteText}>{k.note}</Text>
                </View>
              ) : null}
              <Text style={styles.optionTitle}>{k.title}</Text>
              <Text style={styles.optionBody}>{k.body}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {step === 2 && kind ? (
        <View style={styles.body}>
          <ThemedText type="title" style={styles.h1}>
            {ASK[kind]}
          </ThemedText>
          {kind === 'three' ? (
            <>
              {/* NOTHING SAID UNTIL A CARD IS PICKED (owner, 2026-11-05: "let them drill down and
                  figure out how to add cards themselves"). The browser is the whole screen; the
                  picks row appears with the first pick and carries the count. */}
              {picked.length ? (
                <View style={styles.picks}>
                  <Text style={styles.pickCount}>{picked.length} of 3</Text>
                  {picked.map((c) => (
                    <Pressable key={c.id} onPress={() => setPicked((p) => p.filter((x) => x.id !== c.id))} accessibilityRole="button" accessibilityLabel={`Remove ${c.name}`}>
                      <Image source={{ uri: manifestReady ? cardThumbUrl(c.id, 'full') : '' }} style={styles.pickThumb} contentFit="cover" />
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View style={styles.browse} testID="wizard-browse">
                <CardBrowse
                  catalog={catalog}
                  moreCardActions={() => [cardPictureAction('wizard', showToast)]}
                  onPickCard={(_id, card) => {
                    if (!card) return;
                    setPicked((p) => (p.some((x) => x.id === card.id) ? p.filter((x) => x.id !== card.id) : p.length < 3 ? [...p, card] : p));
                  }}
                  quickAction={(card) => ({
                    key: 'wizard-pick',
                    label: picked.some((x) => x.id === card.id) ? '✓' : '＋',
                    onPress: (c) => setPicked((p) => (p.some((x) => x.id === c.id) ? p.filter((x) => x.id !== c.id) : p.length < 3 ? [...p, c] : p)),
                  })}
                />
              </View>
            </>
          ) : kind === 'set' ? (
            <>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search sets"
                placeholderTextColor={Palette.muted}
                style={styles.input}
                autoCorrect={false}
                testID="wizard-query"
              />
              {set ? (
                <View style={styles.chosenSet}>
                  <Text style={styles.chosenSetName}>{set.name}</Text>
                  <Text style={styles.countLine}>
                    {loading ? 'Loading…' : `${cards.length} cards · ${Math.max(1, Math.ceil(cards.length / 9))} pages`}
                  </Text>
                </View>
              ) : null}
              <ScrollView style={styles.setList} keyboardShouldPersistTaps="handled">
                {sets
                  .filter((s) => !query.trim() || `${s.name} ${s.series}`.toLowerCase().includes(query.trim().toLowerCase()))
                  .slice(0, 40)
                  .map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() => chooseSet(s)}
                      accessibilityRole="button"
                      testID={`wizard-set-${s.id}`}
                      style={({ pressed }) => [styles.setRow, set?.id === s.id && styles.setRowOn, pressed && styles.pressed]}>
                      {s.logoUrl ? <Image source={{ uri: s.logoUrl }} style={styles.setLogo} contentFit="contain" /> : <View style={styles.setLogo} />}
                      <View style={styles.setWords}>
                        <Text style={styles.setName} numberOfLines={1}>
                          {s.name}
                        </Text>
                        <Text style={styles.setMeta} numberOfLines={1}>
                          {s.series} · {s.cardCount} cards
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                {!sets.length && loading ? <ActivityIndicator style={styles.spinner} /> : null}
              </ScrollView>
            </>
          ) : (
            <>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={PLACEHOLDER[kind]}
                placeholderTextColor={Palette.muted}
                style={styles.input}
                autoCorrect={false}
                autoFocus
                testID="wizard-query"
              />
              <Text style={styles.countLine}>
                {loading
                  ? 'Searching…'
                  : query.trim().length < 2
                    ? 'Type a name to see every printing across all sets.'
                    : found.length
                      ? `${found.length} cards · ${Math.max(1, Math.ceil(found.length / 9))} pages`
                      : 'Nothing found. Try another spelling.'}
              </Text>
              <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
                <View style={styles.grid}>
                  {found.slice(0, 60).map((c) => (
                    <View key={c.id} testID={`wizard-card-${c.id}`} style={[styles.tile, { width: (gridW - 16) / 3 }]}>
                      <Image source={{ uri: manifestReady ? cardThumbUrl(c.id, 'full') : '' }} style={styles.tileImg} contentFit="cover" />
                    </View>
                  ))}
                </View>
              </ScrollView>
            </>
          )}
        </View>
      ) : null}

      {step > 1 ? (
        <View style={styles.foot}>
          {refused ? (
            <View style={styles.refused}>
              <Text style={styles.refusedText}>You already have a binder. Open it, or make room for another with a free account.</Text>
              <Pressable onPress={() => router.replace('/my-binders' as Href)} accessibilityRole="button" style={styles.secondary}>
                <Text style={styles.secondaryText}>Go to my binders</Text>
              </Pressable>
            </View>
          ) : null}
          {chosen.length > capped.length && store.tier !== 'guest' ? <Text style={styles.capLine}>The first {cardCap} cards go in. PRO holds more.</Text> : null}
          <Pressable
            onPress={() => create()}
            disabled={!ready || loading}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready || loading }}
            testID="wizard-create"
            style={({ pressed }) => [styles.primary, (!ready || loading) && styles.primaryOff, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>{createLabel}</Text>
          </Pressable>
        </View>
      ) : null}
      {/* THE GUEST CAP (owner, 2026-11-05): a modal over the picks. Create keeps the first pages;
          an account lifts the cap; the cross goes back to the picks, where the button still says
          81 / NNN. */}
      <Modal visible={capAsk} transparent animationType="fade" onRequestClose={() => setCapAsk(false)}>
        <View style={styles.capBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCapAsk(false)} accessibilityLabel="Close" />
          <View style={styles.capAsk} testID="wizard-cap-ask">
            <Text style={styles.capAskTitle}>This binder wants {wantPages} pages</Text>
            <Text style={styles.refusedText}>A guest binder holds {pageCap}. Try unlimited pages with a free account.</Text>
            <View style={styles.capAskRow}>
              <Pressable onPress={() => { setCapAsk(false); create(true); }} accessibilityRole="button" testID="wizard-cap-truncate" style={({ pressed }) => [styles.primary, styles.capAskBtn, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>Create binder · {capped.length} / {chosen.length} cards</Text>
              </Pressable>
              <Pressable onPress={() => { setCapAsk(false); setAuthOpen(true); }} accessibilityRole="button" testID="wizard-cap-account" style={({ pressed }) => [styles.secondary, styles.capAskBtn, styles.capAskSecondary, pressed && styles.pressed]}>
                <Text style={styles.secondaryText}>Create an account</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <AuthSheet visible={authOpen} onClose={() => setAuthOpen(false)} />
      <Toast spec={toast} onDismiss={() => setToast(null)} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  topLink: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: Palette.accent },
  stepText: { fontSize: FontSize.xs, fontWeight: Weight.bold, letterSpacing: 1, color: Palette.muted },
  body: { paddingHorizontal: Spacing.three, gap: Spacing.two, flex: 1 },
  h1: { marginBottom: 2 },
  sub: { marginBottom: Spacing.two },
  option: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.panel,
    padding: Spacing.three,
    paddingRight: 36,
    gap: 4,
    backgroundColor: Palette.surface,
  },
  optionTitle: { fontSize: FontSize.lg, fontWeight: Weight.bold, color: Palette.ink },
  optionBody: { fontSize: FontSize.body, lineHeight: 20, color: Palette.ink2 },
  chevron: { position: 'absolute', right: 14, top: '50%', marginTop: -2, fontSize: 22, color: Palette.muted },
  note: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill, backgroundColor: Palette.accentSoft, marginBottom: 2 },
  noteText: { fontSize: FontSize.xs, fontWeight: Weight.bold, color: Palette.accent },
  input: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: FontSize.lg,
    color: Palette.ink,
    backgroundColor: Palette.surface,
  },
  countLine: { fontSize: FontSize.body, color: Palette.ink2, lineHeight: 20 },
  picks: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickCount: { fontSize: FontSize.sm, fontWeight: Weight.bold, color: Palette.ink2, width: 44 },
  pickThumb: { width: 54, height: 75, borderRadius: 6, borderWidth: 2, borderColor: Palette.accent },
  results: { flex: 1, minHeight: 200 },
  browse: { flex: 1, minHeight: 320, marginHorizontal: -Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 100 },
  tile: { aspectRatio: 63 / 88, borderRadius: 8, overflow: 'hidden', backgroundColor: Palette.panel },
  tileOn: { borderWidth: 3, borderColor: Palette.accent },
  tileImg: { width: '100%', height: '100%' },
  tick: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: Palette.accent, alignItems: 'center', justifyContent: 'center' },
  tickText: { color: Palette.accentText, fontWeight: Weight.bold },
  setList: { flex: 1, minHeight: 200 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 6, borderRadius: Radius.control },
  setRowOn: { backgroundColor: Palette.accentSoft },
  setLogo: { width: 64, height: 32 },
  setWords: { flex: 1, minWidth: 0 },
  setName: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: Palette.ink },
  setMeta: { fontSize: FontSize.sm, color: Palette.muted },
  chosenSet: { gap: 2 },
  chosenSetName: { fontSize: FontSize.lg, fontWeight: Weight.bold, color: Palette.ink },
  spinner: { marginTop: Spacing.three },
  previewWrap: { alignItems: 'center', marginTop: Spacing.two },
  pageLine: { textAlign: 'center', fontSize: FontSize.sm, color: Palette.muted },
  refused: { gap: Spacing.two, marginTop: Spacing.two },
  capBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: Spacing.three },
  capAsk: { alignSelf: 'stretch', maxWidth: 440, gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.sheet, backgroundColor: Palette.surface },
  capAskTitle: { fontSize: FontSize.md, fontWeight: Weight.bold, color: Palette.ink },
  capAskRow: { gap: Spacing.two },
  capAskBtn: { alignSelf: 'stretch', alignItems: 'center' },
  capAskSecondary: { height: 50, justifyContent: 'center', borderRadius: Radius.control },
  refusedText: { fontSize: FontSize.body, color: Palette.ink2, lineHeight: 20 },
  secondary: { alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 16, borderRadius: Radius.pill, borderWidth: 1.5, borderColor: Palette.accent },
  secondaryText: { color: Palette.accent, fontWeight: Weight.bold },
  foot: { padding: Spacing.three, paddingBottom: Spacing.four, gap: Spacing.two },
  capLine: { fontSize: FontSize.sm, color: Palette.muted, textAlign: 'center' },
  primary: { height: 50, borderRadius: Radius.control, backgroundColor: Palette.accent, alignItems: 'center', justifyContent: 'center' },
  primaryOff: { opacity: 0.4 },
  primaryText: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.accentText },
  pressed: { opacity: 0.7 },
});
