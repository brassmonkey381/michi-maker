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

// ─── Niche themes (2026-09-06): objects, actions and drawing styles, not weather or mood ─────────
// Blurbs say what the page IS. Nothing here names the tagging.

const SNACK_TIME: StoryTheme = {
  id: 'snack-time',
  title: 'Snack time',
  blurb: "Berries, bottles, baskets and a few very good meals.",
  want: ["object:food", "action:eating", "object:cup", "object:bottle", "object:berries", "object:apples", "action:cooking", "action:drinking", "object:frying pan"],
  bonus: ["scene:kitchen", "object:basket", "mood:cheerful", "mood:cozy", "action:sitting"],
  avoid: ["action:fighting", "mood:menacing"],
  art: ["picnic table food overhead", "bakery counter pastries", "fruit bowl still life window light"],
  artKind: 'any',
};

const BOOKISH: StoryTheme = {
  id: 'bookish',
  title: 'Bookish',
  blurb: "Reading nooks, lamplight and a library or two.",
  want: ["object:book", "scene:library", "action:reading", "object:lantern"],
  bonus: ["scene:bedroom", "flag:indoor", "mood:quiet", "mood:calm", "action:sitting", "object:cushions"],
  avoid: ["action:fighting", "scene:storm"],
  art: ["old library bookshelves warm light", "reading nook armchair lamp", "stack of old books close up"],
  artKind: 'any',
};

const HIDE_AND_SEEK: StoryTheme = {
  id: 'hide-and-seek',
  title: 'Hide and seek',
  blurb: "Peeking from crates, baskets and burrows: the ones you almost missed.",
  want: ["action:hiding", "action:peeking", "action:burrowing", "object:crate", "object:barrel"],
  bonus: ["object:basket", "mood:mischievous", "mood:playful", "action:watching", "object:bucket"],
  avoid: ["action:fighting", "mood:grand"],
  art: ["stacked wooden crates warehouse", "wicker baskets market stall", "tall grass meadow close up"],
  artKind: 'any',
};

const ON_THE_MOVE: StoryTheme = {
  id: 'on-the-move',
  title: 'On the move',
  blurb: "Running, climbing, riding: nobody on these pages is standing still.",
  want: ["action:running", "action:climbing", "action:jumping", "action:riding", "action:chasing", "object:bicycle", "object:car", "scene:road"],
  bonus: ["object:backpack", "mood:energetic", "mood:busy", "flag:outdoor", "action:walking"],
  avoid: ["action:sleeping", "action:resting", "action:sitting"],
  art: ["winding road aerial view", "hiking trail mountain path", "bicycle on country road"],
  artKind: 'any',
};

const TREASURE: StoryTheme = {
  id: 'treasure',
  title: 'Treasure',
  blurb: "Gems, coins and glowing things found underground.",
  want: ["object:gems", "object:crystals", "object:coin", "object:orbs", "scene:cave", "flag:underground"],
  bonus: ["action:glowing", "scene:underground", "mood:mysterious", "object:rocks", "action:digging"],
  avoid: ["mood:sunny", "scene:beach"],
  art: ["crystal cave glowing", "gemstones macro close up", "gold coins treasure chest"],
  artKind: 'any',
};

const NAP_TIME: StoryTheme = {
  id: 'nap-time',
  title: 'Nap time',
  blurb: "Asleep, half asleep, or about to be.",
  want: ["action:sleeping", "action:yawning", "mood:sleepy", "action:resting"],
  bonus: ["object:cushions", "scene:bedroom", "mood:cozy", "mood:quiet", "flag:night", "flag:indoor"],
  avoid: ["action:fighting", "action:running", "mood:chaotic"],
  art: ["soft blanket bed morning light", "hammock lazy afternoon", "cat sleeping in sun window"],
  artKind: 'any',
};

