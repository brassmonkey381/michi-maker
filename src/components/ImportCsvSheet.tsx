/**
 * CSV import sheet — paste a collection CSV (TCGPlayer export, any id/name CSV, or bare
 * `productId,quantity` lines), preview what resolved, name the portfolio, import. The import
 * lands as a REAL tcgscan portfolio (see src/data/csvImport.ts), so it appears in tcgscan-app
 * and rolls into My collection automatically via the database trigger + realtime.
 */
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SignInPerk } from '@/components/auth/SignInPerk';
import { TcgscanLink } from '@/components/monetization/BundleOffer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing, Weight } from '@/constants/theme';
import { analyzeCsv, importAsPortfolio, parseCsv } from '@/data/csvImport';
import { useCatalog } from '@/hooks/use-catalog';
import { useTheme } from '@/hooks/use-theme';

export function ImportCsvSheet({
  visible,
  onClose,
  onImported,
}: {
  visible: boolean;
  onClose: () => void;
  onImported: (portfolioName: string, cards: number, copies: number) => void;
}) {
  const theme = useTheme();
  // Name matching + id validation read the catalog (signed-in perk, on-demand load).
  const { catalog, guestGated } = useCatalog(visible);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analysis = useMemo(() => {
    if (!catalog || !text.trim()) return null;
    return analyzeCsv(parseCsv(text), catalog);
  }, [catalog, text]);

  const runImport = async () => {
    if (!analysis || analysis.matches.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const portfolioName = name.trim() || `CSV import (${analysis.matches.length} cards)`;
      await importAsPortfolio(portfolioName, analysis.matches);
      onImported(portfolioName, analysis.matches.length, analysis.totalCopies);
      setText('');
      setName('');
      onClose();
    } catch (e) {
      setError((e as Error).message);
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

            {guestGated ? (
              <SignInPerk message="Importing reads the full card catalog to match your rows. Sign in (free) to use it." />
            ) : (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                  Paste a TCGPlayer collection export, any CSV with a product-id or name column,
                  or bare “productId,quantity” lines. The import becomes a portfolio. It shows
                  up in <TcgscanLink label="tcgscan" /> too, and deleting it there removes these
                  cards again.
                </ThemedText>

                <TextInput
                  value={text}
                  onChangeText={setText}
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
                    <ActivityIndicator />
                    <ThemedText type="small" themeColor="textSecondary">
                      Loading the card catalog…
                    </ThemedText>
                  </View>
                ) : null}

                {analysis ? (
                  <>
                    <ThemedText type="small" themeColor="textSecondary">
                      Matched{' '}
                      <ThemedText type="smallBold">
                        {analysis.matches.length} card{analysis.matches.length === 1 ? '' : 's'}
                      </ThemedText>{' '}
                      ({analysis.totalCopies} cop{analysis.totalCopies === 1 ? 'y' : 'ies'})
                      {analysis.unmatched.length > 0
                        ? ` · ${analysis.unmatched.length} row${analysis.unmatched.length === 1 ? '' : 's'} skipped`
                        : ''}
                    </ThemedText>
                    {analysis.unmatched.length > 0 ? (
                      <ScrollView style={styles.unmatchedBox}>
                        {analysis.unmatched.slice(0, 8).map((u) => (
                          <Text key={u.line} style={styles.unmatchedText}>
                            line {u.line}: {u.reason}
                          </Text>
                        ))}
                        {analysis.unmatched.length > 8 ? (
                          <Text style={styles.unmatchedText}>
                            …and {analysis.unmatched.length - 8} more
                          </Text>
                        ) : null}
                      </ScrollView>
                    ) : null}
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
  cardWrap: { width: '100%', maxWidth: 480 },
  card: { borderRadius: Radii.page, padding: Spacing.four, gap: Spacing.three, maxHeight: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: FontSize.h2, lineHeight: 26 },
  sub: { lineHeight: 20 },
  center: { alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.two },
  input: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: FontSize.control,
  },
  csvBox: { minHeight: 120, maxHeight: 200, textAlignVertical: 'top', fontFamily: 'monospace' },
  unmatchedBox: { maxHeight: 110 },
  unmatchedText: { fontSize: FontSize.sm, color: Palette.muted2, lineHeight: 17 },
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
