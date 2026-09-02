/**
 * WHY THIS PAGE LOOKS THE WAY IT DOES — the page's own explanation of itself, inside the page
 * details dialog.
 *
 * Two questions a built page raises and could not previously answer.
 *
 * "Why are some pockets empty?" A wizard page fills with the cards that matched its theme, and
 * stops when the collection runs out. An empty pocket therefore means something specific — we
 * looked and found nothing that belonged — but on screen it is indistinguishable from a page
 * nobody finished, so people read it as a bug or as their own mistake. It says so now, and points
 * at the two ways to fill it.
 *
 * "What is an edge rail?" The reserved art panels name their job on the page ("Chase Board · Edge
 * rail"), which is the right label but not, on its own, an explanation. The role guide has the
 * answer — what the panel is for and things you could actually put in it — and this is where it
 * gets read.
 *
 * IT LIVES IN THE DIALOG, not under the binder. The page area is a measured height budget and
 * nothing lives below the binder any more; help that costs the page a permanent strip would be
 * paid for on every visit by everyone who already knows. Tapping the page title is the gesture
 * that already means "tell me about this page".
 *
 * A DIALOG RATHER THAN A HOVER CARD, deliberately. The obvious home for this is a tooltip on the
 * panel itself, but the grid clips every pocket (`overflow: hidden`) so a card drawn inside one is
 * cut off at its edges, and hover does not exist on a phone at all. The same words in a place both
 * inputs can reach beats a nicer answer half the audience cannot get to.
 */
import { View, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { ART_ROLE_GUIDE, ART_ROLE_LABELS, type ArtRole } from '@/data/artTemplates';
import { occupiedCells, type DemoPage } from '@/data/binderTypes';

/** Pockets with nothing in them at all — no card, no reserved art panel. */
export function openPockets(page: DemoPage): number {
  return page.rows * page.cols - occupiedCells(page).size;
}

/** The distinct art roles on this page, in the order they first appear. */
function rolesOn(page: DemoPage): ArtRole[] {
  const seen: ArtRole[] = [];
  for (const slot of page.slots) {
    const role = slot.artRole as ArtRole | undefined;
    if (role && role in ART_ROLE_GUIDE && !seen.includes(role)) seen.push(role);
  }
  return seen;
}

export function PageComposition({ page }: { page: DemoPage }) {
  const open = openPockets(page);
  const roles = rolesOn(page);
  if (open === 0 && roles.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {open > 0 ? (
        <View style={styles.note}>
          <ThemedText type="smallBold" style={styles.noteHead}>
            {open === 1 ? '1 pocket is still open' : `${open} pockets are still open`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
            This page took every card in your collection that suited its theme, and then ran out.
            The gaps are not a mistake and nothing is missing from the binder — there was simply
            nothing left that belonged here. Tap a pocket to browse for a card, or use Fill to
            build the rest of the page around what is already on it.
          </ThemedText>
        </View>
      ) : null}

      {roles.length > 0 ? (
        <View style={styles.roles}>
          <ThemedText type="smallBold" style={styles.noteHead}>
            The art on this page
          </ThemedText>
          {roles.map((role) => {
            const guide = ART_ROLE_GUIDE[role];
            return (
              <View key={role} style={styles.role}>
                <ThemedText type="small" style={styles.roleName}>
                  {ART_ROLE_LABELS[role]}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
                  {guide.what}
                </ThemedText>
                {/* Instructions rather than adjectives: the point is that you could go and make
                    one of these this afternoon. */}
                {guide.examples.map((example) => (
                  <View key={example} style={styles.exampleRow}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.bullet}>
                      ·
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.example}>
                      {example}
                    </ThemedText>
                  </View>
                ))}
                {guide.avoid ? (
                  <ThemedText type="small" style={styles.avoid}>
                    Not: {guide.avoid}
                  </ThemedText>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three, marginTop: Spacing.three },
  note: {
    gap: 4,
    padding: Spacing.three,
    borderRadius: Radius.control,
    backgroundColor: Palette.panel,
  },
  noteHead: { fontSize: FontSize.control },
  body: { lineHeight: 20 },
  roles: { gap: Spacing.three },
  role: { gap: 2 },
  roleName: { fontWeight: Weight.semibold, color: Palette.accent },
  exampleRow: { flexDirection: 'row', gap: 6, paddingLeft: 2 },
  bullet: { lineHeight: 20, color: Palette.muted },
  example: { flex: 1, lineHeight: 20 },
  avoid: { lineHeight: 20, color: Palette.muted, marginTop: 2 },
});
