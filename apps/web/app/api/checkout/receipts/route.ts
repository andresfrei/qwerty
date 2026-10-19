import type { NextRequest } from "next/server";
import { handleReceiptRequest } from "../../../lib/receipt-http";
import { receiptRuntime } from "../../../lib/receipt-staging-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function handle(request: NextRequest) { return handleReceiptRequest(request, undefined, receiptRuntime); }
export { handle as POST, handle as GET, handle as PUT, handle as PATCH, handle as DELETE, handle as HEAD, handle as OPTIONS };
