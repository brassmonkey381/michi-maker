/**
 * MIC-029 gap 5: only our own theme backgrounds skip the safety check. Every background the app can
 * make passes the pattern; a hand-drawn SVG (any other path, text, image, script) does not.
 * The database runs the same pattern (is_procedural_svg, migration 20261114120000).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PROCEDURAL_SVG_PATTERN } from './proceduralSvgGrammar.ts';
import { THEME_BACKGROUNDS, themeBackgroundDataUri, themeBackgroundSvg } from './themeBackgrounds.ts';

const re = new RegExp(PROCEDURAL_SVG_PATTERN);
const passes = (uri: string) =>
  uri.startsWith('data:image/svg+xml,') && re.test(decodeURIComponent(uri.slice('data:image/svg+xml,'.length)));

test('every theme background the app makes is recognised, at every size it is made', () => {
  const sizes = [{}, { w: 80, h: 112, count: 5 }, { w: 500, h: 350 }, { w: 1000, h: 700 }];
  for (const t of THEME_BACKGROUNDS)
    for (const opts of sizes)
      for (const seed of [undefined, 1, 31, 99999])
        assert.ok(passes(themeBackgroundDataUri(t.id, { ...opts, seed })), `${t.id} ${JSON.stringify(opts)} ${seed}`);
});

test('a hand-drawn SVG is not recognised, so it goes to the safety check', () => {
  const base = themeBackgroundSvg(THEME_BACKGROUNDS[0].id);
  const enc = (s: string) => `data:image/svg+xml,${encodeURIComponent(s)}`;
  const bad = [
    base.replace('</svg>', '<path d="M10,10 L200,300 L50,300 Z" fill="#000"/></svg>'),
    base.replace('</svg>', '<text x="10" y="20">hi</text></svg>'),
    base.replace('</svg>', '<image href="https://example.com/x.png"/></svg>'),
    base.replace('</svg>', '<script>alert(1)</script></svg>'),
    base.replace('<rect ', '<circle r="40"/><rect '),
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0,0 C10,10 20,20 30,30 Z"/></svg>',
  ];
  for (const s of bad) assert.equal(passes(enc(s)), false, s.slice(-80));
  assert.equal(passes('https://example.com/a.svg'), false);
});
