---
title: 'Payments fail in two ways. I built for both.'
order: 1
label: 'Case study · CarInfo · Sep 2024 – Mar 2026'
summary: "CarInfo's payment success had fallen to 45%. Switching gateways could only rescue the failures a gateway caused, so we built routing for those and a clearer retry for the rest. Payment success reached 63%."
ledger: '45% → 63% payment success · +16% revenue'
meta:
  role: Product Manager
  team: '7 (1 designer, 2 backend, Android, iOS, web, QA)'
cardMeta: 'CarInfo · 2024–26 · Product Manager'
cardProblem: 'Payment success had fallen to 45%. More gateways only save the failures a gateway causes; the ones that break trust needed a different fix.'
cardRole: 'I led the product; a team of 7 built it.'
cardOutcome: '45% → 63% payment success · +16% revenue'
sources: [S-003, S-010, S-011]
---

## Context

CarInfo is a vehicle-management app with 1M+ daily users, later acquired by Cars24. People pay inside the app for services such as vehicle service history and insurance. When I took on payments, every payment went through one gateway, with no routing at all. UPI carried about 75% of transactions.

Fact · S-002, S-021, S-023

## Problem and users

Payment success had fallen to 45% at its low point. These were people who had already decided to pay, failing at the last step. For us, each one was a lost sale. For the user it was worse: money stuck or a decline they couldn't read, and no idea what to do next. People panic when a payment is stuck. When it happens again, they stop trusting the app.

Fact · S-010, S-023

## Evidence

I noticed the decline and started measuring it. A failure-reason analysis showed 88% of failures happened on the customer's side, not the gateway's. I sorted every failure into two kinds: gateway faults the user never sees, such as downtime, and user-side failures, such as low balance, a weak network or a bank decline nobody could read. We also called users whose UPI payments had failed, using a questionnaire I wrote.

Fact · S-021, S-022, S-023

## Insight

The problem looked like too few gateways. Adding them helps, but routing only saves the failures that are the gateway's fault. The failures that break trust, a bad network or a decline the user can't read, no switch can reach.

Fact · S-012

## Options and decision

I chose to fix both sides: route around gateway faults, and explain user-side failures so people could retry with confidence. Before any build, I made the case to stakeholders, negotiated with the gateways and got approvals. There was no mature analytics stack and little budget for new tools. So I designed the routing from the data we had and could collect, rather than waiting for an analytics project. The trade-off: the numbers on this page are approximate, not instrumented.

Fact · S-010, S-023

## What shipped

- **Routing across three new gateways.** I designed the logic. It picks a gateway using signals such as the user's phone model and location, the gateway that last worked for that user, and the gateway with the best current success for that payment method. Some signals update in real time.
- **An automatic switch** to another gateway when one fails. The idea was mine.
- **A clearer retry for user-side failures:** a retry page that shows the bank's error in plain words and why the retry should work, plus failure notifications.
- **Juspay onboarded** and transaction fees renegotiated.
- Later, routing was connected to the vendor payout engine.

Fact · S-002, S-023, S-024

## My role and team

I led the product end to end. I spotted the decline, measured it, made the case, negotiated and won approvals, planned the work and onboarded the gateways. Then I oversaw integration and testing, and improved the experience from what we measured. Engineers built it: 1 designer, 2 backend, 1 Android, 1 iOS, 1 web and 1 QA.

Fact · S-010, S-002, S-023

## Outcomes

Payment success went from 45% at the low point to 63%, measured about two weeks after the relaunch. Customer support reported fewer payment complaints; we didn't count them. Revenue grew 16%, measured as average daily sales across services, before and after. Other payment changes landed in the same period, so that gain isn't routing's alone.

Fact · S-002, S-010, S-024
