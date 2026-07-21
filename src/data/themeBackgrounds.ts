/**
 * Procedural, self-generated "elemental theme" backgrounds — a fully OWNED art source (see the
 * rights discussion behind this feature): abstract, flat-cartoon backgrounds that evoke the mood of
 * an energy type (ember, tide, verdant, spark, stone, frost) WITHOUT depicting any character or IP.
 * No sourcing, no licensing, no attribution — the pixels are drawn from these parameters.
 *
 * Output is an SVG string (and a data: URI), so a background drops straight into the existing art
 * model as an `artwork` slot's `imageUrl` — the on-screen grid (expo-image) and, once wired, the
 * print pipeline both already consume `imageUrl`. Naming is our own vocabulary on purpose: never
 * "Energy types", never a trademarked type badge, never a creature.
 *
 * Deterministic: the same (id, seed) always yields the same art, so a binder renders identically
 * every time; change `seed` for a different arrangement of the same theme.
 */

/** The motif drawn scattered across a theme — a simple, iconic, cartoon shape. */
export type MotifKind = 'flame' | 'wave' | 'leaf' | 'bolt' | 'facet' | 'shard';

export interface ThemeBackground {
  id: string;
  /** Our own name — evocative, not a Pokémon/TCG term. */
  name: string;
  /** One-line mood, for pickers ("the warmth of a fire type"). */
  vibe: string;
  /** Background gradient stops (top → bottom). */
  bg: [string, string];
  /** Motif fill colours, layered for depth. */
  accents: [string, string, string];
  motif: MotifKind;
}

/** The starter set — six energy moods. Extend freely; each is just data. */
export const THEME_BACKGROUNDS: ThemeBackground[] = [
  { id: 'ember', name: 'Ember', vibe: 'the warmth of a fire type', bg: ['#ffd59e', '#ff7a45'], accents: ['#ffb703', '#fb5607', '#ffe8a3'], motif: 'flame' },
  { id: 'tide', name: 'Tide', vibe: 'cool, deep water', bg: ['#a8e6ff', '#2b8fd6'], accents: ['#48cae4', '#0077b6', '#caf0f8'], motif: 'wave' },
  { id: 'verdant', name: 'Verdant', vibe: 'fresh grass and leaves', bg: ['#d8f3c4', '#4c9a2a'], accents: ['#80c34f', '#2d6a1e', '#eaf7d9'], motif: 'leaf' },
  { id: 'spark', name: 'Spark', vibe: 'crackling electricity', bg: ['#fff3b0', '#f4b400'], accents: ['#ffd60a', '#e09f00', '#3a3120'], motif: 'bolt' },
  { id: 'stone', name: 'Stone', vibe: 'rugged rock and earth', bg: ['#e7dcc8', '#a1866f'], accents: ['#c9ad8c', '#6f5642', '#f2ead9'], motif: 'facet' },
  { id: 'frost', name: 'Frost', vibe: 'still, crystalline ice', bg: ['#eaf6ff', '#8fc7e8'], accents: ['#bde0fe', '#5a9fd6', '#ffffff'], motif: 'shard' },
];

const THEME_BY_ID = new Map(THEME_BACKGROUNDS.map((t) => [t.id, t]));

/** Deterministic 0..1 generator (mulberry32). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable string hash → 32-bit seed, so a theme id alone seeds a fixed default arrangement. */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Unit motif path (centred at 0,0, roughly within ±1), scaled/rotated per instance. */
function motifPath(kind: MotifKind): string {
  switch (kind) {
    case 'flame':
      return 'M0,-1 C0.55,-0.35 0.5,0.35 0,1 C-0.5,0.35 -0.55,-0.35 0,-1 Z';
    case 'leaf':
      return 'M0,-1 C0.7,-0.3 0.7,0.5 0,1 C-0.7,0.5 -0.7,-0.3 0,-1 Z';
    case 'wave':
      return 'M-1,0.2 Q-0.5,-0.7 0,0.2 Q0.5,1.1 1,0.2 L1,1 L-1,1 Z';
    case 'bolt':
      return 'M-0.15,-1 L0.35,-0.15 L0.05,-0.15 L0.25,1 L-0.35,0.1 L-0.02,0.1 Z';
    case 'facet':
      return 'M0,-1 L0.75,-0.1 L0.45,1 L-0.45,1 L-0.75,-0.1 Z';
    case 'shard':
      return 'M0,-1 L0.28,0.9 L0,1 L-0.28,0.9 Z';
  }
}

export interface ThemeArtOpts {
  /** Vary the arrangement (default: seeded from the id). */
  seed?: number;
  /** SVG canvas size — defaults to a card pocket ratio (2.5 : 3.5). */
  w?: number;
  h?: number;
  /** How many motifs to scatter (default scales with area). */
  count?: number;
}

/**
 * Generate the theme background as an SVG string. Flat-cartoon: a soft gradient wash, one big
 * low-opacity motif for depth, then a seeded scatter of crisp motifs in the accent palette.
 */
export function themeBackgroundSvg(id: string, opts: ThemeArtOpts = {}): string {
  const theme = THEME_BY_ID.get(id) ?? THEME_BACKGROUNDS[0];
  const w = opts.w ?? 250;
  const h = opts.h ?? 350;
  const rand = rng(opts.seed != null ? opts.seed >>> 0 : hash(theme.id));
  const count = opts.count ?? Math.max(6, Math.round((w * h) / 9000));
  const path = motifPath(theme.motif);
  const gid = `g-${theme.id}`;

  const shapes: string[] = [];
  // One big, faint motif anchoring a corner — the "hero" element for depth.
  {
    const s = Math.min(w, h) * (0.55 + rand() * 0.2);
    const cx = w * (0.2 + rand() * 0.6);
    const cy = h * (0.2 + rand() * 0.6);
    const rot = Math.round(rand() * 360);
    shapes.push(
      `<path d="${path}" transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${rot}) scale(${s.toFixed(1)})" fill="${theme.accents[0]}" opacity="0.18"/>`,
    );
  }
  // Scattered crisp motifs.
  for (let i = 0; i < count; i += 1) {
    const s = Math.min(w, h) * (0.08 + rand() * 0.16);
    const cx = w * rand();
    const cy = h * rand();
    const rot = Math.round(rand() * 360);
    const fill = theme.accents[1 + (i % 2)];
    const op = (0.35 + rand() * 0.45).toFixed(2);
    shapes.push(
      `<path d="${path}" transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${rot}) scale(${s.toFixed(1)})" fill="${fill}" opacity="${op}"/>`,
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">` +
    `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${theme.bg[0]}"/><stop offset="1" stop-color="${theme.bg[1]}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#${gid})"/>` +
    shapes.join('') +
    `</svg>`
  );
}

/** The same background as a data: URI, ready to drop into an `artwork` slot's `imageUrl`. */
export function themeBackgroundDataUri(id: string, opts: ThemeArtOpts = {}): string {
  return `data:image/svg+xml,${encodeURIComponent(themeBackgroundSvg(id, opts))}`;
}
