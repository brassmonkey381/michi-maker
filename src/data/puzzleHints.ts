/**
 * An easy hint for every daily puzzle, built from the two answer words.
 *
 * WHY GENERATED NOW (owner, 2026-10-13). "The puzzles are kind of hard sometimes, they all need
 * hints." Twenty-one of the twenty-four puzzles published so far had none, because a hint was the
 * one thing fill-queue left for a person to write and nobody did. An easy hint that exists beats a
 * clever one that does not, so every puzzle now gets one at publish time.
 *
 * THE ONE RULE: A HINT NEVER CONTAINS A WORD THE GRADER WOULD ACCEPT. Not the answer, and not a
 * word from its synonym family (src/data/puzzleSynonyms.ts), because naming "village" when the
 * answer is "town" is the answer. The owner's words: "never use the synonym." So each clue below
 * describes the thing in other words, and puzzleHints.test.ts checks every clue against every
 * family word and every clue key, so a new clue cannot quietly break the rule.
 *
 * A clue is a lower-case fragment with no internal commas; two of them become one sentence,
 * "Deep among the trunks, and a current running past." A word with no clue yields no hint, and
 * fill-queue says so, so the fix is one line here rather than a hand-written hint in Studio.
 *
 * NO IMPORTS beyond the synonym list, for the same reason as puzzleSynonyms.ts: `npm test` and
 * scripts/puzzles/fill-queue.mjs both load this file directly under node.
 */
import { SYNONYM_FAMILIES, normalizeWord } from './puzzleSynonyms.ts';

