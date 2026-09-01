/**
 * PRINT VARIANTS — the finish a physical card was printed with: Normal, Holofoil, Reverse Holofoil,
 * and the 1st Edition / Unlimited families.
 *
 * NOT to be confused with `variants.ts` next door, which owns THEME variants (`VariantId`,
 * `activeVariantId`, `VARIANT_LIST`). Same word, unrelated meanings, one directory apart — hence
 * the deliberately different file and type names.
 *
 * The vocabulary is not ours. These seven strings are what `portfolio_entries.variant` holds and
 * what the shared price data keys its per-variant market prices with — the same spellings on both
 * sides, which is what makes a chip a lookup rather than a mapping table. The column is plain
 * `text` with no CHECK (by the batch-poisoning rule documented in the entry migrations), so the
 * client must survive a string it has never seen: `letterFor` falls back rather than throwing.
 *
 * COLOURS ARE LOCAL AND HARDCODED, on purpose. `Palette` resolves once at module load per theme
 * variant and per scheme (constants/variants.ts), so a palette-sourced chip would mean a different
 * finish in Vintage than in Dark Vault. A print variant is a fact about the card, not a mood of the
 * app: gold must mean Holofoil everywhere. Same reasoning as CardPicker's mat colours and
 * BinderGrid's OwnedBadge green, which are hardcoded for the same reason.
 *
 * Green and blue are unavailable on this surface: green is OwnedBadge's ✓ on the same pocket
 * corner, blue is the selection border in three of four themes.
 */

/** The finishes the shared price data actually publishes, by frequency across 55,621 cards. */
export const PRINT_VARIANTS = [
  'Normal',
  'Holofoil',
  'Reverse Holofoil',
  '1st Edition',
  'Unlimited',
  '1st Edition Holofoil',
  'Unlimited Holofoil',
] as const;

export type PrintVariant = (typeof PRINT_VARIANTS)[number];

export interface PrintVariantChip {
  /** What the chip reads. Short enough for a ~20px badge on a pocket. */
  letter: string;
  /** Spoken/written in full wherever there is room — a screen reader must not say "RH". */
  label: string;
  fill: string;
  text: string;
}

const CHIPS: Record<PrintVariant, PrintVariantChip> = {
  // Slate: the absence of a finish should read as unremarkable, not as a third bright colour.
  Normal: { letter: 'N', label: 'Normal', fill: '#3F444E', text: '#FFFFFF' },
  // Gold on near-black — the one everybody expects for holo, and it survives bright card art.
  Holofoil: { letter: 'H', label: 'Holofoil', fill: '#F0B429', text: '#1A1206' },
  // Violet: distinct from gold at 9px for the common forms of colour blindness, where a
  // gold/green or gold/red pairing would not be.
  'Reverse Holofoil': { letter: 'RH', label: 'Reverse Holofoil', fill: '#A78BFA', text: '#14102A' },
  // The 1st Edition / Unlimited families share the slate treatment: they are era markers rather
  // than finishes, they never co-occur with N/H/RH on the same card, and inventing four more
  // hues would cost more legibility than it buys.
  '1st Edition': { letter: '1E', label: '1st Edition', fill: '#3F444E', text: '#FFFFFF' },
  Unlimited: { letter: 'UL', label: 'Unlimited', fill: '#3F444E', text: '#FFFFFF' },
  '1st Edition Holofoil': {
    letter: '1EH',
    label: '1st Edition Holofoil',
    fill: '#F0B429',
    text: '#1A1206',
  },
  'Unlimited Holofoil': {
    letter: 'ULH',
    label: 'Unlimited Holofoil',
    fill: '#F0B429',
    text: '#1A1206',
  },
};

/**
 * NOT A FINISH — an unanswered question. Shown on a card that could have been printed more than
 * one way and has not been told which, which is about a third of the catalogue.
 *
 * It has to look like a prompt rather than a value: hollow instead of filled, so a page of real
 * chips and a page of unanswered ones are never confused at a glance. Without it those pockets had
 * no chip at all, which meant no tap target — the finish was unsettable on exactly the cards that
 * needed setting.
 */
