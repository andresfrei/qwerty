import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { fork } from "node:child_process";
import { join } from "node:path";
import type { ReceiptDependencies } from "./receipt-http";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getSupabaseConfig } from "./supabase/config.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getTrustedSiteOrigin } from "./supabase/confirm.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { createReceiptValidator } from "./receipt-file.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { createReceiptStaging } from "./receipt-staging.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { createSupabaseReceiptRepository, receiptServiceClient } from "./receipt-staging-supabase.ts";

// Next's Node deployment must retain this traced source entry and its parser
// dependencies. CWD is the web app root, not a request-supplied path.
const validate = createReceiptValidator({ spawnProcessor: () => fork(join(process.cwd(), "app/lib/receipt-file-worker.mjs"), [], {
  serialization: "advanced", stdio: ["ignore", "ignore", "ignore", "ipc"],
  execArgv: ["--max-old-space-size=128"], env: { NODE_ENV: "production" },
}) });
function serviceKey(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return null;
  if (key.startsWith("sb_secret_") && key.length > 10 && !key.includes(".")) return key;
  try {
    const parts = key.split(".");
    return parts.length === 3 && parts.every(Boolean) && JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8")).role === "service_role" ? key : null;
  } catch { return null; }
}
export const receiptRuntime: ReceiptDependencies = {
  getConfig() {
    const config = getSupabaseConfig(), key = serviceKey();
    return config && key ? { ...config, serviceKey: key } : null;
  },
  getOrigin: getTrustedSiteOrigin,
  async readBusiness(config, slug) {
    // Publication is read with the public role, never owner/service visibility.
    const client = createClient(config.url, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
    const { data, error } = await client.from("business_storefronts").select("business_id,is_published,slug").eq("slug", slug).eq("is_published", true).maybeSingle();
    if (error) return { status: "unavailable" };
    if (data?.is_published !== true || data.slug !== slug) return { status: "not_found" };
    return { status: "ok", businessId: data.business_id };
  },
  async getUser(config, state) {
    return createServerClient(config.url, config.anonKey, { cookies: { getAll: state.getAll, setAll: state.setAll } }).auth.getUser();
  },
  staging(config) { return createReceiptStaging(createSupabaseReceiptRepository(receiptServiceClient(config)), { validate }); },
};
