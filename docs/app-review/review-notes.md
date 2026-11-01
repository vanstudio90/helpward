# App Review notes — Helpward

Everything below is the text and configuration for App Store Connect.
**No credentials appear in this file.** Where a value is needed, the
field is named and left blank for whoever fills in App Store Connect.

---

## What the app is

Helpward books real-world help from approved local helpers — cleaning,
moving labour, errands, local parcel delivery and returns, queueing,
furniture assembly, grocery collection. Services are performed in the
physical world by a person who travels to an address, so payment is by
card rather than in-app purchase (guideline 3.1.3(e)).

## The demonstration account, and how it is isolated

**This is disclosed deliberately.** The account below is a demonstration
account. It behaves exactly like a customer account in every respect
except one: who can be matched to its bookings.

- Its requests are dispatched **only** to a controlled test helper we
  operate. No member of the public is ever sent to the reviewer's
  address.
- Equally, that test helper can **never** be offered a real customer's
  booking. The rule is enforced in the database's matching function, not
  in the app.
- Its payments run through **Stripe test mode**: a real SetupIntent, a
  real authorisation and a real capture against test keys. Nothing is
  simulated and no transition is skipped — a reviewer sees the same
  payment states a customer sees, with no real money involved.
- The test helper's acceptance is **automatic and immediate**, performed
  by the system as part of sending the request, and its start and
  complete actions are in the reviewer's own hands. **Nobody has to be
  waiting, at any hour** — see "You will not have to wait for anyone"
  below.

Ordinary users cannot reach any of this. Neither flag can be set by its
owner — the database rejects it — and nothing about the review
configuration is present in the binary.

| App Store Connect field | Value |
|---|---|
| Sign-in required | Yes |
| Username | `________________` |
| Password | `________________` |
| Contact for review questions | `________________` (name) |
| Contact email | `________________` |
| Contact phone | `________________` |
| Build number | `1` (version 1.0.0, archived 2026-11-01) |
| Backend | production (`helpward.com`) |

## Completing a booking — exact steps

1. Open the app and sign in with the account above.
2. Tap **Book a service** and choose **Errand Runner** (any of the eight
   works; this one is quickest).
3. Enter the pickup address. Use: `1055 W Georgia St, Vancouver, BC`.
   Address verification is real, so a made-up street will be refused —
   this is the same check a customer gets.
4. Answer the questions. Suggested values are in the table below.
5. On the review screen you will see the full price before anything is
   sent. Tap **Request help**.
6. **Add a card** when prompted. Use Stripe's test card:
   `4242 4242 4242 4242`, any future expiry, any CVC, any postcode.
   This account is in Stripe test mode, so a real card would be
   rejected and a test card is correct.
7. The request goes to our test helper, who accepts. Your card is then
   **authorised, not charged** — the booking shows "Card held".
8. Use **Message** to send a message, and **Call** if you wish (the call
   is placed inside the app; no phone number is exchanged).
9. The test helper marks the job complete. The hold is **captured** at
   that point and the booking moves to completed.

### You will not have to wait for anyone

The controlled helper accepts **immediately**, automatically, as part of
sending the request — there is nobody to email and nothing to wait for,
at any hour.

Moving the booking through its remaining states is also in your hands:
the booking screen on this account shows **Advance demo booking**, which
performs the helper's next action — start, then complete.

That control exists only on this account. An ordinary account has no
such button and the endpoint behind it refuses them.

**None of it fabricates anything.** Acceptance calls the same
`accept_request` the helper's app calls, followed by the same card
authorisation. Advancing calls `start_booking` and `complete_booking`,
and whether the hold is captured or released is decided by the same
settlement rule a real booking uses. You are watching the real
transitions, with test money.

## Test inputs for each of the eight services

Addresses: use `1055 W Georgia St, Vancouver, BC` for pickup, and
`800 Robson St, Vancouver, BC` where a destination is asked for.

