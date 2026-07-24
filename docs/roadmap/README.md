# Roadmap docs — handoffs for future Claude sessions

Each doc here briefs a fresh session on ONE initiative: the goal, the context you won't have,
decisions already made (don't re-litigate them), suggested approach, and how to verify.

Read `AGENTS.md` first (repo conventions), then the doc for your initiative. Standing rules
that apply to all of them:

- **Verify at the surface.** UI changes are verified by driving the running app (Playwright +
  msedge — see `scripts/screenshots.mjs` for the harness pattern) and by `npx tsc --noEmit` +
  `npm run lint`. There is also a small unit suite for pure data logic (`npm test` —
  `node --test` over `src/**/*.test.ts`: tiers, proration, print windows, plan CTAs).
- **Commit AND push finished work to main** (owner's standing preference), except giant
  new-project work which gets a branch.
- The browse kit (`tcgscan-browse`) is a sibling repo installed from GitHub — kit changes are
  a separate commit/push there, then `npm install github:brassmonkey381/tcgscan-browse` here.
- Supabase project `piikwvntldytjejxmcla` is the app backend (users, binders, entitlements);
  `bmhjizcmwtmcrstadqto` (tcgscan-data) is public-read catalog ONLY — never user data.

| Doc | Initiative | Status |
| --- | --- | --- |
| [UI-REDESIGN.md](UI-REDESIGN.md) | Beautify the app; rework Slice Studio UX | open |
| [MONETIZATION-TIERS.md](MONETIZATION-TIERS.md) | Free / PRO / VIP tiers, subscriptions, print gating | **SHIPPED & LIVE** — current system is `docs/PAYMENTS.md` / `docs/GO-LIVE-BILLING.md` |
| [LANDING-PAGE.md](LANDING-PAGE.md) | Feature-showcase landing page | shipped (`src/app/welcome.tsx`) |
| [TCGSCAN-SUBDOMAIN.md](TCGSCAN-SUBDOMAIN.md) | Bring tcgscan under a michi-maker subdomain | open |
| [REFACTOR.md](REFACTOR.md) | Codebase simplification | ongoing |
| [ART-RIGHTS.md](ART-RIGHTS.md) | Art rights & copyright risk brief | risk brief, non-blocking |

Suggested order for what remains: REFACTOR light passes can happen anytime; UI-REDESIGN
feeds the landing page's screenshots; TCGSCAN-SUBDOMAIN is independent.
