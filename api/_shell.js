/**
 * THE APP SHELL, WITH A PAGE'S OWN HEAD ON IT.
 *
 * michi-maker's web build is one static HTML file (app.json `web.output: "single"`), and that
 * file carries the HOME page's title and description no matter which route was asked for. A
 * crawler that does not run JavaScript reads "michi-maker: build beautiful Pokémon card binders"
 * for every binder, guide, and explainer on the site, and even one that does (Google) has to queue
 * the page for rendering before it learns what the page is about.
 *
 * The functions that use this file serve the SAME shell to everyone — no user-agent branching, so
 * nothing here is cloaking — with the head swapped for the route's own: title, description,
 * canonical, Open Graph, and structured data, plus a plain-HTML body the app replaces the moment
 * it mounts. A crawler sees a finished page; a person sees exactly the app they saw before.
 *
 * WHERE THE SHELL COMES FROM. `dist/index.html` is bundled into the function with `includeFiles`
 * (vercel.json). If the file is missing for any reason the function falls back to fetching the
 * deployment's own root — the same bytes — and if that fails too, it serves a self-contained page
 * so a binder link is never a 500. Whatever happens, the shell is read once per instance.
 */
const fs = require('node:fs');
const path = require('node:path');

let shellPromise = null;

function readShellFromDisk() {
  const candidates = [
    path.join(process.cwd(), 'dist', 'index.html'),
    path.join(__dirname, '..', 'dist', 'index.html'),
  ];
  for (const p of candidates) {
    try {
      const html = fs.readFileSync(p, 'utf8');
      if (html.includes('id="root"')) return html;
    } catch {
      /* try the next */
    }
  }
  return null;
}

async function fetchShell(req) {
  try {
    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0];
    if (!host) return null;
    const res = await fetch(`${proto}://${host}/`, { headers: { 'user-agent': 'michi-shell/1' } });
    if (!res.ok) return null;
    const html = await res.text();
    return html.includes('id="root"') ? html : null;
  } catch {
    return null;
  }
}

/** The SPA shell as deployed, or null when it cannot be had. Cached for the life of the instance. */
function getShell(req) {
  if (!shellPromise) {
    shellPromise = (async () => {
      const disk = readShellFromDisk();
      if (disk) return disk;
      const fetched = await fetchShell(req);
      if (!fetched) shellPromise = null; // let the next request try again
      return fetched;
    })();
  }
  return shellPromise;
}

/**
 * Remove the shell's route-agnostic head tags — title, description, og:*, twitter:* — so the
 * page's own can be the only ones. Two og:title tags is worse than one wrong one: scrapers pick
 * whichever they meet first, and Google treats a duplicated description as noise.
 */
function stripDefaultHead(html) {
  return html
    .replace(/<title>[^<]*<\/title>\s*/i, '')
    .replace(/<meta\s+name="description"[^>]*>\s*/gi, '')
    .replace(/<meta\s+property="og:[^"]*"[^>]*>\s*/gi, '')
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>\s*/gi, '');
}

/**
 * The shell with `head` inserted before </head> and `body` inside #root. The body is what a
 * reader without JavaScript gets, and what every crawler indexes; React replaces it on mount, so
 * it should read as the page, not as a placeholder. Styles for it live in the fragment itself
 * (see `seoBodyStyle`), scoped under #seo so they cannot touch the app.
 */
function compose(shell, { head, body }) {
  let html = stripDefaultHead(shell);
  html = html.replace('</head>', `${head}\n  </head>`);
  if (body) {
    html = html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
    // The shell's "enable JavaScript" notice is wrong once the body IS the page without it.
    html = html.replace(/<noscript>[\s\S]*?<\/noscript>\s*/i, '');
  }
  return html;
}

/**
 * Quiet, readable styling for the pre-mount body: a centred column in the app's cream, so the
 * instant before the app paints is not a wall of unstyled text — and a page that never gets
 * JavaScript still looks made on purpose.
 *
 * HELD BACK A THIRD OF A SECOND. The body is painted the moment the HTML arrives and React
 * replaces it when the bundle lands, and on a normal connection that gap read as a flash of a
 * different site. The animation keeps it at zero opacity for 350ms, then fades it in: a fast load
 * mounts the app before it is ever seen; a slow one, or a browser without JavaScript, gets the page
 * a beat later. It is an opacity delay, not display:none — the content is visible at rest, which is
 * what keeps it ordinary indexable text rather than hidden text a search engine discounts.
 */
const seoBodyStyle = `<style>
#seo{max-width:760px;margin:0 auto;padding:32px 24px 64px;font:16px/1.5 "Segoe UI",system-ui,-apple-system,sans-serif;color:#2B2A27;background:#FBF8F1;overflow:auto;height:100%;box-sizing:border-box;width:100%;animation:seo-in .25s ease-out .35s both}
@keyframes seo-in{from{opacity:0}to{opacity:1}}
#seo h1{font-size:30px;line-height:1.2;margin:8px 0 12px}#seo h2{font-size:20px;margin:28px 0 8px}
#seo p{margin:0 0 12px}#seo ul,#seo ol{margin:0 0 12px 22px;padding:0}#seo li{margin:2px 0}
#seo a{color:#7A3FF2}#seo .k{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6B6459;font-weight:600}
#seo nav a{margin-right:14px}#seo .muted{color:#6B6459;font-size:14px}
</style>`;

module.exports = { getShell, compose, stripDefaultHead, seoBodyStyle };
