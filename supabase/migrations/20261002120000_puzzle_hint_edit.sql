-- Change a published puzzle's hint without republishing it.
--
-- WHY (owner, 2026-10-02). A hint is the one part of a puzzle a person still writes by hand:
-- fill-queue picks the themes, the cards, the page and the date, and deliberately leaves the hint
-- empty because the hints that work are wordplay and a generated one reads like filler. But the
-- only way to set one was admin_publish_puzzle, which rewrites the card list, the picture
-- addresses, the grid and the source page to change one string. Every scheduled puzzle therefore
-- still carries no hint at all, because the cost of adding one was out of proportion to the edit.
--
-- IT CANNOT MOVE ANYTHING ELSE. Only `hint`, and only on a puzzle that already exists. An empty or
-- blank hint clears it, which is the same thing the publish form means by an empty box, so there
-- is no second way to express "no hint".
--
-- NOT A WRITE POLICY ON THE TABLE. daily_puzzles already carries one for privileged writers, but
-- going through a named function keeps the audit surface small and means this is the only
-- statement in the system that can touch a hint on its own.

create or replace function public.admin_set_puzzle_hint(p_puzzle_id uuid, p_hint text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_hint text;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  v_hint := nullif(btrim(coalesce(p_hint, '')), '');

  update public.daily_puzzles set hint = v_hint where id = p_puzzle_id;
  if not found then
    raise exception 'no such puzzle' using errcode = '42704';
  end if;

  return v_hint;
end;
$$;

revoke all on function public.admin_set_puzzle_hint(uuid, text) from public;
grant execute on function public.admin_set_puzzle_hint(uuid, text) to authenticated;

comment on function public.admin_set_puzzle_hint(uuid, text) is
  'Set or clear one puzzle hint. The only statement that can change a hint without republishing '
  'the puzzle, which would rewrite its cards, pictures, grid and source page to edit one string.';
