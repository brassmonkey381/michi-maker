# Phone crawl

Walks the whole site on the most common phone shape (390 by 844, touch), taps everything a thumb can
tap, judges every screen and every response, and writes a report with a screenshot per finding and
a triage-studio draft per new finding. Built 2026-10-30 at the owner's request; **never scheduled**,
by the same request. Run it by hand when the machine is idle.

## Run it

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\scripts\crawl-phone.ps1"
```

That starts a dev server on :8090 if none is up (and stops it after), crawls as a guest with a
budget of 300 taps, and prints the report path. Options:

| flag | what |
| --- | --- |
| `-Persona free` | a fresh free account (the rig creates a `qa-rig-` account; see `qa/lib/personas.mjs`) |
| `-Budget 150` | fewer taps, a shorter run |
| `-Scenario seeded` | the Reddit ad arrival and its editor only |
| `-Routes /welcome,/my-binders` | named routes only |
| `-FileItems` | also file the new findings in triage-studio as `inbox` items with real ids |

Without `-FileItems` the drafts stay in the run folder under `items/`.

## What it catches

Each rule is a question a thumb would ask. They catch clipped, covered, orphaned, dead, slow and
wrong-tier; they do not judge taste, which is why the report leads with screenshots.

| rule | P | the question |
| --- | --- | --- |
| control-covered | P2 | Is a toast, banner or chip parked over a control a thumb would aim at? (sheets and dialogs are exempt) |
| orphaned-row | P2 | Does a wrapping row leave one thing alone on a row of its own? |
| sideways-bar | P2 | Does a row of chips or tools scroll sideways? (carousels of cards are exempt) |
| page-scrolls-sideways | P2 | Is the page wider than the phone? |
| control-off-screen | P2 | Does a control run past the phone's edge? |
| controls-overlap | P2 | Do two controls share more than half a box? |
| no-response | P2 | Did a tap change nothing: no text, no URL, no toggle state, no request, within 3 s? |
| console-error | P2 | Did the tap log an error? |
| pro-shown-to-guest | P2 | Is the word PRO on a guest's screen? |
| wall-without-button | P2 | Is a "create an account" toast missing its button? |
| slow-response | P3 | Did the first visible change take over 2 s? |
| small-target | P3 | Are buttons under 24px? (one finding per screen, worst first) |
| clipped-text | P3 | Is text cut off without an ellipsis? |
| tiny-text | P3 | Is visible text under 11px? |
| em-dash | P3 | Is an em-dash on screen? |

Element rules report once per screen, keyed on the first offender, so forty dots are one row.

## What it never does

- Taps anything named delete, remove, sign out, pay, buy, checkout, subscribe, cancel, upgrade,
  trial, purchase, report, print, download, share, or a provider sign-in (`NEVER_TAP` in rules.mjs).
- Follows an external link.
- Reaches a payment or ledger write: the rig's network airlock (`qa/lib/guard.mjs`) is installed on
  the context and a trip voids the run (exit 4).

It does write what a guest can write on the production project: a guest binder, analytics rows.
analytics-studio filters the rig's traffic.

## Output

`qa/crawl/out/<run>/report.md`, `findings.json`, numbered screenshots, `console-errors.json`, and
`items/` with one draft per new finding. `qa/crawl/known.json` remembers every finding ever reported
(route, rule, first offender), so a rerun only drafts what is new. Delete a line there to make the
crawler report it again.

## Tuning

A rule that cries wolf gets ignored, so every rule has an exemption written beside it in
`rules.mjs`. When a finding is wrong, fix the rule, not the report.
