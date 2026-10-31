/**
 * THE RULES. Each one is a question a thumb would ask of a phone screen, answered from the DOM
 * after an action. They catch clipped, covered, orphaned, dead, slow and wrong-tier; they do not
 * judge taste, which is why the report leads with screenshots.
 *
 * A rule returns findings: { rule, severity, summary, detail?, selector? }. `severity` is the
 * triage priority the draft item will carry: P1 blocks a flow, P2 is wrong but survivable, P3 is
 * polish. Keep summaries one line and stable: the dedupe key is route + rule + summary.
 */

/** The in-page measurement, run once per screen. Pure DOM, no app globals. */
export async function measureScreen(page) {
  return page.evaluate(() => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) !== 0;
    };
    const name = (el) =>
      (el.getAttribute('aria-label') || el.getAttribute('data-testid') || (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60)) || el.tagName.toLowerCase();
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };

    const inHScroll = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (p.scrollWidth > p.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(p).overflowX)) return true;
      }
      return false;
    };
    const interactive = [...document.querySelectorAll('button, a[href], [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], [role="menuitem"], input, textarea, select')].filter(vis);
    const targets = interactive.map((el) => ({
      name: name(el),
      box: box(el),
      disabled: el.getAttribute('aria-disabled') === 'true' || el.disabled === true,
      testid: el.getAttribute('data-testid'),
      button: el.tagName === 'BUTTON' || el.getAttribute('role') === 'button',
      carousel: inHScroll(el),
    }));
    // Toggle states, so a tap that only flips a switch still counts as a response.
    const stateSig = interactive.map((el) => `${el.getAttribute('aria-pressed') ?? ''}${el.getAttribute('aria-expanded') ?? ''}${el.getAttribute('aria-selected') ?? ''}${el.getAttribute('aria-checked') ?? ''}`).join('');

    // Sideways scrolling: the page itself, or any box that scrolls on x. A phone bar that scrolls
    // sideways is a rule of this app (mobile FTUE rules, 2026-10-29).
    const pageOverflow = document.scrollingElement ? document.scrollingElement.scrollWidth - W : 0;
    const sideways = [];
    for (const el of document.querySelectorAll('*')) {
      if (el.scrollWidth <= el.clientWidth + 2) continue;
      const cs = getComputedStyle(el);
      if (!/auto|scroll/.test(cs.overflowX)) continue;
      if (!vis(el)) continue;
      const b = box(el);
      if (b.w < 120) continue;
      // A carousel of binders or cards scrolls sideways on purpose; a row of chips or tools does not.
      const kids = [...el.children].filter(vis);
      const widest = Math.max(0, ...kids.map((k) => k.getBoundingClientRect().width));
      if (widest > 140) continue;
      sideways.push({ name: name(el), box: b, extra: el.scrollWidth - el.clientWidth, testid: el.getAttribute('data-testid') });
      if (sideways.length >= 6) break;
    }

    // Clipped text: a text node's box wider than its container with overflow hidden and no ellipsis.
    const clipped = [];
    for (const el of document.querySelectorAll('div, span, p, h1, h2, h3, h4, a, button')) {
      if (el.children.length) continue;
      const t = (el.textContent || '').trim();
      if (t.length < 3) continue;
      if (el.scrollWidth <= el.clientWidth + 2) continue;
      const cs = getComputedStyle(el);
      if (cs.overflow !== 'hidden' && cs.overflowX !== 'hidden') continue;
      if (cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none') continue;
      if (!vis(el)) continue;
      clipped.push({ text: t.slice(0, 50), box: box(el) });
      if (clipped.length >= 6) break;
    }

    // Orphaned rows: a wrapping flex row where one row holds a single child and another holds three
    // or more (the Art chip and the gear each alone on a row, 2026-10-30).
    const orphans = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.display !== 'flex' || cs.flexWrap !== 'wrap') continue;
      const kids = [...el.children].filter(vis);
      if (kids.length < 4) continue;
      const centers = kids.map((k) => { const r = k.getBoundingClientRect(); return r.top + r.height / 2; }).sort((a, b) => a - b);
      const counts = [];
      let last = -1e9;
      for (const c of centers) {
        if (c - last > 14) counts.push(0);
        counts[counts.length - 1] += 1;
        last = c;
      }
      if (counts.length >= 2 && counts.some((c) => c === 1) && counts.some((c) => c >= 3)) {
        orphans.push({ name: name(el), box: box(el), rows: counts, testid: el.getAttribute('data-testid') });
      }
      if (orphans.length >= 4) break;
    }

    // Overlapping controls: two interactive boxes sharing more than half of the smaller one.
    const overlaps = [];
    for (let i = 0; i < targets.length && overlaps.length < 6; i += 1) {
      for (let j = i + 1; j < targets.length; j += 1) {
        const a = targets[i].box;
        const b = targets[j].box;
        const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        const inter = ix * iy;
        const small = Math.min(a.w * a.h, b.w * b.h);
        if (small > 400 && inter > small * 0.5 && !(a.w * a.h > 4 * b.w * b.h || b.w * b.h > 4 * a.w * a.h)) {
          overlaps.push({ a: targets[i].name, b: targets[j].name, box: a });
          break;
        }
      }
    }

    // Tiny text, visible, with real words in it.
    const tiny = [];
    for (const el of document.querySelectorAll('span, p, div, a, button')) {
      if (el.children.length) continue;
      const t = (el.textContent || '').trim();
      if (t.length < 4 || !/[a-z]{3}/i.test(t)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs >= 11 || !vis(el)) continue;
      tiny.push({ text: t.slice(0, 40), size: fs });
      if (tiny.length >= 4) break;
    }

    // What a thumb would actually hit at each control's centre: a banner, toast or chip parked over
    // a control is the defect the walkthrough and the page bar both had on phones.
    for (const t of targets) {
      const hit = document.elementFromPoint(t.box.x + t.box.w / 2, t.box.y + t.box.h / 2);
      if (!hit) continue;
      const el = interactive.find((e) => name(e) === t.name && box(e).x === t.box.x && box(e).y === t.box.y);
      if (el && !(el === hit || el.contains(hit))) {
        // A sheet, dock or dialog over the page is the page's own design; a toast, a banner or a
        // chip parked over a control is not. Only the small covers count.
        if (hit.closest('[role="dialog"], [aria-modal="true"]')) continue;
        const cover = hit.closest('[role="alert"], [role="status"], [data-testid], button, [role="button"]') || hit;
        const cb = box(cover);
        if (cb.h > H * 0.5 || cb.w * cb.h > W * H * 0.4) continue;
        t.coveredBy = name(cover);
      }
    }
    const alerts = [...document.querySelectorAll('[role="alert"], [role="status"]')].filter(vis).map((el) => ({
      text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160),
      buttons: el.querySelectorAll('button, [role="button"]').length,
      box: box(el),
    }));
    const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].filter(vis).length;
    const bodyText = (document.body.innerText || '').replace(/\s+/g, ' ');

    return { W, H, targets, stateSig, pageOverflow, sideways, clipped, orphans, overlaps, tiny, alerts, dialogs, bodyText, textLen: bodyText.length };
  });
}