| Service | What to enter |
|---|---|
| **Errand Runner** | What needs doing: `Collect dry cleaning` · Where: `Robson St dry cleaners` · Spending limit: `20` |
| **House Cleaning** | Bedrooms: `2` · Bathrooms: `1` · Focus on: tick *Kitchen* and *Bathrooms* · Supplies: *Helper brings supplies* · Pets: leave blank |
| **Moving Help** | Destination: `800 Robson St, Vancouver, BC` · How many helpers: `2` · What's being moved: `Sofa, bed frame, 10 boxes` · Access at pickup: *Ground floor* · Access at destination: *Lift / elevator* · Vehicle: *I need advice on what to book* |
| **Furniture Assembly** | What needs assembling: `One flat-pack wardrobe` · Number of items: `1` · Tools: *Helper brings tools* · Packaging disposal: *Yes* |
| **Grocery Pickup** | Which store: `Save-On-Foods, Robson St` · Shopping list: `Order 12345` · Spending limit: `50` · If out of stock: *Substitute something similar* |
| **Package Delivery** | Deliver to: `800 Robson St, Vancouver, BC` · Size: *Small — fits in a backpack* · Rough weight: `2` · Who receives it: `Reception` |
| **Package Return** | Carrier: *Canada Post* · Return label: *Printed and attached* · How many parcels: `2` · Preferred drop-off: `Robson St` |
| **Wait in Line** | What are they queuing for: `Box office tickets` · Expected wait: *1 hour* · Handover: *I arrive and take their place* · Venue: `Orpheum Theatre` · Which queue: `Box office` · Checked with the venue: *Yes* · Notice needed: *15 minutes* · Party size: `1` · If your turn comes early: *Ask the venue to hold it and call me* |

Every required field is listed above. **Wait in Line asks the most** — nine
fields, because a queueing job goes wrong without them. An earlier version
of this table listed only three of them, which would have left a reviewer
stuck on a validation error.

**Crew requirement:** Moving Help and House Cleaning price per helper.
Entering `2` helpers on Moving Help is what demonstrates the crew
subtotal; the quote on the review screen changes as you change it.

**Handover instructions:** every service offers these on the booking.
They are stored with the booking and readable only by the helper who was
booked — not by everyone the request was offered to. Worth entering to
see that behaviour.

**Completion evidence:** some services ask the helper for a photo at
completion. The test helper supplies one, visible on the booking.

## Cancellation

Open the booking → **Cancel booking**. There is no cancellation fee. If
the card was authorised and not yet captured, the hold is released: no
money is taken, though a bank may show it as pending for a short time.

## Account deletion

**Profile → Settings → Delete account.** Type `DELETE`, enter the
account password, and confirm. The screen then shows the exact date the
account is removed.

Deletion is **scheduled, not immediate**: a 30-day grace period, during
which signing back in cancels it with no need to contact anyone. This is
deliberate — a mis-tap on a phone should not be irreversible. A daily
job performs the erasure once the window closes.

Please do delete the account if you wish to verify this; tell us and we
will recreate it.

## What is simulated, stated plainly

Nothing about the payment, the pricing, the validation or the booking
states is simulated — all of it is the production code path.

**One thing is operated rather than organic:** the helper on a review
booking is a controlled account, and its accept / start / complete
actions are performed automatically rather than by a person. We do this
so a reviewer is never the cause of a real person travelling to an
address that does not need help, and never has to wait for one.

Those actions are the same calls a real helper's app makes. Nothing is
skipped and no state is written directly — if it were, you would be
verifying a path no customer takes.

Review activity is also kept out of everything a customer reads: a
review you leave is not customer-visible, the controlled helper's rating
and completed-task count stay at zero, and it does not appear in the
public helper directory.

## Separation

| | Real customers | Review account |
|---|---|---|
| Matched helpers | Approved public helpers | The controlled test helper only |
| Stripe | Live keys | Test keys — separate customers, payment methods, webhooks and payouts |
| Publishable key | Live | Test; supplied by the server per account, not compiled into the app |
| Notifications | Live push credentials | Test-mode Stripe events do not reach the live webhook |
