import type { BrowserAuthResult } from "./liveAuthClient";

export const GENERIC_ATTEMPTED_LOGIN_DENIAL = "Sign-in attempt completed. Access was not granted.";

type ValueControl = { value: string };
export type LiveLoginForm = Pick<HTMLFormElement, "elements">;

function valueControl(form: LiveLoginForm, name: "emailAddress" | "password"): ValueControl | null {
  const control = form.elements.namedItem(name) as unknown;
  if (!control || typeof control !== "object" || !("value" in control)) return null;
  const value = (control as { value?: unknown }).value;
  return typeof value === "string" ? control as ValueControl : null;
}

export function readLiveLoginFormValues(form: LiveLoginForm): { emailAddress: string; password: string } {
  return {
    emailAddress: valueControl(form, "emailAddress")?.value ?? "",
    password: valueControl(form, "password")?.value ?? "",
  };
}

export function loginAttemptPublicMessage(result: BrowserAuthResult): string {
  return result.receipt?.status === "denied" ? GENERIC_ATTEMPTED_LOGIN_DENIAL : result.publicMessage;
}

export async function submitLiveLoginForm(
  form: LiveLoginForm,
  login: (emailAddress: string, password: string) => Promise<BrowserAuthResult>,
  clearControlledPassword: () => void,
): Promise<{ result: BrowserAuthResult; publicMessage: string }> {
  const values = readLiveLoginFormValues(form);
  let pendingResult!: Promise<BrowserAuthResult>;
  try {
    pendingResult = login(values.emailAddress.trim(), values.password);
  } finally {
    const passwordControl = valueControl(form, "password");
    if (passwordControl) passwordControl.value = "";
    values.password = "";
    clearControlledPassword();
  }
  const result = await pendingResult;
  return { result, publicMessage: loginAttemptPublicMessage(result) };
}
