import type { ProfileCatalog } from "./catalog-profiles";
import type { StorefrontRead } from "./storefront-reader";

// Public-only, active configuration metadata. Never an owner draft or a private
// checkout snapshot. Unreadable dependencies have no names, IDs or diagnostics.
export type PublicItemConfiguration =
  | { status: "legacy" }
  | { status: "ready"; catalog: ProfileCatalog }
  | { status: "unavailable" };
export type ConfiguredStorefrontRead =
  | (Extract<StorefrontRead, { status: "ok" }> & {
      capability: "ready" | "legacy_only";
      configurations: Record<string, PublicItemConfiguration>;
    })
  | Exclude<StorefrontRead, { status: "ok" }>;
