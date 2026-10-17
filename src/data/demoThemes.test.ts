import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEMO_THEMES, DEMO_THEMES_BY_GAME, demoThemesFor, nextDemoTheme } from './demoThemes.ts';
import { FREE_THEME } from './freeTheme.ts';

test('every game rotates through its own list, the free theme first, nothing twice', () => {
  for (const [game, list] of Object.entries(DEMO_THEMES_BY_GAME)) {
    assert.equal(list[0], FREE_THEME, `${game} leads with the free theme`);
    assert.equal(new Set(list).size, list.length, `${game} has no duplicates`);
    assert.ok(list.length >= 15, `${game} has a real rotation (${list.length})`);
    for (const t of list) assert.ok(/^[a-z]+$/.test(t), `${game}: ${t} is one plain word`);
  }
  assert.equal(demoThemesFor('pokemon'), DEMO_THEMES);
  assert.equal(demoThemesFor('nosuchgame'), DEMO_THEMES);
});

test('the next theme comes from the game asked for and never repeats the one on screen', () => {
  for (let i = 0; i < 50; i++) {
    const t = nextDemoTheme('clouds', 'onepiece');
    assert.ok(DEMO_THEMES_BY_GAME.onepiece.includes(t) && t !== 'clouds', t);
    const p = nextDemoTheme('forest');
    assert.ok(DEMO_THEMES.includes(p) && p !== 'forest', p);
  }
});
