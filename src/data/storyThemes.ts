/**
 * STORY THEMES — the vocabulary a story binder is built from.
 *
 * The catalog's illustration-tagged cards carry `scene_tags`: prefixed tags (`scene:snow`,
 * `mood:cold`, `action:walking`, `object:lantern`, `style:painterly`, `flag:night`) in weight
 * order, strongest first (the enrichment pipeline ranks them; the weights themselves are not
 * published, the ORDER is). A theme names the tags that make a card belong to it, and the stock
 * photo searches that dress its pages. A template is an ordered list of themes, one per two-page
 * spread, plus a cover — the story the binder tells from front to back.
 *
 * Vocabulary as published 2026-09-05 (2,524 tagged cards): 54 scenes, 33 moods, 60 actions,
 * 65 objects, 18 styles, 9 flags. Only tags that exist are used here; a theme whose tags thin out
 * still builds, it just borrows from its `bonus` list and then from the rarity ladder.
 */

/** A stock-art search: what to look for, and whether photos or illustrations suit the theme. */
export type ArtKind = 'photo' | 'illustration' | 'any';

export interface StoryTheme {
  id: string;
  /** Page title, e.g. "Winter". */
  title: string;
  /** One line under the title (persisted as the page description). */
  blurb: string;
  /** Prefixed tags that place a card IN this theme. Any match counts, weighted by tag rank. */
  want: string[];
  /** Softer signals: half weight. A card on bonus alone does not qualify. */
  bonus?: string[];
  /** Tags that pull a card out of this theme (a sunny beach is not Winter). */
  avoid?: string[];
  /** Stock-art searches, tried in order until one returns something usable. */
  art: string[];
  artKind?: ArtKind;
}

export interface StoryTemplate {
  id: string;
  title: string;
  blurb: string;
  /** Stock-art searches for the opening page's plate. */
  coverArt: string[];
  coverArtKind?: ArtKind;
  spreads: StoryTheme[];
}

// ─── Themes ──────────────────────────────────────────────────────────────────────────────────────

const SPRING: StoryTheme = {
  id: 'spring',
  title: 'Spring',
  blurb: 'Flowers, meadows and gardens; the cheerful, tender pictures.',
  want: ['scene:flowers', 'object:flowers', 'scene:meadow', 'scene:garden', 'scene:grass', 'scene:rain'],
  bonus: ['mood:cheerful', 'mood:tender', 'mood:hopeful', 'mood:playful', 'action:foraging', 'scene:field', 'object:berries'],
  avoid: ['scene:snow', 'scene:ice', 'mood:cold', 'scene:desert', 'scene:lava', 'flag:night'],
  art: ['spring meadow wildflowers soft light', 'cherry blossom garden', 'spring rain green leaves'],
  artKind: 'any',
};

const SUMMER: StoryTheme = {
  id: 'summer',
  title: 'Summer',
  blurb: 'Beaches, sun and water; the loud, splashing, festival pictures.',
  want: ['scene:beach', 'scene:ocean', 'mood:sunny', 'scene:festival', 'action:swimming', 'action:splashing', 'action:surfing', 'scene:lake'],
  bonus: ['mood:festive', 'mood:playful', 'mood:busy', 'scene:sky', 'scene:river', 'flag:day', 'flag:crowd', 'scene:market'],
  avoid: ['scene:snow', 'scene:ice', 'mood:cold', 'mood:gloomy', 'flag:night'],
  art: ['summer beach turquoise water aerial', 'sunny ocean waves', 'summer festival lanterns'],
  artKind: 'any',
};

const AUTUMN: StoryTheme = {
  id: 'autumn',
  title: 'Autumn',
  blurb: 'Leaves, harvest and forest floors; warm, nostalgic and a little quiet.',
  want: ['object:leaves', 'mood:nostalgic', 'scene:mushrooms', 'object:mushrooms', 'object:apples', 'object:berries', 'object:basket', 'action:foraging'],
  bonus: ['scene:forest', 'scene:trees', 'mood:warm', 'mood:quiet', 'object:food', 'mood:cozy', 'scene:field', 'scene:road'],
  avoid: ['scene:snow', 'scene:beach', 'scene:underwater', 'mood:sunny'],
  art: ['autumn forest golden leaves path', 'fall leaves close up warm light', 'harvest pumpkins wooden table'],
  artKind: 'any',
};

