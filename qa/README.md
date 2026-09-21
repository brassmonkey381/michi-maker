# QA rig

Automated quality assurance for **michi-maker.com** and **tcgscan.ai**, across account tiers.

## Run it

```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\rig.ps1"
```

That lints the check catalog, starts the console on <http://127.0.0.1:8099> and opens it. Pick an
app, a persona, an area and a target, read the write budget, press Run.

Headless, for a sweep or a pre-deploy check:

```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\rig-run.ps1" -Areas data -Personas guest,free
```

## Why it lives here

`michi-maker` already has `playwright-core`, `pixelmatch` and `pngjs` in devDependencies, and a dozen
working Playwright scripts in `scripts/`. Putting the rig here means no new install, no new git
remote, and no seventh repo to keep pinned. `qa/` is in `.vercelignore`, so none of it ships.

It tests **both** apps. That is deliberate: the two sites share one account, one entitlements ledger
and one browse bucket, so a suite that can only see one of them cannot check the thing that actually
breaks, which is the seam between them.

## The seven commands

| command | what it does |
| --- | --- |
| `node qa/rig.mjs doctor` | Are the targets up, which personas exist today, which secrets are readable |
| `node qa/rig.mjs lint` | Validate every check without opening a browser |
| `node qa/rig.mjs spec` | Regenerate `SPEC.md` and `spec.json`, the audit spec sheet |
| `node qa/rig.mjs run` | Headless run |
| `node qa/rig.mjs accounts` | What the rig has created, and how to sweep it |
| `node qa/cli-smoke.mjs` | Does every command above still run? `rig.ps1` runs it before starting |
| `node qa/rig.mjs diff <a> <b>` | Compare two runs |

## The safety contract

Billing is live and there is one shared production Supabase project behind both sites. The rig is
built on the assumption that it will one day be run carelessly.

1. **The rig cannot read the dangerous secrets.** `lib/secrets.mjs` allowlists three key names. There
   is no code path that returns `STRIPE_SECRET_KEY`, the service role, or the management token. A
   suite cannot get one by asking differently.
2. **The network airlock is installed before the first navigation, with no per-check opt-out.**
   Anything matching `stripe-checkout`, `checkout.stripe.com`, `billing.stripe.com`, `api.stripe.com`
   or the reclaim RPCs is aborted, and a request that *matched* ends the run with exit code 4.
3. **The DOM airlock refuses clicks by accessible name.** `ctx.click` resolves what the control says
   before clicking and refuses `Pay $…`, `Confirm and pay`, `Cancel subscription`, `Delete account`
   and `Start free … trial`. Layer 2 catches what layer 1 did not anticipate, and the reverse.
4. **Every check declares what it writes.** The console sums the selection into a write budget and
   renders it above the Run button as sentences, so a consequence is a decision rather than a
   discovery.
5. **The data project is read-only.** GET and HEAD on `bmhjizcmwtmcrstadqto`; anything else aborts.

A guard that fires is exit code 4 and a red banner, never an ordinary failed row. It means a check
tried to do something the rig forbids, which is a defect in the check, not in the product.

## Reading a report

Every check declares a plain-English `group`, and every report leads with one line per group rather
than one per check. Sixty-nine rows is a log; this is the report.

```
WHAT WAS TESTED

  FAIL    Sealed product images load               0/1   tcgplayer-cdn serves 109 of 3245 and 8/8 sampled failed
  PARTIAL THE THREE FREE BINDER PAGES              1/4   1 check held across free. 3 more not run (heavy: needs --heavy)
  ok      Pokemon card and sealed database         7/7   7 checks held across guest
  ok      Paid search unlocks for PRO and not before  3/3  3 checks held across free, guest, pro-trial
```

A group is `FAIL` if anything in it failed, `VOID` if something could not be measured, `PARTIAL` if
anything was skipped OR filtered out, and `ok` only when everything ran and held. **PARTIAL counts
checks the filters dropped**, so a group can never read as full coverage of something barely touched.

The same table opens `ledger.md` and the console's Report screen. Per-check detail is still there
underneath, for the rows that failed.

## Statuses

Seven, and only `PASS` is good news.

