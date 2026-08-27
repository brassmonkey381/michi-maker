/**
 * Delete every throwaway account a test harness made, and PROVE it.
 *
 * WHY THIS IS ITS OWN FILE. All three harnesses used to sweep up by calling GoTrue's
 * `DELETE /auth/v1/admin/users/{id}` and never looking at the response. On 2026-08-27 that
 * endpoint started answering `500 Database error deleting user` for these accounts, so every run
 * reported "Cleaned up N test account(s)" while deleting none of them. Two binders named
 * "uitest one" reached the live Discover feed and were warmed into the preview CDN by the next
 * production deploy before anyone noticed. A cleanup that cannot fail out loud is not a cleanup.
 *
 * So this deletes through the management SQL endpoint, which works (the block is inside GoTrue,
 * not in the schema: `delete from auth.users` cascades cleanly through profiles and binders), and
 * then COUNTS what is left. A survivor is reported to the caller rather than swallowed.
 *
 * Storage first, and through the storage API rather than SQL: deleting a `storage.objects` row
 * leaves the actual file orphaned in the bucket, where nothing will ever collect it.
 */

/**
 * @param {object} o
 * @param {(q: string) => Promise<any[]>} o.sql   management SQL runner
 * @param {string} o.urlBase                      https://<ref>.supabase.co
 * @param {string} o.serviceKey                   secret key, for the storage API only
 * @param {string[]} o.emailPrefixes              e.g. ['michi-uitest-']
 * @returns {Promise<{deleted: number, files: number, survivors: number, error: string|null}>}
 */
export async function purgeTestAccounts({ sql, urlBase, serviceKey, emailPrefixes }) {
  const match = emailPrefixes
    .map((p) => `u.email like '${p.replace(/'/g, "''")}%'`)
    .join(' or ');
  const where = `(${match})`;
  const out = { deleted: 0, files: 0, survivors: 0, error: null };

  try {
    // 1. The bucket, before the rows that name the files disappear.
    const files = await sql(
      `select o.name from storage.objects o
         join auth.users u on u.id = o.owner
        where o.bucket_id = 'avatars' and ${where};`,
    );
    if (files.length) {
      const res = await fetch(`${urlBase}/storage/v1/object/avatars`, {
        method: 'DELETE',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefixes: files.map((f) => f.name) }),
      });
      if (res.ok) out.files = files.length;
      else out.error = `storage delete: ${res.status} ${(await res.text()).slice(0, 160)}`;
    }

    // 2. The accounts. Cascades to profiles, binders, pages and slots.
    const gone = await sql(`delete from auth.users u where ${where} returning u.email;`);
    out.deleted = gone.length;

    // 3. The part that was missing: check.
    const [left] = await sql(`select count(*)::int as n from auth.users u where ${where};`);
    out.survivors = left?.n ?? 0;
    if (out.survivors > 0) out.error = `${out.survivors} test account(s) survived cleanup`;
  } catch (e) {
    out.error = String(e.message).slice(0, 300);
  }
  return out;
}

/** Print the result the same way in every harness, and say plainly when it did not work. */
export function reportPurge(result, log = console.log) {
  if (result.deleted || result.files) {
    log(`Cleaned up ${result.deleted} test account(s) and ${result.files} avatar file(s).`);
  }
  if (result.error) {
    log(`CLEANUP FAILED: ${result.error}`);
    log('  Test data is still live. Do not leave it: public test binders show up on Discover.');
  }
  return !result.error;
}
