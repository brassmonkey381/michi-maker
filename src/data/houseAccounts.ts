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
 * Everyone else first, house accounts last, each group keeping the order it arrived in.
 *
 * Stable on purpose: the caller has already ranked these by likes and that ranking is the whole
 * value of the feed. This only moves the house to the back of its queue.
 */
export function demoteHouseAccounts<T extends { author_name: string | null }>(rows: T[]): T[] {
  const members = rows.filter((r) => !isHouseAccount(r.author_name));
  const house = rows.filter((r) => isHouseAccount(r.author_name));
  return [...members, ...house];
}
