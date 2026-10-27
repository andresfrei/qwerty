import type { NextRequest, NextResponse } from "next/server.js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { handleLandingEntry } from "./handler.ts";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleLandingEntry(request);
}
