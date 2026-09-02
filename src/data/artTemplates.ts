/**
 * ART TEMPLATES — the composition is chosen BEFORE the cards, not after.
 *
 * The old order was: place every card, then hand whatever cells survived to `artGapSlots`, which
 * scanned each row and dropped an artwork slot into every hole. Art could therefore only ever be
 * leftovers, it could only ever be 1×1 or a horizontal 1×2, and nothing recorded why any of it was
 * where it was. That is the whole of the complaint these templates answer.
 *
 * A template names a finished page: which pockets hold art, which hold cards, and what each art
 * panel is DOING there. Cards fill what the template leaves. So a page with four art cells has
 * four art cells because a composition asked for them, not because four cards were missing.
 *
 * SPENDING POCKETS ON ART IS THE POINT, not a cost to minimise. This app exists to use artwork to
 * frame cards and tie a page together, so `pickTemplate` deliberately prefers the template that
 * spends the MOST pockets on art among those that still fit the cards it was given. Anyone tempted
 * to invert that ranking to fit more cards per page is optimising for a different product.
 *
 * FOOTPRINTS, NOT PRINTED PIECES. A panel here is a design footprint and may be any rectangle.
 * Side-load pockets only open sideways, so a physical insert is 1×1 or a folded 1×2 — but
 * `binderPhysics.legalizeArtPanels` already cuts an oversized panel into insertable pieces with
 * proportional crops (the assembled picture is unchanged), and the PDF export does the same walk
 * on its own (`placeholderPdf.slotPieces`). So templates are authored at full size and legalized
 * downstream; nothing here needs to pre-shatter a composition into printable fragments.
 *
 * Sourced from a layout research pass over collector practice (the "Michi Method" write-ups,
 * binder-tour posts and spread-layout convention) plus graphic-design grid principles. Geometry is
 * exact: every panel sits inside its page, no two overlap, and `cardPockets` is the remainder.
 * `src/data/artTemplates.test.ts` re-derives all of that from the data rather than trusting it.
 */
import type { DemoSlot } from './binderTypes.ts';

/**
 * What a panel is doing on the page. Derived from its shape and position when the catalogue was
 * built, so the label can never drift from the geometry it describes — and it is the "reason this
 * art is in this pocket" that the editor shows and the slot stores.
 */
export type ArtRole =
  /** Covers the page: a chapter break, or one image the cards sit on. */
  | 'plate'
  /** A full-width band across the top — the page's title bar. */
  | 'title'
  /** A full-width band at the foot — a caption rule under the run. */
  | 'footer'
  /** A full-height column down one edge, framing the cards beside it. */
  | 'rail'
  /** A block two or more pockets each way: the page's focal mass. */
  | 'anchor'
  /** An upright two-high panel: stops the eye at a page edge and turns it. */
  | 'post'
  /** A horizontal run of two or more: bridges a gap between card groups. */
  | 'band'
  /** One pocket, held back on purpose — a rest, or a place kept for a card not yet owned. */
  | 'accent';

/** Human labels for the roles, for the editor and for a slot's own explanation. */
export const ART_ROLE_LABELS: Record<ArtRole, string> = {
  plate: 'Full-page plate',
  title: 'Title band',
  footer: 'Footer caption band',
  rail: 'Edge rail',
  anchor: 'Anchor block',
  post: 'Corner post',
  band: 'Bridging band',
  accent: 'Single accent',
};

/**
 * WHAT ACTUALLY GOES IN THE PANEL.
 *
 * A pocket that only says "Your Art Here" asks the owner to invent both the picture and the brief.
 * The role knows the brief, so it says it, in as few words as will still act on.
 *
 * NOT PRICES, anywhere. A printed insert is fixed the moment it goes in the sleeve and prices move
 * daily. Value belongs to the card labels, which read live under every pocket for no art at all.
 */
export interface ArtRoleGuide {
  /** What this panel is, in the fewest words that are still true. */
  what: string;
  /** Things you could actually put there. Written as instructions, not adjectives. */
  examples: string[];
  /** A trap specific to this role. Omitted where there isn't one worth the words. */
  avoid?: string;
}

