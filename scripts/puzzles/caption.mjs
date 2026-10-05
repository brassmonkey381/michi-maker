/**
 * The caption file for one puzzle day: the Instagram post, the Reddit post, and the answer.
 *
 * ONE TEMPLATE, TWO WRITERS. fill-queue writes these when it schedules a week, and
 * write-captions.mjs regenerates them from the database afterwards, for a puzzle that was edited
 * in Studio or a run that stopped before this step. They have to share the text or the two files
 * drift and the one you open is the stale one.
 */
import { longDate } from '../lib/michi.mjs';

/**
 * @param {{ publishOn: string, themes: string[], cardNames: string[], candidates: number|null, hint?: string|null }} p
 */
export function caption(p) {
  const n = p.cardNames.length;
  const count = p.themes.length;
  const two = count === 2;
  const themeWords = p.themes.join(' + ');
  const cands = p.candidates == null ? '' : ` (${p.candidates} candidates, ${n} on the page)`;
  return `# Daily Theme Search Puzzle, ${longDate(p.publishOn)}

Answer: \`${p.themes.map((t) => `theme:${t}`).join(' ')}\`${cands}

HINT: ${p.hint ? p.hint : '<write one in Studio, or leave it and publish without a hint>'}

The puzzle appears for players on the morning of ${p.publishOn} and is listed in Studio until then.
The share image carries the question marks, the same on every puzzle, so the picture never hints
at its own answer.

---

## Instagram feed post

Download the image from Studio (the "image" button on this row), then paste:

> ${n} cards. ${two ? 'Two theme search terms connect' : `${count} theme search term${count === 1 ? '' : 's'} connect${count === 1 ? 's' : ''}`} all of them.
>
> Can you get ${two ? 'both' : count === 1 ? 'it' : 'them all'}? Play at michi-maker.com/daily, where your guesses are checked and your streak
> keeps going.
>
> To enter this week's draw for a free month of michi-maker: like this post, follow
> @michimakerofficial, and comment your michi-maker.com username.
>
> New puzzle every morning. Answer tomorrow.
>
> #pokemon #pokemontcg #pokemoncards #pokemonbinder #binder #tcgcollector #pokemoncollection
> #pokemoncardcollection #cardcollector
>
> Full rules: michi-maker.com/giveaway. Not sponsored, endorsed or administered by, or associated
> with, Instagram.

The hint goes LAST if you write one, so nobody reads it before trying the puzzle.

## Reddit, r/MichiMakers

**Title:** Daily Theme Search Puzzle, ${longDate(p.publishOn)}: can you guess the ${two ? 'two themes' : count === 1 ? 'theme' : `${count} themes`}?

**Body:**

> Every card on this page matches ${two ? 'both of two' : count === 1 ? 'one' : `all ${count}`} artwork search term${count === 1 ? '' : 's'}. Guess ${two ? 'them both' : count === 1 ? 'it' : 'them all'}.
>
> Put your answer in spoiler tags so the next person still gets to play: type \`>!like this!<\`.
>
> I will confirm answers in the comments tomorrow, when the next one goes up.
>
> New puzzle daily. Some are one theme, some are three.

No "like and follow" on Reddit: it reads as advertising, and tying a giveaway to upvotes breaks
the site rules on vote manipulation. Entry is the comment, never the vote.

## The page

Cards: ${p.cardNames.join(', ')}
Answer words: ${themeWords}
`;
}