export const UNSET_CHIP: PrintVariantChip = {
  letter: '?',
  label: 'Finish not set — tap to choose',
  fill: 'transparent',
  text: '#FFFFFF',
};

/** The neutral treatment for a finish this build has never heard of. */
const UNKNOWN: PrintVariantChip = { letter: '?', label: 'Unknown finish', fill: '#3F444E', text: '#FFFFFF' };

export function isPrintVariant(value: string): value is PrintVariant {
  return (PRINT_VARIANTS as readonly string[]).includes(value);
}

/**
 * How to draw any variant string. An unrecognised value keeps its own first character rather than
 * being hidden or normalised away: the stored value is what the collection actually says, and a
 * chip that quietly renamed it would be lying about the user's data. (`condition` on the same
 * table already holds both 'NM' and 'Near Mint', so drift here is not hypothetical.)
 */
export function chipFor(variant: string): PrintVariantChip {
  if (isPrintVariant(variant)) return CHIPS[variant];
  const trimmed = variant.trim();
  if (!trimmed) return UNKNOWN;
  return { ...UNKNOWN, letter: trimmed.slice(0, 1).toUpperCase(), label: trimmed };
}

/** Just the badge text. */
export function letterFor(variant: string): string {
  return chipFor(variant).letter;
}

/**
 * The finishes a given card can actually be, from its published per-variant prices — NOT a fixed
 * N/H/RH triple. 69% of the catalogue has exactly one finish, 47% has no 'Normal' at all, and 12%
 * is entirely 1st Edition / Unlimited. Offering a finish the card's price data does not list is
 * also actively harmful: tcgscan-app's own editor silently rewrites such a value to the card's
 * first real variant the next time that lot is opened, so the user's choice would be undone
 * without anyone touching it.
 *
 * `current` is always included even when the price data omits it, so a value already stored on the
 * row stays visible and selectable instead of vanishing from its own picker.
 */
export function variantOptionsFor(
  priced: Record<string, number> | undefined,
  current: string,
): string[] {
  const entries = Object.entries(priced ?? {});
  // Priciest first: on a two-finish card that is the one the user is most likely correcting to,
  // and it matches how the shared price code orders variants everywhere else.
  entries.sort((a, b) => b[1] - a[1]);
  const out = entries.map(([name]) => name);
  if (current && !out.includes(current)) out.unshift(current);
  return out;
}

/**
 * WHAT FINISH A POCKET SHOWS, in priority order:
 *
 *   1. What the pocket was explicitly told (slot.finish) — a deliberate answer always wins.
 *   2. The owned copy it claims — a fact about a card someone physically has beats a guess.
 *   3. The card's only published finish, when it has exactly one. Two thirds of the catalogue is
 *      printed one way, so this fills most pockets correctly without anyone being asked.
 *
 * Otherwise nothing: a card that genuinely could be either is left unanswered rather than guessed
 * at, because a wrong finish shown confidently is worse than no chip. That pocket is one tap from
 * being right.
 */
export function effectiveFinish(
  slotFinish: string | undefined,
  ownedVariant: string | undefined,
  priced: Record<string, number> | undefined,
): string | undefined {
  if (slotFinish) return slotFinish;
  if (ownedVariant) return ownedVariant;
  const names = Object.keys(priced ?? {});
  return names.length === 1 ? names[0] : undefined;
}

/**
 * The next finish in the cycle for a card, for tapping the chip. Ordered by the card's own
 * published finishes (priciest first, as the picker lists them), wrapping at the end.
 *
 * Returns undefined when there is nothing to cycle through — one finish, or none published — so
 * the caller can leave the chip inert rather than pretending a single-finish card has a choice.
 */
/**
 * Could this card have been printed more than one way? Then an unanswered pocket deserves the `?`
 * prompt; a card with one possible finish never asks, because there is nothing to ask.
 */
export function finishIsAskable(priced: Record<string, number> | undefined): boolean {
  return Object.keys(priced ?? {}).length > 1;
}

export function nextFinish(
  current: string | undefined,
  priced: Record<string, number> | undefined,
): string | undefined {
  const options = variantOptionsFor(priced, current ?? '');
  if (options.length < 2) return undefined;
  const at = current ? options.indexOf(current) : -1;
  return options[(at + 1) % options.length];
}
