# Owner option groups and options

This is the PU2.4b slice of the owner catalog editor. It extends the guarded editor in
`apps/web/app/owner/catalog/` with option groups, their options and the business two-flavor
surcharge. Photos stay in PU2.4c and public rendering stays in PU2.5.

## Option model

An option group belongs to one product. Its `selectionMode` decides what the customer picks:

- `distinct` — that many **different** options, for example two pizza flavors or a size.
- `quantity` — the chosen **units** across options must total within `minSelect` and `maxSelect`,
  for example a dozen that must total exactly 12 units.

Each option has a `name`, a non-negative `priceDeltaMinor` added to the product base price and an
`isAvailable` toggle. Disabling one option removes only that choice; the product keeps selling.

`business_catalog_settings.twoFlavorSurchargeMinor` is one fixed amount per business, charged once
per line when a `distinct` group ends up with more than one flavor. Zero means no extra. Equal
halves count as a single flavor, and the pure helper applies the surcharge, never this page.

## Owner flow

1. Open `/owner/catalog`. Next to each product the page lists its groups with the mode and bounds,
   plus a sample customer line ("Mitad muzzarella / mitad napolitana · $…") built by
   `describeGroupBehavior` from `apps/web/app/lib/catalog-selection.ts`. That helper feeds a
   representative selection to the pure `priceSelection` and `describeSelection`, so the preview
   obeys the same rules the storefront and the cart use.
2. Send one write to `POST /owner/catalog/actions`. The session, never the payload, chooses the
   business.

| Action | Fields |
| --- | --- |
| `create_option_group` | `itemId`, `name`, `selectionMode`, `minSelect`, `maxSelect`, `sortOrder` |
| `update_option_group` | `groupId`, `name`, `selectionMode`, `minSelect`, `maxSelect`, `sortOrder` |
| `create_option` | `groupId`, `name`, `priceDeltaMinor`, `isAvailable`, `sortOrder` |
| `update_option` | `optionId`, `name`, `priceDeltaMinor`, `isAvailable`, `sortOrder` |
| `set_two_flavor_surcharge` | `twoFlavorSurchargeMinor` |

`update_option_group` renames, reorders and changes the mode and bounds in one write, so a rename
sends the current mode and bounds unchanged. `update_option` renames, reorders, sets the price
delta and toggles availability the same way.

## Guarded boundary

The new actions reuse the existing handler: trusted origin, exact `Origin` plus public
`Host`/forwarded-header match, typed validation, a fresh confirmed-email `getUser()` session that
owns a business, and an ownership read for the referenced product, group or option. Only then is a
single write attempted. A rejected request writes nothing; every response stays
`Cache-Control: private, no-store` with `Pragma: no-cache`, `Expires: 0` and
`Referrer-Policy: no-referrer`.

## Validation rules

Mirroring the database constraints and `catalog-selection.ts`:

- `name` must be non-empty after trimming.
- `selectionMode` must be exactly `distinct` or `quantity` (`invalid_selection_mode`).
- `minSelect` must be a non-negative safe integer (`invalid_min_select`).
- `maxSelect` must be a non-negative safe integer and `>= minSelect` (`invalid_max_select`).
- `priceDeltaMinor` must be a non-negative safe integer (`invalid_price_delta`).
- `sortOrder` must be a non-negative safe integer (`invalid_sort_order`).
- `twoFlavorSurchargeMinor` must be a non-negative safe integer (`invalid_surcharge`).
- `isAvailable` must be a boolean (`invalid_availability`).
- A product, group or option outside the session business returns `not_found`.

The surcharge write uses `upsert` on the `business_id` primary key, so the first save creates the
settings row and later saves update it. No other settings column is read or written.

## Known limits

- There is no delete: availability and option toggles are the only removal path, matching the
  database grants.
- Reordering is one row per request (`sortOrder`); the page does not offer drag-and-drop yet.
- The preview shows one representative sample per group, not every legal combination.
