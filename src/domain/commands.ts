import type {
  Action,
  AuditEvent,
  AuditKind,
  BaseRecord,
  Campaign,
  CastraCommand,
  CastraRecord,
  CastraState,
  CommandContext,
  DeploymentEligibilityDisposition,
  EntityType,
  LifecycleCommand,
  LifecycleCommandReceipt,
  Mission,
  RecordStatus,
} from "./types.js";
import { applyTestCommand, isTestCommand } from "./testing.js";
import { applyAerariumCommand, isAerariumCommand } from "./aerarium.js";
import { applyPresentationCommand, isPresentationCommand } from "./presentation.js";
import { applyLocalModelCommand, isLocalModelCommand } from "./localModel.js";
import { applyRemoteWorkCommand, isRemoteWorkCommand } from "./remoteWork.js";
import { applyDeploymentWorkbenchCommand, isDeploymentWorkbenchCommand } from "./deploymentWorkbench.js";
import { applyUIReviewCommand, isUIReviewCommand } from "./uiReview.js";
import { applyAuthenticationCommand, isAuthenticationCommand } from "./authentication.js";
import { applySargeEngagementCommand, initialSargeRuntimePolicy, isSargeEngagementCommand } from "./sarge.js";
import {
  deploymentAssessmentChanged,
  deploymentEligibilityTemplate,
  requireDeploymentGate,
} from "./deploymentEligibility.js";
import {
  defaultActionOperationalContext,
  normalizeActionOperationalContext,
  refreshOpenWorkProjection,
} from "./openWork.js";

const transitions: Record<EntityType, Partial<Record<RecordStatus, RecordStatus[]>>> = {
  campaign: {
    draft: ["active"],
    active: ["completed"],
  },
  mission: {
    planned: ["active"],
    active: ["completed"],
  },
  action: {
    planned: ["in_progress"],
    in_progress: ["blocked", "completed"],
    blocked: ["in_progress", "completed"],
  },
};

export function allowedTransitions(record: CastraRecord): RecordStatus[] {
  return transitions[record.type][record.status] ?? [];
}

export function emptyState(): CastraState {
  return {
    schemaVersion: 13,
    migrationProvenance: [],
    nextAuditSequence: 1,
    nextAuthEventSequence: 1,
    campaigns: [],
    missions: [],
    actions: [],
    openWorkIndex: [],
    missionOpenWorkRollups: [],
    lifecycleCommandReceipts: [],
    commandConnectorIdentityReceipts: [],
    commandConnectorResultPackages: [],
    commandConnectorReceipts: [],
    testPlans: [],
    testCycles: [],
    testCases: [],
    testResults: [],
    punchItems: [],
    firewatchVerifications: [],
    exitDecisions: [],
    aerariumRuns: [],
    aerariumRunEvents: [],
    aerariumMeasures: [],
    subscriptionPlanVersions: [],
    modelProfileVersions: [],
    priceCardVersions: [],
    allocationRuleVersions: [],
    budgetSettingsVersions: [],
    presentationVersions: [],
    localModelPolicyVersions: [],
    localModelCatalogObservations: [],
    localModelInvocations: [],
    localModelProposals: [],
    localModelReviews: [],
    remoteWorkProposals: [],
    remoteCommanderDecisions: [],
    remoteCompanionRegistrations: [],
    remoteWorkJobs: [],
    remoteWorkAttempts: [],
    remoteWorkReceipts: [],
    deploymentRequests: [],
    deploymentCommanderDecisions: [],
    deploymentReceipts: [],
    uiReviewPlans: [],
    uiReviewFixtureContracts: [],
    uiReviewCheckpoints: [],
    uiReviewInventoryEntries: [],
    uiReviewItems: [],
    uiReviewDecisions: [],
    uiReviewInvalidations: [],
    uiReviewPunchLinks: [],
    welcomeAccessConfigurationVersions: [],
    authenticationPolicyVersions: [],
    identityReferenceVersions: [],
    authorityAssignments: [],
    authWorkflowRecords: [],
    sessionReceipts: [],
    stepUpReceipts: [],
    authEvents: [],
    sargeRuntimePolicyVersions: [initialSargeRuntimePolicy()],
    sargeEngagementRequests: [],
    sargeCommanderDecisions: [],
    sargeResultPackages: [],
    auditEvents: [],
  };
}

