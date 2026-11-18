# Pages crawlers read (MIC-037)

What a search engine or AI crawler gets from michi-maker.com, and the one step a deploy needs.

## Before each deploy: refresh the set pages

The `/sets` planner pages print TCGplayer market prices from a committed snapshot, dated on every
page. Refresh it before each deploy (owner, 2026-11-15):

```powershell
node scripts/seo/refresh-set-pages.mjs
```

Then commit `scripts/seo/set-pages.json` and `api/_sets.json` and ship as usual. Nothing is printed
but file sizes and per-set counts; no key is used.

## How the pages are served

| URL | Served by | Body |
|---|---|---|
| `/` (no `mm_app` cookie: a first visit, every crawler) | `dist/home.html`: the landing (public/landing-v2) plus the gate, written by `scripts/build-home.mjs` | the landing, real HTML, no app bundle |
| `/` with the `mm_app` cookie | `dist/app.html` | the app |
| `/welcome`, `/home` | 308 to `/` | |
| `/landing-v2/` | the static file | the landing without the gate, canonical `/` |
| `/michi-method`, `/learn`, `/learn/<slug>` | `api/page-static.js` | the page's text, composed onto the shell |
| `/binder/<id>` | `api/page-binder.js` | title, pages, card list; noindex unless `api/_index.js` says indexable |
| `/sets`, `/sets/<slug>` | static files from `scripts/build-set-pages.mjs` | the set planner (no app bundle) |
| every other app route | `dist/app.html` | the app shell (loading splash) |
| anything else, `/llms.txt` included | `api/page-static.js?route=404` | the app shell with status 404 and noindex |

A person and a crawler always get the same bytes at the same URL. The only user-agent rewrites are
the social link-preview ones; `/` itself is decided by the `mm_app` cookie, never the user agent, and `src/data/seoShell.test.ts` fails if one ever matches a search or
AI crawler.

## The set pilot

26 sets (`PILOT` in `scripts/seo/snapshot-set-pages.mjs`): every main and special set of the Mega
Evolution and Scarlet & Violet eras, plus Base Set, Jungle, Fossil, Evolving Skies and Crown Zenith.
No more until Search Console has read these. Each page's "Start a <set> binder" opens
`/new-binder?kind=set&set=<id>`, the guest-friendly wizard, with the set picked.

## The front door (`/`)

`dist/index.html` does not exist after the build, so Vercel reaches the rewrites for `/`: with the
`mm_app` cookie it serves the app, otherwise the landing. The cookie is set by the app whenever
`shouldShowLanding()` is false (src/app/_layout.tsx), by the landing's own links into the app, and by
the gate (`api/_landingGate.js`), which runs first in the landing's head with the same TRI-007 rules
(auth returns, a stored member session, the seen flag, Reddit arrivals) and reloads once. If the
cookie will not stick, or it already reloaded in this tab, it goes to `/my-binders` instead, so it
cannot loop. Public app routes carry their canonical as a `Link` header (vercel.json).

Check before shipping, on a local build:

```powershell
node scripts/seo/preview-server.mjs 8110        # dist/ with vercel.json routing
$env:BASE="http://localhost:8110"; node scripts/seo/front-door-check.mjs
```
