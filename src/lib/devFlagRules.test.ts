/** The dev switch's rules (lib/devFlagRules). Run: `npm test`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEV_STORED, flagOn, resolveDev, withoutDevParam } from './devFlagRules.ts';

test('?dev=1 turns dev on and remembers it', () => {
  for (const s of ['?dev=1', '?dev', '?dev=on', '?dev=TRUE', '?a=b&dev=yes']) {
    assert.deepEqual(resolveDev(s, null), { on: true, write: DEV_STORED }, s);
  }
});

test('?dev=0 turns dev off and forgets it', () => {
  for (const s of ['?dev=0', '?dev=off', '?dev=false', '?dev=no']) {
    assert.deepEqual(resolveDev(s, DEV_STORED), { on: false, write: null }, s);
  }
});

test('no dev in the address: the remembered choice holds and storage is left alone', () => {
  assert.deepEqual(resolveDev('', DEV_STORED), { on: true, write: undefined });
  assert.deepEqual(resolveDev('?utm_medium=qa', null), { on: false, write: undefined });
  assert.deepEqual(resolveDev('', 'something-else'), { on: false, write: undefined });
});

test('an unknown dev value changes nothing', () => {
  assert.deepEqual(resolveDev('?dev=maybe', DEV_STORED), { on: true, write: undefined });
  assert.deepEqual(resolveDev('?dev=maybe', null), { on: false, write: undefined });
});

test('flag states', () => {
  assert.equal(flagOn('live', false), true);
  assert.equal(flagOn('live', true), true);
  assert.equal(flagOn('dev', true), true);
  assert.equal(flagOn('dev', false), false);
  assert.equal(flagOn('off', true), false);
  assert.equal(flagOn(undefined, true), false);
});

test('leaving dev strips only the dev param', () => {
  assert.equal(withoutDevParam('https://michi-maker.com/browse?dev=1&q=pika'), 'https://michi-maker.com/browse?q=pika');
  assert.equal(withoutDevParam('https://michi-maker.com/?dev=1'), 'https://michi-maker.com/');
});
