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
| `/`, `/welcome` | `dist/index.html`, composed at build time by `scripts/build-home.mjs` | home text (api/page-static.js `homePage`) |
| `/michi-method`, `/learn`, `/learn/<slug>` | `api/page-static.js` | the page's text, composed onto the shell |
| `/binder/<id>` | `api/page-binder.js` | title, pages, card list; noindex unless `api/_index.js` says indexable |
| `/sets`, `/sets/<slug>` | static files from `scripts/build-set-pages.mjs` | the set planner (no app bundle) |
| every other app route | `dist/app.html` | the app shell (loading splash) |
| anything else, `/llms.txt` included | `api/page-static.js?route=404` | the app shell with status 404 and noindex |

A person and a crawler always get the same bytes at the same URL. The only user-agent rewrites are
the social link-preview ones, and `src/data/seoShell.test.ts` fails if one ever matches a search or
AI crawler.

## The set pilot

26 sets (`PILOT` in `scripts/seo/snapshot-set-pages.mjs`): every main and special set of the Mega
Evolution and Scarlet & Violet eras, plus Base Set, Jungle, Fossil, Evolving Skies and Crown Zenith.
No more until Search Console has read these. Each page's "Start a <set> binder" opens
`/new-binder?kind=set&set=<id>`, the guest-friendly wizard, with the set picked.
