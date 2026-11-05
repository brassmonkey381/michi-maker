/**
 * Is a deployed edge function exactly what git says? node scripts/compare-live-function.mjs <slug> <rev>
 *
 * Asks the Management API for the function's source files (multipart, nothing unpacked to disk:
 * the CLI's download refuses a function that imports from outside supabase/functions, which
 * stripe-checkout does for src/data/proration.ts) and compares each with `git show <rev>:<path>`,
 * line endings normalised. Exit 0 when every file matches, 4 when any differs, 1 on any error.
 * Reads SUPABASE_ACCESS_TOKEN from the environment (the .ps1 wrapper loads it); never prints it.
 */
import { execFileSync } from 'node:child_process';

const [slug, rev] = process.argv.slice(2);
const REF = 'piikwvntldytjejxmcla';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!slug || !rev || !token) {
  console.log('FAILED: usage compare-live-function.mjs <slug> <rev>, with SUPABASE_ACCESS_TOKEN set');
  process.exit(1);
}

try {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions/${slug}/body`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'multipart/form-data' },
  });
  if (!res.ok) throw new Error(`the API answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const form = await res.formData();
  const files = [];
  for (const [, value] of form.entries()) {
    if (typeof value === 'string') continue; // metadata
    files.push(value);
  }
  if (!files.length) throw new Error('the API returned no source files');
  const norm = (s) => s.replace(/\r\n/g, '\n').trimEnd();
  const diffs = [];
  for (const f of files) {
    // Paths arrive as source/<path from the repo root>, e.g. source/src/data/proration.ts.
    const path = f.name.replace(/\\/g, '/').replace(/^\/?source\//, '');
    let want;
    try {
      want = execFileSync('git', ['show', `${rev}:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      diffs.push(`${path} (not in git at ${rev})`);
      continue;
    }
    if (norm(await f.text()) !== norm(want)) diffs.push(path);
  }
  console.log(`  ${files.length} live files compared with ${rev}`);
  if (diffs.length) {
    console.log('  differ:');
    for (const d of diffs) console.log(`    ${d}`);
    process.exit(4);
  }
  console.log('  all match');
} catch (e) {
  console.log(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
