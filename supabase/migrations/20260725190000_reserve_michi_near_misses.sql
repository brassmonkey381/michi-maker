-- Phonetic near-misses: handles that READ as the brand without containing the literal "michi",
-- so the contains rule never sees them — mitchi, mishi, meechi, michee, mychi.
--
-- EXACT, not contains, on purpose. As substrings these would be indiscriminate: "miche" sits
-- inside michelle, "mishi" inside the surname Mishima. Exact matching refuses the impersonating
-- handle itself and leaves real names alone (michelle, mitchell, mishima, michaela, mitch, michel
-- are all verified still claimable). The one compound worth a contains rule is 'mitchimaker',
-- which nobody types innocently.
--
-- ⚠️ KNOWN SIDE EFFECT: matching compares FOLDED forms, and the fold collapses repeated letters,
-- so 'michee' also covers "miche" and 'meechi' also covers "mechi". Blocking those short forms is
-- a deliberate acceptance, not an oversight — drop the term if you'd rather have them back:
--     delete from public.reserved_usernames where term = 'michee';
insert into public.reserved_usernames (term, match_type, reason) values
  ('mitchi', 'exact', 'brand'),
  ('mishi',  'exact', 'brand'),
  ('meechi', 'exact', 'brand'),
  ('michee', 'exact', 'brand'),
  ('mychi',  'exact', 'brand'),
  ('mitchimaker', 'contains', 'brand')
on conflict (term) do nothing;

-- Hold them for the brand account, consistent with the other brand terms.
update public.reserved_usernames
   set claimable_by = (select id from auth.users where email = 'official@michi-maker.com')
 where term in ('mitchi','mishi','meechi','michee','mychi','mitchimaker')
   and exists (select 1 from auth.users where email = 'official@michi-maker.com');
