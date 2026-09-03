/** Pure configuration preferences. No storage, provider calls, runtime launch or authority. */
import type { CanonicalRoleId, RoleIconChoice } from "../domain/types.js";
import { capabilityClasses, looksLikePrivateMaterial, looksLikeSecretMaterial } from "../presentation/agentConfiguration.js";
import type { CapabilityClassId } from "../presentation/agentConfiguration.js";
import { teamRoleDefinition } from "./teamConfiguration.js";

export const CONFIGURATION_SCHEMA_VERSION = 1 as const;
export const governedConfigurationRoles = ["SARGE", "FORGE", "SIGNAL", "RECON", "SCRIBE", "QUARTERMASTER", "FIREWATCH"] as const;
export type ConfigurationRoleId = typeof governedConfigurationRoles[number];
export type ConfigurationAgentId = Exclude<CanonicalRoleId, "COMMANDER_PRODUCT_OWNER">;
export type ConfigurationGroupId = "operating_setup" | "agents" | "voice" | "optional_services" | "appearance";
export interface ConfigurationGuidance { what: string; why: string; outcome: string }
export const configurationGroups: readonly ({ id: ConfigurationGroupId; label: string } & ConfigurationGuidance)[] = [
  { id: "operating_setup", label: "Operating setup", what: "Choose where work is kept.", why: "Work needs a reliable home.", outcome: "A saved preference; connection checks remain separate." },
  { id: "agents", label: "Agents", what: "Choose subscription, model and effort for each working role.", why: "Match the work to the right capability.", outcome: "Saved choices do not launch an agent or change its duties." },
  { id: "voice", label: "Voice", what: "Choose how to talk with SARGE.", why: "Keep input clear and under your control.", outcome: "Review spoken words before confirming; typing always remains available." },
  { id: "optional_services", label: "Optional services", what: "Consider extra diagnostics and usage reporting.", why: "Only add services you need.", outcome: "Off by default; a preference never connects a service." },
  { id: "appearance", label: "Appearance", what: "Adjust themes, names and labels in the existing appearance editor.", why: "Make the workspace easier to recognize.", outcome: "Display changes do not change roles, permissions or readiness." },
];

export type ConfigurationProvider = "openai" | "anthropic";
export type ConfigurationSubscription = "codex_subscription" | "claude_code_subscription";
export type ConfigurationModel = "gpt-5.6-sol" | "gpt-5.6-terra" | "gpt-5.3-codex-spark" | "claude-opus-5" | "claude-sonnet-5";
export type ConfigurationEffort = "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
export interface RuntimePreference {
  provider: ConfigurationProvider;
  subscription: ConfigurationSubscription;
  model: ConfigurationModel;
  effort: ConfigurationEffort;
}
export interface AgentRuntimePreference extends RuntimePreference { roleId: ConfigurationRoleId }
export interface RuntimeOption extends ConfigurationGuidance {
  provider: ConfigurationProvider;
  subscription: ConfigurationSubscription;
  model: ConfigurationModel;
  efforts: readonly ConfigurationEffort[];
  label: string;
  availability: "not_checked";
}
const codexEfforts = ["low", "medium", "high", "xhigh", "max", "ultra"] as const;
export const runtimeOptions: readonly RuntimeOption[] = [
  ...(["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.3-codex-spark"] as const).map((model): RuntimeOption => ({
    provider: "openai", subscription: "codex_subscription", model,
    efforts: model === "gpt-5.3-codex-spark" ? ["low", "medium", "high", "xhigh"] : codexEfforts,
    label: `${model} · Codex subscription`, availability: "not_checked",
    what: "Use an existing first-party Codex subscription.", why: "Choose effort to suit the work.",
    outcome: "Save a preference only; availability and the actual executor must be checked separately.",
  })),
  ...(["claude-opus-5", "claude-sonnet-5"] as const).map((model): RuntimeOption => ({
    provider: "anthropic", subscription: "claude_code_subscription", model, efforts: ["max"],
    label: `${model} · Claude Code subscription`, availability: "not_checked",
    what: "Use an existing first-party Claude Code subscription.", why: "Keep the role on its approved subscription route.",
    outcome: "Save a preference only; the governed launcher still checks exact runtime and permissions.",
  })),
];
export const configurationEditionPolicy = {
  billing: "first_party_subscription_only", additionalSpend: 0, paidApi: "locked",
  keyEntry: false, automaticFallback: false,
  notice: "Metered APIs are a future option, locked in this edition. No key, account change or paid route is available here.",
} as const;

