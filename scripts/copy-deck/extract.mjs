// Copy deck, step 1: every piece of on-screen text in michi-maker (and the browse kit it ships),
// grouped by the page it shows on, marked Phone, Desktop or both, written to a catalog the copy
// editor page reads. The owner edits text there; scripts/copy-deck/apply.mjs writes the edits
// back into the source. Adapted from tcgscan-app/scripts/copy-deck/extract.mjs (2026-11-05).
//
//   node scripts/copy-deck/extract.mjs [out.json] [slim.json]
//
// MICHI SHIPS WEB ONLY, so "Phone" here means a NARROW SCREEN, not a native build: the branches
// the code takes behind `phone`, `narrow`, `compact` (width < Breakpoints.phone and the like).
// `Platform.OS === 'web'` is always true here, so its other branch is dropped as unreachable.
// The catalog keeps the kit's internal keys ('phone' | 'web' | 'both'); 'web' reads as Desktop.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative, dirname, basename, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import ts from 'typescript';

const APP = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const OUT = process.argv[2] ?? join(process.env.TEMP ?? '/tmp', 'michi-copy-deck.json');
const SLIM = process.argv[3] ?? null;

const REPOS = [
  { repo: 'app', root: APP, dirs: ['src'] },
  // The kit's strings are listed so the owner sees them; apply.mjs refuses them (they change in
  // the tcgscan-browse repo and arrive with a re-pin, see AGENTS.md).
  { repo: 'tcgscan-browse', root: join(APP, 'node_modules', 'tcgscan-browse'), dirs: ['src'] },
].filter((r) => existsSync(join(r.root, r.dirs[0])));

// Routes that are the owner's tools, not pages people see.
const DEV_ROUTES = /^(studio|_sitemap|\+html)$/;
// Files whose text never reaches a person (owner studios, analytics plumbing, dev diagnostics).
const DEV_FILES = /(^src\/data\/(changelog|storyThemes|artTemplates|collectorBinders|themeBackgrounds|placeholderPdf|arrange|seedPages|labelLinks|studioOps|puzzles?\w*)\.ts$|^src\/components\/analytics\/|RouteTracker|SliceStudio|StudioControls|studioOps|SimilarityModelPicker|^src\/lib\/analytics\.ts$|^src\/lib\/env\.ts$|\.test\.tsx?$)/;

const PAGES = [
  ['home', 'Home', /^index$/],
  ['welcome', 'Landing (welcome)', /^welcome$/],
  ['new-binder', 'New binder wizard', /^new-binder$/],
  ['binder', 'Binder editor', /^binder\/\[id\]$/],
  ['my-binders', 'My binders', /^my-binders$/],
  ['browse', 'Browse', /^browse$/],
  ['discover', 'Discover', /^discover$/],
  ['collect', 'Collect', /^collect$/],
  ['wishlist', 'Wishlist', /^wishlist$/],
  ['daily', 'Daily puzzle', /^daily$/],
  ['contest', 'Contest', /^contest(-binders)?$/],
  ['coverage', 'Coverage', /^coverage$/],
  ['profile', 'Profile', /^u\/\[id\]$/],
  ['plans', 'Plans & billing', /^(plans|pricing|subscriptions|purchases)$/],
  ['learn', 'Learn', /^learn\//],
  ['method', 'Michi method', /^michi-method$/],
  ['search-guide', 'Search guide', /^search-guide$/],
  ['whats-new', "What's new", /^whats-new$/],
  ['feedback', 'Feedback', /^feedback$/],
  ['legal', 'Legal', /^legal\//],
  ['other', 'Sign-in return / not found', /^(auth-callback|\+not-found)$/],
];
const EVERYWHERE = ['everywhere', 'Everywhere (shell, pop-ups, toasts)'];
// A component reached from more pages than this is shown once, under Everywhere.
const SHARED_AT = 4;

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(n) && !/\.d\.ts$|\.test\.tsx?$/.test(n) ? [p] : [];
});

