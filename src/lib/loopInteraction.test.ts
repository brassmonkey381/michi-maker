/**
 * NO LOOPING ANIMATION MAY BE AN "INTERACTION" (MIC-031). Run: `npm test`.
 *
 * On web, Animated never runs on the native driver, so every Animated.timing (and Animated.delay,
 * which is a timing) defaults to `isInteraction: true` and holds an InteractionManager handle
 * while it runs. A loop takes it again every cycle, so `runAfterInteractions` never fires, and
 * VirtualizedList schedules its render window through exactly that. Every FlatList on the page
 * then stops at `initialNumToRender`: in the editor's Add to pocket sheet, 12 rows of cards drew,
 * the rest of the scroll was blank, and scrolling never loaded the next page (2026-11-09).
 *
 * The rule pinned here: inside every `Animated.loop(...)`, each `Animated.timing` says
 * `isInteraction: false` and there is no `Animated.delay` (use a non-interaction timing instead).
 * It scans this app and the two shared kits it renders (tcgscan-browse, tcgscan-ui), because the
 * first offender found was the kit's own "NEW!" wiggle beside Color / Theme.
 */
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOTS = ['src', 'node_modules/tcgscan-browse/src', 'node_modules/tcgscan-ui/src'];

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(n) && !n.endsWith('.test.ts') ? [p] : [];
  });
}

/** The text of each `Animated.loop(...)` call, parentheses balanced. */
function loopSpans(src: string): string[] {
  const out: string[] = [];
  let i = src.indexOf('Animated.loop(');
  while (i >= 0) {
    let depth = 0;
    let end = i;
    for (let k = i + 'Animated.loop'.length; k < src.length; k++) {
      if (src[k] === '(') depth++;
      else if (src[k] === ')' && --depth === 0) {
        end = k + 1;
        break;
      }
    }
    out.push(src.slice(i, end));
    i = src.indexOf('Animated.loop(', end);
  }
  return out;
}

/** The body of a function or const named `name` in the file, for a loop over `loop(beat)`. */
function helperBody(src: string, name: string): string {
  const m = new RegExp(`(?:const|function)\\s+${name}\\b`).exec(src);
  if (!m) return '';
  return src.slice(m.index, m.index + 1200);
}

test('every looping animation in the app and its kits is a non-interaction', () => {
  const bad: string[] = [];
  for (const root of ROOTS) {
    for (const f of files(root)) {
      const src = readFileSync(f, 'utf8');
      for (const span of loopSpans(src)) {
        // A loop over a named sequence (`Animated.loop(beat)`, `[one(), ...]`): check those too.
        const named = [...span.matchAll(/\b([a-zA-Z_]\w*)\(\)|Animated\.loop\(\s*([a-zA-Z_]\w*)\s*[,)]/g)]
          .map((m) => m[1] ?? m[2])
          .filter((n) => n && !['Animated', 'loop'].includes(n));
        const text = [span, ...named.map((n) => helperBody(src, n))].join('\n');
        if (/Animated\.delay\(/.test(text)) bad.push(`${f}: Animated.delay inside a loop`);
        for (const t of text.matchAll(/Animated\.timing\([^,]+,\s*\{([^}]*)\}/g)) {
          if (!/isInteraction:\s*false/.test(t[1])) bad.push(`${f}: timing without isInteraction: false → ${t[0].slice(0, 80)}`);
        }
      }
    }
  }
  assert.deepEqual(bad, []);
});
