/**
 * MIC-077: a view chip's round trip, under the React Compiler the app ships with (app.json
 * "reactCompiler": true). The hook is compiled exactly as the build does, then "rendered" twice by
 * a tiny stand-in for React that keeps one memo cache per component, the way React does. Without
 * the compiler this bug was invisible: the plain hook re-read the Map on every render.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const babel = require('@babel/core');

function compiledHook() {
  const file = new URL('./editedPrefs.ts', import.meta.url);
  const { code } = babel.transformSync(readFileSync(file, 'utf8'), {
    filename: 'editedPrefs.ts',
    babelrc: false,
    configFile: false,
    presets: [[require.resolve('@babel/preset-typescript'), { allExtensions: true }]],
    plugins: [require.resolve('babel-plugin-react-compiler'), require.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  assert.match(code, /_c\(|compiler-runtime/, 'the React Compiler ran on the hook');

  // One component instance: a memo cache that lives across renders, hooks called in order.
  let cache: unknown[] | null = null;
  let hookSlots: unknown[] = [];
  let slot = 0;
  const sentinel = Symbol.for('react.memo_cache_sentinel');
  const fakeReact = {
    useCallback: (fn: unknown, deps: unknown[]) => {
      const i = slot++;
      const prev = hookSlots[i] as { fn: unknown; deps: unknown[] } | undefined;
      if (prev && prev.deps.every((d, j) => Object.is(d, deps[j]))) return prev.fn;
      hookSlots[i] = { fn, deps };
      return fn;
    },
    useSyncExternalStore: (_sub: unknown, get: () => unknown) => (slot++, get()),
  };
  const runtime = { c: (n: number) => (cache ??= Array.from({ length: n }, () => sentinel)) };
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  new Function('require', 'module', 'exports', code!)(
    (id: string) => (id === 'react' ? fakeReact : id === 'react/compiler-runtime' ? runtime : require(id)),
    mod,
    mod.exports,
  );
  const render = <T,>(key: string, userId: string | null): T | null => {
    slot = 0;
    return (mod.exports.useEditedPref as (k: string, u: string | null) => T | null)(key, userId);
  };
  return { render, set: mod.exports.setEditedPref as (k: string, u: string | null, v: unknown) => void };
}

test('a chip turned on, then off, shows each change on the next render (MIC-077)', () => {
  const { render, set } = compiledHook();
  assert.equal(render('binderView', 'u1'), null, 'nothing chosen yet');
  set('binderView', 'u1', { owned: true });
  assert.deepEqual(render('binderView', 'u1'), { owned: true }, 'on shows on');
  set('binderView', 'u1', { owned: false });
  assert.deepEqual(render('binderView', 'u1'), { owned: false }, 'off shows off');
});

test("another account never sees this account's choice", () => {
  const { render, set } = compiledHook();
  set('cardLabels', 'u1', { on: false });
  assert.equal(render('cardLabels', 'u2'), null);
  assert.deepEqual(render('cardLabels', 'u1'), { on: false });
});