const WINTER: StoryTheme = {
  id: 'winter',
  title: 'Winter',
  blurb: 'Snow, ice and storm; cold outside, cozy inside.',
  want: ['scene:snow', 'object:snow', 'scene:ice', 'mood:cold', 'scene:storm', 'mood:stormy'],
  bonus: ['scene:mountain', 'mood:quiet', 'mood:cozy', 'mood:gloomy', 'flag:night', 'scene:cave', 'object:lantern'],
  avoid: ['scene:beach', 'mood:sunny', 'scene:desert', 'scene:lava', 'scene:jungle'],
  art: ['snowy mountain forest winter landscape', 'frozen lake ice blue', 'snowfall night lantern'],
  artKind: 'any',
};

const DAWN: StoryTheme = {
  id: 'dawn',
  title: 'Dawn',
  blurb: 'First light: hopeful, calm, the sky doing the work.',
  want: ['mood:hopeful', 'scene:sky', 'scene:clouds', 'mood:calm', 'mood:serene'],
  bonus: ['flag:day', 'action:watching', 'action:flying', 'scene:mountain', 'scene:field', 'mood:quiet', 'action:soaring'],
  avoid: ['flag:night', 'flag:indoor', 'mood:chaotic', 'mood:menacing'],
  art: ['sunrise mist mountains pastel sky', 'dawn clouds soft pink light', 'morning fog field sunrise'],
  artKind: 'any',
};

const DAYTIME: StoryTheme = {
  id: 'day',
  title: 'Broad daylight',
  blurb: 'Full sun, busy pictures, everybody out.',
  want: ['mood:sunny', 'flag:day', 'mood:busy', 'mood:cheerful', 'action:playing', 'action:running'],
  bonus: ['scene:town', 'scene:city', 'scene:market', 'scene:grass', 'flag:crowd', 'mood:playful', 'action:jumping'],
  avoid: ['flag:night', 'mood:gloomy', 'mood:eerie', 'scene:cave', 'scene:underground'],
  art: ['bright sunny day blue sky park', 'city street sunshine', 'sunlit meadow midday'],
  artKind: 'any',
};

const DUSK: StoryTheme = {
  id: 'dusk',
  title: 'Dusk',
  blurb: 'Sunset and the warm hour after it; nostalgic, tender, winding down.',
  want: ['scene:sunset', 'mood:nostalgic', 'mood:warm', 'mood:tender', 'mood:sleepy'],
  bonus: ['mood:calm', 'mood:quiet', 'scene:sky', 'scene:beach', 'scene:river', 'action:resting', 'action:sitting', 'scene:road'],
  avoid: ['flag:night', 'mood:chaotic', 'mood:frantic'],
  art: ['golden hour sunset warm sky silhouette', 'dusk orange purple clouds', 'evening light over water'],
  artKind: 'any',
};

const NIGHT: StoryTheme = {
  id: 'night',
  title: 'Night',
  blurb: 'Stars, moon and lanterns; dreamy, eerie, asleep.',
  want: ['flag:night', 'scene:stars', 'object:stars', 'scene:moon', 'mood:eerie', 'mood:dreamy', 'action:sleeping'],
  bonus: ['object:lantern', 'action:glowing', 'mood:quiet', 'mood:lonely', 'mood:moody', 'scene:space', 'action:floating', 'object:lights'],
  avoid: ['mood:sunny', 'flag:day', 'mood:cheerful'],
  art: ['starry night sky milky way', 'moonlit forest night blue', 'night city lanterns glow'],
  artKind: 'any',
};

const FOREST: StoryTheme = {
  id: 'forest',
  title: 'Into the woods',
  blurb: 'Trees, forest and jungle; hiding, perching, peeking out.',
  want: ['scene:forest', 'scene:trees', 'scene:jungle', 'object:trees'],
  bonus: ['action:hiding', 'action:perching', 'action:peeking', 'scene:mushrooms', 'object:leaves', 'mood:wild', 'mood:quiet', 'action:climbing'],
  avoid: ['scene:city', 'scene:underwater', 'scene:desert', 'flag:indoor'],
  art: ['deep green forest sunbeams', 'misty woodland path', 'jungle canopy light'],
  artKind: 'any',
};

