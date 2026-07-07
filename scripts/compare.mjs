// Pixel-diff two screenshot sets. Usage: node scripts/compare.mjs <dirA> <dirB> [name...]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const SCRATCH = 'C:/Users/Brian/AppData/Local/Temp/claude/C--Users-Brian-source-repos-poke-michi/dced3129-7ca3-4c03-a98f-9e372f418d5b/scratchpad';
const [a, b, ...names] = process.argv.slice(2);
const list = names.length ? names : ['01-home', '03-editor', '05-cardpicker', '06-picker-artwork'];

for (const name of list) {
  const pa = `${SCRATCH}/${a}/${name}.png`, pb = `${SCRATCH}/${b}/${name}.png`;
  if (!existsSync(pa) || !existsSync(pb)) { console.log(`${name}: MISSING (${existsSync(pa) ? '' : a} ${existsSync(pb) ? '' : b})`); continue; }
  const ia = PNG.sync.read(readFileSync(pa)), ib = PNG.sync.read(readFileSync(pb));
  if (ia.width !== ib.width || ia.height !== ib.height) { console.log(`${name}: SIZE MISMATCH ${ia.width}x${ia.height} vs ${ib.width}x${ib.height}`); continue; }
  const diff = new PNG({ width: ia.width, height: ia.height });
  const n = pixelmatch(ia.data, ib.data, diff.data, ia.width, ia.height, { threshold: 0.1 });
  const total = ia.width * ia.height;
  const pct = ((n / total) * 100).toFixed(3);
  if (n > 0) writeFileSync(`${SCRATCH}/${b}/${name}.diff.png`, PNG.sync.write(diff));
  console.log(`${name}: ${n} diff px / ${total} (${pct}%)${n > 0 ? '  -> ' + name + '.diff.png' : '  ✓ identical'}`);
}
