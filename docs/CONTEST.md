# First Annual Michi Binder Contest

The community binder contest: enter a public binder into one category, votes (binder likes)
decide the winners, prizes are subscription grants. This doc is the spec + runbook; the
user-facing rules live at `/contest` (src/app/contest.tsx), and all tunables (dates, category
copy, prize table) live in `src/data/contest.ts`.

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
- Winners are determined purely by most votes (binder likes) at the contest end time.
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
- Discover — a Contest strip above search while the contest runs: category chips →
  vote-ranked grid of entries.
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

## Prize fulfillment (post-contest runbook)

Manual SQL grants to the shared `entitlements` ledger (see docs/PAYMENTS.md "manual grant"):
- LIFETIME VIP: `insert into entitlements (user_id, product, expires_at, source) values
  (<uid>, 'tier_vip', null, 'contest-first-annual')` — `expires_at null` = lifetime.
- 1 Year VIP/PRO: same with `expires_at = now() + interval '1 year'` (product `tier_vip` /
  `tier_pro`). 3 Months / 1 Month analogously.
- Then insert `contest_winners` rows (contest, category, place, binder_id, owner_id) —
  the Hall of Fame renders from them.
- Announce + flip `src/data/contest.ts` phase to `ended`.
