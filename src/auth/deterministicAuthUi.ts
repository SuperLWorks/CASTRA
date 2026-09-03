export const AUTH_UI04_REVISION = "C001.M012.A005.auth-ui04.r2" as const;
export const AUTH_UI04_FIXED_AT = "2026-08-11T04:30:00.000Z" as const;

export type AuthUiStateClass = "normal" | "loading" | "success" | "blocked_expired" | "error_empty";
export type AuthUiGroup =
  | "invitation"
  | "initial_access"
  | "login"
  | "magic_link"
  | "recovery"
  | "session"
  | "identity_risk"
  | "product_owner_step_up"
  | "availability"
  | "route_access"
  | "public_demo";

export interface AuthUi04Scenario {
  id: string;
  group: AuthUiGroup;
  screen: string;
  stateClass: AuthUiStateClass;
  heading: string;
  statusLabel: string;
  summary: string;
  inspectionFocus: string;
  intentionalGap: string;
  requestedReview: string;
}

const scenario = (
  id: string,
  group: AuthUiGroup,
  screen: string,
  stateClass: AuthUiStateClass,
  heading: string,
  statusLabel: string,
  summary: string,
  inspectionFocus: string,
  requestedReview: string,
): AuthUi04Scenario => ({
  id,
  group,
  screen,
  stateClass,
  heading,
  statusLabel,
  summary,
  inspectionFocus,
  intentionalGap: group === "invitation" || group === "magic_link"
    ? `Deterministic UI evidence only; this historical/deferred ${group === "magic_link" ? "magic-link" : "A002 invitation"} state is retained for traceability. The operation is off in the approved password-first single-Commander flow. No provider, email, credential, cookie, or production session exists.`
    : "Deterministic UI evidence only; no provider, email, credential, cookie, or production session exists.",
  requestedReview,
});

