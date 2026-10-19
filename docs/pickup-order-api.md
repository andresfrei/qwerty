# Private pickup orders — T4d source API

Source coverage: **S2–S4, S6, S17**. No UI, optional-account/history (T5),
fulfillment/payment transitions (PU5), or new backend permission.
[Transaction contract](pickup-order-transaction.md) remains authoritative.
S21 proves sequential rollback SQL assertions only; actual Auth/HTTP, original
receipt GET and committed two-session races still need separately reviewed consent.

## Injected HTTP workflow

This work unit supplies the Request/Response controller and service with server-owned dependencies. Concrete Next/SDK binding follows in a dependent unit; no deployed API acceptance is claimed here.
Current verified getUser identity, trusted POST origin, bounded strict JSON and parameter admission precede writes. Existing intent normalization and Node pricing remain unchanged.
An exact actor/business/request lookup compares the whole normalized intent before publication or repricing. Matching replay returns immutable data; conflicts preserve the original attempt.
New submission uses coherent catalog and trusted finalization; one fresh lookup handles visible winners. Lost responses retain the same key and report unknown outcomes without cleanup or replacement attempts.
Known-ID/owner-queue dependencies must supply caller-authorized reads. DTOs whitelist contact/line/state fields, exclude privileged bindings/provider payloads and use private/no-store responses. Typed email, identifiers and metadata grant no authority.

## Evidence boundary

Public injected HTTP tests cover admission, replay, pricing, unknown outcomes, private readers and no-write negative controls. Explicit501 RED and nonbuyer known-ID200-vs404 RED were corrected; whole candidate77/77 and independent SOURCE review passed. Mocks do not prove actual Auth/HTTP/RLS/races/original GET/UI. Full suite/photo/build remain deferred; native approval is unknown.
Risk items2/4: identity/private reads and racing-winner/unknown-outcome handling. This cohesive workflow and its negative tests exceed the advisory400-line target; tests stay with behavior.
