export function isUnconfirmedEmailError(error: { code?: string; message?: string }): boolean {
  return error.code === "email_not_confirmed"
    || error.message?.toLowerCase().includes("email not confirmed") === true;
}
