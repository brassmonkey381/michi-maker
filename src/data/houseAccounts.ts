/**
 * The project's own accounts, and the rule that keeps them out of other people's way.
 *
 * Featured binders rank by likes received in the last three days. The owner's binders are seeded
 * early, are linked from the site itself, and collect likes that a new member's binder cannot
 * match, so on merit they sit at the top of the shelf more or less permanently. That is the
 * opposite of what the section is for: it exists to put community work in front of people.
 *
 * So house binders are DEMOTED, not hidden. They still appear, still rank among themselves, and
 * an empty week still has something on the shelf. They simply queue behind every binder by
 * somebody else.
 *
 * Matching is on `username` (what the feed RPCs return as author_name), lowercased, because a
 * username is immutable in this product and a display name is not.
 */

/** Usernames belonging to the project rather than to a member. Lowercase. */
export const HOUSE_ACCOUNTS = new Set(['fakemichi']);

export const isHouseAccount = (username: string | null | undefined): boolean =>
  !!username && HOUSE_ACCOUNTS.has(username.toLowerCase());

/**
 * ONE-OFF EXEMPTIONS from the demotion above, by binder id (owner, 2026-09-11).
 *
 * The rule this suspends is a good one and stays: the house out-likes every member by seniority, so
 * without it the shelf becomes a permanent showcase of the project's own work. But a blanket rule
 * cannot tell a plain reference layout from a binder that is the best argument on the shelf for
 * what the app does, and the answer to that is a named exception rather than a weaker rule.
 *
 * Keep this SHORT. Two or three ids and the exception is a judgement; a dozen and the rule has
 * quietly been repealed without anyone deciding to repeal it.
 *
 * `anniv-thirty-years-published` is "Thirty Years, Thirty Pages", which ships as a bundled example
 * AND is published to the house account so it can be shared and ranked. It must be published under
 * exactly this id for the exemption to find it.
 */
export const DEMOTION_EXEMPT_BINDERS = new Set(['4493ccbc-8ae0-4874-ab27-7253b40d7e47']);

/** Is this row exempt? Rows come from the featured RPC, which names the binder `binder_id`. */
function isExempt(row: { binder_id?: string | null; id?: string | null }): boolean {
  const id = row.binder_id ?? row.id;
  return !!id && DEMOTION_EXEMPT_BINDERS.has(id);
}

/**
 * Everyone else first, house accounts last, each group keeping the order it arrived in.
 *
 * Stable on purpose: the caller has already ranked these by likes and that ranking is the whole
 * value of the feed. This only moves the house to the back of its queue.
 *
 * An EXEMPT house binder is treated as a member's for ordering: it keeps the rank its likes earned
 * rather than being moved either to the front or to the back. The exemption is permission to
 * compete, not a reserved seat.
 */
export function demoteHouseAccounts<T extends { author_name: string | null; binder_id?: string | null; id?: string | null }>(
  rows: T[],
): T[] {
  const demoted = (r: T) => isHouseAccount(r.author_name) && !isExempt(r);
  const members = rows.filter((r) => !demoted(r));
  const house = rows.filter((r) => demoted(r));
  return [...members, ...house];
}