const sol: RuntimePreference = { provider: "openai", subscription: "codex_subscription", model: "gpt-5.6-sol", effort: "high" };
const opus: RuntimePreference = { provider: "anthropic", subscription: "claude_code_subscription", model: "claude-opus-5", effort: "max" };
export interface ConfigurationAgent extends ConfigurationGuidance {
  roleId: ConfigurationAgentId;
  icon: RoleIconChoice;
  avatarLabel: string;
  accentColor: string;
  runtimeSelectable: boolean;
  profileState: "existing_role" | "commander_profile_pending" | "display_only";
  standingDefault: RuntimePreference | null;
  standingFallback: RuntimePreference | null;
  fallbackCondition: string;
  actualRuntime: "not_observed";
  skillInventory: "not_catalogued";
  sourcePath: string;
}
function agent(roleId: ConfigurationAgentId, icon: RoleIconChoice, accentColor: string, duty: string, standingDefault: RuntimePreference | null): ConfigurationAgent {
  return {
    roleId, icon, accentColor, avatarLabel: `${roleId} · ${duty}`, what: duty,
    why: "Keep responsibility clear and separate from other roles.",
    outcome: "Preferences and display labels grant no new duties, tools, approval or release authority.",
    runtimeSelectable: governedConfigurationRoles.includes(roleId as ConfigurationRoleId),
    profileState: roleId === "CENSOR" ? "commander_profile_pending" : roleId === "VEXILLARIUS" ? "display_only" : "existing_role",
    standingDefault, standingFallback: null, fallbackCondition: "No automatic fallback. An exact Commander binding is required.",
    actualRuntime: "not_observed", skillInventory: "not_catalogued", sourcePath: "src/domain/presentation.ts",
  };
}
export const agentConfigurationCatalog: readonly ConfigurationAgent[] = [
  agent("SARGE", "chevron", "#d5a84d", "Coordinate approved work and Commander decisions", sol),
  agent("FORGE", "forge", "#5b8def", "Implement the assigned repository scope", opus),
  { ...agent("SIGNAL", "signal", "#5fb8d3", "Build presentation and interactions after bounded research", { ...sol, model: "gpt-5.3-codex-spark" }), standingFallback: { ...opus, model: "claude-sonnet-5" }, fallbackCondition: "After the first confirmed Spark usage limit and candidate checks, one governed handoff; a further limit parks the lineage." },
  agent("RECON", "compass", "#45b783", "Research evidence and report uncertainty", opus),
  agent("SCRIBE", "scribe", "#9a7bea", "Maintain scoped records and evidence", { ...opus, model: "claude-sonnet-5" }),
  agent("QUARTERMASTER", "supply", "#e7a94b", "Report resource and outcome measures", { ...sol, model: "gpt-5.6-terra" }),
  { ...agent("FIREWATCH", "shield", "#e36d73", "Independently verify work without accepting it", opus), standingFallback: { ...sol, effort: "xhigh" }, fallbackCondition: "Confirmed primary usage limit or unavailability; exact assignment and fresh isolation still required. A reset does not switch the current selection back." },
  agent("VEXILLARIUS", "standard", "#c777b3", "Present market readiness and feedback proposals", null),
  { ...agent("CENSOR", "scales", "#9aa9bd", "Independent CASTRA audit, regulatory research and trademark research", null), outcome: "Display-only duty description. Commander-authored profile pending; no new operating agent, legal advice or external authority contact." },
];

