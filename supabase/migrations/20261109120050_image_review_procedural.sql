-- MIC-029: OUR OWN PROCEDURAL BACKGROUNDS NEED NO CHECK.
--
-- The first apply showed the longest image_url values are ~26 KB data:image/svg+xml URIs: the theme
-- backgrounds src/data/themeBackgrounds.ts draws (gradients and shapes, only url(#id) references
-- inside the SVG). The checker cannot send an SVG to the model, so each would end "unchecked" and
-- hold its page. They are approved here as "procedural" without a check, ONLY when the SVG cannot
-- carry a picture: no <image>, no <foreignObject>, no href, no url() that points outside the SVG.
-- Any other inline SVG still goes through the queue (and, unclassifiable, waits for a person).
--
-- Applied after 20261109120000 and before the visitor policy (20261109120100). Rerun-safe, one
-- transaction.

begin;

create or replace function public.is_procedural_svg(p_url text)
returns boolean language sql immutable as $$
  select p_url is not null
     and p_url like 'data:image/svg+xml%'
     and p_url !~* '(%3c|<)\s*(image|foreignobject)'
     and p_url !~* 'href'
     and p_url !~* 'url\((?!(%23|#))';
$$;

-- New and changed images: a procedural background is approved on the spot.
create or replace function public.binder_slots_image_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.image_url is distinct from old.image_url then
    if new.image_url is null then
      new.image_review := 'approved'; -- a card slot: nothing to check
    elsif public.is_procedural_svg(new.image_url) then
      new.image_review := 'approved';
      new.image_reviewed_at := now();
      new.image_review_label := 'procedural';
    else
      new.image_review := 'pending';
      new.image_reviewed_at := null;
      new.image_review_label := null;
    end if;
  end if;
  return new;
end $$;

-- Existing ones: approved (the page-hold trigger recomputes each page as the rows change).
update public.binder_slots
   set image_review = 'approved', image_reviewed_at = now(), image_review_label = 'procedural'
 where public.is_procedural_svg(image_url) and image_review <> 'approved';

-- Their queue rows: closed as safe, so the worker never tries them (and none is counted as a flag).
update public.image_reviews
   set status = 'done', label = 'safe', reason = 'Procedural background (our own SVG), no check needed',
       checked_at = now()
 where public.is_procedural_svg(image_url)
   and (status in ('queued', 'working', 'error') or label = 'unchecked');

commit;
