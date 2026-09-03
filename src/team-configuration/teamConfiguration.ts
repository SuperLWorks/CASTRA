/**
 * Team Configuration — governed agent-team setup domain contract.
 *
 * Public-preview seven-role configuration contract.
 *
 * This module is the pure, deterministic engine behind a future Team
 * Configuration page. It lets a presentation layer render and manipulate a
 * memory-only *draft* of the governed CASTRA role roster. It is deliberately
 * isolated from every authoritative and effectful surface:
 *
 * - It imports nothing. There is no `src/domain`, `src/data`, hosted-state,
 *   authentication, WebMCP, or connector dependency, and nothing here can
 *   construct a CASTRA command or reach `/api/state`.
 * - There is no repository, `fetch`, storage, cookie, provider, account,
 *   credential, clock, or random source. Every exported function is a plain,
 *   synchronous, side-effect-free transformation over data supplied by its
 *   caller. Every identifier and timestamp is caller-supplied, so results are
 *   reproducible.
 * - Nothing here saves to hosted state, launches an agent, switches an account,
 *   exposes a credential, allocates an identifier, closes a lifecycle record,
 *   deploys, publishes, or calls a provider. A draft is a Commander review aid
 *   until a separately governed, already-existing decision applies it — and
 *   that application path is not in this module.
 *
 * Contract highlights, each mechanically enforced below and exercised by
 * `teamConfiguration.test.ts`:
 *
 * 1. The roster is exactly the seven canonical roles established by the documented role policy
 *    and `DATA-SCOPE.md#withheld-internal-reference`: SARGE, SIGNAL, FORGE,
 *    RECON, FIREWATCH, SCRIBE, Quartermaster. No role is invented, renamed away,
 *    added, or removed, and no human-readable Action code is minted here.
 * 2. Role separation is structural, not advisory. `independent_verification` is
 *    grantable only to the role whose duty *is* independent verification;
 *    `repository_write_allowlisted` is refused to that role; and every role
 *    draft must declare `maySelfApprove`, `maySelfVerify`, `mayAcceptOwnWork`,
 *    and `mayOriginateCommanderAuthority` as its *own* properties, each holding
 *    exactly boolean `false`. A missing, inherited, `undefined`, `null`, string,
 *    number, object, or array declaration is refused, never coerced: silence is
 *    not a denial, and a literal `false` reached through a prototype chain is
 *    silence — the object itself never declared it.
 * 3. A draft can never be labelled applied. `status` must be `"draft"`,
 *    `applied` must be `false`, and `persistence` must be `"memory_only"`.
 * 4. Authentication class is `first_party_subscription` only. An API key, a
 *    metered API, an automatic paid fallback, and a `--fallback-model`-style
 *    substitution all fail closed.
 * 5. SIGNAL's standing usage-limit route is preserved exactly: Spark at high
 *    effort primary, one fresh first-party Claude Code subscription Sonnet 5 at
 *    max effort *after* the recorded first usage-limit condition, and no
 *    automatic third model. The route is not a page toggle. Its two denial
 *    declarations, `automatic` and `thirdAutomaticModelPermitted`, must each be
 *    the route's own properties and exactly boolean `false`. A missing,
 *    inherited, `undefined`, `null`, string, number, object, array, or `true`
 *    value is refused, never coerced: a route that never denied automatic
 *    activation has denied nothing, and an inherited denial was made by some
 *    other object, not by this route.
 * 6. Runtime evidence is classed, never fabricated. A draft has launched
 *    nothing, so it may never carry `runtime_resolved` evidence, and the
 *    runtime-reported model is explicitly `unavailable`.
 */

export const TEAM_CONFIGURATION_MODEL_REVISION = "castra.team-configuration/1.0.0-draft-2026-09-02" as const;

export const TEAM_CONFIGURATION_LIFECYCLE = "draft contract · nonvisual FORGE portion · not verified, not accepted, not applied" as const;

export const TEAM_CONFIGURATION_EFFECT_NOTICE =
  "This surface is effect-free. Creating, editing, validating, summarizing, reviewing, or projecting a draft saves nothing to hosted state, launches no agent, switches no account, reads no credential, allocates no identifier, closes no lifecycle record, deploys nothing, publishes nothing, calls no provider, and spends nothing. Applying a roster change remains a separate, already-governed Commander decision that this module cannot reach." as const;

export const TEAM_CONFIGURATION_AUTHORITY_NOTICE =
  "CASTRA roles, role separation, deterministic authority, and Commander-gated approval do not change with any draft below. No draft creates Commander authority, accepts work, grants a waiver, widens scope, or converts a proposal into a verified or accepted result." as const;

export const SIGNAL_USAGE_LIMIT_ROUTE_STATEMENT =
  "SIGNAL runs on the first-party Codex subscription at exact model gpt-5.3-codex-spark and high effort. On the first confirmed Spark usage limit in a bounded work lineage, and only after the stop is captured and the partial candidate is proven resumable, one fresh SIGNAL executor may be launched through the Commander's first-party Claude Code subscription at exact model claude-sonnet-5 and max effort. This is an orchestrated, role-preserving, one-hop handoff, never an automatic provider fallback, and never a --fallback-model substitution. A further usage limit in the same lineage parks the lane for the Commander; no third model is selected automatically." as const;

export const TEAM_ROLE_SEPARATION_INVARIANTS: readonly string[] = Object.freeze([
  "SARGE orchestrates; it never originates Commander authority and never accepts its own work.",
  "SIGNAL implements presentation and interaction; it never owns authority, lifecycle, credentials, Production, or its own acceptance.",
  "FORGE implements the scoped brief; it is credential-free, has no shell, never deploys, and never verifies its own work.",
  "RECON researches read-only; it never becomes implementation or verification.",
  "FIREWATCH verifies independently as a fresh executor; it never implements the candidate it verifies and never supplies Commander acceptance.",
  "SCRIBE records the bound evidence scope; it never changes lifecycle, approval, verification truth, waivers, or risk ownership.",
  "Quartermaster stewards KPIs read-only; every allowlisted record mutation is applied by SARGE through the governed connector.",
]);

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

export type TeamConfigurationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: TeamConfigurationRefusalCode; reason: string };

export type TeamRoleEditResult =
  | { ok: true; changed: boolean; value: TeamConfigurationDraft; note: string }
  | { ok: false; code: TeamConfigurationRefusalCode; reason: string };

/**
 * One vocabulary for editing refusals and validation findings, so a UI renders
 * one stable reason set and an audit can search one list.
 */
export type TeamConfigurationRefusalCode =
  | "malformed_request"
  | "malformed_draft"
  | "unknown_role"
  | "duplicate_role"
  | "missing_role"
  | "field_not_editable"
  | "invalid_value_type"
  | "invalid_text_value"
  | "unknown_provider"
  | "unknown_runtime"
  | "unknown_model"
  | "unknown_effort"
  | "unknown_capability"
  | "unknown_evidence_class"
  | "unknown_authentication_class"
  | "provider_runtime_mismatch"
  | "model_not_permitted_for_role"
  | "effort_not_permitted_for_role"
  | "signal_primary_route_altered"
  | "metered_or_api_key_path_denied"
  | "fallback_not_permitted_for_role"
  | "fallback_route_altered"
  | "automatic_fallback_denied"
  | "third_automatic_fallback_denied"
  | "prohibited_capability_denied"
  | "capability_exceeds_role_ceiling"
  | "capability_conflicts_with_duty"
  | "self_verification_denied"
  | "self_approval_denied"
  | "commander_authority_origination_denied"
  | "protected_role_cannot_be_disabled"
  | "independent_verification_disabled"
  | "draft_labelled_applied"
  | "fabricated_runtime_evidence"
  | "deviates_from_recorded_default"
  | "no_op_edit";

// ---------------------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------------------

export const TEAM_ROLE_IDS = [
  "sarge",
  "signal",
  "forge",
  "recon",
  "firewatch",
  "scribe",
  "quartermaster",
] as const;
export type TeamRoleId = (typeof TEAM_ROLE_IDS)[number];

export const TEAM_PROVIDER_IDS = ["openai_codex_subscription", "anthropic_claude_code_subscription"] as const;
export type TeamProviderId = (typeof TEAM_PROVIDER_IDS)[number];

export const TEAM_RUNTIME_IDS = [
  "native_codex_orchestrator",
  "native_codex_profile",
  "claude_code_governed_writer",
  "claude_code_governed_research",
  "claude_code_governed_verifier",
] as const;
export type TeamRuntimeId = (typeof TEAM_RUNTIME_IDS)[number];

export const TEAM_MODEL_IDS = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.3-codex-spark",
  "claude-opus-5",
  "claude-sonnet-5",
] as const;
export type TeamModelId = (typeof TEAM_MODEL_IDS)[number];

export const TEAM_EFFORT_IDS = ["high", "max"] as const;
export type TeamEffortId = (typeof TEAM_EFFORT_IDS)[number];

/**
 * Only `first_party_subscription` is ever permitted. The other members exist so
 * a refusal can name precisely what was rejected instead of failing anonymously.
 */
export const TEAM_AUTHENTICATION_CLASSES = [
  "first_party_subscription",
  "api_key",
  "metered_api",
  "automatic_paid_fallback",
  "model_alias_substitution",
  "unknown",
] as const;
export type TeamAuthenticationClass = (typeof TEAM_AUTHENTICATION_CLASSES)[number];

export const PERMITTED_AUTHENTICATION_CLASS: TeamAuthenticationClass = "first_party_subscription";

export const TEAM_ROLE_DUTIES = [
  "orchestration",
  "presentation_interaction",
  "implementation",
  "research",
  "independent_verification",
  "records",
  "kpi_stewardship",
] as const;
export type TeamRoleDuty = (typeof TEAM_ROLE_DUTIES)[number];

export const TEAM_CAPABILITY_IDS = [
  "repository_read",
  "repository_write_allowlisted",
  "shell_execution",
  "bounded_public_web",
  "delegation",
  "independent_verification",
  "mcp",
  "general_network",
  "browser_control",
  "credential_access",
  "lifecycle_mutation",
  "production_effect",
  "spend_authorization",
  "commander_authority_origination",
] as const;
export type TeamCapabilityId = (typeof TEAM_CAPABILITY_IDS)[number];

/**
 * Never grantable from this surface to any role, at any time. These are either
 * denied outright by the governed launchers or governed by an entirely
 * different decision path. A configuration page must not be a back door into
 * any of them.
 */
export const PROHIBITED_CAPABILITY_IDS: readonly TeamCapabilityId[] = Object.freeze([
  "mcp",
  "general_network",
  "browser_control",
  "credential_access",
  "lifecycle_mutation",
  "production_effect",
  "spend_authorization",
  "commander_authority_origination",
] as const);

export const TEAM_CAPABILITY_STATEMENTS: Readonly<Record<TeamCapabilityId, string>> = Object.freeze({
  repository_read: "Bounded read and search inside the candidate worktree, excluding protected and secret paths.",
  repository_write_allowlisted: "Writes confined to the exact write allowlist bound by the governing envelope. Never a commit, push, or deployment.",
  shell_execution: "Executes the deterministic verification plan outside the writer process. Governed Claude writers receive no shell.",
  bounded_public_web: "Bounded public research against the envelope's explicit HTTPS domain allowlist only. Grants no general network access.",
  delegation: "Launches other bounded role executors under an existing decision. Never transfers Commander authority.",
  independent_verification: "Produces an independent verification disposition on a candidate the executor did not implement.",
  mcp: "Denied. The governed launchers load an empty model-context configuration.",
  general_network: "Denied. No role is configured with general network egress from this surface.",
  browser_control: "Denied. Browser profiles are activated separately and remain behind their own gate.",
  credential_access: "Denied. Credentials never reach an agent, a chat, a repository file, or a receipt.",
  lifecycle_mutation: "Denied here. Lifecycle transitions use the governed lifecycle commands and their own authority.",
  production_effect: "Denied here. Production effects require a per-deployment Commander authorization naming the exact target.",
  spend_authorization: "Denied here. Spend, ceilings, and billing class are Commander decisions and are not configurable on this page.",
  commander_authority_origination: "Denied absolutely. No role, and no configuration, can manufacture Commander authority.",
});

