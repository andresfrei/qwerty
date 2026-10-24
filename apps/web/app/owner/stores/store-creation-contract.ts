import type { OwnerBusiness } from "../owner-context";

/** Stable wire types for the creation UI; businessId is an attempt reference, not authority. */
export type StoreCreationInput = { businessId: string; name: string; slug: string };
export type CreationStorefront = { slug: string; display_name: string; is_published: boolean };
export type StoreCreationResponse =
  | { state: "ready"; businessId: string; business: OwnerBusiness; storefront: CreationStorefront }
  | { state: "partial"; businessId: string; business: OwnerBusiness; reason: "storefront_missing" | "slug_unavailable" | "draft_rejected" }
  | { state: "outcome_unknown"; businessId: string }
  | { error: "method_not_allowed" | "request_rejected" | "invalid_request" | "unauthorized" | "unavailable" };

export interface StoreCreationGateway {
  confirmedUser(): Promise<string | null>;
  ownedBusiness(ownerId: string, businessId: string): Promise<OwnerBusiness | null>;
  storefront(businessId: string): Promise<CreationStorefront | null>;
  insertBusiness(ownerId: string, input: StoreCreationInput): Promise<OwnerBusiness>;
  insertStorefront(business: OwnerBusiness, slug: string): Promise<CreationStorefront>;
}
export class StoreCreationWriteError extends Error {
  readonly code: "duplicate" | "rejected" | "unknown";
  constructor(code: "duplicate" | "rejected" | "unknown") { super(code); this.code = code; }
}
