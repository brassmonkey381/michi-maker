-- Guessing a different word for the same thing counts.
--
-- THE PROBLEM (owner, 2026-09-26): "I am concerned that someone getting it wrong for guessing
-- 'forest, lake' then the answer is 'tree, water' will be a bad experience." The matcher until now
-- accepted an exact word, a plural, and a typo (pg_trgm at 0.5). None of those help: `forest` and
-- `trees` share no trigrams worth counting, so a player who read the picture perfectly and used an
-- ordinary English word for it was told they were wrong.
--
-- It was not hypothetical. scripts/puzzles/audit-guessability.mjs counts, for each scheduled
-- puzzle, every other tag carried by the cards actually on its page, then asks the real matcher
-- whether it would accept them. Six of the seven scheduled puzzles refused a word carried by most
-- of their own page: `trees` on 9 of 9 cards of a "forest" page, `ice` on 7 of a "snow" page,
-- `sky` on 6 of a "clouds" page.
--
-- A TABLE, NOT A LIST IN THE FUNCTION, so the vocabulary can be corrected the morning somebody
-- types a reasonable word that was missed, without a migration and a deploy. It is seeded from
-- src/data/puzzleSynonyms.ts by scripts/puzzles/seed-synonyms.mjs, which is the single definition;
-- that file is unit-tested and this table is a copy of it.
--
-- WHY THIS IS SAFE FOR A TWO-WORD ANSWER. A family that could satisfy EITHER answer word would let
-- one guess solve half the puzzle twice, leaving the second theme unreachable. fill-queue therefore
-- refuses to pair two words from one family, and puzzleSynonyms.test.ts asserts the families are
-- disjoint. The generator and the grader read the same list, so the two rules cannot drift apart.
--
-- WHAT IT DOES NOT DO. `cup` sits on seven of the nine cards of the food page and is not in any
-- family, because a cup is not food. A page that genuinely supports a word this table does not
-- cover is a bad puzzle, and the audit flags it to be replaced rather than being papered over here.

create table if not exists public.puzzle_synonyms (
  word   text primary key check (word = lower(word) and word ~ '^[a-z]+$'),
  family text not null check (family = lower(family) and family ~ '^[a-z]+$')
);

create index if not exists puzzle_synonyms_family_idx on public.puzzle_synonyms (family);

alter table public.puzzle_synonyms enable row level security;

-- NO SELECT POLICY, deliberately, and for the same reason daily_puzzle_answers has none: this
-- table is a map of the theme vocabulary, and a client that can read it can walk it. Grading runs
-- inside a security-definer function, which does not consult policies.
drop policy if exists puzzle_synonyms_write on public.puzzle_synonyms;
create policy puzzle_synonyms_write on public.puzzle_synonyms
  for all to authenticated
  using (public.is_privileged_write()) with check (public.is_privileged_write());

comment on table public.puzzle_synonyms is
  'Words that count as the same answer when grading a guess. Seeded from src/data/puzzleSynonyms.ts '
  'by scripts/puzzles/seed-synonyms.mjs. No select policy: it is the tag vocabulary in miniature.';

/**
 * The family a word belongs to, or null. Tries the word as typed and then without a trailing "s",
 * so the seed only has to carry one form of each.
 */
create or replace function public.puzzle_family(p_word text)
returns text language sql stable set search_path = '' as $$
  with w as (select public.puzzle_norm(p_word) as v)
  select coalesce(
    (select s.family from public.puzzle_synonyms s where s.word = (select v from w)),
    (select s.family from public.puzzle_synonyms s
      where (select v from w) like '%s' and s.word = left((select v from w), -1))
  );
$$;

-- STABLE, not IMMUTABLE: it reads a table now. `create or replace` may lower volatility, so this
-- replaces the previous IMMUTABLE definition in place without a drop.
create or replace function public.puzzle_words_match(p_guess text, p_theme text)
returns boolean language sql stable set search_path = '' as $$
  with g as (select public.puzzle_norm(p_guess) as w),
       t as (select public.puzzle_norm(p_theme) as w)
  select case
    when (select w from g) = '' then false
    when (select w from g) = (select w from t) then true
    -- Plural either way round, so "flowers" finds "flower" and "flower" finds "flowers".
    when (select w from g) = (select w from t) || 's' then true
    when (select w from g) || 's' = (select w from t) then true
    -- SAME THING, DIFFERENT WORD. Checked before the trigram rule because it is the confident one:
    -- two words in a family are the same answer by construction, whereas similarity is a guess.
    when public.puzzle_family((select w from g)) is not null
     and public.puzzle_family((select w from g)) = public.puzzle_family((select w from t)) then true
    -- A typo. 0.5 IS MEASURED, NOT CHOSEN: against real pairs, typos of theme words score 0.571 to
    -- 0.615 ("citty"/"city" 0.571, "flowerz"/"flowers" 0.600) and different words score 0.333 and
    -- below. The pair that sets the ceiling is "night"/"light" at 0.333: both are plausible themes,
    -- so accepting that band would mark a wrong answer right. A transposition like "kyruem" for
    -- "kyurem" scores 0.273 and is therefore refused, which is the price of refusing night/light.
    -- Only on themes of four characters or more; below that, trigrams barely mean anything.
    when length((select w from t)) >= 4 and extensions.similarity((select w from g), (select w from t)) >= 0.5 then true
    else false
  end;
$$;

revoke all on function public.puzzle_family(text) from public;
revoke all on function public.puzzle_words_match(text, text) from public;

comment on function public.puzzle_words_match(text, text) is
  'Does this guess count as this theme? Exact, plural, same synonym family, or a measured typo.';