/** answer word -> what to say instead of it. Keys are the guessable scene/object vocabulary. */
export const CLUES: Record<string, string> = {
  apples: 'red and crunchy',
  backpack: 'carried on your shoulders',
  basket: 'woven with a handle',
  beach: 'where the tide comes in',
  bedroom: 'where you sleep',
  bench: 'somewhere to sit outside',
  berries: 'small and sweet from a bush',
  blades: 'sharp edges',
  book: 'pages to turn',
  bottle: 'a drink with a neck',
  branches: 'what grows out from a trunk',
  bubbles: 'round and floating and popping',
  canyon: 'a deep gap cut into the ground',
  cap: 'worn on your head',
  cave: 'dark and in the ground',
  city: 'tall buildings everywhere',
  cliff: 'a sheer drop',
  clouds: 'white puffs overhead',
  countryside: 'far from any building',
  crate: 'a wooden box',
  crystals: 'clear and gleaming and sharp edged',
  cup: 'a drink with a handle',
  desert: 'dry ground as far as you can see',
  field: 'wide open and flat and green',
  flames: 'hot and orange and crackling',
  flowers: 'something colourful to pick',
  food: 'something to eat',
  forest: 'deep among the trunks',
  garden: 'a tidy place to grow things',
  gems: 'shiny and precious',
  gloves: 'keeps your hands toasty',
  grass: 'green under your feet',
  house: 'somewhere to live',
  ice: 'frozen solid',
  jacket: 'something thick to wear when it is cold',
  jungle: 'thick humid green all around you',
  kitchen: 'where dinner gets made',
  lake: 'still enough to see your reflection',
  lantern: 'a glow carried by a handle',
  // Holiday words (scripts/puzzles/holidays.mjs), each used once a year on its own day.
  eerie: 'the feeling of a place that gives you the shivers',
  festive: 'decorations up and everyone in a good mood',
  cozy: 'blankets and a soft glow and nowhere to be',
  tender: 'a soft moment between two who adore each other',
  celebrating: 'everyone whooping it up for a big occasion',
  confetti: 'tiny paper scraps thrown in the air',
  dancing: 'moving to the beat with arms in the air',
  sparkles: 'tiny flecks of glow dotted all over the picture',
  fireworks: 'bright bangs overhead on a special evening',
  flag: 'cloth on a pole that stands for somewhere',
  clover: 'a lucky little plant with three lobes or four',
  rainbow: 'a stripe of every colour after the showers',
  autumn: 'the season of orange and gold',
  balloons: 'filled with air and tied with string',
  candles: 'wax that burns down slowly with a glow',
  graveyard: 'where the headstones stand',
  // The wider vocabulary (2026-10-18): every word a page can be made of needs a clue, or the
  // scheduler skips it. Plain descriptions, never a word the grader would take for an answer.
  bridge: 'a way across without getting wet',
  bushes: 'low and leafy and round',
  cliffs: 'a sheer drop at the edge of the land',
  coral: 'the colourful reef where fish hide',
  embers: 'the orange glow left when a blaze dies down',
  fence: 'posts and rails marking the edge of a yard',
  ferns: 'feathery fronds low to the ground',
  fire: 'hot and bright and crackling',
  fountain: 'a splash shooting up in a square',
  lava: 'molten and glowing and creeping down a slope',
  mist: 'a soft haze you can barely see through',
  moon: 'the big pale circle after dark',
  moss: 'the soft green fuzz on damp things',
  plaza: 'a wide paved open square where people gather',
  pond: 'a small still pool with lily pads',
  rain: 'drops coming down from grey weather',
  rooftop: 'up on top of a building',
  sand: 'soft grains between your toes',
  scarf: 'wrapped round your neck when it is cold',
  seaweed: 'green strands swaying under the surface',
  skyscrapers: 'glass and steel reaching far up',
  smoke: 'grey and billowing from something burning',
  sparks: 'tiny hot flecks flying off',
  statue: 'a figure carved to stand still forever',
  sun: 'the bright ball high up on a clear day',
  sword: 'long and sharp and swung in battle',
  temple: 'an old place of worship with steps and columns',
  tower: 'tall and narrow and built to be climbed',
  village: 'a few dozen roofs and one lane',
  waterfall: 'a torrent tipping off a ledge',
  waves: 'rolling swells that break on the shore',
  leaves: 'what goes orange and drifts down in the colder months',
  light: 'a glow',
  lightning: 'a bright flash and a loud crack',
  lights: 'lots of small glows',
  market: 'stalls and shoppers',
  meadow: 'soft open green to lie down in',
  mountain: 'high ground and steep to climb',
  mushrooms: 'round tops on stems in the damp',
  night: 'once it has gone dark outside',
  ocean: 'where ships go',
  petals: 'soft colourful parts plucked one by one',
  plates: 'what dinner is served on',
  ribbons: 'tied in a bow',
  rings: 'worn on a finger',
  river: 'a current running past',
  road: 'asphalt down the middle',
  rocks: 'something hard and grey underfoot',
  room: 'four walls and a ceiling',
  ruins: 'built long ago and left to crumble',
  shop: 'somewhere to spend money',
  sign: 'something that tells you where to go',
  sky: 'look up',
  snow: 'cold and white',
  space: 'far beyond the planet and airless',
  spikes: 'sharp points',
  stars: 'what you wish on after dark',
  storm: 'bad weather',
  street: 'where the cars and the people go',
  sunset: 'the end of the day',
  town: 'a main square with a clock on the hall',
  trees: 'tall trunks reaching up',
  undergrowth: 'the tangle at ground level',
  underground: 'below your feet',
  underwater: 'hold your breath down here',
  vines: 'climbing and twisting up whatever they find',
  volcano: 'smoking at the top',
  water: 'something wet',
  winter: 'the cold season',
  woods: 'trunks all around you',
};

/**
 * The hint for a puzzle, or null when a theme has no clue yet. One sentence, answers in the order
 * the puzzle lists them, so the player who gets the first half can concentrate on the second.
 */
export function hintFor(themes: readonly string[]): string | null {
  const clues = themes.map((t) => CLUES[normalizeWord(t)]);
  if (clues.some((c) => !c)) return null;
  const [first, ...rest] = clues as string[];
  const sentence = [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(', and ');
  return `${sentence}.`;
}

/** Every word in a hint that the grader would take as an answer. Empty is the only acceptable result. */
export function hintGiveaways(hint: string, themes: readonly string[]): string[] {
  const banned = new Set<string>();
  for (const t of themes) {
    const w = normalizeWord(t);
    banned.add(w);
    for (const words of Object.values(SYNONYM_FAMILIES)) {
      if (words.includes(w)) for (const x of words) banned.add(x);
    }
  }
  const out: string[] = [];
  for (const token of normalizeWord(hint).split(' ')) {
    const bare = token.endsWith('s') ? token.slice(0, -1) : token;
    if (banned.has(token) || banned.has(bare)) out.push(token);
  }
  return out;
}