// ---- import graph (app only), to learn which pages each file shows on ----
const appFiles = walk(join(APP, 'src'));
const appSet = new Set(appFiles.map((f) => f.toLowerCase()));
const resolveImport = (from, spec) => {
  let base;
  if (spec.startsWith('@/assets/')) return null;
  if (spec.startsWith('@/')) base = join(APP, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  const tries = [base, ...['.tsx', '.ts', '.web.tsx', '.web.ts', '/index.tsx', '/index.ts'].map((e) => base + e)];
  const hits = [];
  for (const t of tries) if (appSet.has(t.toLowerCase()) && statSync(t).isFile()) hits.push(t);
  // a.tsx and a.web.tsx are both reachable: the bundler picks per platform
  if (hits.length) { const h = hits[0].replace(/\.(tsx|ts)$/, ''); for (const e of ['.web.tsx', '.web.ts', '.ios.tsx', '.native.tsx']) if (appSet.has((h + e).toLowerCase())) hits.push(h + e); }
  return [...new Set(hits)];
};
const imports = new Map();
for (const f of appFiles) {
  const src = readFileSync(f, 'utf8');
  const out = [];
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) out.push(...(resolveImport(f, m[1]) ?? []));
  imports.set(f, out);
}
const routeOf = (f) => relative(join(APP, 'src', 'app'), f).replace(/\\/g, '/').replace(/\.(tsx|ts)$/, '');
const isRouteFile = (f) => f.includes(join('src', 'app') + '\\') || f.includes('src/app/');
const pagesOf = new Map(); // file -> Set(page id)
for (const f of appFiles.filter(isRouteFile)) {
  const r = routeOf(f);
  if (DEV_ROUTES.test(r)) continue;
  const page = /_layout$/.test(r) ? EVERYWHERE[0] : PAGES.find((p) => p[2].test(r.replace(/\.web$/, '')))?.[0];
  if (!page) continue;
  const seen = new Set(), stack = [f];
  while (stack.length) {
    const x = stack.pop();
    if (seen.has(x)) continue;
    seen.add(x);
    if (!pagesOf.has(x)) pagesOf.set(x, new Set());
    pagesOf.get(x).add(page);
    // stop at another route file: a link is not the page's own text
    for (const y of imports.get(x) ?? []) if (!isRouteFile(y) || y === f) stack.push(y);
  }
}
const pageList = (file, repo) => {
  if (repo === 'tcgscan-browse') return ['browse'];
  const s = pagesOf.get(file);
  if (!s || !s.size) return null; // not reachable from any page: dev-only or dead
  if (s.has(EVERYWHERE[0]) || s.size > SHARED_AT) return [EVERYWHERE[0]];
  return [...s];
};

