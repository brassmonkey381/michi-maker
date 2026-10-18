/**
 * The days that get a themed puzzle, and the words kept back for them.
 *
 * WHY (owner, 2026-10-18): "saving special themes for holidays (love for valentines day, eerie for
 * halloween, etc.)". A holiday's words are tried in order; the first one with a fair pair wins and
 * the run says which. A word listed in SPECIAL_WORDS is never used on an ordinary day, so Halloween
 * is the only eerie page of the year. A plain word (snow, flowers, food) may be a holiday's choice
 * too; it is simply preferred that day and lives its normal life otherwise.
 *
 * Mood words are allowed here and nowhere else. The ordinary vocabulary is things you can SEE
 * (scene: and object: tags); "eerie" and "festive" are how a picture feels, which is unguessable on
 * a Tuesday and exactly right on the 31st of October.
 *
 * DATES ARE WRITTEN OUT, not computed. Thanksgiving, Easter and Lunar New Year move, and a wrong
 * rule is worse than a list that has to be extended each autumn. Covers 2026-10 to 2027-10; add the
 * next year's dates before scheduling past that.
 */

/** word -> the tag namespace it lives in. Reserved for holidays; never an ordinary day's answer. */
export const SPECIAL_WORDS = {
  eerie: 'mood',
  festive: 'mood',
  cozy: 'mood',
  // "love for valentines day" (owner): hearts has seven cards, so the love word is the mood the
  // tagger calls tender, 444 cards, most of them two creatures being gentle with each other.
  tender: 'mood',
  // "celebration" for the turn of the year: the action word, with confetti and sparkles beside it.
  celebrating: 'action',
  dancing: 'action',
  confetti: 'object',
  sparkles: 'object',
  lantern: 'object',
  fireworks: 'object',
  flag: 'object',
  clover: 'scene',
  rainbow: 'scene',
  autumn: 'scene',
  balloons: 'object',
  candles: 'object',
  graveyard: 'scene',
};

/** @type {{ date: string, name: string, words: string[] }[]} */
export const HOLIDAYS = [
  // Sorted by date. Holidays proper, the four season openers, and (owner, 2026-10-18: "other fun
  // things that would make nice binder pages") observances and sky events that match a word the
  // vocabulary actually has. Meteor shower peaks are the usual nights; they drift by a day.
  { date: '2026-10-31', name: 'Halloween', words: ['eerie', 'graveyard'] },
  { date: '2026-11-01', name: 'Day of the Dead', words: ['candles', 'graveyard', 'lantern'] },
  { date: '2026-11-26', name: 'Thanksgiving', words: ['food', 'autumn'] },
  { date: '2026-12-11', name: 'International Mountain Day', words: ['mountain', 'snow'] },
  { date: '2026-12-13', name: 'Geminids meteor shower', words: ['stars', 'space', 'night'] },
  { date: '2026-12-21', name: 'First day of winter', words: ['snow', 'ice'] },
  { date: '2026-12-24', name: 'Christmas Eve', words: ['cozy', 'candles', 'snow'] },
  { date: '2026-12-25', name: 'Christmas', words: ['festive', 'lights', 'snow'] },
  { date: '2026-12-31', name: "New Year's Eve", words: ['celebrating', 'dancing', 'festive', 'fireworks', 'night'] },
  { date: '2027-01-01', name: "New Year's Day", words: ['sparkles', 'confetti', 'balloons', 'fireworks', 'sky'] },
  { date: '2027-01-31', name: 'Hot Chocolate Day', words: ['cozy', 'kitchen'] },
  { date: '2027-02-02', name: 'Groundhog Day', words: ['field', 'snow'] },
  { date: '2027-02-06', name: 'Lunar New Year', words: ['lantern', 'festive'] },
  { date: '2027-02-14', name: "Valentine's Day", words: ['tender', 'flowers', 'cozy'] },
  { date: '2027-02-27', name: 'Pokémon Day', words: ['road', 'grass'] },
  { date: '2027-03-17', name: "St Patrick's Day", words: ['clover', 'rainbow', 'grass'] },
  { date: '2027-03-20', name: 'First day of spring', words: ['flowers', 'garden'] },
  { date: '2027-03-22', name: 'World Water Day', words: ['waterfall', 'river', 'lake', 'water'] },
  { date: '2027-03-28', name: 'Easter', words: ['flowers', 'meadow', 'garden'] },
  { date: '2027-04-01', name: "April Fools' Day", words: ['mushrooms', 'bubbles'] },
  { date: '2027-04-10', name: 'Cherry blossom season', words: ['petals', 'flowers'] },
  { date: '2027-04-22', name: 'Earth Day', words: ['forest', 'ocean', 'mountain'] },
  { date: '2027-05-04', name: 'Star Wars Day', words: ['space', 'stars'] },
  { date: '2027-05-05', name: 'Cinco de Mayo', words: ['festive', 'plaza', 'food'] },
  { date: '2027-05-09', name: "Mother's Day", words: ['tender', 'flowers', 'garden'] },
  { date: '2027-06-08', name: 'World Oceans Day', words: ['underwater', 'ocean', 'seaweed'] },
  { date: '2027-06-21', name: 'First day of summer', words: ['beach', 'ocean'] },
  { date: '2027-06-22', name: 'World Rainforest Day', words: ['jungle', 'vines'] },
  { date: '2027-07-04', name: 'Independence Day', words: ['fireworks', 'flag', 'festive', 'night'] },
  { date: '2027-07-20', name: 'Moon Landing Day', words: ['moon', 'space'] },
  { date: '2027-08-12', name: 'Perseids meteor shower', words: ['stars', 'night', 'sky'] },
  { date: '2027-08-30', name: 'National Beach Day', words: ['beach', 'sand'] },
  { date: '2027-09-22', name: 'First day of autumn', words: ['autumn', 'leaves'] },
  { date: '2027-10-15', name: 'National Mushroom Day', words: ['mushrooms', 'forest'] },
  { date: '2027-10-31', name: 'Halloween', words: ['eerie', 'graveyard'] },
];

/** The holiday on a yyyy-mm-dd, or null. */
export function holidayOn(date) {
  return HOLIDAYS.find((h) => h.date === date) ?? null;
}
