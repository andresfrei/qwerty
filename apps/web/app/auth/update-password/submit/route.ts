import type { NextRequest } from "next/server.js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { handleUpdatePasswordPost, methodNotAllowed } from "./handler.ts";

export function GET(): Response {
  return methodNotAllowed();
}

export async function POST(request: NextRequest): Promise<Response> {
  return handleUpdatePasswordPost(request);
}
