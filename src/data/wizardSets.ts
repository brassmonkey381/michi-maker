/**
 * WHICH CARDS A WIZARD SET HOLDS (MIC-043, owner 2026-11-16: "either not offer sets that cannot be
 * built ... or we should make every set buildable"). The set list is every set with cards, English
 * and Japanese, but the wizard asked for a set's cards in English only, so all 456 Japanese sets
 * (City Gym Decks, Base -JP, 124 cards) loaded "0 cards" and could not be built.
 *
 * The catalogue names every Japanese set's series with a "-JP" suffix, and no set mixes languages
 * (checked 2026-11-16: 673 listed sets, 217 English, 456 Japanese, 0 mixed, 0 Japanese without the
 * suffix), so the series says which language to ask for. A set that still loads no cards is dropped
 * from the list instead of being offered with 0 cards.
 */
export type WizardSetLanguage = 'en' | 'ja';

/** The language of a set's cards, from its series ("Base -JP" is Japanese). */
export function wizardSetLanguage(series: string | null | undefined): WizardSetLanguage {
  return /-\s*JP\s*$/i.test(series ?? '') ? 'ja' : 'en';
}

/** The list without a set that turned out to hold no cards, so it is never offered again. */
export function withoutEmptySet<T extends { id: string }>(sets: T[], emptyId: string): T[] {
  return sets.filter((s) => s.id !== emptyId);
}
