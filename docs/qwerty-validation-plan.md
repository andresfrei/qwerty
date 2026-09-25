# Qwerty — focused commercial validation plan

**Prepared:** 2026-09-25

**Status:** Proposed experiment, not an approved change to the full product vision or an implementation specification.

**Companion:** [Full product and competitor brief](qwerty-business-brief.md).

## Decision to test

**Hypothesis:** Independent Argentine pizzerias, empanada shops, and prepared-food businesses with repeat direct orders and their own couriers will pay a monthly fee to see, at the end of a shift, which orders were delivered, which payments were confirmed, what each courier owes, what was spent, and why the physical cash does or does not balance.

The first product is **control of direct orders and own-delivery settlement**, not a general restaurant operating system or a digital menu in isolation. Qwerty would not bring the merchant new marketplace demand or supply a courier fleet. The customer-facing ordering link is a necessary entry point, not the claim of differentiation.

**Do not treat this hypothesis as established.** Competing products already offer direct orders, menus, QR codes, and kitchen tickets. The full [business brief](qwerty-business-brief.md) remains the long-term product vision; this document defines what to test *before* committing to that scope.

## Who qualifies for the first test

Seek owner-operated businesses with all of these characteristics:

- Most testable orders arrive through their own channels: WhatsApp Business, social media, phone, repeat customers, or walk-ins.
- They offer pickup and/or delivery using their **own couriers**; ideally one to four couriers work a busy shift.
- Cash, bank transfers, and handoffs between cash register and couriers cause observable reconciliation work.
- The owner or supervisor can show a recent real shift: orders, payments, expenses, courier returns, and closing process.
- The owner can decide whether to pilot a new workflow and pay for it.

Do not start with a multi-branch chain, a restaurant whose main problem is table service, or a merchant making only occasional deliveries. These are targeting criteria for interviews, **not proven market boundaries**.

## What to observe before building

Interview roughly **15–20 qualified owners**. Ask them to *show* their last busy shift rather than describe their ideal software:

1. Where did direct orders arrive, and who recorded them?
2. How did they know a transfer was actually credited? What happened with a screenshot of a receipt?
3. Who assigned the courier, and how many orders did that courier take?
4. What cash and undelivered orders did the courier return with? Where was the difference recorded?
5. What expenses came out of the register? How did they calculate the cash expected at close?
6. Which paid tools do they use, what do those tools cost, and what would be painful to replace?
7. How long did their last close take, and what error or disagreement did they resolve?

Record the current workflow, a recent concrete incident, time spent, who bears the cost, and whether they will let Qwerty process real orders. Avoid leading questions such as “Would you use an app that saves money?”

**Competitor check:** Run a current MenuPro demo with the same direct-order and end-of-shift scenario. Verify, rather than infer from its public website, whether it supports confirmation of transfers, expenses, courier runs/settlement, differentiated staff permissions, and cash variance. Compare equivalent plans and actual merchant costs. Fudo is a secondary operational benchmark; its entry price alone does not prove feature equivalence.

## Smallest credible pilot

A first **concierge pilot** can combine a minimal merchant-facing workflow with explicitly disclosed manual work by the Qwerty team. Do not claim that a report, reconciliation, notification, or payment is automated when a person produced it. Do not move customer payment into Qwerty's account.

### In scope for the pilot

| Capability | Minimum outcome |
| --- | --- |
| One business and staff access | The owner and operating staff see only that business's orders. Start with the smallest roles needed to authorize cash confirmation and courier settlement; preserve the agreed full role model as a later design target. |
| Small catalog and direct link | The merchant can sell its core products, disable an unavailable item, and share the order link via its own WhatsApp Business account or another channel. Limit configuration to products and options that the actual pilot merchants need. |
| Pickup and own delivery | Customer or staff can record an order with clear amount, contact, fulfillment mode, and delivery address. Delivery eligibility can be checked manually during the pilot; no promise of automatic geocoding yet. |
| Order queue | Staff can find a new order, track preparation and fulfillment, correct an exception, and identify cancellation. No order can silently vanish because a live notification was missed. |
| Collections | Record cash received locally or by courier, and transfers pending or confirmed by the responsible supervisor. A receipt image alone is **not** confirmation of funds. |
| Courier run | Assign several orders to one courier, record delivered/undelivered outcomes, expected cash, returned cash, and a visible variance. |
| Shift close | Show orders sold, payment received by method, transfer still pending, cash expected in the drawer, courier cash rendered, expenses, and unexplained difference. **Sold, collected, and physical cash are different figures.** |
| Minimal statistics | Daily order count and amount by pickup/delivery, pending payments, courier variances, expenses, and top products *only if those values are already captured correctly*. No claim of profit without complete costs. |

Kitchen tickets can be printed **manually** if the pilot merchant requires them; they are not the hypothesis under test. The delivery/close workflow should also be tested with realistic cancellations, a failed transfer, and a courier returning short, not just the happy path.

### Explicitly deferred from this pilot