const CROWD: StoryTheme = {
  id: 'crowd',
  title: 'Crowd scenes',
  blurb: "Festivals, markets and stadiums: everyone showed up.",
  want: ["flag:crowd", "scene:festival", "scene:stadium", "scene:arena", "scene:market", "action:celebrating", "action:cheering"],
  bonus: ["flag:multiples", "mood:busy", "mood:cheerful", "object:bunting", "object:balloons", "scene:town"],
  avoid: ["mood:quiet", "action:sleeping"],
  art: ["festival lanterns crowd night", "street market bustle", "stadium crowd lights"],
  artKind: 'any',
};

const TOGETHER: StoryTheme = {
  id: 'together',
  title: 'Together',
  blurb: "Pairs and small groups, doing things side by side.",
  want: ["flag:multiples", "action:hugging", "action:dancing", "action:playing", "action:feeding"],
  bonus: ["mood:cheerful", "mood:tender", "mood:playful", "action:smiling", "action:laughing"],
  avoid: ["action:fighting", "mood:menacing", "flag:no-pokemon"],
  art: ["friends silhouettes sunset", "two chairs on a porch", "group hiking trail"],
  artKind: 'any',
};

const POSTER_ART: StoryTheme = {
  id: 'poster-art',
  title: 'Poster style',
  blurb: "Flat colour, bold shapes and hard edges, like a printed poster.",
  want: ["style:graphic poster", "style:flat", "style:no outlines", "style:high contrast", "style:thick lines"],
  bonus: ["style:cel shaded", "mood:bold", "mood:energetic"],
  avoid: ["style:realistic", "style:soft focus", "style:sketchy"],
  art: ["geometric poster illustration", "bold flat shapes design", "minimal vector landscape illustration"],
  artKind: 'illustration',
};

const STORYBOOK: StoryTheme = {
  id: 'storybook',
  title: 'Storybook',
  blurb: "Soft, painted pages that look lifted from a picture book.",
  want: ["style:storybook", "style:painterly", "style:soft focus"],
  bonus: ["mood:tender", "mood:calm", "mood:dreamy", "style:sketchy"],
  avoid: ["style:high contrast", "style:graphic poster", "mood:chaotic"],
  art: ["watercolor storybook illustration forest", "children's book illustration cottage", "gouache painting meadow illustration"],
  artKind: 'illustration',
};

const INK_AND_MANGA: StoryTheme = {
  id: 'ink-and-manga',
  title: 'Ink and manga',
  blurb: "Thin lines, screentone and the comic page look.",
  want: ["style:manga", "style:thin lines", "style:line art", "style:sketchy"],
  bonus: ["style:high contrast", "style:retro", "mood:tense", "mood:dramatic"],
  avoid: ["style:painterly", "style:soft focus", "style:realistic"],
  art: ["ink line drawing city street", "manga panel screentone", "pen sketch illustration"],
  artKind: 'illustration',
};

const RETRO: StoryTheme = {
  id: 'retro',
  title: 'Retro',
  blurb: "Cel shading, saturated colour and a little nineties in the lines.",
  want: ["style:retro", "style:cel shaded"],
  bonus: ["style:thick lines", "style:high contrast", "mood:cheerful", "mood:bold"],
  avoid: ["style:realistic", "style:soft focus"],
  art: ["retro synthwave illustration", "vintage cartoon background illustration", "pixel art landscape"],
  artKind: 'illustration',
};

const PSYCHEDELIC: StoryTheme = {
  id: 'psychedelic',
  title: 'Psychedelic',
  blurb: "Colour that does not sit still.",
  want: ["style:psychedelic"],
  bonus: ["mood:dreamy", "action:floating", "action:drifting", "mood:chaotic", "style:no outlines"],
  avoid: ["style:realistic", "mood:quiet"],
  art: ["psychedelic swirl pattern illustration", "tie dye color abstract", "liquid marble colors abstract"],
  artKind: 'illustration',
};

const SIGNS_AND_SHOPS: StoryTheme = {
  id: 'signs-and-shops',
  title: 'Signs and shops',
  blurb: "Storefronts, counters, signboards and the odd mailbox.",
  want: ["object:sign", "scene:shop", "object:counter", "object:mailbox", "action:serving"],
  bonus: ["scene:market", "scene:town", "scene:city", "object:lights", "mood:busy", "flag:indoor"],
  avoid: ["scene:forest", "scene:underwater"],
  art: ["small storefront awning street", "neon shop signs night street", "corner shop window display"],
  artKind: 'any',
};