export interface VoicePreferences {
  input: "typed" | "push_to_talk";
  transcriptConfirmation: "required";
  reply: "text" | "text_and_voice";
  voice: "none" | "device_voice";
  professionalSarge: "professional_intj";
  aiDjIdentity: "separate_not_configured";
}
export const voiceConfigurationSequence = [
  { id: "input", label: "1. Your input", what: "Type or choose push-to-talk.", why: "You decide when to speak.", outcome: "No background listening; typing stays available." },
  { id: "transcriptConfirmation", label: "2. Review your words", what: "Edit or discard the transcript before confirming.", why: "Speech can be misunderstood.", outcome: "Unconfirmed text never becomes an instruction." },
  { id: "reply", label: "3. SARGE's reply", what: "Read text or request text with voice.", why: "Choose a convenient way to receive the reply.", outcome: "Text remains available; no synthesis starts from saving." },
  { id: "voice", label: "4. Optional voice", what: "Prefer the device voice when voice replies are selected.", why: "Keep regular voice separate from a cloned identity.", outcome: "Device availability remains unchecked. AI DJ SARGE is separate and unavailable here." },
] as const;
export interface ConfigurationSkillDraft {
  roleId: ConfigurationAgentId;
  capabilityId: CapabilityClassId;
  name: string;
  outcome: string;
  steps: string[];
  acceptance: string[];
  status: "draft_for_commander_review";
}
export interface ConfigurationPreferences {
  schemaVersion: typeof CONFIGURATION_SCHEMA_VERSION;
  operatingStore: "supabase" | "not_selected";
  agents: AgentRuntimePreference[];
  voice: VoicePreferences;
  optionalServices: { usageAnalytics: "off" | "consider"; errorReporting: "off" | "consider" };
  skillDrafts: ConfigurationSkillDraft[];
}
export const optionalServiceDefinitions = [
  { id: "usageAnalytics", label: "Usage analytics", what: "Consider reports about how the workspace is used.", why: "Understand which features help.", outcome: "Off sends nothing. Considering a service does not connect it; review cost, privacy and retention first.", capabilityClass: "optional_service" },
  { id: "errorReporting", label: "Error reporting", what: "Consider collecting diagnostic reports.", why: "Spot failures that need attention.", outcome: "Off sends nothing. Considering a service does not connect it; sensitive information must be excluded before any future activation.", capabilityClass: "optional_service" },
] as const;
export const operatingStoreOptions = [
  { value: "supabase", label: "Supabase · recommended", what: "Prefer the existing supported store architecture.", why: "Keep the setup consistent with the application.", outcome: "Recommendation only; no connection, migration or health is implied." },
  { value: "not_selected", label: "Choose later", what: "Leave the store preference unset.", why: "Review setup before deciding.", outcome: "Operating setup remains incomplete." },
] as const;

export function recommendedConfigurationPreferences(): ConfigurationPreferences {
  return {
    schemaVersion: CONFIGURATION_SCHEMA_VERSION, operatingStore: "supabase",
    agents: governedConfigurationRoles.map((roleId) => ({ roleId, ...agentConfigurationCatalog.find((entry) => entry.roleId === roleId)!.standingDefault! })),
    voice: { input: "typed", transcriptConfirmation: "required", reply: "text", voice: "none", professionalSarge: "professional_intj", aiDjIdentity: "separate_not_configured" },
    optionalServices: { usageAnalytics: "off", errorReporting: "off" }, skillDrafts: [],
  };
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && ownKeys.every((key) => typeof key === "string" && keys.includes(key)
    && Object.getOwnPropertyDescriptor(value, key)?.get === undefined && Object.getOwnPropertyDescriptor(value, key)?.set === undefined);
}
function exactArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === value.length + 1 && keys.every((key) => key === "length" || (typeof key === "string"
    && /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length
    && Object.getOwnPropertyDescriptor(value, key)?.get === undefined && Object.getOwnPropertyDescriptor(value, key)?.set === undefined));
}
function safeDraftText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim() && value.length <= maximum
    && !looksLikeSecretMaterial(value) && !looksLikePrivateMaterial(value)
    && ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    && !/[<>\\/]|\b(?:https?:|account|password|credential|token|api[_ -]?key)\s*[:=]|\b(?:acct|account|tenant|proj|user|organization)[_-][A-Za-z0-9_-]{4,}/i.test(value);
}
export function isCompatibleRuntimePreference(value: unknown): value is RuntimePreference {
  if (!exactObject(value, ["provider", "subscription", "model", "effort"])) return false;
  return runtimeOptions.some((option) => option.provider === value.provider && option.subscription === value.subscription
    && option.model === value.model && option.efforts.includes(value.effort as ConfigurationEffort));
}