// ---- platform of a node ('phone' = narrow screen, 'web' = desktop) ----
const PHONE_NAMES = /^(phone|narrow|compact|isPhone|isNarrow|mobile|isMobile|tight|small|isSmall)$/;
const DESKTOP_NAMES = /^(desktop|wide|isDesktop|isWide|railShown)$/;
const WIDTH_LIMITS = /^(Breakpoints\.(phone|rail)|PHONE_MAX_WIDTH|PEEK_MIN_WIDTH|NARROW_W|\d{3})$/;
const flip = (p) => (p === 'web' ? 'phone' : p === 'phone' ? 'web' : null);
const platformNames = (sf) => {
  const names = {};
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const p = condPlatform(n.initializer, {});
      if (p) names[n.name.text] = p;
      else if (PHONE_NAMES.test(n.name.text) && /width|Width|narrow|phone/i.test(n.initializer.getText())) names[n.name.text] = 'phone';
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
};
// Which screen makes this condition true ('web' = desktop | 'phone' = narrow), 'always' when it is
// always true here (web-only build), 'never' when it never is, or null when it is not about that.
function condPlatform(e, names) {
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) {
    const p = condPlatform(e.operand, names);
    return p === 'always' ? 'never' : p === 'never' ? 'always' : flip(p);
  }
  if (ts.isIdentifier(e)) return names[e.text] ?? (PHONE_NAMES.test(e.text) ? 'phone' : DESKTOP_NAMES.test(e.text) ? 'web' : null);
  if (ts.isPropertyAccessExpression(e) && PHONE_NAMES.test(e.name.text)) return 'phone';
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    const eq = op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken;
    const ne = op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken;
    if (eq || ne) {
      const [a, b] = [e.left.getText(), e.right.getText()];
      const os = /Platform\.OS$/.test(a) ? b : /Platform\.OS$/.test(b) ? a : null;
      if (os) {
        const v = os.replace(/['"]/g, '');
        const p = v === 'web' ? 'always' : v === 'ios' || v === 'android' ? 'never' : null;
        return p && (eq ? p : p === 'always' ? 'never' : 'always');
      }
    }
    const lt = op === ts.SyntaxKind.LessThanToken || op === ts.SyntaxKind.LessThanEqualsToken;
    const gt = op === ts.SyntaxKind.GreaterThanToken || op === ts.SyntaxKind.GreaterThanEqualsToken;
    if (lt || gt) {
      const [a, b] = [e.left.getText(), e.right.getText()];
      const widthLeft = /width|Width|winW|innerW/i.test(a) && WIDTH_LIMITS.test(b);
      const widthRight = /width|Width|winW|innerW/i.test(b) && WIDTH_LIMITS.test(a);
      if (widthLeft) return lt ? 'phone' : 'web';
      if (widthRight) return gt ? 'phone' : 'web';
    }
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      const l = condPlatform(e.left, names), r = condPlatform(e.right, names);
      if (l === 'never' || r === 'never') return 'never';
      return (l === 'always' ? null : l) ?? (r === 'always' ? null : r);
    }
  }
  return null;
}
// Branches only the owner or a developer sees are not copy.
const DEV_COND = /__DEV__|\bisAdmin\b|\badmin\b|\bisOwner\b|\bdevMode\b|\bshowDev\w*|\bdebug\w*|\bdiag\w*/;
const devBranch = (cond, taken) => { const t = cond.getText(); return DEV_COND.test(t) && (taken === 'true') === !/^!/.test(t.trim()); };
const branchOf = (cond, names, taken) => {
  const t = condPlatform(cond, names);
  if (t === 'always') return taken ? null : 'never';
  if (t === 'never') return taken ? 'never' : null;
  return t && (taken ? t : flip(t));
};
function nodePlatform(n, names, filePlatform, pair = {}) {
  let p = filePlatform;
  for (let c = n, parent = n.parent; parent; c = parent, parent = parent.parent) {
    let q = null;
    if (ts.isConditionalExpression(parent) && c !== parent.condition && devBranch(parent.condition, c === parent.whenTrue ? 'true' : 'false')) return 'never';
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && c === parent.right && devBranch(parent.left, 'true')) return 'never';
    if (ts.isIfStatement(parent) && c !== parent.expression && devBranch(parent.expression, c === parent.thenStatement ? 'true' : 'false')) return 'never';
    if (ts.isConditionalExpression(parent) && c !== parent.condition) {
      q = branchOf(parent.condition, names, c === parent.whenTrue);
      // `phone ? 'A' : 'B'`: the editor shows A and B as one row with a Phone box and a Desktop box
      if (q && q !== 'never' && pair.at === undefined) pair.at = parent.getStart();
    } else if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && c === parent.right) {
      q = branchOf(parent.left, names, true);
    } else if (ts.isIfStatement(parent) && c !== parent.expression) {
      q = branchOf(parent.expression, names, c === parent.thenStatement);
    } else if (ts.isPropertyAssignment(parent) && c === parent.initializer && ts.isObjectLiteralExpression(parent.parent)
      && ts.isCallExpression(parent.parent.parent) && /Platform\.select$/.test(parent.parent.parent.expression.getText())) {
      const k = parent.name.getText().replace(/['"]/g, '');
      q = k === 'web' || k === 'default' ? null : ['ios', 'android', 'native'].includes(k) ? 'never' : null;
    }
    if (q === 'never') return 'never';
    if (q) { if (p && p !== q) return 'never'; p = q; }
  }
  return p ?? 'both';
}