const LANTERN_LIGHT: StoryTheme = {
  id: 'lantern-light',
  title: 'Lantern light',
  blurb: "Small lights in the dark: lanterns, embers, a glow from somewhere.",
  want: ["object:lantern", "object:lights", "action:glowing", "scene:campfire"],
  bonus: ["flag:night", "object:stars", "mood:warm", "mood:calm", "mood:mysterious"],
  avoid: ["mood:sunny", "flag:day"],
  art: ["paper lanterns night festival", "campfire embers dark", "string lights bokeh evening"],
  artKind: 'any',
};

const PERCHED: StoryTheme = {
  id: 'perched',
  title: 'Perched',
  blurb: "Up on a branch, a fence, a wire: looking down at everything.",
  want: ["action:perching", "action:hanging", "object:nest", "action:nesting", "object:fence"],
  bonus: ["scene:trees", "object:trees", "action:watching", "action:climbing", "flag:outdoor"],
  avoid: ["scene:underwater", "flag:indoor"],
  art: ["bird on wire silhouette sky", "tree branch close up bokeh", "wooden fence field morning"],
  artKind: 'any',
};

const SPLASH: StoryTheme = {
  id: 'splash',
  title: 'Making a splash',
  blurb: "Rivers, lakes and the moment the water goes everywhere.",
  want: ["action:splashing", "action:surfing", "object:surfboard", "action:swimming", "scene:river", "scene:lake"],
  bonus: ["scene:ocean", "scene:beach", "mood:playful", "mood:energetic", "object:boat"],
  avoid: ["scene:desert", "scene:lava", "flag:indoor"],
  art: ["water splash macro", "river rapids rocks", "lake surface ripples morning"],
  artKind: 'any',
};

const HANDS_FULL: StoryTheme = {
  id: 'hands-full',
  title: 'Hands full',
  blurb: "Carrying, holding, hauling: everyone has something to bring.",
  want: ["action:carrying", "action:holding", "object:basket", "object:backpack", "object:bucket", "action:foraging"],
  bonus: ["object:crate", "object:apples", "object:berries", "mood:busy", "mood:cheerful"],
  avoid: ["action:sleeping", "action:fighting"],
  art: ["farmers market baskets produce", "moving boxes hallway", "hands holding harvest apples"],
  artKind: 'any',
};

const RUINS: StoryTheme = {
  id: 'ruins',
  title: 'Ruins and temples',
  blurb: "Old stone, older stories.",
  want: ["scene:ruins", "scene:temple"],
  bonus: ["object:rocks", "scene:rocks", "mood:solemn", "mood:mysterious", "mood:eerie", "scene:jungle", "scene:cave"],
  avoid: ["scene:city", "flag:indoor"],
  art: ["ancient ruins overgrown jungle", "stone temple steps mist", "crumbling stone archway"],
  artKind: 'any',
};

const CITY_LIGHTS: StoryTheme = {
  id: 'city-lights',
  title: 'City lights',
  blurb: "Streets, rooftops and the neon after dark.",
  want: ["scene:city", "scene:road", "object:car", "object:lights", "object:screen"],
  bonus: ["flag:night", "scene:shop", "mood:busy", "mood:moody", "object:sign"],
  avoid: ["scene:forest", "scene:meadow", "scene:underwater"],
  art: ["city street night rain neon", "rooftop skyline dusk", "crosswalk long exposure lights"],
  artKind: 'any',
};

const OPEN_COUNTRY: StoryTheme = {
  id: 'open-country',
  title: 'Open country',
  blurb: "Fields, meadows and a lot of sky.",
  want: ["scene:field", "scene:meadow", "scene:grass", "object:grass"],
  bonus: ["scene:sky", "flag:outdoor", "flag:day", "mood:calm", "action:running", "action:standing"],
  avoid: ["flag:indoor", "scene:city", "scene:underwater"],
  art: ["wide open field big sky", "rolling hills meadow summer", "wheat field wind"],
  artKind: 'any',
};