/** Global setup classes, NOT agent-specific permissions or an installed inventory. */
export function sharedConfigurationCapabilities() {
  return capabilityClasses().map((entry) => ({
    id: entry.id, name: entry.name, description: entry.purpose,
    state: "declared" as const, installed: "not_catalogued" as const, applied: "not_observed" as const,
    sourcePath: "src/presentation/agentConfiguration.ts", sourceSymbol: "capabilityClasses",
    scope: "Shared configuration capability; not a role grant",
  }));
}
/** Read only the role permission arrays; never consume the legacy runtime defaults. */
export function declaredConfigurationCapabilities(roleId: ConfigurationAgentId) {
  if (!agentConfigurationCatalog.some((entry) => entry.roleId === roleId)) throw new Error("Unknown display identity.");
  const definition = teamRoleDefinition(roleId.toLowerCase());
  return {
    roleId, state: definition ? "declared_permissions" as const : "no_operating_profile" as const,
    installedSkills: "not_catalogued" as const, applied: "not_observed" as const,
    sourcePath: "src/team-configuration/teamConfiguration.ts", sourceSymbol: "teamRoleDefinition · capability arrays only",
    defaultCapabilities: [...(definition?.defaultCapabilities ?? [])],
    requiredCapabilities: [...(definition?.requiredCapabilities ?? [])],
    capabilityCeiling: [...(definition?.capabilityCeiling ?? [])],
    notice: "Declared permissions are not installed skills or effective runtime access. The assignment and enforced envelope still control.",
  };
}
export function generateSkillDraft(input: { roleId: ConfigurationAgentId; capabilityId: CapabilityClassId; name: string; outcome: string }): ConfigurationSkillDraft {
  if (!exactObject(input, ["roleId", "capabilityId", "name", "outcome"])
    || !agentConfigurationCatalog.some((entry) => entry.roleId === input.roleId)
    || !capabilityClasses().some((entry) => entry.id === input.capabilityId)
    || !safeDraftText(input.name, 80) || !safeDraftText(input.outcome, 240)) {
    throw new Error("Skill draft requires a known identity and capability plus short, nonsecret text without paths or account details.");
  }
  return {
    ...input, status: "draft_for_commander_review",
    steps: ["Confirm the approved scope and required inputs with the Commander.", `Prepare a bounded proposal for: ${input.outcome}`, "List source evidence, limitations and the checks needed before use."],
    acceptance: ["The Commander reviews the proposed outcome and instructions.", "No new permissions, installation, runtime execution or external effects are implied.", "Record missing information and stop at the existing role boundaries."],
  };
}
function isSkillDraft(value: unknown): value is ConfigurationSkillDraft {
  if (!exactObject(value, ["roleId", "capabilityId", "name", "outcome", "steps", "acceptance", "status"])) return false;
  try {
    const expected = generateSkillDraft({ roleId: value.roleId as ConfigurationAgentId, capabilityId: value.capabilityId as CapabilityClassId, name: value.name as string, outcome: value.outcome as string });
    return value.status === expected.status && exactArray(value.steps) && exactArray(value.acceptance)
      && JSON.stringify(value.steps) === JSON.stringify(expected.steps)
      && JSON.stringify(value.acceptance) === JSON.stringify(expected.acceptance);
  } catch { return false; }
}
export type ConfigurationValidation = { valid: true; errors: []; value: ConfigurationPreferences } | { valid: false; errors: string[] };
export function validateConfigurationPreferences(input: unknown): ConfigurationValidation {
  const errors: string[] = [];
  if (!exactObject(input, ["schemaVersion", "operatingStore", "agents", "voice", "optionalServices", "skillDrafts"])) {
    return { valid: false, errors: ["Configuration must contain only the known preference fields."] };
  }
  if (input.schemaVersion !== CONFIGURATION_SCHEMA_VERSION) errors.push("Configuration version is not supported.");
  if (!["supabase", "not_selected"].includes(input.operatingStore as string)) errors.push("Choose a supported store preference.");
  if (!exactArray(input.agents) || input.agents.length !== governedConfigurationRoles.length) errors.push("Include each working role exactly once.");
  else {
    const seen = new Set<string>();
    for (const entry of input.agents) {
      if (!exactObject(entry, ["roleId", "provider", "subscription", "model", "effort"])
        || !governedConfigurationRoles.includes(entry.roleId as ConfigurationRoleId) || seen.has(entry.roleId as string)) {
        errors.push("Include only the seven working roles, each once."); continue;
      }
      seen.add(entry.roleId as string);
      if (!isCompatibleRuntimePreference({ provider: entry.provider, subscription: entry.subscription, model: entry.model, effort: entry.effort })) {
        errors.push("Choose a compatible first-party subscription, model and effort. Paid APIs are locked.");
      }
    }
  }
  const voice = input.voice;
  if (!exactObject(voice, ["input", "transcriptConfirmation", "reply", "voice", "professionalSarge", "aiDjIdentity"])
    || !["typed", "push_to_talk"].includes(voice.input as string) || voice.transcriptConfirmation !== "required"
    || !["text", "text_and_voice"].includes(voice.reply as string)
    || voice.voice !== (voice.reply === "text" ? "none" : "device_voice")
    || voice.professionalSarge !== "professional_intj" || voice.aiDjIdentity !== "separate_not_configured") {
    errors.push("Choose a supported voice sequence. Transcript review and separate identities are required.");
  }
  const services = input.optionalServices;
  if (!exactObject(services, ["usageAnalytics", "errorReporting"])
    || !["off", "consider"].includes(services.usageAnalytics as string) || !["off", "consider"].includes(services.errorReporting as string)) {
    errors.push("Optional services may be off or under consideration only.");
  }
  if (!exactArray(input.skillDrafts) || input.skillDrafts.length > 12 || !input.skillDrafts.every(isSkillDraft)
    || new Set(input.skillDrafts.map((draft) => `${draft.roleId}:${draft.name}`)).size !== input.skillDrafts.length) {
    errors.push("Keep at most twelve distinct, bounded skill drafts for Commander review.");
  }
  if (errors.length) return { valid: false, errors };
  // Canonical role order and fresh objects ensure callers cannot mutate a saved version.
  const value = JSON.parse(JSON.stringify(input)) as ConfigurationPreferences;
  value.agents.sort((a, b) => governedConfigurationRoles.indexOf(a.roleId) - governedConfigurationRoles.indexOf(b.roleId));
  return { valid: true, errors: [], value };
}
export function requireConfigurationPreferences(input: unknown): ConfigurationPreferences {
  const result = validateConfigurationPreferences(input);
  if (!result.valid) throw new Error(result.errors.join(" "));
  return result.value;
}
export type ConfigurationUpdate =
  | { field: "operatingStore"; value: ConfigurationPreferences["operatingStore"] }
  | { field: "agent"; value: AgentRuntimePreference }
  | { field: "voice"; value: VoicePreferences }
  | { field: "optionalServices"; value: ConfigurationPreferences["optionalServices"] }
  | { field: "skillDrafts"; value: ConfigurationSkillDraft[] };
