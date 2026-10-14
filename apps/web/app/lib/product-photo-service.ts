import { randomUUID } from "node:crypto";
import type { NormalizedProductPhoto } from "./product-photo-normalizer";

export class PhotoChangeError extends Error {
  readonly code: "invalid_input" | "unauthorized" | "not_found" | "conflict";

  constructor(code: PhotoChangeError["code"]) {
    super(code);
    this.name = "PhotoChangeError";
    this.code = code;
  }
}

export interface PhotoChange {
  itemId: string;
  expectedVersion: string;
  operation: "replace" | "detach";
  image?: Uint8Array;
}

export interface PhotoReference {
  photoPath: string | null;
  // Preserve PostgreSQL bigint precision; never pass this through Number.
  photoVersion: string;
}

export interface PhotoPorts {
  // The production adapter must verify the session, not trust a submitted ID.
  authenticatedUserId(): Promise<string | null>;
  ownedItem(itemId: string, actorId: string): Promise<{
    businessId: string;
    photoVersion: string;
  } | null>;
  normalize(image: Uint8Array): Promise<NormalizedProductPhoto>;
  upload(
    path: string,
    bytes: Uint8Array,
    options: { contentType: "image/webp"; upsert: false },
  ): Promise<void>;
  // A single atomic persistence operation must recheck the actor's ownership
  // AND expectedVersion before updating the reference. Return false on a race.
  // Never implement this as a read followed by an unconditional admin UPDATE.
  commit(change: {
    actorId: string;
    itemId: string;
    businessId: string;
    expectedVersion: string;
    nextVersion: string;
    photoPath: string | null;
  }): Promise<boolean>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VERSION = /^(0|[1-9][0-9]{0,18})$/;
const MAX_VERSION = BigInt("9223372036854775807");

export async function changeProductPhoto(
  change: PhotoChange,
  ports: PhotoPorts,
): Promise<PhotoReference> {
  if (
    !UUID.test(change.itemId) ||
    !VERSION.test(change.expectedVersion) ||
    BigInt(change.expectedVersion) >= MAX_VERSION ||
    (change.operation !== "replace" && change.operation !== "detach") ||
    (change.operation === "replace" &&
      (!(change.image instanceof Uint8Array) || change.image.byteLength === 0)) ||
    (change.operation === "detach" && change.image !== undefined)
  ) {
    throw new PhotoChangeError("invalid_input");
  }

  const actorId = await ports.authenticatedUserId();
  if (!actorId) throw new PhotoChangeError("unauthorized");
  const item = await ports.ownedItem(change.itemId, actorId);
  if (!item) throw new PhotoChangeError("not_found");
  if (item.photoVersion !== change.expectedVersion) {
    throw new PhotoChangeError("conflict");
  }

  let photoPath: string | null = null;
  if (change.operation === "replace") {
    // The adapter must bind this port to the canonical PHOTO-1 normalizer.
    const photo = await ports.normalize(change.image as Uint8Array);
    photoPath = `${item.businessId}/${change.itemId}/${randomUUID()}.webp`;
    await ports.upload(photoPath, photo.buffer, {
      contentType: "image/webp",
      upsert: false,
    });
  }

  const photoVersion = (BigInt(change.expectedVersion) + BigInt(1)).toString();
  const committed = await ports.commit({
    actorId,
    itemId: change.itemId,
    businessId: item.businessId,
    expectedVersion: change.expectedVersion,
    nextVersion: photoVersion,
    photoPath,
  });
  // An uploaded object can remain unreferenced on conflict/failure. Do not delete
  // it or an earlier public image: Storage and metadata are not one transaction.
  if (committed !== true) throw new PhotoChangeError("conflict");
  return { photoPath, photoVersion };
}
