# tcgscan under michi-maker — subdomain feasibility + build-out

## Goal

Let users manage their portfolios (scanning lives in the tcgscan app) without "going to
another website": bring the tcgscan experience under the michi-maker domain, e.g.
**scan.michi-maker.com** or **portfolio.michi-maker.com**, with a session that carries over.

## Why this is very feasible (context a fresh session needs)

The hard part is ALREADY DONE — the two apps share one identity and one user-data backend:

- Supabase project `piikwvntldytjejxmcla` (michi's) is the canonical auth + user data for
  BOTH apps. tcgscan-app's tables (`saved_cards`, `collections`, `portfolio_entries`) live
  there; the `user_cards` rollup is trigger-maintained from `portfolio_entries`.
- Card ids are unified (TCGPlayer product ids) — the contract is in `docs/TCGSCAN-PORTFOLIO.md`.
- tcgscan-app is a sibling repo (`../tcgscan-app`, also Expo; its web deploy currently
  targets idontgitit.com — check its repo for current state; it is owned by other sessions,
  so coordinate rather than editing it unilaterally).

So "subdomain" is a deployment + session-handoff problem, not a data problem.

## Options

### Option A — subdomain deploy + session handoff (recommended first step)

Deploy tcgscan-app's web build as its own Vercel project on `scan.michi-maker.com` (one DNS
CNAME + Vercel domain assignment; michi's DNS is already on the domain).

The one real technical hurdle: **Supabase sessions live in localStorage, which does NOT
cross subdomains.** Two workable solutions:

1. **Cookie storage on the parent domain**: configure BOTH apps' supabase-js clients with a
   custom `auth.storage` adapter that persists the session in a cookie scoped to
   `.michi-maker.com` (Secure; SameSite=Lax). Sign in on either → signed in on both.
   Watch: cookie size (Supabase sessions fit, ~2-4KB), and native apps keep AsyncStorage
   (storage adapter is per-platform).
2. **Explicit handoff route**: link from michi → `scan.michi-maker.com/#access=…&refresh=…`
   (tokens in the URL FRAGMENT, never query), receiving page calls
   `supabase.auth.setSession()` and strips the fragment. Simpler to ship, slightly clunkier
   (each hop re-hands-off).

Start with (2) to prove the flow, upgrade to (1) for seamlessness.

Also required: add `https://scan.michi-maker.com` to Supabase Auth → URL Configuration
redirect allowlist (dashboard task — the owner does this; same place as the pending
idontgitit.com entry noted in `docs/TCGSCAN-PORTFOLIO.md`).

### Option B — embed portfolio management INTO michi (no second app)

Michi already READS `collections`/`portfolio_entries` (Portfolios view in My Collection)
and WRITES them via CSV import (`src/data/csvImport.ts`). Extending michi with portfolio
CRUD (rename/delete collections, adjust quantities, move cards between portfolios) gives
"users control over their portfolios" with zero cross-domain work — the scanner app remains
the capture device.

⚠️ Deliberate prior decision to respect: a full inventory UI in michi was intentionally
deferred ("inventory UI deliberately NOT shipped yet") to keep michi curation-first. B is
therefore a scoped portfolio manager, not a tcgscan clone. Also ⚠️: `user_cards` is
trigger-maintained — never write it directly from the client; mutate `portfolio_entries`.

### Recommendation

Do **both, in this order**: B's scoped portfolio editing covers the everyday "fix my
portfolio without leaving michi" need cheaply; A gives the full scanner experience a home
under the brand when the owner wants one URL family. A's session handoff work is also a
prerequisite for any future deeper merge.

## Build-out sketch (Option A)

1. Coordinate with the tcgscan-app session/owner: agree the subdomain, get its web build
   deploying on Vercel.
2. DNS: CNAME `scan` → Vercel; assign domain in the tcgscan Vercel project.
3. Handoff route in tcgscan-app web (`/#access=`) + a "Manage portfolio ↗" link in michi's
   My Collection header that mints the fragment from the current session.
4. Supabase dashboard: add redirect URL (owner).
5. Later: shared cookie storage adapter in both apps' supabase clients.
6. Cross-links back: tcgscan → "Open in michi-maker" on cards/portfolios.

## Verify

Sign in on michi-maker.com → follow the handoff link → assert the same user id in the
subdomain app (Playwright can read `supabase.auth.getUser()` via page.evaluate). Then the
reverse direction. Confirm sign-OUT behavior on both (decide: shared sign-out or per-app).
