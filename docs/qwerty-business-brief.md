# Qwerty — business brief for an independent commerce review

**Prepared:** 2026-09-25 (historical snapshot)

**Stage at preparation:** Product discovery; no application or database schema had been implemented.

**Current repository status:** A Next.js web scaffold exists, but no product application or database schema has been implemented.

**Audience:** A commerce/business-model specialist reviewing positioning, pricing, go-to-market, and MVP scope in Argentina.

> **Review request:** Challenge this concept rather than endorse it. Distinguish verified competitor facts from hypotheses, identify the first profitable customer segment, evaluate whether the proposed scope can be delivered and supported at a price below MenuPro's ordering plan, and recommend the smallest credible commercial experiment. Do not invent market sizes, competitor omissions, payment fees, or conversion rates. Cite current primary sources when updating any claim.

## 1. The proposition in one minute

Qwerty is a simple, mobile-friendly web product for small Argentine food businesses that already attract customers through WhatsApp Business, social media, and their physical premises. A business publishes a shareable catalog/store link; customers browse without an account but verify their phone number once to place orders. Orders are placed **inside Qwerty**, not through WhatsApp messages. The business handles pickup, delivery with its own couriers, and/or dine-in, enabling only the modes it offers.

The commercial promise under consideration is **a fixed subscription per business, with no Qwerty commission per order**. It is **not** a promise that payment processors, SMS verification, maps, or external providers charge nothing. Qwerty is not planned as a marketplace that supplies demand or a delivery fleet. Its potential value is a short path from a direct order to kitchen preparation, payment verification, courier settlement, expenses, and cash closing without spreadsheets.

The strongest initial customer hypothesis is a pizzeria, empanada shop, or small prepared-food business with repeat customers and its own delivery operation. This is a **hypothesis, not an established product-market fit**. Dine-in QR ordering is also in the intended product, but trying to sell every hospitality use case equally from day one may dilute positioning.

## 2. Decisions agreed for the intended MVP

### Business, identity, and access

- One user can own or work in multiple businesses. Each business has **one owner**, one physical location in the MVP, and multiple staff members; multiple branches within one business are deferred.
- A business may select multiple categories (for example, pizzeria and empanadas). Categories help onboarding and catalog suggestions; they must not constrain what it can sell. Gastronomy is the initial vertical, with future expansion to other business types as a design consideration, not a launch commitment.
- Customers may browse public catalogs without signing in. Placing an order requires a Qwerty account shared across participating businesses: phone verification by code, an internal stable user ID, saved addresses, an optional recovery email, and a validated change-of-number flow. Businesses only access customer information relevant to their own orders.
- Staff access uses predefined, **combinable roles per business**, with permissions enforced internally and no custom permission editor in the MVP. Proposed presets: cashier, cash supervisor, waiter, courier; the single owner administers the business. Exact permission details still need a concise acceptance matrix. Only the cash supervisor confirms that a QR/transfer payment has actually been received; the owner's operational privileges should be specified explicitly.

### Catalog and ordering

- Public, linkable catalog usable as a digital menu, with product availability switched off quickly by staff. Options such as an unavailable empanada flavor can be disabled independently of the whole product. No quantity-based inventory system is planned for the MVP; the business remains responsible for availability.
- Support ordinary product variations, selectable flavors/sizes, fixed-price packs and promotions, and pizza halves. Example: a dozen empanadas requires exactly 12 selected units; a half-and-half pizza shows its components clearly on the kitchen ticket. A configurable fixed surcharge for a two-flavor pizza has been **proposed**, but the pricing formula and edge cases still require explicit acceptance.
- Orders can originate from the customer web store, cashier, waiter, or a table QR. Pickup, delivery, and dine-in are separately enabled by each business. Availability is checked again at submission; previously placed orders do not change when the menu is edited.
- Customer web orders should normally enter the operational queue without individual staff acceptance. Identity verification does **not** guarantee availability; exceptional shortages are handled by the business. A table QR request with deferred payment is a specific exception requiring in-person waiter validation before becoming a kitchen order.

### Dine-in and table QR

