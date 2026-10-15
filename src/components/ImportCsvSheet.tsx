/**
 * CSV import sheet — paste a collection CSV (TCGPlayer export, any id/name CSV, or bare
 * `productId,quantity` lines), preview what resolved, name the portfolio, import. The import
 * lands as a REAL tcgscan portfolio (see src/data/csvImport.ts), so it appears in tcgscan-app
 * and rolls into My collection automatically via the database trigger + realtime.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SignInPerk } from '@/components/auth/SignInPerk';
import { CsvPreviewGrid } from '@/components/CsvPreviewGrid';
import { TcgscanLink } from '@/components/monetization/BundleOffer';
import { LogoLoader } from '@/components/brand/LogoLoader';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing, Weight } from '@/constants/theme';
import { CSV_ROLE_INFO, CSV_ROLES, analyzeCsv, csvShape, type CsvOverrides, type CsvRole, importAsPortfolio, parseCsv } from '@/data/csvImport';
import { useCatalog } from '@/hooks/use-catalog';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { SHOW_CROSS_APP } from '@/lib/crossApp';

export function ImportCsvSheet({
  visible,
  onClose,
  onImported,
  initialCsv,
  initialName,
  intro,
  isDemoImport,
}: {
  visible: boolean;
  onClose: () => void;
  onImported: (portfolioName: string, cards: number, copies: number) => void;
  /** Prefill the paste box on open (e.g. the "Try it out!" example collection). */
  initialCsv?: string;
  /** Prefill the portfolio name on open. */
  initialName?: string;
  /** A guided-step banner shown above the paste box (e.g. "Step 1 of 3 …"). */
  intro?: string;
  /** The seeded demo/example flow — its funnel event fires at the trigger, so skip csv.import here. */
  isDemoImport?: boolean;
}) {
  const theme = useTheme();
  // Name matching + id validation read the catalog (signed-in perk, on-demand load).
  const { catalog, guestGated } = useCatalog(visible);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Column roles the person assigned by tapping a column in the grid. Reset with the text: a
  // new paste has its own columns.
  const [overrides, setOverrides] = useState<CsvOverrides>({});
  const [guideOpen, setGuideOpen] = useState(false);

  // Seed the fields once each time the sheet opens with an initial CSV (the "Try it out!" flow
  // passes the bundled example). Cleared on close so the next open re-seeds.
  const seeded = useRef(false);
  useEffect(() => {
    if (!visible) {
      seeded.current = false;
      return;
    }
    if (seeded.current || initialCsv === undefined) return;
    seeded.current = true;
    setText(initialCsv);
    setName(initialName ?? '');
    setError(null);
  }, [visible, initialCsv, initialName]);

  const rows = useMemo(() => (text.trim() ? parseCsv(text) : []), [text]);
  const analysis = useMemo(() => {
    if (!catalog || rows.length === 0) return null;
    return analyzeCsv(rows, catalog, overrides);
  }, [catalog, rows, overrides]);
  const skipped = useMemo(() => new Map(analysis?.unmatched.map((u) => [u.line, u.reason]) ?? []), [analysis]);
  // Nothing to read a card from: no id and no name column, and the person has not said which
  // column is which. The grid above shows the columns; this says what to do about them.
  const noKeyColumn =
    !!analysis &&
    !analysis.columns.headerless &&
    analysis.columns.id < 0 &&
    (analysis.columns.name < 0 || analysis.columns.set < 0 || analysis.columns.number < 0);
  const assign = (col: number, role: CsvRole | null) =>
    setOverrides((prev) => {
      const next: CsvOverrides = { ...prev };
      // The column's old role, if a person gave it one, is released.
      for (const r of CSV_ROLES) if (next[r] === col) delete next[r];
      if (role) next[role] = col;
      else {
        // "Not used" on a column we detected on our own: remember the refusal as -1.
        const detected = analysis?.columns;
        for (const r of CSV_ROLES) if (detected && detected[r] === col) next[r] = -1;
      }
      return next;
    });

  // THE SHAPE OF EVERY ATTEMPT (owner, 2026-10-15). Until now only a finished import or an
  // unreadable file left a record, so a paste that matched nothing, the commonest failure, left
  // none. One `csv.analyzed` per settled paste or file: header names, which columns we read, how
  // many rows landed and why the rest did not. No cell values. Debounced so typing in the box
  // is one event, not one per keystroke; the demo example is skipped, its shape is ours.
  const source = useRef<'paste' | 'file'>('paste');
  useEffect(() => {
    if (!analysis || isDemoImport || text === initialCsv) return;
    const shape = csvShape(rows, analysis, text.length, overrides);
    const t = setTimeout(() => track('csv.analyzed', { ...shape, source: source.current }), 1500);
    return () => clearTimeout(t);
  }, [analysis, rows, text, initialCsv, isDemoImport, overrides]);

  // Web: let desktop users pick a .csv from disk instead of only pasting. Opens the native file
  // dialog, reads the file, and drops its text into the same paste box (so preview/import are
  // unchanged). No-op off web — native has no file dialog here, paste stays the path.
  const pickCsvFile = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv,text/plain';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      file
        .text()
        .then((t) => {
          source.current = 'file';
          setOverrides({});
          setText(t);
          if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, ''));
          setError(null);
        })
        .catch(() => {
          setError('Could not read that file. Try pasting its contents instead.');
          track('csv.import_failed', { reason: 'unreadable_file' });
        });
    };
    input.click();
  };

  const runImport = async () => {
    if (!analysis || analysis.matches.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const portfolioName = name.trim() || `CSV import (${analysis.matches.length} cards)`;
      await importAsPortfolio(portfolioName, analysis.matches);
      // A real import completed. The demo flow reports demo.csv_import at its trigger instead,
      // so it doesn't double-count here.
      if (!isDemoImport) track('csv.import', { cards: analysis.matches.length, ...csvShape(rows, analysis, text.length, overrides), source: source.current });
      onImported(portfolioName, analysis.matches.length, analysis.totalCopies);
      setText('');
      setName('');
      onClose();
    } catch (e) {
      setError((e as Error).message);
      track('csv.import_failed', { reason: 'parse' });
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.backgroundSelected, backgroundColor: theme.backgroundElement },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.header}>
              <ThemedText type="subtitle" style={styles.title}>
                Import a CSV
              </ThemedText>
              <Pressable onPress={onClose} hitSlop={8}>
                <ThemedText type="link" themeColor="textSecondary">
                  Close
                </ThemedText>
              </Pressable>
            </View>

            {/* Scrolls: with the column guide open and a grid under the box, the card runs past a
                short window, and a dialog that cannot scroll hides its own Import button. */}
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {guestGated ? (
              <SignInPerk message="Importing reads the full card catalog to match your rows. Sign in (free) to use it." />
            ) : (
              <>
                {intro ? (
                  <View style={styles.introBox}>
                    <Text style={styles.introText}>{intro}</Text>
                  </View>
                ) : null}
                <View style={styles.subRow}>
                  <ThemedText type="small" themeColor="textSecondary" style={[styles.sub, styles.subText]}>
                    Paste a TCGPlayer collection export, any CSV with a Product ID column or with Name,
                    Set and Number columns, or bare “productId,quantity” lines. The import becomes a portfolio.
                    {SHOW_CROSS_APP ? <> It shows up in <TcgscanLink /> too, and deleting it there removes these cards again.</> : null}
                  </ThemedText>
                  {/* THE COLUMN GUIDE (owner, 2026-10-15): which columns we read and the header
                      words we know them by. A "?" rather than a block of text, because most people
                      bring a TCGPlayer export and never need it. */}
                  <Pressable
                    onPress={() => setGuideOpen((v) => !v)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: guideOpen }}
                    accessibilityLabel="Which columns can be imported?"
                    testID="csv-guide-btn"
                    style={[styles.guideBtn, guideOpen && styles.guideBtnOn]}>
                    <Text style={[styles.guideBtnText, guideOpen && styles.guideBtnTextOn]}>?</Text>
                  </Pressable>
                </View>
                {guideOpen ? (
                  <View style={styles.guide} testID="csv-guide">
                    <ThemedText type="smallBold">Columns we read</ThemedText>
                    {CSV_ROLES.map((r) => (
                      <View key={r} style={styles.guideRow}>
                        <Text style={styles.guideTick}>✓</Text>
                        <View style={styles.guideBody}>
                          <Text style={styles.guideLabel}>
                            {CSV_ROLE_INFO[r].label}
                            <Text style={styles.guideAccepts}>  ·  {CSV_ROLE_INFO[r].accepts}</Text>
                          </Text>
                          <Text style={styles.guideBlurb}>{CSV_ROLE_INFO[r].blurb}</Text>
                        </View>
                      </View>
                    ))}
                    <Text style={styles.guideBlurb}>
                      A product id is enough on its own. Without one, name, set and number are all needed.
                      Any other column is left alone. If a column of yours is named differently, tap its heading
                      in the preview and say what it is.
                    </Text>
                  </View>
                ) : null}

                {Platform.OS === 'web' ? (
                  <View style={styles.uploadRow}>
                    <Pressable
                      onPress={pickCsvFile}
                      style={({ pressed }) => [styles.uploadBtn, pressed && styles.dim]}>
                      <Text style={styles.uploadBtnText}>Choose a .csv file…</Text>
                    </Pressable>
                    <ThemedText type="small" themeColor="textSecondary">
                      or paste below
                    </ThemedText>
                  </View>
                ) : null}
                <TextInput
                  value={text}
                  onChangeText={(t) => {
                    source.current = 'paste';
                    setOverrides({});
                    setText(t);
                  }}
                  placeholder="Paste your CSV here…"
                  placeholderTextColor={theme.textSecondary}
                  multiline
                  autoCorrect={false}
                  autoCapitalize="none"
                  style={[inputStyle, styles.csvBox]}
                />
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Portfolio name (optional)"
                  placeholderTextColor={theme.textSecondary}
                  autoCorrect={false}
                  style={inputStyle}
                />

                {!catalog && text.trim() ? (
                  <View style={styles.center}>
                    <LogoLoader label="Loading the card catalog…" />
                  </View>
                ) : null}

                {analysis ? (
                  <>
                    <CsvPreviewGrid rows={rows} columns={analysis.columns} skipped={skipped} onAssign={assign} />
                    {noKeyColumn ? (
                      <View style={styles.warnBox} testID="csv-no-key-column">
                        <Text style={styles.warnText}>
                          Nothing here names a card: a file needs a Product ID column, or all three of Name, Set
                          and Number. Tap a column heading above to say which it is, add the headers to your file,
                          or paste one product id per line.
                        </Text>
                      </View>
                    ) : null}
                    <ThemedText type="small" themeColor="textSecondary" testID="csv-summary">
                      Matched{' '}
                      <ThemedText type="smallBold">
                        {analysis.matches.length} card{analysis.matches.length === 1 ? '' : 's'}
                      </ThemedText>{' '}
                      ({analysis.totalCopies} cop{analysis.totalCopies === 1 ? 'y' : 'ies'})
                      {analysis.unmatched.length > 0
                        ? ` · ${analysis.unmatched.length} row${analysis.unmatched.length === 1 ? '' : 's'} skipped`
                        : ''}
                    </ThemedText>
                  </>
                ) : null}

                <Pressable
                  onPress={runImport}
                  disabled={busy || !analysis || analysis.matches.length === 0}
                  style={({ pressed }) => [
                    styles.importBtn,
                    (pressed || busy || !analysis || analysis.matches.length === 0) && styles.dim,
                  ]}>
                  {busy ? (
                    <ActivityIndicator color={Palette.accentText} />
                  ) : (
                    <Text style={styles.importBtnText}>
                      {analysis && analysis.matches.length > 0
                        ? `Import ${analysis.totalCopies} cop${analysis.totalCopies === 1 ? 'y' : 'ies'} as a portfolio`
                        : 'Import'}
                    </Text>
                  )}
                </Pressable>

                {error ? (
                  <ThemedText type="small" style={styles.error}>
                    {error}
                  </ThemedText>
                ) : null}
              </>
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
  cardWrap: { width: '100%', maxWidth: 560 },
  card: { borderRadius: Radii.page, padding: Spacing.four, gap: Spacing.three, maxHeight: '100%' },
  body: { gap: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: FontSize.h2, lineHeight: 26 },
  sub: { lineHeight: 20 },
  subRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  subText: { flex: 1 },
  guideBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideBtnOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  guideBtnText: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.ink2 },
  guideBtnTextOn: { color: Palette.accentText },
  guide: { backgroundColor: Palette.panel, borderRadius: Radius.control, padding: Spacing.three, gap: Spacing.two },
  guideRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  guideTick: { color: Palette.success, fontWeight: Weight.bold, fontSize: FontSize.sm, lineHeight: 18 },
  guideBody: { flex: 1, gap: 1 },
  guideLabel: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink, lineHeight: 18 },
  guideAccepts: { fontWeight: Weight.regular, color: Palette.muted },
  guideBlurb: { fontSize: FontSize.xs, color: Palette.muted2, lineHeight: 16 },
  warnBox: { backgroundColor: Palette.dangerBg, borderRadius: Radius.control, borderLeftWidth: 3, borderLeftColor: Palette.danger, paddingVertical: Spacing.two, paddingHorizontal: Spacing.three },
  warnText: { fontSize: FontSize.sm, color: Palette.danger, lineHeight: 18 },
  introBox: {
    backgroundColor: Palette.panel,
    borderRadius: Radius.control,
    borderLeftWidth: 3,
    borderLeftColor: Palette.accent,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  introText: { color: Palette.accent, fontSize: FontSize.sm, lineHeight: 18, fontWeight: Weight.semibold },
  center: { alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.two },
  input: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: FontSize.control,
  },
  csvBox: { minHeight: 120, maxHeight: 200, textAlignVertical: 'top', fontFamily: 'monospace' },
  uploadRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flexWrap: 'wrap' },
  uploadBtn: {
    borderWidth: 1,
    borderColor: Palette.controlBorder,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  uploadBtnText: { color: Palette.accent, fontSize: FontSize.control, fontWeight: Weight.semibold },
  importBtn: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  importBtnText: { color: Palette.accentText, fontSize: FontSize.md, fontWeight: Weight.semibold },
  dim: { opacity: 0.6 },
  error: { color: Palette.danger, lineHeight: 20 },
});