export function updateConfigurationPreferences(current: ConfigurationPreferences, update: ConfigurationUpdate): ConfigurationPreferences {
  const next = requireConfigurationPreferences(current);
  if (!exactObject(update, ["field", "value"])) throw new Error("Unknown configuration update.");
  switch (update.field) {
    case "agent": {
      if (!update.value || !next.agents.some((entry) => entry.roleId === update.value.roleId)) throw new Error("Unknown working role.");
      next.agents = next.agents.map((entry) => entry.roleId === update.value.roleId ? update.value : entry); break;
    }
    case "operatingStore": next.operatingStore = update.value; break;
    case "voice": next.voice = update.value; break;
    case "optionalServices": next.optionalServices = update.value; break;
    case "skillDrafts": next.skillDrafts = update.value; break;
    default: throw new Error("Unknown configuration update.");
  }
  return requireConfigurationPreferences(next);
}
export function configurationChangeSummary(before: ConfigurationPreferences, after: ConfigurationPreferences): string[] {
  const previous = requireConfigurationPreferences(before);
  const next = requireConfigurationPreferences(after);
  const changes: string[] = [];
  if (previous.operatingStore !== next.operatingStore) changes.push("Operating store preference changed");
  for (const entry of next.agents) if (JSON.stringify(entry) !== JSON.stringify(previous.agents.find((item) => item.roleId === entry.roleId))) changes.push(`${entry.roleId} runtime preference changed`);
  if (JSON.stringify(previous.voice) !== JSON.stringify(next.voice)) changes.push("Voice preferences changed");
  if (JSON.stringify(previous.optionalServices) !== JSON.stringify(next.optionalServices)) changes.push("Optional service preferences changed");
  if (JSON.stringify(previous.skillDrafts) !== JSON.stringify(next.skillDrafts)) changes.push("Skill drafts changed — Commander review required");
  return changes;
}