// ─── The elements ────────────────────────────────────────────────────────────────────────────────
// Nine spreads on what a picture is MADE of rather than where it happens. Deliberately not
// Habitats: that binder sorts by place, this one by substance, so lava and crystal and starfield
// sit beside water and stone instead of being scattered across a map.
//
// Every theme below was measured against the live scorer before it was written down. The thinnest
// is Firelight at 22 picture-rarity qualifiers and the fattest is Growing things at 329; a spread
// wants a dozen, so all of them fill. One candidate tag was dropped for never firing at all.

const EL_FIRE: StoryTheme = {
  id: 'el-fire',
  title: 'Fire',
  blurb: 'Lava, embers and the light they throw.',
  want: ['object:lava', 'scene:lava', 'scene:volcano', 'scene:campfire'],
  bonus: ['action:glowing', 'mood:dramatic', 'mood:warm', 'scene:desert'],
  avoid: ['scene:snow', 'scene:ice', 'scene:underwater'],
  art: ['lava texture close up', 'ember sparks dark background', 'volcano illustration'],
  artKind: 'any',
};

const EL_WATER: StoryTheme = {
  id: 'el-water',
  title: 'Water',
  blurb: 'Open sea, river shallows and everything under the surface.',
  want: ['scene:ocean', 'scene:underwater', 'scene:river', 'scene:lake'],
  bonus: ['action:swimming', 'action:splashing', 'mood:calm', 'scene:beach'],
  avoid: ['scene:desert', 'scene:lava'],
  art: ['underwater light rays', 'ocean surface texture', 'river stones clear water'],
  artKind: 'any',
};

const EL_EARTH: StoryTheme = {
  id: 'el-earth',
  title: 'Earth',
  blurb: 'Stone, soil and the rooms under it.',
  want: ['scene:rocks', 'object:rocks', 'scene:cave', 'scene:underground'],
  bonus: ['flag:underground', 'action:digging', 'action:burrowing', 'scene:mountain'],
  avoid: ['scene:sky', 'scene:space'],
  art: ['rock strata texture', 'cave interior illustration', 'cracked earth close up'],
  artKind: 'any',
};

const EL_AIR: StoryTheme = {
  id: 'el-air',
  title: 'Air',
  blurb: 'Everything with nothing underneath it.',
  want: ['scene:sky', 'scene:clouds', 'object:clouds', 'action:flying', 'action:soaring'],
  bonus: ['action:floating', 'action:drifting', 'flag:outdoor', 'mood:hopeful'],
  avoid: ['flag:indoor', 'scene:underground', 'scene:underwater'],
  art: ['cloud study sky', 'wind swept clouds illustration', 'high altitude blue sky'],
  artKind: 'any',
};

const EL_ICE: StoryTheme = {
  id: 'el-ice',
  title: 'Ice',
  blurb: 'Cold as a material: frost, drifts and hard blue light.',
  want: ['scene:ice', 'scene:snow', 'object:snow', 'mood:cold'],
  bonus: ['mood:quiet', 'mood:serene', 'scene:mountain'],
  avoid: ['scene:lava', 'scene:desert', 'mood:sunny'],
  art: ['ice crystal macro', 'frost on glass texture', 'glacier blue ice'],
  artKind: 'any',
};

const EL_STORM: StoryTheme = {
  id: 'el-storm',
  title: 'Storm',
  blurb: 'Weather with a temper.',
  want: ['scene:storm', 'mood:stormy', 'scene:rain'],
  bonus: ['mood:dramatic', 'mood:tense', 'scene:clouds', 'action:shouting'],
  avoid: ['mood:sunny', 'mood:calm', 'flag:indoor'],
  art: ['storm clouds dramatic', 'lightning over water', 'rain on dark window'],
  artKind: 'any',
};

const EL_CRYSTAL: StoryTheme = {
  id: 'el-crystal',
  title: 'Crystal',
  blurb: 'Facets, gemstones and things that hold light.',
  want: ['object:crystals', 'object:gems', 'object:orbs'],
  bonus: ['action:glowing', 'mood:mysterious', 'scene:cave', 'object:coin'],
  art: ['crystal cluster macro', 'gemstone facets light', 'amethyst geode'],
  artKind: 'any',
};

