import type {
  AerariumStoredMeasure,
  AuditEntityType,
  BaseRecord,
  CastraState,
  WorkLink,
} from "./types.js";
import { canonicalRoleIds, canonicalRoleNames, currentPresentation, presentRole, themeProfile } from "./presentation.js";
import {
  currentAuthenticationPolicy,
  currentAuthorityAssignments,
  currentIdentityVersions,
  currentSessionReceipts,
  currentWelcomeAccessConfiguration,
  findAuthSecretViolations,
} from "./authentication.js";

export type GraphProvenance =
  | "evidenced"
  | "approved"
  | "proposed"
  | "unknown/gap"
  | "retired";

export type GraphCategory =
  | "work"
  | "approval"
  | "audit"
  | "testing"
  | "aerarium"
  | "configuration"
  | "role"
  | "evidence"
  | "gap";

export type GraphGapKind =
  | "missing_owner"
  | "required_review_evidence"
  | "invalidated_approval"
  | "unresolved_test_punch"
  | "disconnected_critical_node"
  | "missing_measurement_provenance"
  | "deployment_evidence_gap"
  | "ui_review_gate_gap"
  | "authentication_gap";

export interface GraphSourceReference {
  sourceType: string;
  sourceId: string;
  path: string;
  label: string;
}

export interface GraphNode {
  id: string;
  sourceType: string;
  sourceId: string;
  label: string;
  category: GraphCategory;
  provenance: GraphProvenance;
  explanation: string;
  sourceReferences: GraphSourceReference[];
  attributes: Record<string, string | number | boolean | null>;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  relation: string;
  provenance: GraphProvenance;
  explanation: string;
  sourceReferences: GraphSourceReference[];
}

export interface GraphGap {
  id: string;
  kind: GraphGapKind;
  severity: "attention" | "blocking";
  governedNodeId: string | null;
  explanation: string;
  remediation: string;
  sourceReferences: GraphSourceReference[];
}

export interface GraphSourceBundle {
  contract: "castra.graphify-source-bundle";
  contractVersion: 1;
  generatedAt: string;
  authority: "Castra";
  mutability: "read-only";
  graphifyIntegration: "not-connected";
  nodes: GraphNode[];
  edges: GraphEdge[];
  gaps: GraphGap[];
  deterministicRules: Array<{ id: GraphGapKind; description: string }>;
}

const gapRules: GraphSourceBundle["deterministicRules"] = [
  {
    id: "missing_owner",
    description: "A current Campaign, Mission, or Action has no authoritative owner field/value.",
  },
  {
    id: "required_review_evidence",
    description: "A required test/reference or exit-stage FIREWATCH review lacks its required reference, evidence, or recorded unavailable reason.",
  },
  {
    id: "invalidated_approval",
    description: "The latest approval event for a work record is an approval invalidation and no later approval was granted.",
  },
  {
    id: "unresolved_test_punch",
    description: "An adverse test result has no resolved linked punch, or a punch remains open/in remediation/ready for verification.",
  },
  {
    id: "disconnected_critical_node",
    description: "A critical Test Case or Punch Item has no traceable connection to an existing non-gap governing record.",
  },
  {
    id: "missing_measurement_provenance",
    description: "An AERARIUM measure lacks its required run, provenance, evidence, inputs, or exact configuration-version references.",
  },
  {
    id: "deployment_evidence_gap",
    description: "A Manual-Assist Deployment Request lacks verified terminal evidence, or a Production request lacks its bound verified Preview receipt.",
  },
  {
    id: "ui_review_gate_gap",
    description: "A required UI checkpoint lacks a current exact-scope Commander decision, has been invalidated, or depends on the not-yet-built populated fixture.",
  },
  {
    id: "authentication_gap",
    description: "Welcome/authentication evidence is missing, disabled, invalid, expired, leaks Demo/session boundaries, or contains a prohibited secret-shaped field.",
  },
];

function graphNodeId(sourceType: string, sourceId: string): string {
  return `node:${sourceType}:${sourceId}`;
}

function source(
  sourceType: string,
  sourceId: string,
  path: string,
  label = `${sourceType}.${path}`,
): GraphSourceReference {
  return { sourceType, sourceId, path, label };
}

function edgeId(relation: string, from: string, to: string, discriminator: string): string {
  return `edge:${relation}:${from}->${to}:${discriminator}`;
}

function workNodeId(link: WorkLink): string {
  return graphNodeId(link.type, link.id);
}

function recordProvenance(record: BaseRecord): GraphProvenance {
  if (record.archivedAt) return "retired";
  if (record.approval?.revision === record.revision) return "approved";
  return "proposed";
}

function referenceValue(value: string): boolean {
  return value.trim().length > 0;
}

function measurementProvenanceMissing(state: CastraState, measure: AerariumStoredMeasure): string[] {
  const missing: string[] = [];
  if (!state.aerariumRuns.some((run) => run.id === measure.runId)) missing.push("authoritative run");
  if (!measure.provenance.trim()) missing.push("provenance label");
  if (!measure.confidence) missing.push("confidence label");
  if (measure.kind === "provider_actual" && !referenceValue(measure.evidenceReference)) {
    missing.push("manual evidence reference");
  }
  if (["estimated_tokens", "api_equivalent_estimate"].includes(measure.kind)) {
    if (!measure.profileVersionId || !state.modelProfileVersions.some((item) => item.id === measure.profileVersionId)) {
      missing.push("Model Profile version");
    }
    if (!measure.priceCardVersionId || !state.priceCardVersions.some((item) => item.id === measure.priceCardVersionId)) {
      missing.push("Price Card version");
    }
    if (Object.keys(measure.inputs).length === 0) missing.push("calculation inputs");
  }
  if (measure.kind === "allocated_subscription_cost") {
    if (
      !measure.subscriptionPlanVersionId ||
      !state.subscriptionPlanVersions.some((item) => item.id === measure.subscriptionPlanVersionId)
    ) {
      missing.push("Subscription Plan version");
    }
    if (
      !measure.allocationRuleVersionId ||
      !state.allocationRuleVersions.some((item) => item.id === measure.allocationRuleVersionId)
    ) {
      missing.push("Allocation Rule version");
    }
    if (Object.keys(measure.inputs).length === 0) missing.push("allocation inputs");
  }
  return missing;
}