const WATER: StoryTheme = {
  id: 'water',
  title: 'By the water',
  blurb: 'Ocean, rivers, lakes and the world under the surface.',
  want: ['scene:ocean', 'scene:underwater', 'scene:river', 'scene:lake', 'scene:beach', 'action:swimming', 'action:splashing'],
  bonus: ['action:drifting', 'action:floating', 'mood:calm', 'mood:dreamy', 'object:boat', 'action:surfing', 'mood:serene'],
  avoid: ['scene:desert', 'scene:lava', 'scene:volcano', 'flag:indoor'],
  art: ['ocean underwater sunlight rays', 'calm lake reflection mountains', 'river through forest'],
  artKind: 'any',
};

const MOUNTAIN: StoryTheme = {
  id: 'mountain',
  title: 'High ground',
  blurb: 'Mountains, rocks and caves; grand and a little lonely.',
  want: ['scene:mountain', 'scene:rocks', 'object:rocks', 'scene:cave', 'scene:underground', 'flag:underground'],
  bonus: ['mood:grand', 'mood:lonely', 'action:climbing', 'action:standing', 'object:gems', 'object:crystals', 'action:burrowing', 'action:digging'],
  avoid: ['scene:ocean', 'scene:beach', 'scene:city', 'flag:indoor'],
  art: ['mountain peaks dramatic clouds', 'rocky canyon golden light', 'cave crystals glow'],
  artKind: 'any',
};

const TOWN: StoryTheme = {
  id: 'town',
  title: 'Around town',
  blurb: 'Streets, shops and markets; busy, cheerful, crowded.',
  want: ['scene:town', 'scene:city', 'scene:shop', 'scene:market', 'scene:village', 'scene:road', 'scene:bridge'],
  bonus: ['mood:busy', 'flag:crowd', 'object:sign', 'object:car', 'object:bicycle', 'mood:cheerful', 'action:carrying', 'object:crate'],
  avoid: ['scene:forest', 'scene:underwater', 'scene:desert', 'scene:cave'],
  art: ['cozy old town street lanterns', 'market stalls colourful awnings', 'city skyline evening'],
  artKind: 'any',
};

const INDOORS: StoryTheme = {
  id: 'indoors',
  title: 'At home',
  blurb: 'Bedrooms, kitchens and libraries; cozy and quiet.',
  want: ['flag:indoor', 'scene:bedroom', 'scene:kitchen', 'scene:library', 'scene:house', 'object:book', 'object:cup'],
  bonus: ['mood:cozy', 'mood:sleepy', 'action:reading', 'action:cooking', 'action:eating', 'object:food', 'action:resting', 'object:bottle', 'action:drinking'],
  avoid: ['flag:outdoor', 'mood:chaotic', 'scene:storm'],
  art: ['cozy reading nook warm lamp', 'kitchen window morning light', 'bookshelf library soft light'],
  artKind: 'any',
};

const HEAT: StoryTheme = {
  id: 'heat',
  title: 'Heat',
  blurb: 'Desert, volcano and lava; menacing, wild, chaotic.',
  want: ['scene:desert', 'scene:volcano', 'scene:lava', 'object:lava'],
  bonus: ['mood:menacing', 'mood:wild', 'mood:chaotic', 'action:fighting', 'mood:tense', 'action:shouting', 'style:high contrast'],
  avoid: ['scene:snow', 'scene:ice', 'scene:underwater', 'mood:cozy'],
  art: ['desert dunes sunset red sand', 'volcano lava glow night', 'heat haze canyon'],
  artKind: 'any',
};

const COZY: StoryTheme = {
  id: 'cozy',
  title: 'Cozy',
  blurb: 'Warm light, small rooms, something to eat.',
  want: ['mood:cozy', 'mood:warm', 'mood:sleepy', 'action:resting', 'action:sleeping'],
  bonus: ['flag:indoor', 'object:lantern', 'object:cup', 'object:food', 'scene:house', 'scene:bedroom', 'mood:tender', 'mood:quiet'],
  avoid: ['mood:chaotic', 'mood:menacing', 'scene:storm', 'mood:eerie'],
  art: ['cozy cabin fireplace warm', 'blanket tea candle window rain', 'warm lamp light bedroom'],
  artKind: 'any',
};