const EL_GROWING: StoryTheme = {
  id: 'el-growing',
  title: 'Growing things',
  blurb: 'The green element: leaf, petal and blade.',
  want: ['scene:flowers', 'object:flowers', 'scene:grass', 'scene:meadow', 'object:leaves'],
  bonus: ['scene:garden', 'scene:forest', 'object:mushrooms', 'mood:tender'],
  avoid: ['scene:city', 'scene:lava'],
  art: ['pressed leaves botanical', 'wildflower meadow close up', 'fern fronds pattern'],
  artKind: 'any',
};

const EL_STARFIELD: StoryTheme = {
  id: 'el-starfield',
  title: 'Starfield',
  blurb: 'The element nobody can stand on.',
  want: ['scene:space', 'scene:stars', 'object:stars', 'scene:moon'],
  bonus: ['flag:night', 'mood:dreamy', 'action:floating', 'action:glowing'],
  avoid: ['flag:day', 'mood:sunny', 'flag:indoor'],
  art: ['star field deep space', 'nebula illustration', 'moon surface detail'],
  artKind: 'any',
};

// ─── The journey ─────────────────────────────────────────────────────────────────────────────────
// Nine spreads that run in ORDER, which no other template does: leave, travel, cross, climb, go
// under, make camp, find the thing, meet what guards it, come home. Read as a book it is a story
// rather than a set of categories, so the SPREAD ORDER here is load-bearing and should not be
// sorted or shuffled for tidiness.

const JR_SETTING_OUT: StoryTheme = {
  id: 'jr-setting-out',
  title: 'Setting out',
  blurb: 'Packed, carrying something, already walking.',
  want: ['object:backpack', 'action:walking', 'action:carrying', 'object:basket'],
  bonus: ['flag:outdoor', 'mood:hopeful', 'action:holding', 'scene:road'],
  avoid: ['action:sleeping'],
  art: ['vintage backpack illustration', 'walking boots path', 'travel kit flat lay'],
  artKind: 'any',
};

const JR_OPEN_ROAD: StoryTheme = {
  id: 'jr-open-road',
  title: 'The open road',
  blurb: 'Roads, bridges and anything with wheels.',
  want: ['scene:road', 'object:car', 'object:bicycle', 'action:riding', 'scene:bridge'],
  bonus: ['action:running', 'scene:town', 'mood:energetic'],
  avoid: ['flag:indoor', 'scene:underwater'],
  art: ['empty road vanishing point', 'old bridge illustration', 'bicycle against wall'],
  artKind: 'any',
};

const JR_CROSSING: StoryTheme = {
  id: 'jr-crossing',
  title: 'The crossing',
  blurb: 'Water in the way, and the boat or the swim that gets past it.',
  want: ['object:boat', 'scene:river', 'scene:lake', 'action:swimming'],
  bonus: ['action:splashing', 'scene:bridge', 'mood:calm', 'scene:ocean'],
  avoid: ['scene:desert'],
  art: ['wooden rowboat on water', 'river crossing stones', 'ferry illustration'],
  artKind: 'any',
};

const JR_CLIMB: StoryTheme = {
  id: 'jr-climb',
  title: 'The climb',
  blurb: 'Upward, on rock.',
  want: ['action:climbing', 'scene:mountain', 'scene:rocks'],
  bonus: ['action:jumping', 'mood:grand', 'scene:sky', 'object:rocks'],
  avoid: ['flag:indoor', 'scene:underwater'],
  art: ['mountain ridge silhouette', 'rock face climbing route', 'summit view clouds'],
  artKind: 'any',
};

