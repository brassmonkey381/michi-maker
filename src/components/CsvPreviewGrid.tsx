/**
 * WHAT WE READ, AS A GRID (owner, 2026-10-15). The paste box hides structure: a quantity column
 * called "Count Owned" was silently ignored and nothing said so. Under the box, the parsed rows
 * draw as a sheet with the header pinned, and over every column a badge says how the importer
 * reads it: a green tick and the role, or a red cross and "Not used". Rows that will be skipped
 * carry a red stripe and the reason, on the row itself.
 *
 * TAP A COLUMN TO SAY WHAT IT IS. The badge opens a row of roles under the header; picking one
 * assigns that column, and the column that held the role before lets go of it. That turns most
 * header mismatches into one tap instead of editing the file.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { CSV_ROLE_INFO, CSV_ROLES, type CsvColumns, type CsvRole, roleOfColumn } from '@/data/csvShape';

/** Rows drawn before the grid says "and N more": enough to see the shape, not the whole file. */
const MAX_ROWS = 60;
const COL_W = 124;
const LINE_W = 44;

export function CsvPreviewGrid({
  rows,
  columns,
  skipped,
  onAssign,
}: {
  rows: string[][];
  columns: CsvColumns;
  /** 1-based line -> why that line will be skipped. Absent lines will import. */
  skipped: Map<number, string>;
  /** A role for a column, or null to make the column "Not used". */
  onAssign: (col: number, role: CsvRole | null) => void;
}) {
  const [openCol, setOpenCol] = useState<number | null>(null);
  const cols = Math.max(...rows.map((r) => r.length), 1);
  const header = columns.headerless ? Array.from({ length: cols }, (_, i) => `Column ${i + 1}`) : rows[0] ?? [];
  const body = columns.headerless ? rows : rows.slice(1);
  const firstLine = columns.headerless ? 1 : 2;
  const shown = body.slice(0, MAX_ROWS);
  const more = body.length - shown.length;
  const widths = Array.from({ length: cols }, (_, c) =>
    Math.min(180, Math.max(96, COL_W, (header[c]?.length ?? 0) * 7 + 40)),
  );
  const open = openCol !== null ? roleOfColumn(columns, openCol) : null;

  return (
    <View style={styles.wrap} testID="csv-grid">
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          {/* THE HEADER, PINNED: it sits outside the vertical scroll so the badges stay in view. */}
          <View style={styles.headRow}>
            <View style={[styles.lineCell, styles.headCell]}>
              <Text style={styles.lineText}>#</Text>
            </View>
            {header.map((h, c) => {
              const role = roleOfColumn(columns, c);
              const on = openCol === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setOpenCol(on ? null : c)}
                  accessibilityRole="button"
                  accessibilityLabel={`Column ${h || c + 1}: ${role ? `read as ${CSV_ROLE_INFO[role].label}` : 'not used'}. Change what it is`}
                  testID={`csv-col-${c}`}
                  style={[styles.headCell, { width: widths[c] }, on && styles.headCellOn]}>
                  <Text numberOfLines={1} style={styles.headText}>
                    {h.trim() || `Column ${c + 1}`}
                  </Text>
                  <View style={[styles.badge, role ? styles.badgeOn : styles.badgeOff]}>
                    <Text style={[styles.badgeMark, role ? styles.badgeMarkOn : styles.badgeMarkOff]}>{role ? '✓' : '✕'}</Text>
                    <Text numberOfLines={1} style={[styles.badgeText, role ? styles.badgeTextOn : styles.badgeTextOff]}>
                      {role ? CSV_ROLE_INFO[role].label : 'Not used'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {openCol !== null ? (
            <View style={styles.assignRow} testID="csv-assign">
              <ThemedText type="small" themeColor="textSecondary" style={styles.assignLabel}>
                “{header[openCol]?.trim() || `Column ${openCol + 1}`}” is
              </ThemedText>
              {CSV_ROLES.map((r) => {
                const on = open === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => {
                      onAssign(openCol, on ? null : r);
                      setOpenCol(null);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    testID={`csv-assign-${r}`}
                    style={[styles.chip, on && styles.chipOn]}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{CSV_ROLE_INFO[r].label}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => {
                  onAssign(openCol, null);
                  setOpenCol(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: open === null }}
                testID="csv-assign-none"
                style={[styles.chip, open === null && styles.chipOn]}>
                <Text style={[styles.chipText, open === null && styles.chipTextOn]}>Not used</Text>
              </Pressable>
            </View>
          ) : null}
          <ScrollView style={styles.body} nestedScrollEnabled>
            {shown.map((r, i) => {
              const line = i + firstLine;
              const why = skipped.get(line);
              return (
                <View key={line} style={[styles.row, why ? styles.rowSkipped : null]} testID={why ? 'csv-row-skipped' : 'csv-row'}>
                  <View style={styles.cells}>
                    <View style={styles.lineCell}>
                      <Text style={styles.lineText}>{line}</Text>
                    </View>
                    {Array.from({ length: cols }, (_, c) => (
                      <View key={c} style={[styles.cell, { width: widths[c] }]}>
                        <Text numberOfLines={1} style={[styles.cellText, why ? styles.cellTextSkipped : null]}>
                          {r[c] ?? ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                  {/* The reason sits UNDER the row, from its left edge, so it is in view at the
                      grid's resting scroll rather than off past the last column. */}
                  {why ? (
                    <Text numberOfLines={1} style={styles.whyText}>
                      Skipped: {why}
                    </Text>
                  ) : null}
                </View>
              );
            })}
            {more > 0 ? (
              <Text style={styles.moreText}>…and {more} more row{more === 1 ? '' : 's'}</Text>
            ) : null}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: Palette.hairline, borderRadius: Radius.control, overflow: 'hidden' },
  headRow: { flexDirection: 'row', backgroundColor: Palette.panel, borderBottomWidth: 1, borderBottomColor: Palette.hairlineStrong },
  headCell: { paddingHorizontal: Spacing.two, paddingVertical: 6, gap: 4, borderRightWidth: 1, borderRightColor: Palette.hairline },
  headCellOn: { backgroundColor: Palette.surface },
  headText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: Radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  badgeOn: { backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.success },
  badgeOff: { backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.hairlineStrong },
  badgeMark: { fontSize: FontSize.xs, fontWeight: Weight.bold },
  badgeMarkOn: { color: Palette.success },
  badgeMarkOff: { color: Palette.danger },
  badgeText: { fontSize: FontSize.xs, fontWeight: Weight.semibold },
  badgeTextOn: { color: Palette.ink },
  badgeTextOff: { color: Palette.muted },
  assignRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: Spacing.two, backgroundColor: Palette.surface, borderBottomWidth: 1, borderBottomColor: Palette.hairline },
  assignLabel: { marginRight: 4 },
  chip: { borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.controlBorder, paddingHorizontal: 10, paddingVertical: 4 },
  chipOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  chipText: { fontSize: FontSize.xs, fontWeight: Weight.semibold, color: Palette.ink },
  chipTextOn: { color: Palette.accentText },
  body: { maxHeight: 220 },
  row: { borderBottomWidth: 1, borderBottomColor: Palette.hairline, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  rowSkipped: { borderLeftColor: Palette.danger, backgroundColor: Palette.dangerBg },
  cells: { flexDirection: 'row' },
  lineCell: { width: LINE_W, paddingHorizontal: Spacing.two, paddingVertical: 5, borderRightWidth: 1, borderRightColor: Palette.hairline, alignItems: 'flex-end' },
  lineText: { fontSize: FontSize.xs, color: Palette.muted, fontVariant: ['tabular-nums'] },
  cell: { paddingHorizontal: Spacing.two, paddingVertical: 5, borderRightWidth: 1, borderRightColor: Palette.hairline },
  cellText: { fontSize: FontSize.sm, color: Palette.ink2 },
  cellTextSkipped: { color: Palette.muted },
  whyText: { fontSize: FontSize.xs, color: Palette.danger, fontWeight: Weight.semibold, paddingHorizontal: Spacing.two, paddingBottom: 4, marginLeft: LINE_W },
  moreText: { fontSize: FontSize.xs, color: Palette.muted, padding: Spacing.two },
});