// ---- what counts as human text ----
const SKIP_ATTRS = new Set(['style', 'testID', 'nativeID', 'key', 'href', 'source', 'id', 'name', 'icon', 'color', 'tint', 'variant', 'type', 'kind', 'mode', 'tone', 'route', 'pathname', 'className', 'size', 'face', 'mood', 'mascot', 'keyboardType', 'autoComplete', 'textContentType', 'autoCapitalize', 'returnKeyType', 'resizeMode', 'contentFit', 'pointerEvents', 'accessibilityRole', 'role', 'importantForAccessibility', 'inputMode', 'enterKeyHint', 'event', 'screen', 'align', 'justify', 'direction', 'position', 'layout', 'shape', 'rel', 'target', 'lang', 'dir', 'as', 'tag', 'value', 'defaultValue', 'uri', 'fontFamily', 'weight', 'cursor', 'presentation', 'animationType', 'transition', 'entering', 'exiting', 'unit', 'game', 'lane', 'surface', 'slot', 'placement', 'side', 'stage', 'storageKey', 'cacheKey', 'glyph', 'theme', 'preset', 'sizeId', 'wall', 'trackId', 'binderId', 'pageId', 'slotId', 'cardId', 'href', 'intent', 'origin']);
const SKIP_CALLS = /^(console\.\w+|track\w*|log\w*|analytics\.\w+|\w+\.track\w*|require|import|fetch|\w*[Ss]torage\.\w+|localStorage\.\w+|sessionStorage\.\w+|AsyncStorage\.\w+|router\.\w+|\w+\.(push|replace|navigate)|Linking\.\w+|new Error|\w*\.from|\w*\.rpc|\w*\.select|\w*\.eq|\w*\.neq|\w*\.in|\w*\.order|\w*\.channel|\w*\.on|\w*\.invoke|\w*\.functions\.\w+|URLSearchParams|\w*\.get|\w*\.set|\w*\.has|\w*\.delete|\w*\.getItem|\w*\.setItem|\w*\.removeItem|\w*\.startsWith|\w*\.endsWith|\w*\.includes|\w*\.indexOf|\w*\.split|\w*\.replace\w*|\w*\.match\w*|\w*\.test|\w*\.join|\w*\.padStart|\w*\.toLocale\w+|Intl\.\w+|new Intl\.\w+|encodeURIComponent|decodeURIComponent|\w*\.addEventListener|\w*\.removeEventListener|createURL|\w*\.createURL|\w*\.querySelector\w*|\w*\.getElementById|useLocalSearchParams|emit|\w+\.emit|captureException|Sentry\.\w+|getApiUrl|\w*\.setPref|setPref|where\.\w+|fetchCardsWhere|useQuery|supabase\.\w+|\w*\.upsert|\w*\.insert|\w*\.update|\w*\.filter|\w*\.ilike|\w*\.like|\w*\.single|\w*\.maybeSingle|\w*\.storage\.\w+|\w*\.upload|\w*\.getPublicUrl|\w*\.setItemAsync|\w*\.getItemAsync|requestAnimationFrame|withTiming|withSpring|StyleSheet\.\w+|Dimensions\.\w+|Platform\.select)$/;
const SKIP_KEYS = new Set([...SKIP_ATTRS, 'event', 'table', 'column', 'bucket', 'path', 'url', 'key', 'sku', 'lookupKey', 'lookup_key', 'productId', 'priceId', 'mime', 'mimeType', 'format', 'encoding', 'method', 'cardId', 'setId', 'status', 'state', 'code', 'reason', 'action', 'family', 'tier', 'plan', 'app', 'campaign', 'utm_source', 'utm_medium', 'content_type', 'contentType', 'fontWeight', 'fontStyle', 'textAlign', 'backgroundColor', 'borderColor', 'overflow', 'display', 'flexDirection', 'alignItems', 'justifyContent']);
const looksHuman = (s) => {
  const t = s.trim();
  if (t.length < 2 || !/[A-Za-z]{2}/.test(t)) return false;
  if (/^[a-z0-9_.\-/:#@?=&%[\]]+$/.test(t)) return false; // ids, keys, paths, routes
  if (/^[A-Z0-9_]+$/.test(t) && t.length > 3 && t.includes('_')) return false; // CONSTANT_IDS
  if (/^(https?:|mailto:|tel:|data:|\/|\.\/|#[0-9a-f]{3,8}$|rgba?\(|hsla?\(|M\d|[a-z]+\/[a-z])/.test(t)) return false;
  if (/^[\w-]+(\.[\w-]+)+$/.test(t)) return false; // dotted.keys, file.names
  if (/^[a-z][a-zA-Z0-9]*$/.test(t)) return false; // camelCase identifiers
  if (/^(select|insert|update|delete|with)\s/i.test(t) && /\b(from|into|set|where)\b/i.test(t)) return false; // SQL
  if (/^[\d\s.,:%x×-]+$/.test(t)) return false;
  if (/^Bearer\b|\d+px\b|rgba?\(|var\(--|^\s*\$\{[^}]*\}\s*$/.test(t)) return false; // headers, CSS, bare values
  if (/^[a-z_]+=(eq|neq|ilike|like|in|gte|lte|gt|lt|is)\./.test(t)) return false; // PostgREST filters
  if (/^(linear|radial)-gradient\(|^[\d.]+(em|rem|vw|vh|%)\s/.test(t)) return false; // CSS values
  return true;
};

// JSX text shows &apos; as ' and so on: the editor shows the character, apply.mjs writes it back safely.
const ENTITIES = { apos: "'", quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…', middot: '·' };
const unentity = (t) => t.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITIES[e] ?? m);

const surfaceOf = (n, rel, element) => {
  if (element === 'screen reader' || element === 'placeholder') return element === 'placeholder' ? 'Placeholders' : 'Screen reader';
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const callee = p.expression.getText();
      if (/^toast\.show$|[Tt]oast|showLimitToast/.test(callee)) return 'Toasts';
      if (/Alert\.alert|confirm|askConfirm|openConfirm|setConfirm/.test(callee)) return 'Pop-ups';
    }
  }
  const b = basename(rel);
  if (/walkthrough|hint|callout|coach|onboard|tour|tips?\b|FirstPage|intro|welcome/i.test(b)) return 'Walkthroughs & tips';
  if (/modal|sheet|dialog|prompt|paywall|pitch|ask|confirm|menu|picker|drawer|banner|gate|wall/i.test(b)) return 'Pop-ups & sheets';
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p)) {
      const tag = (ts.isJsxElement(p) ? p.openingElement : p).tagName.getText();
      if (/Toast/.test(tag)) return 'Toasts';
      if (/Coach|Tip|Hint|Callout|Walkthrough|Intro|Tour/.test(tag)) return 'Walkthroughs & tips';
      if (/Modal|Sheet|Dialog|Prompt|Popover|Menu|Gate/.test(tag)) return 'Pop-ups & sheets';
    }
  }
  return 'On the page';
};
const elementOf = (n, attr) => {
  if (attr) {
    if (/^(accessibilityLabel|accessibilityHint|aria-label|aria-description|alt)$/.test(attr)) return 'screen reader';
    if (attr === 'placeholder') return 'placeholder';
    if (/^(title|heading|headline|kicker|eyebrow)$/i.test(attr)) return 'heading';
    if (/label|cta|action|confirm|cancel|button|word/i.test(attr)) return 'button';
    return attr;
  }
  for (let p = n.parent, depth = 0; p && depth < 6; p = p.parent, depth++) {
    if (ts.isJsxElement(p)) {
      const tag = p.openingElement.tagName.getText();
      if (/Button|Pressable|Touchable|Link|Chip|Pill|Tab\b|Action/.test(tag)) return 'button';
      if (/Title|Heading|Header|H[1-6]\b|Kicker|Eyebrow/.test(tag)) return 'heading';
      const typ = p.openingElement.attributes.properties.find((a) => ts.isJsxAttribute(a) && /^(type|variant)$/.test(a.name.getText()));
      if (typ && /title|heading|display/i.test(typ.getText())) return 'heading';
      return 'text';
    }
  }
  return 'text';
};
const whereOf = (n) => {
  let fn = null, tag = null;
  for (let p = n.parent; p; p = p.parent) {
    if (!tag && (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p))) tag = (ts.isJsxElement(p) ? p.openingElement : p).tagName.getText();
    if (!fn && (ts.isFunctionDeclaration(p) || ts.isVariableDeclaration(p)) && p.name && ts.isIdentifier(p.name) && /^[A-Z]/.test(p.name.text)) fn = p.name.text;
  }
  return [fn, tag && `<${tag}>`].filter(Boolean).join(' ');
};

