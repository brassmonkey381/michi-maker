/**
 * The how-to guides, as data. `/learn` lists GUIDE_LIST; `/learn/[slug]` renders one.
 *
 * SHOW, THEN SAY. Every step has a picture — a drawn scene of the idea or of the screen with the
 * button ringed (src/components/learn/Diagrams.tsx), or the Eevee loop — and one or two sentences
 * under it. Drawn scenes rather than screen recordings: a recording shows the editor as it was
 * the day it was captured, and the editor moves faster than anyone re-records it.
 */

/** Hosted long-form pieces that cover a subject better than in-app steps can. */
export const WOAHPOKE_GUIDE = 'https://woahpoke.com/michi-method/';
/** Our own walkthrough of all eight fill methods, each shown as the page it produced. */
export const AUTO_FILL_SHOWCASE = 'https://michi-maker.com/auto-fill-methods';
/** The card that walkthrough builds its pages around (its art, for the feature card). */
export const AUTO_FILL_SHOWCASE_ART = 'https://michi-maker.com/auto-fill-art/610758.webp';

/** Card art the site hosts. */
const ART = (id: number) => `https://michi-maker.com/auto-fill-art/${id}.webp`;

/** The hub card's hook: the guide's own subject at the size of a card (see GuideHook). */
export type GuideHook =
  | { kind: 'art'; src: string }
  | { kind: 'slice'; src: string }
  | { kind: 'sheet' }
  | { kind: 'query' }
  /** Three live cards from a query (ResultStrip, compact): the artwork search's own subject. */
  | { kind: 'theme'; query: string };

/** A drawn scene from src/components/learn/Diagrams.tsx. */
export type DiagramName =
  | 'editor-pocket'
  | 'editor-slice-new'
  | 'editor-art-tab'
  | 'editor-tray'
  | 'editor-print'
  | 'slice'
  | 'fold'
  | 'true-size'
  | 'paper'
  | 'cut'
  | 'swap'
  | 'seed'
  | 'query-anatomy'
  | 'operators'
  | 'want-list';

export type GuideFigure =
  | { kind: 'media'; src: string; poster?: string; alt: string }
  | { kind: 'diagram'; name: DiagramName }
  /** The Eevee loop: seven fill methods laying their cards around one seed (EeveeReplay). */
  | { kind: 'replay' }
  /** A live search: the query as the box shows it, the real cards it finds, a Try it (ResultStrip). */
  | { kind: 'results'; query: string; limit?: number; note?: string };

export interface GuideStep {
  title: string;
  /** One or two sentences: what to press, what happens. The figure carries the rest. */
  body: string;
  figure?: GuideFigure;
}

export interface Guide {
  slug: string;
  title: string;
  lede: string;
  /** The hook on the hub card: what the guide is about, drawn small. */
  hook: GuideHook;
  /** The guide's opening picture. */
  hero?: GuideFigure;
  /** A closing picture, after the steps and before the tip: the whole thing in motion. */
  closing?: GuideFigure;
  steps: GuideStep[];
  /** Optional closing pointer. */
  tip?: string;
  relatedSlugs?: string[];
  /** Optional call-to-action button (e.g. an interactive companion page). Shown under the lede. */
  ctaLabel?: string;
  ctaHref?: string;
  /** `ctaHref` is a real URL, not an Expo route — open it in the browser, never router.push. */
  ctaExternal?: boolean;
  /**
   * When set, the /learn hub card opens THIS url instead of the in-app guide route. Used where a
   * hosted page covers the subject better than the in-app steps can. The in-app route stays
   * reachable by direct link.
   */
  externalHref?: string;
}

const diagram = (name: DiagramName): GuideFigure => ({ kind: 'diagram', name });

