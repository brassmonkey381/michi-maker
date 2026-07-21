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
export type MotifKind =
  | 'flame'
  | 'wave'
  | 'leaf'
  | 'bolt'
  | 'facet'
  | 'shard'
  | 'spark4'
  | 'blob'
  | 'burst'
  | 'hex'
  | 'petal'
  | 'chevron'
  | 'diamond';

export interface ThemeBackground {
  id: string;
  /** Our own name — evocative, not a Pokémon/TCG term. */
  name: string;
  /** The energy family this belongs to (its canonical type). Two themes share each family: a
   *  base and a palette VARIANT. Own vocabulary — used only for grouping, never shown as a TCG term. */
  family: string;
  /** One-line mood, for pickers ("the warmth of a fire type"). */
  vibe: string;
  /** Background gradient stops (top → bottom). */
  bg: [string, string];
  /** Motif fill colours, layered for depth. */
  accents: [string, string, string];
  motif: MotifKind;
}

/**
 * The full set — every energy FAMILY (18 of them) as THREE palettes each (a base + two variants,
 * same motif, different moods) = 54 themes. Ordered by family so `THEME_FAMILIES` below groups them.
 * Each entry is just data; the `seed` additionally gives infinite ARRANGEMENT variants of any one.
 * Names/vibes are our own vocabulary on purpose — never a TCG type word, symbol, or creature.
 */
