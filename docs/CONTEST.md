# First Annual Michi Binder Contest

The community binder contest: enter a public binder into one category, votes decide the winners,
prizes are subscription grants. This doc is the spec + runbook; the user-facing rules live at
`/contest` (src/app/contest.tsx), and all tunables (dates, category copy, prize table) live in
`src/data/contest.ts`.

## Two rounds

```
opensAt ───── round 1, the open field ─────> finalsOpenAt ───── the Final ─────> endsAt
2026-08-01                                    2026-10-10                         2026-10-17
   entries open, voted with binder likes        top 10 per category,
                                                locked, every score back to zero
```

**Round 1** is the contest as originally built: any public binder enters one category, and its
binder likes are its votes.

**The Final** is a second, separate vote. At `finalsOpenAt` we freeze the top
`CONTEST.finalistsPerCategory` (10) of each category into `contest_finalists`, those binders are
locked against edits by a database trigger, and one week of voting runs on a *different ballot*
(`contest_finals_votes`) that starts every finalist at zero. Winners come from the Final's counts.

Three consequences worth stating plainly, because each is a question someone will ask:

- **Round-1 votes are not deleted and not carried.** A binder keeps every like it earned; the
  likes decide *who qualifies* and nothing else. `stage1_votes` on the finalist row records what
  each one finished with, which is the audit trail for how the field was picked.
- **The Final is not "liking" a binder.** Liking a finalist during the Final raises its heart
  count and does nothing to its standing. The tile shows a Vote pill instead, on purpose.
- **The lock is a trigger, not a hidden button.** `contest_lock_guard` refuses writes to a locked
  finalist's binder row, pages and slots. Deleting the whole binder stays allowed: that is really a
  withdrawal, and an entrant must not be trapped by a contest they entered.

## Categories & prizes

Six categories. A binder enters EXACTLY ONE category. (Community's Choice was cut: it would
double-pay whatever wins Best Aesthetic.)

| Category | 1st | 2nd | 3rd–5th | 6th–10th |
| --- | --- | --- | --- | --- |
| **Best Aesthetic** (flagship) | **LIFETIME VIP** | 1 Year VIP | 3 Months PRO | 1 Month PRO |
| Best Trainer Showcase | 1 Year VIP | 1 Year PRO | 3 Months PRO | 1 Month PRO |
| Best Artist Showcase | 1 Year VIP | 1 Year PRO | 3 Months PRO | 1 Month PRO |
| Best Creativity | 1 Year VIP | 1 Year PRO | 3 Months PRO | 1 Month PRO |
| Best Meme | 1 Year VIP | 1 Year PRO | 3 Months PRO | 1 Month PRO |
| Best 2×2 | 1 Year VIP | 1 Year PRO | 3 Months PRO | 1 Month PRO |

60 prize slots (Aesthetic 10, five categories × 10).

**Headline value** (monthly-rate basis: PRO $3.99/mo, VIP $9.99/mo):
Aesthetic ex-lifetime $175.74 + five categories × $223.62 ≈ **$1,294**, plus the LIFETIME VIP
grand prize (valued at $500+ = 5 years of annual VIP).
Market as: **"Over $1,700 in prizes, including a once-ever LIFETIME VIP grand prize."**

## Rules (user-facing summary — the /contest page is authoritative)

- No purchase necessary to enter or win.
- One binder = one category, chosen at entry. The choice is FINAL (no update path — DB-enforced);
  withdrawing and re-entering is possible but resets the entry time (the final tie-breaker).
- Entries must be PUBLIC binders (public binder + public profile — the standard sharing gate).
- 16-page cap on PUBLIC pages: a binder of any size can enter, but at most 16 of its pages may
  be public (hide the rest from the Share sheet). Entering past the cap is blocked (DB gate,
  `20260725150000_contest_public_page_cap.sql`); flipping a 17th page public on an entered
  binder is blocked with a toast; and contest views show at most the first 16 public pages.
- Round 1 is voted with binder likes; the Final is voted on its own ballot, one vote per account
  per finalist, and you cannot vote for your own binder in either round.
