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
  RLS-gated to public rows) and previews its title, description, and cover card image
  (chosen cover → first placed card → first custom-art slot).
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

## Follow-ups

- **Composed page image (highest-impact).** The card images are portrait single cards.
  A `@vercel/og` (Satori) endpoint that composites the binder's best 3×3 page into a
  1200×630 image would make every shared binder unfurl as the *page* — far better share
  bait. Point `og:image` at that endpoint once built.
- **Branded static image for `/michi-method`.** Add `public/og/michi-method.png`
  (1200×630) and set it as the `image` in `api/og-michi.js`.
- **Per-page previews.** `/binder/:id` currently previews the binder's cover; a
  `?page=N` variant could preview a specific page when that deep link exists.
