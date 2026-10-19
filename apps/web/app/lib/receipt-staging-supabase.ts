import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ReceiptConfig } from "./receipt-http";
import type { ReceiptRepository, ReceiptRow } from "./receipt-staging";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { RECEIPT_BUCKET } from "./receipt-staging.ts";

// This module is imported only by Node route composition, never client components.
export function receiptServiceClient(config: ReceiptConfig, fetcher: typeof fetch = fetch): SupabaseClient {
  return createClient(config.url, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetcher(input, { ...init, cache: "no-store" }) },
  });
}
export function createSupabaseReceiptRepository(client: SupabaseClient): ReceiptRepository {
  return {
    async upload(path, bytes, contentType) {
      const { error } = await client.storage.from(RECEIPT_BUCKET).upload(path, bytes, { contentType, upsert: false, cacheControl: "0" });
      if (error) throw new Error("Receipt upload unavailable");
    },
    async insert(row) {
      const { error } = await client.from("guest_receipts").insert(row);
      if (error) throw new Error("Receipt metadata unavailable");
    },
    async find(actor, business, id) {
      const { data, error } = await client.from("guest_receipts").select("id,actor_id,business_id,object_path,content_type,size_bytes,sha256,state")
        .eq("actor_id", actor).eq("business_id", business).eq("id", id).eq("state", "staged").maybeSingle();
      if (error) throw new Error("Receipt metadata unavailable");
      return data as ReceiptRow | null;
    },
    async download(path) {
      const { data, error } = await client.storage.from(RECEIPT_BUCKET).download(path);
      if (error || !data || data.size > 10_485_760) throw new Error("Receipt download unavailable");
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}
