/**
 * THE /sets PILOT PAGES (MIC-037, SEO plan action 9): one binder planner per set, plus the hub.
 *
 * Pure functions from the committed snapshot (scripts/seo/set-pages.json) to finished HTML.
 * scripts/build-set-pages.mjs writes them into dist/ at build time; src/data/setPages.test.ts
 * checks them. Standalone static pages like /auto-fill-methods: no app bundle, so nothing is
 * replaced after load, and a person and a crawler read exactly the same page at the same URL.
 *
 * What each page answers, from the set's own data: how many cards (and how many are secret
 * rares), how many pockets, pages and sheets that takes in every common binder size, which page
 * every card lands on in a 9-pocket binder, the cards worth the most, and the full checklist with
 * TCGplayer market prices and the date they were read. Then one link into the app that opens the
 * set already picked in the binder wizard (/new-binder?kind=set&set=<id>), which guests can use.
 *
 * Copy rules: no em dashes, no plan names, nothing about how any binder was made.
 */
export const SITE = 'https://michi-maker.com';
export const BRAND = 'Michi-Maker';

export const SIZES = [
  { label: '9-pocket (3×3)', pockets: 9 },
  { label: '12-pocket (3×4)', pockets: 12 },
  { label: '4-pocket (2×2)', pockets: 4 },
  { label: '16-pocket (4×4)', pockets: 16 },
];