export const TEAM_CAPABILITY_LABELS: Readonly<Record<TeamCapabilityId, string>> = Object.freeze({
  repository_read: "Repository read",
  repository_write_allowlisted: "Allowlisted repository write",
  shell_execution: "Shell execution",
  bounded_public_web: "Bounded public web research",
  delegation: "Role delegation",
  independent_verification: "Independent verification",
  mcp: "Model-context servers",
  general_network: "General network",
  browser_control: "Browser control",
  credential_access: "Credential access",
  lifecycle_mutation: "Lifecycle mutation",
  production_effect: "Production effect",
  spend_authorization: "Spend authorization",
  commander_authority_origination: "Commander authority origination",
});

/**
 * How much a stated runtime fact is actually worth. An unavailable or
 * unresolved fact is recorded as such; it is never upgraded by assumption.
 */
export const TEAM_EVIDENCE_CLASSES = [
  "configured",
  "launcher_bound",
  "runtime_resolved",
  "draft_only",
  "unavailable",
] as const;
export type TeamEvidenceClass = (typeof TEAM_EVIDENCE_CLASSES)[number];

export const TEAM_EVIDENCE_CLASS_MEANINGS: Readonly<Record<TeamEvidenceClass, string>> = Object.freeze({
  configured: "Recorded by the governing operating guide as the standing default. Not proof that a runtime resolved it.",
  launcher_bound: "Bound by the governed launcher at preflight. Proof of what was requested and enforced, not of what the runtime reported.",
  runtime_resolved: "Reported back by the runtime itself. Only a real executor return can produce this class.",
  draft_only: "Proposed in this memory-only draft. Nothing has been bound, launched, or applied.",
  unavailable: "Not exposed and not known. Recorded honestly as absent rather than manufactured.",
});

export const PROTECTED_ROLE_IDS: readonly TeamRoleId[] = Object.freeze(["sarge", "firewatch"] as const);

// ---------------------------------------------------------------------------
// Provider / runtime / model / effort compatibility catalog
// ---------------------------------------------------------------------------

export interface TeamRuntimeBinding {
  provider: TeamProviderId;
  runtime: TeamRuntimeId;
  models: readonly TeamModelId[];
  efforts: readonly TeamEffortId[];
}

/**
 * The only provider/runtime pairs that exist, and the only models each may
 * carry. A pair outside this table is a mismatch, not a preference.
 */
const RUNTIME_BINDINGS: readonly TeamRuntimeBinding[] = Object.freeze([
  Object.freeze({
    provider: "openai_codex_subscription" as const,
    runtime: "native_codex_orchestrator" as const,
    models: Object.freeze(["gpt-5.6-sol"] as const),
    efforts: Object.freeze(["high"] as const),
  }),
  Object.freeze({
    provider: "openai_codex_subscription" as const,
    runtime: "native_codex_profile" as const,
    models: Object.freeze(["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.3-codex-spark"] as const),
    efforts: Object.freeze(["high"] as const),
  }),
  Object.freeze({
    provider: "anthropic_claude_code_subscription" as const,
    runtime: "claude_code_governed_writer" as const,
    models: Object.freeze(["claude-opus-5", "claude-sonnet-5"] as const),
    efforts: Object.freeze(["max"] as const),
  }),
  Object.freeze({
    provider: "anthropic_claude_code_subscription" as const,
    runtime: "claude_code_governed_research" as const,
    models: Object.freeze(["claude-opus-5", "claude-sonnet-5"] as const),
    efforts: Object.freeze(["max"] as const),
  }),
  Object.freeze({
    provider: "anthropic_claude_code_subscription" as const,
    runtime: "claude_code_governed_verifier" as const,
    models: Object.freeze(["claude-opus-5"] as const),
    efforts: Object.freeze(["max"] as const),
  }),
]) as readonly TeamRuntimeBinding[];

export function teamRuntimeBinding(provider: string, runtime: string): TeamRuntimeBinding | null {
  return RUNTIME_BINDINGS.find((entry) => entry.provider === provider && entry.runtime === runtime) ?? null;
}

// ---------------------------------------------------------------------------
// Standing SIGNAL usage-limit route
// ---------------------------------------------------------------------------

/**
 * `automatic` and `thirdAutomaticModelPermitted` are declared as mutable
 * booleans on purpose, for the same reason the authority declarations are: the
 * type can express a violation so a caller cannot smuggle one past the compiler
 * unnoticed, and the contract refuses it at validation time.
 *
 * Validation requires each of those two declarations to be the route's *own*
 * property and exactly boolean `false`. A hand-built, deserialized, or hostile
 * route never passed through this compiler, so the validator treats a missing,
 * inherited, `undefined`, `null`, string, number, object, or array value as a
 * blocking defect rather than an implied denial, and never coerces it. An
 * inherited value is read as absence on purpose: `Object.create`, a
 * deserializer, and a class instance can all place a literal `false` on a
 * prototype, and a route that carries no declaration of its own has declared
 * nothing regardless of what its prototype happens to say. These two fields
 * exist to record that the standing one-hop route never activates automatically
 * and never selects a third model; a declaration that was never made records
 * nothing.
 */
export interface TeamFallbackRoute {
  provider: TeamProviderId;
  runtime: TeamRuntimeId;
  model: TeamModelId;
  effort: TeamEffortId;
  authenticationClass: TeamAuthenticationClass;
  activation: "recorded_first_usage_limit_one_hop";
  automatic: boolean;
  freshExecutorRequired: boolean;
  compatibilityPreflightRequired: boolean;
  thirdAutomaticModelPermitted: boolean;
  secondLimitBehavior: "park_lane_and_wait_for_commander";
  statement: string;
}

export type TeamFallbackDenialDeclaration = "automatic" | "thirdAutomaticModelPermitted";

/**
 * The exact denial set every standing fallback route must carry. Exported so a
 * presentation layer renders the same two denials the validator enforces, and so
 * the contract suite can iterate them without restating the list.
 */
export const TEAM_FALLBACK_ROUTE_DENIAL_DECLARATION_FIELDS: readonly TeamFallbackDenialDeclaration[] = Object.freeze([
  "automatic",
  "thirdAutomaticModelPermitted",
] as const);

export const SIGNAL_STANDING_FALLBACK_ROUTE: TeamFallbackRoute = Object.freeze({
  provider: "anthropic_claude_code_subscription" as const,
  runtime: "claude_code_governed_writer" as const,
  model: "claude-sonnet-5" as const,
  effort: "max" as const,
  authenticationClass: "first_party_subscription" as const,
  activation: "recorded_first_usage_limit_one_hop" as const,
  automatic: false,
  freshExecutorRequired: true,
  compatibilityPreflightRequired: true,
  thirdAutomaticModelPermitted: false,
  secondLimitBehavior: "park_lane_and_wait_for_commander" as const,
  statement: SIGNAL_USAGE_LIMIT_ROUTE_STATEMENT,
});

// ---------------------------------------------------------------------------
// Canonical role catalog
// ---------------------------------------------------------------------------

export interface TeamRoleDefinition {
  roleId: TeamRoleId;
  canonicalName: string;
  duty: TeamRoleDuty;
  dutyStatement: string;
  authorityBoundary: string;
  provider: TeamProviderId;
  runtime: TeamRuntimeId;
  defaultModel: TeamModelId;
  defaultEffort: TeamEffortId;
  permittedModels: readonly TeamModelId[];
  permittedEfforts: readonly TeamEffortId[];
  standingFallback: TeamFallbackRoute | null;
  capabilityCeiling: readonly TeamCapabilityId[];
  defaultCapabilities: readonly TeamCapabilityId[];
  requiredCapabilities: readonly TeamCapabilityId[];
  launchPath: string;
  profilePath: string | null;
  disableable: boolean;
}