const strings = [];
const skippedFiles = [];
let commit = {};
for (const R of REPOS) {
  try { commit[R.repo] = R.repo === 'app' ? execSync('git rev-parse --short HEAD', { cwd: R.root }).toString().trim() : JSON.parse(readFileSync(join(R.root, 'package.json'), 'utf8')).version; } catch { commit[R.repo] = '?'; }
  for (const file of R.dirs.flatMap((d) => walk(join(R.root, d)))) {
    const rel = relative(R.root, file).replace(/\\/g, '/');
    if (DEV_FILES.test(rel)) continue;
    const pages = pageList(file, R.repo);
    if (!pages) { skippedFiles.push(`${R.repo}:${rel}`); continue; }
    const src = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const names = platformNames(sf);
    // .web.tsx is the only variant that ships; a native-only file never shows.
    if (/\.(ios|native|android)\.tsx?$/.test(file)) continue;
    const filePlatform = null;
    const taken = new Set(); // node starts already inside a merged JSX run
    const seenText = new Map();
    const add = (n, start, end, mode, text, extra = {}) => {
      const pair = {};
      const platform = nodePlatform(n, names, filePlatform, pair);
      if (platform === 'never') return;
      const occurrence = seenText.get(text) ?? 0;
      seenText.set(text, occurrence + 1);
      const id = createHash('sha1').update(`${R.repo}:${rel}:${text}:${occurrence}`).digest('hex').slice(0, 10);
      const element = extra.element ?? elementOf(n, extra.attr);
      strings.push({
        id, repo: R.repo, file: rel, line: sf.getLineAndCharacterOfPosition(start).line + 1,
        start, end, raw: src.slice(start, end), mode, text, platform, pages,
        surface: surfaceOf(n, rel, element), element, where: whereOf(n), ...(extra.bare ? { bare: true } : {}),
        ...(pair.at !== undefined && platform !== 'both' ? { pair: `${R.repo}:${rel}:${pair.at}` } : {}),
      });
    };
    const visit = (n) => {
      // A JSX element whose children are only text and {expressions}: one row, "You have {n} cards".
      if (ts.isJsxElement(n) || ts.isJsxFragment(n)) {
        const kids = n.children.filter((c) => !(ts.isJsxText(c) && !c.text.trim()));
        const mixed = kids.length > 1 && kids.every((c) => ts.isJsxText(c) || (ts.isJsxExpression(c) && c.expression && !ts.isJsxElement(c.expression) && !ts.isConditionalExpression(c.expression) && !ts.isBinaryExpression(c.expression) && !ts.isCallExpression(c.expression) || ts.isJsxExpression(c) && c.expression && ts.isCallExpression(c.expression) && /^(fmt|format|money|plural|count)\w*/i.test(c.expression.expression.getText())));
        if (mixed && kids.some((c) => ts.isJsxText(c) && looksHuman(c.text))) {
          const start = kids[0].getStart() + (ts.isJsxText(kids[0]) ? kids[0].getText().length - kids[0].getText().trimStart().length : 0);
          const last = kids[kids.length - 1];
          const end = last.getEnd() - (ts.isJsxText(last) ? last.getText().length - last.getText().trimEnd().length : 0);
          const raw = src.slice(start, end);
          add(n, start, end, 'jsxrun', unentity(raw.replace(/\s*\n\s*/g, ' ')));
          kids.forEach((k) => taken.add(k.getStart()));
          // the string literals inside {…} of a run are handled as part of the run
          return;
        }
      }
      if (ts.isJsxText(n) && !taken.has(n.getStart())) {
        const full = n.getText();
        if (looksHuman(full)) {
          const lead = full.length - full.trimStart().length;
          const start = n.getStart() + lead, end = start + full.trim().length;
          add(n, start, end, 'jsx', unentity(full.trim().replace(/\s*\n\s*/g, ' ')));
        }
      } else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) && wanted(n)) {
        const raw = n.getText();
        const inner = raw.slice(1, -1);
        if (looksHuman(ts.isTemplateExpression(n) ? inner.replace(/\$\{[^}]*\}/g, '') : n.text ?? inner)) {
          const attr = ts.isJsxAttribute(n.parent) ? n.parent.name.getText()
            : ts.isJsxExpression(n.parent) && ts.isJsxAttribute(n.parent.parent) ? n.parent.parent.name.getText()
            : ts.isPropertyAssignment(n.parent) ? n.parent.name.getText().replace(/['"]/g, '') : undefined;
          add(n, n.getStart(), n.getEnd(), ts.isTemplateExpression(n) || ts.isNoSubstitutionTemplateLiteral(n) ? 'tpl' : 'str',
            ts.isTemplateExpression(n) ? inner : ts.isNoSubstitutionTemplateLiteral(n) ? inner : n.text,
            { attr, bare: ts.isJsxAttribute(n.parent) });
        }
      }
      ts.forEachChild(n, visit);
    };
    const wanted = (n) => {
      const p = n.parent;
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) || ts.isLiteralTypeNode(p)) return false;
      if (ts.isPropertyAssignment(p) && p.name === n) return false;
      if (ts.isPropertyAssignment(p) && SKIP_KEYS.has(p.name.getText().replace(/['"]/g, ''))) return false;
      if (ts.isJsxAttribute(p) && SKIP_ATTRS.has(p.name.getText())) return false;
      if (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent) && SKIP_ATTRS.has(p.parent.name.getText())) return false;
      if (ts.isElementAccessExpression(p) || ts.isCaseClause(p)) return false;
      if (ts.isBinaryExpression(p) && /^(===|!==|==|!=|in|instanceof)$/.test(p.operatorToken.getText())) return false;
      if (ts.isComputedPropertyName(p)) return false;
      for (let c = n, q = p, d = 0; q && d < 4; c = q, q = q.parent, d++) {
        if (ts.isCallExpression(q) || ts.isNewExpression(q)) {
          const callee = (ts.isNewExpression(q) ? 'new ' : '') + q.expression.getText();
          if (SKIP_CALLS.test(callee)) return false;
          if (/^(throw|new Error)/.test(callee)) return false;
          break;
        }
        if (ts.isThrowStatement(q)) return false;
      }
      return true;
    };
    visit(sf);
  }
}

