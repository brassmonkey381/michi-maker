# Roadmap docs — handoffs for future Claude sessions

Each doc here briefs a fresh session on ONE initiative: the goal, the context you won't have,
decisions already made (don't re-litigate them), suggested approach, and how to verify.

Read `AGENTS.md` first (repo conventions), then the doc for your initiative. Standing rules
that apply to all of them:

- **Verify at the surface.** This repo has no test suite; changes are verified by driving the
  running app (Playwright + msedge — see `scripts/screenshots.mjs` for the harness pattern)
  and by `npx tsc --noEmit` + `npm run lint`.
- **Commit AND push finished work to main** (owner's standing preference), except giant
  new-project work which gets a branch.
- The browse kit (`tcgscan-browse`) is a sibling repo installed from GitHub — kit changes are
  a separate commit/push there, then `npm install github:brassmonkey381/tcgscan-browse` here.
- Supabase project `piikwvntldytjejxmcla` is the app backend (users, binders, entitlements);
  `bmhjizcmwtmcrstadqto` (tcgscan-data) is public-read catalog ONLY — never user data.

| Doc | Initiative |
| --- | --- |
| [UI-REDESIGN.md](UI-REDESIGN.md) | Beautify the app; rework Slice Studio UX |
| [MONETIZATION-TIERS.md](MONETIZATION-TIERS.md) | Free / PRO / VIP tiers, subscriptions, print gating |
| [LANDING-PAGE.md](LANDING-PAGE.md) | Feature-showcase landing page |
| [TCGSCAN-SUBDOMAIN.md](TCGSCAN-SUBDOMAIN.md) | Bring tcgscan under a michi-maker subdomain |
| [REFACTOR.md](REFACTOR.md) | Codebase simplification |

Suggested order: REFACTOR light passes can happen anytime; MONETIZATION-TIERS before
LANDING-PAGE (the landing page sells the tiers); UI-REDESIGN before LANDING-PAGE (screenshots
of the new look belong on it); TCGSCAN-SUBDOMAIN is independent.
