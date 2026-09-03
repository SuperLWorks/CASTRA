import type { BrowserAuthResult } from "./liveAuthClient";

export const PRODUCT_OWNER_PROOF_ACTION = "foundation_manifest_change" as const;
export const OPERATIONAL_STATE_RECOVERY_PROOF_ACTION = "operational_state_recovery" as const;
export const OPERATIONAL_STATE_INITIAL_IMPORT_PROOF_ACTION = "operational_state_initial_import" as const;
export const PRODUCT_OWNER_PROOF_SUCCESS = "Product Owner proof accepted for a Foundation Manifest change. No protected action was performed. The proof expires in 15 minutes.";
export const OPERATIONAL_STATE_RECOVERY_PROOF_SUCCESS = "Product Owner proof accepted only for hosted operational-state recovery. No recovery was performed by the proof. The proof expires in 15 minutes.";
export const OPERATIONAL_STATE_INITIAL_IMPORT_PROOF_SUCCESS = "Product Owner proof accepted only for the reviewed initial-import manifest. No import was performed by the proof. The proof expires in 15 minutes.";
export const PRODUCT_OWNER_PROOF_DENIAL = "Product Owner proof was not accepted. No protected action was performed.";

type ValueControl = { value: string };
export type ProductOwnerStepUpForm = {
  elements: { namedItem(name: string): unknown };
};
type ProductOwnerStepUpAction = typeof PRODUCT_OWNER_PROOF_ACTION | typeof OPERATIONAL_STATE_INITIAL_IMPORT_PROOF_ACTION | typeof OPERATIONAL_STATE_RECOVERY_PROOF_ACTION;

function valueControl(form: ProductOwnerStepUpForm, name: "emailAddress" | "password"): ValueControl | null {
  const control = form.elements.namedItem(name) as unknown;
  if (!control || typeof control !== "object" || !("value" in control)) return null;
  return typeof (control as { value?: unknown }).value === "string" ? control as ValueControl : null;
}

export async function submitProductOwnerStepUpForm<S extends ProductOwnerStepUpAction = typeof PRODUCT_OWNER_PROOF_ACTION>(
  form: ProductOwnerStepUpForm,
  currentIdentityReference: string,
  stepUp: (input: {
    emailAddress: string;
    password: string;
    currentIdentityReference: string;
    sensitiveAction: S;
    scopeBindingDigest?: string;
  }) => Promise<BrowserAuthResult>,
  clearControlledCredentials: () => void,
  sensitiveAction: S = PRODUCT_OWNER_PROOF_ACTION as S,
  scopeBindingDigest: string | null = null,
): Promise<{ result: BrowserAuthResult; publicMessage: string }> {
  const emailControl = valueControl(form, "emailAddress");
  const passwordControl = valueControl(form, "password");
  const input = {
    emailAddress: emailControl?.value.trim() ?? "",
    password: passwordControl?.value ?? "",
    currentIdentityReference,
    sensitiveAction,
    ...(scopeBindingDigest ? { scopeBindingDigest } : {}),
  };
  let pending!: Promise<BrowserAuthResult>;
  try {
    pending = stepUp(input);
  } finally {
    if (emailControl) emailControl.value = "";
    if (passwordControl) passwordControl.value = "";
    input.emailAddress = "";
    input.password = "";
    clearControlledCredentials();
  }
  const result = await pending;
  const accepted = result.receipt?.allowed === true
    && result.receipt.status === "authenticated"
    && result.receipt.stepUpEvidence?.sensitiveAction === sensitiveAction
    && result.receipt.stepUpEvidence.protectedMutationPerformed === false;
  return {
    result,
    publicMessage: accepted
      ? sensitiveAction === OPERATIONAL_STATE_RECOVERY_PROOF_ACTION
        ? OPERATIONAL_STATE_RECOVERY_PROOF_SUCCESS
        : sensitiveAction === OPERATIONAL_STATE_INITIAL_IMPORT_PROOF_ACTION
          ? OPERATIONAL_STATE_INITIAL_IMPORT_PROOF_SUCCESS
          : PRODUCT_OWNER_PROOF_SUCCESS
      : PRODUCT_OWNER_PROOF_DENIAL,
  };
}
