import { createHash, randomUUID } from "node:crypto";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { validateReceiptFile, type ValidatedReceipt } from "./receipt-file.ts";

export const RECEIPT_BUCKET = "guest-receipts";
export const RECEIPT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export type ReceiptRow = {
  id: string; actor_id: string; business_id: string; object_path: string;
  content_type: ValidatedReceipt["contentType"]; size_bytes: number; sha256: string; state: "staged";
};
export interface ReceiptRepository {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  insert(row: ReceiptRow): Promise<void>;
  find(actor: string, business: string, id: string): Promise<ReceiptRow | null>;
  download(path: string): Promise<Uint8Array>;
}
export function createReceiptStaging(repository: ReceiptRepository, options: {
  randomId?: () => string;
  validate?: (input: { bytes: Uint8Array }) => Promise<ValidatedReceipt>;
} = {}) {
  const validate = options.validate ?? validateReceiptFile;
  return {
    async stage(actor: string, business: string, bytes: Uint8Array): Promise<string> {
      if (!RECEIPT_UUID.test(actor) || !RECEIPT_UUID.test(business)) throw new Error("Invalid receipt scope");
      const validated = await validate({ bytes });
      const id = (options.randomId ?? randomUUID)();
      if (!RECEIPT_UUID.test(id)) throw new Error("Invalid receipt identifier");
      const path = `${business}/${actor}/${id}`;
      // No overwrite, no order and no automatic deletion. An insert failure can
      // leave a private orphan; a retry always has a fresh random resource.
      await repository.upload(path, validated.bytes, validated.contentType);
      await repository.insert({ id, actor_id: actor, business_id: business, object_path: path,
        content_type: validated.contentType, size_bytes: validated.sizeBytes, sha256: validated.sha256, state: "staged" });
      return id;
    },
    async download(actor: string, business: string, id: string) {
      if (![actor, business, id].every(value => RECEIPT_UUID.test(value))) return null;
      const row = await repository.find(actor, business, id);
      if (!row || row.id !== id || row.actor_id !== actor || row.business_id !== business || row.state !== "staged" ||
        row.object_path !== `${business}/${actor}/${id}` ||
        !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(row.content_type) ||
        !Number.isSafeInteger(row.size_bytes) || row.size_bytes < 1 || row.size_bytes > 10_485_760 || !/^[0-9a-f]{64}$/.test(row.sha256)) return null;
      const bytes = await repository.download(row.object_path);
      if (bytes.length !== row.size_bytes || createHash("sha256").update(bytes).digest("hex") !== row.sha256) return null;
      return { bytes, contentType: row.content_type };
    },
  };
}
export type ReceiptStaging = ReturnType<typeof createReceiptStaging>;
