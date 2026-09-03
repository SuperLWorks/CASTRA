/**
 * The single canonical CASTRA Commander origin.
 *
 * This is the one address the browser is ever allowed to name. It is pinned
 * byte-for-byte to `productionOrigin` in
 * `server/authentication/liveConfiguration.ts` by an executable contract in
 * `liveAuthClient.test.ts`, not by convention — this literal is what a locked-out
 * Commander is told to type, so it must not be able to drift from the boundary
 * silently. The browser never re-derives it from `location`, so a stale
 * deployment alias cannot present itself as the canonical address.
 *
 * It is deliberately NOT an allowlist. The authentication boundary owns which
 * origin is currently active (production or a Preview deployment) and reports a
 * mismatch as `origin_rejected`. Duplicating an origin allowlist in the browser
 * would diverge from that boundary and silently break Preview and local
 * development, so the client classifies and guides only.
 */
export const CANONICAL_COMMANDER_ORIGIN = "https://castra.superlworks.com" as const;

export type BrowserAuthAvailability =
  | "checking"
  | "configured"
  | "disabled"
  | "unavailable"
  | "wrong_origin";

export interface BrowserAuthReceipt {
  allowed: boolean;
  status: "authenticated" | "accepted" | "signed_out" | "denied" | "unavailable";
  message: string;
  identityReference: string | null;
  authorities: Array<"Commander" | "Product Owner">;
  requiresEmailVerification: boolean;
  requiresProductOwnerStepUp: boolean;
  recoveryPasswordChangeReady: boolean;
  providerTokensReturnedToBrowser: false;
  passwordRetained: false;
  responseCachePolicy: "private_no_store";
  stepUpEvidence?: {
    sensitiveAction: "foundation_manifest_change" | "operational_state_initial_import" | "operational_state_recovery";
    scopeBindingDigest?: string | null;
    verifiedAt: string;
    validUntil: string;
    policy: "fifteen_minute_action_bound";
    protectedMutationPerformed: false;
    credentialRetained: false;
  } | null;
  evidence: {
    requestReference: string;
    operation: string;
    outcome: "allowed" | "denied" | "unavailable";
    failureCategory: string;
    providerReceiptReference: string;
    providerFailureClassification: {
      contractVersion: "castra-live-auth-provider-failure/1.0.0";
      causeClass: "none" | "provider_http_response" | "provider_transport_exception";
      statusClass: "none" | "4xx" | "5xx";
      providerContentReturned: false;
    };
    configurationVersion: string;
    secretMaterialStored: false;
    aerariumRecordCreated: false;
  };
}

export interface BrowserAuthResult {
  availability: BrowserAuthAvailability;
  receipt: BrowserAuthReceipt | null;
  publicMessage: string;
}

export type CommanderSessionProofState =
  | "authenticated_commander"
  | "not_authenticated"
  | "boundary_unavailable";

export interface CommanderSessionProof {
  state: CommanderSessionProofState;
  authenticatedCommander: boolean;
  publicMessage: string;
}

/**
 * Classifies a freshly resolved session for the one question a hosted mutation
 * must answer immediately before it dispatches: is this still an authenticated
 * Commander?
 *
 * The three states are deliberately distinct. `not_authenticated` is a
 * well-formed server verdict — the session is genuinely not writable, so the UI
 * must stop claiming one. `boundary_unavailable` is the absence of a verdict;
 * it stops the command just as firmly but must never be presented as a lost
 * session, because that would be a false statement about the Commander's
 * access. No identity reference, receipt evidence, or credential is carried
 * into the message.
 */
export function commanderSessionProof(result: BrowserAuthResult): CommanderSessionProof {
  const receipt = result.receipt;
  if (result.availability !== "configured" || receipt === null) {
    return { state: "boundary_unavailable", authenticatedCommander: false, publicMessage: result.publicMessage };
  }
  if (receipt.allowed && receipt.status === "authenticated" && receipt.authorities.includes("Commander")) {
    return { state: "authenticated_commander", authenticatedCommander: true, publicMessage: receipt.message };
  }
  return {
    state: "not_authenticated",
    authenticatedCommander: false,
    publicMessage: "This CASTRA session is no longer an authenticated Commander session.",
  };
}

export interface BrowserAuthTransport {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  cookie(): string;
  requestReference(): string;
  origin?(): string;
}

const defaultTransport: BrowserAuthTransport = {
  fetch: (input, init) => globalThis.fetch(input, init),
  cookie: () => globalThis.document?.cookie ?? "",
  requestReference: () => `auth-request:browser:${globalThis.crypto.randomUUID()}`,
  origin: () => globalThis.location?.origin ?? "",
};

