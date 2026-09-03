import type { BrowserAuthResult } from "./liveAuthClient";

export const GENERIC_PASSWORD_CHANGE_DENIAL = "Password update was not completed. Request a new recovery message before trying again.";

type ValueControl = { value: string };
export type LiveRecoveryPasswordForm = Pick<HTMLFormElement, "elements">;

function valueControl(form: LiveRecoveryPasswordForm, name: "newPassword" | "confirmPassword"): ValueControl | null {
  const control = form.elements.namedItem(name) as unknown;
  if (!control || typeof control !== "object" || !("value" in control)) return null;
  return typeof (control as { value?: unknown }).value === "string" ? control as ValueControl : null;
}

export async function submitRecoveryPasswordForm(
  form: LiveRecoveryPasswordForm,
  changePassword: (newPassword: string) => Promise<BrowserAuthResult>,
  clearControlledPasswords: () => void,
): Promise<{ result: BrowserAuthResult | null; publicMessage: string }> {
  const newPasswordControl = valueControl(form, "newPassword");
  const confirmPasswordControl = valueControl(form, "confirmPassword");
  const newPassword = newPasswordControl?.value ?? "";
  const confirmation = confirmPasswordControl?.value ?? "";
  let pendingResult: Promise<BrowserAuthResult> | null = null;
  try {
    if (newPassword && newPassword === confirmation) pendingResult = changePassword(newPassword);
  } finally {
    if (newPasswordControl) newPasswordControl.value = "";
    if (confirmPasswordControl) confirmPasswordControl.value = "";
    clearControlledPasswords();
  }
  if (!pendingResult) return { result: null, publicMessage: GENERIC_PASSWORD_CHANGE_DENIAL };
  const result = await pendingResult;
  return {
    result,
    publicMessage: result.receipt?.allowed && result.receipt.status === "signed_out"
      ? result.publicMessage
      : GENERIC_PASSWORD_CHANGE_DENIAL,
  };
}