- Winners are determined purely by the Final's vote counts at `endsAt`. Ties break on the round-1
  finishing position (`seed`), then on entry time.
- A finalist binder is locked from `finalsOpenAt`: pages, layout, title, description, cover and the
  public flag are all frozen. Other binders the same owner has are unaffected.
- We reserve the right to disqualify entries violating DMCA (the existing attribution /
  public-sharing provenance gate is the first line) and vote fraud (bots, scripts,
  multiple accounts).
- Category leaderboards are visible on the Discover page for the whole contest, sorted by
  votes descending — enter early for more eyes. Ties in vote count are shuffled per page
  load so new entries also get seen.

## Data model

- `contest_entries` (migration `20260725130000_binder_contest.sql`): one row per entered
  binder — `binder_id` (PK → binders), `owner_id`, `contest` (slug, `first-annual-2026`),
  `category` (checked against the six slugs), `created_at`. RLS: owners insert/delete their
  own entries (INSERT gated on owning the binder AND the binder having ≤16 PUBLIC pages,
  `20260725150000_contest_public_page_cap.sql`; NO update policy — the category is final,
  `20260725140000_contest_no_category_switch.sql`); reads are public for entries whose
  binder passes the public gate (or your own).
- `contest_finalists` (migration `20260903120000_contest_stage_two.sql`): the frozen field, one
  row per finalist — `(contest, binder_id)` PK, `category`, `owner_id`, `seed` (round-1 place,
  unique per category), `stage1_votes`, `votes_open_at` / `votes_close_at` (the stage-2 window,
  stamped from `src/data/contest.ts` by the snapshot script) and `locked`. Public read, NO client
  write policies — the field is declared by us, exactly like `contest_winners`.
- `contest_finals_votes` (same migration): the stage-2 ballot. `(binder_id, voter_id)` PK, so one
  vote per account per finalist. Insert is gated on the binder being a locked-in finalist, on
  `now()` falling inside that row's window, on a real (non-anonymous) account, and on not being
  your own binder. Delete (taking a vote back) works until `votes_close_at` and not after: a
  result that can still be edited afterwards is not a result.
- `contest_lock_guard()` + three triggers (same migration): the edit lock, on `binders` (UPDATE)
  and `binder_pages` / `binder_slots` (INSERT, UPDATE, DELETE). SECURITY DEFINER; the service role
  passes through (`auth.uid()` is null) so the snapshot, prize fulfilment and manual repair can
  still touch a locked binder.
- RPC `contest_finals_leaderboard(p_contest, p_category, p_limit)`: finalists ranked by stage-2
  votes, ties falling back to `seed`. Same visibility gate as `contest_leaderboard`; returns
  `vote_count` rather than `like_count` because they are different numbers.
- `contest_winners` (Hall of Fame): written by us post-contest (service role / manual SQL —
  no client write policies), read by everyone. `contest`, `category`, `place`, `binder_id`,
  `owner_id`. The /contest page renders a Hall of Fame section once rows exist; winning
  binders stay enshrined ("Winner — First Annual Michi Binder Contest").
- RPC `contest_leaderboard(p_contest, p_category default null, p_limit)`: SECURITY DEFINER,
  entries joined to binders/profiles under the standard public gate, ranked by ALL-TIME like
  count; `p_category = null` returns every entry (unused by the UI since Community's Choice
  was cut, but handy for admin queries). Same `(binder_id, like_count, author_name, category)`
  hydration contract as `featured_binders`.

## Client surfaces

- `src/data/contest.ts` — the ONE place for contest id, entry deadline / end date, category
  labels + blurbs, and the prize table (drives /contest and the entry UI).
- `src/data/contestRepo.ts` — `enterContest`, `withdrawEntry`, `fetchMyEntries`,
  `fetchContestLeaderboard(category|null)` (hydrated `DemoBinder`s, vote-tie shuffle),
  `fetchContestWinners`.