// A literal that also appears in code as a value (=== 'Holofoil', case 'Loose':, a map key) is
// data as well as text: changing it could change behaviour. Flag it; apply.mjs asks before touching it.
for (const R of REPOS) {
  const literalUses = new Map();
  for (const file of R.dirs.flatMap((d) => walk(join(R.root, d)))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:===?|!==?|case)\s*(['"])((?:(?!\1).){2,80})\1|(['"])((?:(?!\3).){2,80})\3\s*(?:===?|!==?)|[{,]\s*(['"])((?:(?!\5).){2,80})\5\s*:/g)) {
      const v = m[2] ?? m[4] ?? m[6];
      literalUses.set(v, (literalUses.get(v) ?? 0) + 1);
    }
  }
  for (const s of strings) if (s.repo === R.repo && s.mode === 'str' && literalUses.has(s.text)) s.risky = true;
}

const order = [EVERYWHERE, ...PAGES].map(([id, label]) => ({ id, label }));
const pages = order.map((p) => ({ ...p, count: strings.filter((s) => s.pages.includes(p.id)).length })).filter((p) => p.count);
const meta = { generatedAt: new Date().toISOString(), commit, app: 'michi-maker', second: 'Desktop', pages };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ ...meta, strings }, null, 0));
if (SLIM) {
  // What the editor page needs: no source offsets, so the page stays small.
  mkdirSync(dirname(SLIM), { recursive: true });
  writeFileSync(SLIM, JSON.stringify({ ...meta, strings: strings.map(({ start, end, raw, bare, ...s }) => s) }));
}
console.log(`OK: ${strings.length} strings on ${pages.length} pages -> ${OUT}${SLIM ? ` (slim -> ${SLIM})` : ''}`);
for (const p of pages) console.log(`  ${p.label.padEnd(36)} ${p.count}`);
const bySurface = {};
for (const s of strings) bySurface[s.surface] = (bySurface[s.surface] ?? 0) + 1;
console.log('  by kind:', JSON.stringify(bySurface));
console.log('  by screen (phone = narrow, web = desktop):', JSON.stringify(strings.reduce((a, s) => ((a[s.platform] = (a[s.platform] ?? 0) + 1), a), {})));
if (skippedFiles.length) console.log(`  not on any page (skipped): ${skippedFiles.length} files`);
