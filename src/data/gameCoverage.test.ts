import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FEATURE_KEYS, LIVE_SHARE, sharesOf, statusOf, statusesOf } from './coverageRule.ts';
import { COVERAGE_AS_OF, COVERAGE_ROWS } from './gameCoverage.ts';
import coverage from './gameCoverage.json' with { type: 'json' };

test('live needs the share and the switch; either alone is WIP', () => {
  assert.equal(statusOf(0.7, true), 'live');
  assert.equal(statusOf(0.69, true), 'wip');
  assert.equal(statusOf(1, false), 'wip', 'a scanner model nobody can reach is not live');
  assert.equal(LIVE_SHARE, 0.7);
});

test('the report row for Cyberpunk on 2026-11-03 reads search and colour live, the rest WIP', () => {
  const s = statusesOf(sharesOf({ key: 'cyberpunk', in_app: false, released: 240, browse: 504, browse_released: 240, colour: 459, similar: 229, theme: 211, scanner: 229 }));
  assert.deepEqual(s, { search: 'live', colour: 'live', similar: 'wip', theme: 'wip', scanner: 'wip' });
});

test('the denominator is the larger of released and catalog, so a stale corpus cannot inflate a share', () => {
  const g = sharesOf({ key: 'x', in_app: true, released: 100, browse: 400, browse_released: 100, colour: 300, similar: 400, theme: 0, scanner: 400 });
  assert.equal(g.share.colour, 0.75);
  assert.equal(g.share.theme, 0);
  assert.equal(g.on.theme, false, 'a game the theme registry has not enabled is off');
  assert.equal(g.share.scanner, 1);
  assert.equal(g.on.scanner, true);
});

test('a feature that lives on a server counts as covering everything (Pokémon)', () => {
  const g = sharesOf({ key: 'pokemon', in_app: true, released: 32548, browse: 28845, browse_released: 28845, colour: 27602, similar: 'server', theme: 'own path', scanner: 23785 });
  assert.deepEqual(statusesOf(g), { search: 'live', colour: 'live', similar: 'live', theme: 'live', scanner: 'live' });
});

test('the stored statuses agree with the stored shares and switches, and the page reads them', () => {
  for (const g of coverage.games) {
    for (const k of FEATURE_KEYS) {
      assert.equal(g.status[k], statusOf(g.share[k] / 100, g.on[k]), `${g.game} ${k}`);
      if (g.status[k] === 'live') assert.ok(g.share[k] >= 70 && g.on[k], `${g.game} ${k} is live without the coverage or the switch`);
    }
    if (!g.inApp) assert.equal(g.status.scanner, 'wip', `${g.game}: the scanner is not in the app`);
  }
  assert.equal(COVERAGE_ROWS.length, coverage.games.length);
  assert.deepEqual(COVERAGE_ROWS.map((r) => r.game), coverage.games.map((g) => g.game));
  assert.match(COVERAGE_AS_OF, /^\d{4}-\d{2}-\d{2}$/);
  const liveCount = (s: Record<string, string>) => Object.values(s).filter((v) => v === 'live').length;
  for (let i = 1; i < COVERAGE_ROWS.length; i += 1) {
    assert.ok(liveCount(COVERAGE_ROWS[i - 1].status) >= liveCount(COVERAGE_ROWS[i].status), 'most live first');
  }
});
