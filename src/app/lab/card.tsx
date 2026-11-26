/**
 * /lab/card : the owner's card lab (MIC-080). Admins only; everyone else gets the not-found page.
 *
 * Find a card by name, query or id, and see everything the app can ask about it: the catalogue
 * fields the search grammar filters on, the art caption and scene tags where the catalogue ships
 * them, its palette and the colour families it counts in, prices, the raw row, and a query tester
 * that says per lane of Discover's search whether this card takes part. READ ONLY: no writes and
 * no analytics events.
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { labToSrgb, type CatalogCard, type CardPrices, type Lab } from 'tcgscan-browse';

import { Fold, LabButton, LabGate, LabInput, Line, Mono, Panel, labStyles } from '@/components/lab/LabUi';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import {
  cardPalette,
  cardPrices,
  catalogueCard,
  findCards,
  rawCardRow,
  testQueryOnCard,
  type CardPalette,
  type LaneVerdict,
} from '@/data/cardLabRepo';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';
import { getPriceSummary } from '@/lib/prices';

export default function CardLabScreen() {
  return <LabGate title="Card lab">{() => <CardLab />}</LabGate>;
}

function CardLab() {
  useImageManifest();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<CatalogCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<CatalogCard | null>(null);

  const search = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await findCards(text);
      setFound(r.cards);
      setError(r.error);
      if (r.cards.length === 1) setCard(r.cards[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <View style={labStyles.row}>
        <View style={[labStyles.grow, styles.box]}>
          <LabInput value={text} onChangeText={setText} onSubmitEditing={search} placeholder="Card name, query or id" returnKeyType="search" testID="lab-card-query" />
        </View>
        <LabButton label="Find" tone="primary" onPress={search} busy={busy} disabled={!text.trim()} />
      </View>
      {error ? <Line tone="danger">{error}</Line> : null}
      {found && !card ? (
        <Panel title={`${found.length} cards`}>
          {found.map((c) => (
            <Pressable key={c.id} onPress={() => setCard(c)} accessibilityRole="button" style={({ pressed }) => [styles.pick, pressed && styles.dim]}>
              <Line>{`${c.name}  ·  ${c.setName} ${c.number}  ·  ${c.rarity || 'no rarity'}`}</Line>
              <Mono tone="muted">{c.id}</Mono>
            </Pressable>
          ))}
        </Panel>
      ) : null}
      {card ? (
        <>
          <View style={labStyles.row}>
            <LabButton label="Back to results" onPress={() => setCard(null)} disabled={!found || found.length < 2} />
          </View>
          <CardDetail key={card.id} card={card} />
        </>
      ) : null}
    </View>
  );
}

/** The grammar's keys (tcgscan-browse parseQuery FieldKey and comparisons) and what this card holds for each. */
function grammarRows(c: CatalogCard): [string, string][] {
  return [
    ['name (bare words)', c.name],
    ['artist: / illustrator:', c.illustrator || '-'],
    ['rarity:', c.rarity || '-'],
    ['set:', `${c.setName || '-'}${c.setCode ? ` (${c.setCode})` : ''}`],
    ['series:', c.seriesId || '-'],
    ['type: / types:', [...c.types, ...c.cardType].join(', ') || '-'],
    ['stage:', c.stage || '-'],
    ['year: / date (comparisons)', c.releaseDate || '-'],
    ['num: / number:', c.number || '-'],
    ['lang: / language:', c.language],
    ['hp (comparisons)', c.hp == null ? '-' : String(c.hp)],
    ['stage (comparisons)', String(c.evolutionStage)],
    ['theme: / art: (captions)', c.sceneCaption ? c.sceneCaption : '(not in this card object)'],
    ['scene tags', c.sceneTags?.length ? c.sceneTags.join(', ') : '(not in this card object)'],
    ['full art kind', c.fullArtKind || '-'],
    ['full art', c.fullArt ? 'yes' : '(absent)'],
    ['frame', c.frame ?? '(absent)'],
    ['evolves from', c.evolvesFrom || '-'],
    ['evolution line', c.evolutionLine.join(' > ') || '-'],
    ['set id', c.setId || '-'],
    ['kind', c.kind],
  ];
}

const hexOf = (c: Lab) => {
  const { r, g, b } = labToSrgb(c.L, c.a, c.b);
  const h = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
};

