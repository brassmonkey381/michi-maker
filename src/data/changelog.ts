/**
 * The public changelog behind `/whats-new`: what shipped, in the user's language, grouped by
 * date, newest first.
 *
 * HOUSE RULES for entries, so the page stays worth reading:
 *   - User-facing outcomes only. "Binders start out public once you turn sharing on", never
 *     "refactored the provenance gate". If a change has no visible effect, it does not belong.
 *   - Honest about scope: if existing data is untouched, say so; if a feature needs a plan or an
 *     account, say so.
 *   - One entry per batch, dated by the day its last change was COMMITTED to the branch, not
 *     the day it was pushed or promoted. Append at the TOP; the page renders this array in order.
 *   - EVERY ITEM SAYS WHICH PRODUCTS IT LANDED IN. The page is the changelog for michi-maker
 *     AND for TCGScan, and a reader who only uses one of them filters the other out. Plenty of
 *     what ships is genuinely both, because the two share a browse kit and a card catalogue;
 *     those list both products rather than being written twice or quietly filed under one.
 *   - TAG EVERY ITEM: kind (new, better, fix) and area. The tags are how the page is read; the
 *     prose is for the one item in ten the reader stops on. Mark `big` on at most two or three
 *     items in a release, and never on a fix.
 *   - NEVER CLAIM MORE THAN SHIPPED. "Everywhere", "every" and "always" are almost always wrong:
 *     a rename that reached one screen, a badge that needs a setting turned on, a picker that
 *     appears for a sixth of cards. Say where it works. A changelog that overstates is worse than
 *     no changelog, because the reader finds out by being disappointed.
 *   - Plain punctuation. No em-dashes, no decorative emoji.
 *   - ONE OR TWO SENTENCES PER ITEM. Nobody reads a changelog the way it was written; they scan
 *     it for the one line that affects them. A paragraph explaining the reasoning behind a change
 *     buries the four other items next to it. Say what changed and what the reader should do, and
 *     let the ones who want the story ask.
 */

/**
 * The two things a reader might be here about. The web app where binders are built, and the phone
 * app that scans cards into a collection. They share an account, a catalogue and a browse kit, so
 * a good deal of what ships touches both.
 */
export type ChangelogProduct = 'michi' | 'tcgscan';

/** In the order the filter shows them, with the names used in the products' own copy. */
export const CHANGELOG_PRODUCTS: { id: ChangelogProduct; label: string }[] = [
  { id: 'michi', label: 'michi-maker' },
  { id: 'tcgscan', label: 'TCGScan' },
];

/**
 * WHAT KIND OF CHANGE IT IS. Three, because three is the most a reader will hold while scanning,
 * and because every change really is one of these: something that was not there before, something
 * that was there and got better, or something that was broken.
 */
export type ChangeKind = 'new' | 'better' | 'fix';

export const CHANGE_KINDS: { id: ChangeKind; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'better', label: 'Improved' },
  { id: 'fix', label: 'Fixed' },
];

/**
 * WHERE IN THE PRODUCTS IT LANDED. Named for the part of the app a reader would say they were in,
 * not for the code that changed: someone looking for "did scanning get better" should not have to
 * know that scanning, review and sessions are three different screens.
 */
export type ChangeArea =
  | 'binders'
  | 'browse'
  | 'scanning'
  | 'collection'
  | 'sharing'
  | 'account'
  | 'cards';

export const CHANGE_AREAS: Record<ChangeArea, string> = {
  binders: 'Binders',
  browse: 'Browse',
  scanning: 'Scanning',
  collection: 'Collection',
  sharing: 'Sharing',
  account: 'Account',
  cards: 'Cards and prices',
};

export interface ChangelogItem {
  head: string;
  body: string;
  /**
   * Which products this landed in. Usually one. A change to the shared browse kit or to the card
   * catalogue lands in BOTH, and saying so once beats writing it twice: a reader filtering to one
   * product still sees it, and a reader with both filters on does not read it twice.
   */
  products: ChangelogProduct[];
  kind: ChangeKind;
  area: ChangeArea;
  /**
   * One of the few things worth stopping for. Kept SCARCE on purpose: at most two or three a
   * release, and never a fix. If everything is a headline the page is a wall again, which is
   * exactly what this flag exists to prevent.
   */
  big?: boolean;
}

