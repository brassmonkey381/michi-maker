import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readCheckoutResult } from './checkoutReturn.ts';

test('a successful print checkout is read once and the flag leaves the address', () => {
  const r = readCheckoutResult('https://michi-maker.com/binder/abc?page=4&checkout=success');
  assert.equal(r.result, 'success');
  assert.equal(r.clean, 'https://michi-maker.com/binder/abc?page=4');
  // The cleaned address no longer says anything, so a reload or Back is quiet.
  assert.deepEqual(readCheckoutResult(r.clean!), { result: null, clean: null });
});

test('a cancelled checkout comes back quietly, with the flag removed too', () => {
  const r = readCheckoutResult('https://michi-maker.com/binder/abc?checkout=cancelled');
  assert.equal(r.result, 'cancelled');
  assert.equal(r.clean, 'https://michi-maker.com/binder/abc');
});

test('an address with no flag, or an odd value, opens nothing', () => {
  assert.deepEqual(readCheckoutResult('https://michi-maker.com/binder/abc?page=2'), { result: null, clean: null });
  assert.equal(readCheckoutResult('https://michi-maker.com/binder/abc?checkout=maybe').result, null);
  assert.deepEqual(readCheckoutResult('not a url'), { result: null, clean: null });
});

test('the one-shot store: read once, then consumed', async () => {
  const mod = await import('./checkoutReturn.ts');
  const replaced: string[] = [];
  const g = globalThis as unknown as { window?: unknown };
  g.window = {
    location: { href: 'https://michi-maker.com/binder/abc?page=3&checkout=success' },
    history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => replaced.push(url) },
  };
  try {
    assert.equal(mod.checkoutResult(), 'success');
    assert.deepEqual(replaced, ['https://michi-maker.com/binder/abc?page=3']);
    assert.equal(mod.checkoutResult(), 'success', 'a second component on the same visit sees the same answer');
    mod.consumeCheckoutResult();
    assert.equal(mod.checkoutResult(), null, 'after the ready message, reopening the sheet is quiet');
  } finally {
    delete g.window;
  }
});
