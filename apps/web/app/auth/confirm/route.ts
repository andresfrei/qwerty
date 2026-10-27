import type { NextRequest } from "next/server.js";
import type { NextResponse } from "next/server.js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { handleAuthConfirm } from "./handler.ts";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleAuthConfirm(request);
}