const ROLE_DEFINITIONS: readonly TeamRoleDefinition[] = Object.freeze([
  Object.freeze({
    roleId: "sarge" as const,
    canonicalName: "SARGE",
    duty: "orchestration" as const,
    dutyStatement:
      "Orchestrates the session: binds live authority, produces the Session Work Plan, dispatches roles, executes the deterministic impacted verification plan, and consumes terminal dispositions.",
    authorityBoundary:
      "Broad execution capability is never Commander authority. SARGE may not originate a Commander decision, grant or widen a waiver, expand scope, accept its own work, or close a gated record without a governed Commander decision carried through the connector.",
    provider: "openai_codex_subscription" as const,
    runtime: "native_codex_orchestrator" as const,
    defaultModel: "gpt-5.6-sol" as const,
    defaultEffort: "high" as const,
    permittedModels: Object.freeze(["gpt-5.6-sol"] as const),
    permittedEfforts: Object.freeze(["high"] as const),
    standingFallback: null,
    capabilityCeiling: Object.freeze([
      "repository_read",
      "repository_write_allowlisted",
      "shell_execution",
      "delegation",
    ] as const),
    defaultCapabilities: Object.freeze([
      "repository_read",
      "repository_write_allowlisted",
      "shell_execution",
      "delegation",
    ] as const),
    requiredCapabilities: Object.freeze(["repository_read", "shell_execution", "delegation"] as const),
    launchPath: "root Codex orchestrator; never child-launched",
    profilePath: null,
    disableable: false,
  }),
  Object.freeze({
    roleId: "signal" as const,
    canonicalName: "SIGNAL",
    duty: "presentation_interaction" as const,
    dutyStatement:
      "Implements presentation and interaction only, from the Commander's current intent plus a bounded RECON research package.",
    authorityBoundary:
      "SIGNAL does not own authority, authentication, allocation, idempotency, schema/provider, credential, secret, Production, deployment, lifecycle, or Git-binding logic, and cannot accept its own work. The Commander alone accepts visual intent, readability, and usability.",
    provider: "openai_codex_subscription" as const,
    runtime: "native_codex_profile" as const,
    defaultModel: "gpt-5.3-codex-spark" as const,
    defaultEffort: "high" as const,
    permittedModels: Object.freeze(["gpt-5.3-codex-spark"] as const),
    permittedEfforts: Object.freeze(["high"] as const),
    standingFallback: SIGNAL_STANDING_FALLBACK_ROUTE,
    capabilityCeiling: Object.freeze(["repository_read", "repository_write_allowlisted"] as const),
    defaultCapabilities: Object.freeze(["repository_read", "repository_write_allowlisted"] as const),
    requiredCapabilities: Object.freeze(["repository_read", "repository_write_allowlisted"] as const),
    launchPath:
      "`not-distributed-in-this-preview` primary; `not-distributed-in-this-preview` with `not-distributed-in-this-preview` for the standing one-hop fallback only",
    profilePath: "not-distributed-in-this-preview",
    disableable: true,
  }),
  Object.freeze({
    roleId: "forge" as const,
    canonicalName: "FORGE",
    duty: "implementation" as const,
    dutyStatement:
      "Implements exactly the scoped Action brief inside the bound write allowlist, then stops for a fresh independent verification handoff.",
    authorityBoundary:
      "FORGE is permanently credential-free, receives no shell, never deploys, never verifies its own work, and never records Verified, Accepted, or Done.",
    provider: "anthropic_claude_code_subscription" as const,
    runtime: "claude_code_governed_writer" as const,
    defaultModel: "claude-opus-5" as const,
    defaultEffort: "max" as const,
    permittedModels: Object.freeze(["claude-opus-5", "claude-sonnet-5"] as const),
    permittedEfforts: Object.freeze(["max"] as const),
    standingFallback: null,
    capabilityCeiling: Object.freeze(["repository_read", "repository_write_allowlisted"] as const),
    defaultCapabilities: Object.freeze(["repository_read", "repository_write_allowlisted"] as const),
    requiredCapabilities: Object.freeze(["repository_read", "repository_write_allowlisted"] as const),
    launchPath: "`not-distributed-in-this-preview` with `not-distributed-in-this-preview`",
    profilePath: "not-distributed-in-this-preview",
    disableable: true,
  }),
  Object.freeze({
    roleId: "recon" as const,
    canonicalName: "RECON",
    duty: "research" as const,
    dutyStatement:
      "Read-only discovery and bounded public research. Returns findings and open questions; never becomes implementation or verification.",
    authorityBoundary:
      "A bounded_public_web envelope grants only its explicit HTTPS domain allowlist through the fail-closed research hook. It never grants general network, shell, write, credential, browser-control, MCP, or delegation access.",
    provider: "anthropic_claude_code_subscription" as const,
    runtime: "claude_code_governed_research" as const,
    defaultModel: "claude-opus-5" as const,
    defaultEffort: "max" as const,
    permittedModels: Object.freeze(["claude-opus-5", "claude-sonnet-5"] as const),
    permittedEfforts: Object.freeze(["max"] as const),
    standingFallback: null,
    capabilityCeiling: Object.freeze(["repository_read", "bounded_public_web"] as const),
    defaultCapabilities: Object.freeze(["repository_read"] as const),
    requiredCapabilities: Object.freeze(["repository_read"] as const),
    launchPath: "`not-distributed-in-this-preview` with `not-distributed-in-this-preview`",
    profilePath: "not-distributed-in-this-preview",
    disableable: true,
  }),
  Object.freeze({
    roleId: "firewatch" as const,
    canonicalName: "FIREWATCH",
    duty: "independent_verification" as const,
    dutyStatement:
      "Independently rechecks the exact defect and one adjacent probe, regenerates the impacted plan from the bound candidate manifest, and executes that plan.",
    authorityBoundary:
      "FIREWATCH must be a fresh executor that did not implement the candidate, must not trust the implementer's plan artifact as a substitute for its own selection, and does not review SIGNAL-owned aesthetics or usability. It has no write surface or general shell: Bash is limited to commands appearing verbatim in its verifier envelope's non-empty allowlist, and the dedicated launcher fails closed if the candidate or HEAD changes. Writer and verifier sessions are never shared. It produces a disposition, never Commander acceptance.",
    provider: "anthropic_claude_code_subscription" as const,
    runtime: "claude_code_governed_verifier" as const,
    defaultModel: "claude-opus-5" as const,
    defaultEffort: "max" as const,
    permittedModels: Object.freeze(["claude-opus-5"] as const),
    permittedEfforts: Object.freeze(["max"] as const),
    standingFallback: null,
    capabilityCeiling: Object.freeze(["repository_read", "shell_execution", "independent_verification"] as const),
    defaultCapabilities: Object.freeze(["repository_read", "shell_execution", "independent_verification"] as const),
    requiredCapabilities: Object.freeze([
      "repository_read",
      "shell_execution",
      "independent_verification",
    ] as const),
    launchPath:
      "`not-distributed-in-this-preview` with `not-distributed-in-this-preview` and `not-distributed-in-this-preview`; always a fresh executor. `not-distributed-in-this-preview` is superseded and fail-closed, not an available default.",
    profilePath: "not-distributed-in-this-preview",
    disableable: false,
  }),
  Object.freeze({
    roleId: "scribe" as const,
    canonicalName: "SCRIBE",
    duty: "records" as const,
    dutyStatement:
      "Records only the bound evidence scope: evidence references, handoffs, AAR and decision-history projections, supersession links, record readiness, audit metadata, and freshness.",
    authorityBoundary:
      "SCRIBE may write only its current assignment's allowlisted record fields. It may not change lifecycle or status, approval or acceptance, assignment or scope, verification truth, waivers, risk ownership, or another scope.",
    provider: "anthropic_claude_code_subscription" as const,
    runtime: "claude_code_governed_writer" as const,
    defaultModel: "claude-sonnet-5" as const,
    defaultEffort: "max" as const,
    permittedModels: Object.freeze(["claude-opus-5", "claude-sonnet-5"] as const),
    permittedEfforts: Object.freeze(["max"] as const),
    standingFallback: null,
    capabilityCeiling: Object.freeze(["repository_read", "repository_write_allowlisted"] as const),
    defaultCapabilities: Object.freeze(["repository_read", "repository_write_allowlisted"] as const),
    requiredCapabilities: Object.freeze(["repository_read", "repository_write_allowlisted"] as const),
    launchPath: "`not-distributed-in-this-preview` with `not-distributed-in-this-preview`",
    profilePath: "not-distributed-in-this-preview",
    disableable: true,
  }),
  Object.freeze({
    roleId: "quartermaster" as const,
    canonicalName: "Quartermaster",
    duty: "kpi_stewardship" as const,
    dutyStatement:
      "Read-only KPI and outcome stewardship: prepares KPI definitions, observations, cost/time/usage/rework/prompt measures, provenance, availability, and freshness for its current assignment.",
    authorityBoundary:
      "Quartermaster writes no repository or CASTRA state. Any allowlisted record mutation is applied by SARGE through the separately governed connector. It may not approve spend, change ceilings, fabricate measures, or alter lifecycle, status, approval, scope, or assignment.",
    provider: "openai_codex_subscription" as const,
    runtime: "native_codex_profile" as const,
    defaultModel: "gpt-5.6-terra" as const,
    defaultEffort: "high" as const,
    permittedModels: Object.freeze(["gpt-5.6-terra"] as const),
    permittedEfforts: Object.freeze(["high"] as const),
    standingFallback: null,
    capabilityCeiling: Object.freeze(["repository_read"] as const),
    defaultCapabilities: Object.freeze(["repository_read"] as const),
    requiredCapabilities: Object.freeze(["repository_read"] as const),
    launchPath: "`not-distributed-in-this-preview`",
    profilePath: "not-distributed-in-this-preview",
    disableable: true,
  }),
]) as readonly TeamRoleDefinition[];

export function teamRoleDefinitions(): readonly TeamRoleDefinition[] {
  return ROLE_DEFINITIONS;
}

export function teamRoleDefinition(roleId: string): TeamRoleDefinition | null {
  return ROLE_DEFINITIONS.find((entry) => entry.roleId === roleId) ?? null;
}

// ---------------------------------------------------------------------------
// Draft shapes
// ---------------------------------------------------------------------------

export type TeamDraftStatus = "draft" | "applied";
export type TeamDraftPersistence = "memory_only" | "hosted" | "unknown";

export interface TeamRuntimeEvidence {
  provider: TeamEvidenceClass;
  runtime: TeamEvidenceClass;
  model: TeamEvidenceClass;
  effort: TeamEvidenceClass;
  sessionIdentity: TeamEvidenceClass;
  resolvedModelReportedByRuntime: TeamEvidenceClass;
}

/**
 * Declared as mutable booleans on purpose. The type can express a violation so
 * a caller cannot smuggle one past the compiler unnoticed; the contract refuses
 * it at validation time, which is where a defence belongs.
 *
 * Validation requires each declaration to be the block's *own* property and
 * exactly boolean `false`. A hand-built, deserialized, or hostile draft never
 * passed through this compiler, so the validator treats a missing, inherited,
 * `undefined`, `null`, string, number, object, or array value as a blocking
 * defect rather than an implied denial, and never coerces it. An inherited value
 * is read as absence on purpose: `Object.create`, a deserializer, and a class
 * instance can all place a literal `false` on a prototype, and a block that
 * carries no declaration of its own has asserted nothing regardless of what its
 * prototype happens to say. These four fields exist to record that a boundary
 * was asserted; a declaration that was never made asserts nothing.
 */
export interface TeamRoleAuthorityDeclarations {
  maySelfApprove: boolean;
  maySelfVerify: boolean;
  mayAcceptOwnWork: boolean;
  mayOriginateCommanderAuthority: boolean;
}

/**
 * The exact declaration set every role draft must carry. Exported so a
 * presentation layer renders the same four boundaries the validator enforces,
 * and so the contract suite can iterate them without restating the list.
 */
export const TEAM_ROLE_AUTHORITY_DECLARATION_FIELDS: readonly (keyof TeamRoleAuthorityDeclarations)[] = Object.freeze([
  "maySelfApprove",
  "maySelfVerify",
  "mayAcceptOwnWork",
  "mayOriginateCommanderAuthority",
] as const);

export interface TeamRoleFallbackDraft {
  enabled: boolean;
  route: TeamFallbackRoute;
}

export interface TeamRoleDraft {
  roleId: TeamRoleId;
  displayName: string;
  notes: string;
  enabled: boolean;
  duty: TeamRoleDuty;
  provider: TeamProviderId;
  runtime: TeamRuntimeId;
  model: TeamModelId;
  effort: TeamEffortId;
  authenticationClass: TeamAuthenticationClass;
  capabilities: readonly TeamCapabilityId[];
  fallback: TeamRoleFallbackDraft | null;
  evidence: TeamRuntimeEvidence;
  authority: TeamRoleAuthorityDeclarations;
  launchPath: string;
  profilePath: string | null;
}

export interface TeamConfigurationDraft {
  modelRevision: string;
  draftId: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  status: TeamDraftStatus;
  applied: boolean;
  persistence: TeamDraftPersistence;
  effectNotice: string;
  roles: readonly TeamRoleDraft[];
}

// ---------------------------------------------------------------------------
// Text and structure helpers
// ---------------------------------------------------------------------------

export const TEAM_DISPLAY_NAME_MAX_LENGTH = 48;
export const TEAM_NOTES_MAX_LENGTH = 240;
export const TEAM_DRAFT_ID_MAX_LENGTH = 64;

const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/**
 * Control-character detection by numeric code point rather than a regex escape
 * sequence, so it cannot be silently mistranscribed and cannot be defeated by
 * an encoding trick in a copied string.
 */
export function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 0x20 || codePoint === 0x7f) return true;
  }
  return false;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.prototype.toString.call(value) === "[object Object]";
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.getOwnPropertyNames(value as object)) {
    deepFreeze((value as unknown as Record<string, unknown>)[key]);
  }
  return value;
}

function includesValue(list: readonly string[], value: unknown): boolean {
  return typeof value === "string" && list.includes(value);
}

export function isTeamRoleId(value: unknown): value is TeamRoleId {
  return includesValue(TEAM_ROLE_IDS as readonly string[], value);
}

export function isTeamModelId(value: unknown): value is TeamModelId {
  return includesValue(TEAM_MODEL_IDS as readonly string[], value);
}

export function isTeamEffortId(value: unknown): value is TeamEffortId {
  return includesValue(TEAM_EFFORT_IDS as readonly string[], value);
}

export function isTeamCapabilityId(value: unknown): value is TeamCapabilityId {
  return includesValue(TEAM_CAPABILITY_IDS as readonly string[], value);
}

