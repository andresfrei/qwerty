export const ACCESS_STATUS_KEYS = {
  invalid: "invalid",
  unavailable: "unavailable",
  required: "required",
  unconfirmed: "unconfirmed",
  checkEmail: "check-email",
  signedOut: "signed-out",
  passwordUpdated: "password-updated",
} as const;

export type AccessStatusKey = (typeof ACCESS_STATUS_KEYS)[keyof typeof ACCESS_STATUS_KEYS];
export type AccessRoute = "/auth/login" | "/auth/signup" | "/owner";
type AccessCredentials = {
  email: string;
  password: string;
};

type AccessValidation =
  | { ok: true; email: string; password: string }
  | { ok: false };
const ACCESS_ROUTES: readonly AccessRoute[] = ["/auth/login", "/auth/signup", "/owner"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
export function validateAccessForm(formData: FormData): AccessValidation {
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");
  if (typeof rawEmail !== "string" || typeof rawPassword !== "string") return { ok: false };

  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254 || rawPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false };
  }

  return { ok: true, email, password: rawPassword };
}
export function getAccessStatus(value: unknown): AccessStatusKey | null {
  if (typeof value !== "string") return null;
  return (Object.values(ACCESS_STATUS_KEYS) as string[]).includes(value)
    ? value as AccessStatusKey
    : null;
}
export function accessRedirect(route: unknown, status?: unknown): string {
  const safeRoute = ACCESS_ROUTES.includes(route as AccessRoute) ? route as AccessRoute : "/auth/login";
  const safeStatus = getAccessStatus(status);
  return safeStatus ? `${safeRoute}?status=${encodeURIComponent(safeStatus)}` : safeRoute;
}

export type { AccessCredentials, AccessValidation };
