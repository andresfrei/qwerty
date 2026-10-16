# Owner catalog editor

The owner catalog editor is the first slice of PU2.4. A confirmed owner can manage ordered
categories and products with price, currency, availability and sort order for their own business.
Option groups and photo replacement are later slices.

## Owner flow

1. Sign in at `/auth/login` with a confirmed email. Unconfirmed accounts are redirected back.
2. Open `/owner/catalog`. The page runs a fresh `getUser()` check through the existing session
   helper `apps/web/app/lib/supabase/server.ts`, then reads, with the same RLS-scoped client, one
   business owned by that session, its storefront publication state, its categories ordered by
   `sort_order`, and its products ordered by `sort_order`. Each product shows price, currency,
   availability and sort order.
3. Send a write to `POST /owner/catalog/actions` as JSON. The session, never the payload, decides
   which business is edited: no owner or business identifier is accepted from the caller.

The page is server-rendered with `force-dynamic`, and every owner response stays private and
non-cacheable.

## Guarded write boundary

`POST /owner/catalog/actions` accepts one JSON action per request and returns one JSON response.

| Action | Fields |
| --- | --- |
| `create_category` | `name`, `sortOrder` |
| `rename_category` | `categoryId`, `name` |
| `reorder_category` | `categoryId`, `sortOrder` |
| `create_product` | `name`, `description`, `priceMinor`, `currency`, `categoryId`, `isAvailable`, `sortOrder` |
| `update_product` | `itemId`, `name`, `description`, `priceMinor`, `currency`, `categoryId`, `isAvailable`, `sortOrder` |
| `set_published` | `isPublished` |

Before any write the handler checks, in order: a valid trusted site origin; an exact `Origin` plus
public `Host`/forwarded-header match, exactly like the existing owner handlers; typed action
validation; a fresh confirmed-email `getUser()` session that owns a business; and that the
referenced category or product belongs to that same business. Only then is a single write attempted.

A rejected request writes nothing. Every response carries `Cache-Control: private, no-store`,
`Pragma: no-cache`, `Expires: 0` and `Referrer-Policy: no-referrer`. `GET` returns `405` with
`Allow: POST`.

## Validation rules

- `name` must be non-empty after trimming.
- `priceMinor` must be a non-negative safe integer.
- `currency` must match exactly three uppercase letters (`^[A-Z]{3}$`).
- `categoryId` must be a UUID for a category in the same business; `itemId` must be a UUID for a
  product in that business.
- `sortOrder` must be a non-negative safe integer.
- `description` is optional and may be `null`.
- `isAvailable` and `isPublished` must be booleans.

Stable error codes: `invalid_name`, `invalid_price`, `invalid_currency`, `invalid_category`,
`invalid_sort_order`, `invalid_availability`, `invalid_publication`, `invalid_id`, `invalid_action`,
`invalid_request`, `not_found`, `storefront_missing`, `unauthorized`, `request_rejected`,
`unavailable` and `method_not_allowed`. Rejections return `400`, a missing or unowned item returns
`404`, a missing session returns `401` and an unavailable configuration returns `503`.

## Known limits

- Publishing updates the existing storefront row; a business without a storefront gets
  `storefront_missing` instead of an implicit slug. No schema change is part of this slice.
- Availability is a toggle only: there is no delete, quantity inventory or option-group editing.
