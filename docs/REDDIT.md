# Reddit

What to post, where, and what not to do. The daily puzzle is one post type out of eight; a feed
that is only the daily puzzle reads as a bot, and the subs that matter will treat it as one.

`scripts/social/reddit-post.mjs <type>` builds the ones that need real cards. It picks the cards,
creates the page, renders the image and writes a markdown file with a title and body ready to edit.
It never posts anything.

## The rules that actually get you banned

Read these before the post types. They are not style preferences.

1. **No giveaway may require an upvote.** Site-wide rule on vote manipulation, and it is enforced.
   Entry is a comment, never a vote, never an upvote, never an award. The Instagram raffle terms do
   not transfer: do not paste "like and follow" into a Reddit post.
2. **Self-promotion ratio.** Most large subs want roughly one self-linking post in ten. On
   r/pokemoncards and r/PokemonTCG, put the link in a comment and let the picture carry the post.
   On your own r/MichiMakers there is no limit.
3. **Check each sub's rules page every time.** They change, and "I did not know" is not a defence.
4. **Flair recurring posts** so people can filter them, and so moderators can see the pattern is
   deliberate.
5. **Spoiler tags on puzzle answers.** `>!like this!<`. It keeps the thread playable for whoever
   arrives later, which is the whole reason the puzzle works better on Reddit than on Instagram.

## Where

| Sub | What fits | Link policy |
| --- | --- | --- |
| r/MichiMakers (own) | everything, including dev updates | no limit |
| r/pokemoncards | colour studies, artist spotlights, lineages | link in a comment |
| r/PokemonTCG | artist spotlights, rate-my-page | link in a comment |
| r/pkmntcgcollections | binder pages, lineages | link in a comment |

Do not post the same image to several subs the same day. Space them, and change the title.

## The post types

Ranked by what they cost you against what they return.

### 1. Daily theme puzzle  (`reddit-post.mjs` is not needed; `scripts/puzzles/fill-queue.mjs` writes it)

The recurring one. A page, and the question of which search terms made it. Answers in spoiler tags.
Every scheduled puzzle already has its Reddit title and body written into
`state/puzzles/captions-<date>.md`.

### 2. Answer thread  (`node scripts/social/reddit-post.mjs answer`)

The morning after, the answer plus how many cards matched in total. The cheapest post there is and
the one that brings people back, because whoever guessed wants to know if they were right. Reply to
the people who got it rather than editing the post: a thread with replies stays visible, an edited
post does not.

### 3. Colour study  (`node scripts/social/reddit-post.mjs colour --apply`)

Nine cards in one palette. These are the ones that travel, because a page is one colour before it is
nine cards and that is all a thumbnail can carry. Pages come from the `Colour Study` binder, built
by `scripts/social/color-pages.mjs`.

### 4. Rate my page  (`node scripts/social/reddit-post.mjs rate --apply`)

The same picture, asked as a question: which one would you cut? A question outranks a statement on
Reddit because the site ranks on comments. No link in the body; add it in a comment if anyone asks.

### 5. Artist spotlight  (`node scripts/social/reddit-post.mjs artist --apply`)

Nine full arts by one illustrator, oldest first. The highest-value, lowest-promotion post on the
list: it is genuinely about the cards, and the collectors who care about illustrators are exactly
the people who will use the app. The generator excludes 5ban Graphics, which is a studio credited on
hundreds of cards rather than a hand you can recognise.

### 6. Lineage  (`node scripts/social/reddit-post.mjs lineage --apply`)

One evolution line, every full art, oldest to newest. Watching the art style move across fifteen
years does the work; you do not need to say anything clever. Note the page is keyed on the BASE
form, so a Bulbasaur line page is mostly Venusaur cards, and the title says "the Bulbasaur line"
for that reason.

### 7. Build-along request thread  (write by hand)

"Give me a theme and I will build the page." Highest engagement per post of anything here, and the
only one that cannot be generated, because the value is that you answer people. Run it when you
have an hour, not when you are busy. Post the results as replies in the same thread.

### 8. Dev update  (own sub only)

What changed this week, with a picture. Only on r/MichiMakers. Nowhere else wants it, and posting it
elsewhere is what gets an account marked as promotional.

## A workable week

Monday through Sunday, the puzzle and its answer thread run every day on r/MichiMakers. On top of
that, two posts a week to the larger subs is plenty:

- Wednesday: artist spotlight or lineage, to r/pokemoncards or r/PokemonTCG
- Saturday: colour study or rate-my-page, to r/pkmntcgcollections

That is eight posts a week on your own sub and two outside it, which keeps the self-promotion ratio
comfortable everywhere.

## Copy rules

The same rules as everywhere else: never explain how a page was assembled or that cards carry any
kind of label, and no em-dashes. The puzzle is the one exception, and even there the post asks which
*search terms* were used, never what the underlying data looks like.