- ShareSheet — a Contest section on public binders: category chips, Enter/Withdraw, the
  public-page-cap guard message, link to /contest. The page-visibility chips also refuse to
  flip a page public past the cap on an ENTERED binder (toast via the host screen).
- Discover — a Contest strip above search through BOTH rounds: category chips → a vote-ranked
  grid. In the Final the chips list finalists, the shelf above becomes "The Final", and every
  tile carries `FinalsVoteButton` instead of a heart count. Vote state is held by the page (not
  per tile) so the same binder on two shelves agrees with itself.
- Binder editor — `ContestLockBanner` says why editing is gone for a locked finalist, and
  `canEdit` / `editing` in BinderScreen both fall to false on the lock. The trigger is the
  enforcement; this is the explanation.
- `/contest` — marketing + official rules page (prize table, dates, how to enter,
  eligibility, disqualification, sponsor line), Hall of Fame section when winners exist.
- Binder viewer — a contest entry shows at most its first 16 public pages (with a note) to
  everyone but the owner.

## Testing

- `npm test` → `src/data/contest.test.ts` pins the prize table (exactly ONE lifetime, six
  categories, 10 slots each, every 1st is a VIP year), the phase gate, and the copy rules.
- `supabase/tests/contest_rls_test.sql` exercises the real policies against a live database
  and is NON-DESTRUCTIVE: it runs inside a DO block ending in `RAISE EXCEPTION`, so the whole
  transaction rolls back and the results arrive as the error message. Every line should read
  [PASS]. Covers: the public-page cap at entry, the final-category lock, contest_winners being
  server-write-only, non-owner enter/withdraw, entry visibility, voting, and the leaderboard
  (vote count, category isolation, privacy drop-off). Re-run it before announcing.
- Not covered by either: the UI flow itself (chips, toasts, Discover boards). Walk that
  through by hand, or drive it with the Playwright harness (`scripts/screenshots.mjs`).

## Running the two rounds

1. **Before the cutoff** (any time; ship the app first): apply the schema.

   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\apply-contest-stage2.ps1"
   ```

   Adds the tables, triggers and RPC. Nothing visible changes: with no finalist rows the lock
   triggers never fire and the app stays in round 1. Safe to re-run.

2. **At `finalsOpenAt`**: freeze the field.

   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\apply-contest-stage2.ps1" -Snapshot
   ```

   Ranks the eligible entries by round-1 likes, writes the top 10 of each category, prints the
   field, and notes any category with fewer than 10 eligible entries. The edit lock takes hold the
   instant those rows land. It refuses to run over an existing field; re-cut with `-Snapshot
   -Force`, which clears the previous finalists **and every stage-2 vote cast for them**.

   Order matters: deploy the app BEFORE snapshotting. Locking binders whose owners are looking at
   a build that cannot explain why is the one sequencing mistake here that reaches users.

3. **The app flips itself.** `contestPhase()` reads the clock, so `/contest`, Discover and the
   entry section move to the Final at `finalsOpenAt` with no deploy. If the phase is `finals` and
   no snapshot has been taken, the boards are simply empty — which is the visible symptom of
   step 2 not having been run.

4. **After `endsAt`**: the Final's counts are the result. Take the winners from
   `contest_finals_leaderboard`, then follow prize fulfilment below. Finalists stay locked until
   you clear `locked` (`update public.contest_finalists set locked = false where contest = '…'`).

## Prize fulfillment (post-contest runbook)

Manual SQL grants to the shared `entitlements` ledger (see docs/PAYMENTS.md "manual grant"):
- LIFETIME VIP: `insert into entitlements (user_id, product, expires_at, source) values
  (<uid>, 'tier_vip', null, 'contest-first-annual')` — `expires_at null` = lifetime.
- 1 Year VIP/PRO: same with `expires_at = now() + interval '1 year'` (product `tier_vip` /
  `tier_pro`). 3 Months / 1 Month analogously.
- Then insert `contest_winners` rows (contest, category, place, binder_id, owner_id) —
  the Hall of Fame renders from them.
- Announce + flip `src/data/contest.ts` phase to `ended`.
