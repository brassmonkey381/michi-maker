import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PLAIN_KEYS, shortcutList } from './keyboardShortcuts.ts';

test('the card lists the plain keys the editor listens for, under the same letters', () => {
  const list = shortcutList('Ctrl');
  const keys = list.map((s) => s.keys);
  assert.ok(keys.includes(PLAIN_KEYS.editMode.toUpperCase()));
  assert.ok(keys.includes(PLAIN_KEYS.artDock.toUpperCase()));
  assert.ok(keys.includes(PLAIN_KEYS.cardsDock[0].toUpperCase()));
  assert.ok(keys.includes(PLAIN_KEYS.settings.toUpperCase()));
});

test('the card stays short, and swaps only the modifier word between platforms', () => {
  const win = shortcutList('Ctrl');
  const mac = shortcutList('⌘');
  assert.ok(win.length >= 5 && win.length <= 10, `${win.length} shortcuts`);
  assert.deepEqual(
    win.map((s) => s.does),
    mac.map((s) => s.does),
  );
  assert.ok(mac.every((s) => !s.keys.includes('Ctrl')));
});