export const ART_ROLE_GUIDE: Record<ArtRole, ArtRoleGuide> = {
  plate: {
    what: 'The whole page as one picture, no cards.',
    examples: ['A chapter break between two runs', 'The set\u2019s key art, full bleed'],
    avoid: 'Fine detail. This is read while flipping past.',
  },
  title: {
    what: 'A band across the top that names the page.',
    examples: ['The theme: \u201cOcean\u201d, \u201cFirst Pulls\u201d', 'Set logo and year'],
    avoid: 'A sentence. Two or three words fit.',
  },
  footer: {
    what: 'A band along the bottom: credits for the cards above.',
    examples: ['The illustrators, left to right', 'Set symbol and release date'],
    avoid: 'Prices. A printed insert goes stale; use the price card label instead.',
  },
  rail: {
    what: 'A tall column down one edge, framing the cards.',
    examples: ['A series wordmark, set vertically', 'A full-height character render'],
    avoid: 'Anything wider than it is tall.',
  },
  anchor: {
    what: 'The biggest block: what the eye lands on first.',
    examples: ['The page\u2019s Pok\u00e9mon, drawn large', 'The place these cards come from'],
  },
  post: {
    what: 'An upright panel at a page edge, turning the eye back in.',
    examples: ['A tall crop of the page subject', 'A numbered tab for this section'],
  },
  band: {
    what: 'A horizontal run bridging two groups of cards.',
    examples: ['A horizon continuing behind the cards', 'A caption for the run beneath it'],
  },
  accent: {
    what: 'One pocket, held back on purpose.',
    examples: ['A set symbol or type icon', 'Nothing, kept for a card you have not found'],
    avoid: 'Detail. At one pocket it reads as texture.',
  },
};

/**
 * The line a reserved pocket shows: the page it is on, and the job it is doing there. "Chase
 * Board · Footer caption band" tells the owner both halves of what to make.
 */
export function artSlotBrief(pageTitle: string | undefined, role: string | undefined): string {
  const label = role && role in ART_ROLE_LABELS ? ART_ROLE_LABELS[role as ArtRole] : '';
  if (pageTitle && label) return `${pageTitle} · ${label}`;
  return label || pageTitle || 'Your art here';
}

export interface ArtPanel {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  /** Which leaf of a spread. Absent on single-page templates. */
  page?: 'left' | 'right';
  role: ArtRole;
}

export interface ArtTemplate {
  id: string;
  /** The name a curator would use for it. Shown in the UI. */
  name: string;
  rows: number;
  cols: number;
  /** True when the template composes across two facing pages rather than one. */
  spread: boolean;
  /** Pockets left for cards once the panels are placed. */
  cardPockets: number;
  /** The situation this layout is for. */
  when: string;
  /** What the art is doing — the reason, in one sentence. */
  why: string;
  panels: ArtPanel[];
}

