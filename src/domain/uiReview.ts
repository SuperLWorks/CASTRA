import type {
  AuditEvent,
  AuditKind,
  CastraState,
  CommandContext,
  PunchItem,
  UIReviewCheckpoint,
  UIReviewCheckpointCode,
  UIReviewCommand,
  UIReviewDecision,
  UIReviewFixtureContract,
  UIReviewInventoryEntry,
  UIReviewPlan,
} from "./types.js";

export const UI_REVIEW_CHECKPOINT_CATALOG: ReadonlyArray<{
  code: UIReviewCheckpointCode;
  name: string;
  intent: string;
}> = [
  { code: "UI-01", name: "Experience Intent", intent: "Confirm users, outcomes, constraints, and experience principles." },
  { code: "UI-02", name: "Information Architecture", intent: "Confirm navigation, hierarchy, labels, and findability." },
  { code: "UI-03", name: "Populated Prototype", intent: "Review deterministic representative data across planned screens and states." },
  { code: "UI-04", name: "Functional Slice", intent: "Review working interactions and deterministic record behavior." },
  { code: "UI-05", name: "Full-State Review", intent: "Review the complete required screen and state inventory." },
  { code: "UI-06", name: "Release Candidate", intent: "Review release-candidate presentation and unresolved punch evidence." },
  { code: "UI-07", name: "BASEOPS Review", intent: "Review the deployed-product operating experience after release." },
];

