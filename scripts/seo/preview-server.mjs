/**
 * LOCAL PREVIEW OF THE DEPLOYED ROUTING (MIC-037). Serves `dist/` the way vercel.json does, so the SEO
 * and front-door checks can run before a deploy:
 *
 *   redirects (host conditions read from the Host header, or `?__host=` for a local www test)
 *   -> the filesystem (cleanUrls: /x -> x.html, /dir -> dir/index.html)
 *   -> rewrites in order, with `has` on cookie / header / host / query
 *      (/api/<name> runs api/<name>.js with the query; external proxies answer 502 here)
 *   -> 404.
 * `headers` entries are applied to every response they match (X-Robots-Tag, caching).
 *
 * Usage: node scripts/seo/preview-server.mjs [port=8110]   (after the buildCommand steps)
 * The page functions read the live Supabase data read-only, as they do in production.
 */
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.argv[2] || 8110);
const require = createRequire(import.meta.url);
// The page functions read EXPO_PUBLIC_* (public values only) from the environment, as on Vercel.
for (const line of (fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split(/\r?\n/)) {
  const m = /^(EXPO_PUBLIC_[A-Z0-9_]+)=(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const V = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.ttf': 'font/ttf',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.txt': 'text/plain', '.xml': 'application/xml',
};

/** Vercel source -> { re, names } (named params, `:p*`, and plain regex groups). */
function compile(source) {
  const names = [];
  let re = '';
  for (let i = 0; i < source.length;) {
    const m = /^:([a-zA-Z_]\w*)(\*)?/.exec(source.slice(i));
    if (m) {
      names.push(m[1]);
      re += m[2] ? '(.*)' : '([^/]+)';
      i += m[0].length;
    } else if (source[i] === '(') {
      let depth = 0, j = i;
      for (; j < source.length; j += 1) { if (source[j] === '(') depth += 1; if (source[j] === ')' && --depth === 0) break; }
      names.push(String(names.length + 1));
      re += source.slice(i, j + 1);
      i = j + 1;
    } else {
      re += source[i].replace(/[.+?^${}|[\]\\]/g, '\\$&');
      i += 1;
    }
  }
  return { re: new RegExp(`^${re}$`), names };
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k] = v.join('=');
  }
  return out;
}

function hasOk(rule, req, url, host) {
  const check = (h) => {
    let got;
    if (h.type === 'host') got = host;
    else if (h.type === 'cookie') got = cookies(req)[h.key];
    else if (h.type === 'header') got = req.headers[String(h.key).toLowerCase()];
    else if (h.type === 'query') got = url.searchParams.get(h.key) ?? undefined;
    if (got === undefined || got === null) return false;
    return h.value === undefined ? true : new RegExp(`^${h.value}$`).test(String(got));
  };
  return (rule.has || []).every(check) && !(rule.missing || []).some(check);
}

function match(rule, p, req, url, host) {
  const { re, names } = compile(rule.source);
  const m = re.exec(p);
  if (!m || !hasOk(rule, req, url, host)) return null;
  const params = {};
  names.forEach((n, i) => { params[n] = m[i + 1] ?? ''; });
  return params;
}

const fill = (dest, params) => dest.replace(/:([a-zA-Z_]\w*)\*?|\$(\d+)/g, (_, n, d) => params[n ?? d] ?? '');

function fileFor(p) {
  const tries = [p, `${p}.html`, path.posix.join(p, 'index.html')];
  for (const t of tries) {
    const f = path.join(DIST, decodeURIComponent(t));
    if (!f.startsWith(DIST)) continue;
    try { if (fs.statSync(f).isFile()) return f; } catch { /* next */ }
  }
  return null;
}

function headersFor(p, req, url, host) {
  const out = {};
  for (const h of V.headers || []) if (match(h, p, req, url, host)) for (const kv of h.headers) out[kv.key] = kv.value;
  return out;
}

function sendFile(res, f, extra, status = 200) {
  res.writeHead(status, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'public, max-age=0, must-revalidate', ...extra });
  fs.createReadStream(f).pipe(res);
}

async function runApi(name, query, req, res, extra) {
  const file = path.join(ROOT, 'api', `${name}.js`);
  if (!fs.existsSync(file)) { res.writeHead(404, extra); return res.end('no such function'); }
  const handler = require(file);
  req.query = Object.fromEntries(query);
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  await (handler.default || handler)(req, res);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const host = url.searchParams.get('__host') || String(req.headers.host || '').replace(/:\d+$/, '');
    const p = url.pathname;
    for (const r of V.redirects || []) {
      const params = match(r, p, req, url, host);
      if (!params) continue;
      let to = fill(r.destination, params);
      const q = new URLSearchParams(url.search); q.delete('__host');
      if (q.toString()) to += (to.includes('?') ? '&' : '?') + q.toString();
      res.writeHead(r.permanent ? 308 : 307, { location: to });
      return res.end();
    }
    const extra = headersFor(p, req, url, host);
    const direct = fileFor(p);
    if (direct && p !== '/') return sendFile(res, direct, extra);
    for (const r of V.rewrites || []) {
      const params = match(r, p, req, url, host);
      if (!params) continue;
      const dest = fill(r.destination, params);
      if (/^https?:/.test(dest)) { res.writeHead(502, extra); return res.end('external proxy not emulated'); }
      const d = new URL(dest, 'http://localhost');
      if (d.pathname.startsWith('/api/')) {
        const q = new URLSearchParams(url.search);
        d.searchParams.forEach((v, k) => q.set(k, v));
        return await runApi(d.pathname.slice(5), q, req, res, extra);
      }
      const f = fileFor(d.pathname);
      if (f) return sendFile(res, f, extra);
    }
    if (direct) return sendFile(res, direct, extra);
    res.writeHead(404, { 'content-type': 'text/plain', ...extra });
    res.end('404');
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(String(e && e.stack || e));
  }
}).listen(PORT, () => console.log(`preview of dist/ with vercel.json routing on http://localhost:${PORT}`));
