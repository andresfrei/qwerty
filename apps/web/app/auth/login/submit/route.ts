import type { NextRequest } from "next/server";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { handleAccessPost, methodNotAllowed } from "../../../lib/supabase/auth-post.ts";

export function GET(): Response {
  return methodNotAllowed();
}

export async function POST(request: NextRequest): Promise<Response> {
  return handleAccessPost(request, "login");
}
