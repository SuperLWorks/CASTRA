import type {
  AuthEvent,
  AuthenticationCommand,
  AuthenticationPolicyVersion,
  AuthFailureCategory,
  AuthWorkflowKind,
  AuthWorkflowRecord,
  AuthWorkflowState,
  AuditEvent,
  AuditKind,
  AuthorityAssignment,
  AuthorityKind,
  CastraCommand,
  CastraState,
  CommandContext,
  IdentityReferenceVersion,
  SensitiveActionClass,
  SessionReceipt,
  StepUpReceipt,
  WelcomeAccessConfigurationVersion,
} from "./types.js";

const prohibitedSecretKeys = new Set([
  "password",
  "plaintextpassword",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "id_token",
  "idtoken",
  "otp",
  "token",
  "magiclinksecret",
  "providersecret",
  "clientsecret",
  "apikey",
  "authorization",
  "cookie",
]);

const secretValuePatterns = [
  /\bBearer\s+[A-Za-z0-9._~-]+/i,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  /\b(?:sb_secret_|sk-|xox[baprs]-)[A-Za-z0-9_-]+\b/i,
  /[?&](?:token|code|otp|secret|password)=/i,
];

export interface SecretViolation {
  path: string;
  category: "prohibited_field" | "secret_like_value";
}

export function findAuthSecretViolations(value: unknown, root = "auth"): SecretViolation[] {
  const violations: SecretViolation[] = [];
  const seen = new Set<object>();
  function visit(candidate: unknown, path: string): void {
    if (typeof candidate === "string") {
      if (secretValuePatterns.some((pattern) => pattern.test(candidate))) {
        violations.push({ path, category: "secret_like_value" });
      }
      return;
    }
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) return;
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(candidate as Record<string, unknown>)) {
      const normalized = key.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
      if (prohibitedSecretKeys.has(key.toLowerCase()) || prohibitedSecretKeys.has(normalized)) {
        violations.push({ path: `${path}.${key}`, category: "prohibited_field" });
        continue;
      }
      visit(child, `${path}.${key}`);
    }
  }
  visit(value, root);
  return violations;
}

export function assertAuthSecretFree(value: unknown): void {
  const violations = findAuthSecretViolations(value);
  if (violations.length) {
    throw new Error(`Authentication input rejected: prohibited secret material at ${violations.map((item) => item.path).join(", ")}.`);
  }
}

export const proposedWelcomeAccessConfiguration: WelcomeAccessConfigurationVersion = {
  id: "builtin:welcome-access-v1",
  familyId: "builtin:welcome-access",
  version: 1,
  supersedesId: null,
  createdAt: "2026-08-10T00:00:00.000Z",
  contractVersion: 1,
  destinations: [
    { id: "login", label: "Log in to CASTRA", availability: "contract_only" },
    { id: "public_demo", label: "Enter Public Demo", availability: "contract_only" },
    { id: "about", label: "About CASTRA", availability: "informational" },
  ],
  authenticatedTarget: "command_overview",
  currentA001DefaultRoute: "command_overview",
  publicWelcomeDefaultDeferred: true,
  acceptsCredentials: false,
};

export const proposedAuthenticationPolicy: AuthenticationPolicyVersion = {
  id: "builtin:authentication-policy-single-commander-v4",
  familyId: "builtin:authentication-policy",
  version: 4,
  supersedesId: "builtin:authentication-policy-single-commander-v3",
  createdAt: "2026-08-13T00:00:00.000Z",
  contractVersion: 1,
  deploymentModel: "single_commander_single_instance",
  enrollmentMode: "administrator_provisioned_initial_commander",
  maximumProductionIdentities: 1,
  inviteOnly: false,
  publicSignupEnabled: false,
  primaryMethod: "email_password",
  allowedMethods: ["email_password"],
  magicLinkEnabled: false,
  emailVerificationRequired: true,
  idleTimeoutSeconds: 7 * 24 * 60 * 60,
  absoluteTimeoutSeconds: 30 * 24 * 60 * 60,
  productOwnerStepUpFreshnessSeconds: 15 * 60,
  valuesStatus: "commander_accepted",
  providerState: "disabled",
  providerAdapter: "provider_neutral_server_contract",
  offlineAccess: "no_new_or_renewed_session",
  callbackRedirectAllowlist: ["https://castra.superlworks.com/api/auth/callback"],
  cookieScope: "host_only_http_only_same_site",
  browserTokenPersistence: "prohibited",
  demoIdentity: "none",
  demoSessionReuse: false,
  demoDataTransfer: false,
  networkRequired: true,
};

