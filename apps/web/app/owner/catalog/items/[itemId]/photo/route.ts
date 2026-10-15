import {
  createPhotoRouteHandlers,
} from "../../../../../lib/product-photo-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createPhotoRouteHandlers();

export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
export const GET = handlers.GET;
export const HEAD = handlers.HEAD;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
export const OPTIONS = handlers.OPTIONS;
