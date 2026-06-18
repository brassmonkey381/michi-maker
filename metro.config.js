// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Background AI-agent worktrees live under `.claude/worktrees/<agent>/` and each is a FULL
// copy of this repo (its own package.json named "poke-michi", app.json, src/, node_modules).
// Metro's haste map crawls everything under the project root, so those duplicates trigger a
// fatal "jest-haste-map: Haste module naming collision" and crash `expo start` (especially with
// `-c`, which forces a fresh crawl). Block `.claude/` from resolution and the haste map.
const blockClaude = /[\\/]\.claude[\\/].*/;
config.resolver.blockList = config.resolver.blockList
  ? [].concat(config.resolver.blockList, blockClaude)
  : blockClaude;

module.exports = config;
