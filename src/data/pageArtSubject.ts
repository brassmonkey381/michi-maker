/**
 * WHAT A PAGE IS ABOUT, and where to look for art of it.
 *
 * THE FINDER, NOT THE LIBRARY (owner, 2026-10-13: "intelligently add custom artwork ... on a page
 * with all Pikachu, add Pikachu related artwork"). docs/roadmap/ART-RIGHTS.md records why the app
 * must not supply Pokémon art itself: the legal posture rests on the user bringing the art and
 * michi-maker hosting it. So the intelligence goes into the SEARCH. This reads the cards on a
 * page, names the thing they share, and builds one tuned search per source the Art sources list
 * already links to. The user opens a result, picks a piece, and the existing paste or upload path
 * hosts it as their own external, private art with the credit kept. Linking out is not
 * reproduction; nothing here fetches a picture.
 *
 * PURE ON PURPOSE: no imports, so `npm test` covers the name parsing, which is the fiddly part.
 */

export interface SubjectCard {
  /** The catalog name, suffixes and all: "Mega Charizard X ex", "Team Rocket's Wobbuffet". */
  name: string;
  /** False for a trainer or energy, which has no species to search for. */
  isPokemon: boolean;
}

export interface PageSubject {
  /** For people: "Pikachu", "Eevee and Sylveon", or the page title. */
  label: string;
  /** For search boxes: lower case, no suffixes. */
  query: string;
  /** How the label was reached, for the sheet's one-line explanation. */
  basis: 'species' | 'pair' | 'title' | 'none';
}

/** Tokens that are the card's mechanics, not its subject. */
const SUFFIX = new Set([
  'ex', 'gx', 'v', 'vmax', 'vstar', 'break', 'legend', 'lv.x', 'prime', 'star', 'mega', 'm',
  'dark', 'light', 'radiant', 'shining', 'tera', 'x', 'y', 'c', 'g', 'fb', 'gl', 'e4',
]);

/**
 * The species a card name is about: parentheticals dropped, an owner's name dropped ("Iono's
 * Wattrel" is about Wattrel), mechanics dropped, a tag team split in two. Regional forms keep
 * their prefix ("alolan raichu") because that is what the art is of, too.
 */
export function speciesOf(name: string): string[] {
  const base = name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = base.split(/\s*&\s*/);
  const out: string[] = [];
  for (const part of parts) {
    const tokens = part
      .toLowerCase()
      .split(' ')
      .filter((t) => t && !t.endsWith("'s") && !t.endsWith("’s") && t !== 'team' && !SUFFIX.has(t) && !/^\d+$/.test(t));
    const s = tokens.join(' ').trim();
    if (s) out.push(s);
  }
  return out;
}

const cap = (s: string) => s.replace(/(^|\s)([a-z])/g, (_, sp, ch) => `${sp}${ch.toUpperCase()}`);

/**
 * The subject of a page. A species on at least half the Pokémon cards (and on two or more) is
 * the subject; two species that together cover the page make a pair; otherwise the page's title
 * if it has one; otherwise nothing, and the sheet asks the person to type.
 */
export function pageSubject(cards: readonly SubjectCard[], title?: string | null): PageSubject {
  const counts = new Map<string, number>();
  let named = 0;
  for (const c of cards) {
    if (!c.isPokemon) continue;
    const species = speciesOf(c.name);
    if (!species.length) continue;
    named += 1;
    for (const s of new Set(species)) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [top, second] = ranked;
  if (top && top[1] >= 2 && top[1] * 2 >= named) {
    return { label: cap(top[0]), query: top[0], basis: 'species' };
  }
  if (top && second && top[1] >= 2 && second[1] >= 2 && (top[1] + second[1]) * 4 >= named * 3) {
    return { label: `${cap(top[0])} and ${cap(second[0])}`, query: `${top[0]} ${second[0]}`, basis: 'pair' };
  }
  const t = (title ?? '').trim();
  if (t) return { label: t, query: t.toLowerCase(), basis: 'title' };
  return { label: '', query: '', basis: 'none' };
}

export interface ArtSearchLink {
  title: string;
  url: string;
  blurb: string;
  /** Hosts whose pictures load when dragged straight into the studio; the rest need save + Upload. */
  dragFriendly: boolean;
}

/**
 * One search per source, for a query. The same sources the Art sources list offers in general,
 * each opened on its own search for this page's subject, plus two that only make sense with a
 * subject to search for.
 */
export function artSearchLinks(query: string): ArtSearchLink[] {
  const q = encodeURIComponent(query.trim());
  const qp = encodeURIComponent(`pokemon ${query.trim()}`);
  return [
    {
      title: 'Art of Pokémon',
      url: `https://www.artofpkm.com/artwork/all?q=${q}`,
      blurb: 'Curated official artwork, with the artist named on every piece.',
      dragFriendly: true,
    },
    {
      title: 'Bulbagarden Archives',
      url: `https://archives.bulbagarden.net/w/index.php?search=${q}&title=Special:Search&profile=images&fulltext=1`,
      blurb: 'Official art and scans, every form and every era.',
      dragFriendly: true,
    },
    {
      title: 'DeviantArt',
      url: `https://www.deviantart.com/search?q=${qp}`,
      blurb: 'Fan art in every style. May block direct loading; save it, then Upload.',
      dragFriendly: false,
    },
    {
      title: 'Pixiv',
      url: `https://www.pixiv.net/en/tags/${q}/artworks`,
      blurb: 'Japanese fan art, tagged by Pokémon. Save it, then Upload.',
      dragFriendly: false,
    },
    {
      title: 'Bluesky',
      url: `https://bsky.app/search?q=${qp}`,
      blurb: 'Artists posting new work daily. Open the post, save the picture, then Upload.',
      dragFriendly: false,
    },
    {
      title: 'Pinterest',
      url: `https://www.pinterest.com/search/pins/?q=${qp}`,
      blurb: 'Broad fan-curated feed. Open a pin full-size before dragging it over.',
      dragFriendly: false,
    },
    {
      title: 'Google Images, licensed to reuse',
      url: `https://www.google.com/search?tbm=isch&tbs=il:cl&q=${qp}`,
      blurb: 'Only pictures marked with a Creative Commons licence.',
      dragFriendly: false,
    },
  ];
}
