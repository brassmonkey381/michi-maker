/**
 * The how-to guides, as data. `/learn` lists GUIDE_LIST; `/learn/[slug]` renders one.
 *
 * SHOW, THEN SAY. Every step has a picture — a demo clip of the real screen, or a small drawn
 * scene of the idea (src/components/learn/Diagrams.tsx) — and one or two sentences under it.
 * The guides used to be columns of paragraphs ("open the studio, load a picture, frame it, fold a
 * pair, save slices"), which is the least fun way to learn a visual tool. The words now name
 * what to press; the picture shows where it is and what happens.
 */

/** Hosted long-form pieces that cover a subject better than in-app steps can. */
export const WOAHPOKE_GUIDE = 'https://woahpoke.com/michi-method/';
/** Our own walkthrough of all eight fill methods, each shown as the page it produced. */
export const AUTO_FILL_SHOWCASE = 'https://michi-maker.com/auto-fill-methods';
/** The card that walkthrough builds its pages around (its art, for the feature card). */
export const AUTO_FILL_SHOWCASE_ART = 'https://michi-maker.com/auto-fill-art/610758.webp';

/** The demo clips and stills the landing page ships, reused here. Root-relative: served from public/. */
const CLIP = {
  composer: { src: '/welcome_v2-assets/demo-composer.mp4', poster: '/welcome_v2-assets/desktop-composer.jpg' },
  curate: { src: '/welcome_v2-assets/demo-curate.mp4', poster: '/welcome_v2-assets/desktop-curate.jpg' },
  slice: { src: '/welcome_v2-assets/demo-slice.mp4', poster: '/welcome_v2-assets/poster-slice.jpg' },
  print: { src: '/welcome_v2-assets/demo-print.mp4', poster: '/welcome_v2-assets/poster-print.jpg' },
  search: { src: '/welcome_v2-assets/demo-search.mp4', poster: '/welcome_v2-assets/desktop-search.jpg' },
  tricolor: { src: '/welcome_v2-assets/demo-tricolor.mp4', poster: '/welcome_v2-assets/desktop-tricolor.jpg' },
};

/** A drawn scene from src/components/learn/Diagrams.tsx. */
export type DiagramName =
  | 'shapes'
  | 'fill-pocket'
  | 'arrange'
  | 'spread'
  | 'slice'
  | 'fold'
  | 'true-size'
  | 'paper'
  | 'cut'
  | 'seed'
  | 'one-of-each'
  | 'csv-to-binder';

export type GuideFigure =
  | { kind: 'media'; src: string; poster?: string; alt: string }
  | { kind: 'diagram'; name: DiagramName }
  /** The Eevee loop: seven fill methods laying their cards around one seed (EeveeReplay). */
  | { kind: 'replay' };

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
  /** Rough read-and-follow time, shown as a chip on the hub. */
  minutes: number;
  /** The guide's opening picture: the real screen, moving. */
  hero?: GuideFigure;
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
   * hosted page covers the subject better than the in-app steps can (the fill methods want the
   * finished pages next to them). The in-app route stays reachable by direct link.
   */
  externalHref?: string;
}

const media = (c: { src: string; poster: string }, alt: string): GuideFigure => ({ kind: 'media', ...c, alt });
const diagram = (name: DiagramName): GuideFigure => ({ kind: 'diagram', name });

