---
title: 'Payment resolution tracker'
order: 2
label: 'Case study · Independent concept · 2026'
summary: "When a UPI payment gets stuck, money leaves the account and the app goes quiet. I designed a tracker that answers three questions in order: what's happening, when it will resolve, and what to do if it doesn't."
meta:
  role: 'Product decisions and direction, solo'
  builtWith: 'ChatGPT, Claude Design, Claude Code'
cardMeta: 'Independent concept · 2026 · Self-initiated'
cardProblem: "When a UPI payment gets stuck, money leaves the account and the app goes quiet. People don't know where it is or what to do."
cardRole: 'Every product decision mine; AI tools did the building.'
cardOutcome: "A clickable prototype. 15 PMs who'd had a stuck payment said it left them less anxious, with a clear next step."
prototypeUrl: 'https://ziddiants.github.io/gpay-resolution-tracker/'
disclaimer: 'Independent case study. Not affiliated with Google.'
sources: [S-030, S-031, S-033]
---

## Context

I read Google Play reviews of Google Pay for India, looking for the problems people raise again and again. This is a self-initiated concept, not work for Google.

Fact · S-030

## Problem and users

Five themes kept coming up: payment authentication, stuck payments or money debited, logging in on a new phone or SIM, rewards that feel low-value, and split-payment issues after an update. I chose stuck payments, because they hit trust in a payments app directly. The user sees money debited and doesn't know what happened, when it comes back, or what to do.

Fact · S-030

## Evidence

The evidence is the reviews themselves. I didn't capture them systematically, so I can't say how common each theme is. Reviews also can't show root cause or business impact.

Assumption · S-030: stuck payments are frequent enough to matter. Not yet checked against transaction or support data.

## Insight

The app may not control what a bank or the network does. It can still explain where the money is and what the user can do next. Uncertainty after a debit is the problem worth solving, more than the delay itself.

Assumption · S-030

## Options and decision

I chose to reduce uncertainty rather than promise faster refunds. The trade-off: clarity doesn't make the money arrive sooner, and it may not cut support contacts on its own. I also chose to prototype first, because a clarity-focused screen can be tested without touching payment infrastructure. The cost of that choice: people react to sample data, not their own transaction.

Fact · S-030

## What shipped

A clickable prototype. Every screen answers three questions in order:

1. **What's happening:** a status label and a plain-language headline (processing, failed with refund on its way, refunded, overdue).
2. **When:** one expected date, worked out from the bank's turnaround window, with a timeline of what has already happened.
3. **What to do:** one main action per state, such as checking the bank statement, getting help, or raising a dispute once a refund is overdue.

Two safeguards are built in. While a payment is processing, the screen warns against paying again, because a retry could debit the user twice. Every date carries a note to verify it against current RBI rules before launch.

Not built: real transaction data, any bank or NPCI connection, and verified per-bank timelines. All names, amounts and IDs in the prototype are sample data.

Fact · S-030

## How I built it in an hour

Every product decision on this page is mine: which problem, what the tracker shows, what it leaves out, and how to test it. AI tools did the building, each working from my decisions:

- **ChatGPT** drafted the one-pager and the design brief.
- **Claude Design** made the screens.
- **Claude Code** built the clickable prototype, published on GitHub Pages.

Fact · S-031

## My role and team

Solo. I chose the problem, set the scope and directed each tool.

Fact · S-031

## Outcomes

I sent the prototype to 15 PMs from different product groups, each of whom had had a stuck payment, and talked it through with each on a call. I asked what they noticed and how it compared with Google Pay or PhonePe today. The most common response: they felt relaxed and less anxious, because they could see where their money was and what to do next. They also liked that the screens felt like the Google Pay they already use. One pointed out the note behind the "i" icon: a reminder to confirm RBI rules before anyone copies the prototype as a ready solution.

This was feedback from product peers, not a usability study. There is no comprehension score, and I didn't compare it against the current flow.

Fact · S-033

## What's next

1. Test with 5–8 people who've had a stuck payment, and compare how well they understand the status and next step against the current flow.
2. Check how often stuck payments really happen, using transaction and support data rather than reviews.
3. Verify the bank-specific timelines and current RBI and NPCI rules before any date is shown to a real user.

Fact · S-030
