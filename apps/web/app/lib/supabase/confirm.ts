export type AuthConfirmResolution =
  | {
      tokenHash: string;
      otpType: "email" | "recovery";
      redirectPath: "/owner" | "/auth/update-password";
    }
  | {
      tokenHash: null;
      otpType: null;
      redirectPath: "/auth/error";
    };

type Environment = Record<string, string | undefined>;

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "[::1]") return true;
  const octets = normalized.split(".");
  return octets.length === 4 && octets[0] === "127" && octets.slice(1).every((octet) => {
    const value = Number(octet);
    return /^\d{1,3}$/.test(octet) && value >= 0 && value <= 255;
  });
}

export function getTrustedSiteOrigin(environment: Environment = process.env): string | null {
  const value = environment.QWERTY_SITE_URL?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    const safeProtocol = url.protocol === "https:" || (url.protocol === "http:" && isLoopbackHostname(url.hostname));
    if (!safeProtocol || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

type CallbackRequest = {
  url: string;
  headers: Pick<Headers, "get">;
};

/**
 * Host headers are the ingress boundary; Next's internal URL may be loopback in local dev.
 */
export function isTrustedCallbackRequest(request: CallbackRequest, trustedOrigin: string): boolean {
  try {
    const trusted = new URL(trustedOrigin);
    const trustedHost = trusted.host.toLowerCase();
    const host = request.headers.get("host");
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto");

    if (!host || host.trim().toLowerCase() !== trustedHost) return false;
    if (forwardedHost !== null && forwardedHost.trim().toLowerCase() !== trustedHost) return false;
    if (forwardedProto !== null && forwardedProto.trim().toLowerCase() !== trusted.protocol.slice(0, -1)) return false;

    const requestUrl = new URL(request.url);
    if (requestUrl.origin === trusted.origin) return true;
    const hasValidatedForwardedOrigin = forwardedHost !== null && forwardedProto !== null;
    return requestUrl.protocol === trusted.protocol
      && isLoopbackHostname(requestUrl.hostname)
      && (requestUrl.port === trusted.port || hasValidatedForwardedOrigin);
  } catch {
    return false;
  }
}

export function resolveAuthConfirm(params: Pick<URLSearchParams, "get">): AuthConfirmResolution {
  const tokenHash = params.get("token_hash");
  const otpType = params.get("type");

  if (!tokenHash?.trim()) {
    return { tokenHash: null, otpType: null, redirectPath: "/auth/error" };
  }
  if (otpType === "email") {
    return { tokenHash, otpType, redirectPath: "/owner" };
  }
  if (otpType === "recovery") {
    return { tokenHash, otpType, redirectPath: "/auth/update-password" };
  }
  return { tokenHash: null, otpType: null, redirectPath: "/auth/error" };
}