/**
 * The origin this browser is actually served from, or `null` when no origin is
 * observable. `null` is never treated as canonical: an unobservable origin
 * grants nothing.
 */
function transportOrigin(transport: BrowserAuthTransport): string | null {
  const observed = transport.origin?.();
  return typeof observed === "string" && observed.length > 0 ? observed : null;
}

/**
 * Origins this client has seen the authentication boundary reject.
 *
 * The verdict is always the server's, never a local guess. While an origin is
 * held rejected, every credential-bearing operation fails closed without
 * leaving the browser; only the credential-free session probe may still be
 * sent, so the Commander always has a way to re-ask.
 *
 * The verdict is reversible in both directions, because the alternative is a
 * lie. A one-off rejection during a deployment/promotion window would otherwise
 * latch the canonical origin forever and tell the Commander to open an address
 * they are already on. Only an explicit, well-formed server receipt moves this
 * guard: a transport failure, a non-JSON response, or an unparseable body
 * leaves the last known verdict untouched, so an unavailable boundary can never
 * clear a known-bad origin.
 */
interface OriginGuard {
  rejected: Set<string>;
}

const CREDENTIAL_FREE_PROBE_ROUTE = "session";

function originRejected(guard: OriginGuard, origin: string | null): boolean {
  return origin !== null && guard.rejected.has(origin);
}

function recordOriginVerdict(guard: OriginGuard, origin: string | null, rejected: boolean): void {
  if (origin === null) return;
  if (rejected) guard.rejected.add(origin);
  else guard.rejected.delete(origin);
}

function scrubSensitiveBody(body: Record<string, unknown> | null): void {
  if (!body) return;
  for (const key of ["password", "newPassword", "verificationCode"]) {
    body[key] = undefined;
    delete body[key];
  }
}

