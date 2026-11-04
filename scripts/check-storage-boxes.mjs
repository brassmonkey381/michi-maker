/**
 * READ-ONLY: is the boxes-and-codes migration (20261103120000) applied, and what do the storage
 * units look like? Prints the columns, then every unit grouped by collection: code, kind, its box,
 * nickname, and whether it is an orphan (a stack with no box, or a box id that does not exist).
 * Changes nothing. Run through check-storage-boxes.ps1 at the workspace root.
 */
const PROJECT_REF = 'piikwvntldytjejxmcla';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.log('FAILED: SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');
  process.exit(2);
}
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : [];
}
try {
  console.log('Step 1: is the migration applied?');
  const cols = await sql(`select column_name from information_schema.columns
    where table_schema='public' and table_name='storage_units' and column_name in ('parent_id','code');`);
  const [chk] = await sql(`select pg_get_constraintdef(c.oid) as def from pg_constraint c
    join pg_class t on t.oid=c.conrelid where t.relname='storage_units' and c.conname='storage_units_kind_check';`);
  const applied = cols.length === 2 && chk?.def.includes("'box'");
  console.log(`  parent_id/code columns: ${cols.map((c) => c.column_name).join(', ') || 'MISSING'}`);
  console.log(`  kind allows box: ${chk?.def.includes("'box'") ? 'yes' : 'NO'}`);
  console.log(applied ? '  APPLIED' : '  NOT APPLIED: the app update reads columns that do not exist, so sync fails');
  if (!applied) process.exit(0);

  console.log('Step 2: units by collection');
  const rows = await sql(`
    select c.name as collection, u.id, u.kind, u.code, u.name, u.parent_id,
           (u.kind = 'stack' and (u.parent_id is null or not exists (
              select 1 from public.storage_units b where b.user_id=u.user_id and b.id=u.parent_id and b.kind='box'))) as orphan,
           u.updated_at
    from public.storage_units u join public.collections c on c.user_id=u.user_id and c.id=u.collection_id
    order by c.name, u.kind, u.code nulls last;`);
  let last = '';
  for (const r of rows) {
    if (r.collection !== last) console.log(`  [${r.collection}]`);
    last = r.collection;
    const code = `${{ binder: 'Bi', box: 'Bo', stack: 'S', other: '?' }[r.kind]}${r.code ?? '-'}`;
    const box = r.parent_id ? ` in ${rows.find((x) => x.id === r.parent_id)?.kind === 'box' ? `Bo${rows.find((x) => x.id === r.parent_id).code ?? '-'}` : 'MISSING BOX'}` : '';
    console.log(`    ${code.padEnd(6)} ${r.kind.padEnd(6)}${box}${r.name ? `  "${r.name}"` : ''}${r.orphan ? '  <- ORPHAN' : ''}`);
  }
  console.log(`  ${rows.filter((r) => r.orphan).length} orphan stack(s)`);
  console.log('DONE (nothing was changed)');
} catch (e) {
  console.log(`FAILED: ${e.message}`);
  process.exit(1);
}
