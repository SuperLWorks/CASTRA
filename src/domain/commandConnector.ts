import { applyCommand } from "./commands.js";
import { assertAuthSecretFree } from "./authentication.js";
import type {
  AuditEvent,
  CastraState,
  CommandConnectorAuthority,
  CommandConnectorChannel,
  CommandConnectorIdentityReceipt,
  CommandConnectorOutcome,
  CommandConnectorReceipt,
  CommandConnectorResultPackage,
  CommandConnectorTestResult,
  CommandContext,
  LifecycleCommand,
} from "./types.js";

export const COMMAND_CONNECTOR_CONTRACT_VERSION = "castra-command-connector/1.0.0" as const;

export interface ConnectorIdentityInput {
  identityReference: string;
  sessionReference: string;
  channel: CommandConnectorChannel;
  authority: CommandConnectorAuthority;
  evidenceReference: string;
  validUntil: string;
}

export interface ConnectorResultInput {
  submissionId: string;
  identityReceiptId: string;
  workReference: string;
  agentIdentity: string;
  modelIdentity: string;
  proposedStatus: string;
  evidenceReferences: string[];
  tests: CommandConnectorTestResult[];
  blockers: string[];
  effortCostProvenance: string;
  nextStepRecommendation: string;
}

export interface ConnectorCommandInput {
  idempotencyKey: string;
  resultPackageId: string;
  expectedResultRevision: number;
  expectedResultBinding: string;
  authorityReceiptId: string;
  lifecycleCommand: LifecycleCommand;
}

export interface ConnectorOutcomeInput {
  idempotencyKey: string;
  resultPackageId: string;
  expectedResultRevision: number;
  expectedResultBinding: string;
  authorityReceiptId: string;
  outcome: Exclude<CommandConnectorOutcome, "applied" | "rejected">;
  reasonCode: string;
  reason: string;
}

function requiredText(value: string, label: string, maximum = 240): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return normalized;
}

function boundedList(values: string[], label: string, required: boolean, maximumItems = 20): string[] {
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (required && normalized.length === 0) throw new Error(`${label} requires at least one entry.`);
  if (normalized.length > maximumItems) throw new Error(`${label} allows no more than ${maximumItems} entries.`);
  if (normalized.some((value) => value.length > 500)) throw new Error(`${label} entries must be 500 characters or fewer.`);
  return normalized;
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

export function connectorBinding(value: unknown): string {
  const serialized = stableSerialize(value);
  let high = 0x9e3779b9;
  let low = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    low = Math.imul(low ^ serialized.charCodeAt(index), 0x01000193);
    high = Math.imul(high ^ (serialized.charCodeAt(index) + index), 0x85ebca6b);
  }
  return `cc-v1:${(high >>> 0).toString(16).padStart(8, "0")}${(low >>> 0).toString(16).padStart(8, "0")}`;
}

function timestamp(value: string, label: string): string {
  const normalized = requiredText(value, label);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(`${label} must be a valid timestamp.`);
  return normalized;
}