/** Findings for one screen, from a measurement. `persona` is 'guest' or 'free'. */
export function screenFindings(m, { persona }) {
  const out = [];
  if (m.pageOverflow > 2) out.push({ rule: 'page-scrolls-sideways', severity: 'P2', summary: `the page is ${m.pageOverflow}px wider than the phone` });
  for (const s of m.sideways) {
    out.push({ rule: 'sideways-bar', severity: 'P2', summary: `"${s.name}" scrolls sideways by ${s.extra}px`, detail: s });
  }
  // ONE FINDING PER RULE PER SCREEN for the element rules, keyed on the first offender, so a
  // screen with forty tiny dots is one row in the report and one draft, not forty.
  const group = (rule, severity, items, word) => {
    if (!items.length) return;
    const first = items[0];
    out.push({
      rule,
      severity,
      key: first.name ?? first.text,
      summary: `${items.length} ${word}, e.g. ${first.label}`,
      detail: items.slice(0, 8),
    });
  };
  group('clipped-text', 'P3', m.clipped.map((c) => ({ ...c, label: `"${c.text}"` })), 'texts cut off');
  group('tiny-text', 'P3', m.tiny.map((t) => ({ ...t, label: `${t.size}px "${t.text}"` })), 'texts under 11px');
  for (const o of m.orphans) out.push({ rule: 'orphaned-row', severity: 'P2', summary: `"${o.name}" wraps to rows of ${o.rows.join('/')}`, detail: o });
  for (const o of m.overlaps) out.push({ rule: 'controls-overlap', severity: 'P2', summary: `"${o.a}" sits over "${o.b}"`, detail: o });
  const live = m.targets.filter((t) => !t.disabled && t.box.w > 0);
  group('small-target', 'P3', live.filter((t) => t.button && (t.box.w < 24 || t.box.h < 24)).map((t) => ({ ...t, label: `"${t.name}" ${t.box.w}x${t.box.h}px` })), 'buttons under 24px');
  group('control-off-screen', 'P2', live.filter((t) => !t.carousel && (t.box.x < -2 || t.box.x + t.box.w > m.W + 2)).map((t) => ({ ...t, label: `"${t.name}"` })), 'controls past the phone\'s edge');
  const covered = live.filter((t) => t.coveredBy && t.box.y >= 0 && t.box.y + t.box.h <= m.H);
  const byCover = new Map();
  for (const t of covered) byCover.set(t.coveredBy, [...(byCover.get(t.coveredBy) ?? []), t]);
  for (const [cover, ts] of byCover) {
    out.push({ rule: 'control-covered', severity: 'P2', key: cover, summary: `"${cover}" sits over ${ts.length} control(s), e.g. "${ts[0].name}"`, detail: ts.slice(0, 8) });
  }
  if (persona === 'guest' && /\bPRO\b/.test(m.bodyText)) out.push({ rule: 'pro-shown-to-guest', severity: 'P2', summary: 'the word PRO is on a guest screen' });
  if (/—/.test(m.bodyText)) out.push({ rule: 'em-dash', severity: 'P3', summary: 'an em-dash is on screen' });
  for (const a of m.alerts) {
    if (/create (a free |an )?account/i.test(a.text) && a.buttons === 0) {
      out.push({ rule: 'wall-without-button', severity: 'P2', summary: `a wall toast with no button: "${a.text.slice(0, 60)}"`, detail: a });
    }
  }
  return out;
}

/** Findings about what an action did. */
export function actionFindings({ target, before, after, responseMs, consoleErrors, dialogClosed, requests = 0 }) {
  const out = [];
  const changed = before.url !== after.url || before.textLen !== after.textLen || before.dialogs !== after.dialogs || before.bodyText !== after.bodyText || before.stateSig !== after.stateSig || requests > 0;
  if (!changed && !dialogClosed && !target.disabled) {
    out.push({ rule: 'no-response', severity: 'P2', summary: `tapping "${target.name}" changed nothing on screen`, detail: target });
  } else if (changed && responseMs > 2000) {
    out.push({ rule: 'slow-response', severity: 'P3', summary: `"${target.name}" took ${responseMs}ms to show a change`, detail: target });
  }
  for (const e of consoleErrors) out.push({ rule: 'console-error', severity: 'P2', summary: `after "${target.name}": ${e.slice(0, 120)}`, detail: { target, error: e } });
  return out;
}

/** Names a crawler never taps: destructive, money, sign-out, or leaving the site. */
export const NEVER_TAP = /delete|remove|sign out|log out|logout|pay|buy|checkout|subscribe|unsubscribe|cancel|upgrade|trial|purchase|report|print|download|share|copy link|continue with google|apple/i;