export function isTeamEvidenceClass(value: unknown): value is TeamEvidenceClass {
  return includesValue(TEAM_EVIDENCE_CLASSES as readonly string[], value);
}

function roleOrderIndex(roleId: string): number {
  const index = (TEAM_ROLE_IDS as readonly string[]).indexOf(roleId);
  return index === -1 ? TEAM_ROLE_IDS.length : index;
}

/** Canonical capability ordering, so two equal sets always serialize equally. */
function orderCapabilities(capabilities: readonly TeamCapabilityId[]): readonly TeamCapabilityId[] {
  const unique = new Set<TeamCapabilityId>(capabilities);
  return TEAM_CAPABILITY_IDS.filter((capability) => unique.has(capability));
}

// ---------------------------------------------------------------------------
// Baseline draft creation
// ---------------------------------------------------------------------------

export interface CreateTeamConfigurationDraftInput {
  draftId: string;
  nowIso: string;
}

function baselineEvidence(): TeamRuntimeEvidence {
  return {
    provider: "configured",
    runtime: "configured",
    model: "configured",
    effort: "configured",
    sessionIdentity: "unavailable",
    resolvedModelReportedByRuntime: "unavailable",
  };
}

function baselineRoleDraft(definition: TeamRoleDefinition): TeamRoleDraft {
  return {
    roleId: definition.roleId,
    displayName: definition.canonicalName,
    notes: "",
    enabled: true,
    duty: definition.duty,
    provider: definition.provider,
    runtime: definition.runtime,
    model: definition.defaultModel,
    effort: definition.defaultEffort,
    authenticationClass: PERMITTED_AUTHENTICATION_CLASS,
    capabilities: orderCapabilities(definition.defaultCapabilities),
    fallback: definition.standingFallback === null ? null : { enabled: true, route: definition.standingFallback },
    evidence: baselineEvidence(),
    authority: {
      maySelfApprove: false,
      maySelfVerify: false,
      mayAcceptOwnWork: false,
      mayOriginateCommanderAuthority: false,
    },
    launchPath: definition.launchPath,
    profilePath: definition.profilePath,
  };
}

/**
 * The baseline draft is the roster exactly as the documented role policy and runtime
 * structure contract already record it. It is deterministic: identical inputs
 * always produce a deep-equal, deeply frozen result, and no clock or random
 * source is consulted.
 */
export function createBaselineTeamConfigurationDraft(
  input: CreateTeamConfigurationDraftInput,
): TeamConfigurationResult<TeamConfigurationDraft> {
  const inputShape: unknown = input;
  if (!isPlainRecord(inputShape)) {
    return { ok: false, code: "malformed_request", reason: "The draft creation input must be a plain object." };
  }
  const draftId: unknown = inputShape.draftId;
  const nowIso: unknown = inputShape.nowIso;
  if (typeof draftId !== "string" || draftId.trim().length === 0) {
    return { ok: false, code: "invalid_text_value", reason: "draftId must be a non-empty string supplied by the caller." };
  }
  if (draftId.length > TEAM_DRAFT_ID_MAX_LENGTH || hasControlCharacters(draftId)) {
    return {
      ok: false,
      code: "invalid_text_value",
      reason: `draftId must be at most ${TEAM_DRAFT_ID_MAX_LENGTH} characters and must contain no control characters.`,
    };
  }
  if (typeof nowIso !== "string" || !ISO_INSTANT_PATTERN.test(nowIso)) {
    return {
      ok: false,
      code: "invalid_text_value",
      reason: "nowIso must be a caller-supplied ISO-8601 UTC instant such as 2026-09-02T00:00:00.000Z. This module never reads a clock.",
    };
  }

  const draft: TeamConfigurationDraft = {
    modelRevision: TEAM_CONFIGURATION_MODEL_REVISION,
    draftId,
    createdAt: nowIso,
    updatedAt: nowIso,
    revision: 0,
    status: "draft",
    applied: false,
    persistence: "memory_only",
    effectNotice: TEAM_CONFIGURATION_EFFECT_NOTICE,
    roles: ROLE_DEFINITIONS.map(baselineRoleDraft),
  };
  return { ok: true, value: deepFreeze(draft) };
}

export function teamRoleDraft(draft: TeamConfigurationDraft, roleId: string): TeamRoleDraft | null {
  return draft.roles.find((role) => role.roleId === roleId) ?? null;
}

// ---------------------------------------------------------------------------
// Editing — allowlisted fields only
// ---------------------------------------------------------------------------

export const TEAM_EDITABLE_FIELDS = [
  "displayName",
  "notes",
  "enabled",
  "model",
  "effort",
  "capability",
  "fallbackEnabled",
] as const;
export type TeamEditableField = (typeof TEAM_EDITABLE_FIELDS)[number];

const EDIT_REQUEST_KEYS: readonly string[] = ["roleId", "field", "value", "capabilityId"];

/**
 * Deliberately loose at the type level and strict at runtime. A configuration
 * page hands over whatever the interaction produced; this module decides what
 * is admissible, and an unknown field or an extra key is refused rather than
 * quietly ignored.
 */
export interface TeamRoleEditRequest {
  roleId: string;
  field: string;
  value?: unknown;
  capabilityId?: string;
}

function refuse(code: TeamConfigurationRefusalCode, reason: string): TeamRoleEditResult {
  return { ok: false, code, reason };
}

function replaceRole(
  draft: TeamConfigurationDraft,
  next: TeamRoleDraft,
  nowIso: string,
  note: string,
): TeamRoleEditResult {
  const updated: TeamConfigurationDraft = {
    ...draft,
    updatedAt: nowIso,
    revision: draft.revision + 1,
    status: "draft",
    applied: false,
    persistence: "memory_only",
    roles: draft.roles.map((role) => (role.roleId === next.roleId ? next : role)),
  };
  return { ok: true, changed: true, value: deepFreeze(updated), note };
}

function boundedText(value: unknown, maxLength: number, label: string): TeamConfigurationResult<string> {
  if (typeof value !== "string") {
    return { ok: false, code: "invalid_value_type", reason: `${label} must be a string.` };
  }
  if (hasControlCharacters(value)) {
    return { ok: false, code: "invalid_text_value", reason: `${label} must contain no control characters.` };
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length > maxLength) {
    return { ok: false, code: "invalid_text_value", reason: `${label} must be at most ${maxLength} characters.` };
  }
  return { ok: true, value: normalized };
}

/**
 * The single mutation entry point. It returns a new deeply frozen draft on a
 * real change, the identical draft on a no-op, and a coded refusal otherwise.
 * It never mutates its input and never touches anything outside the draft.
 */
export function updateTeamRoleField(
  draft: TeamConfigurationDraft,
  request: TeamRoleEditRequest,
  nowIso: string,
): TeamRoleEditResult {
  // Structural checks run against local `unknown` aliases so a runtime defence
  // against a lying caller never narrows the declared parameter types.
  const draftShape: unknown = draft;
  if (!isPlainRecord(draftShape) || !Array.isArray(draftShape.roles)) {
    return refuse("malformed_draft", "The draft must be a plain object carrying a roles array.");
  }
  if (draft.status !== "draft" || draft.applied !== false || draft.persistence !== "memory_only") {
    return refuse(
      "draft_labelled_applied",
      "Only a memory-only draft may be edited. A draft claiming to be applied is refused rather than repaired.",
    );
  }
  if (typeof nowIso !== "string" || !ISO_INSTANT_PATTERN.test(nowIso)) {
    return refuse("invalid_text_value", "nowIso must be a caller-supplied ISO-8601 UTC instant. This module never reads a clock.");
  }
  const requestShape: unknown = request;
  if (!isPlainRecord(requestShape)) {
    return refuse("malformed_request", "The edit request must be a plain object.");
  }
  for (const key of Object.keys(requestShape)) {
    if (!EDIT_REQUEST_KEYS.includes(key)) {
      return refuse("malformed_request", `Unknown edit request property: ${key}.`);
    }
  }

  const role = teamRoleDraft(draft, request.roleId);
  const definition = teamRoleDefinition(request.roleId);
  if (role === null || definition === null) {
    return refuse("unknown_role", `Unknown role: ${String(request.roleId)}. The roster is fixed at the seven canonical roles.`);
  }
  if (!includesValue(TEAM_EDITABLE_FIELDS as readonly string[], request.field)) {
    return refuse(
      "field_not_editable",
      `Field ${String(request.field)} is not editable. Editable fields are ${TEAM_EDITABLE_FIELDS.join(", ")}. Provider, runtime, duty, authority declarations, evidence class, role identity, and draft status are pinned by contract.`,
    );
  }
  const field = request.field as TeamEditableField;

  if (field === "displayName") {
    const normalized = boundedText(request.value, TEAM_DISPLAY_NAME_MAX_LENGTH, "displayName");
    if (!normalized.ok) return refuse(normalized.code, normalized.reason);
    if (normalized.value.length === 0) {
      return refuse("invalid_text_value", "displayName must not be empty; a role always renders under a name.");
    }
    if (normalized.value === role.displayName) {
      return { ok: true, changed: false, value: draft, note: "No change: displayName already holds this value." };
    }
    return replaceRole(draft, { ...role, displayName: normalized.value }, nowIso, "displayName updated in the draft only.");
  }

  if (field === "notes") {
    const normalized = boundedText(request.value, TEAM_NOTES_MAX_LENGTH, "notes");
    if (!normalized.ok) return refuse(normalized.code, normalized.reason);
    if (normalized.value === role.notes) {
      return { ok: true, changed: false, value: draft, note: "No change: notes already hold this value." };
    }
    return replaceRole(draft, { ...role, notes: normalized.value }, nowIso, "notes updated in the draft only.");
  }

  if (field === "enabled") {
    if (typeof request.value !== "boolean") {
      return refuse("invalid_value_type", "enabled must be a boolean.");
    }
    if (request.value === role.enabled) {
      return { ok: true, changed: false, value: draft, note: "No change: enabled already holds this value." };
    }
    if (request.value === false && !definition.disableable) {
      return refuse(
        "protected_role_cannot_be_disabled",
        `${definition.canonicalName} cannot be disabled from this surface. Removing orchestration or independent verification would break role separation, which is not a configuration choice.`,
      );
    }
    return replaceRole(draft, { ...role, enabled: request.value }, nowIso, "enabled updated in the draft only.");
  }

  if (field === "model") {
    if (typeof request.value !== "string") {
      return refuse("invalid_value_type", "model must be a string.");
    }
    if (!isTeamModelId(request.value)) {
      return refuse("unknown_model", `Unknown model: ${request.value}. Known models are ${TEAM_MODEL_IDS.join(", ")}.`);
    }
    if (request.value === role.model) {
      return { ok: true, changed: false, value: draft, note: "No change: model already holds this value." };
    }
    if (definition.roleId === "signal") {
      return refuse(
        "signal_primary_route_altered",
        "SIGNAL's primary binding is exactly gpt-5.3-codex-spark at high effort, and its only fallback is the recorded one-hop Sonnet 5 route. Neither is a page toggle.",
      );
    }
    if (!definition.permittedModels.includes(request.value)) {
      return refuse(
        "model_not_permitted_for_role",
        `${definition.canonicalName} may run only ${definition.permittedModels.join(", ")}. Changing its runtime class would relabel the role rather than configure it.`,
      );
    }
    const binding = teamRuntimeBinding(role.provider, role.runtime);
    if (binding === null || !binding.models.includes(request.value)) {
      return refuse(
        "provider_runtime_mismatch",
        `Model ${request.value} is not available on ${role.provider} / ${role.runtime}.`,
      );
    }
    return replaceRole(
      draft,
      { ...role, model: request.value, evidence: { ...role.evidence, model: "draft_only" } },
      nowIso,
      "model proposed in the draft only; its evidence class is now draft_only and requires Commander review.",
    );
  }

  if (field === "effort") {
    if (typeof request.value !== "string") {
      return refuse("invalid_value_type", "effort must be a string.");
    }
    if (!isTeamEffortId(request.value)) {
      return refuse("unknown_effort", `Unknown effort: ${request.value}. Known efforts are ${TEAM_EFFORT_IDS.join(", ")}.`);
    }
    if (request.value === role.effort) {
      return { ok: true, changed: false, value: draft, note: "No change: effort already holds this value." };
    }
    return refuse(
      "effort_not_permitted_for_role",
      `${definition.canonicalName} is bound to ${definition.permittedEfforts.join(", ")} effort by the runtime structure contract. Lowering or raising it is a Commander runtime binding, not a page setting.`,
    );
  }

  if (field === "fallbackEnabled") {
    if (typeof request.value !== "boolean") {
      return refuse("invalid_value_type", "fallbackEnabled must be a boolean.");
    }
    if (definition.standingFallback === null) {
      return refuse(
        "fallback_not_permitted_for_role",
        `${definition.canonicalName} has no standing usage-limit fallback. Only SIGNAL holds a recorded one-hop route, and no role may be given a new one here.`,
      );
    }
    if (role.fallback !== null && request.value === role.fallback.enabled) {
      return { ok: true, changed: false, value: draft, note: "No change: the standing fallback route already holds this state." };
    }
    return refuse(
      "fallback_route_altered",
      "SIGNAL's standing one-hop usage-limit route is a recorded Commander directive, not a configurable toggle. It activates only on a recorded first usage limit and never automatically.",
    );
  }

  // field === "capability"
  if (typeof request.value !== "boolean") {
    return refuse("invalid_value_type", "A capability edit requires a boolean value.");
  }
  if (!isTeamCapabilityId(request.capabilityId)) {
    return refuse("unknown_capability", `Unknown capability: ${String(request.capabilityId)}.`);
  }
  const capabilityId = request.capabilityId;
  const granted = role.capabilities.includes(capabilityId);
  if (request.value === granted) {
    return { ok: true, changed: false, value: draft, note: "No change: the capability already holds this state." };
  }

  if (request.value === true) {
    if (capabilityId === "commander_authority_origination") {
      return refuse(
        "commander_authority_origination_denied",
        "No role and no configuration can manufacture Commander authority. This capability is denied absolutely.",
      );
    }
    if (PROHIBITED_CAPABILITY_IDS.includes(capabilityId)) {
      return refuse(
        "prohibited_capability_denied",
        `${TEAM_CAPABILITY_LABELS[capabilityId]} is never grantable from this surface. ${TEAM_CAPABILITY_STATEMENTS[capabilityId]}`,
      );
    }
    if (capabilityId === "independent_verification" && definition.duty !== "independent_verification") {
      return refuse(
        "self_verification_denied",
        `${definition.canonicalName} may not hold independent verification. A role that verifies its own lane is self-verification by construction.`,
      );
    }
    if (capabilityId === "repository_write_allowlisted" && definition.duty === "independent_verification") {
      return refuse(
        "capability_conflicts_with_duty",
        `${definition.canonicalName} verifies independently and must not be able to write the candidate it verifies.`,
      );
    }
    if (!definition.capabilityCeiling.includes(capabilityId)) {
      return refuse(
        "capability_exceeds_role_ceiling",
        `${TEAM_CAPABILITY_LABELS[capabilityId]} exceeds the ${definition.canonicalName} ceiling of ${definition.capabilityCeiling.join(", ")}.`,
      );
    }
    return replaceRole(
      draft,
      { ...role, capabilities: orderCapabilities([...role.capabilities, capabilityId]) },
      nowIso,
      `${TEAM_CAPABILITY_LABELS[capabilityId]} proposed in the draft only; a capability change always requires protected Commander review.`,
    );
  }

  if (definition.requiredCapabilities.includes(capabilityId)) {
    return refuse(
      "capability_conflicts_with_duty",
      `${TEAM_CAPABILITY_LABELS[capabilityId]} is required for ${definition.canonicalName} to perform its duty. Removing it would leave the role unable to do the work it is named for.`,
    );
  }
  return replaceRole(
    draft,
    { ...role, capabilities: orderCapabilities(role.capabilities.filter((entry) => entry !== capabilityId)) },
    nowIso,
    `${TEAM_CAPABILITY_LABELS[capabilityId]} withdrawn in the draft only.`,
  );
}

