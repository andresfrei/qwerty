import type { CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";

export type CallbackCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

export type CallbackCookieState = {
  cookies: CallbackCookie[];
  headers: Record<string, string>;
  getAll(): { name: string; value: string }[];
  setAll(cookiesToSet: CallbackCookie[], headers: Record<string, string>): void;
};

export function createCallbackCookieState(request: Pick<NextRequest, "cookies">): CallbackCookieState {
  const state: CallbackCookieState = {
    cookies: [],
    headers: {},
    getAll() {
      return request.cookies.getAll();
    },
    setAll(cookiesToSet, headers) {
      cookiesToSet.forEach(({ name, value }) => {
        request.cookies.set(name, value);
      });
      state.cookies.push(...cookiesToSet);
      Object.assign(state.headers, headers);
    },
  };
  return state;
}
