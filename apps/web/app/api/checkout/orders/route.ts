import type { NextRequest } from "next/server";
import { handlePickupOrderRequest } from "../../../lib/pickup-order-http";
import { pickupOrderRuntime } from "../../../lib/supabase/pickup-order-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function handle(request: NextRequest) { return handlePickupOrderRequest(request, "collection", pickupOrderRuntime); }
export { handle as POST, handle as GET, handle as PUT, handle as PATCH, handle as DELETE, handle as HEAD, handle as OPTIONS };