export const GUIDE_LIST: Guide[] = [
  {
    slug: 'curate-from-collection',
    title: 'From a CSV to a finished binder',
    lede: 'Import the cards you own and let michi-maker curate a binder from them.',
    minutes: 3,
    hero: media(CLIP.curate, 'Importing a collection and building a binder from it'),
    ctaLabel: 'Try it with the example collection',
    ctaHref: '/my-binders?curate=example&from=learn-guide',
    steps: [
      {
        title: 'Get your collection as a CSV',
        body: 'Scan with tcgscan or export from TCGplayer. No file handy? The example collection is about 200 cards and safe to delete.',
        figure: diagram('csv-to-binder'),
      },
      {
        title: 'Import it',
        body: 'On My binders, press Import my CSV and drop the file in. Unmatched cards are listed so you can fix or skip them.',
      },
      {
        title: 'Press Build binder',
        body: 'The curator proposes finished pages from your cards only: evolution lines, species pages, colour runs, artist galleries.',
        figure: diagram('seed'),
      },
      {
        title: 'Keep the pages you like',
        body: 'Every page is editable like any other. Rebuild any time as the collection grows.',
      },
    ],
    tip: 'The layouts are the ones described in The michi method, applied to what is already in your box.',
    relatedSlugs: ['first-binder', 'slice-studio'],
  },
  {
    slug: 'first-binder',
    title: 'Build your first binder',
    lede: 'From an empty shelf to a page worth staring at.',
    minutes: 5,
    hero: media(CLIP.composer, 'Filling and arranging a binder page in the editor'),
    steps: [
      {
        title: 'Start a binder',
        body: 'Press + New next to My binders. You get one empty page and the editor opens into it.',
      },
      {
        title: 'Pick your page size',
        body: 'The real side-load sizes only. One size applies to the whole binder, like real pages.',
        figure: diagram('shapes'),
      },
      {
        title: 'Fill a pocket',
        body: 'Tap any pocket to open the picker. Keep adding hops to the next pocket for you.',
        figure: diagram('fill-pocket'),
      },
      {
        title: 'Arrange the page',
        body: 'Drag cards between pockets or across to the facing page. Undo covers every step.',
        figure: diagram('arrange'),
      },
      {
        title: 'Think in spreads',
        body: 'Page 1 faces you alone; then 2 and 3 face each other. The editor shows the true spread.',
        figure: diagram('spread'),
      },
    ],
    tip: 'Not sure what to build? Open an example binder from the home page and press Duplicate.',
    relatedSlugs: ['slice-studio', 'print-binder'],
  },
  {
    slug: 'slice-studio',
    title: 'Cut any art into pockets',
    lede: 'One picture becomes pocket-sized pieces you arrange like cards.',
    minutes: 5,
    hero: media(CLIP.slice, 'Framing a picture over a pocket grid and saving the slices'),
    steps: [
      {
        title: 'Open the studio',
        body: 'Tap a pocket and choose Artwork, or press Slice new art in the tray at the bottom.',
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
        body: 'Every piece lands in your tray. Drag one onto any pocket where it fits; it stays in the tray for the next page too.',
      },
    ],
    tip: 'Slices follow print physics: single pockets or folded sideways pairs, never vertical spans.',
    relatedSlugs: ['first-binder', 'print-binder'],
  },
  {
    slug: 'print-binder',
    title: 'Print your binder at true size',
    lede: 'Cut-ready sheets, real card size, so the binder fills in as the cards arrive.',
    minutes: 5,
    hero: media(CLIP.print, 'A binder laid out as cut-ready fill sheets'),
    steps: [
      {
        title: 'Open the print sheet',
        body: 'Press Print on the binder, or on its tile on My binders. Every page is laid out as fill sheets.',
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
        body: 'Cut along the dashed outlines. Each piece carries its page, row and column.',
        figure: diagram('cut'),
      },
      {
        title: 'Swap as cards arrive',
        body: 'A placeholder tells you exactly which pocket the real card goes in. The composition never moves.',
      },
    ],
    tip: 'Full-binder PDF export is a paid unlock; the free preview prints a premade example sheet.',
    relatedSlugs: ['first-binder', 'slice-studio'],
  },
  {
    slug: 'search-your-cards',
    title: 'Power-search your cards',
    lede: 'Words, fields, comparisons and sorts, stacked until it is exactly what you want.',
    minutes: 3,
    hero: media(CLIP.search, 'Narrowing a card search with fields and comparisons'),
    ctaLabel: 'Open the interactive cheatsheet',
    ctaHref: '/search-guide',
    steps: [
      { title: 'Just type words', body: 'charizard, or arita fire. Every word must match somewhere, so more words narrow it.' },
      { title: 'Target a field', body: 'set:base, artist:arita, type:fire, rarity:"holo rare". Quote multi-word values.' },
      { title: 'Compare', body: '>$100, hp>=300, date>2022. A colon means exactly: hp:120.' },
      { title: 'Sort', body: 'sort:value, sort:newest, sort:hp, sort:name. Add :asc or :desc.' },
      {
        title: 'Filter by your collection',
        body: 'have:no with a set is a want-list: set:"evolving skies" have:no.',
        figure: media(CLIP.tricolor, 'Tri-colour search finding cards by palette'),
      },
      { title: 'Stack and refine', body: 'Everything combines. Start broad, keep adding.' },
    ],
    tip: 'The cheatsheet puts a Try it button on every example.',
    relatedSlugs: ['first-binder'],
  },
  {
    slug: 'auto-page-fill',
    title: 'Build a page around one card',
    lede: 'Seed one pocket and let michi-maker finish the page around it.',
    minutes: 3,
    // The hosted article still shows all eight methods as finished pages; the in-app guide now
    // opens on the same Eevee with the methods playing out live, so the hub lands here.
    ctaLabel: 'See all eight methods as finished pages',
    ctaHref: AUTO_FILL_SHOWCASE,
    ctaExternal: true,
    hero: { kind: 'replay' },
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
        title: 'One of each, not eight of one',
        body: 'Eevee has eight evolutions and a 3×3 has eight free pockets, so the family page is all eight.',
        figure: diagram('one-of-each'),
      },
      { title: 'From my collection', body: 'Turn it on and every method draws only from cards you own.' },
      { title: 'Keep it or take it back', body: 'A fill only writes into empty pockets, and one Undo reverses the whole fill.' },
    ],
    tip: 'VIP adds Pages around this card: every method at once, and you keep the ones you like.',
    relatedSlugs: ['first-binder', 'slice-studio'],
  },
];

export const GUIDES: Record<string, Guide> = Object.fromEntries(GUIDE_LIST.map((g) => [g.slug, g]));