const JR_INTO_THE_DARK: StoryTheme = {
  id: 'jr-into-the-dark',
  title: 'Into the dark',
  blurb: 'Underground, and whatever lives there.',
  want: ['scene:cave', 'flag:underground', 'scene:underground', 'action:burrowing', 'action:digging'],
  bonus: ['mood:eerie', 'object:lantern', 'action:glowing', 'object:crystals'],
  avoid: ['flag:day', 'mood:sunny', 'scene:sky'],
  art: ['cave mouth darkness', 'mine tunnel lantern', 'underground cavern illustration'],
  artKind: 'any',
};

const JR_MAKING_CAMP: StoryTheme = {
  id: 'jr-making-camp',
  title: 'Making camp',
  blurb: 'Fire lit, something cooking, nobody going any further tonight.',
  want: ['scene:campfire', 'object:lantern', 'action:cooking', 'action:resting'],
  bonus: ['mood:cozy', 'object:food', 'flag:night', 'action:sitting'],
  avoid: ['mood:frantic', 'mood:chaotic'],
  art: ['campfire at night', 'camp lantern glow', 'tent under stars illustration'],
  artKind: 'any',
};

const JR_THE_FIND: StoryTheme = {
  id: 'jr-the-find',
  title: 'The find',
  blurb: 'What the whole trip was for.',
  want: ['object:gems', 'object:crystals', 'object:coin', 'action:digging'],
  bonus: ['object:orbs', 'action:holding', 'mood:triumphant', 'action:glowing'],
  art: ['treasure chest open illustration', 'gold coins pile', 'gemstones in hand'],
  artKind: 'any',
};

const JR_OLD_STONES: StoryTheme = {
  id: 'jr-old-stones',
  title: 'Old stones',
  blurb: 'Ruins, temples and whatever has been standing guard the whole time.',
  want: ['scene:ruins', 'scene:temple', 'action:guarding', 'mood:solemn'],
  bonus: ['mood:grand', 'mood:mysterious', 'mood:eerie', 'scene:rocks'],
  avoid: ['mood:playful', 'scene:city'],
  art: ['ancient stone ruins overgrown', 'temple columns illustration', 'carved monolith'],
  artKind: 'any',
};

const JR_HOMEWARD: StoryTheme = {
  id: 'jr-homeward',
  title: 'Homeward',
  blurb: 'Indoors, warm, and finally asleep.',
  want: ['flag:indoor', 'scene:house', 'action:sleeping', 'mood:cozy'],
  bonus: ['scene:bedroom', 'scene:kitchen', 'mood:warm', 'action:resting', 'object:cushions'],
  avoid: ['mood:chaotic', 'scene:storm'],
  art: ['lit window at dusk', 'cosy room illustration', 'front door lantern evening'],
  artKind: 'any',
};

// ─── Light and dark ──────────────────────────────────────────────────────────────────────────────
// Ten spreads sorted by WHERE THE LIGHT COMES FROM, which is a different question from what time
// it is (Day to night) or how the card was drawn (Drawn). A lantern, a city sign and a star are
// the same subject here and land in three different spreads in every other template.

const LD_SUNLIT: StoryTheme = {
  id: 'ld-sunlit',
  title: 'Sunlit',
  blurb: 'Daylight doing the work, no other source needed.',
  want: ['mood:sunny', 'flag:day', 'scene:sky'],
  bonus: ['flag:outdoor', 'mood:cheerful', 'scene:meadow', 'scene:beach'],
  avoid: ['flag:night', 'mood:gloomy', 'flag:indoor'],
  art: ['sunbeams through leaves', 'bright summer sky', 'sunlight on water surface'],
  artKind: 'any',
};

const LD_GOLDEN_HOUR: StoryTheme = {
  id: 'ld-golden-hour',
  title: 'Golden hour',
  blurb: 'The last warm hour, and everything it flatters.',
  want: ['scene:sunset', 'mood:warm', 'mood:nostalgic'],
  bonus: ['mood:tender', 'scene:clouds', 'mood:calm', 'mood:sleepy'],
  avoid: ['mood:chaotic', 'scene:underground'],
  art: ['golden hour field backlit', 'sunset gradient sky', 'long shadows evening light'],
  artKind: 'any',
};

