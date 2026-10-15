export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

type Environment = Record<string, string | undefined>;
const PUBLISHABLE_PREFIX = "sb_publishable_";

function jwtHasAnonRole(key: string): boolean {
  const parts = key.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) return false;
  const encodedPayload = parts[1];
  if (!encodedPayload) return false;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as { role?: unknown };
    return payload !== null && typeof payload === "object" && payload.role === "anon";
  } catch {
    return false;
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "[::1]") return true;
  const octets = normalized.split(".");
  return octets.length === 4 && octets[0] === "127" && octets.slice(1).every((octet) => {
    const value = Number(octet);
    return /^\d{1,3}$/.test(octet) && value >= 0 && value <= 255;
  });
}

function validPublicKey(key: string): boolean {
  if (key.startsWith(PUBLISHABLE_PREFIX)) {
    return key.length > PUBLISHABLE_PREFIX.length && !key.includes(".");
  }
  return jwtHasAnonRole(key);
}

function defaultEnvironment(): Environment {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  };
}

export function getSupabaseConfig(environment: Environment = defaultEnvironment()): SupabaseConfig | null {
  const useOfficialPair = environment.NEXT_PUBLIC_SUPABASE_URL !== undefined ||
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== undefined;
  const urlValue = (useOfficialPair ? environment.NEXT_PUBLIC_SUPABASE_URL : environment.SUPABASE_URL)?.trim();
  const anonKey = (useOfficialPair ? environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY : environment.SUPABASE_ANON_KEY)?.trim();
  if (!urlValue || !anonKey || !validPublicKey(anonKey)) return null;

  try {
    const url = new URL(urlValue);
    if (url.username || url.password || !/^https?:$/.test(url.protocol)) return null;
    if (url.protocol === "http:" && !isLoopbackHostname(url.hostname)) return null;
    return { url: url.origin, anonKey };
  } catch {
    return null;
  }
}
