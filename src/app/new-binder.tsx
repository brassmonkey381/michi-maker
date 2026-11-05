/**
 * THE NEW-BINDER WIZARD (owner, 2026-11-05: "make a seeded wizard for all other mobile traffic,
 * similar to pkmnbindr. Take them to the landing page first, but then next should be a new
 * binder wizard"). Three screens, one question each, one button at the foot:
 *
 *   1. What kind of binder?   One Pokémon · One set · One artist · Three cards I like
 *   2. Which one?             a search box, or the set list; the count updates as they type
 *   3. Preview                page one drawn, the count, Create binder
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
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { fetchSetCards, getApiKey, getApiUrl, type CatalogCard } from 'tcgscan-browse';

import { BinderGrid } from '@/components/binder/BinderGrid';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { pagesForCards } from '@/data/binderTypes';
import { fetchCardsWhere } from '@/data/guestFill';
import { where } from '@/data/guestFillQuery';
import { track } from '@/lib/analytics';
import { cardThumbUrl } from '@/lib/catalogConfig';
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
  { key: 'three', title: 'Three cards I like', body: 'Pick three. Complete fills the page to match them, and you take it from there.' },
];

const PLACEHOLDER: Record<Exclude<Kind, 'set'>, string> = {
  pokemon: 'Pikachu, Charizard, Eevee…',
  artist: 'Mitsuhiro Arita, Kagemaru Himeno…',
  three: 'Search a card by name',
};

/** The question the second screen asks, by kind. */
const ASK: Record<Kind, string> = {
  pokemon: 'Which Pokémon?',
  set: 'Which set?',
  artist: 'Which artist?',
  three: 'Which three cards?',
};

