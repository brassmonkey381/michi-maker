# Open Graph link previews

michi-maker ships as a client-rendered SPA (`app.json` → `web.output: "single"`), so
meta tags injected by JavaScript never reach link-unfurling crawlers (Discord, iMessage,
X/Twitter, Slack, Facebook, Reddit, Telegram, …) — they don't run JS. To get real
previews for shared links we route **only crawler user-agents** to small serverless
functions that return an HTML document whose `<head>` carries the Open Graph / Twitter
tags. Humans keep hitting the untouched SPA.

## How it fits together

- **`vercel.json` rewrites** — for `/binder/:id`, `/u/:id`, and `/michi-method`, a
  `has` condition matches a known crawler user-agent and rewrites to the matching
  function. Search engines (Googlebot/bingbot) are deliberately **not** matched: they
  render JS and should index the full SPA, not the stub. Any unmatched agent falls
  through to the SPA catch-all, so the worst case is simply "no rich preview".
- **`api/og-binder.js`** — reads the public binder via Supabase REST (publishable key,
  RLS-gated to public rows) and previews its title, description, and a **composed image
  of its fullest page** (see `og-image-binder.js`).
- **`api/og-image-binder.js`** — an Edge function (`@vercel/og` / Satori) that renders
  the binder as a 1200×630 image: an **open two-page spread** (the two fullest pages, with
  a ringed spine) when the binder has 2+ card pages, else a single page. No text → no font
  dependency. **Card art** comes from the lite `images.json` manifest (the hosted buckets
  key images by content hash, so a URL is not constructible from a card id); it resolves the
  `image` field, the full-size **JPEG** — Satori rasterises JPEG/PNG but not WebP, and the
  245/640 thumb tiers are WebP. On any error (or no resolvable art) it redirects to the
  cover image, so a share always has something.
- **`api/og-profile.js`** — previews a public profile's `@username` with their avatar,
  or the cover of their first public binder.
- **`api/og-michi.js`** — static preview for the Michi Method page.
- **`api/_lib.js`** — shared helpers (the underscore keeps it a private module, not a
  route). Reads `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and
  `EXPO_PUBLIC_CATALOG_IMG_BASE` at runtime — the same values the client bundle uses,
  already present in the Vercel project, so there's nothing new to configure.

The functions are plain `.js` (CommonJS) so they stay outside the Expo `tsc`/lint build.

## Testing a preview

Force a crawler user-agent against the deployed site:

```bash
curl -A 'Discordbot/2.0' https://michi-maker.com/binder/<id>
curl -A 'Twitterbot/1.0' https://michi-maker.com/u/<profile-id>
```

You should get the meta-only HTML. A normal browser user-agent returns the SPA. Or paste
a URL into a validator: opengraph.xyz, the Facebook Sharing Debugger, or Discord itself.

## Composed image — verify on deploy

The Satori render path is verified locally (it produces a valid 1200×630 PNG with no
font), but the Edge runtime + env + real image fetch can only be confirmed on Vercel.
After deploying, check a preview deploy:

```bash
curl -sI 'https://<preview>/api/og-image-binder?id=<public-binder-id>'   # → 200, content-type: image/png
```

Then paste `https://<preview>/binder/<id>` into opengraph.xyz or Discord. If the Edge
function ever fails to build/run, the safe revert is one line in `api/og-binder.js`:
point `image` back at the cover thumbnail instead of `/api/og-image-binder`.

## Follow-ups

- **Slot spans in the composed image.** `og-image-binder.js` lays out with flexbox (all
  Satori supports), so a spanned card (jumbo, folded art) shows only in its origin cell.
  Honouring `row_span`/`col_span` would need a spanning grid model.
- **Open two-page spread.** For binders with 2+ pages, rendering facing pages would fill
  the 1200-wide frame even better than a single centred page.
- **Branded static image for `/michi-method`.** Add `public/og/michi-method.png`
  (1200×630) and set it as the `image` in `api/og-michi.js`.
