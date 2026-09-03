import type {
  AerariumRun,
  AerariumRunEvent,
  AuditEntityType,
  AuditEvent,
  AuditKind,
  CanonicalRoleId,
  CastraState,
  CommandContext,
  LocalModelCatalogEntry,
  LocalModelCatalogObservation,
  LocalModelCommand,
  LocalModelInvocation,
  LocalModelPolicyVersion,
  LocalModelProposal,
  LocalModelRuntimeUsage,
  VersionedConfiguration,
  WorkLink,
} from "./types.js";

export interface LocalModelSelection {
  ready: boolean;
  reason: string;
  policy: LocalModelPolicyVersion | null;
  catalog: LocalModelCatalogObservation | null;
  model: LocalModelCatalogEntry | null;
}

export function isLocalModelCommand(command: { type: string }): command is LocalModelCommand {
  return command.type.startsWith("local_model.");
}

function requiredText(value: string, label: string, max = 4_000): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > max) throw new Error(`${label} must be ${max.toLocaleString()} characters or fewer.`);
  return normalized;
}

function key(value: string, label: string): string {
  const normalized = requiredText(value, label, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  if (!normalized) throw new Error(`${label} must contain letters or numbers.`);
  return normalized;
}

function uniqueModels(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function workExists(state: CastraState, work: WorkLink): boolean {
  if (work.type === "campaign") return state.campaigns.some((item) => item.id === work.id);
  if (work.type === "mission") return state.missions.some((item) => item.id === work.id);
  if (work.type === "action") return state.actions.some((item) => item.id === work.id);
  return Boolean(work.id.trim());
}

function currentPolicies(state: CastraState): LocalModelPolicyVersion[] {
  const superseded = new Set(
    state.localModelPolicyVersions.map((item) => item.supersedesId).filter((id): id is string => Boolean(id)),
  );
  return state.localModelPolicyVersions.filter((item) => !superseded.has(item.id));
}

function latestCatalog(state: CastraState): LocalModelCatalogObservation | null {
  return state.localModelCatalogObservations.at(-1) ?? null;
}

export function resolveLocalModelSelection(
  state: CastraState,
  input: {
    workflowKey: string;
    activityKey: string;
    riskTier: "low" | "medium" | "high";
    roleId: CanonicalRoleId;
    prompt: string;
  },
): LocalModelSelection {
  const workflowKey = input.workflowKey.trim().toLowerCase();
  const activityKey = input.activityKey.trim().toLowerCase();
  const matching = currentPolicies(state)
    .filter((item) => item.workflowKey === workflowKey && item.activityKey === activityKey)
    .filter((item) => item.roleId === input.roleId || item.roleId === "")
    .sort((a, b) => {
      const rolePriority = Number(b.roleId === input.roleId) - Number(a.roleId === input.roleId);
      if (rolePriority) return rolePriority;
      return state.localModelPolicyVersions.indexOf(b) - state.localModelPolicyVersions.indexOf(a);
    });
  const policy = matching[0] ?? null;
  if (!policy) return { ready: false, reason: "No current policy matches this workflow, activity, and canonical role.", policy: null, catalog: latestCatalog(state), model: null };
  if (!policy.enabled) return { ready: false, reason: "The matching local-model policy is disabled.", policy, catalog: latestCatalog(state), model: null };
  if (!policy.productOwnerPermitted) return { ready: false, reason: "The matching local-model policy is not Product-Owner permitted.", policy, catalog: latestCatalog(state), model: null };
  if (input.riskTier !== policy.riskTier) return { ready: false, reason: `Activity risk ${input.riskTier} does not match policy risk ${policy.riskTier}.`, policy, catalog: latestCatalog(state), model: null };
  if (input.riskTier !== "low") return { ready: false, reason: "Release 1 permits Ollama proposals only for explicitly low-risk activities.", policy, catalog: latestCatalog(state), model: null };
  if (input.prompt.length > policy.maxInputCharacters) return { ready: false, reason: `Prompt exceeds the policy maximum of ${policy.maxInputCharacters.toLocaleString()} characters.`, policy, catalog: latestCatalog(state), model: null };

  const catalog = latestCatalog(state);
  if (!catalog || catalog.runtimeStatus !== "healthy") {
    return { ready: false, reason: catalog?.unavailableReason || "No healthy Ollama loopback catalog observation is recorded.", policy, catalog, model: null };
  }
  if (catalog.adapterId !== "ollama_loopback" || catalog.endpointOrigin !== "http://127.0.0.1:11434" || catalog.locality !== "fixed_os_loopback") {
    return { ready: false, reason: "The latest catalog does not satisfy the fixed loopback adapter contract.", policy, catalog, model: null };
  }

  const activityAllowed = new Set(policy.allowedModelNames);
  const rolePreferred = policy.roleId === input.roleId
    ? policy.rolePreferredModelNames.filter((name) => activityAllowed.has(name))
    : [];
  const candidates = [...new Set([...rolePreferred, ...policy.allowedModelNames])];
  const model = candidates
    .map((name) => catalog.models.find((item) => item.name === name))
    .find((item): item is LocalModelCatalogEntry => item !== undefined && item.capabilities.includes(policy.requiredCapability)) ?? null;
  if (!model) {
    return {
      ready: false,
      reason: `No installed activity-allowed model has recorded capability ${policy.requiredCapability}; no fallback is permitted.`,
      policy,
      catalog,
      model: null,
    };
  }
  return { ready: true, reason: "Activity policy selected a healthy installed local model.", policy, catalog, model };
}

function appendAudit(
  state: CastraState,
  context: CommandContext,
  occurredAt: string,
  kind: AuditKind,
  entityType: AuditEntityType,
  entityId: string,
  summary: string,
  detail: Record<string, string>,
  origin: "direct" | "ollama_loopback" = "direct",
): CastraState {
  const event: AuditEvent = {
    id: context.id("audit"),
    sequence: state.nextAuditSequence,
    occurredAt,
    actor: origin === "direct" ? "Commander" : "Local model adapter",
    origin,
    kind,
    entityType,
    entityId,
    summary,
    detail,
  };
  return { ...state, nextAuditSequence: state.nextAuditSequence + 1, auditEvents: [...state.auditEvents, event] };
}

function nextVersion<T extends VersionedConfiguration>(
  items: T[],
  supersedesId: string | undefined,
  id: string,
): Pick<VersionedConfiguration, "familyId" | "version" | "supersedesId"> {
  if (!supersedesId) return { familyId: id, version: 1, supersedesId: null };
  const previous = items.find((item) => item.id === supersedesId);
  if (!previous) throw new Error("Local-model policy version to supersede was not found.");
  if (items.some((item) => item.supersedesId === previous.id)) throw new Error("Only the current local-model policy version can be superseded.");
  return { familyId: previous.familyId, version: previous.version + 1, supersedesId: previous.id };
}

const unavailableUsage = (): LocalModelRuntimeUsage => ({
  source: "unavailable",
  promptTokens: null,
  completionTokens: null,
  totalDurationMs: null,
  loadDurationMs: null,
  promptEvalDurationMs: null,
  evalDurationMs: null,
});

function createRunEvidence(
  state: CastraState,
  context: CommandContext,
  occurredAt: string,
  invocationId: string,
  work: WorkLink,
  roleId: CanonicalRoleId,
  modelName: string,
): { state: CastraState; runId: string } {
  const runId = context.id("aerarium_run");
  const run: AerariumRun = {
    id: runId,
    title: `Local-model proposal · ${invocationId}`,
    work,
    roleId,
    modelKey: modelName,
    createdAt: occurredAt,
  };
  const start: AerariumRunEvent = {
    id: context.id("aerarium_run_event"),
    runId,
    type: "start",
    occurredAt,
    note: "Explicit Commander-triggered Ollama proposal request.",
    outcome: "",
    inputCharacters: null,
    outputCharacters: null,
    createdAt: occurredAt,
  };
  let next = { ...state, aerariumRuns: [...state.aerariumRuns, run], aerariumRunEvents: [...state.aerariumRunEvents, start] };
  next = appendAudit(next, context, occurredAt, "aerarium_run.created", "aerarium_run", runId, `AERARIUM run created: ${run.title}`, { workType: work.type, workId: work.id, roleId, provenance: "local_model_invocation" });
  next = appendAudit(next, context, occurredAt, "aerarium_run_event.appended", "aerarium_run_event", start.id, `Run event appended: start — ${run.title}`, { runId, occurredAt, provenance: "explicit_commander_request" });
  return { state: next, runId };
}

function closeRunEvidence(
  state: CastraState,
  context: CommandContext,
  occurredAt: string,
  runId: string,
  outcome: string,
  inputCharacters: number,
  outputCharacters: number | null,
  origin: "direct" | "ollama_loopback",
): CastraState {
  const outcomeEvent: AerariumRunEvent = {
    id: context.id("aerarium_run_event"), runId, type: "outcome", occurredAt,
    note: "Local-model adapter outcome; usage and timing remain separately labelled on the linked proposal.", outcome,
    inputCharacters, outputCharacters, createdAt: occurredAt,
  };
  const endEvent: AerariumRunEvent = {
    id: context.id("aerarium_run_event"), runId, type: "end", occurredAt,
    note: "Local-model adapter run closed.", outcome: "", inputCharacters: null, outputCharacters: null, createdAt: occurredAt,
  };
  let next = { ...state, aerariumRunEvents: [...state.aerariumRunEvents, outcomeEvent, endEvent] };
  next = appendAudit(next, context, occurredAt, "aerarium_run_event.appended", "aerarium_run_event", outcomeEvent.id, "Run event appended: local-model outcome", { runId, outcome, provenance: origin }, origin);
  return appendAudit(next, context, occurredAt, "aerarium_run_event.appended", "aerarium_run_event", endEvent.id, "Run event appended: local-model end", { runId, provenance: origin }, origin);
}

function recordUnavailable(
  state: CastraState,
  context: CommandContext,
  occurredAt: string,
  invocation: LocalModelInvocation,
  code: string,
  reason: string,
  origin: "direct" | "ollama_loopback",
): CastraState {
  const proposal: LocalModelProposal = {
    id: context.id("local_model_proposal"),
    invocationId: invocation.id,
    status: "unavailable",
    content: "",
    unavailableCode: code,
    unavailableReason: reason,
    modelName: invocation.selectedModelName,
    modelDigest: invocation.selectedModelDigest,
    usage: unavailableUsage(),
    createdAt: occurredAt,
  };
  let next = { ...state, localModelProposals: [...state.localModelProposals, proposal] };
  next = appendAudit(next, context, occurredAt, "local_model.unavailable_recorded", "local_model_proposal", proposal.id, "Local-model unavailable state recorded", { invocationId: invocation.id, code, reason, remoteFallback: "none" }, origin);
  return closeRunEvidence(next, context, occurredAt, invocation.aerariumRunId, `unavailable:${code}`, invocation.prompt.length, null, origin);
}

export function applyLocalModelCommand(
  state: CastraState,
  command: LocalModelCommand,
  context: CommandContext,
): CastraState {
  const occurredAt = context.now();

  if (command.type === "local_model.policy.version.create") {
    const id = context.id("local_model_policy_version");
    const version = nextVersion(state.localModelPolicyVersions, command.supersedesId, id);
    const allowedModelNames = uniqueModels(command.allowedModelNames);
    const rolePreferredModelNames = uniqueModels(command.rolePreferredModelNames);
    if (allowedModelNames.length === 0) throw new Error("Activity policy requires at least one allowed local model name.");
    if (rolePreferredModelNames.some((name) => !allowedModelNames.includes(name))) {
      throw new Error("Every role-preferred model must also be allowed by the activity policy.");
    }
    if (!Number.isInteger(command.maxInputCharacters) || command.maxInputCharacters < 1 || command.maxInputCharacters > 100_000) throw new Error("Maximum input characters must be an integer from 1 to 100,000.");
    if (!Number.isInteger(command.maxOutputTokens) || command.maxOutputTokens < 1 || command.maxOutputTokens > 32_768) throw new Error("Maximum output tokens must be an integer from 1 to 32,768.");
    const policy: LocalModelPolicyVersion = {
      id,
      ...version,
      name: requiredText(command.name, "Policy name", 180),
      workflowKey: key(command.workflowKey, "Workflow key"),
      activityKey: key(command.activityKey, "Activity key"),
      riskTier: command.riskTier,
      productOwnerPermitted: command.productOwnerPermitted,
      enabled: command.enabled,
      allowedModelNames,
      roleId: command.roleId,
      rolePreferredModelNames,
      requiredCapability: command.requiredCapability,
      maxInputCharacters: command.maxInputCharacters,
      maxOutputTokens: command.maxOutputTokens,
      createdAt: occurredAt,
    };
    const next = { ...state, localModelPolicyVersions: [...state.localModelPolicyVersions, policy] };
    return appendAudit(next, context, occurredAt, "local_model.policy_version_created", "local_model_policy_version", id, `Local-model policy version created: ${policy.name} v${policy.version}`, { workflowKey: policy.workflowKey, activityKey: policy.activityKey, riskTier: policy.riskTier, productOwnerPermitted: String(policy.productOwnerPermitted), roleId: policy.roleId || "any", allowedModels: policy.allowedModelNames.join(",") });
  }

  if (command.type === "local_model.catalog.record") {
    if (command.adapterId !== "ollama_loopback" || command.endpointOrigin !== "http://127.0.0.1:11434" || command.locality !== "fixed_os_loopback") throw new Error("Catalog observation does not satisfy the fixed Ollama loopback contract.");
    const observation: LocalModelCatalogObservation = {
      id: context.id("local_model_catalog_observation"),
      adapterId: command.adapterId,
      adapterVersion: requiredText(command.adapterVersion, "Adapter version", 120),
      catalogVersion: requiredText(command.catalogVersion, "Catalog version", 120),
      endpointOrigin: command.endpointOrigin,
      locality: command.locality,
      localityEvidence: requiredText(command.localityEvidence, "Locality evidence", 1_000),
      runtimeStatus: command.runtimeStatus,
      runtimeVersion: command.runtimeVersion.trim(),
      models: command.models.map((model) => ({ ...model, name: model.name.trim(), digest: model.digest.trim(), capabilities: [...new Set(model.capabilities)] })).filter((model) => Boolean(model.name)),
      unavailableReason: command.runtimeStatus === "unavailable" ? requiredText(command.unavailableReason, "Unavailable reason", 1_000) : "",
      observedAt: command.observedAt,
    };
    const next = { ...state, localModelCatalogObservations: [...state.localModelCatalogObservations, observation] };
    return appendAudit(next, context, occurredAt, "local_model.catalog_observed", "local_model_catalog_observation", observation.id, `Ollama loopback catalog observed: ${observation.runtimeStatus}`, { runtimeVersion: observation.runtimeVersion || "unavailable", installedModels: String(observation.models.length), adapterVersion: observation.adapterVersion, catalogVersion: observation.catalogVersion, endpoint: observation.endpointOrigin, locality: observation.locality, remoteCalls: "0" }, "ollama_loopback");
  }

  if (command.type === "local_model.invocation.request") {
    if (!workExists(state, command.work)) throw new Error("Invocation work-item context was not found.");
    const prompt = requiredText(command.prompt, "Proposal prompt", 100_000);
    const selection = resolveLocalModelSelection(state, { ...command, prompt });
    const invocationId = context.id("local_model_invocation");
    const runEvidence = createRunEvidence(state, context, occurredAt, invocationId, command.work, command.roleId, selection.model?.name ?? "unavailable");
    const invocation: LocalModelInvocation = {
      id: invocationId,
      workflowKey: command.workflowKey.trim().toLowerCase(),
      activityKey: command.activityKey.trim().toLowerCase(),
      riskTier: command.riskTier,
      roleId: command.roleId,
      work: command.work,
      prompt,
      selectedModelName: selection.model?.name ?? "",
      selectedModelDigest: selection.model?.digest ?? "",
      policyVersionId: selection.policy?.id ?? "",
      catalogObservationId: selection.catalog?.id ?? "",
      adapterId: "ollama_loopback",
      adapterVersion: selection.catalog?.adapterVersion ?? "castra-ollama-adapter/1.0.0",
      catalogVersion: selection.catalog?.catalogVersion ?? "ollama-local-catalog/1.0.0",
      endpointOrigin: "http://127.0.0.1:11434",
      locality: "fixed_os_loopback",
      status: selection.ready ? "ready" : "policy_blocked",
      unavailableReason: selection.ready ? "" : selection.reason,
      aerariumRunId: runEvidence.runId,
      requestedAt: occurredAt,
    };
    let next = { ...runEvidence.state, localModelInvocations: [...runEvidence.state.localModelInvocations, invocation] };
    next = appendAudit(next, context, occurredAt, "local_model.invocation_requested", "local_model_invocation", invocation.id, "Commander requested local-model proposal", { workflowKey: invocation.workflowKey, activityKey: invocation.activityKey, riskTier: invocation.riskTier, roleId: invocation.roleId, model: invocation.selectedModelName || "unavailable", policyVersionId: invocation.policyVersionId || "unavailable", catalogObservationId: invocation.catalogObservationId || "unavailable", endpoint: invocation.endpointOrigin, automatic: "false", authority: "proposal_only" });
    if (selection.ready) return next;
    next = appendAudit(next, context, occurredAt, "local_model.invocation_blocked", "local_model_invocation", invocation.id, "Local-model invocation blocked before adapter call", { reason: selection.reason, remoteCalls: "0", localCalls: "0" });
    return recordUnavailable(next, context, occurredAt, invocation, "policy_blocked", selection.reason, "direct");
  }

  if (command.type === "local_model.invocation.complete") {
    const invocation = state.localModelInvocations.find((item) => item.id === command.invocationId);
    if (!invocation) throw new Error("Local-model invocation was not found.");
    if (invocation.status !== "ready") throw new Error("A policy-blocked invocation cannot call the adapter.");
    if (state.localModelProposals.some((item) => item.invocationId === invocation.id)) throw new Error("Local-model invocation already has an immutable outcome.");
    if (command.result.status === "unavailable") {
      return recordUnavailable(state, context, occurredAt, invocation, requiredText(command.result.code, "Unavailable code", 80), requiredText(command.result.reason, "Unavailable reason", 1_000), "ollama_loopback");
    }
    if (command.result.modelName !== invocation.selectedModelName || command.result.modelDigest !== invocation.selectedModelDigest) throw new Error("Adapter result model provenance does not match the policy-selected catalog model.");
    const proposal: LocalModelProposal = {
      id: context.id("local_model_proposal"),
      invocationId: invocation.id,
      status: "proposal",
      content: requiredText(command.result.content, "Proposal content", 500_000),
      unavailableCode: "",
      unavailableReason: "",
      modelName: command.result.modelName,
      modelDigest: command.result.modelDigest,
      usage: command.result.usage,
      createdAt: occurredAt,
    };
    let next = { ...state, localModelProposals: [...state.localModelProposals, proposal] };
    next = appendAudit(next, context, occurredAt, "local_model.proposal_recorded", "local_model_proposal", proposal.id, "Reviewable local-model proposal recorded", { invocationId: invocation.id, model: proposal.modelName, modelDigest: proposal.modelDigest || "unavailable", usageSource: proposal.usage.source, policyVersionId: invocation.policyVersionId, catalogObservationId: invocation.catalogObservationId, authority: "proposal_only", appliedToAuthoritativeRecord: "false" }, "ollama_loopback");
    return closeRunEvidence(next, context, occurredAt, invocation.aerariumRunId, "proposal_recorded", invocation.prompt.length, proposal.content.length, "ollama_loopback");
  }

  const proposal = state.localModelProposals.find((item) => item.id === command.proposalId);
  if (!proposal) throw new Error("Local-model proposal was not found.");
  const review = {
    id: context.id("local_model_review"),
    proposalId: proposal.id,
    decision: command.decision,
    notes: requiredText(command.notes, "Review notes", 2_000),
    reviewedBy: "Commander" as const,
    reviewedAt: occurredAt,
  };
  const next = { ...state, localModelReviews: [...state.localModelReviews, review] };
  return appendAudit(next, context, occurredAt, "local_model.proposal_reviewed", "local_model_review", review.id, `Commander reviewed local-model proposal: ${review.decision}`, { proposalId: proposal.id, decision: review.decision, authoritativeChange: "none" });
}
