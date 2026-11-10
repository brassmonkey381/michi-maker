# Dev mode and feature flags (MIC-017)

Redesign pieces ship to production hidden. Only a browser in **dev mode** sees them, until the owner
says "make <piece> live". Decided by the owner on 2026-11-09.

## Using it

- `?dev=1` on any michi-maker.com address turns dev mode on. The browser remembers it across pages
  and reloads (localStorage `michi.dev`).
- `?dev=0`, or tapping the orange **DEV** pill at the top of the screen, turns it off.
- Native apps are always off; they have no address bar.

## Gating a piece

1. Add a line to `FLAGS` in `src/lib/flags.ts`: `'results-binder': 'dev',`
2. Gate the UI with `flag('results-binder')`. The old UI stays the `else` branch until the piece goes live.
3. "Make results-binder live": change `'dev'` to `'live'` and ship. When it has been live a while,
   delete the flag and the old branch.

States: `'off'` hidden from everyone, `'dev'` dev mode only, `'live'` everyone.

## HARD RULE: a flag hides UI only

A migration, edge function or API change reaches **everyone** the moment it ships, flag or not.
So any database or API change under a flagged piece must be additive and backwards-compatible:
new columns nullable or defaulted, no renames or drops, no changed meaning for existing values,
and the current UI must keep working against it. If a piece needs one, say so in its item.

## Analytics and ads

While dev mode is on:
- every analytics event carries `dev: true` (session.start included), so analytics-studio leaves
  it out of the funnel the same way it leaves out `utm_medium=qa` walks;
- the Reddit pixel never loads and no Reddit conversion (pixel or server-side) is sent.

Dev testing on a real account still makes real data (binders, slots). That is expected.

## QA

Each flagged piece is checked headless against a production build twice: with `?dev=1` (the piece
shows, the DEV pill shows) and without (the page is unchanged for everyone).