export function buildGraphSourceBundle(
  state: CastraState,
  generatedAt = new Date().toISOString(),
): GraphSourceBundle {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const gaps: GraphGap[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const gapIds = new Set<string>();

  function addNode(node: GraphNode): void {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  }

  function addEdge(edge: GraphEdge): void {
    if (edgeIds.has(edge.id)) return;
    edgeIds.add(edge.id);
    edges.push(edge);
  }

  function addGap(gap: Omit<GraphGap, "id">): void {
    const governed = gap.governedNodeId ?? "bundle";
    const discriminator = gap.sourceReferences.map((item) => `${item.sourceType}:${item.sourceId}:${item.path}`).join("|");
    const id = `gap:${gap.kind}:${governed}:${discriminator}`;
    if (gapIds.has(id)) return;
    gapIds.add(id);
    const complete: GraphGap = { id, ...gap };
    gaps.push(complete);
    const gapNodeId = graphNodeId("gap", id);
    addNode({
      id: gapNodeId,
      sourceType: "gap",
      sourceId: id,
      label: gap.kind.replaceAll("_", " "),
      category: "gap",
      provenance: "unknown/gap",
      explanation: gap.explanation,
      sourceReferences: gap.sourceReferences,
      attributes: { severity: gap.severity, remediation: gap.remediation },
    });
    if (gap.governedNodeId) {
      addEdge({
        id: edgeId("flags", gapNodeId, gap.governedNodeId, id),
        from: gapNodeId,
        to: gap.governedNodeId,
        relation: "flags",
        provenance: "unknown/gap",
        explanation: "This deterministic gap check flags the governed authoritative record; it does not change it.",
        sourceReferences: gap.sourceReferences,
      });
    }
  }

  function ensureUnknownNode(
    sourceType: string,
    sourceId: string,
    owningReference: GraphSourceReference,
  ): string {
    const id = graphNodeId(sourceType, sourceId);
    addNode({
      id,
      sourceType,
      sourceId,
      label: `${sourceType} ${sourceId}`,
      category: "gap",
      provenance: "unknown/gap",
      explanation: "A Castra record references this identifier, but the governing record is not present in the local authoritative state.",
      sourceReferences: [owningReference],
      attributes: { referencedRecordUnavailable: true },
    });
    return id;
  }

  function resolveWorkNode(link: WorkLink, owningReference: GraphSourceReference): string {
    const id = workNodeId(link);
    if (nodeIds.has(id)) return id;
    return ensureUnknownNode(link.type, link.id, owningReference);
  }

  function addReferenceNode(
    ownerNodeId: string,
    sourceType: string,
    sourceId: string,
    path: string,
    value: string,
    relation: "supports" | "traces_to",
  ): void {
    if (!referenceValue(value)) return;
    const id = graphNodeId("evidence", `${sourceType}:${sourceId}:${path}`);
    const ref = source(sourceType, sourceId, path, `${path}: ${value}`);
    addNode({
      id,
      sourceType: "evidence",
      sourceId: `${sourceType}:${sourceId}:${path}`,
      label: value,
      category: "evidence",
      provenance: "evidenced",
      explanation: "This reference is reproduced exactly from the authoritative Castra field. External resolution or validation is not claimed.",
      sourceReferences: [ref],
      attributes: { field: path, value },
    });
    addEdge({
      id: edgeId(relation, id, ownerNodeId, `${sourceType}:${sourceId}:${path}`),
      from: id,
      to: ownerNodeId,
      relation,
      provenance: "evidenced",
      explanation: `The authoritative ${sourceType}.${path} field ${relation === "supports" ? "supports" : "traces to"} this record.`,
      sourceReferences: [ref],
    });
  }

  for (const record of [...state.campaigns, ...state.missions, ...state.actions]) {
    addNode({
      id: graphNodeId(record.type, record.id),
      sourceType: record.type,
      sourceId: record.id,
      label: record.title,
      category: "work",
      provenance: recordProvenance(record),
      explanation: `This node exists because Castra contains the authoritative ${record.type} record ${record.id}.`,
      sourceReferences: [source(record.type, record.id, "$", "Authoritative work record")],
      attributes: {
        status: record.status,
        revision: record.revision,
        archivedAt: record.archivedAt,
        approvedRevision: record.approval?.revision ?? null,
      },
    });
    if (!record.archivedAt) {
      addGap({
        kind: "missing_owner",
        severity: "attention",
        governedNodeId: graphNodeId(record.type, record.id),
        explanation: `${record.title} has no authoritative owner field/value in the Release 1 record schema. Commander authority is not assumed to be record ownership.`,
        remediation: "Record an owner when the protected ownership model becomes available.",
        sourceReferences: [source(record.type, record.id, "owner", "Owner field unavailable")],
      });
    }
  }

  for (const plan of state.uiReviewPlans) {
    const id = graphNodeId("ui_review_plan", plan.id);
    const currentCampaign = state.campaigns.some((campaign) => campaign.id === plan.campaignId);
    const ref = source("ui_review_plan", plan.id, "$", "Authoritative UI Review Plan");
    addNode({
      id,
      sourceType: "ui_review_plan",
      sourceId: plan.id,
      label: plan.applicability === "not_applicable" ? "UI Review · Not applicable" : "UI Review Plan",
      category: "testing",
      provenance: plan.applicability === "not_applicable" && referenceValue(plan.applicabilityEvidenceReference) ? "approved" : "proposed",
      explanation: "This node exists because the Campaign has an authoritative versioned UI Review Plan.",
      sourceReferences: [ref],
      attributes: { revision: plan.revision, applicability: plan.applicability, status: plan.status, approver: plan.approver },
    });
    const target = currentCampaign
      ? graphNodeId("campaign", plan.campaignId)
      : ensureUnknownNode("campaign", plan.campaignId, source("ui_review_plan", plan.id, "campaignId"));
    addEdge({
      id: edgeId("governs_ui", id, target, plan.id), from: id, to: target, relation: "governs_ui",
      provenance: currentCampaign ? "evidenced" : "unknown/gap",
      explanation: "UIReviewPlan.campaignId binds this gate to its authoritative Campaign.", sourceReferences: [ref],
    });
    if (plan.applicability === "not_applicable") {
      addReferenceNode(id, "ui_review_plan", plan.id, "applicabilityEvidenceReference", plan.applicabilityEvidenceReference, "supports");
      if (!referenceValue(plan.applicabilityReason) || !referenceValue(plan.applicabilityEvidenceReference)) {
        addGap({ kind: "ui_review_gate_gap", severity: "blocking", governedNodeId: id,
          explanation: "The Not applicable disposition lacks Commander reason or evidence.",
          remediation: "Record the missing Commander evidence through the UI review plan workflow.", sourceReferences: [ref] });
      }
    }
  }

  for (const fixture of state.uiReviewFixtureContracts) {
    const id = graphNodeId("ui_review_fixture_contract", fixture.id);
    const ref = source("ui_review_fixture_contract", fixture.id, "$", fixture.visibleLabel);
    addNode({
      id, sourceType: "ui_review_fixture_contract", sourceId: fixture.id,
      label: fixture.visibleLabel, category: "configuration", provenance: "evidenced",
      explanation: "This is an isolation contract, not populated demonstration data; it cannot target authoritative Commander records.",
      sourceReferences: [ref], attributes: { populated: fixture.populated, status: fixture.status, authority: fixture.authority, canTargetAuthoritativeData: fixture.canTargetAuthoritativeData },
    });
    const target = graphNodeId("ui_review_plan", fixture.planId);
    addEdge({ id: edgeId("isolates_fixture_for", id, target, fixture.id), from: id, to: target, relation: "isolates_fixture_for",
      provenance: nodeIds.has(target) ? "evidenced" : "unknown/gap",
      explanation: "The fixture contract belongs to this UI Review Plan and declares a separate non-authoritative boundary.", sourceReferences: [ref] });
  }

  for (const checkpoint of state.uiReviewCheckpoints) {
    const id = graphNodeId("ui_review_checkpoint", checkpoint.id);
    const ref = source("ui_review_checkpoint", checkpoint.id, "$", `${checkpoint.code} ${checkpoint.name}`);
    const decisions = state.uiReviewDecisions.filter((decision) => decision.checkpointId === checkpoint.id);
    const currentDecision = decisions.filter((decision) => !state.uiReviewInvalidations.some((item) => item.decisionId === decision.id)).at(-1);
    addNode({
      id, sourceType: "ui_review_checkpoint", sourceId: checkpoint.id, label: `${checkpoint.code} · ${checkpoint.name}`,
      category: "testing", provenance: currentDecision ? "approved" : checkpoint.status === "invalidated" ? "unknown/gap" : "proposed",
      explanation: "This checkpoint is a required, revisioned Campaign UI gate with source-backed inventory and evidence.",
      sourceReferences: [ref], attributes: { revision: checkpoint.revision, status: checkpoint.status, coveredUiRevision: checkpoint.coveredUiRevision },
    });
    const target = graphNodeId("ui_review_plan", checkpoint.planId);
    addEdge({ id: edgeId("checkpoint_of", id, target, checkpoint.id), from: id, to: target, relation: "checkpoint_of",
      provenance: nodeIds.has(target) ? "evidenced" : "unknown/gap", explanation: "UIReviewCheckpoint.planId binds this gate to its plan.", sourceReferences: [ref] });
    if (!currentDecision) {
      const fixtureMissing = checkpoint.code === "UI-03" && !state.uiReviewFixtureContracts.find((item) => item.planId === checkpoint.planId)?.populated;
      addGap({ kind: "ui_review_gate_gap", severity: checkpoint.status === "invalidated" ? "blocking" : "attention", governedNodeId: id,
        explanation: fixtureMissing ? "UI-03 has no populated deterministic review fixture; A002 remains required." : "The required UI checkpoint has no current exact-scope Commander decision.",
        remediation: fixtureMissing ? "Build and evidence the separately isolated A002 populated fixture before UI-03 review." : "Complete the required inventory/evidence and record a Commander disposition.",
        sourceReferences: [ref] });
    }
  }

  for (const inventory of state.uiReviewInventoryEntries) {
    const id = graphNodeId("ui_review_inventory_entry", inventory.id);
    const ref = source("ui_review_inventory_entry", inventory.id, "$", `${inventory.screenName} state inventory`);
    addNode({ id, sourceType: "ui_review_inventory_entry", sourceId: inventory.id, label: inventory.screenName,
      category: "evidence", provenance: "evidenced", explanation: "This source-backed inventory enumerates the screen/component states covered by a checkpoint.",
      sourceReferences: [ref], attributes: { screenKey: inventory.screenKey, states: inventory.states.join(", "), additionalStates: inventory.additionalStates.join(", "), dataSource: inventory.dataSource } });
    addEdge({ id: edgeId("inventories", id, graphNodeId("ui_review_checkpoint", inventory.checkpointId), inventory.id), from: id,
      to: graphNodeId("ui_review_checkpoint", inventory.checkpointId), relation: "inventories", provenance: "evidenced",
      explanation: "UIReviewInventoryEntry.checkpointId binds this immutable inventory to the reviewed checkpoint.", sourceReferences: [ref] });
  }

  for (const item of state.uiReviewItems) {
    const id = graphNodeId("ui_review_item", item.id);
    const ref = source("ui_review_item", item.id, "$", `${item.screenReference} review item`);
    addNode({ id, sourceType: "ui_review_item", sourceId: item.id, label: item.comment, category: "testing", provenance: "proposed",
      explanation: "This immutable, source-attributed comment identifies a screen/component finding without overwriting review evidence.",
      sourceReferences: [ref], attributes: { screenReference: item.screenReference, componentReference: item.componentReference, severity: item.severity, sourceAttribution: item.sourceAttribution } });
    addEdge({ id: edgeId("finding_for", id, graphNodeId("ui_review_inventory_entry", item.inventoryEntryId), item.id), from: id,
      to: graphNodeId("ui_review_inventory_entry", item.inventoryEntryId), relation: "finding_for", provenance: "evidenced",
      explanation: "UIReviewItem.inventoryEntryId preserves screen/state traceability.", sourceReferences: [ref] });
    addReferenceNode(id, "ui_review_item", item.id, "sourceReference", item.sourceReference, "supports");
  }

  for (const decision of state.uiReviewDecisions) {
    const id = graphNodeId("ui_review_decision", decision.id);
    const invalidation = state.uiReviewInvalidations.find((item) => item.decisionId === decision.id);
    const ref = source("ui_review_decision", decision.id, "$", `${decision.disposition} at checkpoint revision ${decision.checkpointRevision}`);
    addNode({ id, sourceType: "ui_review_decision", sourceId: decision.id, label: `Commander · ${decision.disposition.replaceAll("_", " ")}`,
      category: "approval", provenance: invalidation ? "retired" : "approved",
      explanation: invalidation ? "This preserved prior decision was invalidated by a later material covered-UI change." : "This immutable Commander disposition is bound to the exact checkpoint revision and inventory/evidence scope.",
      sourceReferences: [ref], attributes: { checkpointRevision: decision.checkpointRevision, inventoryEvidenceScope: decision.inventoryEvidenceScope, invalidated: Boolean(invalidation) } });
    addEdge({ id: edgeId("decides", id, graphNodeId("ui_review_checkpoint", decision.checkpointId), decision.id), from: id,
      to: graphNodeId("ui_review_checkpoint", decision.checkpointId), relation: "decides", provenance: invalidation ? "retired" : "approved",
      explanation: "UIReviewDecision.checkpointId and scope hash bind the decision to its reviewed evidence.", sourceReferences: [ref] });
    for (const evidence of decision.evidenceReferences) addReferenceNode(id, "ui_review_decision", decision.id, "evidenceReferences", evidence, "supports");
  }

  for (const mission of state.missions) {
    const owning = source("mission", mission.id, "campaignId", `campaignId: ${mission.campaignId}`);
    const target = resolveWorkNode({ type: "campaign", id: mission.campaignId }, owning);
    addEdge({
      id: edgeId("contains", target, graphNodeId("mission", mission.id), mission.id),
      from: target,
      to: graphNodeId("mission", mission.id),
      relation: "contains",
      provenance: nodeIds.has(graphNodeId("campaign", mission.campaignId)) ? "evidenced" : "unknown/gap",
      explanation: "Mission.campaignId deterministically places this Mission under the referenced Campaign.",
      sourceReferences: [owning],
    });
  }

  for (const action of state.actions) {
    const owning = source("action", action.id, "missionId", `missionId: ${action.missionId}`);
    const target = resolveWorkNode({ type: "mission", id: action.missionId }, owning);
    addEdge({
      id: edgeId("contains", target, graphNodeId("action", action.id), action.id),
      from: target,
      to: graphNodeId("action", action.id),
      relation: "contains",
      provenance: nodeIds.has(graphNodeId("mission", action.missionId)) ? "evidenced" : "unknown/gap",
      explanation: "Action.missionId deterministically places this Action under the referenced Mission.",
      sourceReferences: [owning],
    });
  }

  for (const request of state.deploymentRequests) {
    const id = graphNodeId("deployment_request", request.id);
    const requestRef = source("deployment_request", request.id, "$", "Authoritative local Deployment Request");
    const requestProvenance: GraphProvenance = request.state === "cancelled"
      ? "retired"
      : request.state === "verified"
        ? "evidenced"
        : ["failed", "unknown"].includes(request.state)
          ? "unknown/gap"
          : request.state === "approved"
            ? "approved"
            : "proposed";
    addNode({
      id,
      sourceType: "deployment_request",
      sourceId: request.id,
      label: `${request.environment === "preview" ? "Preview" : "Production"} · ${request.productName}`,
      category: "evidence",
      provenance: requestProvenance,
      explanation: "This node is a read-only projection of a local Manual-Assist Deployment Request. It is not provider or deployment evidence.",
      sourceReferences: [requestRef],
      attributes: {
        revision: request.revision,
        providerLabel: request.providerLabel,
        productName: request.productName,
        projectSlug: request.projectSlug,
        environment: request.environment,
        sourceBuildReference: request.sourceBuildReference,
        targetHostname: request.targetHostname,
        campaignId: request.campaignId,
        actionId: request.actionId,
        previewReceiptId: request.previewReceiptId,
        materialInputHash: request.materialInputHash,
        state: request.state,
        authority: request.authority,
      },
    });

    const campaignRef = source("deployment_request", request.id, "campaignId", `campaignId: ${request.campaignId}`);
    const campaignNode = nodeIds.has(graphNodeId("campaign", request.campaignId))
      ? graphNodeId("campaign", request.campaignId)
      : ensureUnknownNode("campaign", request.campaignId, campaignRef);
    addEdge({
      id: edgeId("governed_by", id, campaignNode, request.id),
      from: id,
      to: campaignNode,
      relation: "governed_by",
      provenance: nodes.find((node) => node.id === campaignNode)?.provenance === "unknown/gap" ? "unknown/gap" : "evidenced",
      explanation: "DeploymentRequest.campaignId binds this local record to its governing Campaign.",
      sourceReferences: [campaignRef],
    });

    const actionRef = source("deployment_request", request.id, "actionId", `actionId: ${request.actionId}`);
    const actionNode = nodeIds.has(graphNodeId("action", request.actionId))
      ? graphNodeId("action", request.actionId)
      : ensureUnknownNode("action", request.actionId, actionRef);
    addEdge({
      id: edgeId("deploys_action", id, actionNode, request.id),
      from: id,
      to: actionNode,
      relation: "deploys_action",
      provenance: nodes.find((node) => node.id === actionNode)?.provenance === "unknown/gap" ? "unknown/gap" : "evidenced",
      explanation: "DeploymentRequest.actionId identifies the deployment-classified Action governed by this local request.",
      sourceReferences: [actionRef],
    });

    if (request.environment === "production") {
      const previewRef = source("deployment_request", request.id, "previewReceiptId", `previewReceiptId: ${request.previewReceiptId || "missing"}`);
      if (request.previewReceiptId) {
        const previewNode = nodeIds.has(graphNodeId("deployment_receipt", request.previewReceiptId))
          ? graphNodeId("deployment_receipt", request.previewReceiptId)
          : graphNodeId("deployment_receipt", request.previewReceiptId);
        addEdge({
          id: edgeId("requires_preview_receipt", id, previewNode, request.id),
          from: id,
          to: previewNode,
          relation: "requires_preview_receipt",
          provenance: state.deploymentReceipts.some((receipt) => receipt.id === request.previewReceiptId && receipt.state === "verified")
            ? "evidenced"
            : "unknown/gap",
          explanation: "A Production request is bound to its separately recorded verified Preview receipt.",
          sourceReferences: [previewRef],
        });
      }
      const previewReceipt = state.deploymentReceipts.find((receipt) => receipt.id === request.previewReceiptId);
      if (!previewReceipt || previewReceipt.state !== "verified") {
        addGap({
          kind: "deployment_evidence_gap",
          severity: "blocking",
          governedNodeId: id,
          explanation: "This Production request has no bound verified Preview receipt. Production advancement remains blocked.",
          remediation: "Complete and verify the separate Preview request, then bind that exact receipt to a fresh Production request and Commander approval.",
          sourceReferences: [previewRef],
        });
      }
    }

    const terminalReceipt = state.deploymentReceipts.find((receipt) => receipt.requestId === request.id && receipt.state === "verified");
    if (["handoff_requested", "attempted", "failed", "unknown"].includes(request.state) && !terminalReceipt) {
      addGap({
        kind: "deployment_evidence_gap",
        severity: request.state === "failed" || request.state === "unknown" ? "blocking" : "attention",
        governedNodeId: id,
        explanation: `The local request state is ${request.state}; no verified Deployment Receipt exists. No deployment success is inferred.`,
        remediation: "Record only a redacted, human-observed terminal receipt. Unknown, failed, and cancelled work is never retried automatically.",
        sourceReferences: [source("deployment_request", request.id, "state", `state: ${request.state}`)],
      });
    }
  }

  for (const decision of state.deploymentCommanderDecisions) {
    const id = graphNodeId("deployment_commander_decision", decision.id);
    const ref = source("deployment_commander_decision", decision.id, "$", "Authoritative Commander decision");
    addNode({
      id,
      sourceType: "deployment_commander_decision",
      sourceId: decision.id,
      label: `Deployment ${decision.decision}`,
      category: "approval",
      provenance: decision.decision === "approved" ? "approved" : "evidenced",
      explanation: "This decision is bound to the exact local request revision and material-input hash; it grants no provider authority.",
      sourceReferences: [ref],
      attributes: {
        requestId: decision.requestId,
        requestRevision: decision.requestRevision,
        materialInputHash: decision.materialInputHash,
        decision: decision.decision,
        reason: decision.reason,
        decidedBy: decision.decidedBy,
        decidedAt: decision.decidedAt,
        expiresAt: decision.expiresAt,
      },
    });
    const target = nodeIds.has(graphNodeId("deployment_request", decision.requestId))
      ? graphNodeId("deployment_request", decision.requestId)
      : ensureUnknownNode("deployment_request", decision.requestId, source("deployment_commander_decision", decision.id, "requestId"));
    addEdge({
      id: edgeId(decision.decision === "approved" ? "approves" : "rejects", id, target, decision.id),
      from: id,
      to: target,
      relation: decision.decision === "approved" ? "approves" : "rejects",
      provenance: decision.decision === "approved" ? "approved" : "evidenced",
      explanation: "The Commander decision applies only to the referenced request revision and exact material-input hash.",
      sourceReferences: [ref],
    });
  }

  for (const receipt of state.deploymentReceipts) {
    const id = graphNodeId("deployment_receipt", receipt.id);
    const ref = source("deployment_receipt", receipt.id, "$", "Authoritative local Deployment Receipt");
    const receiptProvenance: GraphProvenance = receipt.state === "verified"
      ? "evidenced"
      : receipt.state === "cancelled"
        ? "retired"
        : ["failed", "unknown"].includes(receipt.state)
          ? "unknown/gap"
          : "proposed";
    addNode({
      id,
      sourceType: "deployment_receipt",
      sourceId: receipt.id,
      label: `Manual receipt · ${receipt.state}`,
      category: "evidence",
      provenance: receiptProvenance,
      explanation: "This node reproduces a redacted human-observed receipt. CASTRA made zero provider calls and does not independently validate the provider fields.",
      sourceReferences: [ref],
      attributes: {
        requestId: receipt.requestId,
        state: receipt.state,
        providerUrl: receipt.providerUrl,
        providerStatusReference: receipt.providerStatusReference,
        domainReference: receipt.domainReference,
        observedAt: receipt.observedAt,
        redactedEvidenceReference: receipt.redactedEvidenceReference,
        reason: receipt.reason,
        externalCallsByCastra: receipt.externalCallsByCastra,
        automaticRetry: receipt.automaticRetry,
      },
    });
    const target = nodeIds.has(graphNodeId("deployment_request", receipt.requestId))
      ? graphNodeId("deployment_request", receipt.requestId)
      : ensureUnknownNode("deployment_request", receipt.requestId, source("deployment_receipt", receipt.id, "requestId"));
    addEdge({
      id: edgeId("receipt_of", id, target, receipt.id),
      from: id,
      to: target,
      relation: "receipt_of",
      provenance: receiptProvenance,
      explanation: "DeploymentReceipt.requestId binds the redacted manual observation to its local request.",
      sourceReferences: [ref],
    });
    addReferenceNode(id, "deployment_receipt", receipt.id, "providerUrl", receipt.providerUrl, "traces_to");
    addReferenceNode(id, "deployment_receipt", receipt.id, "providerStatusReference", receipt.providerStatusReference, "supports");
    addReferenceNode(id, "deployment_receipt", receipt.id, "domainReference", receipt.domainReference, "supports");
    addReferenceNode(id, "deployment_receipt", receipt.id, "redactedEvidenceReference", receipt.redactedEvidenceReference, "supports");
  }

  for (const record of [...state.campaigns, ...state.missions, ...state.actions]) {
    if (!record.approval) continue;
    const id = graphNodeId("approval", `${record.type}:${record.id}:r${record.approval.revision}`);
    const ref = source(record.type, record.id, "approval", `Commander approval at revision ${record.approval.revision}`);
    addNode({
      id,
      sourceType: "approval",
      sourceId: `${record.type}:${record.id}:r${record.approval.revision}`,
      label: `Commander approval · r${record.approval.revision}`,
      category: "approval",
      provenance: "approved",
      explanation: "This approval node is derived from the record's current Commander approval object.",
      sourceReferences: [ref],
      attributes: { approvedAt: record.approval.approvedAt, approvedBy: record.approval.approvedBy },
    });
    addEdge({
      id: edgeId("approves", id, graphNodeId(record.type, record.id), id),
      from: id,
      to: graphNodeId(record.type, record.id),
      relation: "approves",
      provenance: "approved",
      explanation: "The Commander approval applies to this exact authoritative record revision.",
      sourceReferences: [ref],
    });
  }

  for (const plan of state.testPlans) {
    const id = graphNodeId("test_plan", plan.id);
    const ref = source("test_plan", plan.id, "$", "Authoritative Test Plan");
    addNode({
      id,
      sourceType: "test_plan",
      sourceId: plan.id,
      label: plan.title,
      category: "testing",
      provenance: "proposed",
      explanation: "This node exists because Castra contains the authoritative Test Plan.",
      sourceReferences: [ref],
      attributes: { status: plan.status, linkedWorkType: plan.link.type, linkedWorkId: plan.link.id },
    });
    const workRef = source("test_plan", plan.id, "link", `${plan.link.type}:${plan.link.id}`);
    const target = resolveWorkNode(plan.link, workRef);
    addEdge({
      id: edgeId("governs", id, target, plan.id),
      from: id,
      to: target,
      relation: "governs",
      provenance: nodes.find((node) => node.id === target)?.provenance === "unknown/gap" ? "unknown/gap" : "evidenced",
      explanation: "TestPlan.link identifies the authoritative work context governed by this plan.",
      sourceReferences: [workRef],
    });
    const firewatch = state.firewatchVerifications.filter((item) => item.testPlanId === plan.id).at(-1);
    if (["exit_review", "closed"].includes(plan.status) && !firewatch) {
      addGap({
        kind: "required_review_evidence",
        severity: "blocking",
        governedNodeId: id,
        explanation: `${plan.title} is in ${plan.status} without a recorded FIREWATCH verification or unavailable finding.`,
        remediation: "Record the Commander-requested FIREWATCH verification outcome and evidence/unavailable reason.",
        sourceReferences: [source("test_plan", plan.id, "status", `status: ${plan.status}`)],
      });
    }
  }

  for (const cycle of state.testCycles) {
    const id = graphNodeId("test_cycle", cycle.id);
    const ref = source("test_cycle", cycle.id, "$", "Authoritative Test Cycle");
    addNode({
      id,
      sourceType: "test_cycle",
      sourceId: cycle.id,
      label: cycle.title,
      category: "testing",
      provenance: cycle.status === "completed" ? "evidenced" : "proposed",
      explanation: "This node exists because Castra contains the authoritative Test Cycle.",
      sourceReferences: [ref],
      attributes: { status: cycle.status },
    });
    const target = nodeIds.has(graphNodeId("test_plan", cycle.testPlanId))
      ? graphNodeId("test_plan", cycle.testPlanId)
      : ensureUnknownNode("test_plan", cycle.testPlanId, source("test_cycle", cycle.id, "testPlanId"));
    addEdge({
      id: edgeId("executes", target, id, cycle.id),
      from: target,
      to: id,
      relation: "executes",
      provenance: target.startsWith("node:test_plan:") && state.testPlans.some((item) => graphNodeId("test_plan", item.id) === target) ? "evidenced" : "unknown/gap",
      explanation: "TestCycle.testPlanId associates this execution cycle with its Test Plan.",
      sourceReferences: [source("test_cycle", cycle.id, "testPlanId", `testPlanId: ${cycle.testPlanId}`)],
    });
  }

  for (const testCase of state.testCases) {
    const id = graphNodeId("test_case", testCase.id);
    const ref = source("test_case", testCase.id, "$", "Authoritative Test Case");
    addNode({
      id,
      sourceType: "test_case",
      sourceId: testCase.id,
      label: testCase.title,
      category: "testing",
      provenance: testCase.status === "retired" ? "retired" : testCase.status === "executed" ? "evidenced" : "proposed",
      explanation: "This node exists because Castra contains the authoritative Test Case.",
      sourceReferences: [ref],
      attributes: {
        status: testCase.status,
        required: testCase.required,
        severity: testCase.severity,
        expectedResult: testCase.expectedResult,
      },
    });
    const target = nodeIds.has(graphNodeId("test_plan", testCase.testPlanId))
      ? graphNodeId("test_plan", testCase.testPlanId)
      : ensureUnknownNode("test_plan", testCase.testPlanId, source("test_case", testCase.id, "testPlanId"));
    addEdge({
      id: edgeId("defines", target, id, testCase.id),
      from: target,
      to: id,
      relation: "defines",
      provenance: state.testPlans.some((item) => item.id === testCase.testPlanId) ? "evidenced" : "unknown/gap",
      explanation: "TestCase.testPlanId places this case in its governing plan.",
      sourceReferences: [source("test_case", testCase.id, "testPlanId", `testPlanId: ${testCase.testPlanId}`)],
    });
    addReferenceNode(id, "test_case", testCase.id, "requirementReference", testCase.requirementReference, "traces_to");
    addReferenceNode(id, "test_case", testCase.id, "sourceReference", testCase.sourceReference, "supports");
    if (testCase.required && (!referenceValue(testCase.requirementReference) || !referenceValue(testCase.sourceReference))) {
      addGap({
        kind: "required_review_evidence",
        severity: "blocking",
        governedNodeId: id,
        explanation: `${testCase.title} is required but lacks ${!referenceValue(testCase.requirementReference) ? "a requirement reference" : "a source reference"}.`,
        remediation: "Add the missing authoritative requirement/source reference through the Testing workspace.",
        sourceReferences: [source("test_case", testCase.id, "required", "required: true")],
      });
    }
  }

  for (const result of state.testResults) {
    const id = graphNodeId("test_result", result.id);
    const hasReference = referenceValue(result.evidenceReference) || referenceValue(result.resultReference);
    const explicitUnavailable = referenceValue(result.unavailableReason);
    addNode({
      id,
      sourceType: "test_result",
      sourceId: result.id,
      label: `Test result · ${result.outcome.replaceAll("_", " ")}`,
      category: "testing",
      provenance: hasReference ? "evidenced" : explicitUnavailable ? "unknown/gap" : "proposed",
      explanation: "This immutable result node exists because Castra recorded a direct test execution outcome.",
      sourceReferences: [source("test_result", result.id, "$", "Authoritative immutable Test Result")],
      attributes: {
        outcome: result.outcome,
        executor: result.executor,
        executedAt: result.executedAt,
        unavailableReason: result.unavailableReason,
      },
    });
    for (const [targetType, targetId, relation, path] of [
      ["test_case", result.testCaseId, "records", "testCaseId"],
      ["test_cycle", result.testCycleId, "occurred_in", "testCycleId"],
    ] as const) {
      const target = nodeIds.has(graphNodeId(targetType, targetId))
        ? graphNodeId(targetType, targetId)
        : ensureUnknownNode(targetType, targetId, source("test_result", result.id, path));
      addEdge({
        id: edgeId(relation, id, target, `${result.id}:${path}`),
        from: id,
        to: target,
        relation,
        provenance: nodeIds.has(target) && nodes.find((node) => node.id === target)?.provenance !== "unknown/gap" ? "evidenced" : "unknown/gap",
        explanation: `TestResult.${path} identifies the ${targetType.replaceAll("_", " ")} for this immutable result.`,
        sourceReferences: [source("test_result", result.id, path, `${path}: ${targetId}`)],
      });
    }
    addReferenceNode(id, "test_result", result.id, "evidenceReference", result.evidenceReference, "supports");
    addReferenceNode(id, "test_result", result.id, "resultReference", result.resultReference, "supports");
    if (!hasReference && !explicitUnavailable) {
      addGap({
        kind: "required_review_evidence",
        severity: "blocking",
        governedNodeId: id,
        explanation: "The test result has neither evidence/reference nor a recorded unavailable reason.",
        remediation: "Record a source/evidence reference or an honest unavailable reason through the test workflow.",
        sourceReferences: [source("test_result", result.id, "evidenceReference")],
      });
    }
    if (["fail", "blocked", "accepted_with_follow_up"].includes(result.outcome)) {
      const linked = state.punchItems.filter((punch) => punch.testResultId === result.id);
      const resolved = linked.some((punch) => ["verified_closed", "waived", "cancelled"].includes(punch.status));
      if (!resolved) {
        addGap({
          kind: "unresolved_test_punch",
          severity: result.outcome === "accepted_with_follow_up" ? "attention" : "blocking",
          governedNodeId: id,
          explanation: `The ${result.outcome.replaceAll("_", " ")} Test Result has no linked resolved Punch Item.`,
          remediation: "Create and resolve a linked Punch Item, or record the authorized closure state.",
          sourceReferences: [source("test_result", result.id, "outcome", `outcome: ${result.outcome}`)],
        });
      }
    }
  }

  for (const punch of state.punchItems) {
    const id = graphNodeId("punch_item", punch.id);
    const provenance: GraphProvenance = punch.status === "cancelled"
      ? "retired"
      : punch.status === "waived"
        ? "approved"
        : punch.status === "verified_closed" && referenceValue(punch.verificationEvidence)
          ? "evidenced"
          : "proposed";
    addNode({
      id,
      sourceType: "punch_item",
      sourceId: punch.id,
      label: punch.title,
      category: "testing",
      provenance,
      explanation: punch.source === "ui_review"
        ? "This remediation node exists separately from, and remains linked to, its immutable UI review item."
        : "This remediation node exists separately from, and remains linked to, its immutable originating Test Result.",
      sourceReferences: [source("punch_item", punch.id, "$", "Authoritative Punch Item")],
      attributes: { status: punch.status, severity: punch.severity, waiverReason: punch.waiverReason },
    });
    if (punch.testResultId) {
      const resultTarget = nodeIds.has(graphNodeId("test_result", punch.testResultId))
        ? graphNodeId("test_result", punch.testResultId)
        : ensureUnknownNode("test_result", punch.testResultId, source("punch_item", punch.id, "testResultId"));
      addEdge({
        id: edgeId("remediates", id, resultTarget, punch.id),
        from: id,
        to: resultTarget,
        relation: "remediates",
        provenance: state.testResults.some((item) => item.id === punch.testResultId) ? "evidenced" : "unknown/gap",
        explanation: "PunchItem.testResultId preserves traceability to the original immutable result.",
        sourceReferences: [source("punch_item", punch.id, "testResultId", `testResultId: ${punch.testResultId}`)],
      });
    }
    if (punch.uiReviewItemId) {
      const itemTarget = nodeIds.has(graphNodeId("ui_review_item", punch.uiReviewItemId))
        ? graphNodeId("ui_review_item", punch.uiReviewItemId)
        : ensureUnknownNode("ui_review_item", punch.uiReviewItemId, source("punch_item", punch.id, "uiReviewItemId"));
      addEdge({
        id: edgeId("remediates", id, itemTarget, punch.id), from: id, to: itemTarget, relation: "remediates",
        provenance: state.uiReviewItems.some((item) => item.id === punch.uiReviewItemId) ? "evidenced" : "unknown/gap",
        explanation: "PunchItem.uiReviewItemId preserves traceability to the immutable screen/component review finding.",
        sourceReferences: [source("punch_item", punch.id, "uiReviewItemId", `uiReviewItemId: ${punch.uiReviewItemId}`)],
      });
    }
    const workRef = source("punch_item", punch.id, "affectedWork", `${punch.affectedWork.type}:${punch.affectedWork.id}`);
    const workTarget = resolveWorkNode(punch.affectedWork, workRef);
    addEdge({
      id: edgeId("affects", id, workTarget, punch.id),
      from: id,
      to: workTarget,
      relation: "affects",
      provenance: nodes.find((node) => node.id === workTarget)?.provenance === "unknown/gap" ? "unknown/gap" : "evidenced",
      explanation: "PunchItem.affectedWork identifies the authoritative work record affected by the finding.",
      sourceReferences: [workRef],
    });
    addReferenceNode(id, "punch_item", punch.id, "requirementReference", punch.requirementReference, "traces_to");
    addReferenceNode(id, "punch_item", punch.id, "evidenceReference", punch.evidenceReference, "supports");
    addReferenceNode(id, "punch_item", punch.id, "verificationEvidence", punch.verificationEvidence, "supports");
    if (["open", "in_remediation", "ready_for_verification"].includes(punch.status)) {
      addGap({
        kind: "unresolved_test_punch",
        severity: punch.severity === "critical" || punch.severity === "high" ? "blocking" : "attention",
        governedNodeId: id,
        explanation: `${punch.title} remains ${punch.status.replaceAll("_", " ")}.`,
        remediation: "Complete remediation and evidence-backed verification, or record an authorized Commander waiver where permitted.",
        sourceReferences: [source("punch_item", punch.id, "status", `status: ${punch.status}`)],
      });
    }
    if (punch.status === "verified_closed" && !referenceValue(punch.verificationEvidence)) {
      addGap({
        kind: "required_review_evidence",
        severity: "blocking",
        governedNodeId: id,
        explanation: "The Punch Item is marked verified closed without verification evidence.",
        remediation: "Restore the required verification evidence through the authoritative punch workflow.",
        sourceReferences: [source("punch_item", punch.id, "verificationEvidence")],
      });
    }
  }

  for (const verification of state.firewatchVerifications) {
    const id = graphNodeId("firewatch_verification", verification.id);
    const hasEvidence = referenceValue(verification.evidenceReference);
    addNode({
      id,
      sourceType: "firewatch_verification",
      sourceId: verification.id,
      label: `FIREWATCH · ${verification.outcome.replaceAll("_", " ")}`,
      category: "testing",
      provenance: hasEvidence ? "evidenced" : "unknown/gap",
      explanation: "This node reproduces the Commander-recorded FIREWATCH verification; no FIREWATCH activity is inferred.",
      sourceReferences: [source("firewatch_verification", verification.id, "$", "Authoritative FIREWATCH record")],
      attributes: { outcome: verification.outcome, verifiedAt: verification.verifiedAt, unavailableReason: verification.unavailableReason },
    });
    const target = nodeIds.has(graphNodeId("test_plan", verification.testPlanId))
      ? graphNodeId("test_plan", verification.testPlanId)
      : ensureUnknownNode("test_plan", verification.testPlanId, source("firewatch_verification", verification.id, "testPlanId"));
    addEdge({
      id: edgeId("verifies", id, target, verification.id),
      from: id,
      to: target,
      relation: "verifies",
      provenance: hasEvidence ? "evidenced" : "unknown/gap",
      explanation: "FirewatchVerification.testPlanId links the recorded verification to its Test Plan.",
      sourceReferences: [source("firewatch_verification", verification.id, "testPlanId")],
    });
    addReferenceNode(id, "firewatch_verification", verification.id, "evidenceReference", verification.evidenceReference, "supports");
    if (!hasEvidence && !referenceValue(verification.unavailableReason)) {
      addGap({
        kind: "required_review_evidence",
        severity: "blocking",
        governedNodeId: id,
        explanation: "The FIREWATCH verification lacks both evidence and a recorded unavailable reason.",
        remediation: "Record evidence or an honest unavailable reason in the authoritative Testing workspace.",
        sourceReferences: [source("firewatch_verification", verification.id, "evidenceReference")],
      });
    }
  }

  for (const decision of state.exitDecisions) {
    const id = graphNodeId("exit_decision", decision.id);
    addNode({
      id,
      sourceType: "exit_decision",
      sourceId: decision.id,
      label: `Commander exit · ${decision.decision.replaceAll("_", " ")}`,
      category: "approval",
      provenance: "approved",
      explanation: "This node exists because the Commander recorded the final exit decision and rationale.",
      sourceReferences: [source("exit_decision", decision.id, "$", "Authoritative Commander exit decision")],
      attributes: { decision: decision.decision, rationale: decision.rationale, decidedAt: decision.decidedAt },
    });
    const target = nodeIds.has(graphNodeId("test_plan", decision.testPlanId))
      ? graphNodeId("test_plan", decision.testPlanId)
      : ensureUnknownNode("test_plan", decision.testPlanId, source("exit_decision", decision.id, "testPlanId"));
    addEdge({
      id: edgeId("decides_exit", id, target, decision.id),
      from: id,
      to: target,
      relation: "decides_exit",
      provenance: "approved",
      explanation: "ExitDecision.testPlanId identifies the plan governed by this Commander decision.",
      sourceReferences: [source("exit_decision", decision.id, "testPlanId")],
    });
  }

  for (const roleId of canonicalRoleIds) {
    const presented = presentRole(state, roleId, "full_name");
    const current = currentPresentation(state);
    const roleSource = current.builtIn
      ? source("release_configuration", "canonical_roles", roleId, `Protected role ID: ${roleId}`)
      : source("presentation_settings_version", current.id, `roles.${roleId}`, `Display: ${presented.displayName}`);
    addNode({
      id: graphNodeId("role", roleId),
      sourceType: "role",
      sourceId: roleId,
      label: `${presented.displayName} · ${canonicalRoleNames[roleId]}`,
      category: "role",
      provenance: "approved",
      explanation: "This protected canonical role ID comes from the approved Castra Release 1 role configuration; graph display cannot change its authority boundary.",
      sourceReferences: [roleSource],
      attributes: { canonicalId: roleId, canonicalName: canonicalRoleNames[roleId], displayName: presented.displayName, compactCode: presented.compactCode, configurableDisplay: true, authorityProtected: true },
    });
  }

  const roleCampaignAssociations = new Set<string>();
  for (const action of state.actions) {
    const roleMatch = action.notes.match(/Assigned canonical role:\s*([^\.]+)\./);
    const roleId = roleMatch?.[1]?.trim();
    if (!roleId || !canonicalRoleIds.includes(roleId as (typeof canonicalRoleIds)[number])) continue;
    const roleNodeId = graphNodeId("role", roleId);
    const actionNodeId = graphNodeId("action", action.id);
    const assignmentRef = source("action", action.id, "notes", `Assigned canonical role: ${roleId}`);
    addEdge({
      id: edgeId("assigned_role", roleNodeId, actionNodeId, action.id),
      from: roleNodeId,
      to: actionNodeId,
      relation: "assigned_role",
      provenance: "evidenced",
      explanation: "The Action's source-backed assignment names this protected canonical role. The graph cannot change the assignment or the role's authority.",
      sourceReferences: [assignmentRef],
    });
    const mission = state.missions.find((item) => item.id === action.missionId);
    if (!mission) continue;
    const associationKey = `${roleId}:${mission.campaignId}`;
    if (roleCampaignAssociations.has(associationKey)) continue;
    roleCampaignAssociations.add(associationKey);
    addEdge({
      id: edgeId("participates_in", roleNodeId, graphNodeId("campaign", mission.campaignId), associationKey),
      from: roleNodeId,
      to: graphNodeId("campaign", mission.campaignId),
      relation: "participates_in",
      provenance: "evidenced",
      explanation: "At least one source-backed Action assigned to this protected role belongs to the Campaign. This is a read-only relationship rollup, not an authority grant.",
      sourceReferences: [assignmentRef, source("mission", mission.id, "campaignId", `campaignId: ${mission.campaignId}`)],
    });
  }

  const configurationGroups: Array<{
    sourceType: string;
    items: Array<{ id: string; name: string; familyId: string; version: number; supersedesId: string | null; createdAt: string }>;
  }> = [
    { sourceType: "subscription_plan_version", items: state.subscriptionPlanVersions },
    { sourceType: "price_card_version", items: state.priceCardVersions },
    { sourceType: "model_profile_version", items: state.modelProfileVersions },
    { sourceType: "allocation_rule_version", items: state.allocationRuleVersions },
    { sourceType: "budget_settings_version", items: state.budgetSettingsVersions },
    {
      sourceType: "presentation_settings_version",
      items: state.presentationVersions.map((item) => ({
        ...item,
        name: `${themeProfile(item.themeProfileId).shortName} / ${item.roleProfileName}`,
      })),
    },
  ];
  for (const group of configurationGroups) {
    for (const item of group.items) {
      const id = graphNodeId(group.sourceType, item.id);
      addNode({
        id,
        sourceType: group.sourceType,
        sourceId: item.id,
        label: `${item.name} · v${item.version}`,
        category: "configuration",
        provenance: "evidenced",
        explanation: "This node is an immutable Commander-created local configuration version used for reproducible AERARIUM calculations.",
        sourceReferences: [source(group.sourceType, item.id, "$", "Authoritative configuration version")],
        attributes: { familyId: item.familyId, version: item.version, createdAt: item.createdAt },
      });
      if (item.supersedesId) {
        const targetId = graphNodeId(group.sourceType, item.supersedesId);
        const target = nodeIds.has(targetId)
          ? targetId
          : ensureUnknownNode(group.sourceType, item.supersedesId, source(group.sourceType, item.id, "supersedesId"));
        addEdge({
          id: edgeId("supersedes", id, target, item.id),
          from: id,
          to: target,
          relation: "supersedes",
          provenance: nodes.find((node) => node.id === target)?.provenance === "unknown/gap" ? "unknown/gap" : "evidenced",
          explanation: "The immutable supersedesId field preserves configuration version lineage.",
          sourceReferences: [source(group.sourceType, item.id, "supersedesId", `supersedesId: ${item.supersedesId}`)],
        });
      }
    }
  }

  for (const version of state.presentationVersions) {
    const versionId = graphNodeId("presentation_settings_version", version.id);
    for (const entry of version.roles) {
      const target = graphNodeId("role", entry.canonicalId);
      addEdge({
        id: edgeId("displays_role", versionId, target, `${version.id}:${entry.canonicalId}`),
        from: versionId,
        to: target,
        relation: "displays_role",
        provenance: "evidenced",
        explanation: "This presentation version supplies display-only metadata for the protected canonical role; authority and permissions are unchanged.",
        sourceReferences: [source("presentation_settings_version", version.id, `roles.${entry.canonicalId}`, `Display: ${entry.displayName}`)],
      });
    }
  }

  for (const profile of state.modelProfileVersions) {
    const profileId = graphNodeId("model_profile_version", profile.id);
    const priceId = nodeIds.has(graphNodeId("price_card_version", profile.priceCardVersionId))
      ? graphNodeId("price_card_version", profile.priceCardVersionId)
      : ensureUnknownNode("price_card_version", profile.priceCardVersionId, source("model_profile_version", profile.id, "priceCardVersionId"));
    addEdge({
      id: edgeId("priced_by", profileId, priceId, profile.id),
      from: profileId,
      to: priceId,
      relation: "priced_by",
      provenance: nodes.find((node) => node.id === priceId)?.provenance === "unknown/gap" ? "unknown/gap" : "evidenced",
      explanation: "ModelProfile.priceCardVersionId fixes the exact Price Card version used by matching estimates.",
      sourceReferences: [source("model_profile_version", profile.id, "priceCardVersionId")],
    });
    const roleId = graphNodeId("role", profile.roleId);
    const roleTarget = nodeIds.has(roleId)
      ? roleId
      : ensureUnknownNode("role", profile.roleId, source("model_profile_version", profile.id, "roleId"));
    addEdge({
      id: edgeId("applies_to_role", profileId, roleTarget, profile.id),
      from: profileId,
      to: roleTarget,
      relation: "applies_to_role",
      provenance: nodes.find((node) => node.id === roleTarget)?.provenance === "unknown/gap" ? "unknown/gap" : "evidenced",
      explanation: "ModelProfile.roleId scopes the exact profile to this role ID.",
      sourceReferences: [source("model_profile_version", profile.id, "roleId")],
    });
  }

  for (const rule of state.allocationRuleVersions) {
    const id = graphNodeId("allocation_rule_version", rule.id);
    const planId = nodeIds.has(graphNodeId("subscription_plan_version", rule.subscriptionPlanVersionId))
      ? graphNodeId("subscription_plan_version", rule.subscriptionPlanVersionId)
      : ensureUnknownNode("subscription_plan_version", rule.subscriptionPlanVersionId, source("allocation_rule_version", rule.id, "subscriptionPlanVersionId"));
    addEdge({
      id: edgeId("allocates_from", id, planId, rule.id),
      from: id,
      to: planId,
      relation: "allocates_from",
      provenance: nodes.find((node) => node.id === planId)?.provenance === "unknown/gap" ? "unknown/gap" : "evidenced",
      explanation: "AllocationRule.subscriptionPlanVersionId fixes the plan fee source for deterministic allocation.",
      sourceReferences: [source("allocation_rule_version", rule.id, "subscriptionPlanVersionId")],
    });
    for (const roleId of rule.eligibleRoleIds) {
      const targetId = graphNodeId("role", roleId);
      const target = nodeIds.has(targetId)
        ? targetId
        : ensureUnknownNode("role", roleId, source("allocation_rule_version", rule.id, "eligibleRoleIds"));
      addEdge({
        id: edgeId("eligible_role", id, target, `${rule.id}:${roleId}`),
        from: id,
        to: target,
        relation: "eligible_role",
        provenance: nodes.find((node) => node.id === target)?.provenance === "unknown/gap" ? "unknown/gap" : "evidenced",
        explanation: "The Allocation Rule's eligibleRoleIds list includes this exact role ID.",
        sourceReferences: [source("allocation_rule_version", rule.id, "eligibleRoleIds", `eligible role: ${roleId}`)],
      });
    }
  }

  for (const run of state.aerariumRuns) {
    const id = graphNodeId("aerarium_run", run.id);
    const events = state.aerariumRunEvents.filter((event) => event.runId === run.id);
    const ended = events.some((event) => event.type === "end");
    addNode({
      id,
      sourceType: "aerarium_run",
      sourceId: run.id,
      label: run.title,
      category: "aerarium",
      provenance: events.length ? "evidenced" : "unknown/gap",
      explanation: "This node exists because Castra contains the authoritative append-only AERARIUM Run record and its event ledger.",
      sourceReferences: [source("aerarium_run", run.id, "$", "Authoritative AERARIUM Run")],
      attributes: { roleId: run.roleId, modelKey: run.modelKey, ended, eventCount: events.length },
    });
    const workRef = source("aerarium_run", run.id, "work", `${run.work.type}:${run.work.id}`);
    const workTarget = resolveWorkNode(run.work, workRef);
    addEdge({
      id: edgeId("accounts_for", id, workTarget, run.id),
      from: id,
      to: workTarget,
      relation: "accounts_for",
      provenance: nodes.find((node) => node.id === workTarget)?.provenance === "unknown/gap" ? "unknown/gap" : "evidenced",
      explanation: "AerariumRun.work places the ledger activity in its authoritative work-item context.",
      sourceReferences: [workRef],
    });
    const roleTargetId = graphNodeId("role", run.roleId);
    const roleTarget = nodeIds.has(roleTargetId)
      ? roleTargetId
      : ensureUnknownNode("role", run.roleId, source("aerarium_run", run.id, "roleId"));
    addEdge({
      id: edgeId("performed_by", id, roleTarget, run.id),
      from: id,
      to: roleTarget,
      relation: "performed_by",
      provenance: nodes.find((node) => node.id === roleTarget)?.provenance === "unknown/gap" ? "unknown/gap" : "evidenced",
      explanation: "AerariumRun.roleId records the compact role label associated with the run; it does not imply autonomous activity.",
      sourceReferences: [source("aerarium_run", run.id, "roleId")],
    });
  }

  for (const event of state.aerariumRunEvents) {
    const id = graphNodeId("aerarium_run_event", event.id);
    addNode({
      id,
      sourceType: "aerarium_run_event",
      sourceId: event.id,
      label: `${event.type} · ${event.occurredAt}`,
      category: "aerarium",
      provenance: "evidenced",
      explanation: "This append-only event node reproduces a locally recorded AERARIUM event timestamp and supplied fields.",
      sourceReferences: [source("aerarium_run_event", event.id, "$", "Authoritative Run Event")],
      attributes: { eventType: event.type, occurredAt: event.occurredAt, note: event.note, outcome: event.outcome },
    });
    const target = nodeIds.has(graphNodeId("aerarium_run", event.runId))
      ? graphNodeId("aerarium_run", event.runId)
      : ensureUnknownNode("aerarium_run", event.runId, source("aerarium_run_event", event.id, "runId"));
    addEdge({
      id: edgeId("event_of", id, target, event.id),
      from: id,
      to: target,
      relation: "event_of",
      provenance: nodes.find((node) => node.id === target)?.provenance === "unknown/gap" ? "unknown/gap" : "evidenced",
      explanation: "AerariumRunEvent.runId attaches this append-only event to its Run.",
      sourceReferences: [source("aerarium_run_event", event.id, "runId")],
    });
  }

  for (const measure of state.aerariumMeasures) {
    const id = graphNodeId("aerarium_measure", measure.id);
    const missing = measurementProvenanceMissing(state, measure);
    addNode({
      id,
      sourceType: "aerarium_measure",
      sourceId: measure.id,
      label: `${measure.kind.replaceAll("_", " ")} · ${measure.value} ${measure.currency || measure.unit}`,
      category: "aerarium",
      provenance: missing.length ? "unknown/gap" : "evidenced",
      explanation: "This node preserves one labeled AERARIUM measure type; it is never blended into an unlabeled actual cost.",
      sourceReferences: [source("aerarium_measure", measure.id, "$", "Authoritative stored measure")],
      attributes: {
        kind: measure.kind,
        value: measure.value,
        unit: measure.unit,
        currency: measure.currency,
        provenance: measure.provenance,
        confidence: measure.confidence,
        provisional: measure.provisional,
        inputs: JSON.stringify(measure.inputs),
      },
    });
    const runTarget = nodeIds.has(graphNodeId("aerarium_run", measure.runId))
      ? graphNodeId("aerarium_run", measure.runId)
      : ensureUnknownNode("aerarium_run", measure.runId, source("aerarium_measure", measure.id, "runId"));
    addEdge({
      id: edgeId("measures", id, runTarget, measure.id),
      from: id,
      to: runTarget,
      relation: "measures",
      provenance: missing.length ? "unknown/gap" : "evidenced",
      explanation: "AerariumMeasure.runId links this separately labeled measure to its source Run.",
      sourceReferences: [source("aerarium_measure", measure.id, "runId")],
    });
    addReferenceNode(id, "aerarium_measure", measure.id, "evidenceReference", measure.evidenceReference, "supports");
    for (const [sourceType, versionId, field] of [
      ["model_profile_version", measure.profileVersionId, "profileVersionId"],
      ["price_card_version", measure.priceCardVersionId, "priceCardVersionId"],
      ["subscription_plan_version", measure.subscriptionPlanVersionId, "subscriptionPlanVersionId"],
      ["allocation_rule_version", measure.allocationRuleVersionId, "allocationRuleVersionId"],
    ] as const) {
      if (!versionId) continue;
      const targetId = graphNodeId(sourceType, versionId);
      const target = nodeIds.has(targetId)
        ? targetId
        : ensureUnknownNode(sourceType, versionId, source("aerarium_measure", measure.id, field));
      addEdge({
        id: edgeId("calculated_with", id, target, `${measure.id}:${field}`),
        from: id,
        to: target,
        relation: "calculated_with",
        provenance: nodes.find((node) => node.id === target)?.provenance === "unknown/gap" ? "unknown/gap" : "evidenced",
        explanation: `The stored ${field} preserves the exact configuration version used by this historical measure.`,
        sourceReferences: [source("aerarium_measure", measure.id, field, `${field}: ${versionId}`)],
      });
    }
    if (missing.length) {
      addGap({
        kind: "missing_measurement_provenance",
        severity: "blocking",
        governedNodeId: id,
        explanation: `The ${measure.kind.replaceAll("_", " ")} measure lacks ${missing.join(", ")}.`,
        remediation: "Preserve the missing evidence/configuration references and calculation inputs in the authoritative AERARIUM record.",
        sourceReferences: [source("aerarium_measure", measure.id, "provenance", `Missing: ${missing.join(", ")}`)],
      });
    }
  }

  const welcome = currentWelcomeAccessConfiguration(state);
  const welcomeId = graphNodeId("welcome_access_configuration_version", welcome.id);
  addNode({
    id: welcomeId,
    sourceType: "welcome_access_configuration_version",
    sourceId: welcome.id,
    label: "Welcome & Access route contract",
    category: "configuration",
    provenance: state.welcomeAccessConfigurationVersions.length ? "evidenced" : "proposed",
    explanation: "This versioned contract defines Login, Public Demo, About, and authenticated Command Overview destinations without accepting credentials in A001.",
    sourceReferences: [source("welcome_access_configuration_version", welcome.id, "$", "Welcome/Access route contract")],
    attributes: { destinations: welcome.destinations.map((item) => item.id).join(","), authenticatedTarget: welcome.authenticatedTarget, currentDefaultRoute: welcome.currentA001DefaultRoute, acceptsCredentials: welcome.acceptsCredentials },
  });

  const authPolicy = currentAuthenticationPolicy(state);
  const policyId = graphNodeId("authentication_policy_version", authPolicy.id);
  addNode({
    id: policyId,
    sourceType: "authentication_policy_version",
    sourceId: authPolicy.id,
    label: `Authentication policy v${authPolicy.version}`,
    category: "configuration",
    provenance: authPolicy.providerState === "disabled" || authPolicy.valuesStatus !== "commander_accepted" ? "proposed" : "evidenced",
    explanation: "This non-secret policy version defines the single-Commander deployment model, administrator-provisioned initial identity, verification, session/step-up ceilings, server-only cookie scope, redirect allowlist, offline failure, and Demo isolation.",
    sourceReferences: [source("authentication_policy_version", authPolicy.id, "$", "Authentication policy contract")],
    attributes: { deploymentModel: authPolicy.deploymentModel, maximumProductionIdentities: authPolicy.maximumProductionIdentities, publicSignupEnabled: authPolicy.publicSignupEnabled, magicLinkEnabled: authPolicy.magicLinkEnabled, providerState: authPolicy.providerState, emailVerificationRequired: authPolicy.emailVerificationRequired, valuesStatus: authPolicy.valuesStatus, callbackCount: authPolicy.callbackRedirectAllowlist.length, demoSessionReuse: authPolicy.demoSessionReuse, demoDataTransfer: authPolicy.demoDataTransfer },
  });
  addEdge({ id: edgeId("governs_access", policyId, welcomeId, authPolicy.id), from: policyId, to: welcomeId, relation: "governs_access", provenance: "proposed", explanation: "The Authentication Policy constrains the future Welcome page's Login and Demo entry boundaries.", sourceReferences: [source("authentication_policy_version", authPolicy.id, "providerState")] });

  if (authPolicy.providerState === "disabled") {
    addGap({ kind: "authentication_gap", severity: "attention", governedNodeId: policyId, explanation: "The authentication provider is Disabled; no production identity action or protected-route session can be proven in A001.", remediation: "Complete the later approved server/provider implementation and verification without adding secrets to the static browser.", sourceReferences: [source("authentication_policy_version", authPolicy.id, "providerState", "providerState: disabled")] });
  }
  if (!authPolicy.callbackRedirectAllowlist.length) {
    addGap({ kind: "authentication_gap", severity: "blocking", governedNodeId: policyId, explanation: "The exact authentication callback/redirect allowlist is missing.", remediation: "Record the approved HTTPS host-scoped callback path before enabling a provider.", sourceReferences: [source("authentication_policy_version", authPolicy.id, "callbackRedirectAllowlist")] });
  }

  const identities = currentIdentityVersions(state);
  if (!identities.length) {
    addGap({ kind: "authentication_gap", severity: "attention", governedNodeId: policyId, explanation: "No non-secret identity evidence exists; this is expected while the provider remains Disabled.", remediation: "A later single-Commander provider validation must record the one opaque identity reference and separate Commander/Product Owner authority evidence—never credentials.", sourceReferences: [source("authentication_policy_version", authPolicy.id, "providerState")] });
  }
  for (const identity of identities) {
    const id = graphNodeId("identity_reference_version", identity.id);
    const healthy = identity.lifecycleState === "active" && identity.verificationState === "verified" && Boolean(identity.evidenceReference.trim());
    addNode({ id, sourceType: "identity_reference_version", sourceId: identity.id, label: identity.displayReference, category: "approval", provenance: healthy ? "evidenced" : "unknown/gap", explanation: "This node is an opaque, non-secret identity reference. It is separate from Commander and Product Owner authority assignments.", sourceReferences: [source("identity_reference_version", identity.id, "$", "Non-secret identity reference")], attributes: { familyId: identity.familyId, lifecycleState: identity.lifecycleState, verificationState: identity.verificationState, secretMaterialStored: false } });
    if (!identity.evidenceReference.trim() || !healthy) {
      addGap({ kind: "authentication_gap", severity: identity.lifecycleState === "active" ? "attention" : "blocking", governedNodeId: id, explanation: `Identity evidence is ${identity.evidenceReference.trim() ? "present" : "missing"}; state is ${identity.lifecycleState}/${identity.verificationState}.`, remediation: "Require verification evidence and an active identity before granting protected-route access.", sourceReferences: [source("identity_reference_version", identity.id, "evidenceReference")] });
    }
    for (const assignment of currentAuthorityAssignments(state, identity.familyId)) {
      const assignmentId = graphNodeId("authority_assignment", assignment.id);
      addNode({ id: assignmentId, sourceType: "authority_assignment", sourceId: assignment.id, label: assignment.authority, category: "approval", provenance: "approved", explanation: "This immutable assignment records one authority separately even when the same authenticated person holds both roles.", sourceReferences: [source("authority_assignment", assignment.id, "$", `${assignment.authority} assignment`)], attributes: { authority: assignment.authority, status: assignment.status, recordedBy: assignment.recordedBy } });
      addEdge({ id: edgeId("assigned_to", assignmentId, id, assignment.id), from: assignmentId, to: id, relation: "assigned_to", provenance: "approved", explanation: "AuthorityAssignment.identityFamilyId binds this authority to the non-secret identity family.", sourceReferences: [source("authority_assignment", assignment.id, "identityFamilyId")] });
    }
  }

  const currentSessions = currentSessionReceipts(state);
  for (const receipt of currentSessions) {
    const id = graphNodeId("session_receipt", receipt.id);
    const expired = receipt.status === "expired" || Date.parse(generatedAt) >= Math.min(Date.parse(receipt.idleExpiresAt), Date.parse(receipt.absoluteExpiresAt), Date.parse(receipt.expiresAt));
    addNode({ id, sourceType: "session_receipt", sourceId: receipt.id, label: `Session metadata · ${receipt.status}`, category: "evidence", provenance: receipt.status === "active" && !expired ? "evidenced" : "unknown/gap", explanation: "This immutable receipt contains session metadata and authority references only; it never contains an access or refresh token.", sourceReferences: [source("session_receipt", receipt.id, "$", "Non-secret session receipt")], attributes: { sessionReference: receipt.sessionReference, status: receipt.status, idleExpiresAt: receipt.idleExpiresAt, absoluteExpiresAt: receipt.absoluteExpiresAt, expiresAt: receipt.expiresAt, provenance: receipt.provenance, secretMaterialStored: false } });
    const identity = identities.find((item) => item.familyId === receipt.identityFamilyId);
    const target = identity ? graphNodeId("identity_reference_version", identity.id) : ensureUnknownNode("identity_reference_version", receipt.identityFamilyId, source("session_receipt", receipt.id, "identityFamilyId"));
    addEdge({ id: edgeId("session_for", id, target, receipt.id), from: id, to: target, relation: "session_for", provenance: identity ? "evidenced" : "unknown/gap", explanation: "SessionReceipt.identityFamilyId binds this metadata receipt to its identity evidence.", sourceReferences: [source("session_receipt", receipt.id, "identityFamilyId")] });
    if (expired || receipt.status !== "active") addGap({ kind: "authentication_gap", severity: "blocking", governedNodeId: id, explanation: `Session receipt is ${expired ? "expired" : receipt.status} and cannot authorize protected routes.`, remediation: "Require a fresh network-backed server session after the later provider is enabled; never invent one offline.", sourceReferences: [source("session_receipt", receipt.id, "status", receipt.status)] });
  }

  for (const receipt of state.stepUpReceipts) {
    const id = graphNodeId("step_up_receipt", receipt.id);
    const fresh = receipt.outcome === "passed" && Date.parse(generatedAt) <= Date.parse(receipt.validUntil);
    addNode({ id, sourceType: "step_up_receipt", sourceId: receipt.id, label: `Product Owner step-up · ${receipt.sensitiveActionClass}`, category: "approval", provenance: fresh ? "approved" : "unknown/gap", explanation: "This action-bound receipt proves separate Product Owner authority and freshness without storing a credential.", sourceReferences: [source("step_up_receipt", receipt.id, "$", "Product Owner step-up receipt")], attributes: { actionClass: receipt.sensitiveActionClass, outcome: receipt.outcome, verifiedAt: receipt.verifiedAt, validUntil: receipt.validUntil, secretMaterialStored: false } });
  }
  for (const identity of identities) {
    const productOwner = currentAuthorityAssignments(state, identity.familyId).find((item) => item.authority === "Product Owner");
    if (productOwner && !state.stepUpReceipts.some((item) => item.identityFamilyId === identity.familyId && item.outcome === "passed" && Date.parse(generatedAt) <= Date.parse(item.validUntil))) {
      addGap({ kind: "authentication_gap", severity: "attention", governedNodeId: graphNodeId("authority_assignment", productOwner.id), explanation: "Product Owner authority exists but no fresh successful action-bound step-up receipt exists.", remediation: "Require fresh server reauthentication for each protected foundational action class.", sourceReferences: [source("authority_assignment", productOwner.id, "authority", "Product Owner")] });
    }
  }

  for (const record of state.authWorkflowRecords) {
    const id = graphNodeId("auth_workflow_record", record.id);
    addNode({ id, sourceType: "auth_workflow_record", sourceId: record.id, label: `${record.workflow} · ${record.state}`, category: "audit", provenance: ["succeeded", "verified", "authenticated", "refreshed", "logged_out"].includes(record.state) ? "evidenced" : record.state === "pending" ? "proposed" : "unknown/gap", explanation: "This redacted append-only workflow result preserves a generic public status and failure category without revealing account existence or secrets.", sourceReferences: [source("auth_workflow_record", record.id, "$", "Redacted authentication workflow")], attributes: { workflow: record.workflow, state: record.state, failureCategory: record.failureCategory, providerState: record.providerState, networkAvailable: record.networkAvailable, secretMaterialStored: false } });
    if (record.workflow === "demo_entry" && (record.identityFamilyId || ["succeeded", "authenticated"].includes(record.state))) addGap({ kind: "authentication_gap", severity: "blocking", governedNodeId: id, explanation: "A Demo/session leakage attempt was detected: Demo entry must not create/reuse production identity or session state.", remediation: "Reject the entry and preserve the zero-identity, zero-session, zero-transfer Demo boundary.", sourceReferences: [source("auth_workflow_record", record.id, "identityFamilyId")] });
  }

  for (const event of state.authEvents) {
    addNode({ id: graphNodeId("auth_event", event.id), sourceType: "auth_event", sourceId: event.id, label: `Auth #${event.sequence} · ${event.workflow}`, category: "audit", provenance: "evidenced", explanation: "This is ordered redacted authentication evidence; account existence and secret material are excluded.", sourceReferences: [source("auth_event", event.id, "$", `Auth event #${event.sequence}`)], attributes: { sequence: event.sequence, status: event.status, failureCategory: event.failureCategory, redaction: event.redaction } });
  }

  const secretViolations = findAuthSecretViolations({ welcomeAccessConfigurationVersions: state.welcomeAccessConfigurationVersions, authenticationPolicyVersions: state.authenticationPolicyVersions, identityReferenceVersions: state.identityReferenceVersions, authorityAssignments: state.authorityAssignments, authWorkflowRecords: state.authWorkflowRecords, sessionReceipts: state.sessionReceipts, stepUpReceipts: state.stepUpReceipts, authEvents: state.authEvents, authAuditEvents: state.auditEvents.filter((event) => event.entityType.startsWith("auth") || event.entityType.startsWith("identity") || event.entityType.startsWith("session") || event.entityType.startsWith("step_up") || event.entityType.startsWith("authority") || event.entityType.startsWith("welcome")) }, "authenticationState");
  for (const violation of secretViolations) {
    addGap({ kind: "authentication_gap", severity: "blocking", governedNodeId: policyId, explanation: `A prohibited authentication secret-shaped ${violation.category.replaceAll("_", " ")} was detected at a redacted path; its value is not projected.`, remediation: "Reject and remove the prohibited field through schema normalization; never copy its value into audit, graph, export, or logs.", sourceReferences: [source("authentication_policy_version", authPolicy.id, "secretBoundary", violation.path)] });
  }

  const auditTargetType = (entityType: AuditEntityType): string => entityType;
  for (const event of [...state.auditEvents].sort((a, b) => a.sequence - b.sequence)) {
    const id = graphNodeId("audit", event.id);
    addNode({
      id,
      sourceType: "audit",
      sourceId: event.id,
      label: `#${event.sequence} · ${event.kind}`,
      category: "audit",
      provenance: "evidenced",
      explanation: "This node comes from Castra's ordered append-only audit trail and preserves its direct Commander origin.",
      sourceReferences: [source("audit", event.id, "$", `Audit sequence #${event.sequence}`)],
      attributes: {
        sequence: event.sequence,
        occurredAt: event.occurredAt,
        actor: event.actor,
        origin: event.origin,
        summary: event.summary,
      },
    });
    const targetType = auditTargetType(event.entityType);
    const targetId = graphNodeId(targetType, event.entityId);
    const target = nodeIds.has(targetId)
      ? targetId
      : ensureUnknownNode(targetType, event.entityId, source("audit", event.id, "entityId"));
    addEdge({
      id: edgeId("audits", id, target, event.id),
      from: id,
      to: target,
      relation: "audits",
      provenance: "evidenced",
      explanation: "AuditEvent.entityType/entityId identifies the authoritative record affected by this ordered event.",
      sourceReferences: [source("audit", event.id, "entityId", `${event.entityType}:${event.entityId}`)],
    });
  }

  for (const record of [...state.campaigns, ...state.missions, ...state.actions]) {
    const related = state.auditEvents
      .filter((event) => event.entityType === record.type && event.entityId === record.id)
      .sort((a, b) => a.sequence - b.sequence);
    const latestApprovalEvent = related.filter((event) => ["approval.granted", "approval.invalidated"].includes(event.kind)).at(-1);
    if (!record.approval && latestApprovalEvent?.kind === "approval.invalidated") {
      addGap({
        kind: "invalidated_approval",
        severity: "attention",
        governedNodeId: graphNodeId(record.type, record.id),
        explanation: `${record.title}'s latest approval event is invalidation audit #${latestApprovalEvent.sequence}; no later grant exists.`,
        remediation: "Review the material change and grant a new Commander approval when appropriate.",
        sourceReferences: [source("audit", latestApprovalEvent.id, "$", `approval.invalidated #${latestApprovalEvent.sequence}`)],
      });
    }
  }

  const criticalSources = [
    ...state.testCases.filter((item) => item.severity === "critical").map((item) => ({
      sourceType: "test_case",
      id: item.id,
      title: item.title,
      connected: state.testPlans.some((plan) => plan.id === item.testPlanId),
    })),
    ...state.punchItems.filter((item) => item.severity === "critical").map((item) => ({
      sourceType: "punch_item",
      id: item.id,
      title: item.title,
      connected:
        (item.source === "ui_review"
          ? state.uiReviewItems.some((reviewItem) => reviewItem.id === item.uiReviewItemId)
          : state.testResults.some((result) => result.id === item.testResultId)) &&
        (item.affectedWork.type === "baseops"
          ? false
          : item.affectedWork.type === "campaign"
            ? state.campaigns.some((record) => record.id === item.affectedWork.id)
            : item.affectedWork.type === "mission"
              ? state.missions.some((record) => record.id === item.affectedWork.id)
              : state.actions.some((record) => record.id === item.affectedWork.id)),
    })),
  ];
  for (const item of criticalSources) {
    const id = graphNodeId(item.sourceType, item.id);
    if (!item.connected) {
      addGap({
        kind: "disconnected_critical_node",
        severity: "blocking",
        governedNodeId: id,
        explanation: `${item.title} is critical but has no traceable edge to an existing non-gap governing record.`,
        remediation: "Restore its Test Plan, originating result, and/or affected-work traceability in authoritative Castra data.",
        sourceReferences: [source(item.sourceType, item.id, "severity", "severity: critical")],
      });
    }
  }

  return {
    contract: "castra.graphify-source-bundle",
    contractVersion: 1,
    generatedAt,
    authority: "Castra",
    mutability: "read-only",
    graphifyIntegration: "not-connected",
    nodes,
    edges,
    gaps,
    deterministicRules: gapRules,
  };
}