export default function NewBinderScreen() {
  const router = useRouter();
  const store = useBinders();
  const { width } = useWindowDimensions();
  const [kind, setKind] = useState<Kind | null>(null);
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [picked, setPicked] = useState<CatalogCard[]>([]);
  const [sets, setSets] = useState<SetMeta[]>([]);
  const [set, setSet] = useState<SetMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [refused, setRefused] = useState(false);

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
    if (!kind || kind === 'set') return;
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
  const pageCount = Math.max(1, Math.ceil(capped.length / 9));
  const previewPage = useMemo(() => pagesForCards(capped.slice(0, 9).map((c) => c.id))[0], [capped]);
  const title =
    kind === 'set' ? (set?.name ?? 'New binder') : kind === 'three' ? 'My picks' : query.trim() ? query.trim().replace(/^\w/, (ch) => ch.toUpperCase()) : 'New binder';
  const ready = kind === 'three' ? picked.length === 3 : capped.length > 0;

  const create = () => {
    if (!kind) return;
    const pages = pagesForCards(capped.map((c) => c.id));
    const made = store.createBinder({ title, pages }, kind === 'three' ? { seed: { theme: 'wizard-three' } } : undefined);
    track('wizard.create', { wizard: 'new-binder', kind, cards: capped.length, pages: pages.length, capped: chosen.length > capped.length, ok: !!made });
    if (!made) {
      setRefused(true);
      return;
    }
    router.replace(`/binder/${made.id}?edit=1${kind === 'three' ? '&seeded=1' : ''}` as Href);
  };

  const step = preview ? 3 : kind ? 2 : 1;
  const back = () => {
    if (preview) setPreview(false);
    else if (kind) {
      setKind(null);
      setQuery('');
      setCards([]);
      setPicked([]);
      setSet(null);
    } else router.back();
  };

  const gridW = Math.min(width - Spacing.three * 2, 420);

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
      <View style={styles.top}>
        <Pressable onPress={back} hitSlop={10} accessibilityRole="button" accessibilityLabel={step === 1 ? 'Cancel' : 'Back'} testID="wizard-back">
          <Text style={styles.topLink}>{step === 1 ? 'Cancel' : '‹ Back'}</Text>
        </Pressable>
        <Text style={styles.stepText}>STEP {step} / 3</Text>
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
          {kind === 'set' ? (
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
                    ? kind === 'three'
                      ? 'Type a name to see its cards. Tap three.'
                      : 'Type a name to see every printing across all sets.'
                    : found.length
                      ? kind === 'three'
                        ? `${found.length} cards · ${picked.length} of 3 picked`
                        : `${found.length} cards · ${Math.max(1, Math.ceil(found.length / 9))} pages`
                      : 'Nothing found. Try another spelling.'}
              </Text>
              {kind === 'three' && picked.length ? (
                <View style={styles.picks}>
                  {picked.map((c) => (
                    <Pressable key={c.id} onPress={() => setPicked((p) => p.filter((x) => x.id !== c.id))} accessibilityRole="button" accessibilityLabel={`Remove ${c.name}`}>
                      <Image source={{ uri: cardThumbUrl(c.id, 'full') }} style={styles.pickThumb} contentFit="cover" />
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
                <View style={styles.grid}>
                  {found.slice(0, 60).map((c) => {
                    const on = picked.some((p) => p.id === c.id);
                    return (
                      <Pressable
                        key={c.id}
                        disabled={kind !== 'three'}
                        onPress={() => setPicked((p) => (on ? p.filter((x) => x.id !== c.id) : p.length < 3 ? [...p, c] : p))}
                        accessibilityRole={kind === 'three' ? 'button' : undefined}
                        accessibilityState={kind === 'three' ? { selected: on } : undefined}
                        testID={`wizard-card-${c.id}`}
                        style={[styles.tile, { width: (gridW - 16) / 3 }, on && styles.tileOn]}>
                        <Image source={{ uri: cardThumbUrl(c.id, 'full') }} style={styles.tileImg} contentFit="cover" />
                        {on ? (
                          <View style={styles.tick}>
                            <Text style={styles.tickText}>✓</Text>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </>
          )}
        </View>
      ) : null}

      {step === 3 && kind ? (
        <View style={styles.body}>
          <ThemedText type="title" style={styles.h1}>
            {title}
          </ThemedText>
          <Text style={styles.countLine}>
            {capped.length} cards · {pageCount} {pageCount === 1 ? 'page' : 'pages'}
            {chosen.length > capped.length ? ` · the first ${cardCap}; a free account holds more` : ''}
          </Text>
          <View style={styles.previewWrap}>
            <BinderGrid page={previewPage} width={gridW} />
          </View>
          {pageCount > 1 ? <Text style={styles.pageLine}>page 1 of {pageCount}</Text> : null}
          {refused ? (
            <View style={styles.refused}>
              <Text style={styles.refusedText}>You already have a binder. Open it, or make room for another with a free account.</Text>
              <Pressable onPress={() => router.replace('/my-binders' as Href)} accessibilityRole="button" style={styles.secondary}>
                <Text style={styles.secondaryText}>Go to my binders</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {step > 1 ? (
        <View style={styles.foot}>
          <Pressable
            onPress={() => {
              if (step === 2) {
                track('wizard.preview', { wizard: 'new-binder', kind, cards: capped.length });
                setPreview(true);
              } else create();
            }}
            disabled={!ready || loading}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready || loading }}
            testID={step === 2 ? 'wizard-preview' : 'wizard-create'}
            style={({ pressed }) => [styles.primary, (!ready || loading) && styles.primaryOff, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>{step === 2 ? 'Preview binder' : `Create binder · ${capped.length} ${capped.length === 1 ? 'card' : 'cards'}`}</Text>
          </Pressable>
        </View>
      ) : null}
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
  picks: { flexDirection: 'row', gap: 8 },
  pickThumb: { width: 54, height: 75, borderRadius: 6, borderWidth: 2, borderColor: Palette.accent },
  results: { flex: 1, minHeight: 200 },
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
  refusedText: { fontSize: FontSize.body, color: Palette.ink2, lineHeight: 20 },
  secondary: { alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 16, borderRadius: Radius.pill, borderWidth: 1.5, borderColor: Palette.accent },
  secondaryText: { color: Palette.accent, fontWeight: Weight.bold },
  foot: { padding: Spacing.three, paddingBottom: Spacing.four },
  primary: { height: 50, borderRadius: Radius.control, backgroundColor: Palette.accent, alignItems: 'center', justifyContent: 'center' },
  primaryOff: { opacity: 0.4 },
  primaryText: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.accentText },
  pressed: { opacity: 0.7 },
});
