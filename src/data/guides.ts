/**
 * How-to guides — the data behind /learn and /learn/[slug]. Adding a guide is a data-only
 * change: add a Guide here and it appears on the hub and gets a route. Copy rules apply:
 * plain punctuation, no em-dashes, no emoji.
 */

/**
 * Michi's own full guide to the method (the collector who created it, @peeplop). It carries
 * "Best Paper to Use for the Michi Method" and "How to print inserts", which is the source our
 * print guidance defers to on stock weight — keep our numbers consistent with it. Shared here
 * so /michi-method, /learn, and the PDF-unlock celebration all point at one URL.
 */
export const WOAHPOKE_GUIDE = 'https://woahpoke.com/michi-method/';

/**
 * The Auto Page Fill showcase: every fill method built around one card, as finished pages.
 *
 * A STATIC page in `public/` (rewritten to this clean URL in vercel.json), not an Expo route — so
 * it can never be reached with `router.push`, which would fall through the SPA catch-all back to
 * the home screen. It is linked as an EXTERNAL url everywhere, absolute so native opens it in the
 * in-app browser rather than looking for a route that does not exist. Regenerate it with the
 * demo builder rather than editing the HTML by hand.
 */
export const AUTO_FILL_SHOWCASE = 'https://michi-maker.com/auto-fill-methods';

/**
 * The card the showcase is built around (Eevee, SV promo 173), as a static asset of our own
 * deploy. Absolute on purpose: a root-relative path only resolves on web, and this is shown on
 * native too. It ships in public/auto-fill-art/ alongside the page, so it needs no catalog
 * manifest and cannot break when an image content hash changes.
 */
export const AUTO_FILL_SHOWCASE_ART = 'https://michi-maker.com/auto-fill-art/610758.webp';

export interface GuideStep {
  title: string;
  body: string;
}