export const AUTH_UI04_SCENARIOS: readonly AuthUi04Scenario[] = [
  scenario("invite-valid", "invitation", "Historical invitation claim", "normal", "Historical invitation state", "Deferred compatibility state", "A synthetic historical invite reference is retained only for A002 regression; the active single-Commander flow has no invitation operation.", "Clear deferred-state label, expiry, verification history, and no active action.", "Is this retained state unmistakably historical and non-operational?"),
  scenario("invite-expired", "invitation", "Invitation claim", "blocked_expired", "This invitation has expired", "Expired", "The invite can no longer create an initial access workflow.", "Blocked state, recovery language, and absence of account-enumerating detail.", "Does the expired state give a safe, useful next step?"),
  scenario("invite-rescinded", "invitation", "Invitation claim", "blocked_expired", "This invitation is no longer active", "Rescinded", "The invitation was withdrawn and cannot be used.", "Neutral wording that does not reveal an account or administrative reason.", "Is the rescinded outcome distinct from an expired invite?"),
  scenario("invite-replayed", "invitation", "Invitation claim", "blocked_expired", "This invitation cannot be reused", "Already used", "A previously completed claim is rejected without creating another identity or session.", "Replay rejection and no implied second account.", "Is replay protection visible without leaking prior-session detail?"),

  scenario("setup-initial", "initial_access", "Initial access setup", "normal", "Set up the initial Commander", "Email + password primary", "The screen represents administrator-provisioned setup for the one Commander identity without storing or submitting any value in this local proof.", "Password-manager-friendly field semantics, verification requirement, single-identity boundary, and no public signup.", "Is initial setup clearly separate from ordinary login?"),
  scenario("setup-verification-required", "initial_access", "Email verification", "blocked_expired", "Verify your email before entering CASTRA", "Verification required", "Initial setup is complete in the scenario, but protected access remains blocked.", "Verification gate and safe resend/recovery explanation.", "Is the verification requirement prominent enough?"),
  scenario("setup-verification-success", "initial_access", "Email verification", "success", "Email verification recorded", "Ready for deterministic login", "The deterministic gallery represents a verified identity reference; it does not create a live identity.", "Success confirmation and route to login rather than silent entry.", "Is the transition from verification to login clear?"),

  scenario("login-idle", "login", "Password login", "normal", "Log in to CASTRA", "Ready", "Email and password are accepted transiently by the server for the one administrator-provisioned Commander; automatic identity creation remains disabled.", "Field labels, generic anti-oracle response, recovery choice, provider-disabled disclosure, and no signup or invitation affordance.", "Is the primary login screen calm and unambiguous?"),
  scenario("login-validation", "login", "Password login", "error_empty", "Check the highlighted fields", "Validation needed", "The form requires a valid email format and non-empty password without logging entered values.", "Inline errors, focus placement, and summary status.", "Can a keyboard user identify and correct the problem?"),
  scenario("login-loading", "login", "Password login", "loading", "Checking access", "In progress", "One deterministic pending state demonstrates disabled repeat submission and an announced status.", "Loading feedback, focus stability, and duplicate prevention.", "Is progress clear without suggesting a live provider call?"),
  scenario("login-success", "login", "Password login", "success", "Verified deterministic test access", "Test session ready", "A fixed, non-live verified Commander test session can route to Command Overview.", "Explicit test-provider label, authority evidence, and separation from production auth.", "Is deterministic success unmistakably non-live?"),
  scenario("login-incorrect-unknown", "login", "Password login", "error_empty", "Unable to log in", "Access not confirmed", "Incorrect and unknown identities share the same neutral public response.", "No account enumeration and a usable recovery path.", "Does the message avoid confirming whether an account exists?"),
  scenario("login-disabled", "login", "Password login", "blocked_expired", "Access is unavailable", "Identity disabled", "A disabled identity cannot create or refresh a protected session.", "Fail-closed behavior and non-sensitive support guidance.", "Is disabled access clearly blocked without disclosing internal detail?"),
  scenario("login-unverified", "login", "Password login", "blocked_expired", "Email verification is required", "Unverified", "Credentials would not bypass the required verification gate.", "Verification next step and no protected-route access.", "Is the unverified state distinct from incorrect credentials?"),

  scenario("magic-request", "magic_link", "Historical restricted magic-link request", "normal", "Retired Commander sign-in link", "Historical only", "The former fixed server path is preserved only as immutable review history; the live primary route is unavailable.", "Historical label, fail-closed route, and no provider-token exposure.", "Is the retired one-Commander request boundary unmistakably historical?"),
  scenario("magic-sent", "magic_link", "Magic-link request", "success", "If access is eligible, a link can be sent", "Request recorded", "The same response is shown whether or not an eligible account exists.", "Anti-enumeration copy and return-to-login path.", "Is the sent state appropriately neutral?"),
  scenario("magic-valid", "magic_link", "Magic-link callback", "success", "Sign-in link accepted", "Callback valid", "A valid future server callback could create a metadata-only session receipt.", "Callback allowlist, one-use behavior, and deterministic-only disclosure.", "Is a valid callback distinguishable from production proof?"),
  scenario("magic-expired", "magic_link", "Magic-link callback", "blocked_expired", "This sign-in link has expired", "Expired", "The callback is rejected and no session is created.", "Safe request-again path and no token display.", "Is expiry clear and recoverable?"),
  scenario("magic-used", "magic_link", "Magic-link callback", "blocked_expired", "This sign-in link cannot be reused", "Already used", "The one-use callback is rejected without refreshing or duplicating a session.", "Replay protection and absence of raw callback material.", "Is reuse rejection clear?"),
  scenario("magic-scanned-replayed", "magic_link", "Magic-link callback", "blocked_expired", "This link needs a new request", "Scanned or replayed", "A scanner-consumed or replayed link fails closed.", "Actionable recovery without claiming why the link was consumed.", "Does the wording avoid an unsafe automatic retry?"),
  scenario("magic-wrong-callback", "magic_link", "Magic-link callback", "error_empty", "The callback address is not allowed", "Callback blocked", "A callback outside the exact allowlist is rejected before session creation.", "Origin/callback boundary and no redirect continuation.", "Is the wrong-callback block understandable?"),

  scenario("recovery-request", "recovery", "Password recovery", "normal", "Recover access", "Ready", "A neutral request screen explains that recovery requires network and a configured provider.", "Anti-enumeration wording and return-to-login navigation.", "Is recovery discoverable without inviting public signup?"),
  scenario("recovery-sent", "recovery", "Password recovery", "success", "Check for recovery instructions", "Request recorded", "The response does not reveal whether the identity exists.", "Neutral response and expected expiry/use boundaries.", "Is the sent state privacy-preserving?"),
  scenario("reset-valid", "recovery", "Password reset", "normal", "Choose renewed access", "Reset eligible", "A valid future reset would accept a new password only at the server boundary.", "Session renewal warning and no browser persistence claim.", "Is renewal impact explained before completion?"),
  scenario("reset-expired-used", "recovery", "Password reset", "blocked_expired", "This reset link is no longer valid", "Expired or used", "The reset is rejected without changing credentials or sessions.", "Request-again route and neutral failure wording.", "Is the failed reset safely recoverable?"),
  scenario("reset-success-renewal", "recovery", "Password reset", "success", "Access reset; prior sessions require renewal", "Reset represented", "The deterministic result represents invalidation of earlier session receipts and a new-login requirement.", "Clear session invalidation and no automatic login.", "Does success explain the security impact?"),

  scenario("session-created", "session", "Session lifecycle", "success", "Session receipt created", "Active test receipt", "Metadata-only identity, authority, device, expiry, and provenance references are represented.", "No token/cookie display and visible test-adapter provenance.", "Is session evidence useful without exposing secret material?"),
  scenario("session-refresh", "session", "Session lifecycle", "loading", "Refreshing eligible session", "Renewal pending", "A future online server refresh is represented without extending an expired absolute lifetime.", "Network-required disclosure and duplicate prevention.", "Is refresh behavior distinct from a new login?"),
  scenario("session-idle-expired", "session", "Session lifecycle", "blocked_expired", "Session ended after inactivity", "Idle expiry", "Protected access is removed when the proposed idle window is exceeded.", "Reason, login route, and no offline invention.", "Is idle expiry clearly explained?"),
  scenario("session-absolute-expired", "session", "Session lifecycle", "blocked_expired", "Session reached its maximum lifetime", "Absolute expiry", "Refresh cannot extend the session beyond the proposed absolute limit.", "Fresh-login requirement and distinct absolute boundary.", "Is absolute expiry distinct from idle expiry?"),
  scenario("session-renewed", "session", "Session lifecycle", "success", "Session renewed", "New receipt version", "A new metadata receipt supersedes prior current evidence while preserving history.", "Receipt lineage and configurable test-value disclosure.", "Is renewal provenance discoverable?"),
  scenario("session-logout-current", "session", "Session lifecycle", "success", "Current session logged out", "Local test access ended", "The current deterministic test-auth state returns to Welcome.", "Clear completion, focus return, and no effect on other represented sessions.", "Is current-session logout predictable?"),
  scenario("session-revoke-all", "session", "Session lifecycle", "blocked_expired", "All sessions revoked", "Reauthentication required", "Every current receipt for the identity is made ineligible for protected routes.", "Scope warning and fresh-login route.", "Is revoke-all impact sufficiently explicit?"),

  scenario("identity-disabled-revoked", "identity_risk", "Identity lifecycle", "blocked_expired", "Identity access has been revoked", "Disabled or revoked", "Protected access, refresh, and step-up all fail closed.", "Authority versus identity status and safe support wording.", "Is the identity lifecycle block clear?"),
  scenario("permission-changed", "identity_risk", "Authority change", "blocked_expired", "Permissions changed; sign in again", "Session renewal required", "Authority reassignment invalidates existing authorization evidence.", "Separate Commander/Product Owner assignments and stale-session handling.", "Does the UI avoid treating identity and authority as the same record?"),
  scenario("new-device-reauth", "identity_risk", "Risk reauthentication", "blocked_expired", "Confirm access on this device", "Reauthentication required", "A new-device or risk event requires fresh authentication before protected access.", "Device-neutral language and no fingerprint/secret exposure.", "Is the risk response clear without revealing detection internals?"),

  scenario("stepup-required", "product_owner_step_up", "Product Owner step-up", "blocked_expired", "Fresh Product Owner confirmation required", "Step-up needed", "A Commander session alone cannot authorize a foundational action.", "Separate authority assignment, sensitive action binding, and freshness window.", "Is authority separation obvious even when one person holds both roles?"),
  scenario("stepup-success", "product_owner_step_up", "Product Owner step-up", "success", "Product Owner step-up represented", "Fresh test receipt", "A fixed non-live receipt is bound to one sensitive action class for the proposed freshness window.", "Action binding, expiry, test provenance, and no blanket elevation.", "Is the successful step-up narrow enough?"),
  scenario("stepup-failure", "product_owner_step_up", "Product Owner step-up", "error_empty", "Product Owner confirmation was not established", "Step-up failed", "The sensitive action remains blocked and the existing Commander session is not upgraded.", "Neutral failure, focus, and no account enumeration.", "Is failure safely contained?"),
  scenario("stepup-expired", "product_owner_step_up", "Product Owner step-up", "blocked_expired", "Product Owner confirmation is stale", "Step-up expired", "The proposed 15-minute test freshness has elapsed for this scenario.", "Freshness boundary and exact-action rebinding.", "Is it clear that another fresh step-up is required?"),

  scenario("rate-limited", "availability", "Abuse protection", "blocked_expired", "Try again later", "Rate limited", "A future provider/server rate limit returns a bounded public state without repeated automatic calls.", "Retry guidance, no account detail, and no fabricated timer.", "Is the rate-limit response calm and actionable?"),
  scenario("captcha-required", "availability", "Abuse protection", "blocked_expired", "Additional verification may be required", "CAPTCHA proposed", "An optional future challenge is represented as provider-dependent and not implemented.", "Explicit unverified boundary and accessible alternative requirement.", "Is the optional challenge honestly described?"),
  scenario("offline", "availability", "Availability", "error_empty", "Production identity actions need a network connection", "Offline", "No new, renewed, or invented production session is created offline.", "Fail-closed behavior and separation from ordinary local record work.", "Is the offline boundary clear without implying all CASTRA work is blocked?"),
  scenario("provider-unavailable", "availability", "Availability", "error_empty", "Authentication provider is unavailable", "Provider disabled", "The current repository has no configured live authentication adapter.", "Truthful unavailable state and no simulated production success.", "Is the disabled provider status unmistakable?"),

  scenario("route-redirect", "route_access", "Protected route", "blocked_expired", "Log in to continue", "Unauthenticated redirect", "A protected destination returns to Welcome and retains only a non-sensitive destination label.", "Focus transfer, safe route intent, and no hidden session.", "Is protected-route handling predictable?"),
  scenario("route-authenticated", "route_access", "Protected route", "success", "Command Overview is available", "Deterministic test access", "A verified active deterministic Commander test session reaches Command Overview.", "Visible non-live session label and exact authority boundary.", "Is authenticated test success clearly distinguished from production access?"),
  scenario("route-forbidden", "route_access", "Protected route", "blocked_expired", "This authority cannot open the requested area", "Forbidden", "An authenticated identity without the required assignment remains blocked.", "Authentication-versus-authorization distinction and no sensitive reason.", "Is forbidden authorization distinct from unauthenticated access?"),

  scenario("demo-entry", "public_demo", "Public Demo", "success", "Public Demo entered", "Memory-only demonstration", "No production identity, session, cookie, record, provider, or persistence target is created.", "Persistent demo banner and zero-transfer boundary.", "Is Public Demo unmistakably separate from authenticated CASTRA?"),
  scenario("demo-exit", "public_demo", "Public Demo", "normal", "Return to Welcome", "Demo state discarded", "Leaving Demo discards its in-memory scenario state and creates no production access.", "No transfer-to-login affordance and explicit data loss.", "Is exit behavior honest and expected?"),
  scenario("demo-empty", "public_demo", "Public Demo", "error_empty", "No saved Demo work", "Empty by design", "Public Demo has no saved state or account-linked history.", "Empty state is reviewed separately from populated demo evidence.", "Is the non-persistent empty state clear?"),
] as const;

