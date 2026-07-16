/**
 * The plan comparison table — the /subscriptions centerpiece. Ported from the approved draft
 * sheet layout: capability rows down the left, ascending plan columns (Free → PRO → VIP), PRO
 * raised + accent-outlined ("Most popular", yearly price leading), VIP the filled accent hero
 * column ("Best value"), accent-tinted highlight rows for the included-at-every-tier items, and
 * *, †, ‡ footnotes below.
 *
 * Wide content: the table keeps a real minimum width and scrolls horizontally inside its own
 * ScrollView on narrow screens — columns never crush into unreadable slivers.
 *
 * CTAs live in the table's foot row. While checkout is closed they reveal the honest
 * "coming soon" note (CHECKOUT_OPEN in src/data/subscriptions.ts flips them into real checkout
 * launches later).
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FontSize, Palette, Radius, Shadows, Spacing, Weight } from '@/constants/theme';
import {
  CHECKOUT_CLOSED_NOTE,
  CHECKOUT_OPEN,
  COMPARISON,
  FOOTNOTES,
  PLAN_HEADERS,
  type CompareCell,
  type PlanHeader,
} from '@/data/subscriptions';
import { useTier } from '@/hooks/use-tier';

/** How far the PRO/VIP header tabs rise above the table body. */
const TAB_RISE = Spacing.four;

function ValueCell({ cell, vip }: { cell: CompareCell; vip?: boolean }) {
  return (
    <>
      <Text style={[styles.value, vip && styles.vipText, cell.strong && styles.valueStrong]}>
        {cell.text}
      </Text>
      {cell.sub ? <Text style={[styles.valueSub, vip && styles.vipSubText]}>{cell.sub}</Text> : null}
    </>
  );
}