export interface ChangelogEntry {
  /** ISO date: the day the batch's last change was committed. */
  date: string;
  /** Short name for the batch. */
  title: string;
  items: ChangelogItem[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-09-03',
    title: 'Dressed covers, theme search, and guides with pictures',
    items: [
      {
        products: ['michi'],
        head: 'Dress the covers',
        kind: 'new',
        area: 'binders',
        big: true,
        body:
          'A binder with a cover now takes text, stickers and art on all four cover surfaces: '
          + 'front, inside front, inside back and back. Text in a handful of fonts including a '
          + 'marker, on a post-it, notecard or postcard; stickers from the set and series logos; '
          + 'art from your tray or a link, cropped and rotated in place, up to twelve pieces a '
          + 'surface with a Layers tray while you edit. PRO and VIP; covers already on a binder '
          + 'stay visible to everyone.',
      },
      {
        products: ['michi'],
        head: 'Search the artwork by theme',
        kind: 'new',
        area: 'browse',
        big: true,
        body:
          'A Theme Search button now sits beside Tri-Color Search, and theme:, art: and scene: work '
          + 'in the search box: theme:underwater finds cards drawn beneath the surface. Theme search '
          + 'is VIP; the button runs a free Forest scenes demonstration for everyone, and '
          + 'the search cheatsheet has it as a recipe.',
      },
      {
        products: ['michi'],
        head: 'Curate from my collection, wherever you are',
        kind: 'new',
        area: 'collection',
        big: true,
        body:
          'Home, Discover, The michi method, Learn and Welcome all offer the curator: import the '
          + 'cards you own and get a binder built from them. Both buttons land on My binders with '
          + 'the right sheet already open, and a three-minute guide walks the whole path.',
      },
      {
        products: ['michi'],
        head: 'Guides show before they tell',
        kind: 'better',
        area: 'binders',
        body:
          'Every how-to on Learn opens on a picture of its subject and gives each step a drawn scene: '
          + 'the editor with the button you press ringed, a picture cut into pockets, a card at its true '
          + 'printed size. The fill guide ends on Eevee being filled seven ways, and the print and slice '
          + 'guides each have a button that opens the real thing.',
      },
      {
        products: ['michi'],
        head: 'The michi method, on real pages',
        kind: 'better',
        area: 'binders',
        body:
          'Each of the eight page styles is now shown as an actual page from one of our binders, with '
          + 'real cards, and tapping one opens the binder it lives in.',
      },
      {
        products: ['michi'],
        head: 'Print from the binder itself',
        kind: 'better',
        area: 'binders',
        body:
          'Print now sits in the binder header next to Share for owners, and next to Duplicate for '
          + 'visitors. The print sampler binder has it too.',
      },
      {
        products: ['michi'],
        head: 'The cheatsheet opens on the good stuff',
        kind: 'better',
        area: 'browse',
        body:
          'New recipes up top: Illustration Rares newest first, Special Illustration Rares by value, '
          + 'full arts, and new and upcoming sets. Every Try it button now reads as a button.',
      },
      {
        products: ['michi'],
        head: 'Binder tiles say their shape',
        kind: 'better',
        area: 'binders',
        body:
          'Every binder tile reads like "3×4 · 12 pages", and a 3×4 binder takes the same box on '
          + 'the shelf as a 3×3 instead of coming out smaller.',
      },
      {
        products: ['michi'],
        head: 'Titles and art explain themselves on hover',
        kind: 'better',
        area: 'binders',
        body:
          'Hovering a binder title, a page title on either half of an open book, or an art placeholder '
          + 'shows its description at once, with a placeholder when nothing is written yet. The cards '
          + 'stay on screen, and a page turn closes them.',
      },
      {
        products: ['michi'],
        head: 'The contest runs in two rounds',
        kind: 'better',
        area: 'sharing',
        body: 'The binder contest now has a qualifying round and a final, and the final starts from zero.',
      },
      {
        products: ['michi'],
        head: 'The 20% sale is back until November 1st',
        kind: 'better',
        area: 'account',
        body: 'The launch discount on PRO and VIP runs again through November 1st.',
      },
      {
        products: ['michi'],
        head: 'Your sign-up username is the one you get',
        kind: 'fix',
        area: 'account',
        body:
          'The username you choose when you sign up is set the moment you confirm your email, instead '
          + 'of being asked for a second time on first login. Sign-in offers email and Google; the '
          + 'Apple option was never wired up and is gone.',
      },
      {
        products: ['michi'],
        head: 'An undo cannot touch pages it did not change',
        kind: 'fix',
        area: 'binders',
        body:
          'Undo and redo now write back only the pages they changed. A stale copy of a binder in one '
          + 'tab could previously overwrite a page edited elsewhere.',
      },
      {
        products: ['michi'],
        head: 'The left page title hovers after the first turn',
        kind: 'fix',
        area: 'binders',
        body: 'On a binder with a cover, the left page title stopped responding to hover once you turned past the first spread.',
      },
    ],
  },
  {
    date: '2026-09-01',
    title: 'The binder feels like a binder',
    items: [
      {
        products: ['michi'],
        head: 'Binders turn their pages',
        kind: 'better',
        area: 'binders',
        big: true,
        body:
          'Every binder, in the editor, on a shared link and on the landing page, now turns a '
          + 'real sheet on its rings instead of sliding the whole spread sideways.',
      },
      {
        products: ['michi'],
        head: 'Cards move like cards',
        kind: 'better',
        area: 'binders',
        body:
          'A card springs into its new pocket instead of jumping there, grows and tilts as you '
          + 'pick it up, and shows you the pocket it will land in while you are still dragging.',
      },
      {
        products: ['michi'],
        head: 'Labels sit on the card itself',
        kind: 'better',
        area: 'binders',
        body:
          'Artist, set name, collector number, price, owned and finish now sit in fixed places on '
          + 'the card and scale with the pocket, and the ones you pick are remembered on your '
          + 'account so they follow you to another device.',
      },
      {
        products: ['michi'],
        head: 'Say which printing a pocket shows',
        kind: 'new',
        area: 'binders',
        body:
          'With card labels switched on, a pocket badges its print finish whether or not you own '
          + 'the card, and tapping the badge changes it.',
      },
      {
        products: ['michi'],
        head: 'Search sits beside your binder',
        kind: 'better',
        area: 'binders',
        body:
          'On a wide window the card picker docks in its own column instead of covering the '
          + 'binder, collapses to a rail when you want the room back, and stays open as you place '
          + 'one card after another.',
      },
      {
        products: ['michi'],
        head: 'Framing art got hands',
        kind: 'better',
        area: 'binders',
        body:
          'Slice Studio now zooms by how far you actually pinched or scrolled, snaps art to the '
          + 'pocket lines with guides you can switch off, and lets a long press pick up a second '
          + 'piece so two can be merged.',
      },
      {
        products: ['michi'],
        head: 'Discover leads with real binders',
        kind: 'better',
        area: 'sharing',
        body:
          'Discover now skips public binders with nothing in them yet, so the shelf is people’s '
          + 'actual work.',
      },
      {
        products: ['tcgscan'],
        head: 'Read a scanned binder page by page',
        kind: 'new',
        area: 'collection',
        big: true,
        body:
          'Open a binder and see one page at a time in its real pocket layout, turning pages by '
          + 'swipe or tap and tapping a filled pocket for the card in it.',
      },
      {
        products: ['tcgscan'],
        head: 'Photograph a whole binder page',
        kind: 'new',
        area: 'scanning',
        big: true,
        body:
          'One photo of a binder page is now read as a page, empty pockets included, and goes '
          + 'through the same review and filing as a live scan, on the phone and in the browser.',
      },
      {
        products: ['tcgscan'],
        head: 'Choose how sure a pocket must be',
        kind: 'better',
        area: 'scanning',
        body:
          'Binder mode’s Commit tolerance of High, Medium or Low, which decides how many pockets '
          + 'arrive already filled in on the review, is now in the browser scanner too and follows '
          + 'one shared rule.',
      },
    ],
  },
  {
    date: '2026-08-31',
    title: 'Show me the ones I own',
    items: [
      {
        products: ['michi', 'tcgscan'],
        head: 'Show me mine, in one tap',
        kind: 'better',
        area: 'browse',
        big: true,
        body:
          'The Collection and size chips now sit on the series and set screens instead of only '
          + 'after a search, and the Collection chip opens on Owned.',
      },
      {
        products: ['michi', 'tcgscan'],
        head: 'Favourites that recognise themselves',
        kind: 'fix',
        area: 'browse',
        body:
          'A starred search now matches however you tapped the filters in, so the star stops '
          + 'going hollow and piling up duplicates, and a favourite can hold a whole set or series.',
      },
      {
        products: ['michi', 'tcgscan'],
        head: 'Release tags on new and upcoming sets',
        kind: 'new',
        area: 'browse',
        body:
          'Sets, rails and sealed products now carry one badge reading Upcoming, a day countdown, '
          + 'Just Released, Very Recent or Recent, so something shipping this week no longer reads '
          + 'like something from two years ago.',
      },
      {
        products: ['michi'],
        head: 'The binder gets the screen',
        kind: 'better',
        area: 'binders',
        body:
          'Edit mode opens on your artwork with the forms folded away, the page you are on grows '
          + 'on smaller windows as its neighbours shrink to cropped peeks, and the filmstrip stays '
          + 'docked at the bottom instead of falling below the fold.',
      },
      {
        products: ['michi'],
        head: 'Two tabs in one browser can no longer erase each other',
        kind: 'fix',
        area: 'binders',
        body:
          'Only the focused tab writes to a binder, a tab taking over re-reads the server '
          + 'first, and a save that fails now shows a banner offering the server’s version instead '
          + 'of failing in silence.',
      },
      {
        products: ['tcgscan'],
        head: 'Your whole catalogue, on the phone',
        kind: 'new',
        area: 'browse',
        big: true,
        body:
          'A signed-in phone now holds the full card catalogue, so ownership filters, set '
          + 'completion and instant search work on the device instead of coming back empty.',
      },
      {
        products: ['tcgscan'],
        head: 'Sealed products get their own shelf',
        kind: 'new',
        area: 'browse',
        big: true,
        body:
          'Browse splits into Cards and Sealed, with around 3,000 products grouped by kind, each '
          + 'with its own page, price history and Add to collection, counted against their own '
          + 'allowance rather than scored as zero cards.',
      },
      {
        products: ['tcgscan'],
        head: 'The card page says what a card is',
        kind: 'better',
        area: 'cards',
        body:
          'A card now shows its number, rarity, illustrator, release date, HP, type and evolution, '
          + 'when each copy was scanned, what you paid drawn against the price line, and which '
          + 'binder page and pocket each copy sits in.',
      },
      {
        products: ['tcgscan'],
        head: 'Every copy keeps its own scan photo',
        kind: 'new',
        area: 'collection',
        body:
          'A confirmed card stores the crop the camera actually saw, and switching Card images to '
          + 'My scans in Appearance shows your own photograph on each row instead of catalogue art.',
      },
      {
        products: ['tcgscan'],
        head: 'A card’s own printings before the catalogue',
        kind: 'better',
        area: 'scanning',
        body:
          'When a scanned card has known alternate printings, choosing Not listed now offers just '
          + 'those, each with a hint on telling them apart, before any full catalogue search.',
      },
    ],
  },
  {
    date: '2026-08-30',
    title: 'Your collection, card for card',
    items: [
      {
        products: ['michi'],
        head: 'Rebuild a scanned binder in one tap',
        kind: 'new',
        area: 'collection',
        big: true,
        body:
          'A physical binder you scanned in TCGScan now appears under its collection here and '
          + 'rebuilds pocket for pocket, keeping the empty pockets and each page’s own shape, with '
          + 'a dialog naming anything it cannot draw before you agree.',
      },
      {
        products: ['michi'],
        head: 'A pocket holds one of your cards',
        kind: 'new',
        area: 'collection',
        big: true,
        body:
          'Placing a card you own now claims a specific copy, so the app asks which one when there '
          + 'is a choice, the pocket wears that copy’s own scan, and a My card button lets you '
          + 'change copies or hand the copy back.',
      },
      {
        products: ['michi'],
        head: 'Collections, not Portfolios',
        kind: 'better',
        area: 'collection',
        body:
          'My collection calls its groups Collections, opens on them by default, and splits its '
          + 'controls into one row for what you are looking at and one for what you are about to do.',
      },
      {
        products: ['michi'],
        head: 'Browse People finds more than the As',
        kind: 'better',
        area: 'sharing',
        body:
          'The People list is ranked by who the community has upvoted rather than alphabetically, '
          + 'with a Show more button, so builders past the first thirty names can be found by '
          + 'browsing instead of only by typing their name.',
      },
      {
        products: ['tcgscan'],
        head: 'Move, rename and delete your buckets',
        kind: 'new',
        area: 'collection',
        body:
          'Cards can be repositioned inside a pile, moved between piles or filed in from a search, '
          + 'and a binder or pile can be renamed or dismantled without running a scan.',
      },
      {
        products: ['tcgscan'],
        head: 'TCGplayer links beside eBay',
        kind: 'new',
        area: 'cards',
        body:
          'Card pages, sealed pages, browse, collection rows and scan results now offer a direct '
          + 'TCGplayer link next to the existing eBay search, and the disclosure names both as '
          + 'affiliate partners.',
      },
      {
        products: ['tcgscan'],
        head: 'Keep the page art from an empty pocket',
        kind: 'new',
        area: 'scanning',
        body:
          'A pocket the scanner reads nothing in now shows its crop and asks whether it is art '
          + 'worth keeping, and a binder submit that saved some offers to open it on michi-maker.',
      },
      {
        products: ['tcgscan'],
        head: 'One purchase date, remembered everywhere',
        kind: 'fix',
        area: 'collection',
        body:
          'A purchase date chosen anywhere now applies to the scanner and the add sheet alike and '
          + 'survives a restart.',
      },
      {
        products: ['michi', 'tcgscan'],
        head: 'Card prices up to date again',
        kind: 'fix',
        area: 'cards',
        body:
          'Five weeks of price collection had failed silently, and the backlog has been swept and '
          + 'published for the whole English and Japanese catalogue, with a new check that makes a '
          + 'sweep returning nothing fail loudly rather than freeze prices again.',
      },
      {
        products: ['michi', 'tcgscan'],
        head: 'Sealed price history back to daily',
        kind: 'fix',
        area: 'cards',
        body:
          'A month of sealed prices had been stored weekly when the source serves them daily, and '
          + 'that window has been refetched, so a sealed price chart shows around thirty points '
          + 'for the past month instead of three.',
      },
    ],
  },
  {
    date: '2026-08-29',
    title: 'Limits that explain themselves',
    items: [
      {
        products: ['michi'],
        head: 'Hitting a limit now shows the way out',
        kind: 'better',
        area: 'account',
        body:
          'The first time you hit a plan limit each day you get a dialog naming the wall and what '
          + 'opens it, every refusal after that is a toast carrying the same button, and guests are '
          + 'pointed at signing up rather than at the price table.',
      },
      {
        products: ['michi'],
        head: 'The PRO trial waits where you hit the wall',
        kind: 'better',
        area: 'account',
        body:
          'The free trial is now offered at the binder, page and artwork caps rather than only on '
          + 'the plans page and the print gate, and it says plainly that no card is required and '
          + 'there is nothing to cancel.',
      },
      {
        products: ['michi'],
        head: 'Filter your shelf by public or private',
        kind: 'new',
        area: 'binders',
        body:
          'My binders gains All, Public and Private filters each carrying its count, and the '
          + 'confirmation toast stays up long enough to read and links straight to the binder.',
      },
      {
        products: ['michi'],
        head: 'Shared links unfurl with the right preview',
        kind: 'fix',
        area: 'sharing',
        body:
          'A shared binder link now changes whenever its preview changes, so a re-shared binder no '
          + 'longer unfurls with an old picture, and a single featured page gets a canvas cut to '
          + 'its own shape over a blur of its own art.',
      },
      {
        products: ['michi'],
        head: 'Your own card photos in your binder',
        kind: 'new',
        area: 'binders',
        big: true,
        body:
          'If you scan cards in TCGScan, a Scans switch in the binder view and a Real scans switch '
          + 'in My collection draw your own photographs in the pockets instead of catalogue art, '
          + 'and only you can see them.',
      },
      {
        products: ['michi'],
        head: 'Deleting a collection frees its cards',
        kind: 'better',
        area: 'collection',
        body:
          'Cards you had placed from a collection you delete stay in their pockets but stop '
          + 'counting as owned copies, and the delete dialog says so before you confirm.',
      },
      {
        products: ['tcgscan'],
        head: 'Search, sort and scope a collection',
        kind: 'new',
        area: 'collection',
        big: true,
        body:
          'A collection can be narrowed to one binder, one pile or the loose cards, searched by '
          + 'name, set or number, and sorted by value, name, date or where a card lives, with '
          + 'multiple copies collapsed into one row you can open.',
      },
      {
        products: ['tcgscan'],
        head: 'A screen for every scan session',
        kind: 'new',
        area: 'scanning',
        body:
          'Each scan session is listed with where it went, the pages it created and the cards it '
          + 'could not name, and a session already committed can be reversed or moved onto '
          + 'different binder pages afterwards.',
      },
      {
        products: ['tcgscan'],
        head: 'Piles record which way you stacked',
        kind: 'new',
        area: 'collection',
        body:
          'A pile now asks whether you dropped each card on top or sent it to the back and '
          + 'remembers the answer, and every row says where it sits, such as 3 from the front of 58.',
      },
      {
        products: ['michi', 'tcgscan'],
        head: 'Illustrator and evolution data filled in',
        kind: 'better',
        area: 'cards',
        body:
          'Cards with no price link were being dropped along with their artist and species data, '
          + 'and recovering 5,517 of them lifts illustrator credits from 61 to 73 percent of the '
          + 'catalogue and evolution lines from 54 to 62 percent.',
      },
    ],
  },
  {
    date: '2026-08-27',
    title: 'Where your cards actually live',
    items: [
      {
        products: ['tcgscan'],
        head: 'Binders and piles inside a collection',
        kind: 'new',
        area: 'collection',
        big: true,
        body:
          'A collection now records where cards physically live, so a scan can file into a named '
          + 'binder or pile, and the list shows each one with its card count, what you paid and '
          + 'what it is worth.',
      },
      {
        products: ['tcgscan'],
        head: 'The review adds the cards, not the scan',
        kind: 'better',
        area: 'scanning',
        body:
          'A batched binder or riffle session stages everything and adds nothing to a collection '
          + 'until you press Add, which names the collection and the count, so a discard genuinely '
          + 'keeps a card out instead of reporting on one already filed.',
      },
      {
        products: ['tcgscan'],
        head: 'A camera that works like the camera',
        kind: 'better',
        area: 'scanning',
        big: true,
        body:
          'The scan screen gains a video and photo switch and a real shutter with riffle or binder '
          + 'mode and set scope either side of it, and the photo review reuses the same layout so '
          + 'the controls do not move under your thumb.',
      },
      {
        products: ['tcgscan'],
        head: 'The viewfinder says what it believes',
        kind: 'better',
        area: 'scanning',
        body:
          'Card boxes read amber while the scanner is deciding, blue when it has an answer and '
          + 'green with a tick once the session has counted the card, and the scanner names each '
          + 'loading step instead of stalling silently on the first shot.',
      },
      {
        products: ['tcgscan'],
        head: 'Hands-free adding armed by default',
        kind: 'better',
        area: 'scanning',
        body:
          'Live riffle and binder scanning opens with hands-free adding switched on, shows the last '
          + 'card added with an Undo beside it, and lets you change any card it took.',
      },
    ],
  },
  {
    date: '2026-08-26',
    title: 'Sharing, opened up',
    items: [
      {
        products: ['michi'],
        head: 'Your profile photo is yours to give',
        kind: 'better',
        area: 'account',
        body:
          'Photos copied from your Google account have been taken down. Next time you sign in we '
          + 'will show you yours and ask whether to put it on your profile.',
      },
      {
        products: ['michi'],
        head: 'Share once, and new binders start out public',
        kind: 'better',
        area: 'sharing',
        big: true,
        body:
          'Turn sharing on once and every new binder you build after that starts out public, ready '
          + 'to be discovered, liked, and entered in contests. Existing binders and copies are '
          + 'untouched, and anything can be made private again from Share.',
      },
      {
        products: ['michi'],
        head: 'Profiles get a face and a voice',
        kind: 'new',
        area: 'account',
        body:
          'Add a photo and a short bio from your account sheet. The photo shows on your profile '
          + 'and in people search, and the bio on your profile.',
      },
      {
        products: ['michi'],
        head: 'Imported art can be shared',
        kind: 'better',
        area: 'sharing',
        body:
          'Art you bring in from a link can now appear in your public binders, shown with its '
          + 'credit. If it is not saved to your account yet, Share offers to save copies in one tap.',
      },
      {
        products: ['michi'],
        head: 'Better reporting',
        kind: 'better',
        area: 'sharing',
        body: 'Profiles can be reported as well as binders, not just binders.',
      },
      {
        products: ['michi'],
        head: 'Every binder shows who made it',
        kind: 'new',
        area: 'sharing',
        body:
          'Discover tiles, the featured shelf on the home page and the binder page itself now '
          + 'carry the builder’s picture and name, and their picture opens their profile.',
      },
      {
        products: ['michi'],
        head: 'Profile links read as your name',
        kind: 'better',
        area: 'account',
        body:
          'Your public profile now lives at /u/yourname instead of a long id, and every link '
          + 'already shared in the old form still opens.',
      },
      {
        products: ['michi'],
        head: 'Signing in from www works again',
        kind: 'fix',
        area: 'account',
        body:
          'Google sign-in started from www.michi-maker.com used to land on a dead address, and www '
          + 'now redirects to the main site before the app loads.',
      },
    ],
  },
  {
    date: '2026-08-24',
    title: 'A catalogue with its cards back',
    items: [
      {
        products: ['michi'],
        head: 'New cards land on the page you are on',
        kind: 'better',
        area: 'binders',
        body:
          'Adding a batch of cards fills the page in front of you and grows forward from there '
          + 'instead of scattering them from page 1, and any page it adds takes the binder’s own '
          + 'pocket layout rather than a 3x3.',
      },
      {
        products: ['michi'],
        head: 'Fill page spreads across the family',
        kind: 'better',
        area: 'binders',
        big: true,
        body:
          'Fill page now places one of every subject it found before a second of any, so an Eevee '
          + 'page comes out as the whole evolution line, and a new guide at /auto-fill-methods '
          + 'shows all eight methods as finished pages.',
      },
      {
        products: ['michi'],
        head: 'New accounts stop being treated as guests',
        kind: 'fix',
        area: 'account',
        body:
          'Upgrading a guest account to a real one no longer leaves you on guest limits for up to '
          + 'an hour, so the trial, likes and upvotes work from the moment you sign up.',
      },
      {
        products: ['michi'],
        head: 'See what the community has built',
        kind: 'new',
        area: 'sharing',
        body:
          'The landing page carries five running totals of what everyone here has made: '
          + 'collectors, binders, pages, cards placed and artwork placed.',
      },
      {
        products: ['tcgscan'],
        head: 'A newer model, and more cards found',
        kind: 'better',
        area: 'scanning',
        big: true,
        body:
          'Scanning runs an updated recognition model that can be rolled out or pulled back '
          + 'without an app release, About names the model and the date it changed, and a lower '
          + 'detection floor recovers energy cards that were being dropped before.',
      },
      {
        products: ['tcgscan'],
        head: 'Syncing on the web stops getting stuck',
        kind: 'fix',
        area: 'collection',
        body:
          'A collection synced in the browser could hit a storage limit and then refuse to sync '
          + 'again with an error that could not be cleared, which is fixed, and the app now says '
          + 'what went wrong instead of only that something did.',
      },
      {
        products: ['tcgscan'],
        head: 'Sign in with Google on a cold launch',
        kind: 'fix',
        area: 'account',
        body:
          'A returning user can sign in with Google again after a fresh launch, where the attempt '
          + 'used to be refused because the app had already made them an anonymous guest.',
      },
      {
        products: ['michi', 'tcgscan'],
        head: 'Missing cards back in the catalogue',
        kind: 'fix',
        area: 'cards',
        big: true,
        body:
          'A paging bug in the card feed had been silently skipping products, dropping 247 cards '
          + 'including 215 from World Championship Decks, and they are searchable again.',
      },
      {
        products: ['michi', 'tcgscan'],
        head: 'Different printings no longer collapse',
        kind: 'new',
        area: 'cards',
        body:
          'Cards now record their printing and stamp, so 4,527 print variants and 504 stamped '
          + 'cards are stored and priced as their own entries instead of merging into one.',
      },
    ],
  },
  {
    date: '2026-08-23',
    title: 'Discover',
    items: [
      {
        products: ['michi'],
        head: 'A place to browse everything public',
        kind: 'new',
        area: 'sharing',
        big: true,
        body:
          'The Discover page shows public binders newest-first or most-liked, with current '
          + 'contest entries up front.',
      },
    ],
  },
  {
    date: '2026-08-04',
    title: 'Link previews, your pick',
    items: [
      {
        products: ['michi'],
        head: 'Choose the pages your share link shows',
        kind: 'new',
        area: 'sharing',
        body:
          'Pick up to two pages to feature in the preview image when you share a binder link, '
          + 'or leave it on auto and we pick your fullest pages.',
      },
    ],
  },
  {
    date: '2026-07-25',
    title: 'The contest, and search',
    items: [
      {
        products: ['michi'],
        head: 'The First Annual Binder Contest',
        kind: 'new',
        area: 'sharing',
        big: true,
        body:
          'Enter a public binder, pick a category, and climb the leaderboard on likes.',
      },
      {
        products: ['michi'],
        head: 'Search public binders',
        kind: 'new',
        area: 'sharing',
        body: 'Find binders by title, description, or the builder’s @username.',
      },
    ],
  },
  {
    date: '2026-07-22',
    title: 'Pro plans',
    items: [
      {
        products: ['michi'],
        head: 'michi Pro launched',
        kind: 'new',
        area: 'account',
        big: true,
        body:
          'Higher binder, page, and artwork caps, plus a bigger print allowance, for the '
          + 'collectors who build in bulk.',
      },
    ],
  },
  {
    date: '2026-07-16',
    title: 'Print-ready exports',
    items: [
      {
        products: ['michi'],
        head: 'From screen to sleeve',
        kind: 'new',
        area: 'binders',
        big: true,
        body:
          'Export binder pages as print-ready PDFs at true card size, built in your browser and '
          + 'ready for home printing.',
      },
    ],
  },
  {
    date: '2026-07-11',
    title: 'Community basics',
    items: [
      {
        products: ['michi'],
        head: 'Likes, featured binders, and people search',
        kind: 'new',
        area: 'sharing',
        body:
          'Like public binders, see a rolling shelf of the community’s favorites on the '
          + 'home page, and find (and upvote) other builders in people search.',
      },
    ],
  },
];
