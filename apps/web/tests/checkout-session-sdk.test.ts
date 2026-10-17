import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
// @ts-expect-error Native Node tests require explicit TypeScript extensions.
import { POST } from "../app/api/checkout/session/route.ts";

const origin = "https://checkout.example.test";
const authOrigin = "https://synthetic.supabase.co";
const user = { id: "11111111-1111-4111-8111-111111111111", is_anonymous: true };

for (const hasSession of [false, true]) {
  test(`production SDK signup ${hasSession ? "with session propagates cookies" : "with user but no session fails closed"}`, async () => {
    const environment = {
      QWERTY_SITE_URL: origin,
      NEXT_PUBLIC_SUPABASE_URL: authOrigin,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
    };
    const previous = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    Object.assign(process.env, environment);
    // Every fetch is intercepted; unexpected calls fail without network access.
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      calls.push(`${method} ${url.pathname}`);
      assert.equal(url.origin, authOrigin);
      switch (url.pathname) {
        case "/rest/v1/business_storefronts":
          return Response.json([{ business_id: user.id, slug: "pizza-shop", display_name: "Pizza", is_published: true }]);
        case "/rest/v1/catalog_categories":
        case "/rest/v1/catalog_items":
          return Response.json([]);
        case "/auth/v1/signup": {
          assert.equal(method, "POST");
          const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
          return Response.json(hasSession ? {
            user,
            access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.synthetic`,
            refresh_token: "synthetic-refresh-token",
            token_type: "bearer",
            expires_in: 3600,
          } : { user });
        }
        default:
          throw new Error(`Unexpected synthetic fetch: ${method} ${url.pathname}`);
      }
    };
    try {
      const request = new NextRequest(`${origin}/api/checkout/session`, {
        method: "POST",
        headers: { host: "checkout.example.test", origin, "content-type": "application/json" },
        body: '{"slug":"pizza-shop"}',
      });
      const response = await POST(request);
      assert.equal(response.status, hasSession ? 200 : 503);
      assert.deepEqual(await response.json(), hasSession ? { ready: true } : { error: "Checkout session unavailable" });
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("pragma"), "no-cache");
      assert.equal(response.headers.get("expires"), "0");
      assert.equal(response.headers.has("set-cookie"), hasSession);
      if (hasSession) assert.match(response.headers.get("set-cookie")!, /sb-synthetic-auth-token=/);
      assert.equal(request.headers.get("cookie"), null);
      assert.deepEqual(calls, [
        "GET /rest/v1/business_storefronts",
        "GET /rest/v1/catalog_categories",
        "GET /rest/v1/catalog_items",
        "POST /auth/v1/signup",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      for (const key of Object.keys(environment)) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
}