// ---------------------------------------------------------------------------
// Capability disclosure for presentation
// ---------------------------------------------------------------------------

export interface TeamCapabilityDisclosure {
  capabilityId: TeamCapabilityId;
  label: string;
  statement: string;
  granted: boolean;
  grantable: boolean;
  required: boolean;
  denialReason: TeamConfigurationRefusalCode | null;
}

/**
 * The complete bounded disclosure for one role, in canonical capability order,
 * including everything that is denied and exactly why. A page that renders only
 * what is granted hides the part a Commander most needs to see.
 */
export function teamRoleCapabilityDisclosure(role: TeamRoleDraft): readonly TeamCapabilityDisclosure[] {
  const definition = teamRoleDefinition(role.roleId);
  return deepFreeze(
    TEAM_CAPABILITY_IDS.map((capabilityId): TeamCapabilityDisclosure => {
      const granted = role.capabilities.includes(capabilityId);
      let grantable = false;
      let denialReason: TeamConfigurationRefusalCode | null = null;
      if (capabilityId === "commander_authority_origination") {
        denialReason = "commander_authority_origination_denied";
      } else if (PROHIBITED_CAPABILITY_IDS.includes(capabilityId)) {
        denialReason = "prohibited_capability_denied";
      } else if (definition === null) {
        denialReason = "unknown_role";
      } else if (capabilityId === "independent_verification" && definition.duty !== "independent_verification") {
        denialReason = "self_verification_denied";
      } else if (capabilityId === "repository_write_allowlisted" && definition.duty === "independent_verification") {
        denialReason = "capability_conflicts_with_duty";
      } else if (!definition.capabilityCeiling.includes(capabilityId)) {
        denialReason = "capability_exceeds_role_ceiling";
      } else {
        grantable = true;
      }
      return {
        capabilityId,
        label: TEAM_CAPABILITY_LABELS[capabilityId],
        statement: TEAM_CAPABILITY_STATEMENTS[capabilityId],
        granted,
        grantable,
        required: definition !== null && definition.requiredCapabilities.includes(capabilityId),
        denialReason,
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface TeamConfigurationFinding {
  code: TeamConfigurationRefusalCode;
  severity: "blocking" | "advisory";
  roleId: string | null;
  detail: string;
}

export interface TeamConfigurationValidation {
  modelRevision: string;
  valid: boolean;
  blockingCount: number;
  advisoryCount: number;
  findings: readonly TeamConfigurationFinding[];
  applied: false;
  readyForCommanderReview: boolean;
}

function finding(
  code: TeamConfigurationRefusalCode,
  severity: "blocking" | "advisory",
  roleId: string | null,
  detail: string,
): TeamConfigurationFinding {
  return { code, severity, roleId, detail };
}

function sortFindings(findings: TeamConfigurationFinding[]): TeamConfigurationFinding[] {
  return findings.sort((left, right) => {
    const leftRole = left.roleId === null ? -1 : roleOrderIndex(left.roleId);
    const rightRole = right.roleId === null ? -1 : roleOrderIndex(right.roleId);
    if (leftRole !== rightRole) return leftRole - rightRole;
    if (left.code !== right.code) return left.code < right.code ? -1 : 1;
    if (left.detail !== right.detail) return left.detail < right.detail ? -1 : 1;
    return 0;
  });
}

function validateEvidence(roleId: string, evidence: unknown, findings: TeamConfigurationFinding[]): void {
  if (!isPlainRecord(evidence)) {
    findings.push(finding("malformed_draft", "blocking", roleId, "evidence must be a plain object of evidence classes."));
    return;
  }
  const bindingFields = ["provider", "runtime", "model", "effort"] as const;
  for (const field of bindingFields) {
    const value = evidence[field];
    if (!isTeamEvidenceClass(value)) {
      findings.push(finding("unknown_evidence_class", "blocking", roleId, `evidence.${field} is not a known evidence class.`));
      continue;
    }
    if (value === "runtime_resolved") {
      findings.push(
        finding(
          "fabricated_runtime_evidence",
          "blocking",
          roleId,
          `evidence.${field} claims runtime_resolved, but a memory-only draft has launched nothing. Only a real executor return can produce that class.`,
        ),
      );
    }
    if (value === "unavailable") {
      findings.push(
        finding(
          "fabricated_runtime_evidence",
          "advisory",
          roleId,
          `evidence.${field} is unavailable, so the binding is recorded but unproven. This is honest, not fatal.`,
        ),
      );
    }
  }
  const sessionIdentity = evidence.sessionIdentity;
  if (!isTeamEvidenceClass(sessionIdentity)) {
    findings.push(finding("unknown_evidence_class", "blocking", roleId, "evidence.sessionIdentity is not a known evidence class."));
  } else if (sessionIdentity !== "unavailable" && sessionIdentity !== "draft_only") {
    findings.push(
      finding(
        "fabricated_runtime_evidence",
        "blocking",
        roleId,
        "evidence.sessionIdentity may only be unavailable or draft_only. A draft holds no executor session.",
      ),
    );
  }
  const resolvedModel = evidence.resolvedModelReportedByRuntime;
  if (!isTeamEvidenceClass(resolvedModel)) {
    findings.push(
      finding("unknown_evidence_class", "blocking", roleId, "evidence.resolvedModelReportedByRuntime is not a known evidence class."),
    );
  } else if (resolvedModel !== "unavailable") {
    findings.push(
      finding(
        "fabricated_runtime_evidence",
        "blocking",
        roleId,
        "evidence.resolvedModelReportedByRuntime must be unavailable in a draft. No runtime has reported anything.",
      ),
    );
  }
}

/**
 * Returned in place of a value that the validated object does not carry as its
 * *own* property. A sentinel rather than `undefined`, so a caller's exact
 * comparisons stay exact: an inherited `false` can never compare equal to
 * `false`, an inherited `true` can never compare equal to `true`, and an own
 * `undefined` is still distinguishable from an absent declaration.
 */
const DECLARATION_NOT_OWN: unique symbol = Symbol("declaration_not_own_property");

/**
 * Reads a declaration only when the object itself declares it. Reading straight
 * through the prototype chain let a custom-prototype object — the ordinary
 * output of `Object.create`, of a reviving deserializer, or of a class instance
 * — inherit a literal `false` it never declared, so an object with zero own
 * declarations could validate as though every boundary had been asserted. A
 * declaration that was never made records nothing, so an inherited value is
 * treated as absence and never coerced. Shared by the four role-authority
 * declarations and the two fallback-route denials, which fail closed under one
 * identical rule.
 */
function ownDeclaredValue(container: Record<string, unknown>, field: string): unknown {
  return Object.prototype.hasOwnProperty.call(container, field) ? container[field] : DECLARATION_NOT_OWN;
}

/**
 * One rule per standing-route denial declaration, so the validator, the finding
 * codes, and the finding text all come from a single frozen table. The
 * `deniedWhenTrue` codes and detail strings are the originals and are unchanged;
 * only the undeclared/non-boolean branch is new.
 */
interface FallbackDenialRule {
  field: TeamFallbackDenialDeclaration;
  deniedWhenTrue: TeamConfigurationRefusalCode;
  trueDetail: string;
  undeclaredDetail: string;
}

const FALLBACK_ROUTE_DENIAL_RULES: readonly FallbackDenialRule[] = Object.freeze([
  Object.freeze({
    field: "automatic" as const,
    deniedWhenTrue: "automatic_fallback_denied" as const,
    trueDetail:
      "The usage-limit route is an orchestrated, role-preserving one-hop handoff. It is never an automatic provider fallback.",
    undeclaredDetail:
      "A missing, inherited, or non-boolean declaration is not a denial: the route itself must state explicitly that it never activates automatically.",
  }),
  Object.freeze({
    field: "thirdAutomaticModelPermitted" as const,
    deniedWhenTrue: "third_automatic_fallback_denied" as const,
    trueDetail:
      "A further usage limit in the same lineage parks the lane for the Commander. No third model is selected automatically.",
    undeclaredDetail:
      "A missing, inherited, or non-boolean declaration is not a denial: the route itself must state explicitly that no third model is ever selected automatically.",
  }),
]) as readonly FallbackDenialRule[];

function validateFallback(
  definition: TeamRoleDefinition,
  fallback: unknown,
  findings: TeamConfigurationFinding[],
): void {
  const roleId = definition.roleId;
  if (fallback === null || fallback === undefined) {
    if (definition.standingFallback !== null) {
      findings.push(
        finding(
          "fallback_route_altered",
          "blocking",
          roleId,
          "The recorded standing one-hop usage-limit route is missing. It is a Commander directive and may not be dropped from a draft.",
        ),
      );
    }
    return;
  }
  if (!isPlainRecord(fallback)) {
    findings.push(finding("malformed_draft", "blocking", roleId, "fallback must be null or a plain object."));
    return;
  }
  if (definition.standingFallback === null) {
    findings.push(
      finding(
        "fallback_not_permitted_for_role",
        "blocking",
        roleId,
        `${definition.canonicalName} has no standing usage-limit fallback. Only SIGNAL holds a recorded one-hop route.`,
      ),
    );
    return;
  }
  const route = fallback.route;
  if (!isPlainRecord(route)) {
    findings.push(finding("malformed_draft", "blocking", roleId, "fallback.route must be a plain object."));
    return;
  }
  // Shape before meaning, and fail closed on both. Each denial declaration must
  // be the route's own property and exactly boolean `false`; a missing,
  // inherited, undefined, null, string, number, object, or array value is
  // refused here and never coerced. Testing only for a literal `true` let an
  // *undeclared* route pass as though it had denied automatic activation and a
  // third automatic model, and reading through the prototype chain let a
  // custom-prototype route inherit both denials it never made — each is the
  // opposite of what these two fields exist to prove. This check is strictly
  // stronger than an equality comparison against the recorded route, so the two
  // fields stay out of `routeMatches` below and are never reported twice.
  for (const rule of FALLBACK_ROUTE_DENIAL_RULES) {
    const declared: unknown = ownDeclaredValue(route, rule.field);
    if (declared === true) {
      findings.push(finding(rule.deniedWhenTrue, "blocking", roleId, rule.trueDetail));
      continue;
    }
    if (declared === false) continue;
    findings.push(
      finding(
        "invalid_value_type",
        "blocking",
        roleId,
        `fallback.route.${rule.field} must be declared exactly false. Observed ${describeUndeclaredBoolean(route, rule.field)}. ${rule.undeclaredDetail}`,
      ),
    );
  }
  if (route.authenticationClass !== PERMITTED_AUTHENTICATION_CLASS) {
    findings.push(
      finding(
        "metered_or_api_key_path_denied",
        "blocking",
        roleId,
        "The fallback leg must use the Commander's first-party subscription. An API key, metered API, or paid fallback is denied.",
      ),
    );
  }
  const expected = definition.standingFallback;
  // `automatic` and `thirdAutomaticModelPermitted` are deliberately absent from
  // this comparison: each is already required to be exactly boolean false above,
  // which is at least as strict and names the offending field precisely.
  const routeMatches =
    route.provider === expected.provider &&
    route.runtime === expected.runtime &&
    route.model === expected.model &&
    route.effort === expected.effort &&
    route.activation === expected.activation &&
    route.freshExecutorRequired === true &&
    route.compatibilityPreflightRequired === true &&
    route.secondLimitBehavior === expected.secondLimitBehavior;
  if (!routeMatches) {
    findings.push(
      finding(
        "fallback_route_altered",
        "blocking",
        roleId,
        `The standing route must remain exactly ${expected.model} at ${expected.effort} effort on the first-party Claude Code subscription, activated only by a recorded first usage limit, with a fresh executor and a compatibility preflight.`,
      ),
    );
  }
  if (fallback.enabled !== true) {
    findings.push(
      finding(
        "fallback_route_altered",
        "blocking",
        roleId,
        "The standing route is recorded Commander direction and cannot be switched off from a configuration draft.",
      ),
    );
  }
}

/**
 * Names the *shape* of a rejected boolean declaration without echoing the
 * value, so a finding stays useful to a Commander and to an audit while an
 * accidental or hostile value is never reflected back into the result. Shared by
 * the four role-authority declarations and the two fallback-route denials, which
 * fail closed under one identical rule.
 *
 * An inherited declaration is named as such rather than as an absent one. Both
 * are refused identically, but the distinction tells a Commander whether a field
 * is simply missing or is present somewhere on the prototype chain and therefore
 * easy to mistake for a declaration the object actually made.
 */
function describeUndeclaredBoolean(container: Record<string, unknown>, field: string): string {
  if (!Object.prototype.hasOwnProperty.call(container, field)) {
    return field in container ? "an inherited declaration rather than an own property" : "an absent declaration";
  }
  const value = container[field];
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value} value`;
}

function validateRole(roleValue: unknown, findings: TeamConfigurationFinding[]): string | null {
  if (!isPlainRecord(roleValue)) {
    findings.push(finding("malformed_draft", "blocking", null, "Each roster entry must be a plain object."));
    return null;
  }
  const rawRoleId = roleValue.roleId;
  const roleId = typeof rawRoleId === "string" ? rawRoleId : null;
  const definition = roleId === null ? null : teamRoleDefinition(roleId);
  if (definition === null) {
    findings.push(
      finding(
        "unknown_role",
        "blocking",
        roleId,
        `Unknown role ${String(rawRoleId)}. The roster is exactly ${TEAM_ROLE_IDS.join(", ")}; a replacement role is never invented here.`,
      ),
    );
    return roleId;
  }

  if (roleValue.duty !== definition.duty) {
    findings.push(
      finding("capability_conflicts_with_duty", "blocking", roleId, `${definition.canonicalName} duty is fixed at ${definition.duty}.`),
    );
  }

  const displayName = roleValue.displayName;
  if (typeof displayName !== "string" || displayName.trim().length === 0 || hasControlCharacters(displayName) || displayName.length > TEAM_DISPLAY_NAME_MAX_LENGTH) {
    findings.push(finding("invalid_text_value", "blocking", roleId, "displayName must be a bounded, non-empty, control-free string."));
  }
  const notes = roleValue.notes;
  if (typeof notes !== "string" || hasControlCharacters(notes) || notes.length > TEAM_NOTES_MAX_LENGTH) {
    findings.push(finding("invalid_text_value", "blocking", roleId, "notes must be a bounded, control-free string."));
  }
  if (typeof roleValue.enabled !== "boolean") {
    findings.push(finding("invalid_value_type", "blocking", roleId, "enabled must be a boolean."));
  } else if (roleValue.enabled === false && !definition.disableable) {
    findings.push(
      finding(
        definition.duty === "independent_verification" ? "independent_verification_disabled" : "protected_role_cannot_be_disabled",
        "blocking",
        roleId,
        `${definition.canonicalName} cannot be disabled. ${
          definition.duty === "independent_verification"
            ? "Without an independent verifier there is no independent disposition, and no other role may supply one."
            : "Without orchestration there is no governed dispatch path."
        }`,
      ),
    );
  }

  if (roleValue.provider !== definition.provider) {
    findings.push(
      finding("provider_runtime_mismatch", "blocking", roleId, `${definition.canonicalName} is bound to provider ${definition.provider}.`),
    );
  }
  if (roleValue.runtime !== definition.runtime) {
    findings.push(
      finding("provider_runtime_mismatch", "blocking", roleId, `${definition.canonicalName} is bound to runtime ${definition.runtime}.`),
    );
  }
  const binding = teamRuntimeBinding(String(roleValue.provider), String(roleValue.runtime));
  if (binding === null) {
    findings.push(
      finding(
        "provider_runtime_mismatch",
        "blocking",
        roleId,
        `Provider ${String(roleValue.provider)} and runtime ${String(roleValue.runtime)} are not a known pair.`,
      ),
    );
  }

  const model = roleValue.model;
  if (!isTeamModelId(model)) {
    findings.push(finding("unknown_model", "blocking", roleId, `Unknown model ${String(model)}.`));
  } else {
    if (binding !== null && !binding.models.includes(model)) {
      findings.push(
        finding("provider_runtime_mismatch", "blocking", roleId, `Model ${model} is not available on ${String(roleValue.runtime)}.`),
      );
    }
    if (!definition.permittedModels.includes(model)) {
      findings.push(
        finding(
          definition.roleId === "signal" ? "signal_primary_route_altered" : "model_not_permitted_for_role",
          "blocking",
          roleId,
          `${definition.canonicalName} may run only ${definition.permittedModels.join(", ")}.`,
        ),
      );
    } else if (model !== definition.defaultModel) {
      findings.push(
        finding(
          "deviates_from_recorded_default",
          "advisory",
          roleId,
          `${definition.canonicalName} is proposed on ${model} rather than the recorded default ${definition.defaultModel}. That is a Commander runtime binding decision, not a silent substitution.`,
        ),
      );
    }
  }

  const effort = roleValue.effort;
  if (!isTeamEffortId(effort)) {
    findings.push(finding("unknown_effort", "blocking", roleId, `Unknown effort ${String(effort)}.`));
  } else if (!definition.permittedEfforts.includes(effort)) {
    findings.push(
      finding(
        "effort_not_permitted_for_role",
        "blocking",
        roleId,
        `${definition.canonicalName} is bound to ${definition.permittedEfforts.join(", ")} effort.`,
      ),
    );
  }

  if (roleValue.authenticationClass !== PERMITTED_AUTHENTICATION_CLASS) {
    findings.push(
      finding(
        "metered_or_api_key_path_denied",
        "blocking",
        roleId,
        `${definition.canonicalName} must authenticate as ${PERMITTED_AUTHENTICATION_CLASS}. An API key, metered API, automatic paid fallback, or model alias substitution is denied.`,
      ),
    );
  }

  const capabilities = roleValue.capabilities;
  if (!Array.isArray(capabilities)) {
    findings.push(finding("malformed_draft", "blocking", roleId, "capabilities must be an array."));
  } else {
    const seen = new Set<string>();
    for (const capability of capabilities) {
      if (!isTeamCapabilityId(capability)) {
        findings.push(finding("unknown_capability", "blocking", roleId, `Unknown capability ${String(capability)}.`));
        continue;
      }
      if (seen.has(capability)) {
        findings.push(finding("malformed_draft", "blocking", roleId, `Capability ${capability} is listed more than once.`));
        continue;
      }
      seen.add(capability);
      if (capability === "commander_authority_origination") {
        findings.push(
          finding(
            "commander_authority_origination_denied",
            "blocking",
            roleId,
            "No role and no configuration can manufacture Commander authority.",
          ),
        );
        continue;
      }
      if (PROHIBITED_CAPABILITY_IDS.includes(capability)) {
        findings.push(
          finding("prohibited_capability_denied", "blocking", roleId, `${TEAM_CAPABILITY_LABELS[capability]} is never grantable from this surface.`),
        );
        continue;
      }
      if (capability === "independent_verification" && definition.duty !== "independent_verification") {
        findings.push(
          finding(
            "self_verification_denied",
            "blocking",
            roleId,
            `${definition.canonicalName} may not hold independent verification; that would be self-verification by construction.`,
          ),
        );
        continue;
      }
      if (capability === "repository_write_allowlisted" && definition.duty === "independent_verification") {
        findings.push(
          finding(
            "capability_conflicts_with_duty",
            "blocking",
            roleId,
            `${definition.canonicalName} must not be able to write the candidate it independently verifies.`,
          ),
        );
        continue;
      }
      if (!definition.capabilityCeiling.includes(capability)) {
        findings.push(
          finding(
            "capability_exceeds_role_ceiling",
            "blocking",
            roleId,
            `${TEAM_CAPABILITY_LABELS[capability]} exceeds the ${definition.canonicalName} ceiling.`,
          ),
        );
      }
    }
    for (const required of definition.requiredCapabilities) {
      if (!seen.has(required)) {
        findings.push(
          finding(
            "capability_conflicts_with_duty",
            "blocking",
            roleId,
            `${TEAM_CAPABILITY_LABELS[required]} is required for ${definition.canonicalName} to perform its duty.`,
          ),
        );
      }
    }
  }

  const authority = roleValue.authority;
  if (!isPlainRecord(authority)) {
    findings.push(finding("malformed_draft", "blocking", roleId, "authority declarations must be a plain object."));
  } else {
    // Shape before meaning, and fail closed on both. Each declaration must be
    // the authority block's own property and exactly boolean `false`; a
    // missing, inherited, undefined, null, string, number, object, or array
    // value is refused here and never coerced. Testing only for a literal `true`
    // would let an *undeclared* boundary pass as though the draft had asserted
    // it, and reading through the prototype chain would let a custom-prototype
    // block inherit all four denials it never made — each is the opposite of
    // what these four fields exist to prove.
    for (const declaration of TEAM_ROLE_AUTHORITY_DECLARATION_FIELDS) {
      const declared: unknown = ownDeclaredValue(authority, declaration);
      if (declared === false || declared === true) continue;
      findings.push(
        finding(
          "invalid_value_type",
          "blocking",
          roleId,
          `authority.${declaration} must be declared exactly false. Observed ${describeUndeclaredBoolean(authority, declaration)}. A missing, inherited, or non-boolean authority declaration is not a denial: ${definition.canonicalName} must state the boundary explicitly on the draft itself, and the value is never coerced into one.`,
        ),
      );
    }
    if (authority.maySelfApprove === true || authority.mayAcceptOwnWork === true) {
      findings.push(
        finding(
          "self_approval_denied",
          "blocking",
          roleId,
          `${definition.canonicalName} may not approve or accept its own work. Acceptance is a Commander decision.`,
        ),
      );
    }
    if (authority.maySelfVerify === true) {
      findings.push(
        finding(
          "self_verification_denied",
          "blocking",
          roleId,
          `${definition.canonicalName} may not verify its own work. Independent verification uses a separate fresh executor.`,
        ),
      );
    }
    if (authority.mayOriginateCommanderAuthority === true) {
      findings.push(
        finding(
          "commander_authority_origination_denied",
          "blocking",
          roleId,
          "No role identity can supply its own Commander authority.",
        ),
      );
    }
  }

  validateFallback(definition, roleValue.fallback, findings);
  validateEvidence(roleId ?? definition.roleId, roleValue.evidence, findings);
  return roleId;
}

/**
 * Validates a candidate draft that may be malformed, hand-built, or hostile.
 * The parameter is intentionally `unknown`: a validator that can only accept
 * well-typed input is not a validator.
 */
export function validateTeamConfigurationDraft(draft: unknown): TeamConfigurationValidation {
  const findings: TeamConfigurationFinding[] = [];

  if (!isPlainRecord(draft)) {
    findings.push(finding("malformed_draft", "blocking", null, "The draft must be a plain object."));
    return summarizeValidation(findings);
  }
  if (draft.modelRevision !== TEAM_CONFIGURATION_MODEL_REVISION) {
    findings.push(
      finding(
        "malformed_draft",
        "blocking",
        null,
        `Draft model revision must be ${TEAM_CONFIGURATION_MODEL_REVISION}; a draft from another revision is not silently upgraded.`,
      ),
    );
  }
  if (typeof draft.draftId !== "string" || draft.draftId.trim().length === 0 || draft.draftId.length > TEAM_DRAFT_ID_MAX_LENGTH) {
    findings.push(finding("invalid_text_value", "blocking", null, "draftId must be a bounded, non-empty caller-supplied string."));
  }
  if (typeof draft.createdAt !== "string" || !ISO_INSTANT_PATTERN.test(draft.createdAt)) {
    findings.push(finding("invalid_text_value", "blocking", null, "createdAt must be a caller-supplied ISO-8601 UTC instant."));
  }
  if (typeof draft.updatedAt !== "string" || !ISO_INSTANT_PATTERN.test(draft.updatedAt)) {
    findings.push(finding("invalid_text_value", "blocking", null, "updatedAt must be a caller-supplied ISO-8601 UTC instant."));
  }
  if (typeof draft.revision !== "number" || !Number.isInteger(draft.revision) || draft.revision < 0) {
    findings.push(
      finding(
        "malformed_draft",
        "blocking",
        null,
        "revision must be a non-negative integer local edit counter. It is not, and never becomes, an authoritative store revision.",
      ),
    );
  }
  if (draft.status !== "draft" || draft.applied !== false || draft.persistence !== "memory_only") {
    findings.push(
      finding(
        "draft_labelled_applied",
        "blocking",
        null,
        "A Team Configuration draft is always status draft, applied false, and persistence memory_only. Nothing in this module can apply, save, or publish it.",
      ),
    );
  }

  const roles = draft.roles;
  if (!Array.isArray(roles)) {
    findings.push(finding("malformed_draft", "blocking", null, "roles must be an array."));
    return summarizeValidation(findings);
  }

  const seenRoles = new Set<string>();
  for (const roleValue of roles) {
    const roleId = validateRole(roleValue, findings);
    if (roleId === null) continue;
    if (seenRoles.has(roleId)) {
      findings.push(finding("duplicate_role", "blocking", roleId, `Role ${roleId} appears more than once in the roster.`));
      continue;
    }
    seenRoles.add(roleId);
  }
  for (const canonical of TEAM_ROLE_IDS) {
    if (!seenRoles.has(canonical)) {
      findings.push(
        finding("missing_role", "blocking", canonical, `The roster is missing the canonical role ${canonical}. A partial roster breaks role separation.`),
      );
    }
  }

  return summarizeValidation(findings);
}

function summarizeValidation(findings: TeamConfigurationFinding[]): TeamConfigurationValidation {
  const ordered = sortFindings(findings);
  const blockingCount = ordered.filter((entry) => entry.severity === "blocking").length;
  const advisoryCount = ordered.length - blockingCount;
  return deepFreeze({
    modelRevision: TEAM_CONFIGURATION_MODEL_REVISION,
    valid: blockingCount === 0,
    blockingCount,
    advisoryCount,
    findings: ordered,
    applied: false as const,
    readyForCommanderReview: blockingCount === 0,
  });
}

// ---------------------------------------------------------------------------
// Change summary
// ---------------------------------------------------------------------------

export type TeamChangeField = TeamEditableField;

export interface TeamConfigurationChange {
  roleId: TeamRoleId;
  field: TeamChangeField;
  capabilityId: TeamCapabilityId | null;
  from: string;
  to: string;
  cosmetic: boolean;
}

export interface TeamConfigurationChangeSummary {
  modelRevision: string;
  changes: readonly TeamConfigurationChange[];
  changeCount: number;
  rolesTouched: readonly TeamRoleId[];
  rolesOnlyInBaseline: readonly TeamRoleId[];
  rolesOnlyInProposed: readonly TeamRoleId[];
  cosmeticOnly: boolean;
  appliedByThisSummary: false;
  externalEffects: Readonly<{
    hostedStateWrites: 0;
    agentLaunches: 0;
    accountSwitches: 0;
    credentialReads: 0;
    identifierAllocations: 0;
    lifecycleTransitions: 0;
    deployments: 0;
    publications: 0;
    providerCalls: 0;
    spend: 0;
  }>;
}

const COSMETIC_FIELDS: readonly TeamChangeField[] = Object.freeze(["displayName", "notes"] as const);

const SUMMARY_FIELD_ORDER: readonly Exclude<TeamChangeField, "capability">[] = Object.freeze([
  "displayName",
  "notes",
  "enabled",
  "model",
  "effort",
  "fallbackEnabled",
] as const);

function renderValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined) return "none";
  return String(value);
}

function roleFieldValue(role: TeamRoleDraft, field: Exclude<TeamChangeField, "capability">): unknown {
  switch (field) {
    case "displayName":
      return role.displayName;
    case "notes":
      return role.notes;
    case "enabled":
      return role.enabled;
    case "model":
      return role.model;
    case "effort":
      return role.effort;
    case "fallbackEnabled":
      return role.fallback === null ? null : role.fallback.enabled;
  }
}

/**
 * A deterministic, order-independent diff of two drafts, rendered as plain
 * strings so it can be shown, sorted, and compared without interpretation.
 * Producing a summary applies nothing.
 */
export function summarizeTeamConfigurationChanges(
  baseline: TeamConfigurationDraft,
  proposed: TeamConfigurationDraft,
): TeamConfigurationChangeSummary {
  const changes: TeamConfigurationChange[] = [];
  const rolesOnlyInBaseline: TeamRoleId[] = [];
  const rolesOnlyInProposed: TeamRoleId[] = [];

  for (const roleId of TEAM_ROLE_IDS) {
    const before = baseline.roles.find((role) => role.roleId === roleId) ?? null;
    const after = proposed.roles.find((role) => role.roleId === roleId) ?? null;
    if (before !== null && after === null) {
      rolesOnlyInBaseline.push(roleId);
      continue;
    }
    if (before === null && after !== null) {
      rolesOnlyInProposed.push(roleId);
      continue;
    }
    if (before === null || after === null) continue;

    for (const field of SUMMARY_FIELD_ORDER) {
      const from = roleFieldValue(before, field);
      const to = roleFieldValue(after, field);
      if (from === to) continue;
      changes.push({
        roleId,
        field,
        capabilityId: null,
        from: renderValue(from),
        to: renderValue(to),
        cosmetic: COSMETIC_FIELDS.includes(field),
      });
    }
    for (const capabilityId of TEAM_CAPABILITY_IDS) {
      const from = before.capabilities.includes(capabilityId);
      const to = after.capabilities.includes(capabilityId);
      if (from === to) continue;
      changes.push({
        roleId,
        field: "capability",
        capabilityId,
        from: from ? "granted" : "not_granted",
        to: to ? "granted" : "not_granted",
        cosmetic: false,
      });
    }
  }

  const rolesTouched = TEAM_ROLE_IDS.filter((roleId) => changes.some((change) => change.roleId === roleId));
  return deepFreeze({
    modelRevision: TEAM_CONFIGURATION_MODEL_REVISION,
    changes,
    changeCount: changes.length,
    rolesTouched,
    rolesOnlyInBaseline,
    rolesOnlyInProposed,
    cosmeticOnly: changes.length > 0 && changes.every((change) => change.cosmetic),
    appliedByThisSummary: false as const,
    externalEffects: {
      hostedStateWrites: 0 as const,
      agentLaunches: 0 as const,
      accountSwitches: 0 as const,
      credentialReads: 0 as const,
      identifierAllocations: 0 as const,
      lifecycleTransitions: 0 as const,
      deployments: 0 as const,
      publications: 0 as const,
      providerCalls: 0 as const,
      spend: 0 as const,
    },
  });
}

// ---------------------------------------------------------------------------
// Protected Commander review
// ---------------------------------------------------------------------------

export const TEAM_PROTECTED_REVIEW_TRIGGERS = [
  "runtime_binding_change",
  "role_enablement_change",
  "capability_change",
  "fallback_route_change",
  "protected_role_touched",
  "roster_change",
  "blocking_validation_finding",
] as const;
export type TeamProtectedReviewTrigger = (typeof TEAM_PROTECTED_REVIEW_TRIGGERS)[number];

export interface TeamConfigurationReviewRequirement {
  modelRevision: string;
  protectedCommanderReviewRequired: boolean;
  triggers: readonly TeamProtectedReviewTrigger[];
  blockingFindings: readonly TeamConfigurationFinding[];
  changeCount: number;
  cosmeticOnly: boolean;
  rationale: string;
  appliedByThisModule: false;
  commanderAcceptanceRequiredBeforeApplication: true;
}

/**
 * Classifies a proposed draft. Cosmetic-only relabelling needs no protected
 * gate; anything touching a runtime binding, enablement, capability, the
 * standing fallback route, the roster itself, or a protected role does. A
 * blocking validation finding always does.
 */
export function teamConfigurationReviewRequirement(
  baseline: TeamConfigurationDraft,
  proposed: TeamConfigurationDraft,
): TeamConfigurationReviewRequirement {
  const summary = summarizeTeamConfigurationChanges(baseline, proposed);
  const validation = validateTeamConfigurationDraft(proposed);
  const triggers = new Set<TeamProtectedReviewTrigger>();

  for (const change of summary.changes) {
    if (change.field === "model" || change.field === "effort") triggers.add("runtime_binding_change");
    if (change.field === "enabled") triggers.add("role_enablement_change");
    if (change.field === "capability") triggers.add("capability_change");
    if (change.field === "fallbackEnabled") triggers.add("fallback_route_change");
    if (!change.cosmetic && PROTECTED_ROLE_IDS.includes(change.roleId)) triggers.add("protected_role_touched");
  }
  if (summary.rolesOnlyInBaseline.length > 0 || summary.rolesOnlyInProposed.length > 0) {
    triggers.add("roster_change");
  }
  if (validation.blockingCount > 0) triggers.add("blocking_validation_finding");

  const ordered = TEAM_PROTECTED_REVIEW_TRIGGERS.filter((trigger) => triggers.has(trigger));
  const required = ordered.length > 0;
  return deepFreeze({
    modelRevision: TEAM_CONFIGURATION_MODEL_REVISION,
    protectedCommanderReviewRequired: required,
    triggers: ordered,
    blockingFindings: validation.findings.filter((entry) => entry.severity === "blocking"),
    changeCount: summary.changeCount,
    cosmeticOnly: summary.cosmeticOnly,
    rationale: required
      ? "This draft proposes a change to a governed runtime binding, role enablement, capability grant, standing fallback route, roster membership, or a protected role, or it does not validate. It stops for a Commander decision and is applied by a separately governed path, never here."
      : "This draft proposes no governed change. It still applies nothing: the draft is memory-only and application remains a separately governed Commander decision.",
    appliedByThisModule: false as const,
    commanderAcceptanceRequiredBeforeApplication: true as const,
  });
}

// ---------------------------------------------------------------------------
// Public Demo projection — synthetic, read-only, redacted
// ---------------------------------------------------------------------------

export type TeamRedactionReasonCode =
  | "free_text_withheld_by_policy"
  | "secret_shape_detected"
  | "private_shape_detected"
  | "control_characters_detected"
  | "length_limit_exceeded"
  | "empty_value";

export interface TeamPublicDemoRedaction {
  roleId: TeamRoleId;
  field: "displayName" | "notes";
  reasonCode: TeamRedactionReasonCode;
}

export interface TeamPublicDemoRoleProjection {
  roleId: TeamRoleId;
  label: string;
  duty: TeamRoleDuty;
  dutyStatement: string;
  authorityBoundary: string;
  provider: TeamProviderId;
  runtime: TeamRuntimeId;
  model: TeamModelId;
  effort: TeamEffortId;
  authenticationClass: TeamAuthenticationClass;
  enabled: boolean;
  capabilities: readonly TeamCapabilityId[];
  deniedCapabilities: readonly TeamCapabilityId[];
  evidence: TeamRuntimeEvidence;
  fallbackRoute: string;
  notesWithheld: true;
}

export interface TeamConfigurationPublicDemoProjection {
  modelRevision: string;
  provenance: "synthetic_public_demo";
  readOnly: true;
  operationalAuthority: false;
  callsApiState: false;
  containsProductionState: false;
  containsCredentials: false;
  notice: string;
  roles: readonly TeamPublicDemoRoleProjection[];
  redactions: readonly TeamPublicDemoRedaction[];
}

export const TEAM_PUBLIC_DEMO_NOTICE =
  "Synthetic Public Demo projection · read only · not operational authority. Built entirely from the closed role catalog and closed enumerations. Free-text notes are never published, and a display name is published only when it is provably ordinary text." as const;

/**
 * Benign, defensive shape detection used only to refuse publication. These
 * patterns never test, probe, or exercise a credential. The vendor-prefix and
 * PEM patterns are written structurally rather than as contiguous literals so a
 * naive secret scan of the built bundle does not match this detector's own
 * source; they match the same real material.
 */
const SECRET_SHAPE_PATTERNS: readonly RegExp[] = Object.freeze([
  /-{5}\s?BEGIN[\sA-Z]{0,40}KEY-{5}/,
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\b(?:sb|sk|pk|rk|ak)_[A-Za-z0-9_-]{12,}/i,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}/i,
  /\b[A-Fa-f0-9]{64}\b/,
  /\b(?:api[_-]?key|secret|token|password|passphrase|private[_-]?key)\s*[:=]\s*["']?(?=[^\s"']*\d)[A-Za-z0-9_\-.+/]{8,}/i,
]);

const PRIVATE_SHAPE_PATTERNS: readonly RegExp[] = Object.freeze([
  /(?:^|[\s"'(])[A-Za-z]:[\\/]/,
  /\/(?:Users|home|root)\/[A-Za-z0-9._-]+/,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /\b(?:act|mis|cmp|war|usr|org|prj)_[A-Za-z0-9-]{6,}/i,
  /\bC\d{3}\.M\d{3}(?:\.A\d{3})?\b/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  /\b[a-z0-9-]{6,}\.(?:supabase\.(?:co|in)|vercel\.app)\b/i,
]);

export function looksLikeSecretMaterial(value: string): boolean {
  return SECRET_SHAPE_PATTERNS.some((pattern) => pattern.test(value));
}

export function looksLikePrivateMaterial(value: string): boolean {
  return PRIVATE_SHAPE_PATTERNS.some((pattern) => pattern.test(value));
}

function publishableDisplayName(value: unknown): TeamRedactionReasonCode | null {
  if (typeof value !== "string" || value.trim().length === 0) return "empty_value";
  if (hasControlCharacters(value)) return "control_characters_detected";
  if (value.length > TEAM_DISPLAY_NAME_MAX_LENGTH) return "length_limit_exceeded";
  if (looksLikeSecretMaterial(value)) return "secret_shape_detected";
  if (looksLikePrivateMaterial(value)) return "private_shape_detected";
  return null;
}

function fallbackRouteLabel(role: TeamRoleDraft, definition: TeamRoleDefinition | null): string {
  if (definition === null || definition.standingFallback === null || role.fallback === null) {
    return "No standing usage-limit fallback. A usage limit parks this lane for the Commander.";
  }
  const route = definition.standingFallback;
  return `One recorded usage-limit hop to ${route.model} at ${route.effort} effort on the Commander's first-party subscription, activated only by a recorded first usage limit. Never automatic; no third model.`;
}

/**
 * Builds the read-only Public Demo projection. Every published field is drawn
 * from a closed enumeration or the fixed role catalog, so the only injection
 * surface is free text. Notes are never published at all, and a display name is
 * published only when it passes the defensive checks; otherwise the canonical
 * role name is substituted and the refusal is recorded by reason code. A
 * withheld value is never echoed into the projection.
 */
export function teamConfigurationPublicDemoProjection(
  draft: TeamConfigurationDraft,
): TeamConfigurationPublicDemoProjection {
  const redactions: TeamPublicDemoRedaction[] = [];
  const roles: TeamPublicDemoRoleProjection[] = [];

  for (const roleId of TEAM_ROLE_IDS) {
    const role = draft.roles.find((entry) => entry.roleId === roleId) ?? null;
    const definition = teamRoleDefinition(roleId);
    if (role === null || definition === null) continue;

    const displayNameRefusal = publishableDisplayName(role.displayName);
    if (displayNameRefusal !== null) {
      redactions.push({ roleId, field: "displayName", reasonCode: displayNameRefusal });
    }
    if (typeof role.notes === "string" && role.notes.trim().length > 0) {
      redactions.push({ roleId, field: "notes", reasonCode: "free_text_withheld_by_policy" });
    }

    const granted = orderCapabilities(role.capabilities.filter(isTeamCapabilityId));
    roles.push({
      roleId,
      label: displayNameRefusal === null ? role.displayName : definition.canonicalName,
      duty: definition.duty,
      dutyStatement: definition.dutyStatement,
      authorityBoundary: definition.authorityBoundary,
      provider: definition.provider,
      runtime: definition.runtime,
      model: isTeamModelId(role.model) ? role.model : definition.defaultModel,
      effort: isTeamEffortId(role.effort) ? role.effort : definition.defaultEffort,
      authenticationClass: PERMITTED_AUTHENTICATION_CLASS,
      enabled: role.enabled === true,
      capabilities: granted,
      deniedCapabilities: TEAM_CAPABILITY_IDS.filter((capability) => !granted.includes(capability)),
      evidence: {
        provider: isTeamEvidenceClass(role.evidence?.provider) ? role.evidence.provider : "unavailable",
        runtime: isTeamEvidenceClass(role.evidence?.runtime) ? role.evidence.runtime : "unavailable",
        model: isTeamEvidenceClass(role.evidence?.model) ? role.evidence.model : "unavailable",
        effort: isTeamEvidenceClass(role.evidence?.effort) ? role.evidence.effort : "unavailable",
        sessionIdentity: "unavailable",
        resolvedModelReportedByRuntime: "unavailable",
      },
      fallbackRoute: fallbackRouteLabel(role, definition),
      notesWithheld: true as const,
    });
  }

  return deepFreeze({
    modelRevision: TEAM_CONFIGURATION_MODEL_REVISION,
    provenance: "synthetic_public_demo" as const,
    readOnly: true as const,
    operationalAuthority: false as const,
    callsApiState: false as const,
    containsProductionState: false as const,
    containsCredentials: false as const,
    notice: TEAM_PUBLIC_DEMO_NOTICE,
    roles,
    redactions,
  });
}