Table service and table QR requests; waiter verification and table bills; automatic thermal-printer connector; native mobile apps; automated WhatsApp messaging; full push notification delivery; advanced catalog themes or dozens of templates; payment-link integration; automatic delivery-radius/geocoding checks; multi-branch businesses; a customizable permission editor; inventory quantities; fiscal invoicing; campaign/website conversion analytics; and a comprehensive reporting suite.

**Deferred does not mean rejected from the full Qwerty vision.** Reintroduce a capability when actual paying merchants need it and when it improves the core workflow enough to justify build and support cost.

## Checkout identity: experiment, not a silent reversal

The current product decision in the [full brief](qwerty-business-brief.md) is to require a Qwerty account and phone-code verification to place an order. The commercial review challenged it because an OTP can add checkout abandonment, SMS cost, and support burden. **That review did not itself change the decision.**

Before building a permanent identity architecture, test two controlled checkout experiences with actual merchants and customers:

- **Verified:** collect the order, then request a phone code at final checkout; previously verified customers can reuse their account and saved addresses.
- **Contact-first candidate:** collect name, phone, and delivery address, allow an order without OTP, and offer saved details after the order. Protect the merchant with rate limits and clear handling of suspicious orders; an unverified phone is not proof of identity.

Measure order completion/abandonment, false or unreachable orders, repeat orders, verification expense, and support time. If a valid quantitative comparison is not feasible at pilot scale, conduct moderated checkout tests and state the uncertainty. Changing the production registration policy requires an explicit product decision; table QR abuse risks must be considered separately.

## Commercial test and economics

Present a **real monthly price to one merchant at a time** for the reduced offer, including what is and is not delivered during the pilot. The commerce review suggested **ARS 19,900–24,900/month** as price points to test against MenuPro's publicly listed **ARS 30,000/month** ordering plan (checked 2026-09-25). These are **test hypotheses, not published Qwerty prices**. Argentine peso prices and competitor offers must be rechecked before quoting.

A paid pilot should be transparent: define the pilot duration, service level, manual operations, support arrangement, data export, and how a merchant can leave. A refundable reservation or paid pilot can demonstrate commitment, but do not sell functionality that does not exist. “I would pay” is weaker evidence than a transaction; one-time pilot payment is weaker evidence than a voluntary second month.

Track contribution **per business**: monthly fee minus direct infrastructure, SMS verification, maps, payment-related third-party costs borne by Qwerty, setup, customer support, and printer assistance. Also track the owner's time required. Do not infer healthy unit economics solely from a low entry-level Supabase subscription. Payment-processor fees borne by the merchant must be disclosed separately from Qwerty's no-per-order-commission promise.

## Precommitted signals for a 30-day learning cycle

These thresholds are **decision aids, not statistical proof of product-market fit**. If onboarding or a real busy-shift test takes longer than 30 days, follow the evidence instead of forcing a date.

| Signal | What to inspect |
| --- | --- |
| Activation | Did each pilot business process real direct orders within its first operating week? What setup and support did this require? |
| Repeat usage | Are orders and courier settlements repeatedly recorded during actual busy shifts, rather than only in a demonstration? |
| Operational value | Can the owner explain a specific error prevented, discrepancy found, or minutes saved during a real close? |
| Willingness to pay | Did a merchant knowingly pay the quoted price and, later, voluntarily continue? Why did any merchant refuse? |
| Support burden | Do setup and monthly hand-holding leave any credible contribution margin at the tested price? |
| Alternative and referrals | Which existing tool would the merchant stop using, if any? Did any owner introduce another qualified merchant without prompting? |

After approximately 15–20 interviews and up to five **qualified** pilots:

- **Proceed to a narrower build** if four or five pilots repeatedly use it on real orders, at least three want to continue at the disclosed price, closing value is demonstrable, and support economics have a credible path. These are provisional gates, not a universal success formula.
- **Revise the offer** if merchants use only ordering, only courier settlement, or only cash closing; preserve the behavior that actually carries willingness to pay.
- **Stop or change segment** if qualified merchants are satisfied with their existing solution and will not change even for a clearly demonstrated improvement at a viable price.
- **Do not declare success** from interviews, trial accounts, a first payment, or a small sample alone. Recheck after further paid retention and usage.

## What the specialist should challenge next

1. Is own-courier settlement painful and frequent enough to support subscription, or is the real paid job something narrower?
2. Does a busy merchant accept a new order-entry workflow in exchange for an easier close, or will staff double-enter orders?
3. What is the smallest end-of-shift report that makes an owner say, “I need this tomorrow”?
4. Which merchant features are essential to switch away from MenuPro/Fudo, and which Qwerty features merely duplicate them?
5. Can the no-commission subscription remain viable with merchant onboarding and support at the tested price?
6. Does checkout verification improve real order quality enough to offset lost conversions and SMS cost?

**Next action:** Interview qualified merchants, demo competitors using the same scenario, and write down the current cash/courier closing procedure before implementing more of the full product vision.