const PLAYFUL: StoryTheme = {
  id: 'playful',
  title: 'Playful',
  blurb: 'Games, grins and mischief.',
  want: ['mood:playful', 'mood:mischievous', 'action:playing', 'action:jumping', 'action:dancing', 'action:grinning', 'action:laughing'],
  bonus: ['mood:cheerful', 'flag:multiples', 'object:ball', 'action:chasing', 'action:running', 'action:singing', 'style:chibi'],
  avoid: ['mood:gloomy', 'mood:solemn', 'mood:lonely', 'mood:menacing'],
  art: ['confetti colourful celebration', 'balloons bright sky', 'playground colourful pattern'],
  artKind: 'illustration',
};

const EERIE: StoryTheme = {
  id: 'eerie',
  title: 'Eerie',
  blurb: 'Fog, ruins and things that glow in the dark.',
  want: ['mood:eerie', 'mood:menacing', 'mood:gloomy', 'scene:ruins', 'action:glowing', 'mood:moody'],
  bonus: ['flag:night', 'scene:cave', 'scene:underground', 'action:hiding', 'action:peeking', 'style:silhouette', 'mood:lonely', 'scene:storm'],
  avoid: ['mood:sunny', 'mood:cheerful', 'mood:cozy', 'mood:playful'],
  art: ['foggy forest dark moody', 'abandoned ruins mist', 'haunted night purple fog'],
  artKind: 'any',
};

const GRAND: StoryTheme = {
  id: 'grand',
  title: 'Grand',
  blurb: 'Big skies, big gestures, the triumphant and solemn pictures.',
  want: ['mood:grand', 'mood:triumphant', 'mood:solemn', 'mood:authoritative', 'action:soaring', 'action:guarding', 'scene:temple'],
  bonus: ['scene:sky', 'scene:mountain', 'scene:clouds', 'action:flying', 'action:standing', 'style:graphic poster', 'style:realistic'],
  avoid: ['style:chibi', 'mood:playful', 'mood:mischievous', 'flag:indoor'],
  art: ['epic mountain vista dramatic sky', 'cathedral light beams grand', 'vast canyon panorama'],
  artKind: 'any',
};

const DREAMY: StoryTheme = {
  id: 'dreamy',
  title: 'Dreamy',
  blurb: 'Soft focus, floating, drifting; the pictures that feel like sleep.',
  want: ['mood:dreamy', 'style:soft focus', 'action:floating', 'action:drifting', 'style:psychedelic'],
  bonus: ['scene:stars', 'scene:space', 'scene:clouds', 'mood:calm', 'mood:serene', 'flag:night', 'action:sleeping', 'scene:underwater'],
  avoid: ['mood:chaotic', 'mood:frantic', 'style:thick lines', 'mood:busy'],
  art: ['dreamy pastel clouds soft', 'bokeh lights blurred pastel', 'aurora night sky soft'],
  artKind: 'any',
};

const CHAOS: StoryTheme = {
  id: 'chaos',
  title: 'Chaos',
  blurb: 'Fights, storms and shouting; every line thick and every colour loud.',
  want: ['mood:chaotic', 'mood:frantic', 'action:fighting', 'action:shouting', 'mood:tense', 'scene:storm'],
  bonus: ['style:thick lines', 'style:high contrast', 'flag:multiples', 'flag:crowd', 'mood:wild', 'action:falling', 'action:chasing'],
  avoid: ['mood:calm', 'mood:quiet', 'mood:serene', 'action:sleeping'],
  art: ['lightning storm dramatic sky', 'paint splash explosion colour', 'crashing waves storm'],
  artKind: 'any',
};

const SUNNY: StoryTheme = {
  id: 'sunny',
  title: 'Sunny',
  blurb: 'Clear skies and the pictures that squint.',
  want: ['mood:sunny', 'flag:day', 'scene:sky'],
  bonus: ['scene:beach', 'scene:field', 'scene:meadow', 'mood:cheerful', 'scene:grass', 'action:playing', 'scene:garden'],
  avoid: ['flag:night', 'scene:storm', 'scene:rain', 'mood:gloomy'],
  art: ['clear blue sky sunshine field', 'sunflowers bright sun', 'sunny coast white cliffs'],
  artKind: 'any',
};