const LD_LANTERNS: StoryTheme = {
  id: 'ld-lanterns',
  title: 'Lanterns',
  blurb: 'Light somebody hung up on purpose.',
  want: ['object:lantern', 'object:lights', 'scene:festival'],
  bonus: ['flag:night', 'mood:festive', 'object:bunting', 'mood:cozy'],
  avoid: ['flag:day'],
  art: ['paper lanterns strung night', 'festival lights warm bokeh', 'lantern illustration'],
  artKind: 'any',
};

const LD_FIRELIGHT: StoryTheme = {
  id: 'ld-firelight',
  title: 'Firelight',
  blurb: 'The oldest light source there is.',
  want: ['scene:campfire', 'object:lava', 'scene:lava'],
  bonus: ['action:glowing', 'mood:warm', 'mood:cozy', 'flag:night'],
  avoid: ['mood:cold', 'scene:ice'],
  art: ['campfire embers close up', 'firelight on faces', 'burning coals texture'],
  artKind: 'any',
};

const LD_CITY_GLOW: StoryTheme = {
  id: 'ld-city-glow',
  title: 'City glow',
  blurb: 'Signs, screens and streetlight.',
  want: ['scene:city', 'object:lights', 'object:screen', 'scene:road'],
  bonus: ['flag:night', 'scene:town', 'object:sign', 'mood:busy'],
  avoid: ['scene:forest', 'scene:meadow'],
  art: ['neon signs wet street', 'city skyline at night', 'shop window glow evening'],
  artKind: 'any',
};

const LD_STARLIGHT: StoryTheme = {
  id: 'ld-starlight',
  title: 'Starlight',
  blurb: 'Light that left a long time ago.',
  want: ['scene:stars', 'object:stars', 'scene:space'],
  bonus: ['flag:night', 'mood:dreamy', 'mood:serene', 'scene:moon'],
  avoid: ['flag:day', 'flag:indoor'],
  art: ['milky way over horizon', 'constellation chart illustration', 'star trails long exposure'],
  artKind: 'any',
};

const LD_MOONLIGHT: StoryTheme = {
  id: 'ld-moonlight',
  title: 'Moonlight',
  blurb: 'Cool, low and enough to see by.',
  want: ['scene:moon', 'flag:night', 'mood:dreamy'],
  bonus: ['mood:quiet', 'mood:serene', 'action:sleeping', 'scene:clouds'],
  avoid: ['flag:day', 'mood:sunny'],
  art: ['full moon through clouds', 'moonlit water surface', 'night landscape blue'],
  artKind: 'any',
};

const LD_SILHOUETTE: StoryTheme = {
  id: 'ld-silhouette',
  title: 'Silhouettes',
  blurb: 'Shape first, detail never.',
  want: ['style:silhouette', 'style:high contrast', 'style:flat'],
  bonus: ['style:graphic poster', 'style:no outlines', 'mood:dramatic'],
  avoid: ['style:soft focus'],
  art: ['silhouette against sunset', 'high contrast shapes poster', 'paper cut shadow art'],
  artKind: 'illustration',
};

const LD_GLOWING: StoryTheme = {
  id: 'ld-glowing',
  title: 'Things that glow',
  blurb: 'The light is coming from the subject.',
  want: ['action:glowing', 'object:orbs', 'object:crystals'],
  bonus: ['mood:mysterious', 'flag:night', 'object:lights', 'mood:dreamy'],
  avoid: ['mood:sunny', 'flag:day'],
  art: ['bioluminescence dark water', 'glowing orb illustration', 'fireflies at dusk'],
  artKind: 'any',
};