export const ART_TEMPLATES: ArtTemplate[] = [
  {
    id: '3x3-nine-beats',
    name: 'Nine Beats',
    rows: 3,
    cols: 3,
    spread: false,
    cardPockets: 9,
    when: 'You have exactly nine cards that belong together and the grouping itself is the point: a complete nine-card subset, three evolution lines in three columns, a numbered run from a set, a full artist page.',
    why: 'The absence of art IS the decision here, and it is the reason.',
    panels: [],
  },
  {
    id: '3x3-corner-post',
    name: 'Corner Post',
    rows: 3,
    cols: 3,
    spread: false,
    cardPockets: 7,
    when: 'Seven cards. The awkward count: two past a clean six-card block, two short of a full nine.',
    why: 'The single art slot is a post, and it has one job.',
    panels: [
      { row: 0, col: 2, rowSpan: 2, colSpan: 1, role: 'post' },
    ],
  },
  {
    id: '3x3-wall-text',
    name: 'Wall Text',
    rows: 3,
    cols: 3,
    spread: false,
    cardPockets: 6,
    when: 'Six cards whose theme is not self-evident from the cards themselves.',
    why: 'The bar is a caption plate, not a filler. It carries the page\'s title, the illustrator\'s name, the set, the dates: wall text for the six cards above it.',
    panels: [
      { row: 2, col: 0, rowSpan: 1, colSpan: 3, role: 'footer' },
    ],
  },
  {
    id: '3x3-cornerstone',
    name: 'Cornerstone',
    rows: 3,
    cols: 3,
    spread: false,
    cardPockets: 5,
    when: 'Five cards worth showing and no sixth. The classic chase cluster (binderWizard chase MIN_SIZE 3, KIND_PRIORITY 7) that landed at five, the good half of a set, a small trainer group.',
    why: 'One 2x2 block is the single dominant mass on the page, and it is sited low and to the right on purpose.',
    panels: [
      { row: 1, col: 1, rowSpan: 2, colSpan: 2, role: 'anchor' },
    ],
  },
  {
    id: '3x3-diagonal-channel',
    name: 'Diagonal Channel',
    rows: 3,
    cols: 3,
    spread: false,
    cardPockets: 5,
    when: 'Five cards where one card opens the page and one closes it: a first print and a latest print, a before and after, two bookends with a three-card run between them.',
    why: 'Both panels are the same 1x2 size, placed diagonally opposite, so they balance by 180-degree rotation rather than by mirroring.',
    panels: [
      { row: 0, col: 1, rowSpan: 1, colSpan: 2, role: 'band' },
      { row: 2, col: 0, rowSpan: 1, colSpan: 2, role: 'band' },
    ],
  },
  {
    id: '3x3-triptych-rails',
    name: 'Triptych Rails',
    rows: 3,
    cols: 3,
    spread: false,
    cardPockets: 3,
    when: 'Exactly three cards that are a vertical sequence: a three-stage evolution line, three prints of one Pokemon in release order, a three-beat story.',
    why: 'The two rails convert a 3x3 page into a single vertical strip, and that conversion is their entire purpose.',
    panels: [
      { row: 0, col: 0, rowSpan: 3, colSpan: 1, role: 'rail' },
      { row: 0, col: 2, rowSpan: 3, colSpan: 1, role: 'rail' },
    ],
  },
  {
    id: '3x3-reliquary',
    name: 'Reliquary',
    rows: 3,
    cols: 3,
    spread: false,
    cardPockets: 1,
    when: 'One card. The grail: the most valuable or most personal card in the binder, given a page of its own.',
    why: 'All four slots are one object, a mount, and each part of the ring is doing framing work.',
    panels: [
      { row: 0, col: 0, rowSpan: 1, colSpan: 3, role: 'title' },
      { row: 1, col: 0, rowSpan: 1, colSpan: 1, role: 'accent' },
      { row: 1, col: 2, rowSpan: 1, colSpan: 1, role: 'accent' },
      { row: 2, col: 0, rowSpan: 1, colSpan: 3, role: 'footer' },
    ],
  },
  {
    id: '3x3-divider-plate',
    name: 'Divider Plate',
    rows: 3,
    cols: 3,
    spread: false,
    cardPockets: 0,
    when: 'No cards at all. A chapter break between sections of the binder: the end of a set, the start of a new theme, the opening page, or the title page for a run of themed pages that follows.',
    why: 'This is a page break, and it works precisely because it is the only page in the run with nothing to read.',
    panels: [
      { row: 0, col: 0, rowSpan: 3, colSpan: 3, role: 'plate' },
    ],
  },
  {
    id: '3x4-establishing-tier',
    name: 'Establishing Tier',
    rows: 3,
    cols: 4,
    spread: false,
    cardPockets: 8,
    when: 'Exactly 8 cards that belong to one named place, one set, or one story beat, on a page that needs to announce itself.',
    why: 'A 4-wide page reads as three identical horizontal bands and nothing tells the eye where to start.',
    panels: [
      { row: 0, col: 0, rowSpan: 1, colSpan: 4, role: 'title' },
    ],
  },
  {
    id: '3x4-counterweight-corner',
    name: 'Counterweight Corner',
    rows: 3,
    cols: 4,
    spread: false,
    cardPockets: 8,
    when: '8 cards where ONE is clearly the best card on the page.',
    why: 'A left-to-right reader lands first in the upper left, so a hero card placed there loads that corner and leaves the bottom right feeling hollow.',
    panels: [
      { row: 1, col: 2, rowSpan: 2, colSpan: 2, role: 'anchor' },
    ],
  },
  {
    id: '3x4-the-complete-run',
    name: 'The Complete Run',
    rows: 3,
    cols: 4,
    spread: false,
    cardPockets: 12,
    when: 'A set page, a numbered run, a Pokedex block, or a full evolution family, where COMPLETENESS is the aesthetic.',
    why: 'The art here is the absence of art, and that is a decision, not a default.',
    panels: [],
  },
  {
    id: '3x4-reliquary-ring',
    name: 'Reliquary Ring',
    rows: 3,
    cols: 4,
    spread: false,
    cardPockets: 2,
    when: 'One or two grails and nothing else worth diluting them with: an alt art and its base print, two halves of one illustration, the single best card in the collection.',
    why: 'A full perimeter turns the page into a MOUNT.',
    panels: [
      { row: 0, col: 0, rowSpan: 1, colSpan: 4, role: 'title' },
      { row: 1, col: 0, rowSpan: 1, colSpan: 1, role: 'accent' },
      { row: 1, col: 3, rowSpan: 1, colSpan: 1, role: 'accent' },
      { row: 2, col: 0, rowSpan: 1, colSpan: 4, role: 'footer' },
    ],
  },
  {
    id: '3x4-nameplate-and-placeholder',
    name: 'Nameplate and Placeholder',
    rows: 3,
    cols: 4,
    spread: false,
    cardPockets: 9,
    when: 'Nine cards that need IDENTIFYING, plus one known hole in the run.',
    why: 'Two different small jobs, each with its own reason, and neither is decoration.',
    panels: [
      { row: 2, col: 0, rowSpan: 1, colSpan: 2, role: 'band' },
      { row: 0, col: 3, rowSpan: 1, colSpan: 1, role: 'accent' },
    ],
  },
  {
    id: '3x4-opposite-corners',
    name: 'Opposite Corners',
    rows: 3,
    cols: 4,
    spread: false,
    cardPockets: 8,
    when: 'Eight cards with NO single dominant one, where the page needs movement rather than a focal point.',
    why: 'Two wide art blocks in diagonally opposite corners set up a tension the eye has to resolve: it enters at the top-left block, is pulled across and down to the bottom-right block, and the eight cards between them become the PATH rather than the content.',
    panels: [
      { row: 0, col: 0, rowSpan: 1, colSpan: 2, role: 'band' },
      { row: 2, col: 2, rowSpan: 1, colSpan: 2, role: 'band' },
    ],
  },
  {
    id: '3x4-spread-gutter-bridge',
    name: 'Gutter Bridge',
    rows: 3,
    cols: 4,
    spread: true,
    cardPockets: 20,
    when: 'The signature 12-pocket view: the binder open flat, 24 pockets on show, one continuous theme running through both pages.',
    why: 'An open 12-pocket binder is close to a metre of card and reads as two separate walls of twelve.',
    panels: [
      { row: 1, col: 2, rowSpan: 1, colSpan: 2, page: 'left', role: 'band' },
      { row: 1, col: 0, rowSpan: 1, colSpan: 2, page: 'right', role: 'band' },
    ],
  },
  {
    id: '3x4-poster-and-gallery',
    name: 'Poster and Gallery',
    rows: 3,
    cols: 4,
    spread: false,
    cardPockets: 6,
    when: 'Six cards, one strong theme, and one piece of art worth showing WHOLE.',
    why: 'The 4-column page is uncomfortably wide for one composition, so this splits it into two objects of unequal weight.',
    panels: [
      { row: 0, col: 0, rowSpan: 3, colSpan: 2, role: 'rail' },
    ],
  },
  {
    id: '3x3-spread-the-complete-run',
    name: 'The Complete Run',
    rows: 3,
    cols: 3,
    spread: true,
    cardPockets: 18,
    when: '18 cards that form an actual complete sequence across the spread: a set-number run, a Pokedex block, a full rarity tier.',
    why: 'The composition is the repetition. Eighteen identical frames in strict order make a wall whose entire meaning is completeness, and in that context an art slot does not read as art, it reads as a card you do not own.',
    panels: [],
  },
  {
    id: '3x3-spread-splash-and-the-run-it-opens',
    name: 'Splash and the Run It Opens',
    rows: 3,
    cols: 3,
    spread: true,
    cardPockets: 9,
    when: 'The first spread of a new section: a new set, a new illustrator, a new evolution line, the start of a chase run.',
    why: 'One dominant block, doing the job of a chapter opener rather than filling a gap.',
    panels: [
      { row: 0, col: 0, rowSpan: 3, colSpan: 3, page: 'left', role: 'plate' },
    ],
  },
  {
    id: '3x3-spread-scene-across-the-spine',
    name: 'Scene Across the Spine',
    rows: 3,
    cols: 3,
    spread: true,
    cardPockets: 10,
    when: '10 cards sharing one place or one palette: a Water page where the two halves are sea and sky, a species page set in that Pokemon\'s habitat, a colour-blocked bulk page that deserves better than bulk treatment.',
    why: 'Two 2x2 blocks are butted against the gutter from both sides so a single landscape reads across the spine while no slot ever crosses it.',
    panels: [
      { row: 0, col: 1, rowSpan: 2, colSpan: 2, page: 'left', role: 'anchor' },
      { row: 0, col: 0, rowSpan: 2, colSpan: 2, page: 'right', role: 'anchor' },
    ],
  },
  {
    id: '3x3-spread-unequal-bookends',
    name: 'Unequal Bookends',
    rows: 3,
    cols: 3,
    spread: true,
    cardPockets: 13,
    when: '13 cards of roughly equal weight and no natural hero: a broad energy-type block, a colour-blocked sweep, a \'type\' or \'species\' cluster where every card is a peer.',
    why: 'The asymmetric one. Two vertical rails on the OUTER edges of the spread act as bookends holding a thirteen-card field, and they are deliberately unequal (three tall on the left, two tall and bottom-anchored on the right) so the pair reads as balance rather than as a static mirror.',
    panels: [
      { row: 0, col: 0, rowSpan: 3, colSpan: 1, page: 'left', role: 'rail' },
      { row: 1, col: 2, rowSpan: 2, colSpan: 1, page: 'right', role: 'post' },
    ],
  },
  {
    id: '3x3-spread-banner-and-footer',
    name: 'Banner and Footer',
    rows: 3,
    cols: 3,
    spread: true,
    cardPockets: 12,
    when: '12 cards on a page whose logic is not visible from the cards alone and needs saying out loud: an illustrator page, a set page, a themed run, a trainer page.',
    why: 'Art as caption and label. The top strip on the left leaf carries the title, the bottom strip on the right leaf carries the caption, credit or set line, and together they sit at the spread\'s entry point and its exit point, the top-left to bottom-right reading diagonal.',
    panels: [
      { row: 0, col: 0, rowSpan: 1, colSpan: 3, page: 'left', role: 'title' },
      { row: 2, col: 0, rowSpan: 1, colSpan: 3, page: 'right', role: 'footer' },
    ],
  },
  {
    id: '3x3-spread-the-reliquary',
    name: 'The Reliquary',
    rows: 3,
    cols: 3,
    spread: true,
    cardPockets: 10,
    when: 'Exactly one grail plus its supporting cast. The chase cluster (value >= $10, MIN_SIZE 3) with one undisputed standout, or an evolution or species page where one card is the payoff and the other nine are the line, the alternate arts, or the rest of the set.',
    why: 'Art as frame. Eight art cells form a complete ring around pocket 5 of the left leaf, so the hero card shares its page with nothing at all: it is matted, the way a single work is hung, and there is no second card anywhere on that leaf to argue with it.',
    panels: [
      { row: 0, col: 0, rowSpan: 1, colSpan: 3, page: 'left', role: 'title' },
      { row: 1, col: 0, rowSpan: 1, colSpan: 1, page: 'left', role: 'accent' },
      { row: 1, col: 2, rowSpan: 1, colSpan: 1, page: 'left', role: 'accent' },
      { row: 2, col: 0, rowSpan: 1, colSpan: 3, page: 'left', role: 'footer' },
    ],
  },
  {
    id: '3x3-spread-the-reserved-pocket',
    name: 'The Reserved Pocket',
    rows: 3,
    cols: 3,
    spread: true,
    cardPockets: 17,
    when: '17 of 18 in hand and one known gap. A near-complete set run, an evolution line missing its final stage, a rarity tier one pull short.',
    why: 'The single tile is a placeholder, not decoration, and that is its whole rationale.',
    panels: [
      { row: 1, col: 1, rowSpan: 1, colSpan: 1, page: 'right', role: 'accent' },
    ],
  },
  {
    id: '3x3-spread-woven-bands',
    name: 'Woven Bands',
    rows: 3,
    cols: 3,
    spread: true,
    cardPockets: 6,
    when: 'Six cards you want to present as a small exhibition rather than a collection: six grails, six alternate arts of one Pokemon, six illustrations by one artist.',
    why: 'The art-heavy one, and the art is the ground rather than the filler.',
    panels: [
      { row: 0, col: 0, rowSpan: 1, colSpan: 2, page: 'left', role: 'band' },
      { row: 1, col: 1, rowSpan: 1, colSpan: 2, page: 'left', role: 'band' },
      { row: 2, col: 0, rowSpan: 1, colSpan: 2, page: 'left', role: 'band' },
      { row: 0, col: 1, rowSpan: 1, colSpan: 2, page: 'right', role: 'band' },
      { row: 1, col: 0, rowSpan: 1, colSpan: 2, page: 'right', role: 'band' },
      { row: 2, col: 1, rowSpan: 1, colSpan: 2, page: 'right', role: 'band' },
    ],
  },
  {
    id: '3x4-spread-centrefold',
    name: 'Centrefold',
    rows: 3,
    cols: 4,
    spread: true,
    cardPockets: 12,
    when: '12 cards that split into two matched halves: six Water and six Fire, one evolution line\'s early stages against its finals, or a colour story told in two tones.',
    why: 'The art is a true centrefold: it claims the two columns either side of the gutter, which is exactly the zone a ring binder curves away from, where cards are hardest to see and hardest to seat.',
    panels: [
      { row: 0, col: 2, rowSpan: 3, colSpan: 2, page: 'left', role: 'rail' },
      { row: 0, col: 0, rowSpan: 3, colSpan: 2, page: 'right', role: 'rail' },
    ],
  },
  {
    id: '3x4-spread-splash-and-grid',
    name: 'Splash and Grid',
    rows: 3,
    cols: 4,
    spread: true,
    cardPockets: 12,
    when: '12 cards that already work as a self-contained full page: a complete rarity run, one set\'s illustration rares, one illustrator\'s twelve.',
    why: 'Straight out of comics: a splash facing a grid.',
    panels: [
      { row: 0, col: 0, rowSpan: 3, colSpan: 4, page: 'left', role: 'plate' },
    ],
  },
  {
    id: '3x4-spread-the-full-two-dozen',
    name: 'The Full Two Dozen',
    rows: 3,
    cols: 4,
    spread: true,
    cardPockets: 24,
    when: '24 cards that are a sequence and mean something in order: a numbered set run, a rarity ladder from common up to hyper, a colour ramp, a complete trainer line, reverse holos of one set.',
    why: 'Deliberately no art, and that is the curatorial decision.',
    panels: [],
  },
  {
    id: '3x4-spread-reliquary',
    name: 'Reliquary',
    rows: 3,
    cols: 4,
    spread: true,
    cardPockets: 14,
    when: 'One or two genuine grails and 12 cards of context.',
    why: 'A real border, art on all four sides of the right page, leaving an interior of two pockets.',
    panels: [
      { row: 0, col: 0, rowSpan: 1, colSpan: 4, page: 'right', role: 'title' },
      { row: 1, col: 0, rowSpan: 1, colSpan: 1, page: 'right', role: 'accent' },
      { row: 1, col: 3, rowSpan: 1, colSpan: 1, page: 'right', role: 'accent' },
      { row: 2, col: 0, rowSpan: 1, colSpan: 4, page: 'right', role: 'footer' },
    ],
  },
  {
    id: '3x4-spread-titled-run',
    name: 'Titled Run',
    rows: 3,
    cols: 4,
    spread: true,
    cardPockets: 16,
    when: 'A run of exactly four cards that needs naming, facing a full page of twelve.',
    why: 'Art used as typography rather than as picture.',
    panels: [
      { row: 0, col: 0, rowSpan: 1, colSpan: 4, page: 'left', role: 'title' },
      { row: 2, col: 0, rowSpan: 1, colSpan: 4, page: 'left', role: 'footer' },
    ],
  },
  {
    id: '3x4-spread-opposite-corners',
    name: 'Opposite Corners',
    rows: 3,
    cols: 4,
    spread: true,
    cardPockets: 16,
    when: '16 cards with no natural hierarchy, where the point is movement rather than a single hero: a mixed-colour page, one booster box\'s pulls, a favourites spread, a bulk page promoted to display.',
    why: 'The two 2x2 blocks sit in diagonally opposed corners of the whole spread, outer top left and inner bottom right, so their weight cancels and neither page tips.',
    panels: [
      { row: 0, col: 0, rowSpan: 2, colSpan: 2, page: 'left', role: 'anchor' },
      { row: 1, col: 2, rowSpan: 2, colSpan: 2, page: 'right', role: 'anchor' },
    ],
  },
  {
    id: '3x4-spread-twin-anchors',
    name: 'Twin Anchors',
    rows: 3,
    cols: 4,
    spread: true,
    cardPockets: 16,
    when: '16 cards where each page has exactly one card that matters most: two chase cards, or a Pokemon\'s two best illustrations, one per page.',
    why: 'Each page gets an L-shaped bracket of art, one wide cell above and one tall cell beside, and the pocket in the crook of that L is the hero.',
    panels: [
      { row: 0, col: 0, rowSpan: 1, colSpan: 2, page: 'left', role: 'band' },
      { row: 1, col: 0, rowSpan: 2, colSpan: 1, page: 'left', role: 'post' },
      { row: 0, col: 2, rowSpan: 1, colSpan: 2, page: 'right', role: 'band' },
      { row: 1, col: 3, rowSpan: 2, colSpan: 1, page: 'right', role: 'post' },
    ],
  },
  {
    id: '3x4-spread-bookends',
    name: 'Bookends',
    rows: 3,
    cols: 4,
    spread: true,
    cardPockets: 18,
    when: '18 cards that must be read as one continuous field across both pages: a long numbered run, a rarity ladder, a hue gradient that would be spoiled by an interruption.',
    why: 'The only art is a full-height column at each outer fore-edge, so the spread is walled at its two outer boundaries and left completely open through the middle.',
    panels: [
      { row: 0, col: 0, rowSpan: 3, colSpan: 1, page: 'left', role: 'rail' },
      { row: 0, col: 3, rowSpan: 3, colSpan: 1, page: 'right', role: 'rail' },
    ],
  },
];

