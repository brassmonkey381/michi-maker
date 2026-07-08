/**
 * The "Card labels" help panel — opened by the "?" next to the Card labels toggle. A tabbed
 * explainer so it can grow beyond rarity codes: today a **Fields** overview (what each toggle
 * shows) and a **Rarity codes** reference (short Japanese code → English rarity + symbol). Add a
 * tab by extending TABS and the switch in the body.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { pillChip } from '@/constants/ui';
import { CAPTION_FIELDS, type CaptionFieldKey } from '@/data/cardCaption';
import { RARITY_TABLE, type RarityGroup } from '@/data/rarityCode';

type TabId = 'fields' | 'rarity';
const TABS: { id: TabId; label: string }[] = [
  { id: 'fields', label: 'Fields' },
  { id: 'rarity', label: 'Rarity codes' },
];

/** One-line description of what each caption field shows. */
const FIELD_HELP: Record<CaptionFieldKey, string> = {
  series: 'Series / era the card belongs to',
  set: 'Set name',
  name: 'Card name',
  artist: 'Illustrator',
  rarity: 'Full rarity name (e.g. “Holo Rare”)',
  rarityCode: 'Short rarity code — see the Rarity codes tab',
  type: 'Energy type(s)',
  number: 'Collector number (e.g. 004/102)',
  stage: 'Evolution stage (Basic, Stage 1, …)',
  setCode: 'Set abbreviation',
  released: 'Release year',
};

const GROUP_TITLES: Record<RarityGroup, string> = {
  main: 'Main set',
  secret: 'Secret / alternate art',
  special: 'Specialized & historical',
};

/** Rarity sections: unique "code → English name · symbol" rows, grouped and deduped. */
const RARITY_SECTIONS: { group: RarityGroup; rows: { jp: string; desc: string }[] }[] = (
  ['main', 'secret', 'special'] as const
).map((group) => {
  const seen = new Set<string>();
  const rows: { jp: string; desc: string }[] = [];
  for (const e of RARITY_TABLE) {
    if (e.group !== group) continue;
    const desc = `${e.tier} · ${e.symbol}`;
    const key = `${e.jp}|${desc}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ jp: e.jp, desc });
  }
  return { group, rows };
});

export function LabelsHelp({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabId>('rarity');

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>Card labels</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.close}>Close</Text>
        </Pressable>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[pillChip.base, active && pillChip.active]}>
              <Text style={[pillChip.text, active && pillChip.textActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {tab === 'fields' ? <FieldsTab /> : <RarityTab />}
      </ScrollView>
    </View>
  );
}

function FieldsTab() {
  return (
    <>
      <Text style={styles.intro}>
        Show metadata under each card, joined by “ * ”. Fields display in a fixed order regardless
        of the order you turn them on. Some fields can be blank when the catalog lacks them.
      </Text>
      {CAPTION_FIELDS.map((f) => (
        <View key={f.key} style={styles.row}>
          <Text style={styles.rowLabel}>{f.label}</Text>
          <Text style={styles.rowDesc}>{FIELD_HELP[f.key]}</Text>
        </View>
      ))}
    </>
  );
}

function RarityTab() {
  return (
    <>
      <Text style={styles.intro}>
        Short Japanese codes shown in place of the English rarity. Unmapped rarities show their
        full name.
      </Text>
      {RARITY_SECTIONS.map((section) => (
        <View key={section.group} style={styles.section}>
          <Text style={styles.sectionTitle}>{GROUP_TITLES[section.group]}</Text>
          {section.rows.map((r) => (
            <View key={`${section.group}-${r.jp}-${r.desc}`} style={styles.row}>
              <Text style={styles.rowCode}>{r.jp}</Text>
              <Text style={styles.rowDesc}>{r.desc}</Text>
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignSelf: 'center',
    marginTop: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    backgroundColor: Palette.panel,
    borderWidth: 1,
    borderColor: Palette.hairline,
    gap: Spacing.two,
    maxWidth: 460,
    width: '100%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: Palette.ink },
  close: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.accent },
  tabBar: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  body: { maxHeight: 320 },
  bodyContent: { gap: Spacing.two },
  intro: { fontSize: FontSize.xs, color: Palette.muted, lineHeight: 15 },
  section: { gap: 2 },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: Weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Palette.muted,
    marginTop: Spacing.one,
  },
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'baseline' },
  rowCode: { width: 52, fontSize: FontSize.label, fontWeight: Weight.bold, color: Palette.ink },
  rowLabel: { width: 84, fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink },
  rowDesc: { flex: 1, fontSize: FontSize.label, color: Palette.ink2 },
});