const LD_IN_THE_DARK: StoryTheme = {
  id: 'ld-in-the-dark',
  title: 'In the dark',
  blurb: 'Where the light has run out.',
  // `mood:mysterious` was in the first draft of this list and is NOT here: measured against the
  // live scorer it never once fired, so it would have been a tag that looked like it was doing
  // work and was not. The other three carry the theme on their own.
  want: ['mood:eerie', 'mood:gloomy', 'flag:night'],
  bonus: ['mood:menacing', 'mood:moody', 'scene:cave', 'mood:tense'],
  avoid: ['mood:sunny', 'mood:cheerful', 'flag:day'],
  art: ['dark forest fog', 'deep shadow texture', 'moonless night illustration'],
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
  {
    id: 'little-things',
    title: 'Little things',
    blurb: 'Snacks, books, treasure and small lights.',
    coverArt: ['flat lay small objects wooden table', 'cozy desk lamp books cup'],
    spreads: [SNACK_TIME, BOOKISH, TREASURE, LANTERN_LIGHT],
  },
  {
    id: 'small-adventures',
    title: 'Small adventures',
    blurb: 'Hiding, hauling, climbing, splashing, and the nap after.',
    coverArt: ['backpack on trail overlook', 'kids running field summer'],
    spreads: [HIDE_AND_SEEK, ON_THE_MOVE, HANDS_FULL, SPLASH, NAP_TIME],
  },
  {
    id: 'drawn',
    title: 'Drawn',
    blurb: 'Four ways to put ink on a card: poster, storybook, manga, psychedelic.',
    coverArt: ['art supplies flat lay illustration', 'paint palette brushes illustration'],
    coverArtKind: 'illustration',
    spreads: [POSTER_ART, STORYBOOK, INK_AND_MANGA, PSYCHEDELIC],
  },
  {
    id: 'places',
    title: 'Places',
    blurb: 'Shops, ruins, city streets and one big crowd.',
    coverArt: ['old town street map illustration', 'travel postcards collage'],
    spreads: [SIGNS_AND_SHOPS, RUINS, CITY_LIGHTS, CROWD],
  },
  {
    id: 'elements',
    title: 'The elements',
    blurb: 'Nine spreads on what a picture is made of: fire, water, earth, air and five more.',
    coverArt: ['alchemy elements engraving', 'four elements symbols illustration'],
    spreads: [EL_FIRE, EL_WATER, EL_EARTH, EL_AIR, EL_ICE, EL_STORM, EL_CRYSTAL, EL_GROWING, EL_STARFIELD],
  },
  {
    id: 'journey',
    title: 'The journey',
    blurb: 'Out the door, over the water, up the mountain, under it, and home. Read it in order.',
    coverArt: ['old adventure map compass', 'travel journal open illustration'],
    spreads: [JR_SETTING_OUT, JR_OPEN_ROAD, JR_CROSSING, JR_CLIMB, JR_INTO_THE_DARK, JR_MAKING_CAMP, JR_THE_FIND, JR_OLD_STONES, JR_HOMEWARD],
  },
  {
    id: 'light-and-dark',
    title: 'Light and dark',
    blurb: 'Ten spreads sorted by where the light is coming from, ending where it runs out.',
    coverArt: ['light through darkness illustration', 'candle flame black background'],
    spreads: [LD_SUNLIT, LD_GOLDEN_HOUR, LD_LANTERNS, LD_FIRELIGHT, LD_CITY_GLOW, LD_STARLIGHT, LD_MOONLIGHT, LD_SILHOUETTE, LD_GLOWING, LD_IN_THE_DARK],
  },
];

/** Every theme by id, for custom orderings and for the sheet's theme picker. */
export const STORY_THEMES: StoryTheme[] = [
  SPRING, SUMMER, AUTUMN, WINTER,
  DAWN, DAYTIME, DUSK, NIGHT,
  FOREST, WATER, MOUNTAIN, TOWN, INDOORS, HEAT,
  COZY, PLAYFUL, EERIE, GRAND, DREAMY, CHAOS,
  SUNNY, RAIN, SNOW, SKY,
  SNACK_TIME, BOOKISH, HIDE_AND_SEEK, ON_THE_MOVE, TREASURE, NAP_TIME, CROWD, TOGETHER,
  POSTER_ART, STORYBOOK, INK_AND_MANGA, RETRO, PSYCHEDELIC,
  SIGNS_AND_SHOPS, LANTERN_LIGHT, PERCHED, SPLASH, HANDS_FULL, RUINS, CITY_LIGHTS, OPEN_COUNTRY,
];

export function storyTheme(id: string): StoryTheme | undefined {
  return STORY_THEMES.find((t) => t.id === id);
}