export const GUIDE_LIST: Guide[] = [
  {
    slug: 'auto-page-fill',
    title: 'How to fill a Pokémon binder page around one card',
    lede: 'Seed one pocket and let michi-maker finish the page around it.',
    hook: { kind: 'art', src: ART(610758) },
    ctaLabel: 'See all eight methods as finished pages',
    ctaHref: AUTO_FILL_SHOWCASE,
    ctaExternal: true,
    closing: { kind: 'replay' },
    steps: [
      {
        title: 'Place the seed',
        body: 'Fill one pocket with the card the page is about. The middle of a 3×3 reads best.',
        figure: diagram('seed'),
      },
      { title: 'Open Fill page', body: 'Tap the card, then ✨ Fill page. You only see the methods that suit this card.' },
      {
        title: 'Pick the idea',
        body: 'Same Pokémon, Evolution line, Same artist, Friends and partners, More like this; or Colour by type, Colour match, Full-page spread.',
      },
      {
        title: 'Commit it, then keep it or take it back',
        body: 'A fill only writes into empty pockets, so nothing you placed moves. It is one step, so one Undo reverses the whole fill and you can try another method.',
      },
    ],
    tip: 'Turn on From my collection and every method draws only from cards you own. VIP adds Pages around this card: every method at once, and you keep the ones you like.',
    relatedSlugs: ['slice-studio', 'print-binder'],
  },
  {
    slug: 'slice-studio',
    title: 'How to cut artwork into binder pockets (Slice Studio)',
    lede: 'One picture becomes pocket-sized pieces you arrange like cards.',
    hook: { kind: 'slice', src: ART(201981) },
    ctaLabel: 'Open the Slice Studio in a binder',
    ctaHref: '/my-binders?open=slice',
    hero: diagram('editor-slice-new'),
    steps: [
      {
        title: 'Open the studio',
        body: 'In the Artwork dock on the left, press Slice new art. Or tap any pocket and choose Artwork.',
        figure: diagram('editor-pocket'),
      },
      {
        title: 'Bring in a picture',
        body: 'Card art from the catalog, an upload, a pasted URL, or an image dragged in from another tab.',
      },
      {
        title: 'Frame it',
        body: 'Drag to pan, scroll to zoom, rotate a quarter turn, or press Just the art. The original is only windowed, never changed.',
        figure: diagram('slice'),
      },
      {
        title: 'Fold a pair if you like',
        body: 'Two sideways pockets that open on the same inside edge can take one folded piece.',
        figure: diagram('fold'),
      },
      {
        title: 'Save slices',
        body: 'Every piece lands in the tray of the Artwork dock. Drag one onto any pocket where it fits; it stays in the tray for the next page too.',
        figure: diagram('editor-tray'),
      },
    ],
    tip: 'Slices follow print physics: single pockets or folded sideways pairs, never vertical spans.',
    relatedSlugs: ['print-binder', 'auto-page-fill'],
  },
  {
    slug: 'print-binder',
    title: 'How to print a Pokémon binder fill sheet at true card size',
    lede: 'Cut-ready sheets, real card size, so the binder fills in as the cards arrive.',
    hook: { kind: 'sheet' },
    ctaLabel: 'Try the print demo',
    ctaHref: '/binder/example-fill-sheet?print=1',
    steps: [
      {
        title: 'Open the print sheet',
        body: 'Press Print in the binder’s header, or on its tile on My binders. Every page is laid out as fill sheets.',
        figure: diagram('editor-print'),
      },
      {
        title: 'Print at 100 percent',
        body: 'Actual size, never Fit to page, borderless off. Measure one placeholder: 2.5 by 3.5 inches exactly.',
        figure: diagram('true-size'),
      },
      {
        title: 'Two files, two papers',
        body: 'Placeholders are temporary, so plain paper. Art stays for good, so matte cardstock: it sits flat and does not fight a glossy sleeve.',
        figure: diagram('paper'),
      },
      {
        title: 'Cut and slide',
        body: 'Cut along the dashed outlines. Each piece carries its page, row and column; a folded art pair is one piece for two pockets.',
        figure: diagram('cut'),
      },
      {
        title: 'Swap as cards arrive',
        body: 'A placeholder tells you exactly which pocket the real card goes in. The composition never moves.',
        figure: diagram('swap'),
      },
    ],
    tip: 'Full-binder PDF export is a paid unlock; the free preview prints a premade example sheet.',
    relatedSlugs: ['slice-studio', 'auto-page-fill'],
  },
  {
    slug: 'search-your-cards',
    title: 'How to search Pokémon cards by set, artist, price and more',
    lede: 'Words, fields, comparisons and sorts, stacked until it is exactly what you want.',
    hook: { kind: 'query' },
    hero: diagram('query-anatomy'),
    ctaLabel: 'Open the interactive cheatsheet',
    ctaHref: '/search-guide',
    steps: [
      { title: 'Just type words', body: 'charizard, or arita fire. Every word must match somewhere, so more words narrow it.' },
      {
        title: 'Aim at a field, compare, sort',
        body: 'A colon aims a word at one field. Operators compare numbers and dates. sort: orders the result.',
        figure: diagram('operators'),
      },
      {
        title: 'Filter by your collection',
        body: 'have:yes is what you own; have:no with a set is a want-list.',
        figure: diagram('want-list'),
      },
      { title: 'Stack and refine', body: 'Everything combines. Start broad, keep adding until it is exactly the pile you meant.' },
    ],
    tip: 'The cheatsheet puts a Try it button on every example.',
    relatedSlugs: ['artwork-search', 'auto-page-fill'],
  },
  // ARTWORK SEARCH. Every figure is live (ResultStrip): the reader sees the cards their own
  // account gets, and a free reader sees the meter row exactly where a paid one sees the rest.
  // Copy says what the search finds and never how the cards were described; it names a few
  // scenes worth trying and nothing like a vocabulary.
  {
    slug: 'artwork-search',
    title: 'How to search Pokémon cards by what the artwork shows',
    lede: 'Ask for a picture instead of a name: a forest, a night sky, something underwater. Then stack it with everything else you already know.',
    hook: { kind: 'theme', query: 'theme:forest' },
    hero: { kind: 'results', query: 'theme:forest', note: 'Every match, on every plan.' },
    ctaLabel: 'Open the interactive cheatsheet',
    ctaHref: '/search-guide',
    steps: [
      {
        title: 'Ask for a picture',
        body: 'theme: searches what the ARTWORK shows, not the name printed on the card. Forest is on us: everyone sees every match.',
      },
      {
        title: 'Stack it with what you already know',
        body: 'A theme is a field like any other, so set:, type:, rarity: and a sort all narrow it. Two words find the full-art printings of a scene.',
        figure: { kind: 'results', query: 'theme:forest rarity:illustration' },
      },
      {
        title: 'Two ideas at once',
        body: 'Two themes must both show, so the water cards drawn at sunset are one search. Each theme you add narrows it further.',
        figure: { kind: 'results', query: 'theme:water theme:sunset' },
      },
      {
        title: 'Try what you see',
        body: 'Forest, water, snow, night, city, sky, sunset, flowers. Any plain word about a picture is worth a try; the grey line under the box says how it was read.',
        figure: { kind: 'results', query: 'theme:night theme:city' },
      },
      {
        title: 'Every match, and the pages built from them',
        body: 'Free and guest accounts see the top few matches of any theme and how many more there are. PRO and VIP see every match, and the same pictures power Same scene in the fill sheet, the scene pages Build a binder proposes, and the Story binder.',
        figure: { kind: 'results', query: 'theme:snow', note: 'The row under a metered search says what a plan adds.' },
      },
    ],
    tip: 'The ? button beside the search box has an Artwork tab with these examples ready to tap.',
    relatedSlugs: ['search-your-cards', 'auto-page-fill'],
  },
];

export const GUIDES: Record<string, Guide> = Object.fromEntries(GUIDE_LIST.map((g) => [g.slug, g]));
