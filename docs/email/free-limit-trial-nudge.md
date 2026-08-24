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
List-Unsubscribe: <https://tcgscan.ai/u/{{token}}>, <mailto:unsubscribe@tcgscan.ai?subject={{token}}>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
Content-Type: text/plain; charset=utf-8
```

`{{token}}` is the signed, non-expiring unsubscribe token. It is not the user id. The URL must
accept `POST` with body `List-Unsubscribe=One-Click`, act without a session, and return 200.

Send `text/plain` only, at least for the first one. There is nothing here that HTML improves, a
text message from a small product reads as a person rather than a campaign, and it removes a whole
class of rendering and filtering problems.

---

## Body

```
Hi{{#if username}} {{username}}{{/if}},

You have three binders in michi-maker, which is the free plan's limit. I wanted to
make sure you knew what the PRO trial actually is, because most people assume it is
the usual kind and it is not.

It takes no credit card. You never enter payment details, nothing renews, and there
is nothing to cancel. You get full PRO for 14 days, starting the moment you press the
button, and then the account goes back to Free on its own. If you do nothing at the
end, nothing happens.

On PRO that binder limit goes from 3 to 12, and pages per binder from 16 to 40.

[If you tried to start the trial before today and it told you a trial requires a
signed-in account, that was a bug on our end, not something you did. It affected
accounts that had just been created from a guest session. It is fixed, and the trial
will start for you now.]

Start it here: https://michi-maker.com/plans

If it does not work, reply to this email and tell me what it said. It comes straight
to me.

Brian
michi-maker

---
You are getting this because you have a michi-maker account.
Unsubscribe from product email: https://tcgscan.ai/u/{{token}}
This stops product email only. Messages about your account, like password resets and
receipts, will still reach you.

{{postal_address}}
```

---

## Before sending

- [ ] Decide the postal address for `{{postal_address}}`. CAN-SPAM requires a real one and this is
      the only blocker that is not code.
- [ ] Confirm the unsubscribe endpoint answers `POST` and writes `marketing_unsubscribed_at`.
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