/** Total pockets a template's panels cover. */
export function artCells(t: ArtTemplate): number {
  return t.panels.reduce((n, p) => n + p.rowSpan * p.colSpan, 0);
}

/**
 * The template to compose a page with, given the page shape and how many cards want to sit on it.
 *
 * MOST ART WINS. Among the templates that can still hold every card, the one that spends the most
 * pockets on art is chosen — the opposite of packing cards in. A page of six cards becomes a page
 * of six cards and a composition, not a page of six cards and three holes.
 *
 * VARIETY IS PART OF "MOST ART", not a compromise against it. Exact-best-only would hand every
 * six-card page in a binder the same layout, because usually only one template leaves exactly six
 * pockets — and a binder that repeats one composition twelve times reads as a template, which is
 * the opposite of curated. So the choice rotates (pass the page index) across every template
 * within `ART_SLACK` cells of the richest one that fits. The floor stays high, the pages differ,
 * and rotating by position keeps it deterministic where random selection would not.
 *
 * Returns null when nothing fits — a page holding more cards than any template leaves room for,
 * which is a full page and correctly gets no art at all.
 */
/**
 * How many art cells a layout may give up to be a different layout from the last page's. Two is
 * one pocket-pair's worth: enough to reach a genuinely different composition, small enough that
 * an art-led page never quietly becomes a card-led one.
 */