function appendConnectorAudit(
  state: CastraState,
  context: CommandContext,
  occurredAt: string,
  kind: "command_connector.identity_recorded" | "command_connector.result_received" | "command_connector.outcome_recorded" | "command_connector.command_applied",
  entityType: "command_connector_identity_receipt" | "command_connector_result_package" | "command_connector_receipt",
  entityId: string,
  summary: string,
  detail: Record<string, string>,
): CastraState {
  const event: AuditEvent = {
    id: context.id("audit"),
    sequence: state.nextAuditSequence,
    occurredAt,
    actor: "Governed connector",
    origin: "command_connector",
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

function activeIdentity(state: CastraState, receiptId: string, now: string): CommandConnectorIdentityReceipt {
  const receipt = state.commandConnectorIdentityReceipts.find((item) => item.id === receiptId);
  if (!receipt) throw new Error("Connector identity receipt not found.");
  if (receipt.revokedAt) throw new Error("Connector identity receipt is revoked.");
  if (Date.parse(receipt.validUntil) <= Date.parse(now)) throw new Error("Connector identity receipt is expired.");
  return receipt;
}

function commanderIdentity(state: CastraState, receiptId: string, now: string): CommandConnectorIdentityReceipt {
  const receipt = activeIdentity(state, receiptId, now);
  if (receipt.authority !== "Commander") throw new Error("A valid Commander authority receipt is required.");
  return receipt;
}

function resultById(state: CastraState, resultPackageId: string): CommandConnectorResultPackage {
  const result = state.commandConnectorResultPackages.find((item) => item.id === resultPackageId);
  if (!result) throw new Error("Connector result package not found.");
  return result;
}

function replaceResult(state: CastraState, result: CommandConnectorResultPackage): CastraState {
  return {
    ...state,
    commandConnectorResultPackages: state.commandConnectorResultPackages.map((item) => item.id === result.id ? result : item),
  };
}

function existingReceipt(state: CastraState, idempotencyKey: string, binding: string): CastraState | null {
  const existing = state.commandConnectorReceipts.find((receipt) => receipt.idempotencyKey === idempotencyKey);
  if (!existing) return null;
  if (existing.binding !== binding) throw new Error("Connector idempotency key was already used for different content.");
  return state;
}

function assertResultBinding(result: CommandConnectorResultPackage, expectedRevision: number, expectedBinding: string): void {
  if (result.revision !== expectedRevision) throw new Error(`Result revision mismatch: expected ${expectedRevision}, current ${result.revision}.`);
  if (result.binding !== expectedBinding) throw new Error("Result binding mismatch.");
}

function appendConnectorReceipt(
  state: CastraState,
  context: CommandContext,
  occurredAt: string,
  input: ConnectorCommandInput | ConnectorOutcomeInput,
  result: CommandConnectorResultPackage,
  identity: CommandConnectorIdentityReceipt,
  authority: CommandConnectorIdentityReceipt,
  outcome: CommandConnectorOutcome,
  reasonCode: string,
  reason: string,
  binding: string,
  lifecycleCommandId: string,
  lifecycleReceiptCommandId: string | null,
): CastraState {
  const receipt: CommandConnectorReceipt = {
    id: context.id("command_connector_receipt"),
    contractVersion: 1,
    idempotencyKey: requiredText(input.idempotencyKey, "Idempotency key", 180),
    binding,
    resultPackageId: result.id,
    resultPackageRevision: input.expectedResultRevision,
    resultPackageBinding: result.binding,
    identityReceiptId: identity.id,
    authorityReceiptId: authority.id,
    channel: authority.channel,
    lifecycleCommandId,
    outcome,
    reasonCode: requiredText(reasonCode, "Reason code", 120),
    reason: requiredText(reason, "Outcome reason", 500),
    lifecycleReceiptCommandId,
    auditSequence: state.nextAuditSequence,
    occurredAt,
    directDatabaseWrite: false,
  };
  const withReceipt = { ...state, commandConnectorReceipts: [...state.commandConnectorReceipts, receipt] };
  return appendConnectorAudit(
    withReceipt,
    context,
    occurredAt,
    outcome === "applied" ? "command_connector.command_applied" : "command_connector.outcome_recorded",
    "command_connector_receipt",
    receipt.id,
    outcome === "applied" ? `Governed connector command applied for ${result.workReference}` : `Governed connector outcome ${outcome} for ${result.workReference}`,
    {
      idempotencyKey: receipt.idempotencyKey,
      resultPackageId: result.id,
      outcome,
      reasonCode: receipt.reasonCode,
      lifecycleCommandId,
      directDatabaseWrite: "false",
    },
  );
}

export function recordConnectorIdentity(
  state: CastraState,
  input: ConnectorIdentityInput,
  context: CommandContext,
): CastraState {
  assertAuthSecretFree(input);
  if (context.commandAuthority !== "Commander") throw new Error("Recording connector identity authority requires Commander context.");
  const occurredAt = context.now();
  const validUntil = timestamp(input.validUntil, "Identity validity");
  if (Date.parse(validUntil) <= Date.parse(occurredAt)) throw new Error("Identity validity must extend beyond issuance.");
  const receipt: CommandConnectorIdentityReceipt = {
    id: context.id("command_connector_identity_receipt"),
    contractVersion: 1,
    identityReference: requiredText(input.identityReference, "Identity reference"),
    sessionReference: requiredText(input.sessionReference, "Session reference"),
    channel: input.channel,
    authority: input.authority,
    evidenceReference: requiredText(input.evidenceReference, "Identity evidence reference"),
    issuedAt: occurredAt,
    validUntil,
    revokedAt: null,
    secretMaterialStored: false,
  };
  return appendConnectorAudit(
    { ...state, commandConnectorIdentityReceipts: [...state.commandConnectorIdentityReceipts, receipt] },
    context,
    occurredAt,
    "command_connector.identity_recorded",
    "command_connector_identity_receipt",
    receipt.id,
    `Connector ${receipt.authority} identity receipt recorded`,
    { channel: receipt.channel, authority: receipt.authority, secretMaterialStored: "false" },
  );
}

export function submitConnectorResult(
  state: CastraState,
  input: ConnectorResultInput,
  context: CommandContext,
): CastraState {
  assertAuthSecretFree(input);
  const occurredAt = context.now();
  const identity = activeIdentity(state, input.identityReceiptId, occurredAt);
  const normalized = {
    submissionId: requiredText(input.submissionId, "Submission ID", 180),
    identityReceiptId: identity.id,
    workReference: requiredText(input.workReference, "Work reference", 180),
    agentIdentity: requiredText(input.agentIdentity, "Agent identity", 180),
    modelIdentity: requiredText(input.modelIdentity, "Model identity", 180),
    proposedStatus: requiredText(input.proposedStatus, "Proposed status", 120),
    evidenceReferences: boundedList(input.evidenceReferences, "Evidence references", true),
    tests: input.tests.map((test) => ({
      name: requiredText(test.name, "Test name", 180),
      outcome: test.outcome,
      evidenceReference: requiredText(test.evidenceReference, "Test evidence reference"),
    })),
    blockers: boundedList(input.blockers, "Blockers", false),
    effortCostProvenance: requiredText(input.effortCostProvenance, "Effort/cost provenance", 500),
    nextStepRecommendation: requiredText(input.nextStepRecommendation, "Next-step recommendation", 500),
  };
  if (normalized.tests.length > 50) throw new Error("No more than 50 test results are allowed.");
  const binding = connectorBinding(normalized);
  const existing = state.commandConnectorResultPackages.find((item) => item.submissionId === normalized.submissionId);
  if (existing) {
    if (existing.binding !== binding) throw new Error("Submission ID was already used for different result content.");
    return state;
  }
  const result: CommandConnectorResultPackage = {
    id: context.id("command_connector_result_package"),
    contractVersion: 1,
    ...normalized,
    binding,
    revision: 1,
    status: "received",
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
  return appendConnectorAudit(
    { ...state, commandConnectorResultPackages: [...state.commandConnectorResultPackages, result] },
    context,
    occurredAt,
    "command_connector.result_received",
    "command_connector_result_package",
    result.id,
    `Governed result received for ${result.workReference}`,
    { channel: identity.channel, proposedStatus: result.proposedStatus, directDatabaseWrite: "false" },
  );
}

export function recordConnectorOutcome(
  state: CastraState,
  input: ConnectorOutcomeInput,
  context: CommandContext,
): CastraState {
  assertAuthSecretFree(input);
  const occurredAt = context.now();
  const binding = connectorBinding(input);
  const replay = existingReceipt(state, requiredText(input.idempotencyKey, "Idempotency key", 180), binding);
  if (replay) return replay;
  const result = resultById(state, input.resultPackageId);
  assertResultBinding(result, input.expectedResultRevision, input.expectedResultBinding);
  if (result.status !== "received") throw new Error(`Result package is already ${result.status}.`);
  const identity = activeIdentity(state, result.identityReceiptId, occurredAt);
  const authority = commanderIdentity(state, input.authorityReceiptId, occurredAt);
  const updated: CommandConnectorResultPackage = { ...result, status: input.outcome, revision: result.revision + 1, updatedAt: occurredAt };
  return appendConnectorReceipt(
    replaceResult(state, updated),
    context,
    occurredAt,
    input,
    updated,
    identity,
    authority,
    input.outcome,
    input.reasonCode,
    input.reason,
    binding,
    "",
    null,
  );
}

export function processConnectorCommand(
  state: CastraState,
  input: ConnectorCommandInput,
  context: CommandContext,
): CastraState {
  assertAuthSecretFree(input);
  const occurredAt = context.now();
  const normalizedKey = requiredText(input.idempotencyKey, "Idempotency key", 180);
  const binding = connectorBinding(input);
  const replay = existingReceipt(state, normalizedKey, binding);
  if (replay) return replay;
  const result = resultById(state, input.resultPackageId);
  let identity: CommandConnectorIdentityReceipt;
  let authority: CommandConnectorIdentityReceipt;
  try {
    identity = activeIdentity(state, result.identityReceiptId, occurredAt);
    authority = commanderIdentity(state, input.authorityReceiptId, occurredAt);
    assertResultBinding(result, input.expectedResultRevision, input.expectedResultBinding);
    if (result.status !== "received") throw new Error(`Result package is already ${result.status}.`);
    if (input.lifecycleCommand.commandId !== normalizedKey) throw new Error("Lifecycle command ID must match the connector idempotency key.");
    const applied = applyCommand(state, input.lifecycleCommand, { ...context, commandAuthority: "Commander" });
    const lifecycleReceipt = applied.lifecycleCommandReceipts.find((receipt) => receipt.commandId === input.lifecycleCommand.commandId);
    if (!lifecycleReceipt) throw new Error("Lifecycle command did not produce its required receipt.");
    const appliedResult: CommandConnectorResultPackage = { ...result, status: "applied", revision: result.revision + 1, updatedAt: occurredAt };
    return appendConnectorReceipt(
      replaceResult(applied, appliedResult),
      context,
      occurredAt,
      input,
      appliedResult,
      identity,
      authority,
      "applied",
      "APPLIED",
      "Exact result, identity, authority, revision, evidence, and idempotency binding validated.",
      binding,
      input.lifecycleCommand.commandId,
      lifecycleReceipt.commandId,
    );
  } catch (error) {
    const resultIdentityFallback = state.commandConnectorIdentityReceipts.find((receipt) => receipt.id === result.identityReceiptId);
    const fallback = state.commandConnectorIdentityReceipts.find((receipt) => receipt.id === input.authorityReceiptId);
    if (!fallback || !resultIdentityFallback) throw error;
    identity = resultIdentityFallback;
    authority = fallback;
    const rejectedResult: CommandConnectorResultPackage = { ...result, status: "rejected", revision: result.revision + 1, updatedAt: occurredAt };
    return appendConnectorReceipt(
      replaceResult(state, rejectedResult),
      context,
      occurredAt,
      input,
      rejectedResult,
      identity,
      authority,
      "rejected",
      "COMMAND_REJECTED",
      error instanceof Error ? error.message : "Connector command was rejected.",
      binding,
      input.lifecycleCommand.commandId,
      null,
    );
  }
}