export const AUTH_UI04_MANIFEST = {
  contract: "castra.auth-ui04.fixture-manifest",
  contractVersion: 1,
  fixtureRevision: AUTH_UI04_REVISION,
  fixedAt: AUTH_UI04_FIXED_AT,
  authority: "demonstration_only",
  persistence: "memory_only",
  authoritativeWrites: false,
  externalActions: false,
  activeProductionModel: "single_commander_restricted_email_link_with_password_step_up",
  historicalDeferredGroups: ["invitation"] as const,
  stateClasses: ["normal", "loading", "success", "blocked_expired", "error_empty"] as const,
  scenarios: AUTH_UI04_SCENARIOS,
} as const;

export type AuthUiScreen = "welcome" | "about" | "login" | "gallery" | "scenario" | "demo";
export type AuthExperienceMode = "unauthenticated" | "authenticated_test" | "authenticated_live" | "demo";

export interface AuthExperienceState {
  contractVersion: 1;
  revision: typeof AUTH_UI04_REVISION;
  mode: AuthExperienceMode;
  screen: AuthUiScreen;
  scenarioId: string | null;
  requestedProtectedView: string | null;
  statusMessage: string;
}

export type AuthExperienceEvent =
  | { type: "open_welcome" }
  | { type: "open_about" }
  | { type: "open_login" }
  | { type: "open_gallery" }
  | { type: "inspect_scenario"; scenarioId: string }
  | { type: "authenticate_test" }
  | { type: "authenticate_live" }
  | { type: "live_session_lost"; message: string }
  | { type: "logout" }
  | { type: "enter_demo" }
  | { type: "exit_demo" }
  | { type: "protected_route_requested"; view: string }
  | { type: "permission_forbidden"; view: string };

