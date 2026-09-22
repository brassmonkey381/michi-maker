# Feedback and surveys

`/feedback` is michi-maker's feedback page. It is built as a **generic survey system** because the
second customer was known before the first one shipped: tcgscan.ai gets the same thing with one
new file. This doc is how it fits together, how to change the questions, and how to stand it up in
another app.

## The shape

```
supabase/migrations/20260922120000_feedback_responses.sql   one table, every app
src/data/survey/surveyTypes.ts      the question vocabulary       APP-AGNOSTIC
src/data/survey/surveyState.ts      visibility, gating, payload   APP-AGNOSTIC (+ .test.ts)
src/data/survey/surveyRepo.ts       the submit, session first     APP-AGNOSTIC
src/components/survey/SurveyControls.tsx  the six controls        APP-AGNOSTIC
src/components/survey/SurveyForm.tsx      the renderer            APP-AGNOSTIC
src/data/surveys/michiFeedback.ts   THE QUESTIONS                 michi-maker only
src/app/feedback.tsx                the route                     michi-maker only
```

A survey is **data**. Adding a question, reordering a section, or launching a second survey is an
edit to a definition file. It is never a migration and never a new component.

## Changing the questions

Edit `src/data/surveys/michiFeedback.ts`.

- **Adding** a question: give it a new `id` and ship. Nothing else to do; the roll-up RPC picks up
  any new numeric answer automatically, keyed by that id.
- **Changing what a question MEANS**: bump `version`. Answers keep the version they were collected
  under, so a roll-up can refuse to average across the change instead of silently comparing two
  different questions. Fixing a typo is not a meaning change.
- **Removing** a question: delete it. Old answers stay in their rows and stay readable.
- **Never reuse an id** for a different question. That is the one change that corrupts history,
  and nothing will warn you.

The writing rules are the ones this project already has: no em-dashes, never describe how a binder
gets made or how cards are organised behind the scenes, and do not name the sister app while
`SHOW_CROSS_APP` is off. On top of those, three survey-specific rules:

1. **Nothing is required.** The only submit gate is "one substantive answer", in `canSubmit`.
2. **Every skippable rating carries a real way out.** A rating of a feature somebody has never
   opened is noise that looks like data.
3. **Never promise a feature.** The pipeline section says out loud that none of it is promised.

## Who can write, and what stops abuse

Writes are `to authenticated` with `auth.uid() = user_id`. That covers guests, because this app
signs everyone in anonymously on first launch. It does **not** cover someone who explicitly signed
out, which this app remembers and honours, so `surveyRepo.submitSurvey` **mints a session first**
and only then inserts. That ordering is the reason the repo is not three lines.

There is no captcha, by standing project rule (`docs/AUTH.md`: it breaks silent guest sign-in).
The cap is five responses per account per 24 hours, and it is enforced in **two** places, which
is not belt and braces:

- `feedback_quota_left()` in the insert policy's `WITH CHECK` is the cheap per-row fast path.
- `feedback_enforce_cap()`, an **AFTER INSERT ... FOR EACH STATEMENT** trigger, is what actually
  holds. The policy predicate runs under the statement's own snapshot, so rows written earlier in
  the same command are invisible to it, and one PostgREST request with an array body is one
  command. The policy alone would let a single request write thousands of rows past a cap of
  five. An AFTER STATEMENT trigger runs once the command counter has advanced, so it sees them.

**Do not remove the trigger and keep the policy.** The policy on its own is decoration. Hitting
either surfaces as a 42501, and the repo turns that into a sentence a person can act on rather
than "something went wrong". Neither closes the cross-transaction race (two simultaneous requests
can each write five); `record_print_event`'s advisory lock is the pattern if that ever matters.

There is **no client read path at all**. No select policy, by design. Free text is PII by
construction and the only way to read it is `admin_feedback_recent` / `admin_feedback_summary`,
both `security definer` and both gated on `public.is_admin()`. Do not add a "let the author see
their own" policy: it leaks the response shape, and it is the crack that any future shared column
leaks through.

## Reading the answers

```sql
select * from public.admin_feedback_recent('michi', 100, null);          -- newest first, paged
select * from public.admin_feedback_summary('michi', 30);                -- last 30 days
```

`admin_feedback_summary` returns the response count, the promoter/passive/detractor split, the
recommendation score, how many people can be contacted, and `averages`: the mean of **every**
numeric answer in the window, keyed by question id. That last column is generic on purpose, so a
rating question added tomorrow appears in the roll-up the day it ships, in any app, with no new
SQL.

Feedback prose must never be committed anywhere. The analytics-studio pipeline scans staged diffs
for email addresses and fails closed; a feedback export belongs in a gitignored path.

## Standing it up in another app

The house precedent for cross-app reuse here is a **declared mirror**, not a package
(`analytics.ts`, `handoff.ts`, `promo.ts` all work this way), and the browse kit is explicitly the
wrong home: it holds no per-user code, has no supabase-js dependency, and points at the other
Supabase project entirely. So:

1. Copy the six app-agnostic files above into the sibling app, keeping the paths recognisable.
   They import only `@/components/themed-text`, `@/constants/theme`, `@/hooks/use-theme` and
   `@/lib/supabase`. If the sibling reads colours through a theme store rather than a static
   palette, that swap is inside `SurveyControls.tsx` and touches nothing else.
2. Write `src/data/surveys/<app>Feedback.ts` with that app's own questions and its own `app` id.
3. Add a route or a settings row that renders `<SurveyForm>` and calls `submitSurvey`.
4. There is **no migration to write.** The `app` column is format-checked
   (`^[a-z][a-z0-9_-]{1,31}$`), not an `in (...)` enum, precisely so a new front end can write its
   first row without one. That is the one place this table deliberately departs from the
   `analytics_events` pattern it otherwise copies, and the reason is in the migration header.

The sibling app has no `supabase/` directory: every table both apps use lives in
`michi-maker/supabase/migrations/`, including the TCGScan-only ones. Do not create one.

## Applying the migration

```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\state\apply-feedback-responses.ps1"
```

Re-runnable. The checks prove the policy set is exactly one insert policy, that `anon` holds no
write grant, that the server stamps identity and time rather than trusting the client, that the
author cannot read their own row back, that the sixth response in a day is refused, and that the
summary scores a known set correctly. Every row the checks write is deleted in the same run.

## Things to watch

- **The tier snapshot can lie while it is loading.** `useTier().tier` reports `guest` for a real
  subscriber during load, a bug this project has already shipped once. `feedback.tsx` records
  `null` rather than a wrong value. Keep it that way.
- **Analytics props are ids and counts only.** `feedback.submitted` carries whether there was text,
  never the text. The prose lives in its own table with its own RLS, and that separation is the
  reason the table is safe to have.
- **Deleting an account takes the address with it.** `user_id` is `on delete set null` so the
  feedback outlives the account, which is right: what somebody told us is a record, and with the
  id gone the row is anonymous. It is only anonymous if the address goes too, so
  `feedback_forget_contact()` clears `contact_email` and `contact_ok` on the `user_id` transition.
  Hanging it off the column rather than off the delete-account function means a deletion done by
  hand in SQL is covered as well. The address is never written into `answers`, only into its own
  column, so there is exactly one copy for that trigger to clear.
- **The rail is not an entry point on its own.** `AppRail.web.tsx` is hidden below 900px and does
  not exist on native, so `/feedback` is also in `SiteFooter`. Any third entry point should be a
  link to the route, not a second copy of the form.
