import "server-only";
import {
  createClient as createSupabaseClient,
  isAuthError,
  isAuthSessionMissingError,
} from "@supabase/supabase-js";
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { getSupabaseConfig, type SupabaseConfig } from "./supabase/config";
import {
  normalizeProductPhoto,
  PhotoNormalizationError,
} from "./product-photo-normalizer";
import {
  changeProductPhoto,
  PhotoChangeError,
  type PhotoChange,
  type PhotoPorts,
  type PhotoReference,
} from "./product-photo-service";
import {
  createSupabasePhotoPorts,
  PhotoSupabaseError,
  type SupabasePhotoClient,
} from "./product-photo-supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PublicUser = {
  id: string;
  email_confirmed_at?: string | null;
  is_anonymous?: boolean;
};

type PublicAuthClient = {
  auth: {
    getUser(): Promise<{
      data: { user: PublicUser | null } | null;
      error: unknown | null;
    }>;
  };
};

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

type RuntimeCookieState = {
  getAll(): { name: string; value: string }[];
  setAll(cookies: CookieToSet[], headers: Record<string, string>): void;
  markVerified(): void;
  apply(response: Response): Response;
};

export type PhotoRuntime = {
  authenticate(): Promise<string | null>;
  change(change: PhotoChange): Promise<PhotoReference>;
  applyCookies(response: Response): Response;
};

export type PhotoRuntimeErrorCode = "unavailable";

export class PhotoRuntimeError extends Error {
  readonly code: PhotoRuntimeErrorCode;

  constructor(code: PhotoRuntimeErrorCode) {
    super(code);
    this.name = "PhotoRuntimeError";
    this.code = code;
  }
}

export type PhotoRuntimeDependencies = {
  getConfig?: () => SupabaseConfig | null;
  getPrivateKey?: () => string | null | undefined;
  createPublicClient?: (
    url: string,
    anonKey: string,
    cookies: Pick<RuntimeCookieState, "getAll" | "setAll">,
  ) => PublicAuthClient;
  createPrivateClient?: (
    url: string,
    secretKey: string,
    options: {
      auth: {
        persistSession: false;
        autoRefreshToken: false;
        detectSessionInUrl: false;
      };
    },
  ) => SupabasePhotoClient;
  normalize?: PhotoPorts["normalize"];
};

type AuthState =
  | { status: "unknown" }
  | { status: "anonymous" }
  | { status: "authenticated"; actorId: string }
  | { status: "unavailable" };

function defaultPrivateKey(): string | null {
  return process.env.SUPABASE_SECRET_KEY?.trim() || null;
}

function validPrivateKey(value: unknown): value is string {
  return typeof value === "string" && /^sb_secret_[^\s]+$/.test(value.trim());
}

function createDefaultPublicClient(
  url: string,
  anonKey: string,
  cookies: Pick<RuntimeCookieState, "getAll" | "setAll">,
): PublicAuthClient {
  return createServerClient(url, anonKey, { cookies });
}

function createDefaultPrivateClient(
  url: string,
  secretKey: string,
  options: Parameters<typeof createSupabaseClient>[2],
): SupabasePhotoClient {
  return createSupabaseClient(url, secretKey, options);
}

function parseRequestCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  const header = request.headers.get("cookie");
  if (!header) return cookies;
  for (const { name, value } of parseCookieHeader(header)) cookies.set(name, value);
  return cookies;
}

function createCookieState(request: Request): RuntimeCookieState {
  const values = parseRequestCookies(request);
  const staged: CookieToSet[] = [];
  const responseHeaders: Record<string, string> = {};
  let verified = false;

  return {
    getAll() {
      return [...values].map(([name, value]) => ({ name, value }));
    },
    setAll(cookies, headers) {
      for (const cookie of cookies) {
        values.set(cookie.name, cookie.value);
        staged.push(cookie);
      }
      for (const [name, value] of Object.entries(headers)) {
        const normalized = name.toLowerCase();
        if (normalized === "cache-control" || normalized === "pragma" || normalized === "expires") {
          responseHeaders[normalized] = value;
        }
      }
    },
    markVerified() {
      verified = true;
    },
    apply(response) {
      if (!verified) return secureResponse(response);
      for (const [name, value] of Object.entries(responseHeaders)) response.headers.set(name, value);
      for (const cookie of staged) {
        response.headers.append("set-cookie", serializeCookieHeader(cookie.name, cookie.value, cookie.options));
      }
      return secureResponse(response);
    },
  };
}