- The business creates tables with internal identifiers and printable QR codes. The QR opens the public menu associated with that table; a customer signs in to submit a request. A waiter can also create an order manually for a table.
- For the agreed table flow: the customer builds a request, relevant waiters are notified, one waiter takes and validates it **at the table**, and only then does it become an order and enter the kitchen. The waiter can correct or reject the request. Before validation, it is not a sale, kitchen ticket, or table debt. This protects against a static QR being photographed and used from elsewhere.
- After validation, the customer should be able to pay now through the available methods, or pay later at the register **if the business enables deferred table payment**. A receipt upload does not automatically verify a transfer. Accumulating successive orders into a single table bill is a reasonable working assumption but needs a specific workflow decision.

### Delivery and payments

- Each business sets one departure point and a configurable delivery radius. A third-party address/geocoding/map service helps the customer locate and confirm an address; Qwerty calculates radius eligibility itself. Failed or borderline geocoding can go to manual business confirmation. Radius is a geometric approximation, not road distance or a delivery-time guarantee.
- Delivery may have a fee or allow a voluntary tip. Orders are assigned to a courier in a **run containing multiple orders**. The courier can collect on delivery and renders cash/collections to the business on return. A run needs a simple reconciliation of assigned, delivered, collected, and handed-over amounts.
- Transfers, payment QR, and a payment link are candidate methods for delivery; the courier may also collect at the door. A payment link provider may charge its own processing fee. Opening a link or uploading a receipt **never means payment is confirmed**. The supervisor confirms digital payment after checking that funds arrived. It remains to decide which payment-link provider/integration, and whether links are generated per order or configured by the merchant.
- Cash management includes opening/closing a cash session, cash versus digital inflows, expenses, and courier settlements. Confirmed digital revenue must not be confused with physical cash in the drawer. A full accounting suite or tax invoicing integration has **not** been agreed as part of the MVP.

### Kitchen operations and notifications

- The business can choose **no printing, manual kitchen-ticket printing from a computer, or optional automatic printing**. Manual printing uses the browser/OS and a correctly installed thermal printer. Silent automatic printing requires an optional, locally installed computer connector; manual reprinting remains the fallback. Avoid duplicate tickets and label reprints clearly. Not every business needs a printer.
- The operational panel shows new orders and pending table requests persistently. Realtime updates and sound help while the panel is open; relevant staff should also be able to opt into mobile notifications when it is closed. Waiters receive table-validation requests; if multiple waiters receive one, only one can claim it. A notification must not be the sole record of a request.
- A responsive web app/PWA is the launch platform for both customers and staff. Native Expo apps are **not** required to launch because printing can originate from a computer. Web push has browser/device constraints (notably installation to the Home Screen on iOS), so delivery and setup must be tested rather than promised universally.

### Technical constraints already selected

- Supabase is the selected backend: Postgres for durable operational data, Auth for phone OTP, private Storage for payment receipts, and Realtime for open-panel updates. Its project MCP was connected for the discovery work; the repository currently contains only a web scaffold, with **no product application or schema implemented**.
- Authorization must isolate every business's orders, staff, addresses, receipts, and notifications. Server-side checks and row-level security matter; an authenticated user must not gain access to unrelated businesses merely by knowing an ID.
- Supabase does not itself provide thermal printing on a merchant's PC, a universal closed-app push service, address geocoding, or proof that a bank transfer cleared. SMS delivery requires a provider and creates a variable cost.

## 3. Direct competitor and market context

**As published on vendor sites, consulted 2026-09-25. ARS prices and offers can change; recheck before using in a commercial decision.** A missing feature on a public page is **not proof that the product lacks it**.

