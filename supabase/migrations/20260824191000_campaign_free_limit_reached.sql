-- Audience for ONE campaign: free accounts that have actually run into a michi limit.
--
-- Enrolment (who may be mailed at all) and targeting (who this particular message is for) are
-- different questions, and mixing them is how a "you have hit your limit" note reaches someone
-- with one binder. `marketing_recipients` answers the first. This answers the second, and it is
-- deliberately a separate object so it can be dropped when the campaign is done without touching
-- the consent machinery.
--
-- The rule, from the owner: free tier, AND either at the binder cap or holding a binder at the
-- page cap. Either wall counts, because either one is a person who wanted more room and did not
-- get it. This view is the ONLY thing a send should be built from; a hand-written variant is how
-- someone ends up mailing paying customers about the free plan.
--
-- CAPS COME FROM `tier_caps`, not from constants pasted in here. That table is the single source
-- the app's enforcement reads (20260724050000), so if the free plan ever moves from 3 binders or
-- 16 pages, this audience follows it instead of quietly describing a limit that no longer exists.
--
-- ARCHIVED AND DEMO BINDERS DO NOT COUNT, matching the app: archived binders are what the app
-- itself excludes when it decides whether you are at the cap, and demo binders were never yours.
-- Counting them would tell someone they are full when the product does not think so.

create or replace view public.campaign_free_limit_reached as
  with caps as (
    select
      (select value from public.tier_caps
        where app = 'michi' and tier = 'free' and limit_key = 'binders') as binder_cap,
      (select value from public.tier_caps
        where app = 'michi' and tier = 'free' and limit_key = 'pagesPerBinder') as page_cap
  ),
  owned as (
    select b.owner_id,
           count(*) as binders,
           coalesce(max((select count(*) from public.binder_pages g where g.binder_id = b.id)), 0)
             as biggest_binder_pages
      from public.binders b
     where b.archived_at is null
       and coalesce(b.is_demo, false) = false
     group by b.owner_id
  )
  select r.user_id, r.email, r.username,
         o.binders, o.biggest_binder_pages,
         (o.binders >= c.binder_cap)              as at_binder_cap,
         (o.biggest_binder_pages >= c.page_cap)   as at_page_cap
    from public.marketing_recipients r
    join owned o on o.owner_id = r.user_id
   cross join caps c
   where public.michi_tier(r.user_id) = 'free'
     and (o.binders >= c.binder_cap or o.biggest_binder_pages >= c.page_cap);

revoke all on public.campaign_free_limit_reached from anon, authenticated;

comment on view public.campaign_free_limit_reached is
  'Free accounts at the binder or page cap, already enrolled for product email. Build the '
  '"you have hit your free limit" send from this and nothing else. Includes the owner''s own '
  'accounts, which should be dropped or used as the test send.';