const RAIN: StoryTheme = {
  id: 'rain',
  title: 'Rain and storm',
  blurb: 'Umbrellas, thunder and wet streets.',
  want: ['scene:rain', 'scene:storm', 'mood:stormy', 'object:umbrella'],
  bonus: ['mood:gloomy', 'mood:moody', 'scene:city', 'scene:town', 'scene:river', 'mood:tense', 'scene:clouds'],
  avoid: ['mood:sunny', 'scene:desert', 'scene:snow'],
  art: ['rain on window city lights bokeh', 'storm clouds lightning field', 'rainy street reflections'],
  artKind: 'any',
};

const SNOW: StoryTheme = {
  id: 'snow',
  title: 'Snow and ice',
  blurb: 'Whiteouts and frozen lakes.',
  want: ['scene:snow', 'object:snow', 'scene:ice', 'mood:cold'],
  bonus: ['scene:mountain', 'mood:quiet', 'scene:storm', 'mood:gloomy', 'action:walking', 'action:standing'],
  avoid: ['mood:sunny', 'scene:beach', 'scene:lava'],
  art: ['snow covered pine trees', 'ice crystals frozen lake close up', 'blizzard mountain'],
  artKind: 'any',
};

const SKY: StoryTheme = {
  id: 'sky',
  title: 'Wind and sky',
  blurb: 'Clouds and everything that flies, floats or drifts through them.',
  want: ['scene:sky', 'scene:clouds', 'object:clouds', 'action:flying', 'action:soaring', 'action:floating', 'action:drifting'],
  bonus: ['mood:calm', 'mood:dreamy', 'mood:grand', 'scene:mountain', 'flag:day', 'action:perching'],
  avoid: ['flag:indoor', 'scene:underwater', 'scene:underground', 'scene:cave'],
  art: ['cumulus clouds blue sky', 'birds flying sunset sky', 'wind swept grass hills sky'],
  artKind: 'any',
};

// ─── Templates ───────────────────────────────────────────────────────────────────────────────────

export const STORY_TEMPLATES: StoryTemplate[] = [
  {
    id: 'seasons',
    title: 'Seasons',
    blurb: 'Four spreads, four seasons: spring, summer, autumn, winter.',
    coverArt: ['four seasons tree collage', 'seasons changing landscape', 'tree in four seasons'],
    spreads: [SPRING, SUMMER, AUTUMN, WINTER],
  },
  {
    id: 'day-to-night',
    title: 'Day to night',
    blurb: 'Dawn, daylight, dusk and night, in that order.',
    coverArt: ['sun and moon sky gradient', 'day to night timelapse sky', 'sunrise to starry night'],
    spreads: [DAWN, DAYTIME, DUSK, NIGHT],
  },
  {
    id: 'habitats',
    title: 'Habitats',
    blurb: 'Where they live: woods, water, high ground, town, home, and the hot places.',
    coverArt: ['world landscapes collage nature', 'diverse biomes aerial', 'nature panorama forest sea mountain'],
    spreads: [FOREST, WATER, MOUNTAIN, TOWN, INDOORS, HEAT],
  },
  {
    id: 'moods',
    title: 'Moods',
    blurb: 'Six feelings, one spread each: cozy, playful, dreamy, grand, eerie, chaos.',
    coverArt: ['abstract colour gradient emotions', 'colourful paint texture', 'mood board abstract'],
    coverArtKind: 'illustration',
    spreads: [COZY, PLAYFUL, DREAMY, GRAND, EERIE, CHAOS],
  },
  {
    id: 'weather',
    title: 'Weather',
    blurb: 'Sun, rain, snow and wind.',
    coverArt: ['weather sky collage clouds sun rain', 'dramatic weather sky', 'four weather sky'],
    spreads: [SUNNY, RAIN, SNOW, SKY],
  },
];

/** Every theme by id, for custom orderings and for the sheet's theme picker. */
export const STORY_THEMES: StoryTheme[] = [
  SPRING, SUMMER, AUTUMN, WINTER,
  DAWN, DAYTIME, DUSK, NIGHT,
  FOREST, WATER, MOUNTAIN, TOWN, INDOORS, HEAT,
  COZY, PLAYFUL, EERIE, GRAND, DREAMY, CHAOS,
  SUNNY, RAIN, SNOW, SKY,
];

export function storyTheme(id: string): StoryTheme | undefined {
  return STORY_THEMES.find((t) => t.id === id);
}
