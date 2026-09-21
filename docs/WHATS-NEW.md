# Updating the What's New page

`/whats-new` renders one array, `CHANGELOG` in `src/data/changelog.ts`. There is no CMS and no
build step: add entries to the top of that array and ship. The page, its filters and its styling
never need touching for an update.

The WRITING rules (voice, length, honesty, tags) are the header comment of `changelog.ts`. Read
them first; this file is only the procedure.

## The procedure

1. **Find where the page stops.** The first entry's `date` is the last day covered. The last
   update commit is the newest result of:

   ```
   git log --format="%h %ad %s" --date=short -3 -- src/data/changelog.ts
   ```

2. **List what landed since, by the day it was COMMITTED.** Dates on the page are commit dates
   from git, not the day something was pushed, promoted or noticed. That is what "backdate" means
   here.

   ```
   git log --reverse --format="%ad %s" --date=format:"%m-%d" <last-update-commit>..HEAD
   ```

   Do the same in `../tcgscan-app` on its `main` branch for the TCGScan items:

   ```
   git -C ../tcgscan-app log --reverse --format="%ad %s" --date=format:"%m-%d" --since=<date> main
   ```

3. **Throw most of it away.** A changelog is what a user would notice. Drop: refactors, tests,
   docs, scripts, migrations with no visible effect, deploy fixes, anything reverted the same
   week, and anything still behind a flag (today: One Piece and Lorcana behind `?multi-tcg`, and
   the iOS in-app purchases until App Review passes). Several commits that iterate on one feature
   are ONE item, described as it ended up.

4. **Group into batches, one entry per batch.** Usually one per day that had something worth
   saying; fold a thin day into its neighbour. An entry's `date` is the day its LAST change was
   committed. Give it a short `title` that names the one or two things a reader came for.

5. **Write each item** as `head` plus one or two sentences of `body`, then tag it:
   - `products`: `['michi']`, `['tcgscan']`, or both for a shared browse-kit or catalogue change.
   - `kind`: `new`, `better` or `fix`.
   - `area`: one of `CHANGE_AREAS`.
   - `big: true` on at most two or three items a batch, never on a fix.
   Say who gets it (PRO, signed in, web only) and say when existing data is untouched.

6. **Mind the sister-app switch.** While `SHOW_CROSS_APP` is off (`src/lib/crossApp.ts`), the page
   hides every item tagged only `tcgscan` AND every item whose words contain "TCGScan", whatever
   its tags. So a change that landed in both apps is written as two items, one per product, and
   the michi one never names the other app. TCGScan items are still written: they appear the day
   the switch is turned on.

7. **Check it.** Verify any number or plan claim against the code, not the commit message
   (`src/data/tiers.ts`, `src/data/subscriptions.ts`). Then:

   ```
   npx tsc --noEmit
   npm test
   ```

   No em-dashes, and the file writes typographic apostrophes as the character itself.

8. **Commit** as `What's new: <what the batches cover>`, the way the earlier updates are named,
   and ship. Entries describing work that is committed but not yet deployed are fine as long as
   the same deploy carries both.

## Things that have gone wrong before

- Claiming "everywhere" for something that reached one screen. Say where it works.
- Announcing a flagged feature. If a visitor cannot reach it without a query string, it has not
  shipped to them.
- Quoting an old price or cap from memory. The tiers and prices moved on 2026-09-20 and
  2026-09-21; read them from the code each time.
