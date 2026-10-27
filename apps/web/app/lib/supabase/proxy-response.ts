import type { CookieOptions } from "@supabase/ssr";

export type PendingProxyCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

export type ProxyResponseState = {
  cookies: PendingProxyCookie[];
  headers: Record<string, string>;
};

type CookieResponse = {
  cookies: {
    set(name: string, value: string, options: CookieOptions): void;
  };
  headers: Headers;
};

export function createProxyResponseState(): ProxyResponseState {
  return { cookies: [], headers: {} };
}

export function collectProxyResponse(
  state: ProxyResponseState,
  cookiesToSet: PendingProxyCookie[],
  headers: Record<string, string>,
): void {
  state.cookies.push(...cookiesToSet);
  Object.assign(state.headers, headers);
}

export function applyProxyResponse(response: CookieResponse, state: ProxyResponseState): void {
  state.cookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  Object.entries(state.headers).forEach(([name, value]) => {
    response.headers.set(name, value);
  });
  const cacheDirectives = new Set((response.headers.get("cache-control") ?? "")
    .split(",").map((directive) => directive.trim()).filter(Boolean));
  // Proxy headers can take precedence over route headers; keep the full private
  // anti-cache policy even when no Supabase cookie refresh supplied directives.
  for (const directive of ["private", "no-cache", "no-store", "must-revalidate", "max-age=0"]) {
    cacheDirectives.add(directive);
  }
  response.headers.set("cache-control", [...cacheDirectives].join(", "));
  if (!response.headers.has("pragma")) response.headers.set("pragma", "no-cache");
  if (!response.headers.has("expires")) response.headers.set("expires", "0");
}