export function PlanComparison({ onSelectPlan }: { onSelectPlan?: (tier: string) => void }) {
  const { tier, loading } = useTier();
  // Which paid column's CTA was pressed while checkout is closed (shows the note under it).
  const [revealed, setRevealed] = useState<string | null>(null);

  const select = (plan: PlanHeader) => {
    if (!CHECKOUT_OPEN) {
      setRevealed(plan.tier);
      return;
    }
    onSelectPlan?.(plan.tier); // checkout launch lands here when the provider is wired
  };

  const [freeHead, proHead, vipHead] = PLAN_HEADERS;

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.scroll}>
        <View style={styles.table}>
          {/* ── header row ─────────────────────────────── */}
          <View style={styles.row}>
            <View style={[styles.cell, styles.labelCell, styles.headLabel]} />
            <View style={[styles.cell, styles.freeCol, styles.headCell]}>
              <Text style={styles.tierName}>{freeHead.name}</Text>
              <Text style={styles.tierPrice}>{freeHead.price}</Text>
              <Text style={styles.tierSub}>{freeHead.sub}</Text>
              {!loading && tier === 'free' ? <Text style={styles.current}>Your current plan</Text> : null}
            </View>
            <View style={[styles.cell, styles.proCol, styles.headCell, styles.proHead]}>
              <View style={styles.badgePro}>
                <Text style={styles.badgeProText}>{proHead.badge}</Text>
              </View>
              <Text style={styles.tierName}>{proHead.name}</Text>
              <Text style={styles.tierPrice}>
                {proHead.price}
                <Text style={styles.tierPer}>{proHead.per}</Text>
              </Text>
              <Text style={styles.tierSub}>{proHead.sub}</Text>
              {!loading && tier === 'pro' ? <Text style={styles.current}>Your current plan</Text> : null}
            </View>
            <View style={[styles.cell, styles.vipCol, styles.headCell, styles.vipHead]}>
              <View style={styles.badgeVip}>
                <Text style={styles.badgeVipText}>{vipHead.badge}</Text>
              </View>
              <Text style={[styles.tierName, styles.vipText]}>{vipHead.name}</Text>
              <Text style={[styles.tierPrice, styles.vipText]}>
                {vipHead.price}
                <Text style={[styles.tierPer, styles.vipSubText]}>{vipHead.per}</Text>
              </Text>
              <Text style={[styles.tierSub, styles.vipSubText]}>{vipHead.sub}</Text>
              {!loading && tier === 'vip' ? (
                <Text style={[styles.current, styles.vipText]}>Your current plan</Text>
              ) : null}
            </View>
          </View>

          {/* ── capability rows ────────────────────────── */}
          {COMPARISON.map((row) => (
            <View key={row.capability} style={styles.row}>
              <View style={[styles.cell, styles.labelCell, row.highlight && styles.hlCell]}>
                <Text style={[styles.label, row.highlight && styles.hlLabel]}>
                  {row.capability}
                  {row.mark ? <Text style={styles.mark}>{row.mark}</Text> : ''}
                </Text>
              </View>
              <View style={[styles.cell, styles.freeCol, row.highlight && styles.hlCell]}>
                <ValueCell cell={row.free} />
              </View>
              <View style={[styles.cell, styles.proCol, row.highlight && styles.hlCell]}>
                <ValueCell cell={row.pro} />
              </View>
              <View style={[styles.cell, styles.vipCol]}>
                <ValueCell cell={row.vip} vip />
              </View>
            </View>
          ))}

          {/* ── CTA foot row ───────────────────────────── */}
          <View style={styles.row}>
            <View style={[styles.cell, styles.labelCell, styles.footCell, styles.footLabel]} />
            <View style={[styles.cell, styles.freeCol, styles.footCell]}>
              <Text style={styles.valueSub}>
                {tier === 'guest' ? 'Sign in free to start' : 'Free forever'}
              </Text>
            </View>
            <View style={[styles.cell, styles.proCol, styles.footCell, styles.proFoot]}>
              <Pressable
                onPress={() => select(proHead)}
                style={({ pressed }) => [styles.btn, pressed && styles.dim]}>
                <Text style={styles.btnText}>Choose PRO</Text>
              </Pressable>
              {revealed === 'pro' && !CHECKOUT_OPEN ? (
                <Text style={styles.ctaNote}>{CHECKOUT_CLOSED_NOTE}</Text>
              ) : null}
            </View>
            <View style={[styles.cell, styles.vipCol, styles.footCell, styles.vipFoot]}>
              <Pressable
                onPress={() => select(vipHead)}
                style={({ pressed }) => [styles.btn, styles.btnOnAccent, pressed && styles.dim]}>
                <Text style={styles.btnOnAccentText}>Choose VIP</Text>
              </Pressable>
              {revealed === 'vip' && !CHECKOUT_OPEN ? (
                <Text style={[styles.ctaNote, styles.vipSubText]}>{CHECKOUT_CLOSED_NOTE}</Text>
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ── footnotes ─────────────────────────────────── */}
      <View style={styles.footnotes}>
        {FOOTNOTES.map((f) => (
          <Text key={f.mark} style={styles.footnote}>
            <Text style={styles.mark}>{f.mark}</Text> {f.text}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  table: { minWidth: 860, flex: 1, paddingTop: TAB_RISE },
  row: { flexDirection: 'row', alignItems: 'stretch' },

  cell: {
    flexGrow: 1,
    flexBasis: 0,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    gap: 2,
    backgroundColor: Palette.surface,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
  },
  labelCell: { flexGrow: 1.3, borderLeftWidth: 1, borderLeftColor: Palette.hairline },
  freeCol: { flexGrow: 1 },
  proCol: {
    flexGrow: 1.1,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderLeftColor: Palette.accent,
    borderRightColor: Palette.accent,
  },
  vipCol: { flexGrow: 1.25, backgroundColor: Palette.accent, borderTopColor: 'rgba(255,255,255,0.16)' },

  /* header row */
  headLabel: { backgroundColor: 'transparent', borderTopWidth: 0, borderLeftWidth: 0 },
  headCell: { justifyContent: 'flex-end', paddingVertical: Spacing.four, backgroundColor: Palette.panel },
  proHead: {
    marginTop: -TAB_RISE,
    borderTopWidth: 2,
    borderTopColor: Palette.accent,
    borderTopLeftRadius: Radius.actionBar,
    borderTopRightRadius: Radius.actionBar,
    backgroundColor: Palette.surface,
    ...Shadows.page,
  },
  vipHead: {
    marginTop: -TAB_RISE,
    borderTopWidth: 0,
    borderTopLeftRadius: Radius.actionBar,
    borderTopRightRadius: Radius.actionBar,
    ...Shadows.page,
  },
  tierName: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.ink },
  tierPrice: { fontSize: FontSize.title, fontWeight: Weight.bold, color: Palette.ink, marginTop: 2 },
  tierPer: { fontSize: FontSize.label, fontWeight: Weight.medium, color: Palette.muted },
  tierSub: { fontSize: FontSize.sm, color: Palette.muted, lineHeight: 16 },
  current: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.link, marginTop: 4 },

  badgePro: {
    alignSelf: 'flex-start',
    backgroundColor: Palette.selectionSoft,
    borderRadius: Radius.pill,
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.two,
  },
  badgeProText: {
    fontSize: FontSize.xs,
    fontWeight: Weight.bold,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: Palette.link,
  },
  badgeVip: {
    alignSelf: 'flex-start',
    backgroundColor: Palette.accentText,
    borderRadius: Radius.pill,
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.two,
  },
  badgeVipText: {
    fontSize: FontSize.xs,
    fontWeight: Weight.bold,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: Palette.accent,
  },

  /* capability cells */
  label: { fontSize: FontSize.body, fontWeight: Weight.semibold, color: Palette.ink, lineHeight: 19 },
  value: { fontSize: FontSize.body, color: Palette.ink2, lineHeight: 19 },
  valueStrong: { fontWeight: Weight.semibold, color: Palette.ink },
  valueSub: { fontSize: FontSize.sm, color: Palette.muted, lineHeight: 16 },
  vipText: { color: Palette.accentText },
  vipSubText: { color: 'rgba(255,255,255,0.82)' },
  mark: { color: Palette.link, fontWeight: Weight.bold },

  /* highlight rows */
  hlCell: { backgroundColor: Palette.selectionSoft },
  hlLabel: { color: Palette.link },

  /* foot row */
  footCell: { borderBottomWidth: 1, borderBottomColor: Palette.hairline, paddingBottom: Spacing.four },
  footLabel: { backgroundColor: 'transparent', borderBottomWidth: 0 },
  proFoot: {
    borderBottomWidth: 2,
    borderBottomColor: Palette.accent,
    borderBottomLeftRadius: Radius.actionBar,
    borderBottomRightRadius: Radius.actionBar,
  },
  vipFoot: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: Radius.actionBar,
    borderBottomRightRadius: Radius.actionBar,
  },
  btn: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    minHeight: 38,
    justifyContent: 'center',
  },
  btnText: { color: Palette.accentText, fontSize: FontSize.body, fontWeight: Weight.semibold },
  btnOnAccent: { backgroundColor: Palette.accentText },
  btnOnAccentText: { color: Palette.accent, fontSize: FontSize.body, fontWeight: Weight.semibold },
  dim: { opacity: 0.7 },
  ctaNote: { fontSize: FontSize.sm, color: Palette.muted, lineHeight: 16, marginTop: Spacing.one },

  /* footnotes */
  footnotes: { gap: Spacing.one, marginTop: Spacing.three, maxWidth: 720 },
  footnote: { fontSize: FontSize.sm, color: Palette.muted, lineHeight: 18 },
});
