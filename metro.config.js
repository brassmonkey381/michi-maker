// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Background AI-agent worktrees live under `.claude/worktrees/<agent>/` and each is a FULL
// copy of this repo (its own package.json named "michi-maker", app.json, src/, node_modules).
// Metro's haste map crawls everything under the project root, so those duplicates trigger a
// fatal "jest-haste-map: Haste module naming collision" and crash `expo start` (especially with
// `-c`, which forces a fresh crawl). Block `.claude/` from resolution and the haste map.
const blockClaude = /[\\/]\.claude[\\/].*/;

// Keep Metro from crawling/watching the large generated static asset dirs under public/ — the
// catalog card-image DB (thousands of files) and the browse dataset (a big catalog.json). They're
// served by Expo's static `public/` middleware, NOT the JS bundler, and nothing imports them (the
// app fetches them by URL). On Windows there's no Watchman, so Node's file-watcher chokes on that
// many files and triggers constant reloads. Excluding them from the module graph stops the churn;
// static serving is unaffected. (Ported from the sibling tcgscan-app app's metro.config.js.)
const blockPublicAssets = [
  /[/\\]public[/\\]card-imgs[/\\].*/,
  /[/\\]public[/\\]browse[/\\].*/,
];

config.resolver.blockList = config.resolver.blockList
  ? [].concat(config.resolver.blockList, blockClaude, blockPublicAssets)
  : [blockClaude, ...blockPublicAssets];

// pdf-lib ships an ES build (`module: es/index.js`) whose `import { __extends } from "tslib"`
// breaks under Metro's ESM interop ("Cannot destructure '__extends' of 'tslib.default'").
// Steer the bare `pdf-lib` import to its CJS build, which requires tslib the plain way.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'pdf-lib') {
    return context.resolveRequest(context, 'pdf-lib/cjs/index.js', platform);
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
