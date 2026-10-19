import type { NextRequest } from "next/server";
import { handleReceiptRequest } from "../../../../lib/receipt-http";
import { receiptRuntime } from "../../../../lib/receipt-staging-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: NextRequest, context: { params: Promise<{ receiptId: string }> }) {
  return handleReceiptRequest(request, (await context.params).receiptId, receiptRuntime);
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as HEAD, handle as OPTIONS };