export const THEME_BACKGROUNDS: ThemeBackground[] = [
  { id: 'plain', name: 'Plain', family: 'normal', vibe: 'plain, everyday calm', bg: ['#f2ebdd', '#c9b89a'], accents: ['#d9c7a3', '#9c8b6e', '#fbf6ea'], motif: 'blob' },
  { id: 'linen', name: 'Linen', family: 'normal', vibe: 'soft neutral linen', bg: ['#edeae2', '#aea99b'], accents: ['#cfcabb', '#82806f', '#f7f5ee'], motif: 'blob' },
  { id: 'pebble', name: 'Pebble', family: 'normal', vibe: 'warm pebble grey', bg: ['#e6e2d8', '#b8b0a0'], accents: ['#cfc8b8', '#7a7365', '#f5f2ea'], motif: 'blob' },

  { id: 'ember', name: 'Ember', family: 'fire', vibe: 'the warmth of a fire type', bg: ['#ffd59e', '#ff7a45'], accents: ['#ffb703', '#fb5607', '#ffe8a3'], motif: 'flame' },
  { id: 'molten', name: 'Molten', family: 'fire', vibe: 'a hotter, deeper fire', bg: ['#ffb37a', '#8f1d0e'], accents: ['#ff6b35', '#3d0c05', '#ffd08a'], motif: 'flame' },
  { id: 'solar', name: 'Solar', family: 'fire', vibe: 'a bright solar flare', bg: ['#ffe8a0', '#ff9e2c'], accents: ['#ffc233', '#e07000', '#fff2c0'], motif: 'flame' },

  { id: 'tide', name: 'Tide', family: 'water', vibe: 'cool, deep water', bg: ['#a8e6ff', '#2b8fd6'], accents: ['#48cae4', '#0077b6', '#caf0f8'], motif: 'wave' },
  { id: 'abyss', name: 'Abyss', family: 'water', vibe: 'deep-ocean water', bg: ['#7fb8d6', '#0a2a52'], accents: ['#2f7fb8', '#04162e', '#8fe0e8'], motif: 'wave' },
  { id: 'lagoon', name: 'Lagoon', family: 'water', vibe: 'turquoise lagoon', bg: ['#b0f0e0', '#1a9c9c'], accents: ['#3fd0c0', '#0a6b6b', '#d6faf0'], motif: 'wave' },

  { id: 'verdant', name: 'Verdant', family: 'grass', vibe: 'fresh grass and leaves', bg: ['#d8f3c4', '#4c9a2a'], accents: ['#80c34f', '#2d6a1e', '#eaf7d9'], motif: 'leaf' },
  { id: 'moss', name: 'Moss', family: 'grass', vibe: 'deep forest moss', bg: ['#c3e0a8', '#2f6b1f'], accents: ['#5a9e3a', '#1c4712', '#dcefc6'], motif: 'leaf' },
  { id: 'meadow', name: 'Meadow', family: 'grass', vibe: 'a bright spring meadow', bg: ['#eaf7c0', '#8ec63f'], accents: ['#b5d94f', '#5a8a1e', '#f5fbdc'], motif: 'leaf' },

  { id: 'spark', name: 'Spark', family: 'electric', vibe: 'crackling electricity', bg: ['#fff3b0', '#f4b400'], accents: ['#ffd60a', '#e09f00', '#3a3120'], motif: 'bolt' },
  { id: 'volt', name: 'Volt', family: 'electric', vibe: 'neon voltage', bg: ['#f7ff8a', '#c9d400'], accents: ['#eaff00', '#8a9c00', '#2a2e10'], motif: 'bolt' },
  { id: 'storm', name: 'Storm', family: 'electric', vibe: 'a dark electric storm', bg: ['#c8d4f0', '#4a5fb0'], accents: ['#ffd60a', '#2a3570', '#8fa8e0'], motif: 'bolt' },

  { id: 'frost', name: 'Frost', family: 'ice', vibe: 'still, crystalline ice', bg: ['#eaf6ff', '#8fc7e8'], accents: ['#bde0fe', '#5a9fd6', '#ffffff'], motif: 'shard' },
  { id: 'glacier', name: 'Glacier', family: 'ice', vibe: 'deep glacier blue', bg: ['#cfeefc', '#5a9fd6'], accents: ['#8fc7e8', '#2c6a94', '#ffffff'], motif: 'shard' },
  { id: 'powder', name: 'Powder', family: 'ice', vibe: 'soft powder snow', bg: ['#f0f4ff', '#b8c8e8'], accents: ['#d8e2f5', '#8fa0c8', '#ffffff'], motif: 'shard' },

  { id: 'grit', name: 'Grit', family: 'fighting', vibe: 'raw fighting force', bg: ['#f2cfa6', '#a84e1c'], accents: ['#dd7f34', '#6e2f0e', '#ffdca8'], motif: 'burst' },
  { id: 'brawl', name: 'Brawl', family: 'fighting', vibe: 'a fierce red brawl', bg: ['#f0b48f', '#8f2d1e'], accents: ['#d9532e', '#5a1710', '#ffcba8'], motif: 'burst' },
  { id: 'iron', name: 'Iron', family: 'fighting', vibe: 'a hard iron will', bg: ['#d8c0b0', '#6b4a3a'], accents: ['#a8705a', '#3a2018', '#e8d5c8'], motif: 'burst' },

  { id: 'venom', name: 'Venom', family: 'poison', vibe: 'toxic, bubbling poison', bg: ['#dcc6ef', '#6a2f92'], accents: ['#9d5fd0', '#451a6b', '#b6f24d'], motif: 'blob' },
  { id: 'sludge', name: 'Sludge', family: 'poison', vibe: 'murky sludge', bg: ['#d6d98f', '#5a6b2f'], accents: ['#8a9c3a', '#3a4718', '#c9a0d5'], motif: 'blob' },
  { id: 'miasma', name: 'Miasma', family: 'poison', vibe: 'a creeping miasma', bg: ['#e8c0e0', '#8a3f7a'], accents: ['#c060b0', '#4a1a44', '#a0f050'], motif: 'blob' },

  { id: 'dune', name: 'Dune', family: 'ground', vibe: 'sun-baked earth', bg: ['#f2e0b8', '#c99a5a'], accents: ['#dbb06a', '#8a6234', '#fbf0d6'], motif: 'diamond' },
  { id: 'canyon', name: 'Canyon', family: 'ground', vibe: 'red canyon clay', bg: ['#e8b48a', '#a85a2e'], accents: ['#c9743a', '#6e3410', '#f5d9b8'], motif: 'diamond' },
  { id: 'loam', name: 'Loam', family: 'ground', vibe: 'rich dark loam', bg: ['#d8c0a0', '#7a5a3a'], accents: ['#a8845a', '#4a3420', '#ecdcc0'], motif: 'diamond' },

  { id: 'gale', name: 'Gale', family: 'flying', vibe: 'open sky wind', bg: ['#e6f3ff', '#a9cbe8'], accents: ['#bcd8ec', '#7fa8cc', '#ffffff'], motif: 'chevron' },
  { id: 'zephyr', name: 'Zephyr', family: 'flying', vibe: 'a gentle breeze', bg: ['#e8f6f0', '#a9d8c8'], accents: ['#bce0d0', '#7fb0a0', '#ffffff'], motif: 'chevron' },
  { id: 'dawn', name: 'Dawn', family: 'flying', vibe: 'a pastel dawn sky', bg: ['#ffe0e8', '#b0c0e8'], accents: ['#e8b0c0', '#8090c0', '#fff0f5'], motif: 'chevron' },

  { id: 'psyche', name: 'Psyche', family: 'psychic', vibe: 'shimmering psychic energy', bg: ['#f0d0ff', '#9b3fc9'], accents: ['#c86ef0', '#6a1f9c', '#fbe6ff'], motif: 'spark4' },
  { id: 'trance', name: 'Trance', family: 'psychic', vibe: 'a dreamlike trance', bg: ['#ffd6f0', '#c93f9b'], accents: ['#f06ec8', '#8a1f6a', '#ffe6f7'], motif: 'spark4' },
  { id: 'aura', name: 'Aura', family: 'psychic', vibe: 'a violet aura', bg: ['#d0d8ff', '#6a4fc9'], accents: ['#8f7ff0', '#3a2f9c', '#e6e0ff'], motif: 'spark4' },

  { id: 'chitin', name: 'Chitin', family: 'bug', vibe: 'insect carapace', bg: ['#e0edb0', '#6b9c2a'], accents: ['#9ac33a', '#3d6a12', '#eef7d0'], motif: 'hex' },
  { id: 'hive', name: 'Hive', family: 'bug', vibe: 'a golden hive', bg: ['#f2e0a0', '#b58a2a'], accents: ['#dbb03a', '#6e5210', '#fbf0c0'], motif: 'hex' },
  { id: 'verdigris', name: 'Verdigris', family: 'bug', vibe: 'verdigris beetle-shine', bg: ['#c0e8d0', '#3a8a6a'], accents: ['#5ac090', '#1a5a3a', '#dcf5e6'], motif: 'hex' },

  { id: 'stone', name: 'Stone', family: 'rock', vibe: 'rugged rock and earth', bg: ['#e7dcc8', '#a1866f'], accents: ['#c9ad8c', '#6f5642', '#f2ead9'], motif: 'facet' },
  { id: 'slate', name: 'Slate', family: 'rock', vibe: 'cold grey slate', bg: ['#d6d2c8', '#7a756a'], accents: ['#a8a294', '#4e4a40', '#eeeae0'], motif: 'facet' },
  { id: 'rust', name: 'Rust', family: 'rock', vibe: 'iron-oxide rust', bg: ['#e0c0a8', '#8a5a3a'], accents: ['#b57a4a', '#5a3420', '#f0dcc8'], motif: 'facet' },

  { id: 'wisp', name: 'Wisp', family: 'ghost', vibe: 'ghostly drifting shadow', bg: ['#d6cdea', '#524072'], accents: ['#8f7cbb', '#2f2450', '#84e6d6'], motif: 'blob' },
  { id: 'haunt', name: 'Haunt', family: 'ghost', vibe: 'a lingering haunt', bg: ['#cfc0e0', '#3a2f5a'], accents: ['#7a6ab0', '#221a3a', '#7fe0c0'], motif: 'blob' },
  { id: 'phantom', name: 'Phantom', family: 'ghost', vibe: 'a spectral phantom', bg: ['#d0d8d0', '#4a5a5a'], accents: ['#7a9088', '#2a3838', '#a0f0d8'], motif: 'blob' },

  { id: 'draco', name: 'Draco', family: 'dragon', vibe: 'regal dragon skies', bg: ['#cdd2ff', '#3f45a8'], accents: ['#7a80e0', '#262a72', '#ffd166'], motif: 'spark4' },
  { id: 'wyrm', name: 'Wyrm', family: 'dragon', vibe: 'an ancient wyrm', bg: ['#bcd0d0', '#2a5a5a'], accents: ['#4a8a8a', '#153030', '#ffd166'], motif: 'spark4' },
  { id: 'vermilion', name: 'Vermilion', family: 'dragon', vibe: 'a vermilion dragon', bg: ['#e8c0b0', '#8a2f2f'], accents: ['#c05a4a', '#4a1515', '#ffd166'], motif: 'spark4' },

  { id: 'umbra', name: 'Umbra', family: 'dark', vibe: 'creeping shadow', bg: ['#c0b8cc', '#2a2438'], accents: ['#6a5f82', '#151020', '#c94f7a'], motif: 'blob' },
  { id: 'nocturne', name: 'Nocturne', family: 'dark', vibe: 'midnight dark', bg: ['#b8c0d0', '#1e2438'], accents: ['#5a6788', '#0e1220', '#e0b84f'], motif: 'blob' },
  { id: 'void', name: 'Void', family: 'dark', vibe: 'the endless void', bg: ['#b0a8b8', '#201824'], accents: ['#5a4f6a', '#0a060e', '#e04f8f'], motif: 'blob' },

  { id: 'alloy', name: 'Alloy', family: 'steel', vibe: 'brushed steel and metal', bg: ['#eef1f4', '#8a97a5'], accents: ['#b7c1cb', '#59636f', '#ffffff'], motif: 'hex' },
  { id: 'chrome', name: 'Chrome', family: 'steel', vibe: 'polished chrome', bg: ['#eef2f6', '#9aa8b8'], accents: ['#c0ccd8', '#5a6675', '#ffffff'], motif: 'hex' },
  { id: 'bronze', name: 'Bronze', family: 'steel', vibe: 'warm aged bronze', bg: ['#e8dcc0', '#a8905a'], accents: ['#c8a86a', '#6e5a30', '#f5ecd8'], motif: 'hex' },

  { id: 'bloom', name: 'Bloom', family: 'fairy', vibe: 'soft fairy petals', bg: ['#ffe1ef', '#ff86ba'], accents: ['#ffacce', '#e05a8f', '#fff2f8'], motif: 'petal' },
  { id: 'pixie', name: 'Pixie', family: 'fairy', vibe: 'a lavender pixie', bg: ['#f0e0ff', '#c98fd6'], accents: ['#d9a8e8', '#8a5a9c', '#fdf0ff'], motif: 'petal' },
  { id: 'blossom', name: 'Blossom', family: 'fairy', vibe: 'peach blossom', bg: ['#ffe8dc', '#ff9a86'], accents: ['#ffb8a0', '#e0705a', '#fff2ec'], motif: 'petal' },
];

