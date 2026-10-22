import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PLAIN_KEYS, SHORTCUT_GROUPS, shortcutGroups, shortcutList } from './keyboardShortcuts.ts';

test('every shortcut sits under exactly one of the three headings, none empty', () => {
  const groups = shortcutGroups('Ctrl');
  assert.deepEqual(groups.map((g) => g.title), [...SHORTCUT_GROUPS]);
  assert.equal(groups.reduce((n, g) => n + g.items.length, 0), shortcutList('Ctrl').length);
  // Nine since Complete page took C (owner, 2026-10-22, the day Arrange took G); still one short column per heading.
  for (const g of groups) assert.ok(g.items.length >= 3 && g.items.length <= 9, `${g.title}: ${g.items.length}`);
});

test('the card lists the plain keys the editor listens for, under the same letters', () => {
  const list = shortcutList('Ctrl');
  const keys = list.map((s) => s.keys);
  assert.ok(keys.includes(PLAIN_KEYS.editMode.toUpperCase()));
  assert.ok(keys.includes(PLAIN_KEYS.artDock.toUpperCase()));
  assert.ok(keys.includes(PLAIN_KEYS.cardsDock[0].toUpperCase()));
  assert.ok(keys.includes(PLAIN_KEYS.complete.toUpperCase()));
  assert.equal(list.find((s) => s.keys === 'C')?.does, 'Complete page');
  assert.ok(keys.some((k) => k.includes('wheel')));
  assert.ok(keys.includes(PLAIN_KEYS.settings.toUpperCase()));
  assert.ok(keys.includes(PLAIN_KEYS.quickPreview.toUpperCase()));
  assert.ok(keys.includes(PLAIN_KEYS.share.toUpperCase()));
  assert.ok(keys.includes(PLAIN_KEYS.print.toUpperCase()));
  assert.ok(keys.includes(PLAIN_KEYS.fullImage.toUpperCase()));
  assert.ok(keys.includes(PLAIN_KEYS.movePage.toUpperCase()));
  assert.ok(keys.includes(PLAIN_KEYS.newPage.toUpperCase()));
  assert.ok(keys.includes('Esc'));
});

test('the card stays short, and swaps only the modifier word between platforms', () => {
  const win = shortcutList('Ctrl');
  const mac = shortcutList('⌘');
  // Sixteen at most (owner, 2026-10-16, up from fifteen when F joined the same day P did;
  // fourteen on 2026-10-13 when R did; thirteen on 2026-10-12 when N did; twelve on 2026-09-16
  // when S, Q, W and Esc did): still one screen, though the card is due a grouping.
  // M (merge / split) left the same day: fifteen.
  // Seventeen on 2026-10-22, when C became Complete page and D kept the Cards dock alone.
  assert.ok(win.length >= 5 && win.length <= 17, `${win.length} shortcuts`);
  assert.ok(!win.some((s) => s.keys === 'M'), 'M is gone');
  assert.deepEqual(
    win.map((s) => s.does),
    mac.map((s) => s.does),
  );
  assert.ok(mac.every((s) => !s.keys.includes('Ctrl')));
});
