import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "../../lib/supabase/config";
import { handleOnboarding } from "./owner-onboarding";
import { createOnboardingGateway } from "./owner-onboarding-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  const staged = new Map<string, { name: string; value: string; options: CookieOptions }>();
  let verifiedOwner = false;
  const response = await handleOnboarding(request, {
    async createGateway() {
      const config = getSupabaseConfig();
      if (!config) return null;
      const client = createServerClient(config.url, config.anonKey, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(values) { for (const cookie of values) staged.set(cookie.name, cookie); },
        },
      });
      const gateway = createOnboardingGateway(client);
      return {
        ...gateway,
        async confirmedUser() {
          const ownerId = await gateway.confirmedUser();
          verifiedOwner = Boolean(ownerId);
          return ownerId;
        },
      };
    },
  });
  const result = new NextResponse(response.body, { status: response.status, headers: response.headers });
  // Refresh may precede getUser rejection. Commit only after fresh eligible identity,
  // even when a subsequent business read fails; never replace cookies on Auth failure.
  if (verifiedOwner) for (const cookie of staged.values()) result.cookies.set(cookie.name, cookie.value, cookie.options);
  return result;
}
export const GET = POST;