function collectionKey(entityType: EntityType): "campaigns" | "missions" | "actions" {
  if (entityType === "campaign") return "campaigns";
  if (entityType === "mission") return "missions";
  return "actions";
}

export function findRecord(
  state: CastraState,
  entityType: EntityType,
  entityId: string,
): CastraRecord | undefined {
  return state[collectionKey(entityType)].find((record) => record.id === entityId) as
    | CastraRecord
    | undefined;
}

function assertText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > 180) throw new Error(`${label} must be 180 characters or fewer.`);
  return normalized;
}

function createBase(
  id: string,
  title: string,
  description: string,
  notes: string,
  status: RecordStatus,
  occurredAt: string,
): BaseRecord {
  return {
    id,
    title: assertText(title, "Title"),
    description: description.trim(),
    notes: notes.trim(),
    status,
    revision: 1,
    approval: null,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    archivedAt: null,
  };
}

function appendAudit(
  state: CastraState,
  context: CommandContext,
  occurredAt: string,
  kind: AuditKind,
  record: Pick<CastraRecord, "type" | "id">,
  summary: string,
  detail: Record<string, string> = {},
): CastraState {
  const event: AuditEvent = {
    id: context.id("audit"),
    sequence: state.nextAuditSequence,
    occurredAt,
    actor: "Commander",
    origin: "direct",
    kind,
    entityType: record.type,
    entityId: record.id,
    summary,
    detail,
  };
  return {
    ...state,
    nextAuditSequence: state.nextAuditSequence + 1,
    auditEvents: [...state.auditEvents, event],
  };
}

function replaceRecord(state: CastraState, record: CastraRecord): CastraState {
  const key = collectionKey(record.type);
  return {
    ...state,
    [key]: state[key].map((candidate) =>
      candidate.id === record.id ? record : candidate,
    ),
  } as CastraState;
}

function invalidateApproval(
  state: CastraState,
  context: CommandContext,
  occurredAt: string,
  record: CastraRecord,
  reason: string,
): { state: CastraState; record: CastraRecord } {
  if (!record.approval) return { state, record };
  const invalidated = { ...record, approval: null } as CastraRecord;
  const audited = appendAudit(
    state,
    context,
    occurredAt,
    "approval.invalidated",
    record,
    `Approval invalidated for ${record.title}`,
    { reason, approvedRevision: String(record.approval.revision) },
  );
  return { state: audited, record: invalidated };
}

function requireRecord(
  state: CastraState,
  entityType: EntityType,
  entityId: string,
): CastraRecord {
  const record = findRecord(state, entityType, entityId);
  if (!record) throw new Error(`${entityType} record not found.`);
  return record;
}

function campaignForMission(state: CastraState, missionId: string): Campaign {
  const mission = requireRecord(state, "mission", missionId) as Mission;
  return requireRecord(state, "campaign", mission.campaignId) as Campaign;
}