export interface Guide {
  slug: string;
  title: string;
  lede: string;
  /** Rough read-and-follow time, shown as a chip on the hub. */
  minutes: number;
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

export const GUIDE_LIST: Guide[] = [
  {
    slug: 'curate-from-collection',
    title: 'From a CSV to a finished binder',
    lede: 'Import the cards you own and let michi-maker curate a binder from them, in about three minutes.',
    minutes: 3,
    ctaLabel: 'Try it with the example collection',
    ctaHref: '/my-binders?curate=example&from=learn-guide',
    steps: [
      {
        title: 'Get your collection as a CSV',
        body: 'Scan your cards with tcgscan and export the collection, or export from TCGplayer. Any CSV with a card name, set and number works; quantities are optional. No collection handy? The example collection is about 200 recent cards and is safe to delete afterwards.',
      },
      {
        title: 'Import it',
        body: 'On My binders, press Import my CSV under Curate from my collection and paste or drop the file in. Cards are matched to the catalog as they land, and anything unmatched is listed so you can fix it or skip it.',
      },
      {
        title: 'Press Build binder',
        body: 'The curator reads what you own and proposes pages: evolution lines, species pages, colour runs, artist galleries, rarity ladders. Each proposal is a finished page, drawn from your cards only. It takes a few seconds.',
      },
      {
        title: 'Keep the pages you like',
        body: 'Open the binder it made. Every page is editable like any other: reorder, swap a card, cut art into the empty pockets, or delete a page that does not earn its place. Rebuild any time as your collection grows.',
      },
    ],
    tip: 'A page built from your own cards is the fastest way to see what the michi method does — the layouts are the same ones described in The michi method, applied to what is already in your box.',
    relatedSlugs: ['first-binder', 'slice-studio'],
  },
  {
    slug: 'first-binder',
    title: 'Build your first binder',
    lede: 'From an empty shelf to a page worth staring at, in about ten minutes.',
    minutes: 10,
    steps: [
      {
        title: 'Start a binder',
        body: 'On the home page, press + New next to Your binders. You get a fresh binder with one empty page, and the editor opens straight into it. Give it a title and a description up top; both can change any time.',
      },
      {
        title: 'Pick your page size',
        body: 'In Editing tools, choose the pocket layout: 2x2, 3x3, 3x4, or 4x4. These are the real side-load page sizes you can buy; the app only offers layouts that exist physically. One layout applies to the whole binder, just like real pages in a real binder.',
      },
      {
        title: 'Fill a pocket',
        body: 'Tap any empty pocket to open the picker. Cards come from the full catalog: search by name, or browse series and sets. Standard cards fill one pocket; jumbo cards span 2x2. Keep adding mode keeps the picker open and hops to the next pocket so you can fill a page quickly.',
      },
      {
        title: 'Arrange the page',
        body: 'Drag cards between pockets to rearrange, or drag across the spread to a facing page. Tap a placed card to select it: from there you can replace, duplicate, remove, or resize it. Undo and Redo cover every step.',
      },
      {
        title: 'Think in spreads',
        body: 'Real binders are double-sided: page 1 faces you alone, then pages 2 and 3 face each other, and so on. The editor shows the true spread so a two-page composition reads exactly like it will on the shelf.',
      },
    ],
    tip: 'Not sure what to build? Open an example binder from the home page and press Duplicate to make it yours, then swap cards.',
    relatedSlugs: ['slice-studio', 'print-binder'],
  },
  {
    slug: 'slice-studio',
    title: 'Cut any art into pockets',
    lede: 'The Slice Studio turns one picture into pocket-sized pieces you arrange like cards.',
    minutes: 8,
    steps: [
      {
        title: 'Open the studio',
        body: 'In the editor, tap a pocket and choose Artwork, or press Slice new art in the slice tray at the bottom. The studio opens with a grid matching your page size.',
      },
      {
        title: 'Bring in a picture',
        body: 'Pick official card art from the catalog, upload your own image, paste a URL, or drag an image straight onto the window from another tab. The Art sources list has galleries worth raiding.',
      },
      {
        title: 'Frame it',
        body: 'Drag to pan and scroll to zoom until the picture sits right in the grid. Rotate a quarter turn at a time, flip horizontally or vertically, or press Just the art to crop a card image down to its illustration. Your original image is never modified, only windowed.',
      },
      {
        title: 'Fold a pair if you like',
        body: 'Click two side-by-side pieces on a pocket pair that opens along the same inside edge and the studio offers Fold and merge: one printed piece, folded down the middle, sliding into both pockets. That is real binder physics; the studio only offers folds that physically work.',
      },
      {
        title: 'Save slices',
        body: 'Press Save slices and every piece lands in your slice tray, saved to your account. In the editor, drag a slice from the tray onto any pocket where it fits, or tap the slice and then tap a highlighted pocket. Slices stay in the tray after placing, so one cut can fill many pages.',
      },
    ],
    tip: 'Slices dragged onto a page follow the same physics as print: single pockets or folded sideways pairs, never vertical spans.',
    relatedSlugs: ['first-binder', 'print-binder'],
  },
  {
    slug: 'print-binder',
    title: 'Print your binder at true size',
    lede: 'Fill sheets turn a digital page into paper pieces that slide into real pockets.',
    minutes: 8,
    steps: [
      {
        title: 'Open the print sheet',
        body: 'From the home page, open a binder’s menu (the three dots on its tile) and choose Print. You get a preview of every page laid out as cut-ready fill sheets.',
      },
      {
        title: 'Print at 100 percent',
        body: 'Print at Actual size, never Fit to page. Every card prints at the true 2.5 by 3.5 inch card size, and pieces sit edge to edge so neighboring pieces share one cut. Folded art pieces get their own sheets at the end.',
      },
      {
        title: 'Choose your paper',
        body: 'Every export is two files, because the two halves want different paper. The placeholders file is temporary, since each piece gets swapped out the day the real card arrives, so plain copy paper is the right call, and cheap enough to reprint whenever the layout changes. The art file is permanent: those pieces stay in the binder for good, so print them on matte coated cardstock, around 250 to 300 gsm. Michi recommends roughly 300 gsm matte coated stock, and the reasoning is worth knowing: plain printer paper is too flimsy to sit flat in a pocket, and uncoated cardstock lets the ink spread. Matte over glossy matters too: a glossy sheet behind a glossy sleeve next to a glossy card throws three competing reflections, and the art is the one that loses.',
      },
      {
        title: 'Get the settings right first',
        body: 'Print one test page before committing a whole binder. Set scaling to Actual size or 100 percent, turn borderless off, and pick the highest quality your printer offers. Then measure a placeholder with a ruler: it should be exactly 2.5 by 3.5 inches (63 by 88 mm). If it is short, scaling is still on somewhere. Cardstock usually wants the heavy paper or cardstock media setting too, or the ink sits wet on the surface and smudges when you cut. A guillotine or straight cutter gives cleaner edges than scissors, and a cutting machine can do it automatically.',
      },
      {
        title: 'Cut and slide',
        body: 'Cut along each piece’s dashed outline. Each piece is printed with its page, row, and column, so you always know which pocket it belongs to. Folded art pairs print as one piece with the fold marked.',
      },
      {
        title: 'Swap as cards arrive',
        body: 'Placeholders hold the layout until the real card shows up. When one arrives, its placeholder tells you exactly which pocket to swap. The binder fills in over time without ever losing its composition.',
      },
    ],
    tip: 'Full-binder PDF export is a paid unlock while the free preview shows a premade example sheet. See Plans for what each plan includes.',
    relatedSlugs: ['first-binder', 'slice-studio'],
  },
  {
    slug: 'search-your-cards',
    title: 'Power-search your cards',
    lede: 'The search box is a tiny query language. Aim at a field, compare numbers and dates, sort, and filter by your collection, then stack it all together.',
    minutes: 3,
    ctaLabel: 'Open the interactive cheatsheet',
    ctaHref: '/search-guide',
    steps: [
      {
        title: 'Just type words',
        body: 'Type anything: charizard, or arita fire. Every word has to match somewhere (name, set, series, artist, rarity, type), so piling words on narrows the results.',
      },
      {
        title: 'Target a field',
        body: 'Put a field before a colon to aim: set:base, artist:arita, type:fire, rarity:"holo rare". Quote multi-word values so the whole thing is matched.',
      },
      {
        title: 'Compare numbers and dates',
        body: 'Use >, <, >=, <=: try >$100 for value, hp>=300, stage>1, or date>2022. A colon means exactly equal: hp:120, year:1999.',
      },
      {
        title: 'Sort',
        body: 'sort:value puts the priciest first (the tiles show values). Also sort:newest, sort:hp, sort:name. Add :asc or :desc to flip the direction.',
      },
      {
        title: 'Filter by your collection',
        body: 'have:yes shows the cards you own; have:no shows what you are missing. Combine with a set to build a want-list, like set:"evolving skies" have:no.',
      },
      {
        title: 'Stack and refine',
        body: 'Everything combines. Run something broad, then keep adding fields, comparisons, and the chip filters until it is exactly what you want. The Set filter pins one exact set when a name is too fuzzy.',
      },
    ],
    tip: 'The interactive cheatsheet puts a Try it button on every example, so you can run a query and keep building on it.',
    relatedSlugs: ['first-binder'],
  },
  {
    slug: 'auto-page-fill',
    title: 'Build a page around one card',
    lede: 'Put one card in a pocket and let michi-maker build the rest of the page around it. Eight ways, each a different idea of what the page is about.',
    minutes: 5,
    // The hosted article shows all eight methods as the pages they produced, which is the whole
    // point of the subject, so the hub card goes there rather than to the steps below.
    externalHref: AUTO_FILL_SHOWCASE,
    ctaLabel: 'See all eight methods as finished pages',
    ctaHref: AUTO_FILL_SHOWCASE,
    ctaExternal: true,
    steps: [
      {
        title: 'Place the card the page is about',
        body: 'Fill one pocket with the card you want the page built around. It can go anywhere, though the middle of a 3x3 reads best. This is the seed: everything else is chosen to sit with it.',
      },
      {
        title: 'Open Fill page',
        body: 'Tap the placed card to select it, then choose ✨ Fill page in the pocket toolbar. You get the list of methods that actually suit this card, so what you see depends on what the card is.',
      },
      {
        title: 'Pick what the page is about',
        body: 'Same Pokemon follows the species across the years. Evolution line lays out the family. Same artist is a gallery for one illustrator. Friends and partners brings in who it canonically appears beside. More like this picks the cards that look closest to it.',
      },
      {
        title: 'Or make the page about colour',
        body: 'Color by type gathers cards sharing its energy type and is included on every plan. Color match ranks every card by its actual palette, nearest first, for a page that flows edge to edge. Full-page spread flows one of our own colour sheets across the empty pockets so your cards read as accents on it.',
      },
      {
        title: 'Expect one of each, not eight of one',
        body: 'No fill repeats a Pokemon while it still has someone new to show. Eevee has eight evolutions and a 3x3 page has eight free pockets, so the family page is all eight of them. When there are fewer subjects than pockets it cycles instead: two friends across eight pockets is four cards each, alternating.',
      },
      {
        title: 'Narrow it to cards you own',
        body: 'If your collection is synced from TCGScan, turn on From my collection and every method draws only from cards you actually have. The language toggle beside it decides whether English, Japanese, or both printings are eligible.',
      },
      {
        title: 'Keep it or take it back',
        body: 'A fill only writes into empty pockets, so nothing you placed yourself moves. The whole fill is a single step, so one Undo reverses all of it and you can try a different method straight away.',
      },
    ],
    tip: 'VIP adds Pages around this card: it builds every method at once, shows you each finished page, and adds the ones you keep to the binder as new pages.',
    relatedSlugs: ['first-binder', 'slice-studio'],
  },
];

export const GUIDES: Record<string, Guide> = Object.fromEntries(
  GUIDE_LIST.map((g) => [g.slug, g]),
);
