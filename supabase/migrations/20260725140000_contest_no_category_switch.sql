-- Contest: category choice is FINAL. Entries can no longer be updated (switched to another
-- category) — the only ways out are withdraw (delete) or ride it to the end. Withdrawing and
-- re-entering technically re-picks a category, but resets created_at (the final tie-breaker),
-- so there's a real cost to flip-flopping.

drop policy if exists "Users can update their own entries" on public.contest_entries;
revoke update on public.contest_entries from authenticated;