function readableCookie(name: string, cookieHeader: string): string | null {
  for (const entry of cookieHeader.split(";")) {
    const [key, ...value] = entry.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function isReceipt(value: unknown): value is BrowserAuthReceipt {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BrowserAuthReceipt>;
  const evidence = candidate.evidence as Partial<BrowserAuthReceipt["evidence"]> | null | undefined;
  const classification = evidence?.providerFailureClassification as Partial<BrowserAuthReceipt["evidence"]["providerFailureClassification"]> | null | undefined;
  const stepUp = candidate.stepUpEvidence as Partial<NonNullable<BrowserAuthReceipt["stepUpEvidence"]>> | null | undefined;
  const validStepUp = stepUp === undefined || stepUp === null || (
    ["foundation_manifest_change", "operational_state_initial_import", "operational_state_recovery"].includes(stepUp.sensitiveAction ?? "")
    && typeof stepUp.verifiedAt === "string"
    && typeof stepUp.validUntil === "string"
    && (stepUp.sensitiveAction === "operational_state_initial_import"
      ? typeof stepUp.scopeBindingDigest === "string" && /^sha256:[a-f0-9]{64}$/.test(stepUp.scopeBindingDigest)
      : stepUp.scopeBindingDigest === null || stepUp.scopeBindingDigest === undefined)
    && stepUp.policy === "fifteen_minute_action_bound"
    && stepUp.protectedMutationPerformed === false
    && stepUp.credentialRetained === false
  );
  return typeof candidate.allowed === "boolean"
    && typeof candidate.status === "string"
    && typeof candidate.message === "string"
    && candidate.providerTokensReturnedToBrowser === false
    && candidate.passwordRetained === false
    && candidate.responseCachePolicy === "private_no_store"
    && typeof candidate.recoveryPasswordChangeReady === "boolean"
    && Array.isArray(candidate.authorities)
    && evidence !== undefined
    && evidence !== null
    && typeof evidence.requestReference === "string"
    && typeof evidence.operation === "string"
    && typeof evidence.outcome === "string"
    && typeof evidence.failureCategory === "string"
    && typeof evidence.providerReceiptReference === "string"
    && classification !== undefined
    && classification !== null
    && classification.contractVersion === "castra-live-auth-provider-failure/1.0.0"
    && ["none", "provider_http_response", "provider_transport_exception"].includes(classification.causeClass ?? "")
    && ["none", "4xx", "5xx"].includes(classification.statusClass ?? "")
    && classification.providerContentReturned === false
    && typeof evidence.configurationVersion === "string"
    && evidence.secretMaterialStored === false
    && evidence.aerariumRecordCreated === false
    && validStepUp;
}

function unavailable(publicMessage: string, availability: BrowserAuthAvailability = "unavailable"): BrowserAuthResult {
  return { availability, receipt: null, publicMessage };
}

function wrongOrigin(): BrowserAuthResult {
  return unavailable(
    `This address is not the CASTRA Commander origin. No credential was sent. Open ${CANONICAL_COMMANDER_ORIGIN} to sign in or recover access.`,
    "wrong_origin",
  );
}

async function request(
  route: string,
  method: "GET" | "POST",
  body: Record<string, unknown> | null,
  transport: BrowserAuthTransport,
  guard: OriginGuard,
): Promise<BrowserAuthResult> {
  const origin = transportOrigin(transport);
  // Fail closed on an origin the boundary already rejected. The credential-free
  // session probe stays available so the Commander can re-check and recover.
  if (route !== CREDENTIAL_FREE_PROBE_ROUTE && originRejected(guard, origin)) {
    scrubSensitiveBody(body);
    return wrongOrigin();
  }
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-CASTRA-Request-Reference": transport.requestReference(),
  };
  let serializedBody: string | undefined;
  if (method === "POST") {
    const csrf = readableCookie("__Host-castra_csrf", transport.cookie());
    if (!csrf) return unavailable("The secure authentication boundary is not ready. Refresh once before retrying.", "disabled");
    headers["Content-Type"] = "application/json";
    headers["X-CASTRA-CSRF"] = csrf;
    serializedBody = JSON.stringify(body ?? {});
  }
  try {
    const response = await transport.fetch(`/api/auth/${route}`, {
      method,
      headers,
      body: serializedBody,
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return unavailable("Live authentication is not configured on this CASTRA origin.", "disabled");
    }
    const value: unknown = await response.json();
    if (!isReceipt(value)) return unavailable("The authentication boundary returned an invalid response.");
    const originWasRejected = value.evidence.failureCategory === "origin_rejected";
    recordOriginVerdict(guard, origin, originWasRejected);
    if (originWasRejected) return { ...wrongOrigin(), receipt: value };
    const availability: BrowserAuthAvailability = value.evidence.failureCategory === "not_configured"
      ? "disabled"
      : response.status === 503
        ? "unavailable"
        : "configured";
    return { availability, receipt: value, publicMessage: value.message };
  } catch {
    return unavailable("The authentication boundary is unavailable. No access was granted.");
  } finally {
    scrubSensitiveBody(body);
    serializedBody = undefined;
    body = null;
  }
}

export class LiveBrowserAuthenticationClient {
  private readonly guard: OriginGuard = { rejected: new Set<string>() };

  constructor(private readonly transport: BrowserAuthTransport = defaultTransport) {}

  resolveSession(): Promise<BrowserAuthResult> {
    return request("session", "GET", null, this.transport, this.guard);
  }

  login(emailAddress: string, password: string): Promise<BrowserAuthResult> {
    return request("login", "POST", { emailAddress, password }, this.transport, this.guard);
  }

  logoutCurrent(): Promise<BrowserAuthResult> {
    return request("logout", "POST", {}, this.transport, this.guard);
  }

  revokeAll(): Promise<BrowserAuthResult> {
    return request("revoke", "POST", {}, this.transport, this.guard);
  }

  /**
   * The recovery callback must match the boundary's own `recoveryRedirectUri`,
   * which is derived from the currently active origin and is a Preview origin in
   * a Preview deployment. Deriving it from the served origin keeps production and
   * Preview recovery truthful; the canonical origin is used only when no origin
   * is observable. A stale alias never reaches this check, because the boundary
   * rejects its origin before the request body is read.
   */
  requestRecovery(emailAddress: string): Promise<BrowserAuthResult> {
    const origin = transportOrigin(this.transport) ?? CANONICAL_COMMANDER_ORIGIN;
    return request("recovery", "POST", {
      emailAddress,
      redirectUri: `${origin}/api/auth/callback`,
    }, this.transport, this.guard);
  }

  changePassword(newPassword: string): Promise<BrowserAuthResult> {
    return request("password-change", "POST", { newPassword }, this.transport, this.guard);
  }

  stepUp(input: {
    emailAddress: string;
    password: string;
    currentIdentityReference: string;
    sensitiveAction: "foundation_manifest_change" | "authentication_policy_change" | "authority_change" | "production_template_activation" | "operational_state_initial_import" | "operational_state_recovery";
    scopeBindingDigest?: string;
  }): Promise<BrowserAuthResult> {
    return request("step-up", "POST", input, this.transport, this.guard);
  }
}
