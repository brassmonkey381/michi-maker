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

  console.log('Step 2: units by ACCOUNT, then collection (codes are numbered per account)');
  const rows = await sql(`
    select u.user_id, coalesce(au.email, '(no email: guest)') as email, c.name as collection, u.id, u.kind, u.code,
           u.name, u.parent_id, u.created_at, u.updated_at,
           (u.kind = 'stack' and (u.parent_id is null or not exists (
              select 1 from public.storage_units b where b.user_id=u.user_id and b.id=u.parent_id and b.kind='box'))) as orphan
    from public.storage_units u
    join public.collections c on c.user_id=u.user_id and c.id=u.collection_id
    left join auth.users au on au.id=u.user_id
    order by (au.email is null), au.email, u.user_id, c.name, u.kind, u.code nulls last;`);
  const accounts = [...new Set(rows.map((r) => r.user_id))];
  console.log(`  ${accounts.length} account(s) hold storage units`);
  const mask = (e) => (e.includes('@') ? `${e.slice(0, 3)}***@${e.split('@')[1]}` : e);
  let lastUser = '';
  let lastCol = '';
  for (const r of rows) {
    if (r.user_id !== lastUser) {
      console.log(`  ACCOUNT ${mask(r.email)} (${r.user_id.slice(0, 8)})`);
      lastUser = r.user_id;
      lastCol = '';
    }
    if (r.collection !== lastCol) console.log(`    [${r.collection}]`);
    lastCol = r.collection;
    const code = `${{ binder: 'Bi', box: 'Bo', stack: 'S', other: '?' }[r.kind]}${r.code ?? '-'}`;
    const parent = r.parent_id ? rows.find((x) => x.user_id === r.user_id && x.id === r.parent_id) : null;
    const box = r.parent_id ? ` in ${parent?.kind === 'box' ? `Bo${parent.code ?? '-'}` : 'MISSING BOX'}` : '';
    console.log(`      ${code.padEnd(6)} ${r.kind.padEnd(6)}${box}${r.name ? `  "${r.name}"` : ''}${r.orphan ? '  <- ORPHAN' : ''}`);
  }
  const dups = rows.filter((r, i) => r.code != null && rows.findIndex((x) => x.user_id === r.user_id && x.kind === r.kind && x.code === r.code) !== i);
  console.log(`  duplicate codes inside one account: ${dups.length}`);
  for (const o of rows.filter((r) => r.orphan)) {
    console.log(`  ORPHAN ${o.id} in "${o.collection}" (${mask(o.email)}): parent_id=${o.parent_id ?? 'null'}`);
    const [elsewhere] = o.parent_id
      ? await sql(`select kind, collection_id from public.storage_units where user_id='${o.user_id}' and id='${o.parent_id}';`)
      : [];
    console.log(`    that parent id ${elsewhere ? `exists as a ${elsewhere.kind} in collection ${elsewhere.collection_id}` : 'does not exist on the server'}; stack updated ${o.updated_at}, created ${o.created_at}`);
  }
  console.log('DONE (nothing was changed)');
} catch (e) {
  console.log(`FAILED: ${e.message}`);
  process.exit(1);
}
