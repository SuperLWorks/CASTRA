export const CLOSED_RECORD_RETRIEVAL_TRIGGERS = [
  "direct_dependency",
  "zero_value_acceptance_test",
  "release_acceptance",
  "incident",
  "audit",
  "migration",
  "recovery",
  "suspected_inconsistency",
  "material_change",
  "commander_request",
] as const;

export type ClosedRecordRetrievalTrigger = (typeof CLOSED_RECORD_RETRIEVAL_TRIGGERS)[number];

export interface ClosedRecordRetrievalSummary {
  recordId: string;
  status: "Done";
  closureReceiptReference: string;
  retrievalTriggers: ClosedRecordRetrievalTrigger[];
  reopenState: "closed_requires_commander_command";
}

export interface ClosedRecordRetrievalRequest {
  attemptId: string;
  requestedAt: string;
  requestedBy: string;
  requesterRole: string;
  trigger: string;
  authorityReference: string;
  targetRecordId: string;
}

export interface ClosedRecordRetrievalReceipt {
  schemaVersion: "castra-closed-record-retrieval-receipt/1.0.0";
  attemptId: string;
  requestedAt: string;
  requestedBy: string;
  requesterRole: string;
  trigger: string;
  authorityReference: string;
  targetRecordId: string;
  outcome: "retrieved" | "denied";
  reasonCode: "RETRIEVAL_AUTHORIZED" | "INVALID_TRIGGER" | "TARGET_MISMATCH" | "TRIGGER_NOT_PERMITTED" | "AUTHORITY_REQUIRED" | "COMMANDER_REQUIRED";
  closedRecordStateBefore: "Done";
  closedRecordStateAfter: "Done";
  reopened: false;
  openWorkIndexMutation: false;
  auditRequired: true;
}

export type ClosedRecordRetrievalResult<T> =
  | { receipt: ClosedRecordRetrievalReceipt & { outcome: "retrieved" }; body: T }
  | { receipt: ClosedRecordRetrievalReceipt & { outcome: "denied" }; body: null };

function receipt(
  summary: ClosedRecordRetrievalSummary,
  request: ClosedRecordRetrievalRequest,
  outcome: ClosedRecordRetrievalReceipt["outcome"],
  reasonCode: ClosedRecordRetrievalReceipt["reasonCode"],
): ClosedRecordRetrievalReceipt {
  return Object.freeze({
    schemaVersion: "castra-closed-record-retrieval-receipt/1.0.0",
    attemptId: request.attemptId,
    requestedAt: request.requestedAt,
    requestedBy: request.requestedBy,
    requesterRole: request.requesterRole,
    trigger: request.trigger,
    authorityReference: request.authorityReference,
    targetRecordId: request.targetRecordId,
    outcome,
    reasonCode,
    closedRecordStateBefore: summary.status,
    closedRecordStateAfter: summary.status,
    reopened: false,
    openWorkIndexMutation: false,
    auditRequired: true,
  });
}

function isRetrievalTrigger(value: string): value is ClosedRecordRetrievalTrigger {
  return CLOSED_RECORD_RETRIEVAL_TRIGGERS.some((trigger) => trigger === value);
}

export function retrieveClosedRecord<T>(
  summary: ClosedRecordRetrievalSummary,
  request: ClosedRecordRetrievalRequest,
  loadBody: () => T,
): ClosedRecordRetrievalResult<T> {
  if (!isRetrievalTrigger(request.trigger)) {
    return { receipt: receipt(summary, request, "denied", "INVALID_TRIGGER") as ClosedRecordRetrievalReceipt & { outcome: "denied" }, body: null };
  }
  if (request.targetRecordId !== summary.recordId) {
    return { receipt: receipt(summary, request, "denied", "TARGET_MISMATCH") as ClosedRecordRetrievalReceipt & { outcome: "denied" }, body: null };
  }
  if (!summary.retrievalTriggers.includes(request.trigger)) {
    return { receipt: receipt(summary, request, "denied", "TRIGGER_NOT_PERMITTED") as ClosedRecordRetrievalReceipt & { outcome: "denied" }, body: null };
  }
  if (!request.authorityReference.trim()) {
    return { receipt: receipt(summary, request, "denied", "AUTHORITY_REQUIRED") as ClosedRecordRetrievalReceipt & { outcome: "denied" }, body: null };
  }
  if (request.trigger === "commander_request" && request.requesterRole !== "Commander") {
    return { receipt: receipt(summary, request, "denied", "COMMANDER_REQUIRED") as ClosedRecordRetrievalReceipt & { outcome: "denied" }, body: null };
  }

  const body = loadBody();
  return {
    receipt: receipt(summary, request, "retrieved", "RETRIEVAL_AUTHORIZED") as ClosedRecordRetrievalReceipt & { outcome: "retrieved" },
    body,
  };
}
