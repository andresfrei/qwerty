import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server.js";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import { proxy } from "../proxy.ts";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import { applyProxyResponse, collectProxyResponse, createProxyResponseState } from "../app/lib/supabase/proxy-response.ts";

test("proxy response applies multiple refreshed cookies and cache headers after request mutation", () => {
  const request = new NextRequest("https://qwerty.test/owner", {
    headers: { cookie: "sb-old=old" },
  });
  const state = createProxyResponseState();
  request.cookies.set("sb-access-token", "new-access");
  collectProxyResponse(state, [
    { name: "sb-access-token", value: "new-access", options: { path: "/", httpOnly: true } },
  ], { "cache-control": "private, no-cache, no-store, must-revalidate, max-age=0", expires: "0" });
  request.cookies.set("sb-refresh-token", "new-refresh");
  collectProxyResponse(state, [
    { name: "sb-refresh-token", value: "new-refresh", options: { path: "/", httpOnly: true } },
  ], { pragma: "no-cache" });

  const response = NextResponse.next({ request });
  applyProxyResponse(response, state);

  assert.match(request.headers.get("cookie") ?? "", /sb-access-token=new-access/);
  assert.match(response.headers.get("x-middleware-request-cookie") ?? "", /sb-access-token=new-access/);
  assert.match(response.headers.get("set-cookie") ?? "", /sb-access-token=new-access/);
  assert.match(response.headers.get("set-cookie") ?? "", /sb-refresh-token=new-refresh/);
  assert.equal(response.headers.get("cache-control"), "private, no-cache, no-store, must-revalidate, max-age=0");
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("pragma"), "no-cache");
});

test("owner proxy responses remain private and uncacheable even without a cookie refresh", () => {
  const response = NextResponse.next({ request: new NextRequest("https://qwerty.test/owner") });
  applyProxyResponse(response, createProxyResponseState());
  const directives = new Set((response.headers.get("cache-control") ?? "").split(",").map((value) => value.trim()));
  assert.ok(directives.has("private") && directives.has("no-store")
    && directives.has("no-cache") && directives.has("must-revalidate") && directives.has("max-age=0"));
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
});

test("matched proxy fails closed with 503 when Supabase is not configured", async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  try {
    const response = await proxy(new NextRequest("https://qwerty.test/owner"));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Supabase session configuration unavailable" });
    assert.equal(response.headers.get("location"), null);
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = previousKey;
  }
});
