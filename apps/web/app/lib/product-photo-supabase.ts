import type { PhotoPorts } from "./product-photo-service";

type SupabaseResponse = {
  data: unknown;
  error: unknown;
};

type SupabaseStorageBucket = {
  upload(
    path: string,
    file: Uint8Array,
    options: { contentType: "image/webp"; upsert: false },
  ): Promise<SupabaseResponse>;
};

/** The smallest client surface needed by this adapter and deterministic tests. */
export type SupabasePhotoClient = {
  rpc(name: string, args: Record<string, string | null>): PromiseLike<SupabaseResponse>;
  storage: {
    from(bucket: string): SupabaseStorageBucket;
  };
};

export type PhotoSupabaseErrorCode =
  | "authentication_failed"
  | "database_error"
  | "invalid_database_response"
  | "storage_error";

const errorMessages: Record<PhotoSupabaseErrorCode, string> = {
  authentication_failed: "Photo authentication failed.",
  database_error: "Photo database operation failed.",
  invalid_database_response: "Photo database response was invalid.",
  storage_error: "Photo storage operation failed.",
};

export class PhotoSupabaseError extends Error {
  readonly code: PhotoSupabaseErrorCode;

  constructor(code: PhotoSupabaseErrorCode) {
    super(errorMessages[code]);
    this.name = "PhotoSupabaseError";
    this.code = code;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BIGINT = /^(0|[1-9][0-9]{0,18})$/;
const MAX_BIGINT = BigInt("9223372036854775807");
const OWNER_KEYS = ["business_id", "photo_version"];

export interface SupabasePhotoPortOptions {
  client: SupabasePhotoClient;
  authenticatedUserId: () => Promise<string | null>;
  normalize: PhotoPorts["normalize"];
}

function hasOnlyKeys(value: object, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validVersion(value: unknown): value is string {
  return typeof value === "string" && BIGINT.test(value) && BigInt(value) <= MAX_BIGINT;
}

function validOwnerRow(value: unknown): value is { business_id: string; photo_version: string } {
  if (typeof value !== "object" || value === null || !hasOnlyKeys(value, OWNER_KEYS)) return false;
  const row = value as { business_id?: unknown; photo_version?: unknown };
  return typeof row.business_id === "string" && UUID.test(row.business_id) && validVersion(row.photo_version);
}

function validUploadResponseData(value: unknown, requestedPath: string): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const result = value as { path?: unknown };
  return typeof result.path === "string" && result.path === requestedPath;
}

function stableAuthError(): PhotoSupabaseError {
  return new PhotoSupabaseError("authentication_failed");
}

async function readActor(callback: SupabasePhotoPortOptions["authenticatedUserId"]): Promise<string | null> {
  try {
    const actor = await callback();
    return typeof actor === "string" && UUID.test(actor) ? actor : null;
  } catch {
    throw stableAuthError();
  }
}

async function verifiedActor(callback: SupabasePhotoPortOptions["authenticatedUserId"]): Promise<string> {
  const actor = await readActor(callback);
  if (!actor) throw stableAuthError();
  return actor;
}

async function callRpc(
  client: SupabasePhotoClient,
  name: string,
  args: Record<string, string | null>,
): Promise<unknown> {
  try {
    const response = await client.rpc(name, args);
    if (!response || response.error !== null) throw new PhotoSupabaseError("database_error");
    return response.data;
  } catch (error) {
    if (error instanceof PhotoSupabaseError) throw error;
    throw new PhotoSupabaseError("database_error");
  }
}

export function createSupabasePhotoPorts(options: SupabasePhotoPortOptions): PhotoPorts {
  return {
    authenticatedUserId: () => readActor(options.authenticatedUserId),

    async ownedItem(itemId, _suppliedActorId) {
      const actorId = await verifiedActor(options.authenticatedUserId);
      const data = await callRpc(options.client, "get_owned_product_photo", {
        p_actor_id: actorId,
        p_item_id: itemId,
      });
      if (!Array.isArray(data) || data.length > 1) {
        throw new PhotoSupabaseError("invalid_database_response");
      }
      if (data.length === 0) return null;
      const row = data[0];
      if (!validOwnerRow(row)) throw new PhotoSupabaseError("invalid_database_response");
      return { businessId: row.business_id, photoVersion: row.photo_version };
    },

    normalize: options.normalize,

    async upload(path, bytes, _uploadOptions) {
      try {
        const response = await options.client.storage.from("product-photos").upload(
          path,
          new Uint8Array(bytes),
          { contentType: "image/webp", upsert: false },
        );
        if (
          !response ||
          response.error !== null ||
          !validUploadResponseData(response.data, path)
        ) {
          throw new PhotoSupabaseError("storage_error");
        }
      } catch (error) {
        if (error instanceof PhotoSupabaseError) throw error;
        throw new PhotoSupabaseError("storage_error");
      }
    },

    async commit(change) {
      const actorId = await verifiedActor(options.authenticatedUserId);
      const data = await callRpc(options.client, "commit_product_photo", {
        p_actor_id: actorId,
        p_item_id: change.itemId,
        p_business_id: change.businessId,
        p_expected_version: change.expectedVersion,
        p_next_version: change.nextVersion,
        p_photo_path: change.photoPath,
      });
      if (typeof data !== "boolean") throw new PhotoSupabaseError("invalid_database_response");
      return data;
    },
  };
}
