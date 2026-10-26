// THE NAMED BINDERS, from the same src/data/presets.json the app reads (owner's sheet,
// tools/presets-sheet.html). The share image runs as plain Node and cannot import the TypeScript;
// reading the JSON both sides is what keeps pageStyle.test.ts's drift check green for free.
module.exports = require('../src/data/presets.json').binders.filter((b) => b.offered !== false);
