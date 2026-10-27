import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config";

function isReadOnlyCookieMutation(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("Cookies can only be modified in a Server Action or Route Handler.");
}

export async function createClient(): Promise<SupabaseClient | null> {
  const config = getSupabaseConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, _headers) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch (error) {
          if (!isReadOnlyCookieMutation(error)) throw error;
          // Server Components cannot write cookies; Proxy refreshes sessions.
        }
      },
    },
  });
}
