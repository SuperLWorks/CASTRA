import type {
  AuditEvent,
  AuditKind,
  Campaign,
  CastraState,
  CommandContext,
  DeploymentCommanderDecision,
  DeploymentReceipt,
  DeploymentRequest,
  DeploymentWorkbenchCommand,
} from "./types.js";
import { deploymentGateSatisfied, requireDeploymentGate } from "./deploymentEligibility.js";
import { sha256 } from "./remoteWork.js";

const sensitivePattern = /(authorization\s*:|bearer\s+|api[_ -]?key|password\s*=|token\s*=|cookie\s*:|client_secret|private_key|-----BEGIN)/i;

function requiredText(value: string, label: string, max = 2_000): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > max) throw new Error(`${label} must be ${max.toLocaleString()} characters or fewer.`);
  assertRedacted(normalized, label);
  return normalized;
}

function optionalText(value: string, label: string, max = 2_000): string {
  const normalized = value.trim();
  if (normalized.length > max) throw new Error(`${label} must be ${max.toLocaleString()} characters or fewer.`);
  if (normalized) assertRedacted(normalized, label);
  return normalized;
}

function assertRedacted(value: string, label: string): void {
  if (sensitivePattern.test(value)) throw new Error(`${label} appears to contain credential or raw sensitive data. Store only a redacted reference.`);
}

