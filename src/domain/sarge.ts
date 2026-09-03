import type {
  AuditEvent,
  AuditKind,
  CanonicalRoleId,
  CastraState,
  CommandContext,
  SargeBillingClass,
  SargeCommanderDecision,
  SargeEngagementCommand,
  SargeEngagementRequest,
  SargeEngagementTarget,
  SargeProposedAssignment,
  SargeResultPackage,
  SargeRuntimeOption,
  SargeRuntimePolicyVersion,
} from "./types.js";
import { sha256 } from "./remoteWork.js";

const POLICY_CREATED_AT = "2026-08-11T00:00:00.000Z";
const MAX_APPROVAL_MS = 24 * 60 * 60 * 1_000;
const PROHIBITED_SCOPE_PATTERNS = [
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|secret|private[_ -]?key)\s*[:=]/i,
  /\b(?:sk|sb_secret)[-_][a-z0-9_-]{12,}\b/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
];

export function initialSargeRuntimePolicy(): SargeRuntimePolicyVersion {
  return {
    id: "sarge-runtime-policy-v1",
    familyId: "sarge-runtime-policy",
    version: 1,
    supersedesId: null,
    createdAt: POLICY_CREATED_AT,
    contractVersion: 1,
    canonicalRoleId: "SARGE",
    workflowKey: "sarge_orchestration",
    defaultRuntimeOptionId: "codex_subscription",
    runtimePriority: ["local_suitable_low_risk", "subscription_first_party", "api_exception_only"],
    authority: "proposal_only",
    credentialsAccepted: false,
    networkExecutionEnabled: false,
    toolExecutionEnabled: false,
    authoritativeMutationEnabled: false,
    runtimeOptions: [
      {
        id: "codex_subscription",
        label: "Codex subscription · first-party app/CLI",
        adapter: "codex_first_party_subscription",
        billingClass: "subscription_included",
        modelReference: "Codex subscription runtime · model not configured",
        availability: "not_present",
        eligibleModes: ["consult", "develop_plan", "coordinate_approved_work"],
        activityAllowlist: ["bounded_consultation", "plan_decomposition", "approved_work_coordination"],
        policyNote: "Recommended SARGE default when a signed-in first-party runtime and paired Companion are separately installed and verified.",
        requiresInvocationApproval: true,
        apiCostCeilingMinor: null,
        apiFallbackAllowed: false,
      },
      {
        id: "claude_code_subscription",
        label: "Claude Code subscription · first-party app/CLI",
        adapter: "claude_code_first_party_subscription",
        billingClass: "subscription_included",
        modelReference: "Claude Code subscription runtime · model not configured",
        availability: "not_present",
        eligibleModes: ["consult", "develop_plan", "coordinate_approved_work"],
        activityAllowlist: ["bounded_consultation", "plan_decomposition", "approved_work_coordination"],
        policyNote: "Eligible alternate only after a signed-in first-party runtime and paired Companion are separately installed and verified.",
        requiresInvocationApproval: true,
        apiCostCeilingMinor: null,
        apiFallbackAllowed: false,
      },
      {
        id: "qwen3_0_6b_local",
        label: "Qwen3 0.6B · local review-only",
        adapter: "ollama_loopback",
        billingClass: "local_no_metered_api",
        modelReference: "qwen3:0.6b · semantic-quality limitation recorded",
        availability: "not_configured",
        eligibleModes: ["consult"],
        activityAllowlist: ["bounded_consultation"],
        policyNote: "Short bounded drafting, extraction, or classification only; semantic validation and Commander review are mandatory. Prior semantic acceptance failed.",
        requiresInvocationApproval: true,
        apiCostCeilingMinor: null,
        apiFallbackAllowed: false,
      },
      {
        id: "metered_api_exception",
        label: "Metered API · exception only (Off)",
        adapter: "metered_api_exception",
        billingClass: "metered_api",
        modelReference: "No API provider or model configured",
        availability: "blocked",
        eligibleModes: [],
        activityAllowlist: [],
        policyNote: "Requires a separate invocation-specific Product Owner decision, cost ceiling, provider configuration, and AERARIUM provenance. Silent fallback is prohibited.",
        requiresInvocationApproval: true,
        apiCostCeilingMinor: null,
        apiFallbackAllowed: false,
      },
    ],
  };
}