function CardDetail({ card }: { card: CatalogCard }) {
  const [raw, setRaw] = useState<Awaited<ReturnType<typeof rawCardRow>> | null>(null);
  const [palette, setPalette] = useState<CardPalette | null>(null);
  const [prices, setPrices] = useState<{ history: CardPrices | null; summary: { cur: number; date: string; variants: Record<string, number> } | null } | null>(null);
  const [full, setFull] = useState<CatalogCard | null | 'loading'>(null);

  useEffect(() => {
    let live = true;
    void rawCardRow(card.id).then((r) => live && setRaw(r));
    void cardPalette(card.id).then((p) => live && setPalette(p));
    void cardPrices(card.id).then((p) => live && setPrices(p));
    return () => {
      live = false;
    };
  }, [card.id]);

  const shown = full && full !== 'loading' ? { ...card, ...full } : card;
  const thumb = cardThumbUrl(card.id, 245);

  return (
    <View style={styles.page}>
      <Panel title={`${card.name}  ·  ${card.setName} ${card.number}`} sub={card.id}>
        <View style={styles.head}>
          {thumb ? <Image source={{ uri: thumb }} style={styles.thumb} contentFit="contain" accessibilityLabel={card.name} /> : null}
          <View style={labStyles.grow}>
            {grammarRows(shown).map(([k, v]) => (
              <View key={k} style={styles.kv}>
                <Text style={styles.k}>{k}</Text>
                <Text selectable style={styles.v}>{v}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={labStyles.row}>
          <LabButton
            label={full === null ? 'Load the full catalogue (captions, if it ships them)' : full === 'loading' ? 'Loading' : full ? 'Full catalogue loaded' : 'Not in the full catalogue'}
            busy={full === 'loading'}
            disabled={full !== null}
            onPress={() => {
              setFull('loading');
              void catalogueCard(card.id).then((c) => setFull(c));
            }}
          />
        </View>
      </Panel>

      <Panel title="Colour" sub="The art palette from the colour index, and the families this card counts in for the page colour search (share 0.1 or more).">
        {!palette ? <Line tone="muted">Loading the palette index.</Line> : !palette.index ? <Line tone="danger">This card is not in the palette index.</Line> : (
          <>
            <Swatches title="art" colours={palette.art} />
            <Swatches title="no border" colours={palette.noborder} />
            {palette.families.map((f) => (
              <Mono key={f.family} tone={f.counts ? 'ok' : 'muted'}>{`${f.family.padEnd(7)} share ${f.share.toFixed(2)}  ${f.counts ? 'counts' : '-'}`}</Mono>
            ))}
          </>
        )}
      </Panel>

      <Panel title="Prices">
        {!prices ? <Line tone="muted">Loading prices.</Line> : (
          <>
            <Mono>{prices.summary ? `summary: $${prices.summary.cur} on ${prices.summary.date}  ${JSON.stringify(prices.summary.variants)}` : 'summary: none'}</Mono>
            {prices.history
              ? Object.entries(prices.history.variants).map(([variant, pts]) => {
                  const last = pts[pts.length - 1];
                  return <Mono key={variant}>{`${variant}: ${pts.length} points, last ${last ? `${last.d} market ${last.m ?? '-'} avg ${last.a ?? '-'} qty ${last.q}` : '-'}`}</Mono>;
                })
              : <Mono tone="muted">history: none</Mono>}
            <Mono tone="muted">{`product id: ${prices.history?.productId ?? '-'}`}</Mono>
          </>
        )}
      </Panel>

      <QueryTester card={shown} />

      <Panel title="Raw">
        {raw?.error ? <Mono tone="danger">{`raw row: ${raw.error}`}</Mono> : null}
        <Fold title={`raw row${raw?.source ? ` (${raw.source})` : ''}`}>{() => <LabInput multiline editable={false} value={JSON.stringify(raw?.row ?? null, null, 2)} />}</Fold>
        <Fold title="card object (kit)">{() => <LabInput multiline editable={false} value={JSON.stringify(shown, null, 2)} />}</Fold>
        <Fold title="palette">{() => <LabInput multiline editable={false} value={JSON.stringify(palette, null, 2)} />}</Fold>
      </Panel>
    </View>
  );
}

function Swatches({ title, colours }: { title: string; colours: Lab[] }) {
  return (
    <View style={styles.swatchRow}>
      <Text style={styles.k}>{title}</Text>
      {colours.map((c, i) => (
        <View key={i} style={styles.swatchItem}>
          <View style={[styles.swatch, { backgroundColor: hexOf(c) }]} />
          <Text selectable style={styles.swatchText}>{`${hexOf(c)} ${(c.w * 100).toFixed(0)}%`}</Text>
        </View>
      ))}
    </View>
  );
}

function QueryTester({ card }: { card: CatalogCard }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<LaneVerdict[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const summary = await getPriceSummary().catch(() => ({}) as Record<string, { cur: number }>);
      setOut(await testQueryOnCard(card, q, (id) => summary[id]?.cur ?? 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Test a query against this card" sub="Per lane of Discover's search: would this card count?">
      <View style={labStyles.row}>
        <View style={[labStyles.grow, styles.box]}>
          <LabInput value={q} onChangeText={setQ} onSubmitEditing={run} placeholder="e.g. rainy city, set:151, green" returnKeyType="go" />
        </View>
        <LabButton label="Test" tone="primary" onPress={run} busy={busy} disabled={!q.trim()} />
      </View>
      {error ? <Line tone="danger">{error}</Line> : null}
      {out?.map((v) => (
        <View key={v.lane} style={styles.kv}>
          <Text style={styles.k}>{v.lane}</Text>
          <Text selectable style={[styles.v, v.verdict === 'yes' && styles.yes, (v.verdict === 'no' || v.verdict === 'error') && styles.no]}>{`${v.verdict}: ${v.detail}`}</Text>
        </View>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  page: { gap: Spacing.three, paddingBottom: Spacing.five },
  box: { minWidth: 200 },
  pick: { minHeight: 44, justifyContent: 'center', paddingVertical: Spacing.one, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairline },
  dim: { opacity: 0.6 },
  head: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  thumb: { width: 160, height: 223, borderRadius: Radius.sm },
  kv: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, paddingVertical: Spacing.half },
  k: { fontSize: FontSize.label, color: Palette.muted, width: 190 },
  v: { fontSize: FontSize.body, color: Palette.ink, flexGrow: 1, flexShrink: 1, flexBasis: 160 },
  yes: { color: Palette.success },
  no: { color: Palette.danger },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  swatchItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  swatch: { width: 24, height: 24, borderRadius: Radius.sm, borderWidth: 1, borderColor: Palette.hairline },
  swatchText: { fontSize: FontSize.label, color: Palette.ink2 },
});
