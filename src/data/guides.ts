/**
 * How-to guides — the data behind /learn and /learn/[slug]. Adding a guide is a data-only
 * change: add a Guide here and it appears on the hub and gets a route. Copy rules apply:
 * plain punctuation, no em-dashes, no emoji.
 */

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
}

export const GUIDE_LIST: Guide[] = [
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
    minutes: 6,
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
];

export const GUIDES: Record<string, Guide> = Object.fromEntries(
  GUIDE_LIST.map((g) => [g.slug, g]),
);
