import { createServerClient } from "@supabase/ssr";
import type { CheckoutDependencies } from "./checkout-session";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getSupabaseConfig } from "./config.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { getTrustedSiteOrigin } from "./confirm.ts";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { readStorefront } from "../storefront-reader.ts";

export const checkoutRuntime: CheckoutDependencies = {
  getConfig: getSupabaseConfig,
  getOrigin: getTrustedSiteOrigin,
  readStorefront,
  createAuth(config, state) {
    return createServerClient(config.url, config.anonKey, {
      cookies: { getAll: state.getAll, setAll: state.setAll },
    }).auth;
  },
};