function secureResponse(response: Response): Response {
  response.headers.set("cache-control", "private, no-store, no-cache, max-age=0, must-revalidate");
  response.headers.set("pragma", "no-cache");
  response.headers.set("expires", "0");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

function isPublicUser(value: unknown): value is PublicUser {
  if (typeof value !== "object" || value === null) return false;
  const user = value as { id?: unknown; email_confirmed_at?: unknown; is_anonymous?: unknown };
  return typeof user.id === "string" && UUID.test(user.id) &&
    (user.email_confirmed_at === null || user.email_confirmed_at === undefined || typeof user.email_confirmed_at === "string") &&
    (user.is_anonymous === undefined || typeof user.is_anonymous === "boolean");
}

function isUnauthenticatedError(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) return true;
  if (!isAuthError(error)) return false;
  const authError = error as { status?: unknown; code?: unknown };
  return authError.status === 401 || authError.code === "invalid_token";
}

function isTypedPhotoError(error: unknown): boolean {
  return error instanceof PhotoChangeError ||
    error instanceof PhotoSupabaseError ||
    error instanceof PhotoNormalizationError ||
    error instanceof PhotoRuntimeError;
}

export function createPhotoRuntime(
  request: Request,
  dependencies: PhotoRuntimeDependencies = {},
): PhotoRuntime {
  if (typeof window !== "undefined") throw new PhotoRuntimeError("unavailable");
  const getConfig = dependencies.getConfig ?? getSupabaseConfig;
  const getPrivateKey = dependencies.getPrivateKey ?? defaultPrivateKey;
  const createPublicClient = dependencies.createPublicClient ?? createDefaultPublicClient;
  const createPrivateClient = dependencies.createPrivateClient ?? createDefaultPrivateClient;
  const normalize = dependencies.normalize ?? normalizeProductPhoto;
  const cookies = createCookieState(request);

  let authPromise: Promise<AuthState> | undefined;
  let portsPromise: Promise<PhotoPorts> | undefined;
  let verifiedConfig: SupabaseConfig | undefined;

  async function verifyAuth(): Promise<AuthState> {
    if (authPromise) return authPromise;
    authPromise = (async () => {
      const config = getConfig();
      if (!config) return { status: "unavailable" } as const;
      try {
        const client = createPublicClient(config.url, config.anonKey, cookies);
        const result = await client.auth.getUser();
        if (!result || result.error !== null) {
          if (result && isUnauthenticatedError(result.error)) return { status: "anonymous" } as const;
          return { status: "unavailable" } as const;
        }
        if (!result.data || !Object.hasOwn(result.data, "user")) return { status: "unavailable" } as const;
        if (result.data.user === null) return { status: "anonymous" } as const;
        if (!isPublicUser(result.data.user)) return { status: "unavailable" } as const;
        if (result.data.user.is_anonymous === true || !result.data.user.email_confirmed_at) return { status: "anonymous" } as const;
        verifiedConfig = config;
        cookies.markVerified();
        return { status: "authenticated", actorId: result.data.user.id } as const;
      } catch (error) {
        if (isUnauthenticatedError(error)) return { status: "anonymous" } as const;
        return { status: "unavailable" } as const;
      }
    })();
    return authPromise;
  }

  async function authenticatedActor(): Promise<string | null> {
    const state = await verifyAuth();
    if (state.status === "unavailable") throw new PhotoRuntimeError("unavailable");
    return state.status === "authenticated" ? state.actorId : null;
  }

  async function createPhotoPorts(): Promise<PhotoPorts> {
    if (portsPromise) return portsPromise;
    portsPromise = (async () => {
      const state = await verifyAuth();
      if (state.status !== "authenticated") throw new PhotoRuntimeError("unavailable");
      const config = verifiedConfig;
      const secretKey = getPrivateKey();
      if (!config || !validPrivateKey(secretKey)) throw new PhotoRuntimeError("unavailable");
      const client = createPrivateClient(config.url, secretKey.trim(), {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      return createSupabasePhotoPorts({ client, authenticatedUserId: authenticatedActor, normalize });
    })();
    return portsPromise;
  }

  const lazyPorts: PhotoPorts = {
    authenticatedUserId: () => createPhotoPorts().then((ports) => ports.authenticatedUserId()),
    ownedItem: (itemId, actorId) => createPhotoPorts().then((ports) => ports.ownedItem(itemId, actorId)),
    normalize: (image) => createPhotoPorts().then((ports) => ports.normalize(image)),
    upload: (path, bytes, options) => createPhotoPorts().then((ports) => ports.upload(path, bytes, options)),
    commit: (change) => createPhotoPorts().then((ports) => ports.commit(change)),
  };

  return {
    async authenticate() {
      return authenticatedActor();
    },
    async change(change) {
      const state = await verifyAuth();
      if (state.status === "unavailable") throw new PhotoRuntimeError("unavailable");
      if (state.status === "anonymous") throw new PhotoChangeError("unauthorized");
      try {
        return await changeProductPhoto(change, lazyPorts);
      } catch (error) {
        if (isTypedPhotoError(error)) throw error;
        throw new PhotoRuntimeError("unavailable");
      }
    },
    applyCookies(response) {
      return cookies.apply(response);
    },
  };
}