export function isSargeEngagementCommand(command: { type: string }): command is SargeEngagementCommand {
  return command.type.startsWith("sarge.engagement.");
}

function requiredText(value: string, label: string, max = 8_000): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > max) throw new Error(`${label} must be ${max.toLocaleString()} characters or fewer.`);
  if (PROHIBITED_SCOPE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    throw new Error(`${label} appears to contain prohibited credential or secret material.`);
  }
  return normalized;
}

function instant(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp.`);
  return parsed;
}

function appendAudit(
  state: CastraState,
  context: CommandContext,
  occurredAt: string,
  kind: AuditKind,
  entityType: AuditEvent["entityType"],
  entityId: string,
  summary: string,
  detail: Record<string, string>,
): CastraState {
  const event: AuditEvent = {
    id: context.id("audit"),
    sequence: state.nextAuditSequence,
    occurredAt,
    actor: "Commander",
    origin: "direct",
    kind,
    entityType,
    entityId,
    summary,
    detail,
  };
  return { ...state, nextAuditSequence: state.nextAuditSequence + 1, auditEvents: [...state.auditEvents, event] };
}

function requirePolicy(state: CastraState, id: string): SargeRuntimePolicyVersion {
  const policy = state.sargeRuntimePolicyVersions.find((item) => item.id === id);
  if (!policy || state.sargeRuntimePolicyVersions.some((item) => item.supersedesId === policy.id)) {
    throw new Error("The selected SARGE runtime-policy version is missing or superseded.");
  }
  return policy;
}

function requireRequest(state: CastraState, id: string): SargeEngagementRequest {
  const request = state.sargeEngagementRequests.find((item) => item.id === id);
  if (!request) throw new Error("SARGE engagement request was not found.");
  return request;
}

function runtimeOption(policy: SargeRuntimePolicyVersion, id: string): SargeRuntimeOption {
  const option = policy.runtimeOptions.find((item) => item.id === id);
  if (!option) throw new Error("The selected runtime is not eligible under this SARGE policy.");
  return option;
}

function validateTarget(state: CastraState, target: SargeEngagementTarget): SargeEngagementTarget {
  const id = requiredText(target.id, "Target reference", 180);
  const label = requiredText(target.label, "Target label", 240);
  if (!Number.isInteger(target.revision) || target.revision < 0) throw new Error("Target revision must be a non-negative integer.");
  const collection = target.type === "campaign" ? state.campaigns
    : target.type === "mission" ? state.missions
      : target.type === "action" ? state.actions
        : target.type === "ui_review_checkpoint" ? state.uiReviewCheckpoints
          : target.type === "punch_item" ? state.punchItems
            : null;
  if (collection) {
    const record = collection.find((item) => item.id === id);
    if (!record) throw new Error("The selected SARGE target does not exist.");
    if ("revision" in record && record.revision !== target.revision) throw new Error("The selected SARGE target revision is stale.");
  } else if (target.type === "command_overview" && id !== "command-overview") {
    throw new Error("Command Overview uses the stable command-overview target reference.");
  }
  return { type: target.type, id, revision: target.revision, label };
}

function validateSelection(policy: SargeRuntimePolicyVersion, option: SargeRuntimeOption, mode: SargeEngagementRequest["mode"], activity: SargeEngagementRequest["requestedActivity"]): void {
  if (option.adapter === "metered_api_exception" || option.availability === "blocked") throw new Error("Metered API selection is Off and requires a separate invocation-specific exception.");
  if (!option.eligibleModes.includes(mode) || !option.activityAllowlist.includes(activity)) throw new Error("The selected runtime is not eligible for this mode/activity combination.");
  if (option.billingClass === "unknown") throw new Error("Unknown runtime billing classification is blocked.");
  if (option.apiFallbackAllowed || policy.runtimeOptions.some((item) => item.apiFallbackAllowed)) throw new Error("Automatic API fallback is prohibited.");
}

function requestMaterialHash(input: Pick<SargeEngagementRequest, "target" | "mode" | "requestedActivity" | "scopeText" | "runtimePolicyVersionId" | "selectedRuntimeOptionId" | "selectedRuntimeAdapter" | "selectedModelReference" | "billingClass" | "riskTier" | "authority" | "apiFallbackAllowed">): string {
  return `sha256-v1:${sha256(JSON.stringify({
    target: input.target,
    mode: input.mode,
    requestedActivity: input.requestedActivity,
    scopeText: input.scopeText,
    runtimePolicyVersionId: input.runtimePolicyVersionId,
    selectedRuntimeOptionId: input.selectedRuntimeOptionId,
    selectedRuntimeAdapter: input.selectedRuntimeAdapter,
    selectedModelReference: input.selectedModelReference,
    billingClass: input.billingClass,
    riskTier: input.riskTier,
    authority: input.authority,
    apiFallbackAllowed: input.apiFallbackAllowed,
  }))}`;
}

export function sargeRequestHash(request: SargeEngagementRequest): string {
  return requestMaterialHash(request);
}

export function latestSargeDecision(state: CastraState, requestId: string): SargeCommanderDecision | null {
  return [...state.sargeCommanderDecisions].reverse().find((item) => item.requestId === requestId) ?? null;
}

export function evaluateSargeRequest(state: CastraState, request: SargeEngagementRequest, at: string): { ready: boolean; reasons: string[]; option: SargeRuntimeOption | null } {
  const reasons: string[] = [];
  let option: SargeRuntimeOption | null = null;
  try {
    const policy = requirePolicy(state, request.runtimePolicyVersionId);
    option = runtimeOption(policy, request.selectedRuntimeOptionId);
    validateSelection(policy, option, request.mode, request.requestedActivity);
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : "Runtime-policy validation failed.");
  }
  if (request.authority !== "proposal_only" || request.riskTier !== "low") reasons.push("SARGE foundation permits only Low-risk proposal-only work.");
  const decision = latestSargeDecision(state, request.id);
  if (!decision || decision.decision !== "approved") reasons.push("Exact-scope Commander approval is required.");
  if (decision && (decision.requestRevision !== request.revision || decision.requestHash !== sargeRequestHash(request))) reasons.push("Commander approval does not match the current request revision and hash.");
  if (decision?.expiresAt && instant(decision.expiresAt, "Approval expiry") <= instant(at, "Evaluation time")) reasons.push("Commander approval is expired.");
  return { ready: reasons.length === 0, reasons, option };
}

function buildRequest(state: CastraState, command: Extract<SargeEngagementCommand, { type: "sarge.engagement.create" | "sarge.engagement.update" }>, occurredAt: string, current?: SargeEngagementRequest): SargeEngagementRequest {
  const policy = requirePolicy(state, "runtimePolicyVersionId" in command ? command.runtimePolicyVersionId : current!.runtimePolicyVersionId);
  const selectedId = command.selectedRuntimeOptionId || policy.defaultRuntimeOptionId;
  const option = runtimeOption(policy, selectedId);
  validateSelection(policy, option, command.mode, command.requestedActivity);
  const target = validateTarget(state, command.target);
  const scopeText = requiredText(command.scopeText, "Engagement scope", 8_000);
  const base: SargeEngagementRequest = {
    id: current?.id ?? "",
    revision: (current?.revision ?? 0) + 1,
    target,
    mode: command.mode,
    requestedActivity: command.requestedActivity,
    scopeText,
    scopeHash: `sha256-v1:${sha256(scopeText)}`,
    materialHash: "",
    runtimePolicyVersionId: policy.id,
    defaultRuntimeOptionId: policy.defaultRuntimeOptionId,
    selectedRuntimeOptionId: option.id,
    selectedRuntimeAdapter: option.adapter,
    selectedModelReference: option.modelReference,
    billingClass: option.billingClass,
    riskTier: "low",
    authority: "proposal_only",
    apiFallbackAllowed: false,
    status: "draft",
    createdAt: current?.createdAt ?? occurredAt,
    updatedAt: occurredAt,
  };
  return { ...base, materialHash: requestMaterialHash(base) };
}

function validateAssignments(assignments: SargeProposedAssignment[]): SargeProposedAssignment[] {
  const allowed: CanonicalRoleId[] = ["SARGE", "FORGE", "SIGNAL", "RECON", "SCRIBE", "QUARTERMASTER", "FIREWATCH", "VEXILLARIUS", "CENSOR"];
  return assignments.map((assignment) => {
    if (!allowed.includes(assignment.canonicalRoleId)) throw new Error("A proposed assignment references an unsupported or human-authority role.");
    return {
      canonicalRoleId: assignment.canonicalRoleId,
      activity: requiredText(assignment.activity, "Proposed assignment activity", 500),
      runtimeOptionId: requiredText(assignment.runtimeOptionId, "Proposed assignment runtime", 120),
      authority: "proposal_only",
    };
  });
}

function aerariumLink(billingClass: SargeBillingClass): SargeResultPackage["aerariumLink"] {
  if (billingClass === "metered_api") return { billingClass, measureState: "zero", amountMinor: 0, currency: "USD", provenance: "No API call occurred; API fallback remained Off." };
  return { billingClass, measureState: "unavailable", amountMinor: null, currency: "", provenance: "Repository simulation only; no runtime usage, allocation, cost, token, or duration evidence exists." };
}

export function applySargeEngagementCommand(state: CastraState, command: SargeEngagementCommand, context: CommandContext): CastraState {
  const occurredAt = context.now();
  if (command.type === "sarge.engagement.create") {
    const built = buildRequest(state, command, occurredAt);
    const request = { ...built, id: context.id("sarge_engagement_request") };
    const next = { ...state, sargeEngagementRequests: [...state.sargeEngagementRequests, request] };
    return appendAudit(next, context, occurredAt, "sarge.request_created", "sarge_engagement_request", request.id, "SARGE proposal-only engagement request created", { requestHash: request.materialHash, targetType: request.target.type, targetId: request.target.id, targetRevision: String(request.target.revision), mode: request.mode, runtimeOptionId: request.selectedRuntimeOptionId, billingClass: request.billingClass, providerCalls: "0", modelCalls: "0", toolCalls: "0" });
  }

  if (command.type === "sarge.engagement.update") {
    const current = requireRequest(state, command.requestId);
    const updated = buildRequest(state, command, occurredAt, current);
    let next = { ...state, sargeEngagementRequests: state.sargeEngagementRequests.map((item) => item.id === updated.id ? updated : item) };
    const prior = latestSargeDecision(state, current.id);
    if (prior?.decision === "approved") {
      next = appendAudit(next, context, occurredAt, "sarge.approval_invalidated", "sarge_commander_decision", prior.id, "Material SARGE request change invalidated prior approval", { requestId: current.id, priorRequestHash: prior.requestHash, currentRequestHash: updated.materialHash, priorRevision: String(prior.requestRevision), currentRevision: String(updated.revision) });
    }
    return appendAudit(next, context, occurredAt, "sarge.request_updated", "sarge_engagement_request", updated.id, "SARGE engagement request updated", { requestHash: updated.materialHash, revision: String(updated.revision), runtimeOptionId: updated.selectedRuntimeOptionId, providerCalls: "0", modelCalls: "0", toolCalls: "0" });
  }

  if (command.type === "sarge.engagement.decide") {
    const request = requireRequest(state, command.requestId);
    const reason = requiredText(command.reason, "Commander decision reason", 2_000);
    let expiresAt: string | null = null;
    if (command.decision === "approved") {
      if (!command.expiresAt) throw new Error("Approved SARGE requests require an expiry.");
      const now = instant(occurredAt, "Decision time");
      const expiry = instant(command.expiresAt, "Approval expiry");
      if (expiry <= now || expiry > now + MAX_APPROVAL_MS) throw new Error("SARGE approval expiry must be after decision time and no more than 24 hours later.");
      expiresAt = command.expiresAt;
    }
    const decision: SargeCommanderDecision = { id: context.id("sarge_commander_decision"), requestId: request.id, requestRevision: request.revision, requestHash: sargeRequestHash(request), decision: command.decision, reason, decidedBy: "Commander", decidedAt: occurredAt, expiresAt };
    const updated = { ...request, status: "decision_recorded" as const, updatedAt: occurredAt };
    const next = { ...state, sargeCommanderDecisions: [...state.sargeCommanderDecisions, decision], sargeEngagementRequests: state.sargeEngagementRequests.map((item) => item.id === request.id ? updated : item) };
    return appendAudit(next, context, occurredAt, command.decision === "approved" ? "sarge.approval_recorded" : "sarge.approval_rejected", "sarge_commander_decision", decision.id, `Commander ${command.decision} SARGE engagement request`, { requestId: request.id, requestRevision: String(request.revision), requestHash: decision.requestHash, expiresAt: expiresAt ?? "not_applicable", authority: "proposal_only" });
  }

  const request = requireRequest(state, command.requestId);
  if (state.sargeResultPackages.some((item) => item.requestId === request.id && item.requestRevision === request.revision)) throw new Error("This exact SARGE request revision already has an immutable result package.");
  const gate = evaluateSargeRequest(state, request, occurredAt);
  if (!gate.ready) throw new Error(`SARGE result recording blocked: ${gate.reasons.join(" ")}`);
  const decision = latestSargeDecision(state, request.id)!;
  const proposalText = command.outcome === "simulation_proposal" ? requiredText(command.proposalText, "Simulated proposal text", 16_000) : command.proposalText.trim();
  const assignments = command.outcome === "simulation_proposal" ? validateAssignments(command.proposedAssignments) : [];
  const reasonCode = requiredText(command.reasonCode, "Result reason code", 80);
  const reason = requiredText(command.reason, "Result reason", 2_000);
  let waitUntil: string | null = null;
  if (command.outcome === "limit_wait") {
    if (!command.waitUntil) throw new Error("A subscription-limit result requires a wait-until timestamp.");
    if (instant(command.waitUntil, "Wait-until timestamp") <= instant(occurredAt, "Result time")) throw new Error("Wait-until timestamp must be in the future.");
    waitUntil = command.waitUntil;
  }
  const result: SargeResultPackage = {
    id: context.id("sarge_result_package"), requestId: request.id, requestRevision: request.revision,
    requestHash: sargeRequestHash(request), decisionId: decision.id, outcome: command.outcome,
    proposalText, proposedAssignments: assignments, reasonCode, reason, waitUntil,
    evidenceMode: "deterministic_repository_simulation", authority: "proposal_only",
    authoritativeMutations: 0, providerCalls: 0, modelCalls: 0, toolCalls: 0,
    automaticPaidFallback: false, aerariumLink: aerariumLink(request.billingClass), createdAt: occurredAt,
  };
  const updated = { ...request, status: "result_recorded" as const, updatedAt: occurredAt };
  const next = { ...state, sargeResultPackages: [...state.sargeResultPackages, result], sargeEngagementRequests: state.sargeEngagementRequests.map((item) => item.id === request.id ? updated : item) };
  return appendAudit(next, context, occurredAt, "sarge.result_recorded", "sarge_result_package", result.id, `SARGE ${result.outcome} package recorded without execution`, { requestId: request.id, requestHash: result.requestHash, outcome: result.outcome, evidenceMode: result.evidenceMode, billingClass: request.billingClass, authoritativeMutations: "0", providerCalls: "0", modelCalls: "0", toolCalls: "0", automaticPaidFallback: "false" });
}