export type ConfigurationEvidenceScope = "current_hosted" | "local" | "synthetic";
export type ConfigurationCheckId = "configuration" | "operating_store" | `agent:${ConfigurationRoleId}` | "voice_input" | "voice_reply" | "usage_analytics" | "error_reporting" | "paid_api" | "ai_dj_voice" | "appearance";
export interface ConfigurationCheck {
  id: ConfigurationCheckId; label: string; configurationKey: string;
  participation: "actionable" | "optional_off" | "locked" | "cosmetic";
  configured: boolean;
}
/** Stable exact-match keys bind observations to choices, never to widget counts. */
export function configurationChecks(preferences: ConfigurationPreferences): ConfigurationCheck[] {
  const value = requireConfigurationPreferences(preferences);
  return [
    { id: "operating_store", label: "Operating store", configurationKey: value.operatingStore, participation: "actionable", configured: value.operatingStore !== "not_selected" },
    ...value.agents.map((entry): ConfigurationCheck => ({ id: `agent:${entry.roleId}`, label: entry.roleId, configurationKey: [entry.provider, entry.subscription, entry.model, entry.effort].join(":"), participation: "actionable", configured: true })),
    { id: "voice_input", label: "Your input", configurationKey: `${value.voice.input}:confirmation_required`, participation: "actionable", configured: true },
    { id: "voice_reply", label: "SARGE's reply", configurationKey: `${value.voice.reply}:${value.voice.voice}`, participation: "actionable", configured: true },
    { id: "usage_analytics", label: "Usage analytics", configurationKey: value.optionalServices.usageAnalytics, participation: value.optionalServices.usageAnalytics === "off" ? "optional_off" : "actionable", configured: false },
    { id: "error_reporting", label: "Error reporting", configurationKey: value.optionalServices.errorReporting, participation: value.optionalServices.errorReporting === "off" ? "optional_off" : "actionable", configured: false },
    { id: "paid_api", label: "Metered APIs", configurationKey: "locked", participation: "locked", configured: false },
    { id: "ai_dj_voice", label: "AI DJ SARGE", configurationKey: "separate_not_configured", participation: "locked", configured: false },
    { id: "appearance", label: "Appearance", configurationKey: "display_only", participation: "cosmetic", configured: true },
  ];
}
/** Read-only observation input from a trusted adapter, never accepted by preference save. */
export interface ConfigurationObservation {
  checkId: ConfigurationCheckId;
  configurationKey: string;
  configurationVersion: number;
  source: "applied_observation";
  scope: ConfigurationEvidenceScope;
  status: "working" | "error" | "unreachable" | "unknown";
  observedAt: string;
  validUntil: string;
}
export interface ConfigurationReadinessCheck extends ConfigurationCheck {
  color: "red" | "yellow" | "green" | "neutral";
  reason: string;
  evidenceScope: ConfigurationEvidenceScope | null;
}
export interface ConfigurationReadinessContext {
  configurationVersion: number;
  scope: ConfigurationEvidenceScope;
}
function observationTimes(observedAt: string, validUntil: string, now: string): { valid: boolean; fresh: boolean } {
  const start = Date.parse(observedAt), end = Date.parse(validUntil), current = Date.parse(now);
  const valid = [start, end, current].every(Number.isFinite) && start <= current && end > start;
  return { valid, fresh: valid && current < end };
}
export function buildConfigurationReadiness(preferences: ConfigurationPreferences, observations: readonly ConfigurationObservation[], now: string, context: ConfigurationReadinessContext) {
  const validated = validateConfigurationPreferences(preferences);
  const descriptors: ConfigurationCheck[] = validated.valid ? configurationChecks(validated.value) : [
    { id: "configuration", label: "Configuration", configurationKey: "invalid", participation: "actionable", configured: false },
  ];
  const checks = descriptors.map((check): ConfigurationReadinessCheck => {
    const result = (color: ConfigurationReadinessCheck["color"], reason: string, evidenceScope: ConfigurationEvidenceScope | null = null) => ({ ...check, color, reason, evidenceScope });
    if (check.participation !== "actionable") return result("neutral", check.participation === "optional_off" ? "Optional and off" : check.participation === "locked" ? "Not available in this edition" : "Display only");
    if (!check.configured) return result("red", "Needs setup");
    if (context.scope === "synthetic") return result("red", "Synthetic review does not establish live readiness");
    const matching = observations.filter((entry) => entry.checkId === check.id);
    // Ambiguous duplicate evidence cannot win by array order or be counted twice.
    if (matching.length !== 1) return result("red", matching.length ? "Conflicting observations; check again" : "Not verified for the selected settings");
    const observation = matching[0];
    if (observation.configurationKey !== check.configurationKey || observation.configurationVersion !== context.configurationVersion
      || !Number.isSafeInteger(context.configurationVersion) || context.configurationVersion < 0
      || observation.scope !== context.scope) return result("red", "Observation does not match the selected settings, version and context");
    const times = observationTimes(observation.observedAt, observation.validUntil, now);
    if (observation.source !== "applied_observation" || !["current_hosted", "local"].includes(observation.scope)
      || !times.valid || !["working", "error", "unreachable"].includes(observation.status)) return result("red", "Missing valid applied evidence");
    if (!times.fresh) return result("yellow", "Previously configured; evidence is stale", observation.scope);
    if (observation.status !== "working") return result("yellow", observation.status === "error" ? "Previously configured; check reported an error" : "Previously configured; currently unreachable", observation.scope);
    return result("green", observation.scope === "local" ? "Working in the observed local context only" : "Fresh matching applied observation", observation.scope);
  });
  const counts = { actionable: 0, green: 0, yellow: 0, red: 0, neutral: 0 };
  for (const check of checks) {
    counts[check.color] += 1;
    if (check.color !== "neutral") counts.actionable += 1;
  }
  return { checks, counts, denominator: "Actionable checks only; each check counted once. Off, locked and cosmetic choices are neutral.", overall: counts.red ? "red" as const : counts.yellow ? "yellow" as const : counts.green ? "green" as const : "neutral" as const };
}