export const ART_SLACK = 2;

export function pickTemplate(
  rows: number,
  cols: number,
  cardCount: number,
  opts: { spread?: boolean; rotate?: number; exclude?: (t: ArtTemplate) => boolean } = {},
): ArtTemplate | null {
  const spread = opts.spread ?? false;
  const fits = ART_TEMPLATES.filter(
    (t) =>
      t.rows === rows &&
      t.cols === cols &&
      t.spread === spread &&
      t.cardPockets >= cardCount &&
      !(opts.exclude?.(t) ?? false),
  );
  if (fits.length === 0) return null;
  // Most art first; then a stable id order, so the catalogue's authoring order never silently
  // decides the outcome and the same call always returns the same page.
  const ranked = fits.sort((a, b) => artCells(b) - artCells(a) || a.id.localeCompare(b.id));
  const richest = artCells(ranked[0]);
  const shortlist = ranked.filter((t) => artCells(t) >= richest - ART_SLACK);
  return shortlist[Math.abs(opts.rotate ?? 0) % shortlist.length];
}

/**
 * Does this template leave a whole column free of art?
 *
 * An evolution page reads Basic to final DOWN a column, so a layout that breaks every column part
 * way turns a family into a scatter. The wizard uses this to keep those pages readable rather than
 * dropping the column rule when a composition gets in the way.
 */
