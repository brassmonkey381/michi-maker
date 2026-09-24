-- A published puzzle is readable with no session at all.
--
-- THE BUG. /daily opened in a fresh incognito window said "There is no puzzle today" while a puzzle
-- was live. The read policy was `to authenticated`, and a visitor arriving cold has no session for
-- the first moment of the page: this app mints an ANONYMOUS session for guests, but that is a round
-- trip, and the page had already queried as `anon` and been handed an empty list. Nothing was
-- broken and nothing said so, which is the worst shape a failure can take: a correct query, a
-- correct empty answer, and a page that reports the wrong fact confidently.
--
-- It was reported as a possible image-caching problem, and it is worth writing down that it was
-- not: the puzzle ROW never arrived, so there was nothing to draw images for.
--
-- WHY THIS IS SAFE. The row is the puzzle: card ids, their picture addresses, the grid, the
-- backdrop, the hint and HOW MANY themes. The answer is not here. It lives in
-- daily_puzzle_answers, which has no select policy for anybody and is reachable only through
-- guess_puzzle_word and puzzle_answer, both of which still require auth.uid().
--
-- SO READING IS PUBLIC AND PLAYING IS NOT, which is the right split for a page linked from
-- Instagram: the puzzle draws instantly for anyone who taps the link, and a guess still needs a
-- session, which the app mints for a guest by the time they have typed a word.
--
-- The publish gate is unchanged: `publish_on <= puzzle_today()` still hides tomorrow's.

drop policy if exists daily_puzzles_read on public.daily_puzzles;
create policy daily_puzzles_read on public.daily_puzzles
  for select to authenticated, anon
  using (publish_on <= public.puzzle_today());

-- The guess box's word list is the same kind of thing: public vocabulary, no answers in it.
drop policy if exists puzzle_vocabulary_read on public.puzzle_vocabulary;
create policy puzzle_vocabulary_read on public.puzzle_vocabulary
  for select to authenticated, anon
  using (suggest);

comment on policy daily_puzzles_read on public.daily_puzzles is
  'Published puzzles are readable with no session, so a cold visitor sees the cards immediately. '
  'The answers are in daily_puzzle_answers, which nobody can select.';