function assertEligibleDisposition(
  campaign: Campaign,
  disposition: DeploymentEligibilityDisposition,
  explanation: string,
): string {
  const normalizedExplanation = assertText(explanation, "Disposition explanation");
  if (disposition !== "eligible") return normalizedExplanation;
  const gate = campaign.deploymentEligibility;
  const missing = [
    gate.webDeploymentIntent === "unresolved" && "web deployment intent",
    gate.brandedSubdomainRequirement === "unresolved" && "branded subdomain requirement",
    gate.standardPattern === "unresolved" && "standard pattern assessment",
    gate.commercialUse === "unresolved" && "commercial/branded use assessment",
    gate.providerEligibility !== "verified_eligible" && "verified provider account/plan eligibility",
    gate.brandedSubdomainRequirement === "required" && !gate.proposedHostname.trim() && "proposed hostname",
    !gate.dnsAuthorityState.trim() && "DNS authority state",
    !gate.exportImportImplication.trim() && "export/import implication",
    !gate.hostedPersistenceImplication.trim() && "hosted persistence implication",
    !gate.authenticationImplication.trim() && "authentication implication",
    !gate.synchronizationImplication.trim() && "synchronization implication",
    !gate.migrationImplication.trim() && "migration implication",
    !gate.providerChangeAssessment.trim() && "provider plan/cost/capability/terms assessment",
    !gate.evidenceReference.trim() && "evidence/reference",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Eligible disposition requires: ${missing.join(", ")}.`);
  }
  return normalizedExplanation;
}

function isLifecycleCommand(command: CastraCommand): command is LifecycleCommand {
  return ["action.close", "mission.close", "record.reopen", "action.follow_up.create"].includes(command.type);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function lifecycleBinding(command: LifecycleCommand): string {
  const serialized = stableSerialize(command);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function lifecycleCommandId(command: LifecycleCommand): string {
  return assertText(command.commandId, "Lifecycle command ID");
}

function lifecycleEvidence(references: string[]): string[] {
  const normalized = [...new Set(references.map((reference) => reference.trim()).filter(Boolean))];
  if (normalized.length === 0) throw new Error("At least one evidence reference is required.");
  if (normalized.length > 20) throw new Error("No more than 20 evidence references are allowed.");
  if (normalized.some((reference) => reference.length > 240)) {
    throw new Error("Evidence references must be 240 characters or fewer.");
  }
  return normalized;
}

function assertLifecycleAuthority(context: CommandContext): void {
  if (context.commandAuthority !== "Commander") {
    throw new Error("Governed lifecycle commands require explicit Commander authority.");
  }
}

function requireExpectedRevision(record: Mission | Action, expectedRevision: number): void {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new Error("Expected revision must be a positive integer.");
  }
  if (record.revision !== expectedRevision) {
    throw new Error(`Revision mismatch: expected ${expectedRevision}, current ${record.revision}.`);
  }
}

function lifecycleReplay(state: CastraState, command: LifecycleCommand): CastraState | null {
  const commandId = lifecycleCommandId(command);
  const existing = state.lifecycleCommandReceipts.find((receipt) => receipt.commandId === commandId);
  if (!existing) return null;
  if (existing.binding !== lifecycleBinding(command)) {
    throw new Error("Lifecycle command ID was already used for different content.");
  }
  return state;
}

function recordLifecycleReceipt(
  state: CastraState,
  context: CommandContext,
  command: LifecycleCommand,
  receipt: Omit<LifecycleCommandReceipt, "commandId" | "commandType" | "binding" | "auditSequence" | "occurredAt">,
  record: Mission | Action,
  kind: "record.closed" | "record.reopened" | "action.follow_up.created",
  summary: string,
  occurredAt: string,
): CastraState {
  const lifecycleReceipt: LifecycleCommandReceipt = {
    ...receipt,
    commandId: lifecycleCommandId(command),
    commandType: command.type,
    binding: lifecycleBinding(command),
    auditSequence: state.nextAuditSequence,
    occurredAt,
  };
  return appendAudit(
    { ...state, lifecycleCommandReceipts: [...state.lifecycleCommandReceipts, lifecycleReceipt] },
    context,
    occurredAt,
    kind,
    record,
    summary,
    {
      commandId: lifecycleReceipt.commandId,
      expectedRevision: String(lifecycleReceipt.expectedRevision),
      resultingRevision: String(lifecycleReceipt.resultingRevision),
      reason: lifecycleReceipt.reason,
      evidenceReferences: lifecycleReceipt.evidenceReferences.join(" | "),
      followUpActionId: lifecycleReceipt.followUpActionId ?? "",
    },
  );
}

function applyLifecycleCommand(
  state: CastraState,
  command: LifecycleCommand,
  context: CommandContext,
  occurredAt: string,
): CastraState {
  assertLifecycleAuthority(context);
  const replay = lifecycleReplay(state, command);
  if (replay) return replay;
  const reason = assertText(command.reason, "Lifecycle reason");
  const evidenceReferences = lifecycleEvidence(command.evidenceReferences);

  if (command.type === "action.close") {
    const current = requireRecord(state, "action", command.actionId) as Action;
    if (current.archivedAt) throw new Error("Restore the Action before closing it.");
    requireExpectedRevision(current, command.expectedRevision);
    if (current.status === "completed") throw new Error("Action is already closed; replay the original command ID or create a follow-up.");
    if (!["in_progress", "blocked"].includes(current.status)) throw new Error("Action must be In progress or Blocked before governed closure.");
    if (current.actionKind === "deployment") {
      requireDeploymentGate(campaignForMission(state, current.missionId), "Closing a deployment action");
    }
    const resultingRevision = current.revision + 1;
    const closed: Action = {
      ...current,
      status: "completed",
      revision: resultingRevision,
      approval: { approvedAt: occurredAt, approvedBy: "Commander", revision: resultingRevision },
      operationalContext: {
        ...normalizeActionOperationalContext(current.operationalContext),
        blocker: "",
        attentionState: "normal",
        nextGate: "Closed by governed Commander command.",
        evidenceReference: evidenceReferences[0],
        evidenceReferences,
      },
      updatedAt: occurredAt,
    };
    return recordLifecycleReceipt(
      replaceRecord(state, closed),
      context,
      command,
      {
        entityType: "action",
        entityId: closed.id,
        expectedRevision: command.expectedRevision,
        resultingRevision,
        reason,
        evidenceReferences,
        followUpActionId: null,
      },
      closed,
      "record.closed",
      `Action closed by Commander: ${closed.title}`,
      occurredAt,
    );
  }

  if (command.type === "mission.close") {
    const current = requireRecord(state, "mission", command.missionId) as Mission;
    if (current.archivedAt) throw new Error("Restore the Mission before closing it.");
    requireExpectedRevision(current, command.expectedRevision);
    if (current.status === "completed") throw new Error("Mission is already closed; replay the original command ID or create follow-up work.");
    if (current.status !== "active") throw new Error("Mission must be Active before governed closure.");
    const children = state.actions.filter((action) => action.missionId === current.id && !action.archivedAt);
    const unresolved = children.filter((action) => action.status !== "completed");
    if (unresolved.length > 0) throw new Error(`Mission closure is blocked by ${unresolved.length} unresolved Action(s).`);
    const resultingRevision = current.revision + 1;
    const closed: Mission = {
      ...current,
      status: "completed",
      revision: resultingRevision,
      approval: { approvedAt: occurredAt, approvedBy: "Commander", revision: resultingRevision },
      updatedAt: occurredAt,
    };
    return recordLifecycleReceipt(
      replaceRecord(state, closed),
      context,
      command,
      {
        entityType: "mission",
        entityId: closed.id,
        expectedRevision: command.expectedRevision,
        resultingRevision,
        reason,
        evidenceReferences,
        followUpActionId: null,
      },
      closed,
      "record.closed",
      `Mission closed by Commander: ${closed.title}`,
      occurredAt,
    );
  }

  if (command.type === "record.reopen") {
    const current = requireRecord(state, command.entityType, command.entityId) as Mission | Action;
    if (current.archivedAt) throw new Error(`Restore the ${humanizeLifecycleEntity(current.type)} before reopening it.`);
    requireExpectedRevision(current, command.expectedRevision);
    if (current.status !== "completed") throw new Error(`${humanizeLifecycleEntity(current.type)} must be completed before it can be reopened.`);
    if (current.type === "action") {
      const mission = requireRecord(state, "mission", current.missionId) as Mission;
      if (mission.status === "completed") throw new Error("Reopen the governing Mission before reopening this Action.");
    }
    const resultingRevision = current.revision + 1;
    const reopened = {
      ...current,
      status: current.type === "mission" ? "active" : "in_progress",
      revision: resultingRevision,
      approval: null,
      ...(current.type === "action" ? {
        operationalContext: {
          ...normalizeActionOperationalContext(current.operationalContext),
          attentionState: "normal" as const,
          nextGate: "Resolve the Commander-authorized reopen reason and submit new evidence.",
          evidenceReference: evidenceReferences[0],
          evidenceReferences,
        },
      } : {}),
      updatedAt: occurredAt,
    } as Mission | Action;
    return recordLifecycleReceipt(
      replaceRecord(state, reopened),
      context,
      command,
      {
        entityType: reopened.type,
        entityId: reopened.id,
        expectedRevision: command.expectedRevision,
        resultingRevision,
        reason,
        evidenceReferences,
        followUpActionId: null,
      },
      reopened,
      "record.reopened",
      `${humanizeLifecycleEntity(reopened.type)} reopened by Commander: ${reopened.title}`,
      occurredAt,
    );
  }

  const source = requireRecord(state, "action", command.sourceActionId) as Action;
  if (source.archivedAt) throw new Error("Restore the source Action before creating a linked follow-up.");
  requireExpectedRevision(source, command.expectedSourceRevision);
  if (source.status !== "completed") throw new Error("A governed follow-up requires a completed source Action.");
  const sourceMission = requireRecord(state, "mission", source.missionId) as Mission;
  const targetMission = requireRecord(state, "mission", command.missionId ?? source.missionId) as Mission;
  if (targetMission.archivedAt || targetMission.status === "completed") throw new Error("The follow-up Mission must be active and unarchived.");
  if (sourceMission.campaignId !== targetMission.campaignId) throw new Error("A follow-up Action must remain in the source Campaign.");
  const followUp: Action = {
    ...createBase(context.id("action"), command.title, command.description, command.notes, "planned", occurredAt),
    type: "action",
    missionId: targetMission.id,
    actionKind: "standard",
    operationalContext: {
      ...defaultActionOperationalContext(),
      nextGate: reason,
      evidenceReference: evidenceReferences[0],
    },
    followUpToActionId: source.id,
  };
  return recordLifecycleReceipt(
    { ...state, actions: [...state.actions, followUp] },
    context,
    command,
    {
      entityType: "action",
      entityId: source.id,
      expectedRevision: command.expectedSourceRevision,
      resultingRevision: source.revision,
      reason,
      evidenceReferences,
      followUpActionId: followUp.id,
    },
    followUp,
    "action.follow_up.created",
    `Follow-up Action created from ${source.title}: ${followUp.title}`,
    occurredAt,
  );
}

function humanizeLifecycleEntity(entityType: "mission" | "action"): "Mission" | "Action" {
  return entityType === "mission" ? "Mission" : "Action";
}

function applyCommandCore(
  state: CastraState,
  command: CastraCommand,
  context: CommandContext,
): CastraState {
  const occurredAt = context.now();

  if (command.type === "campaign.create") {
    const record: Campaign = {
      ...createBase(
        context.id("campaign"),
        command.title,
        command.description,
        command.notes,
        "draft",
        occurredAt,
      ),
      type: "campaign",
      commanderIntent: command.commanderIntent.trim(),
      deploymentEligibility: deploymentEligibilityTemplate(),
    };
    return appendAudit(
      { ...state, campaigns: [...state.campaigns, record] },
      context,
      occurredAt,
      "record.created",
      record,
      `Campaign created: ${record.title}`,
    );
  }

  if (command.type === "mission.create") {
    const parent = requireRecord(state, "campaign", command.campaignId);
    if (parent.archivedAt) throw new Error("Cannot add a mission to an archived campaign.");
    if (parent.status === "completed") throw new Error("Create follow-up work under an active Campaign; completed Campaigns are immutable.");
    const record: Mission = {
      ...createBase(
        context.id("mission"),
        command.title,
        command.description,
        command.notes,
        "planned",
        occurredAt,
      ),
      type: "mission",
      campaignId: command.campaignId,
    };
    return appendAudit(
      { ...state, missions: [...state.missions, record] },
      context,
      occurredAt,
      "record.created",
      record,
      `Mission created: ${record.title}`,
      { campaignId: command.campaignId },
    );
  }

  if (command.type === "action.create") {
    const parent = requireRecord(state, "mission", command.missionId);
    if (parent.archivedAt) throw new Error("Cannot add an action to an archived mission.");
    if (parent.status === "completed") throw new Error("Use a governed follow-up under an active Mission; completed Missions are immutable.");
    const actionKind = command.actionKind ?? "standard";
    if (actionKind === "deployment") {
      requireDeploymentGate(
        campaignForMission(state, command.missionId),
        "Creating a deployment action",
      );
    }
    const record: Action = {
      ...createBase(
        context.id("action"),
        command.title,
        command.description,
        command.notes,
        "planned",
        occurredAt,
      ),
      type: "action",
      missionId: command.missionId,
      actionKind,
      operationalContext: defaultActionOperationalContext(),
      followUpToActionId: null,
    };
    return appendAudit(
      { ...state, actions: [...state.actions, record] },
      context,
      occurredAt,
      "record.created",
      record,
      `Action created: ${record.title}`,
      { missionId: command.missionId, actionKind: record.actionKind },
    );
  }

  if (isLifecycleCommand(command)) {
    return applyLifecycleCommand(state, command, context, occurredAt);
  }

  if (isTestCommand(command)) {
    return applyTestCommand(state, command, context);
  }

  if (isAerariumCommand(command)) {
    return applyAerariumCommand(state, command, context);
  }

  if (isPresentationCommand(command)) {
    return applyPresentationCommand(state, command, context);
  }

  if (isLocalModelCommand(command)) {
    return applyLocalModelCommand(state, command, context);
  }

  if (isRemoteWorkCommand(command)) {
    return applyRemoteWorkCommand(state, command, context);
  }

  if (isSargeEngagementCommand(command)) {
    return applySargeEngagementCommand(state, command, context);
  }

  if (isDeploymentWorkbenchCommand(command)) {
    return applyDeploymentWorkbenchCommand(state, command, context);
  }

  if (isUIReviewCommand(command)) {
    return applyUIReviewCommand(state, command, context);
  }

  if (isAuthenticationCommand(command)) {
    return applyAuthenticationCommand(state, command, context);
  }

  if (command.type === "campaign.deployment_eligibility.update") {
    const current = requireRecord(state, "campaign", command.campaignId) as Campaign;
    if (current.archivedAt) throw new Error("Restore the Campaign before changing its deployment eligibility.");
    const assessment = Object.fromEntries(
      Object.entries(command.assessment).map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : value,
      ]),
    ) as typeof command.assessment;
    if (!deploymentAssessmentChanged(current.deploymentEligibility, assessment)) return state;

    const approvalInvalidation = invalidateApproval(
      state,
      context,
      occurredAt,
      current,
      "Deployment eligibility material fields changed.",
    );
    let working = approvalInvalidation.state;
    if (current.deploymentEligibility.disposition) {
      working = appendAudit(
        working,
        context,
        occurredAt,
        "deployment_eligibility.disposition_invalidated",
        current,
        `Deployment eligibility disposition invalidated: ${current.title}`,
        {
          previousDisposition: current.deploymentEligibility.disposition,
          reason: "Material deployment eligibility fields changed.",
        },
      );
    }
    const updated: Campaign = {
      ...(approvalInvalidation.record as Campaign),
      deploymentEligibility: {
        ...assessment,
        disposition: null,
        dispositionExplanation: "",
        disposedAt: null,
        disposedBy: null,
      },
      revision: current.revision + 1,
      updatedAt: occurredAt,
    };
    return appendAudit(
      replaceRecord(working, updated),
      context,
      occurredAt,
      "deployment_eligibility.updated",
      updated,
      `Deployment eligibility assessment updated: ${updated.title}`,
      { revision: String(updated.revision), disposition: "unresolved" },
    );
  }

  if (command.type === "campaign.deployment_eligibility.disposition") {
    const current = requireRecord(state, "campaign", command.campaignId) as Campaign;
    if (current.archivedAt) throw new Error("Restore the Campaign before recording its deployment disposition.");
    const allowed: DeploymentEligibilityDisposition[] = [
      "eligible",
      "not_applicable",
      "product_owner_decision_required",
    ];
    if (!allowed.includes(command.disposition)) {
      throw new Error("Deployment disposition must be Eligible, Not applicable, or Product Owner decision required.");
    }
    const explanation = assertEligibleDisposition(current, command.disposition, command.explanation);
    if (
      current.deploymentEligibility.disposition === command.disposition
      && current.deploymentEligibility.dispositionExplanation === explanation
    ) return state;
    const approvalInvalidation = invalidateApproval(
      state,
      context,
      occurredAt,
      current,
      "Deployment eligibility disposition changed.",
    );
    const updated: Campaign = {
      ...(approvalInvalidation.record as Campaign),
      deploymentEligibility: {
        ...current.deploymentEligibility,
        disposition: command.disposition,
        dispositionExplanation: explanation,
        disposedAt: occurredAt,
        disposedBy: "Commander",
      },
      revision: current.revision + 1,
      updatedAt: occurredAt,
    };
    return appendAudit(
      replaceRecord(approvalInvalidation.state, updated),
      context,
      occurredAt,
      "deployment_eligibility.disposition_recorded",
      updated,
      `Deployment eligibility disposition recorded: ${updated.title}`,
      { disposition: command.disposition, revision: String(updated.revision) },
    );
  }

  if (command.type === "action.operational_context.update") {
    const current = requireRecord(state, "action", command.actionId) as Action;
    if (current.archivedAt) throw new Error("Restore the Action before changing its operational context.");
    if (current.status === "completed") throw new Error("Completed Actions are immutable; create a follow-up or use a Commander-authorized reopen command.");
    const operationalContext = normalizeActionOperationalContext(command.context);
    const prior = normalizeActionOperationalContext(current.operationalContext);
    if (JSON.stringify(prior) === JSON.stringify(operationalContext)) return state;
    const invalidation = invalidateApproval(
      state,
      context,
      occurredAt,
      current,
      "Operational owner, blocker, next gate, evidence, or attention state changed.",
    );
    const updated: Action = {
      ...(invalidation.record as Action),
      operationalContext,
      revision: current.revision + 1,
      updatedAt: occurredAt,
    };
    return appendAudit(
      replaceRecord(invalidation.state, updated),
      context,
      occurredAt,
      "action.operational_context.updated",
      updated,
      `Operational context updated: ${updated.title}`,
      {
        owner: operationalContext.owner,
        attentionState: operationalContext.attentionState,
        hasBlocker: String(Boolean(operationalContext.blocker)),
        hasEvidenceReference: String(Boolean(operationalContext.evidenceReference)),
      },
    );
  }

  const current = requireRecord(state, command.entityType, command.entityId);

  if (command.type === "record.update") {
    if (current.status === "completed") throw new Error("Completed records are immutable; create a follow-up or use a Commander-authorized reopen command.");
    const changed =
      current.title !== command.title.trim() ||
      current.description !== command.description.trim() ||
      current.notes !== command.notes.trim() ||
      (current.type === "campaign" &&
        current.commanderIntent !== (command.commanderIntent ?? "").trim()) ||
      (current.type === "action" &&
        current.actionKind !== (command.actionKind ?? current.actionKind));
    if (!changed) return state;

    const invalidation = invalidateApproval(
      state,
      context,
      occurredAt,
      current,
      "Material record content changed.",
    );
    let updated: CastraRecord = {
      ...invalidation.record,
      title: assertText(command.title, "Title"),
      description: command.description.trim(),
      notes: command.notes.trim(),
      revision: current.revision + 1,
      updatedAt: occurredAt,
    } as CastraRecord;
    if (updated.type === "campaign") {
      updated = {
        ...updated,
        commanderIntent: (command.commanderIntent ?? "").trim(),
      };
    }
    if (updated.type === "action") {
      const actionKind = command.actionKind ?? (current.type === "action" ? current.actionKind : "standard");
      if (actionKind === "deployment" && current.type === "action" && current.actionKind !== "deployment") {
        requireDeploymentGate(
          campaignForMission(state, updated.missionId),
          "Changing an Action to deployment",
        );
      }
      updated = { ...updated, actionKind };
    }
    return appendAudit(
      replaceRecord(invalidation.state, updated),
      context,
      occurredAt,
      "record.updated",
      updated,
      `${updated.type} updated: ${updated.title}`,
      { revision: String(updated.revision) },
    );
  }

  if (command.type === "record.move") {
    if (current.type === "campaign") throw new Error("Campaigns do not have a parent record.");
    if (current.status === "completed") throw new Error("Completed records cannot be moved; create a follow-up or use a Commander-authorized reopen command.");
    const parentType = current.type === "mission" ? "campaign" : "mission";
    const parent = requireRecord(state, parentType, command.parentId);
    if (parent.archivedAt) throw new Error("Cannot move a record under an archived parent.");
    const oldParentId = current.type === "mission" ? current.campaignId : current.missionId;
    if (oldParentId === command.parentId) return state;

    const invalidation = invalidateApproval(
      state,
      context,
      occurredAt,
      current,
      "Parent relationship changed.",
    );
    const moved = {
      ...invalidation.record,
      ...(current.type === "mission"
        ? { campaignId: command.parentId }
        : { missionId: command.parentId }),
      revision: current.revision + 1,
      updatedAt: occurredAt,
    } as CastraRecord;
    return appendAudit(
      replaceRecord(invalidation.state, moved),
      context,
      occurredAt,
      "record.moved",
      moved,
      `${moved.type} moved: ${moved.title}`,
      { from: oldParentId, to: command.parentId },
    );
  }

  if (command.type === "record.transition") {
    if (current.archivedAt) throw new Error("Restore the record before changing its status.");
    if (!allowedTransitions(current).includes(command.status)) {
      throw new Error(`Transition from ${current.status} to ${command.status} is not allowed.`);
    }
    if (command.status === "completed" && (current.type === "action" || current.type === "mission")) {
      throw new Error(`Use the governed ${current.type}.close command with exact revision and evidence.`);
    }
    if (current.type === "campaign" && command.status === "completed") {
      requireDeploymentGate(current, "Completing a Campaign as an external-release representation");
    }
    if (current.type === "action" && current.actionKind === "deployment") {
      requireDeploymentGate(
        campaignForMission(state, current.missionId),
        "Advancing a deployment action",
      );
    }
    const invalidation = invalidateApproval(
      state,
      context,
      occurredAt,
      current,
      "Lifecycle status changed.",
    );
    const transitioned = {
      ...invalidation.record,
      status: command.status,
      revision: current.revision + 1,
      updatedAt: occurredAt,
    } as CastraRecord;
    return appendAudit(
      replaceRecord(invalidation.state, transitioned),
      context,
      occurredAt,
      "status.transitioned",
      transitioned,
      `${transitioned.title}: ${current.status} → ${command.status}`,
      { from: current.status, to: command.status },
    );
  }

  if (command.type === "record.archive") {
    if (current.archivedAt) return state;
    const invalidation = invalidateApproval(
      state,
      context,
      occurredAt,
      current,
      "Record archived.",
    );
    const archived = {
      ...invalidation.record,
      archivedAt: occurredAt,
      revision: current.revision + 1,
      updatedAt: occurredAt,
    } as CastraRecord;
    return appendAudit(
      replaceRecord(invalidation.state, archived),
      context,
      occurredAt,
      "record.archived",
      archived,
      `${archived.type} archived: ${archived.title}`,
    );
  }

  if (command.type === "record.restore") {
    if (!current.archivedAt) return state;
    const restored = {
      ...current,
      archivedAt: null,
      revision: current.revision + 1,
      updatedAt: occurredAt,
    } as CastraRecord;
    return appendAudit(
      replaceRecord(state, restored),
      context,
      occurredAt,
      "record.restored",
      restored,
      `${restored.type} restored: ${restored.title}`,
    );
  }

  if (command.type === "record.approve") {
    if (current.archivedAt) throw new Error("Archived records cannot be approved.");
    if (current.approval?.revision === current.revision) return state;
    const approved = {
      ...current,
      approval: {
        approvedAt: occurredAt,
        approvedBy: "Commander" as const,
        revision: current.revision,
      },
      updatedAt: occurredAt,
    } as CastraRecord;
    return appendAudit(
      replaceRecord(state, approved),
      context,
      occurredAt,
      "approval.granted",
      approved,
      `Commander approved ${approved.title}`,
      { revision: String(approved.revision) },
    );
  }

  return state;
}

export function applyCommand(
  state: CastraState,
  command: CastraCommand,
  context: CommandContext,
): CastraState {
  return refreshOpenWorkProjection(applyCommandCore(state, command, context));
}