export const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const usd = (n) => (n == null ? 'n/a' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const longDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : '';
};
const plural = (n, w, ws = `${w}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? w : ws}`;
const at = (number) => {
  const m = /^(\d+)\/(\d+)$/.exec(String(number));
  return m ? Number(m[1]) : null;
};

/** Counts every page and table reads from. Exported for the tests. */
export function setFacts(set) {
  const cards = set.cards.map(([number, name, rarity, price, reverse]) => ({ number, name, rarity, price, reverse: !!reverse }));
  const complete = cards.length;
  const reverses = cards.filter((c) => c.reverse).length;
  const master = complete + reverses + set.patterns;
  const secrets = cards.filter((c) => (at(c.number) ?? 0) > set.printed);
  const priced = cards.filter((c) => c.price != null);
  const value = Math.round(priced.reduce((n, c) => n + c.price, 0));
  const rarities = new Map();
  for (const c of cards) rarities.set(c.rarity || 'Unlisted', (rarities.get(c.rarity || 'Unlisted') || 0) + 1);
  const sizes = SIZES.map((s) => {
    const pages = Math.ceil(complete / s.pockets);
    const masterPages = Math.ceil(master / s.pockets);
    return { ...s, pages, sheets: Math.ceil(pages / 2), masterPages, masterSheets: Math.ceil(masterPages / 2) };
  });
  return { cards, complete, reverses, master, secrets, priced: priced.length, value, rarities: [...rarities.entries()].sort((a, b) => b[1] - a[1]), sizes };
}

/** Which cards sit on which side of a 9-pocket binder, in set-number order. */
export function pagePlan(cards, pockets = 9) {
  const plan = [];
  for (let i = 0; i < cards.length; i += pockets) {
    const on = cards.slice(i, i + pockets);
    plan.push({ page: plan.length + 1, first: on[0], last: on[on.length - 1], count: on.length });
  }
  return plan;
}

const STYLE = `<style>
:root{--ground:#EFECE4;--mat:#FBFAF7;--ink:#221F1A;--ink-2:#4A443B;--muted:#7C7568;--hair:rgba(120,116,108,.22);--hair-soft:rgba(120,116,108,.12);--accent:#3B82F6;--accent-ink:#1656DA;--accent-soft:#E7EEFD;--secret:#8A5A00;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;--brand:"Fraunces",Georgia,"Times New Roman",serif;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root{--ground:#141210;--mat:#232019;--ink:#F2EEE5;--ink-2:#D2CABB;--muted:#9B9284;--hair:rgba(232,224,208,.16);--hair-soft:rgba(232,224,208,.09);--accent:#7BA6FF;--accent-ink:#A9C4FF;--accent-soft:rgba(123,166,255,.14);--secret:#E8B860}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--ground);color:var(--ink);font:15px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
a{color:var(--accent-ink)}img{max-width:100%;height:auto}
.wrap{max-width:1040px;margin:0 auto;padding:0 max(16px,env(safe-area-inset-right,0px)) 72px max(16px,env(safe-area-inset-left,0px))}
.top{display:flex;flex-wrap:wrap;gap:6px 18px;align-items:baseline;padding:18px 0;border-bottom:1px solid var(--hair)}
.top .mark{font-family:var(--brand);font-weight:800;font-size:20px;color:var(--ink);text-decoration:none;margin-right:auto}
.top a{font-size:14px}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:36px 0 12px}
h1{font-family:var(--brand);font-weight:800;font-size:clamp(30px,5.4vw,52px);line-height:1.05;letter-spacing:-.02em;margin:0 0 14px;text-wrap:balance}
h2{font-family:var(--brand);font-weight:700;font-size:24px;letter-spacing:-.01em;margin:44px 0 10px;text-wrap:balance}
.lede{font-size:18px;line-height:1.6;color:var(--ink-2);max-width:66ch;margin:0 0 18px}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0 6px}
.cta a{display:inline-block;padding:11px 18px;border-radius:999px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600}
.cta a.alt{background:var(--accent-soft);color:var(--accent-ink)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:22px 0 0}
.fact{background:var(--mat);border:1px solid var(--hair-soft);border-radius:12px;padding:12px 14px}
.fact b{display:block;font-family:var(--brand);font-size:26px;line-height:1.1}
.fact span{font-size:13px;color:var(--muted)}
.scroll{overflow-x:auto;margin:8px 0 0;border:1px solid var(--hair-soft);border-radius:12px;background:var(--mat)}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;padding:7px 12px;border-bottom:1px solid var(--hair-soft);white-space:nowrap}
th{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
td.name{white-space:normal;min-width:160px}
tr.secret td{color:var(--secret)}
.note{font-size:13px;color:var(--muted);max-width:72ch}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:14px;margin:12px 0 0;padding:0;list-style:none}
.grid li{margin:0}.grid img{display:block;width:100%;aspect-ratio:63/88;object-fit:cover;border-radius:6px;background:var(--hair-soft);box-shadow:0 1px 2px rgba(60,54,44,.08),0 8px 18px rgba(60,54,44,.12)}
.grid .cap{font-size:13px;line-height:1.35;margin-top:6px}.grid .cap span{display:block;color:var(--muted)}
.hub{list-style:none;padding:0;margin:8px 0 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
.hub a{display:block;background:var(--mat);border:1px solid var(--hair-soft);border-radius:12px;padding:12px 14px;text-decoration:none;color:var(--ink)}
.hub a b{font-family:var(--brand);font-size:18px;display:block}.hub a span{font-size:13px;color:var(--muted)}
footer{margin-top:56px;padding-top:16px;border-top:1px solid var(--hair);font-size:13px;color:var(--muted)}
</style>`;

function head({ title, description, url, image }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image || `${SITE}/og.png`)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700;9..144,800&display=swap">
${STYLE}
</head>
<body>
<div class="wrap">
<nav class="top"><a class="mark" href="${SITE}/">${BRAND}</a><a href="${SITE}/sets">Set binder planners</a><a href="${SITE}/michi-method">The michi method</a><a href="${SITE}/new-binder">Start a binder</a></nav>`;
}

function foot(taken, pricesAsOf) {
  return `<footer>
<p>Card list and market prices from TCGplayer${pricesAsOf ? `, prices as of ${esc(longDate(pricesAsOf))}` : ''}. Page updated ${esc(longDate(taken))}.</p>
<p>${BRAND} is a free fan-made binder planner, not affiliated with or endorsed by Nintendo, Creatures Inc., GAME FREAK inc. or TCGplayer. Pokémon and all related card artwork are © their respective owners. <a href="${SITE}/legal/terms">Terms</a> · <a href="${SITE}/legal/privacy">Privacy</a></p>
</footer>
</div>
</body>
</html>
`;
}

export const setUrl = (set) => `${SITE}/sets/${set.slug}`;
export const startUrl = (set) => `${SITE}/new-binder?kind=set&set=${set.id}`;

export function renderSetPage(set, { taken }) {
  const f = setFacts(set);
  const nine = f.sizes[0];
  const twelve = f.sizes[1];
  const plan = pagePlan(f.cards, 9);
  const firstSecretPage = f.secrets.length ? plan.find((p) => (at(p.last.number) ?? 0) > set.printed)?.page : null;
  const top = set.notable[0];
  const year = (set.released || '').slice(0, 4);
  const title = `${set.name} binder planner: pages, pockets and checklist · ${BRAND}`;
  const description =
    `${set.name} has ${plural(f.complete, 'card')}` +
    (f.secrets.length ? ` (${set.printed} in the main set and ${f.secrets.length} secret rares)` : '') +
    `. That fills ${nine.pages} pages of a 9-pocket binder or ${twelve.pages} of a 12-pocket one. Page plan, the most valuable cards and the full checklist with prices.`;
  const binders360 = Math.ceil(f.complete / 360);

  const sizesRows = f.sizes
    .map(
      (s) =>
        `<tr><td>${esc(s.label)}</td><td class="num">${s.pages}</td><td class="num">${s.sheets}</td><td class="num">${s.masterPages}</td><td class="num">${s.masterSheets}</td></tr>`,
    )
    .join('');
  const planRows = plan
    .map((p) => {
      const secret = (at(p.first.number) ?? 0) > set.printed;
      return `<tr${secret ? ' class="secret"' : ''}><td class="num">${p.page}</td><td class="num">${Math.ceil(p.page / 2)}</td><td>${esc(p.first.number)} to ${esc(p.last.number)}</td><td class="name">${esc(p.first.name)} to ${esc(p.last.name)}</td></tr>`;
    })
    .join('');
  const notable = set.notable
    .map(
      (c) =>
        `<li>${c.image ? `<img src="${esc(c.image)}" alt="${esc(c.name)}, ${esc(set.name)} ${esc(c.number)}" width="245" height="342" loading="lazy" decoding="async">` : ''}<div class="cap"><b>${esc(c.name)}</b><span>${esc(c.number)} · ${esc(c.rarity)}</span><span>${usd(c.price)}</span></div></li>`,
    )
    .join('');
  const secretRows = f.secrets
    .map((c) => `<tr><td class="num">${esc(c.number)}</td><td class="name">${esc(c.name)}</td><td>${esc(c.rarity)}</td><td class="num">${usd(c.price)}</td></tr>`)
    .join('');
  const rarityRows = f.rarities.map(([r, n]) => `<tr><td>${esc(r)}</td><td class="num">${n}</td></tr>`).join('');
  const checklist = f.cards
    .map((c, i) => {
      const secret = (at(c.number) ?? 0) > set.printed;
      return `<tr${secret ? ' class="secret"' : ''}><td class="num">${esc(c.number)}</td><td class="name">${esc(c.name)}</td><td>${esc(c.rarity)}</td><td class="num">${usd(c.price)}</td><td class="num">${Math.floor(i / 9) + 1}</td></tr>`;
    })
    .join('');

  const body = `
<p class="eyebrow">Set binder planner · ${esc(set.series || 'Pokémon TCG')}${set.code ? ` · ${esc(set.code)}` : ''}${set.released ? ` · released ${esc(longDate(set.released))}` : ''}</p>
<h1>${esc(set.name)} binder planner</h1>
<p class="lede">${esc(set.name)}${year ? ` (${year})` : ''} has <strong>${plural(f.complete, 'card')}</strong>${f.secrets.length ? `: ${set.printed} in the main set and <strong>${plural(f.secrets.length, 'secret rare')}</strong> numbered past ${set.printed}` : ''}. One of each fills <strong>${nine.pages} pages</strong> of a 9-pocket binder (${nine.sheets} sheets, front and back) or ${twelve.pages} pages of a 12-pocket binder.${top ? ` The most valuable card is ${esc(top.name)} (${esc(top.number)}) at ${usd(top.price)}.` : ''}</p>
<div class="cta"><a href="${esc(startUrl(set))}">Start a ${esc(set.name)} binder</a></div>
<p class="note">Opens ${BRAND} with ${esc(set.name)} already picked: every card in number order, one pocket each, ready to make into a binder. Free in the browser, no account needed to start.</p>
<div class="facts">
<div class="fact"><b>${f.complete}</b><span>cards, one of each</span></div>
<div class="fact"><b>${f.secrets.length}</b><span>secret rares</span></div>
<div class="fact"><b>${f.master}</b><span>with reverse holos${set.patterns ? ' and pattern variants' : ''} (master set)</span></div>
<div class="fact"><b>${nine.pages}</b><span>9-pocket pages</span></div>
${f.value ? `<div class="fact"><b>$${f.value.toLocaleString('en-US')}</b><span>one of each at market price</span></div>` : ''}
</div>

<h2>How many pages does ${esc(set.name)} need?</h2>
<p>A page here is one side of a binder sheet; a sheet holds two. Counts are for one of each card (complete set) and for the master set: every card, plus one reverse holo of each card that has one${set.patterns ? `, plus the ${set.patterns} pattern variants (such as Poké Ball and Master Ball patterns) listed for this set` : ''}.</p>
<div class="scroll"><table>
<thead><tr><th>Binder</th><th class="num">Pages</th><th class="num">Sheets</th><th class="num">Master set pages</th><th class="num">Master set sheets</th></tr></thead>
<tbody>${sizesRows}</tbody></table></div>
<p class="note">A 20-sheet, 9-pocket binder holds 360 cards, so the complete set ${binders360 === 1 ? 'fits in one' : `needs ${binders360}`}${f.master > 360 ? `, and the master set needs ${Math.ceil(f.master / 360)}` : ''}.</p>

<h2>Page plan in a 9-pocket binder</h2>
<p>In set-number order, nine cards to a page${firstSecretPage ? `. The secret rares start on page ${firstSecretPage}, so a binder that leaves them for last can stop the main set there` : ''}.</p>
<div class="scroll"><table>
<thead><tr><th class="num">Page</th><th class="num">Sheet</th><th>Numbers</th><th>Cards</th></tr></thead>
<tbody>${planRows}</tbody></table></div>

<h2>The most valuable ${esc(set.name)} cards</h2>
<p>By TCGplayer market price${set.pricesAsOf ? ` on ${esc(longDate(set.pricesAsOf))}` : ''}${set.patterns ? ', pattern variants included' : ''}.</p>
<ul class="grid">${notable}</ul>

${f.secrets.length ? `<h2>${esc(set.name)} secret rares</h2>
<p>${plural(f.secrets.length, 'card')} numbered past ${set.printed}/${set.printed}.</p>
<div class="scroll"><table>
<thead><tr><th class="num">Number</th><th>Card</th><th>Rarity</th><th class="num">Market</th></tr></thead>
<tbody>${secretRows}</tbody></table></div>` : ''}

<h2>Cards by rarity</h2>
<div class="scroll"><table>
<thead><tr><th>Rarity</th><th class="num">Cards</th></tr></thead>
<tbody>${rarityRows}</tbody></table></div>

<h2>${esc(set.name)} checklist</h2>
<p>Every card in number order with its market price and the 9-pocket page it lands on.${set.missing.length ? ` Our card list has no entry for number${set.missing.length === 1 ? '' : 's'} ${set.missing.join(', ')}, so ${set.missing.length === 1 ? 'it is' : 'they are'} not counted above.` : ''}</p>
<div class="scroll"><table>
<thead><tr><th class="num">Number</th><th>Card</th><th>Rarity</th><th class="num">Market</th><th class="num">Page</th></tr></thead>
<tbody>${checklist}</tbody></table></div>

<h2>Make it a michi binder</h2>
<p>A set binder does not have to be a grid of numbers. <a href="${SITE}/michi-method">The michi method</a> treats each page as one picture: a single Pokémon, an evolution line, a colour, an artist. <a href="${SITE}/learn/print-binder">Print placeholders at true card size</a> and fill the pockets as the cards arrive, or browse <a href="${SITE}/sets">every set planner</a>.</p>`;

  return head({ title, description, url: setUrl(set), image: top && top.image }) + body + foot(taken, set.pricesAsOf);
}

const SERIES_ORDER = ['Mega Evolution', 'Scarlet & Violet', 'Sword & Shield', 'Base'];

export function renderHub(sets, { taken }) {
  const url = `${SITE}/sets`;
  const title = `Pokémon set binder planners: pages, pockets and checklists · ${BRAND}`;
  const byDate = sets.filter((s) => s.released).sort((a, b) => a.released.localeCompare(b.released));
  const span = byDate.length
    ? `, from ${byDate[0].name} (${byDate[0].released.slice(0, 4)}) to ${byDate[byDate.length - 1].name} (${byDate[byDate.length - 1].released.slice(0, 4)})`
    : '';
  const description = `How many binder pages each Pokémon TCG set needs, which page every card lands on, the secret rares and the most valuable cards. ${sets.length} sets${span}.`;
  const groups = new Map();
  for (const s of sets) {
    const k = s.series || 'Other';
    (groups.get(k) || groups.set(k, []).get(k)).push(s);
  }
  const order = [...groups.keys()].sort((a, b) => (SERIES_ORDER.indexOf(a) + 99) % 99 - (SERIES_ORDER.indexOf(b) + 99) % 99);
  const sections = order
    .map((k) => {
      const items = groups
        .get(k)
        .map((s) => {
          const f = setFacts(s);
          return `<li><a href="${esc(setUrl(s))}"><b>${esc(s.name)}</b><span>${plural(f.complete, 'card')} · ${f.sizes[0].pages} 9-pocket pages${f.secrets.length ? ` · ${f.secrets.length} secret rares` : ''}${s.released ? ` · ${s.released.slice(0, 4)}` : ''}</span></a></li>`;
        })
        .join('');
      return `<h2>${esc(k)}</h2>\n<ul class="hub">${items}</ul>`;
    })
    .join('\n');
  const body = `
<p class="eyebrow">Set binder planners</p>
<h1>Pokémon set binder planners</h1>
<p class="lede">Planning a binder for a whole set? Each planner counts the pages and sheets the set needs in 9-pocket, 12-pocket, 4-pocket and 16-pocket binders, shows which page every card lands on, and lists the secret rares and the most valuable cards with current market prices.</p>
<div class="cta"><a href="${SITE}/new-binder">Start a binder</a></div>
${sections}
<h2>More than a checklist</h2>
<p>Once the set is in, the pages can be more than rows of numbers. <a href="${SITE}/michi-method">See what a michi binder is</a>.</p>`;
  const newest = sets.map((s) => s.pricesAsOf).filter(Boolean).sort().pop();
  return head({ title, description, url }) + body + foot(taken, newest);
}