export type ConfigurationConnectionInput =
  | { kind: "synthetic" }
  | { kind: "local" }
  | { kind: "hosted"; state: "current" | "stale" | "unavailable"; observedAt?: string; validUntil?: string }
  | { kind: "unavailable" };
export interface ConfigurationConnectionProjection {
  kind: "synthetic" | "local" | "current_hosted" | "stale" | "unavailable";
  label: string;
  operationalAuthority: boolean;
  providerHealth: "not_observed";
  modelHealth: "not_observed";
}
export function projectConfigurationConnection(input: ConfigurationConnectionInput, now: string): ConfigurationConnectionProjection {
  const base = { operationalAuthority: false, providerHealth: "not_observed" as const, modelHealth: "not_observed" as const };
  if (input.kind === "synthetic") return { ...base, kind: "synthetic", label: "Synthetic review · memory only · not live evidence" };
  if (input.kind === "local") return { ...base, kind: "local", label: "Local candidate · not operational authority" };
  if (input.kind === "hosted" && input.state !== "unavailable") {
    const times = observationTimes(input.observedAt ?? "", input.validUntil ?? "", now);
    if (input.state === "current" && times.fresh) return { ...base, kind: "current_hosted", operationalAuthority: true, label: "Current hosted CASTRA connection · provider and model health not checked" };
    if (input.state === "stale" || times.valid) return { ...base, kind: "stale", label: "Hosted connection is stale · refresh before relying on it" };
  }
  return { ...base, kind: "unavailable", label: "Current connection evidence unavailable" };
}