const checkpointNames = Object.fromEntries(
  UI_REVIEW_CHECKPOINT_CATALOG.map((entry) => [entry.code, entry.name]),
) as Record<UIReviewCheckpointCode, string>;

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function normalizeList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `uis-v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function uiReviewInventoryEvidenceScope(state: CastraState, checkpointId: string): string {
  const checkpoint = requireCheckpoint(state, checkpointId);
  const inventory = state.uiReviewInventoryEntries
    .filter((entry) => entry.checkpointId === checkpointId)
    .map((entry) => ({
      id: entry.id,
      screenKey: entry.screenKey,
      screenName: entry.screenName,
      componentReference: entry.componentReference,
      states: [...entry.states].sort(),
      additionalStates: [...entry.additionalStates].sort(),
      evidenceReferences: [...entry.evidenceReferences].sort(),
      fixtureContractId: entry.fixtureContractId,
      dataSource: entry.dataSource,
      destination: entry.destination,
      inspectionFocus: entry.inspectionFocus,
      knownIntentionalGaps: entry.knownIntentionalGaps,
      requestedDecision: entry.requestedDecision,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return stableHash(JSON.stringify({
    checkpointId,
    checkpointRevision: checkpoint.revision,
    scope: checkpoint.scope,
    coveredUiRevision: checkpoint.coveredUiRevision,
    evidenceRequirement: checkpoint.evidenceRequirement,
    evidenceReferences: [...checkpoint.evidenceReferences].sort(),
    inventory,
  }));
}

export function validateUIReviewFixtureTarget(
  fixture: UIReviewFixtureContract,
  targetAuthority: "ui_review_fixture" | "authoritative",
): void {
  if (
    targetAuthority !== "ui_review_fixture" ||
    fixture.authority !== "demonstration_only" ||
    fixture.storageBoundary !== "isolated_ui_review_fixture" ||
    fixture.canTargetAuthoritativeData !== false
  ) {
    throw new Error("UI review fixture data cannot target authoritative Commander records.");
  }
}

export function isUIReviewCommand(command: { type: string }): command is UIReviewCommand {
  return command.type.startsWith("ui_review.");
}

function appendAudit(
  state: CastraState,
  context: CommandContext,
  occurredAt: string,
  kind: AuditKind,
  entityType: AuditEvent["entityType"],
  entityId: string,
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
    entityType,
    entityId,
    summary,
    detail,
  };
  return {
    ...state,
    nextAuditSequence: state.nextAuditSequence + 1,
    auditEvents: [...state.auditEvents, event],
  };
}

function requirePlan(state: CastraState, id: string): UIReviewPlan {
  const plan = state.uiReviewPlans.find((candidate) => candidate.id === id);
  if (!plan) throw new Error("UI review plan not found.");
  return plan;
}

function requireCheckpoint(state: CastraState, id: string): UIReviewCheckpoint {
  const checkpoint = state.uiReviewCheckpoints.find((candidate) => candidate.id === id);
  if (!checkpoint) throw new Error("UI review checkpoint not found.");
  return checkpoint;
}

function checkpointCurrentDecision(state: CastraState, checkpointId: string): UIReviewDecision | undefined {
  return state.uiReviewDecisions
    .filter((decision) => decision.checkpointId === checkpointId)
    .filter((decision) => !state.uiReviewInvalidations.some((item) => item.decisionId === decision.id))
    .at(-1);
}

function invalidateCheckpoint(
  state: CastraState,
  checkpointId: string,
  newCheckpointRevision: number,
  reason: string,
  context: CommandContext,
  occurredAt: string,
): CastraState {
  const decision = checkpointCurrentDecision(state, checkpointId);
  if (!decision) return state;
  const invalidation = {
    id: context.id("ui_review_invalidation"),
    decisionId: decision.id,
    checkpointId,
    reason,
    previousScope: decision.inventoryEvidenceScope,
    newCheckpointRevision,
    invalidatedAt: occurredAt,
  };
  const checkpoint = requireCheckpoint(state, checkpointId);
  const withInvalidation = {
    ...state,
    uiReviewInvalidations: [...state.uiReviewInvalidations, invalidation],
    uiReviewCheckpoints: state.uiReviewCheckpoints.map((item) =>
      item.id === checkpointId ? { ...item, status: "invalidated" as const, updatedAt: occurredAt } : item,
    ),
  };
  return appendAudit(
    withInvalidation,
    context,
    occurredAt,
    "ui_review.decision_invalidated",
    "ui_review_invalidation",
    invalidation.id,
    `${checkpoint.code} decision invalidated`,
    { decisionId: decision.id, reason, previousScope: decision.inventoryEvidenceScope },
  );
}

function createCheckpoint(
  planId: string,
  code: UIReviewCheckpointCode,
  occurredAt: string,
  context: CommandContext,
): UIReviewCheckpoint {
  return {
    id: context.id("ui_review_checkpoint"),
    planId,
    code,
    name: checkpointNames[code],
    revision: 1,
    scope: "",
    coveredUiRevision: "",
    status: "not_started",
    evidenceRequirement: "",
    evidenceReferences: [],
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
}

function assertUniqueCodes(codes: UIReviewCheckpointCode[]): UIReviewCheckpointCode[] {
  const unique = [...new Set(codes)];
  if (unique.length !== codes.length) throw new Error("Required UI checkpoints must be unique.");
  return unique;
}

export function applyUIReviewCommand(
  state: CastraState,
  command: UIReviewCommand,
  context: CommandContext,
): CastraState {
  const occurredAt = context.now();

  if (command.type === "ui_review.plan.create") {
    const campaign = state.campaigns.find((item) => item.id === command.campaignId);
    if (!campaign) throw new Error("Campaign not found.");
    if (campaign.archivedAt) throw new Error("Restore the Campaign before configuring UI review.");
    if (state.uiReviewPlans.some((plan) => plan.campaignId === campaign.id)) {
      throw new Error("This Campaign already has a UI review plan.");
    }
    const requiredCheckpoints = assertUniqueCodes(command.requiredCheckpoints);
    if (command.applicability === "not_applicable") {
      requiredText(command.applicabilityReason, "Not applicable reason");
      requiredText(command.applicabilityEvidenceReference, "Commander evidence reference");
      if (requiredCheckpoints.length > 0) throw new Error("A Not applicable plan cannot require UI checkpoints.");
    } else {
      requiredText(command.experienceIntent, "Experience intent");
      requiredText(command.devicesAndScreenSizes, "Devices and screen sizes");
      requiredText(command.themeAndNavigationPattern, "Theme and navigation pattern");
      requiredText(command.demonstrationDataNeeds, "Demonstration-data needs");
      requiredText(command.evidenceRequirement, "Evidence requirement");
      if (requiredCheckpoints.length === 0) throw new Error("At least one UI review checkpoint is required.");
    }
    const planId = context.id("ui_review_plan");
    const plan: UIReviewPlan = {
      id: planId,
      contractVersion: 1,
      campaignId: campaign.id,
      revision: 1,
      applicability: command.applicability,
      applicabilityReason: command.applicabilityReason.trim(),
      applicabilityEvidenceReference: command.applicabilityEvidenceReference.trim(),
      experienceIntent: command.experienceIntent.trim(),
      devicesAndScreenSizes: command.devicesAndScreenSizes.trim(),
      themeAndNavigationPattern: command.themeAndNavigationPattern.trim(),
      requiredCheckpoints,
      demonstrationDataNeeds: command.demonstrationDataNeeds.trim(),
      approver: "Commander",
      evidenceRequirement: command.evidenceRequirement.trim(),
      screenshotRequired: command.screenshotRequired,
      status: command.applicability === "not_applicable" ? "not_applicable" : "configured",
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    const checkpoints = requiredCheckpoints.map((code) => createCheckpoint(planId, code, occurredAt, context));
    const nextBase: CastraState = {
      ...state,
      uiReviewPlans: [...state.uiReviewPlans, plan],
      uiReviewCheckpoints: [...state.uiReviewCheckpoints, ...checkpoints],
    };
    const next = command.applicability === "ui"
      ? {
          ...nextBase,
          uiReviewFixtureContracts: [
            ...nextBase.uiReviewFixtureContracts,
            {
              id: context.id("ui_review_fixture_contract"),
              contractVersion: 1,
              planId,
              namespace: `ui-review/${planId}`,
              visibleLabel: "DEMONSTRATION DATA · NOT AUTHORITATIVE",
              authority: "demonstration_only",
              storageBoundary: "isolated_ui_review_fixture",
              canTargetAuthoritativeData: false,
              populated: false,
              status: "contract_only_not_built",
              createdAt: occurredAt,
            },
          ],
        } satisfies CastraState
      : nextBase;
    return appendAudit(next, context, occurredAt, "ui_review.plan_created", "ui_review_plan", plan.id,
      `UI review plan created for ${campaign.title}`,
      { applicability: plan.applicability, revision: "1", checkpointCount: String(checkpoints.length) });
  }

  if (command.type === "ui_review.plan.update") {
    const plan = requirePlan(state, command.planId);
    if (plan.applicability !== "ui") throw new Error("Not applicable plans are immutable evidence records.");
    const requiredCheckpoints = assertUniqueCodes(command.requiredCheckpoints);
    requiredText(command.experienceIntent, "Experience intent");
    requiredText(command.devicesAndScreenSizes, "Devices and screen sizes");
    requiredText(command.themeAndNavigationPattern, "Theme and navigation pattern");
    requiredText(command.demonstrationDataNeeds, "Demonstration-data needs");
    requiredText(command.evidenceRequirement, "Evidence requirement");
    if (requiredCheckpoints.length === 0) throw new Error("At least one UI review checkpoint is required.");
    const material = JSON.stringify({
      experienceIntent: command.experienceIntent.trim(), devicesAndScreenSizes: command.devicesAndScreenSizes.trim(),
      themeAndNavigationPattern: command.themeAndNavigationPattern.trim(), requiredCheckpoints,
      demonstrationDataNeeds: command.demonstrationDataNeeds.trim(), evidenceRequirement: command.evidenceRequirement.trim(),
      screenshotRequired: command.screenshotRequired,
    });
    const currentMaterial = JSON.stringify({
      experienceIntent: plan.experienceIntent, devicesAndScreenSizes: plan.devicesAndScreenSizes,
      themeAndNavigationPattern: plan.themeAndNavigationPattern, requiredCheckpoints: plan.requiredCheckpoints,
      demonstrationDataNeeds: plan.demonstrationDataNeeds, evidenceRequirement: plan.evidenceRequirement,
      screenshotRequired: plan.screenshotRequired,
    });
    if (material === currentMaterial) return state;
    const updatedPlan: UIReviewPlan = {
      ...plan,
      experienceIntent: command.experienceIntent.trim(),
      devicesAndScreenSizes: command.devicesAndScreenSizes.trim(),
      themeAndNavigationPattern: command.themeAndNavigationPattern.trim(),
      requiredCheckpoints,
      demonstrationDataNeeds: command.demonstrationDataNeeds.trim(),
      evidenceRequirement: command.evidenceRequirement.trim(),
      screenshotRequired: command.screenshotRequired,
      revision: plan.revision + 1,
      updatedAt: occurredAt,
    };
    const existingCodes = new Set(state.uiReviewCheckpoints.filter((item) => item.planId === plan.id).map((item) => item.code));
    const added = requiredCheckpoints.filter((code) => !existingCodes.has(code)).map((code) => createCheckpoint(plan.id, code, occurredAt, context));
    let next: CastraState = {
      ...state,
      uiReviewPlans: state.uiReviewPlans.map((item) => item.id === plan.id ? updatedPlan : item),
      uiReviewCheckpoints: [...state.uiReviewCheckpoints, ...added],
    };
    for (const checkpoint of state.uiReviewCheckpoints.filter((item) => item.planId === plan.id)) {
      const revision = checkpoint.revision + 1;
      next = {
        ...next,
        uiReviewCheckpoints: next.uiReviewCheckpoints.map((item) => item.id === checkpoint.id ? { ...item, revision, updatedAt: occurredAt } : item),
      };
      next = invalidateCheckpoint(next, checkpoint.id, revision, "Material UI review plan configuration changed.", context, occurredAt);
    }
    return appendAudit(next, context, occurredAt, "ui_review.plan_updated", "ui_review_plan", plan.id,
      "UI review plan materially updated", { revision: String(updatedPlan.revision) });
  }

  if (command.type === "ui_review.checkpoint.update") {
    const checkpoint = requireCheckpoint(state, command.checkpointId);
    const scope = requiredText(command.scope, "Checkpoint scope");
    const coveredUiRevision = requiredText(command.coveredUiRevision, "Covered UI revision");
    const evidenceRequirement = requiredText(command.evidenceRequirement, "Evidence requirement");
    const evidenceReferences = normalizeList(command.evidenceReferences);
    const same = checkpoint.scope === scope && checkpoint.coveredUiRevision === coveredUiRevision &&
      checkpoint.evidenceRequirement === evidenceRequirement && JSON.stringify(checkpoint.evidenceReferences) === JSON.stringify(evidenceReferences);
    if (same) return state;
    const updated: UIReviewCheckpoint = {
      ...checkpoint, scope, coveredUiRevision, evidenceRequirement, evidenceReferences,
      revision: checkpoint.revision + 1, status: "not_started", updatedAt: occurredAt,
    };
    let next: CastraState = {
      ...state,
      uiReviewCheckpoints: state.uiReviewCheckpoints.map((item) => item.id === checkpoint.id ? updated : item),
    };
    next = invalidateCheckpoint(next, checkpoint.id, updated.revision, "Covered UI scope, revision, or evidence changed.", context, occurredAt);
    return appendAudit(next, context, occurredAt, "ui_review.checkpoint_updated", "ui_review_checkpoint", checkpoint.id,
      `${checkpoint.code} scope updated`, { revision: String(updated.revision), coveredUiRevision });
  }

  if (command.type === "ui_review.inventory.add") {
    const checkpoint = requireCheckpoint(state, command.checkpointId);
    const plan = requirePlan(state, checkpoint.planId);
    const fixture = state.uiReviewFixtureContracts.find((item) => item.id === command.fixtureContractId && item.planId === plan.id);
    if (!fixture) throw new Error("UI review fixture contract not found for this plan.");
    validateUIReviewFixtureTarget(fixture, command.targetAuthority);
    if (command.states.length === 0 && normalizeList(command.additionalStates).length === 0) {
      throw new Error("At least one declared screen state is required.");
    }
    const screenKey = requiredText(command.screenKey, "Screen key");
    if (state.uiReviewInventoryEntries.some((entry) => entry.checkpointId === checkpoint.id && entry.screenKey === screenKey)) {
      throw new Error("This screen key is already inventoried for the checkpoint.");
    }
    const inventory: UIReviewInventoryEntry = {
      id: context.id("ui_review_inventory_entry"), checkpointId: checkpoint.id, screenKey,
      screenName: requiredText(command.screenName, "Screen name"), componentReference: command.componentReference.trim(),
      states: [...new Set(command.states)], additionalStates: normalizeList(command.additionalStates),
      evidenceReferences: normalizeList(command.evidenceReferences), fixtureContractId: fixture.id,
      dataSource: "ui_review_fixture", destination: command.destination ?? null,
      inspectionFocus: command.inspectionFocus?.trim() ?? "",
      knownIntentionalGaps: command.knownIntentionalGaps?.trim() ?? "",
      requestedDecision: command.requestedDecision?.trim() ?? "",
      createdAt: occurredAt,
    };
    const revision = checkpoint.revision + 1;
    let next: CastraState = {
      ...state,
      uiReviewInventoryEntries: [...state.uiReviewInventoryEntries, inventory],
      uiReviewCheckpoints: state.uiReviewCheckpoints.map((item) => item.id === checkpoint.id ? { ...item, revision, status: "not_started", updatedAt: occurredAt } : item),
    };
    next = invalidateCheckpoint(next, checkpoint.id, revision, "Required screen/state inventory changed.", context, occurredAt);
    return appendAudit(next, context, occurredAt, "ui_review.inventory_added", "ui_review_inventory_entry", inventory.id,
      `UI inventory added: ${inventory.screenName}`, { checkpointId: checkpoint.id, screenKey, dataSource: inventory.dataSource });
  }

  if (command.type === "ui_review.checkpoint.ready") {
    const checkpoint = requireCheckpoint(state, command.checkpointId);
    const plan = requirePlan(state, checkpoint.planId);
    if (plan.applicability !== "ui") throw new Error("Not applicable plans do not have reviewable checkpoints.");
    if (!checkpoint.scope || !checkpoint.coveredUiRevision || !checkpoint.evidenceRequirement) {
      throw new Error("Checkpoint scope, UI revision, and evidence requirement must be configured first.");
    }
    const inventory = state.uiReviewInventoryEntries.filter((entry) => entry.checkpointId === checkpoint.id);
    if (inventory.length === 0) throw new Error("A required screen/state inventory is needed before review.");
    if (checkpoint.evidenceReferences.length === 0) throw new Error("Checkpoint evidence is required before review.");
    if (checkpoint.code === "UI-03") {
      const fixture = state.uiReviewFixtureContracts.find((item) => item.planId === plan.id);
      if (!fixture?.populated) throw new Error("UI-03 populated review fixture is not built; A002 remains required.");
    }
    const updated = { ...checkpoint, status: "ready_for_review" as const, updatedAt: occurredAt };
    return appendAudit(
      { ...state, uiReviewCheckpoints: state.uiReviewCheckpoints.map((item) => item.id === checkpoint.id ? updated : item) },
      context, occurredAt, "ui_review.checkpoint_updated", "ui_review_checkpoint", checkpoint.id,
      `${checkpoint.code} ready for Commander review`, { revision: String(checkpoint.revision), scope: uiReviewInventoryEvidenceScope(state, checkpoint.id) },
    );
  }

  if (command.type === "ui_review.item.create") {
    const inventory = state.uiReviewInventoryEntries.find((entry) => entry.id === command.inventoryEntryId);
    if (!inventory) throw new Error("UI review inventory entry not found.");
    const item = {
      id: context.id("ui_review_item"), checkpointId: inventory.checkpointId, inventoryEntryId: inventory.id,
      screenReference: requiredText(command.screenReference, "Screen reference"), componentReference: command.componentReference.trim(),
      sourceAttribution: requiredText(command.sourceAttribution, "Source attribution"), sourceReference: requiredText(command.sourceReference, "Source reference"),
      comment: requiredText(command.comment, "Review comment"), severity: command.severity,
      createdAt: occurredAt, createdBy: "Commander" as const,
    };
    return appendAudit({ ...state, uiReviewItems: [...state.uiReviewItems, item] }, context, occurredAt,
      "ui_review.item_created", "ui_review_item", item.id, `UI review item recorded: ${item.screenReference}`,
      { checkpointId: item.checkpointId, inventoryEntryId: inventory.id, severity: item.severity });
  }

  if (command.type === "ui_review.punch.create") {
    const item = state.uiReviewItems.find((candidate) => candidate.id === command.reviewItemId);
    if (!item) throw new Error("UI review item not found.");
    if (state.uiReviewPunchLinks.some((link) => link.reviewItemId === item.id)) {
      throw new Error("This UI review item already has a distinct linked Punch Item.");
    }
    const checkpoint = requireCheckpoint(state, item.checkpointId);
    const plan = requirePlan(state, checkpoint.planId);
    if (command.decisionId && !state.uiReviewDecisions.some((decision) => decision.id === command.decisionId && decision.checkpointId === checkpoint.id)) {
      throw new Error("The referenced UI review decision does not match this item.");
    }
    const punch: PunchItem = {
      id: context.id("punch_item"), testPlanId: null, testResultId: null, source: "ui_review",
      uiReviewItemId: item.id, uiReviewDecisionId: command.decisionId ?? null,
      affectedWork: { type: "campaign", id: plan.campaignId }, title: requiredText(command.title, "Punch title"),
      description: command.description.trim(), status: "open", severity: command.severity,
      requirementReference: `${checkpoint.code} · ${item.screenReference}`,
      evidenceReference: item.sourceReference, verificationEvidence: "", verifiedAt: null,
      waiverReason: "", commanderAcceptedAt: null, createdAt: occurredAt, updatedAt: occurredAt,
    };
    const link = {
      id: context.id("ui_review_punch_link"), reviewItemId: item.id, decisionId: command.decisionId ?? null,
      punchItemId: punch.id, createdAt: occurredAt,
    };
    let next = appendAudit({ ...state, punchItems: [...state.punchItems, punch] }, context, occurredAt,
      "punch_item.created", "punch_item", punch.id, `UI review Punch Item created: ${punch.title}`,
      { reviewItemId: item.id, checkpointId: checkpoint.id, affectedId: plan.campaignId });
    next = { ...next, uiReviewPunchLinks: [...next.uiReviewPunchLinks, link] };
    return appendAudit(next, context, occurredAt, "ui_review.punch_linked", "ui_review_punch_link", link.id,
      "UI review item linked to distinct Punch Item", { reviewItemId: item.id, punchItemId: punch.id });
  }

  if (command.type === "ui_review.decision.record") {
    const checkpoint = requireCheckpoint(state, command.checkpointId);
    if (checkpoint.status !== "ready_for_review") throw new Error("Checkpoint must be ready for review before a decision.");
    if (command.checkpointRevision !== checkpoint.revision) throw new Error("Commander decision revision does not match the current checkpoint revision.");
    const currentScope = uiReviewInventoryEvidenceScope(state, checkpoint.id);
    if (command.inventoryEvidenceScope !== currentScope) throw new Error("Commander decision scope does not match the exact current inventory and evidence.");
    if (checkpointCurrentDecision(state, checkpoint.id)) throw new Error("This checkpoint already has a current Commander decision.");
    const evidenceReferences = normalizeList(command.evidenceReferences);
    if (evidenceReferences.length === 0) throw new Error("Commander decision evidence is required.");
    const rationale = requiredText(command.rationale, "Commander decision rationale");
    const linkedPunches = [...new Set(command.punchItemIds)].map((id) => state.punchItems.find((punch) => punch.id === id));
    if (linkedPunches.some((punch) => !punch)) throw new Error("A referenced Punch Item was not found.");
    for (const punch of linkedPunches as PunchItem[]) {
      const link = state.uiReviewPunchLinks.find((candidate) => candidate.punchItemId === punch.id);
      const item = link && state.uiReviewItems.find((candidate) => candidate.id === link.reviewItemId);
      if (!item || item.checkpointId !== checkpoint.id) throw new Error("Commander decision Punch Items must originate from this checkpoint.");
    }
    if (command.disposition === "approve_with_punch_items" && linkedPunches.length === 0) {
      throw new Error("Approve with punch items requires at least one distinct linked Punch Item.");
    }
    if (command.disposition === "approve" && linkedPunches.length > 0) {
      throw new Error("Use Approve with punch items when Punch Items are included in the decision.");
    }
    const decision: UIReviewDecision = {
      id: context.id("ui_review_decision"), checkpointId: checkpoint.id, checkpointRevision: checkpoint.revision,
      inventoryEvidenceScope: currentScope, disposition: command.disposition, rationale, evidenceReferences,
      punchItemIds: (linkedPunches as PunchItem[]).map((punch) => punch.id), decidedAt: occurredAt, decidedBy: "Commander",
    };
    const status = command.disposition === "approve" ? "approved"
      : command.disposition === "approve_with_punch_items" ? "approved_with_punch_items" : "rework_required";
    const next: CastraState = {
      ...state,
      uiReviewDecisions: [...state.uiReviewDecisions, decision],
      uiReviewCheckpoints: state.uiReviewCheckpoints.map((item) => item.id === checkpoint.id ? { ...item, status, updatedAt: occurredAt } : item),
    };
    return appendAudit(next, context, occurredAt, "ui_review.decision_recorded", "ui_review_decision", decision.id,
      `${checkpoint.code} Commander disposition: ${command.disposition}`,
      { checkpointId: checkpoint.id, checkpointRevision: String(checkpoint.revision), inventoryEvidenceScope: currentScope });
  }

  return state;
}
