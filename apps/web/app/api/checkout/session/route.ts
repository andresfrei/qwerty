import type { NextRequest } from "next/server.js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { checkoutMethodNotAllowed, handleCheckoutSession } from "../../../lib/supabase/checkout-session.ts";

export const GET = checkoutMethodNotAllowed;
export const HEAD = checkoutMethodNotAllowed;
export const OPTIONS = checkoutMethodNotAllowed;
export const PUT = checkoutMethodNotAllowed;
export const PATCH = checkoutMethodNotAllowed;
export const DELETE = checkoutMethodNotAllowed;

export async function POST(request: NextRequest) {
  return handleCheckoutSession(request);
}