function instant(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp.`);
  return parsed;
}

export function deploymentMaterialHash(input: Pick<DeploymentRequest, "providerLabel" | "productName" | "projectSlug" | "environment" | "sourceBuildReference" | "targetHostname" | "campaignId" | "actionId" | "previewReceiptId">): string {
  const canonical = JSON.stringify({
    providerLabel: input.providerLabel,
    productName: input.productName,
    projectSlug: input.projectSlug,
    environment: input.environment,
    sourceBuildReference: input.sourceBuildReference,
    targetHostname: input.targetHostname,
    campaignId: input.campaignId,
    actionId: input.actionId,
    previewReceiptId: input.previewReceiptId,
  });
  return `sha256-v1:${sha256(canonical)}`;
}

export function isDeploymentWorkbenchCommand(command: { type: string }): command is DeploymentWorkbenchCommand {
  return command.type.startsWith("deployment_request.")
    || command.type.startsWith("deployment_handoff.")
    || command.type.startsWith("deployment_receipt.");
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

function requireRequest(state: CastraState, id: string): DeploymentRequest {
  const request = state.deploymentRequests.find((item) => item.id === id);
  if (!request) throw new Error("Deployment Request was not found.");
  return request;
}

function relationCampaign(state: CastraState, campaignId: string, actionId: string): Campaign {
  const campaign = state.campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error("Deployment Request Campaign was not found.");
  const action = state.actions.find((item) => item.id === actionId);
  if (!action) throw new Error("Deployment Request Action was not found.");
  if (action.actionKind !== "deployment") throw new Error("Deployment Request requires an Action classified as deployment.");
  const mission = state.missions.find((item) => item.id === action.missionId);
  if (!mission || mission.campaignId !== campaign.id) throw new Error("Deployment Action does not belong to the selected Campaign.");
  return campaign;
}

function currentDecision(state: CastraState, requestId: string): DeploymentCommanderDecision | null {
  return [...state.deploymentCommanderDecisions].reverse().find((item) => item.requestId === requestId) ?? null;
}

function verifiedPreview(state: CastraState, request: DeploymentRequest): DeploymentReceipt | null {
  if (!request.previewReceiptId) return null;
  const receipt = state.deploymentReceipts.find((item) => item.id === request.previewReceiptId && item.state === "verified") ?? null;
  if (!receipt) return null;
  const previewRequest = state.deploymentRequests.find((item) => item.id === receipt.requestId);
  if (!previewRequest || previewRequest.environment !== "preview") return null;
  if (previewRequest.campaignId !== request.campaignId || previewRequest.actionId !== request.actionId) return null;
  if (previewRequest.providerLabel !== request.providerLabel || previewRequest.targetHostname !== request.targetHostname) return null;
  return receipt;
}

export interface DeploymentHandoffGate {
  ready: boolean;
  reasons: string[];
}

export function evaluateDeploymentHandoff(state: CastraState, request: DeploymentRequest, at: string): DeploymentHandoffGate {
  const reasons: string[] = [];
  let campaign: Campaign | null = null;
  try {
    campaign = relationCampaign(state, request.campaignId, request.actionId);
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : "Deployment relation is invalid.");
  }
  if (campaign && !deploymentGateSatisfied(campaign)) reasons.push(`Campaign Deployment Eligibility is ${campaign.deploymentEligibility.disposition ?? "unresolved"}.`);
  if (request.providerLabel !== "Vercel + Porkbun") reasons.push("Manual Assist is limited to the approved Vercel + Porkbun provider pattern.");
  if (request.productName !== "CASTRA" || request.projectSlug !== "castra") reasons.push("Product name and Vercel technical slug must remain CASTRA / castra.");
  if (request.targetHostname !== "castra.superlworks.com") reasons.push("Target hostname must be castra.superlworks.com.");
  const decision = currentDecision(state, request.id);
  if (!decision || decision.decision !== "approved") reasons.push("Fresh Commander approval is required.");
  if (decision && (decision.requestRevision !== request.revision || decision.materialInputHash !== request.materialInputHash)) reasons.push("Commander approval does not match the current material-input revision/hash.");
  if (decision?.expiresAt && instant(decision.expiresAt, "Approval expiry") <= instant(at, "Evaluation time")) reasons.push("Commander approval is stale or expired.");
  if (request.environment === "production" && !verifiedPreview(state, request)) reasons.push("Production requires a verified Preview receipt for the same Campaign, deployment Action, provider pattern, and hostname.");
  if (request.state !== "approved") reasons.push(`Request state is ${request.state}; only an approved request can enter manual handoff.`);
  if (state.deploymentReceipts.some((item) => item.requestId === request.id)) reasons.push("Request already has append-only receipt evidence and cannot be handed off again.");
  return { ready: reasons.length === 0, reasons };
}

function replaceRequest(state: CastraState, request: DeploymentRequest): CastraState {
  return { ...state, deploymentRequests: state.deploymentRequests.map((item) => item.id === request.id ? request : item) };
}

function appendReceipt(
  state: CastraState,
  context: CommandContext,
  occurredAt: string,
  request: DeploymentRequest,
  receipt: Omit<DeploymentReceipt, "id" | "requestId" | "externalCallsByCastra" | "automaticRetry" | "createdAt">,
): CastraState {
  const record: DeploymentReceipt = {
    id: context.id("deployment_receipt"),
    requestId: request.id,
    ...receipt,
    externalCallsByCastra: 0,
    automaticRetry: false,
    createdAt: occurredAt,
  };
  const next = { ...state, deploymentReceipts: [...state.deploymentReceipts, record] };
  return appendAudit(next, context, occurredAt, "deployment_receipt.recorded", "deployment_receipt", record.id, `Manual-Assist Deployment Receipt recorded: ${record.state}`, { requestId: request.id, environment: request.environment, providerUrl: record.providerUrl || "not_recorded", providerStatusReference: record.providerStatusReference || "not_recorded", domainReference: record.domainReference || "not_recorded", evidenceReference: record.redactedEvidenceReference || "not_recorded", externalCallsByCastra: "0", automaticRetry: "false", successImplied: String(record.state === "verified") });
}

export function applyDeploymentWorkbenchCommand(state: CastraState, command: DeploymentWorkbenchCommand, context: CommandContext): CastraState {
  const occurredAt = context.now();

  if (command.type === "deployment_request.create") {
    relationCampaign(state, command.campaignId, command.actionId);
    const base = {
      providerLabel: requiredText(command.providerLabel, "Provider label", 180),
      productName: "CASTRA" as const,
      projectSlug: "castra" as const,
      environment: command.environment,
      sourceBuildReference: requiredText(command.sourceBuildReference, "Source/build reference", 1_000),
      targetHostname: requiredText(command.targetHostname, "Target hostname", 253).toLowerCase(),
      campaignId: command.campaignId,
      actionId: command.actionId,
      previewReceiptId: optionalText(command.previewReceiptId ?? "", "Preview receipt reference", 180),
    };
    const request: DeploymentRequest = {
      id: context.id("deployment_request"), revision: 1, ...base,
      materialInputHash: deploymentMaterialHash(base), state: "draft",
      authority: "manual_assist_record_only", createdAt: occurredAt, updatedAt: occurredAt,
    };
    const next = { ...state, deploymentRequests: [...state.deploymentRequests, request] };
    return appendAudit(next, context, occurredAt, "deployment_request.created", "deployment_request", request.id, `Deployment Request created: ${request.environment}`, { provider: request.providerLabel, productName: request.productName, projectSlug: request.projectSlug, sourceBuildReference: request.sourceBuildReference, targetHostname: request.targetHostname, campaignId: request.campaignId, actionId: request.actionId, materialInputHash: request.materialInputHash, authority: request.authority, externalCalls: "0" });
  }

  if (command.type === "deployment_request.update") {
    const current = requireRequest(state, command.requestId);
    if (state.deploymentReceipts.some((item) => item.requestId === current.id)) throw new Error("A Deployment Request with receipt evidence is immutable; create a separate request.");
    const base = {
      providerLabel: requiredText(command.providerLabel, "Provider label", 180), productName: current.productName,
      projectSlug: current.projectSlug, environment: command.environment,
      sourceBuildReference: requiredText(command.sourceBuildReference, "Source/build reference", 1_000),
      targetHostname: requiredText(command.targetHostname, "Target hostname", 253).toLowerCase(),
      campaignId: current.campaignId, actionId: current.actionId,
      previewReceiptId: optionalText(command.previewReceiptId ?? "", "Preview receipt reference", 180),
    };
    const updated: DeploymentRequest = { ...current, ...base, revision: current.revision + 1, materialInputHash: deploymentMaterialHash(base), state: "draft", updatedAt: occurredAt };
    let next = replaceRequest(state, updated);
    const approved = [...state.deploymentCommanderDecisions].reverse().find((item) => item.requestId === current.id && item.decision === "approved");
    if (approved) next = appendAudit(next, context, occurredAt, "deployment_request.approval_invalidated", "deployment_commander_decision", approved.id, "Deployment Request approval invalidated by material input change", { requestId: current.id, approvedHash: approved.materialInputHash, currentHash: updated.materialInputHash, previousEnvironment: current.environment, currentEnvironment: updated.environment });
    return appendAudit(next, context, occurredAt, "deployment_request.updated", "deployment_request", updated.id, "Deployment Request material inputs updated", { revision: String(updated.revision), provider: updated.providerLabel, environment: updated.environment, sourceBuildReference: updated.sourceBuildReference, targetHostname: updated.targetHostname, materialInputHash: updated.materialInputHash, externalCalls: "0" });
  }

  if (command.type === "deployment_request.decide") {
    const request = requireRequest(state, command.requestId);
    if (state.deploymentReceipts.some((item) => item.requestId === request.id)) throw new Error("A Deployment Request with receipt evidence cannot receive a replacement decision.");
    const reason = requiredText(command.reason, "Commander decision reason", 2_000);
    let expiresAt: string | null = null;
    if (command.decision === "approved") {
      expiresAt = requiredText(command.expiresAt ?? "", "Approval expiry", 80);
      const now = instant(occurredAt, "Decision time");
      const expiry = instant(expiresAt, "Approval expiry");
      if (expiry <= now || expiry > now + 24 * 60 * 60 * 1_000) throw new Error("Approval expiry must be after the decision and no more than 24 hours later.");
    }
    const decision: DeploymentCommanderDecision = {
      id: context.id("deployment_commander_decision"), requestId: request.id, requestRevision: request.revision,
      materialInputHash: request.materialInputHash, decision: command.decision, reason,
      decidedBy: "Commander", decidedAt: occurredAt, expiresAt,
    };
    let next = { ...state, deploymentCommanderDecisions: [...state.deploymentCommanderDecisions, decision] };
    next = replaceRequest(next, { ...request, state: command.decision === "approved" ? "approved" : "draft", updatedAt: occurredAt });
    return appendAudit(next, context, occurredAt, command.decision === "approved" ? "deployment_request.approved" : "deployment_request.rejected", "deployment_commander_decision", decision.id, `Commander ${command.decision} Deployment Request`, { requestId: request.id, requestRevision: String(request.revision), materialInputHash: request.materialInputHash, expiresAt: expiresAt ?? "not_applicable", authority: request.authority, externalCalls: "0" });
  }

  if (command.type === "deployment_handoff.request") {
    const request = requireRequest(state, command.requestId);
    const campaign = relationCampaign(state, request.campaignId, request.actionId);
    requireDeploymentGate(campaign, "Requesting Manual-Assist deployment handoff");
    const gate = evaluateDeploymentHandoff(state, request, occurredAt);
    if (!gate.ready) throw new Error(`Manual handoff blocked: ${gate.reasons.join(" ")}`);
    const updated = { ...request, state: "handoff_requested" as const, updatedAt: occurredAt };
    let next = replaceRequest(state, updated);
    next = appendReceipt(next, context, occurredAt, updated, { state: "manual_assist_requested", providerUrl: "", providerStatusReference: "", domainReference: "", observedAt: occurredAt, redactedEvidenceReference: "", reason: "Commander requested a future human handoff; CASTRA performed no provider or DNS action." });
    return appendAudit(next, context, occurredAt, "deployment_handoff.requested", "deployment_request", request.id, "Commander requested Manual-Assist deployment handoff", { environment: request.environment, provider: request.providerLabel, targetHostname: request.targetHostname, externalCallsByCastra: "0", providerConnection: "none", automaticRetry: "false" });
  }

  if (command.type === "deployment_receipt.record") {
    const request = requireRequest(state, command.requestId);
    const receipts = state.deploymentReceipts.filter((item) => item.requestId === request.id);
    if (!receipts.some((item) => item.state === "manual_assist_requested")) throw new Error("Record a deliberate Manual-Assist handoff request before an attempted receipt.");
    if (["verified", "failed", "unknown", "cancelled"].includes(request.state)) throw new Error("Terminal Deployment Request state is immutable; no automatic retry is permitted.");
    if (command.state === "attempted" && request.state !== "handoff_requested") throw new Error("Attempted receipt requires handoff_requested state.");
    if (command.state !== "attempted" && request.state !== "attempted") throw new Error("Terminal receipt requires a prior attempted receipt.");
    if (receipts.some((item) => item.state === command.state)) throw new Error(`Deployment Receipt ${command.state} was already recorded.`);
    const providerUrl = optionalText(command.providerUrl, "Provider URL", 1_000);
    if (providerUrl && !/^https:\/\//i.test(providerUrl)) throw new Error("Provider URL must be an HTTPS reference.");
    const providerStatusReference = optionalText(command.providerStatusReference, "Provider status reference", 1_000);
    const domainReference = optionalText(command.domainReference, "Domain reference", 1_000);
    const evidenceReference = optionalText(command.redactedEvidenceReference, "Redacted evidence reference", 2_000);
    const reason = requiredText(command.reason, "Receipt reason", 2_000);
    instant(command.observedAt, "Observed time");
    if (command.state === "verified") {
      if (!providerUrl || !providerStatusReference || !domainReference || !evidenceReference) throw new Error("Verified receipt requires HTTPS provider URL, provider status reference, domain reference, and redacted evidence reference.");
      if (request.environment === "production" && !verifiedPreview(state, request)) throw new Error("Production verification requires its linked verified Preview receipt.");
    }
    const updatedState = command.state as DeploymentRequest["state"];
    const updated = { ...request, state: updatedState, updatedAt: occurredAt };
    return appendReceipt(replaceRequest(state, updated), context, occurredAt, updated, { state: command.state, providerUrl, providerStatusReference, domainReference, observedAt: command.observedAt, redactedEvidenceReference: evidenceReference, reason });
  }

  const request = requireRequest(state, command.requestId);
  if (["verified", "failed", "unknown", "cancelled"].includes(request.state)) throw new Error("Terminal Deployment Request state is immutable.");
  const reason = requiredText(command.reason, "Cancellation reason", 2_000);
  const updated = { ...request, state: "cancelled" as const, updatedAt: occurredAt };
  let next = appendReceipt(replaceRequest(state, updated), context, occurredAt, updated, { state: "cancelled", providerUrl: "", providerStatusReference: "", domainReference: "", observedAt: occurredAt, redactedEvidenceReference: "", reason });
  return appendAudit(next, context, occurredAt, "deployment_request.cancelled", "deployment_request", request.id, "Commander cancelled Deployment Request", { previousState: request.state, reason, automaticRetry: "false", externalCallsByCastra: "0" });
}