export const authWorkflowCatalog: ReadonlyArray<{
  workflow: AuthWorkflowKind;
  networkRequired: boolean;
  A001Capability: "record_only" | "guard_only";
}> = [
  "demo_entry", "invite", "claim", "email_verification", "password_login", "magic_link_login",
  "recovery_request", "password_reset", "auth_callback", "session_refresh", "logout",
  "revoke", "disable", "forbidden", "rate_limit", "offline", "provider_failure", "risk_event",
].map((workflow) => ({ workflow: workflow as AuthWorkflowKind, networkRequired: workflow !== "demo_entry", A001Capability: "record_only" as const }));

export function currentWelcomeAccessConfiguration(state: CastraState): WelcomeAccessConfigurationVersion {
  return state.welcomeAccessConfigurationVersions.at(-1) ?? proposedWelcomeAccessConfiguration;
}

export function currentAuthenticationPolicy(state: CastraState): AuthenticationPolicyVersion {
  return state.authenticationPolicyVersions.at(-1) ?? proposedAuthenticationPolicy;
}

export function currentIdentityVersions(state: CastraState): IdentityReferenceVersion[] {
  const latest = new Map<string, IdentityReferenceVersion>();
  for (const identity of state.identityReferenceVersions) latest.set(identity.familyId, identity);
  return [...latest.values()];
}

export function currentAuthorityAssignments(state: CastraState, identityFamilyId: string): AuthorityAssignment[] {
  const latest = new Map<AuthorityKind, AuthorityAssignment>();
  for (const assignment of state.authorityAssignments.filter((item) => item.identityFamilyId === identityFamilyId)) {
    latest.set(assignment.authority, assignment);
  }
  return [...latest.values()].filter((item) => item.status === "assigned");
}

export function currentSessionReceipts(state: CastraState): SessionReceipt[] {
  const latest = new Map<string, SessionReceipt>();
  for (const receipt of state.sessionReceipts) latest.set(receipt.sessionReference, receipt);
  return [...latest.values()];
}

function requiredText(value: string, label: string, maximum = 240): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return normalized;
}

function redactedMessage(value: string): string {
  const normalized = requiredText(value, "Public authentication message", 240);
  if (/@/.test(normalized) || /\b(account exists|no account|unknown user|email address)\b/i.test(normalized)) {
    throw new Error("Authentication messages must not reveal account existence or identity details.");
  }
  return normalized;
}

