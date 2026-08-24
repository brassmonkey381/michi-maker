# Draft: "you have hit the free binder limit" / trial nudge

Status: **draft, not cleared to send.** See `../../EMAIL-MARKETING.md` for what has to exist first
(consent column, signup checkbox, Settings toggle, working unsubscribe endpoint). The headers
below assume all four.

Audience: signed-in accounts at or over `TIER_LIMITS.free.binders` (3), who have never started a
michi trial and hold no paid entitlement. Compute from binder counts, not from `cap.gate_shown`,
which only reaches back to 2026-08-13.

Two things this message exists to correct, both real misunderstandings rather than guesses:

1. People assume a free trial wants a card. Ours does not, and there is nothing to cancel, because
   the grant is a `tier_pro` entitlement row with an `expires_at` and no Stripe subscription.
2. Between 2026-07-21 and 2026-08-24 a stale `is_anonymous` token claim could refuse the trial to
   an account that had just upgraded from a guest, with the message "trial requires a signed-in
   account". Only one account is known to have hit it, but anyone who tried and gave up deserves
   to hear that it works now. That paragraph is in square brackets: **include it only for
   recipients who actually have a `trial.start_failed` event**, and cut it for everyone else.

---

## Headers

```
From: michi-maker <hello@tcgscan.ai>
Reply-To: support@michi-maker.com
To: {{email}}
Subject: Your michi-maker binders, and the PRO trial that needs no card
List-Unsubscribe: <https://tcgscan.ai/unsubscribe?t={{token}}>, <mailto:unsubscribe@tcgscan.ai?subject={{token}}>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
Content-Type: text/plain; charset=utf-8
```

`{{token}}` comes from `scripts/unsubscribe-token.mjs`, which reads `public.marketing_recipients`
(the one definition of who may be mailed) and signs each id. Do not assemble a send from a
hand-written query: the view exists so a condition cannot be forgotten.

The path is `/unsubscribe`, **not** `/u/`, which is michi-maker's public-profile route. It is a
Vercel rewrite on tcgscan.ai onto the `unsubscribe` edge function, so the link stays on our own
domain: a raw `supabase.co` functions URL in a List-Unsubscribe header reads as phishing to both
the recipient and the filter.

Send `text/plain` only, at least for the first one. There is nothing here that HTML improves, a
text message from a small product reads as a person rather than a campaign, and it removes a whole
class of rendering and filtering problems.

---

## Body

```
Hi{{#if username}} {{username}}{{/if}},

You are at three binders in michi-maker, the free plan's limit. The PRO trial
takes you to 12, and pages per binder from 16 to 40.

It needs no credit card. Nothing renews, there is nothing to cancel, and after
14 days the account goes back to Free on its own.

[If the trial ever told you it "requires a signed-in account", that was our bug,
not something you did. It is fixed.]

https://michi-maker.com/plans

If it does not work, reply and tell me what it said. It comes straight to me.

Brian
michi-maker

---
You have a michi-maker account. Unsubscribe from product email:
https://tcgscan.ai/unsubscribe?t={{token}}
Account email (sign-in, receipts, plan notices) still reaches you.

{{postal_address}}
```

---

## Before sending

- [ ] Decide the postal address for `{{postal_address}}`. CAN-SPAM requires a real one, and it is
      now the only blocker that is not code. See the options in ../../../EMAIL-MARKETING.md; do not
      use a home address.
- [ ] Confirm at least one person has actually opted in. `marketing_recipients` is empty by design
      until someone ticks the switch, and a send to nobody is the correct outcome until then.
- [ ] Run `apply-marketing-consent.ps1` if it has not been run. Its step 5 makes the exact
      one-click POST a mail client makes and reads the row back, and its step 6 proves a forged
      token changes nothing.
- [ ] Send one to yourself first, at a Gmail address and an iCloud address, and check where it
      lands. iCloud is the stricter of the two.
- [ ] Check the `From` display name renders as "michi-maker" and not "TCGScan". This is the single
      biggest driver of whether the message is recognised or reported.
- [ ] Verify the bracketed paragraph is present only for recipients with a `trial.start_failed`
      event, and gone for everyone else. Telling someone a bug affected them when it did not is a
      worse error than saying nothing.

## Why the subject reads the way it does

It names the product and the one fact that changes the decision. It is not a tease, it does not
promise a discount, and it does not use urgency. At this list size the objective is a reply, not
an open rate, which is also why there is no tracking pixel and why `Reply-To` is a monitored human
inbox rather than `noreply@`.