| Alternative | Verified public offer | Commercial implication for Qwerty |
| --- | --- | --- |
| **[MenuPro](https://menupro.ar/precios)** — closest direct competitor | Plan Pro: **ARS 15,000/month** for a digital menu; Plan Pedidos: **ARS 30,000/month**, no per-order commission, WhatsApp ordering, QR table orders, counter orders, and kitchen tickets. Its [feature page](https://menupro.ar/funcionalidades) also describes an accumulating table bill, 80-mm printing or kitchen screen, menu upload by photo/AI, public SEO pages, and a customer experience without registration. | Zero commission, table QR, kitchen printing, and attractive catalogs are **not differentiators on their own**. Qwerty's mandatory phone OTP may create more checkout friction. Test whether cash verification, expenses, own-courier settlement, and an in-app ordering flow create enough extra value; independently verify MenuPro's actual behavior through a demo. |
| **[Fudo Argentina](https://fu.do/es-ar/precios/)** | Published Initial: **ARS 22,500/month**, with cashier movements, QR menu, and kitchen printing; Advanced: **ARS 43,900/month**, including table orders via QR. Additional modules and operational features are listed separately. | A more established restaurant operations product; Qwerty should win on faster setup and a narrower workflow, not claim generic POS superiority. |
| **[Bistrosoft Argentina](https://bistrosoft.com/ar/precios/)** | Web license from **ARS 20,900 + VAT/month** with up to one user, tables, kitchen tickets and one QR menu; Premium from **ARS 99,000 + VAT/month** lists an online shop and unlimited orders. | Shows that online ordering plus restaurant operations can be packaged at higher price points, but feature/plan comparisons need care. |
| **[GloriaFood](https://www.gloriafood.com/es/tarifas)** | Publishes a base online-ordering offer with unlimited orders, no monthly fee, and no per-order commission; some advanced services are paid. | Free ordering exists. Qwerty must demonstrate a locally useful operational or service advantage, not rely only on price. |
| **[Tiendanube Argentina](https://www.tiendanube.com/planes-y-precios)** — adjacent, not direct restaurant POS | Publishes a free entry plan and Esencial at **ARS 27,999/month**; transaction and payment-provider terms vary by plan/method. | A general ecommerce alternative, but not a substitute for table service, kitchen tickets, and own-delivery settlement. |
| **PedidosYa and other marketplaces** | Marketplace discovery and potentially logistics; exact current merchant commissions were **not independently verified** here because the merchant page blocked direct fetching. | Qwerty can complement marketplace acquisition by helping a business serve **its existing direct customers**. It cannot honestly promise marketplace demand or a courier network. |

The MenuPro site describes **multiple** catalog templates; we have **not verified a claim of exactly 30**. For Qwerty, 3–5 well-designed, brandable templates are a proposed starting point, not an agreed numerical launch requirement. Quality and fast merchant setup matter more than advertising an unsupported template count.

### WhatsApp distinction

WhatsApp Business **app** can be used by the merchant to share the Qwerty link or talk to a customer manually. That is different from using the automated **WhatsApp Business Platform/API**, which [Meta prices per delivered message by market/category](https://business.whatsapp.com/products/platform-pricing). Meta also describes the [small-business app as free to download and use](https://whatsappbusiness.com/resources/resource-library/whatsapp-vs-whatsapp-business/). Not every WhatsApp message automatically incurs an API charge. Qwerty plans to **avoid the messaging API for order intake and routine automated order notifications in the MVP**: the link may be shared through WhatsApp Business, but the transaction and status live in Qwerty. Phone OTP has its own external delivery cost.

## 4. Business model hypotheses to test, not promises

1. **Initial segment:** Independent food shops with a direct customer base and own delivery; the owner still coordinates orders, cash, and couriers with several disconnected tools.
2. **Value proposition:** “Your direct orders, kitchen, collections, and courier settlement in one simple workflow — without a Qwerty commission per order.” This must be validated against what businesses actually value most.
3. **Revenue:** One transparent monthly subscription per business with a trial; no charge per order and, preferably, no charge per staff seat. An optional local printer connector may require extra onboarding/support cost even if the product does not separately bill for it.
4. **Pricing target:** Test a price **below MenuPro's currently published ARS 30,000/month ordering plan**, but do **not** publish a number until variable costs and support burden are estimated. Argentine peso prices must be reviewed regularly, and VAT/processor charges must be explained plainly.
5. **Unit economics to model:** Active businesses, direct subscription revenue, hosting/database/storage/egress, SMS OTP attempts and abuse, geocoding usage, push delivery, printer-connector installation/support, payment processing paid by the merchant, onboarding time, churn, and customer acquisition cost. A fixed-fee, unlimited-use promise can fail if variable usage is uncapped and support is high.
6. **Channel:** Merchant shares a link through WhatsApp Business, Instagram, physical table QR, and existing customer channels. No claim of organic marketplace demand without evidence.

## 5. Critical risks and open decisions

| Risk or decision | Why it matters | Suggested test or next decision |
| --- | --- | --- |
| **Mandatory customer phone verification** | MenuPro publicly advertises ordering without registration; OTP may reduce fraud/repeat friction but cost money and lose first-time conversions. | Ask only at final checkout; measure abandonment, repeat purchase, fraud, and SMS cost in a pilot. Do not presume that an account creates loyalty. |
| **“More for less” economics** | Delivery, cash, expenses, multi-role access, push, and printing add support and complexity. | Compare monthly contribution margin per business at 5, 50, and 500 active merchants; cut features or change pricing if negative. |
| **Actual MenuPro gaps** | Its website may not enumerate every capability. | Conduct a current product demo and confirm cashier controls, expenses, courier settlement, payment verification, roles, and real merchant pricing before claiming superiority. |
| **Optional silent printing** | A local connector has install, device, network, retry, and duplicate-ticket support costs. | Pilot on common thermal printer models with a manual fallback; determine acceptable supported hardware. |
| **Deferred table payment** | A static QR can be shared remotely; unpaid requests should not print or become sales automatically. | Test waiter validation, table ownership, bill closing, and a busy-service scenario. |
| **Regulation and records** | Internal kitchen tickets/payment receipts are not fiscal invoices; handling customer phone, addresses, and payment images needs privacy and retention rules. | Obtain local legal/accounting advice before promising AFIP/ARCA invoicing or compliance. |
| **Mobile alerts** | Push permission and iOS install requirements can impair reach when the panel is closed. | Test real Android/iOS devices and define a visible pending-order fallback/escalation. |
| **Third-party costs** | Payment-link fees are distinct from Qwerty's commission; geocoding and phone OTP add costs. | Publish a transparent cost matrix and choose providers only after realistic usage estimates. |

## 6. Questions for the commerce specialist

Please return a critical recommendation, with evidence and confidence levels, addressing:

1. **Best first customer:** Which narrow Argentine merchant segment has the most acute, frequent, paid problem here: delivery-heavy prepared-food shops, pizzerias, empanada shops, or table-service restaurants? What assumptions would disprove that choice?
2. **Competitive advantage:** After testing MenuPro firsthand, what can Qwerty credibly do better that customers will notice in their **first week**, not merely on a feature checklist? Which proposed features are table stakes versus distractions?
3. **Pricing and margins:** What is a testable ARS monthly price or price range relative to MenuPro's published ARS 30,000 ordering plan? What cost and support assumptions must hold for “more for less” to work? Distinguish Qwerty's subscription from provider transaction fees.
4. **Go-to-market:** How do we recruit the first five paying merchants without relying on paid marketplace-style acquisition? What onboarding and migration from their current menu/WhatsApp workflow would they require?
5. **Checkout friction:** Does mandatory phone OTP hurt enough to outweigh a global saved-address account? What experiment can resolve this before hard-coding a costly growth assumption?
6. **MVP cuts:** If the intended scope is too large, what should be deferred **without losing the core paid value proposition**? Specify an ordered vertical slice and explicit non-goals.
7. **30-day validation plan:** Propose interview prompts, a realistic competitor demo checklist, pilot acceptance metrics, willingness-to-pay tests, and go/no-go criteria. Mark every unsupported market-size or competitor claim as unknown.

**Expected output:** A one-page investment/launch verdict, a competitor comparison with linked evidence, a proposed initial segment and price hypothesis, a small pilot plan with measurable thresholds, and a list of assumptions that need merchant interviews or a working prototype. Be willing to recommend a narrower product or a changed positioning.