function iso(value: string, label: string): string {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO date-time.`);
  return new Date(value).toISOString();
}

function allowedCallbackReference(policy: AuthenticationPolicyVersion, reference: string): string {
  const normalized = requiredText(reference, "Callback reference", 240);
  if (/[?#]/.test(normalized)) throw new Error("Callback references must not contain query strings or fragments.");
  if (!policy.callbackRedirectAllowlist.includes(normalized)) throw new Error("Callback reference is not on the exact redirect allowlist.");
  return normalized;
}

export function isAuthenticationCommand(command: CastraCommand): command is AuthenticationCommand {
  return command.type.startsWith("auth.") || command.type.startsWith("welcome_access.");
}

function appendEvidence(
  state: CastraState,
  context: CommandContext,
  occurredAt: string,
  auditKind: AuditKind,
  entityType: AuditEvent["entityType"],
  entityId: string,
  workflow: AuthEvent["workflow"],
  status: AuthEvent["status"],
  identityFamilyId: string | null,
  failureCategory: AuthFailureCategory,
  publicMessage: string,
  evidenceReference: string,
  auditDetail: Record<string, string> = {},
): CastraState {
  const authEvent: AuthEvent = {
    id: context.id("auth_event"),
    sequence: state.nextAuthEventSequence,
    occurredAt,
    workflow,
    status,
    identityFamilyId,
    failureCategory,
    publicMessage,
    evidenceReference,
    redaction: "no_account_enumeration_no_secrets",
  };
  const audit: AuditEvent = {
    id: context.id("audit"),
    sequence: state.nextAuditSequence,
    occurredAt,
    actor: "Commander",
    origin: "direct",
    kind: auditKind,
    entityType,
    entityId,
    summary: publicMessage,
    detail: { ...auditDetail, failureCategory, redaction: authEvent.redaction },
  };
  return {
    ...state,
    nextAuthEventSequence: state.nextAuthEventSequence + 1,
    nextAuditSequence: state.nextAuditSequence + 1,
    authEvents: [...state.authEvents, authEvent],
    auditEvents: [...state.auditEvents, audit],
  };
}

function nextVersion<T extends { id: string; familyId: string; version: number }>(items: T[], supersedesId: string | undefined, label: string): { previous: T | null; familyId: string; version: number } {
  if (!supersedesId) return { previous: null, familyId: "", version: 1 };
  const previous = items.find((item) => item.id === supersedesId);
  if (!previous) throw new Error(`${label} version to supersede was not found.`);
  if (items.at(-1)?.id !== previous.id) throw new Error(`${label} can supersede only the current version.`);
  return { previous, familyId: previous.familyId, version: previous.version + 1 };
}

function appendSessionInvalidation(state: CastraState, context: CommandContext, identityFamilyId: string, reason: string, occurredAt: string): CastraState {
  let next = state;
  for (const current of currentSessionReceipts(state).filter((receipt) => receipt.identityFamilyId === identityFamilyId && receipt.status === "active")) {
    const receipt: SessionReceipt = {
      ...current,
      id: context.id("session_receipt"),
      supersedesReceiptId: current.id,
      status: "revoked",
      revokedAt: occurredAt,
      invalidationReason: reason,
      recordedAt: occurredAt,
    };
    next = { ...next, sessionReceipts: [...next.sessionReceipts, receipt] };
    next = appendEvidence(next, context, occurredAt, "auth.session_invalidated", "session_receipt", receipt.id, "session", "revoked", identityFamilyId, "disabled_or_revoked", "Authentication session invalidated.", reason, { sessionReference: receipt.sessionReference });
  }
  return next;
}

export interface ProtectedRouteAccess {
  allowed: boolean;
  reason: string;
  identity: IdentityReferenceVersion | null;
  authorities: AuthorityAssignment[];
  receipt: SessionReceipt | null;
}

export function evaluateProtectedRouteAccess(state: CastraState, sessionReference: string, at: string): ProtectedRouteAccess {
  const receipt = currentSessionReceipts(state).find((item) => item.sessionReference === sessionReference) ?? null;
  if (!receipt) return { allowed: false, reason: "No authenticated session receipt exists.", identity: null, authorities: [], receipt: null };
  const identity = currentIdentityVersions(state).find((item) => item.familyId === receipt.identityFamilyId) ?? null;
  const authorities = identity ? currentAuthorityAssignments(state, identity.familyId) : [];
  if (receipt.status !== "active") return { allowed: false, reason: `Session is ${receipt.status}.`, identity, authorities, receipt };
  const instant = Date.parse(at);
  if (Number.isNaN(instant) || instant >= Date.parse(receipt.idleExpiresAt) || instant >= Date.parse(receipt.absoluteExpiresAt) || instant >= Date.parse(receipt.expiresAt)) {
    return { allowed: false, reason: "Session is expired by idle, absolute, or receipt expiry.", identity, authorities, receipt };
  }
  if (!identity) return { allowed: false, reason: "Session identity evidence is missing.", identity, authorities, receipt };
  if (identity.verificationState !== "verified") return { allowed: false, reason: "Identity email is not verified.", identity, authorities, receipt };
  if (identity.lifecycleState !== "active") return { allowed: false, reason: `Identity is ${identity.lifecycleState}.`, identity, authorities, receipt };
  if (!authorities.some((item) => item.authority === "Commander")) return { allowed: false, reason: "Commander authority assignment is missing.", identity, authorities, receipt };
  return { allowed: true, reason: "Verified active Commander session receipt is current.", identity, authorities, receipt };
}

export function evaluateProductOwnerStepUp(state: CastraState, sessionReference: string, sensitiveActionClass: SensitiveActionClass, at: string): { allowed: boolean; reason: string; receipt: StepUpReceipt | null } {
  const access = evaluateProtectedRouteAccess(state, sessionReference, at);
  if (!access.allowed || !access.identity) return { allowed: false, reason: access.reason, receipt: null };
  if (!access.authorities.some((item) => item.authority === "Product Owner")) return { allowed: false, reason: "Product Owner authority is not assigned.", receipt: null };
  const receipt = [...state.stepUpReceipts].reverse().find((item) => item.identityFamilyId === access.identity!.familyId && item.sensitiveActionClass === sensitiveActionClass) ?? null;
  if (!receipt || receipt.outcome !== "passed") return { allowed: false, reason: "A successful Product Owner step-up receipt is missing.", receipt };
  if (Date.parse(at) > Date.parse(receipt.validUntil)) return { allowed: false, reason: "Product Owner step-up receipt is stale.", receipt };
  return { allowed: true, reason: "Separate Product Owner authority and fresh step-up are evidenced.", receipt };
}

export function assertPublicSignupDisabled(state: CastraState): never {
  const policy = currentAuthenticationPolicy(state);
  if (policy.deploymentModel === "single_commander_single_instance" && !policy.publicSignupEnabled) {
    throw new Error("Public self-service signup is disabled; this deployment has one administrator-provisioned Commander identity.");
  }
  throw new Error("Public signup is unavailable.");
}

export function assertDemoEntryIsolation(input: { productionSessionReference: string | null; productionRecordCount: number; browserPersistenceTargets: string[] }): void {
  assertAuthSecretFree(input);
  if (input.productionSessionReference) throw new Error("Public Demo cannot create or reuse a production session.");
  if (input.productionRecordCount !== 0) throw new Error("Public Demo cannot receive or transfer production records.");
  if (input.browserPersistenceTargets.length) throw new Error("Public Demo persistence is prohibited.");
}

export function applyAuthenticationCommand(state: CastraState, command: AuthenticationCommand, context: CommandContext): CastraState {
  assertAuthSecretFree(command);
  const occurredAt = context.now();

  if (command.type === "welcome_access.configuration.version.create") {
    const versioning = nextVersion(state.welcomeAccessConfigurationVersions, command.supersedesId, "Welcome/Access configuration");
    const expected = proposedWelcomeAccessConfiguration.destinations;
    if (JSON.stringify(command.destinations) !== JSON.stringify(expected)) throw new Error("Welcome/Access destinations must remain Login, Public Demo, and About in the approved order and contract state.");
    const id = context.id("welcome_access_configuration_version");
    const version: WelcomeAccessConfigurationVersion = { ...proposedWelcomeAccessConfiguration, id, familyId: versioning.previous ? versioning.familyId : id, version: versioning.version, supersedesId: versioning.previous?.id ?? null, createdAt: occurredAt };
    const next = { ...state, welcomeAccessConfigurationVersions: [...state.welcomeAccessConfigurationVersions, version] };
    return appendEvidence(next, context, occurredAt, "welcome_access.configuration_version_created", "welcome_access_configuration_version", id, "welcome", "recorded", null, "none", "Welcome and access route contract recorded.", "C001.M012.A001", { acceptsCredentials: "false", defaultRoute: version.currentA001DefaultRoute });
  }

  if (command.type === "auth.policy.version.create") {
    const versioning = nextVersion(state.authenticationPolicyVersions, command.supersedesId, "Authentication policy");
    if (command.idleTimeoutSeconds <= 0 || command.absoluteTimeoutSeconds <= command.idleTimeoutSeconds || command.productOwnerStepUpFreshnessSeconds <= 0) throw new Error("Authentication timeout proposals must be positive and absolute timeout must exceed idle timeout.");
    if (command.providerState === "live_unverified") throw new Error("A001 cannot configure or imply a live authentication provider.");
    const callbacks = [...new Set(command.callbackRedirectAllowlist.map((item) => allowedCallbackReference({ ...proposedAuthenticationPolicy, callbackRedirectAllowlist: command.callbackRedirectAllowlist }, item)))];
    const id = context.id("authentication_policy_version");
    const policy: AuthenticationPolicyVersion = { ...proposedAuthenticationPolicy, id, familyId: versioning.previous ? versioning.familyId : id, version: versioning.version, supersedesId: versioning.previous?.id ?? null, createdAt: occurredAt, idleTimeoutSeconds: command.idleTimeoutSeconds, absoluteTimeoutSeconds: command.absoluteTimeoutSeconds, productOwnerStepUpFreshnessSeconds: command.productOwnerStepUpFreshnessSeconds, valuesStatus: command.valuesStatus, callbackRedirectAllowlist: callbacks, providerState: command.providerState };
    const next = { ...state, authenticationPolicyVersions: [...state.authenticationPolicyVersions, policy] };
    return appendEvidence(next, context, occurredAt, "auth.policy_version_created", "authentication_policy_version", id, "policy", "recorded", null, "none", "Single-Commander authentication policy version recorded without provider activation.", "C001.M012.A005", { providerState: policy.providerState, deploymentModel: policy.deploymentModel, maximumProductionIdentities: "1", publicSignupEnabled: "false", magicLinkEnabled: "true", automaticIdentityCreation: "false" });
  }

  if (command.type === "auth.identity.version.record") {
    const versioning = nextVersion(state.identityReferenceVersions, command.supersedesId, "Identity reference");
    const subject = requiredText(command.providerSubjectReference, "Provider subject reference", 120);
    if (!/^identity-ref:[a-z0-9][a-z0-9._:-]*$/i.test(subject)) throw new Error("Identity references must be opaque non-secret references beginning identity-ref:.");
    const id = context.id("identity_reference_version");
    const identity: IdentityReferenceVersion = { id, familyId: versioning.previous ? versioning.familyId : id, version: versioning.version, supersedesId: versioning.previous?.id ?? null, createdAt: occurredAt, contractVersion: 1, providerSubjectReference: subject, displayReference: requiredText(command.displayReference, "Display reference", 120), lifecycleState: command.lifecycleState, verificationState: command.verificationState, evidenceReference: requiredText(command.evidenceReference, "Identity evidence reference", 180), secretMaterialStored: false };
    let next = { ...state, identityReferenceVersions: [...state.identityReferenceVersions, identity] };
    next = appendEvidence(next, context, occurredAt, "auth.identity_version_recorded", "identity_reference_version", id, "identity", "recorded", identity.familyId, "none", "Non-secret identity reference recorded.", identity.evidenceReference, { lifecycleState: identity.lifecycleState, verificationState: identity.verificationState });
    if (identity.lifecycleState === "disabled" || identity.lifecycleState === "revoked") next = appendSessionInvalidation(next, context, identity.familyId, `Identity ${identity.lifecycleState}.`, occurredAt);
    return next;
  }

  if (command.type === "auth.authority.record") {
    const identity = currentIdentityVersions(state).find((item) => item.familyId === command.identityFamilyId);
    if (!identity) throw new Error("Authority assignment requires an existing non-secret identity reference.");
    const assignment: AuthorityAssignment = { id: context.id("authority_assignment"), identityFamilyId: identity.familyId, authority: command.authority, status: command.status, evidenceReference: requiredText(command.evidenceReference, "Authority evidence reference", 180), assignedAt: occurredAt, recordedBy: command.recordedBy };
    let next = { ...state, authorityAssignments: [...state.authorityAssignments, assignment] };
    next = appendEvidence(next, context, occurredAt, assignment.status === "assigned" ? "auth.authority_assigned" : "auth.authority_revoked", "authority_assignment", assignment.id, "authority", "recorded", identity.familyId, "none", `${assignment.authority} authority ${assignment.status}.`, assignment.evidenceReference, { authority: assignment.authority, status: assignment.status, authoritiesSeparate: "true" });
    return appendSessionInvalidation(next, context, identity.familyId, "Authority assignment changed; session renewal is required.", occurredAt);
  }

  if (command.type === "auth.workflow.record") {
    const policy = currentAuthenticationPolicy(state);
    const networkRequired = command.workflow !== "demo_entry";
    const unavailableStates: AuthWorkflowState[] = ["unavailable", "failed", "forbidden", "rate_limited", "offline", "provider_failure"];
    if (networkRequired && (!command.networkAvailable || command.providerState === "disabled") && !unavailableStates.includes(command.state)) throw new Error("Network-required authentication cannot record success while offline or provider-disabled.");
    if (command.workflow === "demo_entry" && (command.identityFamilyId || !unavailableStates.includes(command.state))) throw new Error("A001 Demo entry cannot create/reuse a production identity or claim a working Demo runtime.");
    if (command.providerState === "live_unverified") throw new Error("A001 cannot record a live-provider authentication outcome.");
    const successStates: AuthWorkflowState[] = ["succeeded", "verified", "authenticated", "refreshed", "logged_out", "revoked", "disabled"];
    if (successStates.includes(command.state) && command.failureCategory !== "none") throw new Error("Successful authentication workflow records must use the none failure category.");
    if (unavailableStates.includes(command.state) && command.failureCategory === "none") throw new Error("Unavailable or failed authentication workflow records require a redacted failure category.");
    if (command.workflow === "auth_callback" && successStates.includes(command.state) && !command.callbackReference) throw new Error("Successful callback records require an exact allowlisted callback reference.");
    if (command.workflow === "auth_callback" && command.callbackReference) allowedCallbackReference(policy, command.callbackReference);
    const identity = command.identityFamilyId ? currentIdentityVersions(state).find((item) => item.familyId === command.identityFamilyId) : null;
    if (["password_login", "magic_link_login", "session_refresh"].includes(command.workflow) && command.state === "authenticated") {
      if (!identity || identity.lifecycleState !== "active" || identity.verificationState !== "verified") throw new Error("Authentication success requires a verified, active identity reference.");
    }
    const record: AuthWorkflowRecord = { id: context.id("auth_workflow_record"), contractVersion: 1, workflow: command.workflow, identityFamilyId: identity?.familyId ?? null, state: command.state, networkRequired, networkAvailable: command.networkAvailable, providerState: command.providerState, failureCategory: command.failureCategory, publicMessage: redactedMessage(command.publicMessage), callbackReference: command.callbackReference ? allowedCallbackReference(policy, command.callbackReference) : "", provenance: command.providerState === "disabled" ? "disabled_provider_contract" : "deterministic_test_only", secretMaterialStored: false, createdAt: occurredAt };
    let next = { ...state, authWorkflowRecords: [...state.authWorkflowRecords, record] };
    next = appendEvidence(next, context, occurredAt, "auth.workflow_recorded", "auth_workflow_record", record.id, record.workflow, record.state, record.identityFamilyId, record.failureCategory, record.publicMessage, record.callbackReference || "no-secret-workflow-reference", { networkAvailable: String(record.networkAvailable), providerState: record.providerState, secretMaterialStored: "false" });
    if (identity && ["password_reset", "risk_event"].includes(record.workflow) && record.state === "succeeded") next = appendSessionInvalidation(next, context, identity.familyId, `${record.workflow} requires session renewal.`, occurredAt);
    return next;
  }

  if (command.type === "auth.session.receipt.record") {
    const identity = currentIdentityVersions(state).find((item) => item.familyId === command.identityFamilyId);
    if (!identity || identity.lifecycleState !== "active" || identity.verificationState !== "verified") throw new Error("An active session receipt requires a verified, active identity reference.");
    const currentAssignments = currentAuthorityAssignments(state, identity.familyId);
    if (!command.authorityAssignmentIds.length || command.authorityAssignmentIds.some((id) => !currentAssignments.some((item) => item.id === id))) throw new Error("Session authority references must match current assignments.");
    if (command.provenance === "server_receipt_unverified") throw new Error("A001 cannot claim a live server session receipt.");
    const createdAt = iso(command.createdAt, "Session creation time");
    const lastActiveAt = iso(command.lastActiveAt, "Session last-active time");
    const idleExpiresAt = iso(command.idleExpiresAt, "Idle expiry");
    const absoluteExpiresAt = iso(command.absoluteExpiresAt, "Absolute expiry");
    const renewalDueAt = iso(command.renewalDueAt, "Renewal due time");
    const expiresAt = iso(command.expiresAt, "Receipt expiry");
    if (Date.parse(lastActiveAt) < Date.parse(createdAt) || Date.parse(idleExpiresAt) <= Date.parse(lastActiveAt) || Date.parse(absoluteExpiresAt) <= Date.parse(createdAt) || Date.parse(expiresAt) > Date.parse(absoluteExpiresAt)) throw new Error("Session receipt chronology is invalid.");
    const receipt: SessionReceipt = { id: context.id("session_receipt"), contractVersion: 1, sessionReference: requiredText(command.sessionReference, "Session reference", 120), identityFamilyId: identity.familyId, authorityAssignmentIds: [...command.authorityAssignmentIds], supersedesReceiptId: null, createdAt, lastActiveAt, idleExpiresAt, absoluteExpiresAt, renewalDueAt, expiresAt, revokedAt: null, status: command.status, deviceReference: requiredText(command.deviceReference, "Device/session reference", 120), provenance: command.provenance, invalidationReason: "", secretMaterialStored: false, recordedAt: occurredAt };
    if (state.sessionReceipts.some((item) => item.sessionReference === receipt.sessionReference)) throw new Error("Session reference already exists; use renewal or invalidation receipts.");
    const next = { ...state, sessionReceipts: [...state.sessionReceipts, receipt] };
    return appendEvidence(next, context, occurredAt, "auth.session_receipt_recorded", "session_receipt", receipt.id, "session", receipt.status, identity.familyId, "none", "Non-secret session receipt metadata recorded.", receipt.provenance, { sessionReference: receipt.sessionReference, secretMaterialStored: "false" });
  }

  if (command.type === "auth.session.touch") {
    const current = currentSessionReceipts(state).find((item) => item.sessionReference === command.sessionReference);
    if (!current || current.status !== "active") throw new Error("Only a current active session receipt can be renewed.");
    const absolute = Date.parse(current.absoluteExpiresAt);
    const lastActiveAt = iso(command.lastActiveAt, "Last-active time");
    const idleExpiresAt = iso(command.idleExpiresAt, "Idle expiry");
    const renewalDueAt = iso(command.renewalDueAt, "Renewal due time");
    const expiresAt = iso(command.expiresAt, "Receipt expiry");
    if (Date.parse(lastActiveAt) <= Date.parse(current.lastActiveAt) || Date.parse(idleExpiresAt) > absolute || Date.parse(expiresAt) > absolute) throw new Error("Session renewal cannot exceed absolute expiry or move backward.");
    const receipt: SessionReceipt = { ...current, id: context.id("session_receipt"), supersedesReceiptId: current.id, lastActiveAt, idleExpiresAt, renewalDueAt, expiresAt, recordedAt: occurredAt };
    const next = { ...state, sessionReceipts: [...state.sessionReceipts, receipt] };
    return appendEvidence(next, context, occurredAt, "auth.session_renewed", "session_receipt", receipt.id, "session", "active", receipt.identityFamilyId, "none", "Session metadata renewed within its absolute boundary.", receipt.provenance, { sessionReference: receipt.sessionReference });
  }

  if (command.type === "auth.session.invalidate") {
    const current = currentSessionReceipts(state).find((item) => item.sessionReference === command.sessionReference);
    if (!current) throw new Error("Session receipt was not found.");
    if (current.status !== "active") throw new Error("Session is already terminal.");
    return appendSessionInvalidation(state, context, current.identityFamilyId, requiredText(command.reason, "Invalidation reason", 180), occurredAt);
  }

  const identity = currentIdentityVersions(state).find((item) => item.familyId === command.identityFamilyId);
  if (!identity) throw new Error("Step-up receipt requires an existing identity reference.");
  if (!currentAuthorityAssignments(state, identity.familyId).some((item) => item.authority === "Product Owner")) throw new Error("Step-up requires a separate Product Owner authority assignment.");
  if (command.provenance === "server_receipt_unverified") throw new Error("A001 cannot claim a live server step-up receipt.");
  const verifiedAt = iso(command.verifiedAt, "Step-up verification time");
  const validUntil = iso(command.validUntil, "Step-up valid-until time");
  const policy = currentAuthenticationPolicy(state);
  if (Date.parse(validUntil) <= Date.parse(verifiedAt) || Date.parse(validUntil) - Date.parse(verifiedAt) > policy.productOwnerStepUpFreshnessSeconds * 1000) throw new Error("Step-up validity must be positive and no longer than the policy freshness window.");
  const receipt: StepUpReceipt = { id: context.id("step_up_receipt"), contractVersion: 1, identityFamilyId: identity.familyId, authority: "Product Owner", sensitiveActionClass: command.sensitiveActionClass, outcome: command.outcome, verifiedAt, validUntil, evidenceReference: requiredText(command.evidenceReference, "Step-up evidence reference", 180), provenance: command.provenance, secretMaterialStored: false, recordedAt: occurredAt };
  const next = { ...state, stepUpReceipts: [...state.stepUpReceipts, receipt] };
  return appendEvidence(next, context, occurredAt, "auth.step_up_recorded", "step_up_receipt", receipt.id, "step_up", receipt.outcome === "passed" ? "succeeded" : receipt.outcome === "failed" ? "failed" : "unavailable", identity.familyId, receipt.outcome === "passed" ? "none" : "forbidden", "Product Owner step-up receipt recorded without credential material.", receipt.evidenceReference, { actionClass: receipt.sensitiveActionClass, outcome: receipt.outcome });
}