export function initialAuthExperienceState(): AuthExperienceState {
  return {
    contractVersion: 1,
    revision: AUTH_UI04_REVISION,
    mode: "unauthenticated",
    screen: "welcome",
    scenarioId: null,
    requestedProtectedView: null,
    statusMessage: "Welcome to CASTRA. No authenticated session is present.",
  };
}

export function findAuthUiScenario(id: string | null): AuthUi04Scenario | null {
  return id ? AUTH_UI04_SCENARIOS.find((item) => item.id === id) ?? null : null;
}

export function usesPreAuthenticationShell(state: AuthExperienceState, ui03ReviewActive = false): boolean {
  return !ui03ReviewActive && state.mode !== "authenticated_test" && state.mode !== "authenticated_live";
}

export function transitionAuthExperience(state: AuthExperienceState, event: AuthExperienceEvent): AuthExperienceState {
  switch (event.type) {
    case "open_welcome":
      return { ...state, screen: "welcome", scenarioId: null, requestedProtectedView: null, statusMessage: "Welcome choices are ready." };
    case "open_about":
      return { ...state, screen: "about", scenarioId: null, requestedProtectedView: null, statusMessage: "About CASTRA opened." };
    case "open_login":
      return { ...state, screen: "login", scenarioId: "login-idle", requestedProtectedView: null, statusMessage: "Deterministic login review opened; no credential is read or submitted." };
    case "open_gallery":
      return { ...state, screen: "gallery", scenarioId: null, requestedProtectedView: null, statusMessage: "UI-04 authentication state gallery opened in memory-only Review Mode." };
    case "inspect_scenario":
      if (!findAuthUiScenario(event.scenarioId)) return { ...state, statusMessage: "The requested review scenario is unavailable." };
      return { ...state, screen: "scenario", scenarioId: event.scenarioId, statusMessage: "Deterministic scenario selected; authoritative CASTRA data remains unchanged." };
    case "authenticate_test":
      return { ...state, mode: "authenticated_test", screen: "welcome", scenarioId: "route-authenticated", requestedProtectedView: null, statusMessage: "Verified deterministic test access is active; this is not a live provider session." };
    case "authenticate_live":
      return { ...state, mode: "authenticated_live", screen: "welcome", scenarioId: null, requestedProtectedView: null, statusMessage: "Server-authenticated Commander access is active." };
    case "live_session_lost":
      return { ...initialAuthExperienceState(), statusMessage: event.message };
    case "logout":
      return { ...initialAuthExperienceState(), statusMessage: "Deterministic test access ended. No live session or token existed." };
    case "enter_demo":
      return { ...state, mode: "demo", screen: "demo", scenarioId: "demo-entry", requestedProtectedView: null, statusMessage: "Public Demo is open in memory only; no production state is available." };
    case "exit_demo":
      return { ...initialAuthExperienceState(), statusMessage: "Public Demo state was discarded and no data transferred to production." };
    case "protected_route_requested":
      return { ...state, screen: "scenario", scenarioId: "route-redirect", requestedProtectedView: event.view, statusMessage: "Protected route redirected to Welcome because no authenticated test session is active." };
    case "permission_forbidden":
      return { ...state, screen: "scenario", scenarioId: "route-forbidden", requestedProtectedView: event.view, statusMessage: "The requested destination is forbidden for the represented authority." };
  }
}