| status | means |
| --- | --- |
| `PASS` | asserted and held |
| `FAIL` | asserted and did not hold |
| `WAIVED` | failed, and matched an unexpired entry in `catalog/waivers.json` |
| `BLOCKED` | a click the DOM airlock refused |
| `SKIP` | deselected, or the persona was unavailable |
| `NA` | an `unreachable` expectation held: correctly not reachable at this tier |
| `VOID` | **could not measure.** Target down, login wall, tier never resolved |

`VOID` is never scored as a pass. "We could not take this measurement" and "this measurement failed"
are different facts, and the day they share a colour is the day the report stops being read.

## Personas

Three, all working, and all minted fresh each run.

| persona | what it is | what it costs |
| --- | --- | --- |
| `guest` | never signed in; the app mints its own anonymous session | one anonymous auth row per fresh context |
| `free` | a brand new account with no entitlement | one permanent auth row, prefixed `qa-rig-` |
| `pro-trial` | the same, with both apps' 3-day PRO trials started | that row plus two trial rows and two entitlements |

**`free` and `pro-trial` are one ladder, one step apart.** The only difference between those two runs
is the trial, so a behaviour that differs between them is caused by the trial and nothing else. That
is what makes a gate check meaningful: a lock nobody has seen open is not a tested gate.

**No service role needed.** The project has `disable_signup: false` and `mailer_autoconfirm: true`,
so `POST /auth/v1/signup` with the ordinary publishable key returns a usable session. The rig never
holds a key that bypasses RLS.

**The persona is verified, never assumed.** `resolve()` reads the account's real entitlement rows and
reports the tier it actually found. A persona that came back wrong skips its checks rather than
making a claim from the wrong account.

**No `pro` or `vip`** (owner call, 2026-09-21). A trial grants `tier_pro` and `tcgscan_pro`, the same
products a paid PRO holds, so every PRO feature gate resolves identically. What that leaves untested,
stated plainly: `interval`, `period_start` and `term_print_allocation` are null on a trial; the
cross-app bundle discount deliberately refuses a trial; and VIP-only features have no persona.

### Accounts pile up, and the rig cannot delete them

Removing an auth row needs the management token, which the secrets allowlist refuses. Every account
is appended to `qa/state/accounts.jsonl`:

```
node qa/rig.mjs accounts
```

Sweep them with michi's existing `scripts/_purge-test-accounts.mjs`, which already takes an email
prefix. Pass `['qa-rig-']`.

## Adding a check

Edit a file in `suites/`. A check is a plain object; `lint.mjs` refuses a malformed one before a
browser opens. Then run `node qa/rig.mjs spec` and commit the regenerated `SPEC.md`.

The fields that carry weight:

- **`id`** is stable forever, `<app>.<area>.<slug>`. It is the join key for run-to-run diffs, so a
  rename reads as GONE plus NEW and makes that week's diff a lie.
- **`proves`** is what the row protects, in words a reader at 2am can use. If a check fails and you
  cannot tell why it mattered, that field is the bug.
- **`expect`** is one line per persona. It renders as the tier columns in `SPEC.md`, so it is written
  for a reader rather than for the runner. The literal string `unreachable` is an expectation, not a
  skip: the check FAILS if the thing turns out to be reachable.
- **`danger`** feeds the write budget. Be honest.
- **`freshProfile`** is mandatory for anything reading `tcgscan.binderTaste.v1.*`. That counter is
  monotonic and device-local, so a reused profile starts every run at the wall.

### Test the command, not the module

`node qa/rig.mjs console` shipped broken because the console had only ever been started by running
`console.mjs` directly. The two files import each other, so going in through `rig.mjs` deadlocked on
a top-level await and Node reported it as a *warning*, which an exit-code check sails straight past.
`cli-smoke.mjs` now runs every advertised command and greps for that warning specifically. If you add
a command, add it there.

## What it deliberately does not do

- No payment is ever completed, in any mode. There is no Stripe test path in this product.
- No account is created or deleted. Teardown belongs with the persona engine in phase 2.
- Nothing is written to `tcgscan-data`.
- michi is never checked by HTTP status. Its Vercel catch-all answers 200 for every URL including
  ones that do not exist, so a status assertion there is a green light wired to nothing. `lint.mjs`
  refuses one statically.