/** A family = a canonical energy mood, with several palettes (base + variants) sharing one motif. */
export interface ThemeFamily {
  family: string;
  /** Base first, then variants — 2–3 palettes of the same energy mood. */
  themes: ThemeBackground[];
}

/** The themes grouped into families (in registry order) — for a picker that offers one swatch per
 *  type with a palette cycle, rather than 54 flat swatches. */
export const THEME_FAMILIES: ThemeFamily[] = (() => {
  const order: string[] = [];
  const byFamily = new Map<string, ThemeBackground[]>();
  for (const t of THEME_BACKGROUNDS) {
    if (!byFamily.has(t.family)) {
      byFamily.set(t.family, []);
      order.push(t.family);
    }
    byFamily.get(t.family)!.push(t);
  }
  return order.map((family) => ({ family, themes: byFamily.get(family)! }));
})();

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
    case 'spark4': // a four-point sparkle (psychic / dragon shimmer)
      return 'M0,-1 L0.18,-0.18 L1,0 L0.18,0.18 L0,1 L-0.18,0.18 L-1,0 L-0.18,-0.18 Z';
    case 'blob': // a soft round blob (bubble / orb)
      return 'M0,-1 C0.55,-1 1,-0.55 1,0 C1,0.55 0.55,1 0,1 C-0.55,1 -1,0.55 -1,0 C-1,-0.55 -0.55,-1 0,-1 Z';
    case 'burst': // a five-point spiky star (impact)
      return 'M0,-1 L0.22,-0.31 L0.95,-0.31 L0.36,0.12 L0.59,0.81 L0,0.38 L-0.59,0.81 L-0.36,0.12 L-0.95,-0.31 L-0.22,-0.31 Z';
    case 'hex': // a hexagon (metal plate)
      return 'M0,-1 L0.87,-0.5 L0.87,0.5 L0,1 L-0.87,0.5 L-0.87,-0.5 Z';
    case 'petal': // a full, rounded petal (fairy)
      return 'M0,-1 C0.62,-0.55 0.62,0.55 0,1 C-0.62,0.55 -0.62,-0.55 0,-1 Z';
    case 'chevron': // a wing / boomerang sweep (flying)
      return 'M0,-0.3 L1,0.5 L0.5,0.55 L0,0.1 L-0.5,0.55 L-1,0.5 Z';
    case 'diamond': // a rhombus (ground / earth)
      return 'M0,-1 L0.65,0 L0,1 L-0.65,0 Z';
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