export function hasFreeColumn(t: ArtTemplate, leaf?: 'left' | 'right'): boolean {
  const taken = reservedCells(t, leaf);
  for (let c = 0; c < t.cols; c += 1) {
    let free = true;
    for (let r = 0; r < t.rows && free; r += 1) if (taken.has(`${r},${c}`)) free = false;
    if (free) return true;
  }
  return false;
}

/**
 * The cells a template reserves for art, as "row,col" keys. For a spread, `leaf` says which page
 * is being laid out; a single-page template ignores it.
 */
export function reservedCells(t: ArtTemplate, leaf?: 'left' | 'right'): Set<string> {
  const cells = new Set<string>();
  for (const p of t.panels) {
    if (t.spread && leaf && (p.page ?? 'left') !== leaf) continue;
    for (let r = p.row; r < p.row + p.rowSpan; r += 1) {
      for (let c = p.col; c < p.col + p.colSpan; c += 1) cells.add(`${r},${c}`);
    }
  }
  return cells;
}

/**
 * A template's panels as artwork slots, each carrying the role that explains it.
 *
 * `mkId` is passed in rather than imported so this module stays free of the uuid dependency and
 * can be exercised by `node --test` with no bundler.
 */
export function templateArtSlots(
  t: ArtTemplate,
  mkId: () => string,
  leaf?: 'left' | 'right',
): DemoSlot[] {
  return t.panels
    .filter((p) => !(t.spread && leaf) || (p.page ?? 'left') === leaf)
    .map((p) => ({
      id: mkId(),
      row: p.row,
      col: p.col,
      rowSpan: p.rowSpan,
      colSpan: p.colSpan,
      type: 'artwork' as const,
      artRole: p.role,
      artTemplateId: t.id,
    }));
}
