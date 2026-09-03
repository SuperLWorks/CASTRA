import {
  processConnectorCommand,
  recordConnectorIdentity,
  recordConnectorOutcome,
  submitConnectorResult,
  type ConnectorCommandInput,
  type ConnectorIdentityInput,
  type ConnectorOutcomeInput,
  type ConnectorResultInput,
} from "../domain/commandConnector";
import type {
  Action,
  CastraState,
  CommandConnectorIdentityReceipt,
  CommandConnectorOutcome,
  CommandConnectorResultPackage,
  CommandContext,
} from "../domain/types";

// The governed closure affordance is a `ui` channel connector client. It is the
// Commander's own authenticated browser session, never an agent surface: agents
// reach CASTRA only through the read-only, cookie-ignoring /api/agent-state
// boundary and hold no write path to this module at all.
export const GOVERNED_CLOSURE_CHANNEL = "ui" as const;

// A005 outcomes that are recorded directly rather than produced by applying a
// lifecycle command. `applied` and `rejected` are outcomes of the command step
// itself and are deliberately absent here.
export const NON_APPLIED_CONNECTOR_OUTCOMES = [
  "offline",
  "expired",
  "cancelled",
  "failed",
  "unknown",
] as const satisfies readonly Exclude<CommandConnectorOutcome, "applied" | "rejected">[];

export type NonAppliedConnectorOutcome = (typeof NON_APPLIED_CONNECTOR_OUTCOMES)[number];

/**
 * The four A005 connector entry points expressed as one request union.
 *
 * The connector entry points are `(state, input, context)` functions rather than
 * members of the `CastraCommand` union, so the ordinary `execute(commands)`
 * dispatcher cannot reach them. This union is the dispatch shape the workspace
 * uses instead; `src/App.tsx` supplies the Commander command context.
 */
export type GovernedClosureRequest =
  | { step: "identity"; input: ConnectorIdentityInput }
  | { step: "result"; input: ConnectorResultInput }
  | { step: "command"; input: ConnectorCommandInput }
  | { step: "outcome"; input: ConnectorOutcomeInput };

/**
 * Route one governed closure step to its connector entry point.
 *
 * Fails closed on a non-Commander context. `recordConnectorIdentity` already
 * enforces this for step 1, but the other three steps do not, and this
 * dispatcher must never be usable from a weaker context than the one the
 * authenticated Commander session supplies. The check is a boundary assertion,
 * not a substitute for the connector's own identity, authority, revision,
 * binding, evidence, and idempotency validation.
 */
export function applyGovernedClosureStep(
  state: CastraState,
  request: GovernedClosureRequest,
  context: CommandContext,
): CastraState {
  if (context.commandAuthority !== "Commander") {
    throw new Error("Governed closure requires the authenticated Commander command context.");
  }
  switch (request.step) {
    case "identity":
      return recordConnectorIdentity(state, request.input, context);
    case "result":
      return submitConnectorResult(state, request.input, context);
    case "command":
      return processConnectorCommand(state, request.input, context);
    case "outcome":
      return recordConnectorOutcome(state, request.input, context);
  }
}

export interface ActionCloseRequestDraft {
  commandId: string;
  resultPackageId: string;
  expectedResultRevision: number;
  expectedResultBinding: string;
  authorityReceiptId: string;
  actionId: string;
  expectedRevision: number;
  reason: string;
  evidenceReferences: string[];
}

/**
 * Build the `action.close` connector command from one command identifier.
 *
 * A004 and A005 both require the lifecycle command ID to equal the connector
 * idempotency key, and `processConnectorCommand` rejects the command when they
 * differ. Deriving both from a single field makes divergence unrepresentable in
 * this affordance rather than merely validated after the fact.
 */
export function buildActionCloseRequest(draft: ActionCloseRequestDraft): GovernedClosureRequest {
  const commandId = draft.commandId.trim();
  return {
    step: "command",
    input: {
      idempotencyKey: commandId,
      resultPackageId: draft.resultPackageId,
      expectedResultRevision: draft.expectedResultRevision,
      expectedResultBinding: draft.expectedResultBinding,
      authorityReceiptId: draft.authorityReceiptId,
      lifecycleCommand: {
        type: "action.close",
        commandId,
        actionId: draft.actionId,
        expectedRevision: draft.expectedRevision,
        reason: draft.reason,
        evidenceReferences: draft.evidenceReferences,
      },
    },
  };
}

export interface NonAppliedOutcomeDraft {
  idempotencyKey: string;
  resultPackageId: string;
  expectedResultRevision: number;
  expectedResultBinding: string;
  authorityReceiptId: string;
  outcome: NonAppliedConnectorOutcome;
  reasonCode: string;
  reason: string;
}

export function buildNonAppliedOutcomeRequest(draft: NonAppliedOutcomeDraft): GovernedClosureRequest {
  return {
    step: "outcome",
    input: {
      idempotencyKey: draft.idempotencyKey.trim(),
      resultPackageId: draft.resultPackageId,
      expectedResultRevision: draft.expectedResultRevision,
      expectedResultBinding: draft.expectedResultBinding,
      authorityReceiptId: draft.authorityReceiptId,
      outcome: draft.outcome,
      reasonCode: draft.reasonCode,
      reason: draft.reason,
    },
  };
}

export type IdentityReceiptState = "active" | "expired" | "revoked";

export function identityReceiptState(
  receipt: CommandConnectorIdentityReceipt,
  now: string,
): IdentityReceiptState {
  if (receipt.revokedAt) return "revoked";
  return Date.parse(receipt.validUntil) > Date.parse(now) ? "active" : "expired";
}

export function activeIdentityReceipts(
  state: CastraState,
  now: string,
): CommandConnectorIdentityReceipt[] {
  return state.commandConnectorIdentityReceipts.filter(
    (receipt) => identityReceiptState(receipt, now) === "active",
  );
}

/**
 * Default bounded validity for a newly recorded identity/authority receipt.
 * A005 requires bounded validity; eight hours is one working session and the
 * Commander can shorten it before recording.
 */
export const DEFAULT_IDENTITY_VALIDITY_HOURS = 8;

export function defaultIdentityValidUntil(now: string, hours = DEFAULT_IDENTITY_VALIDITY_HOURS): string {
  return new Date(Date.parse(now) + hours * 3_600_000).toISOString();
}

/**
 * Actions the governed `action.close` command will accept: unarchived, and
 * currently In progress or Blocked. Deployment-kind Actions are still subject to
 * the Campaign deployment gate, which is deliberately left to the domain so the
 * refusal reaches the Commander as the connector's own rejection reason instead
 * of being pre-filtered out of the picker without explanation.
 */
export function closureEligibleActions(state: CastraState): Action[] {
  return state.actions.filter(
    (action) => !action.archivedAt && (action.status === "in_progress" || action.status === "blocked"),
  );
}

/** Result packages still awaiting a Commander decision. */
export function reviewableResultPackages(state: CastraState): CommandConnectorResultPackage[] {
  return state.commandConnectorResultPackages.filter((item) => item.status === "received");
}

/**
 * Evidence references already recorded in authoritative state, offered as the
 * picker source. Derived from state only: this affordance has no filesystem,
 * network, or repository path.
 */
export function evidenceReferenceSuggestions(state: CastraState): string[] {
  const references = new Set<string>();
  const add = (value: string | undefined | null): void => {
    const normalized = value?.trim();
    if (normalized) references.add(normalized);
  };
  for (const action of state.actions) add(action.operationalContext?.evidenceReference);
  for (const receipt of state.commandConnectorIdentityReceipts) add(receipt.evidenceReference);
  for (const item of state.commandConnectorResultPackages) {
    for (const reference of item.evidenceReferences) add(reference);
    for (const test of item.tests) add(test.evidenceReference);
  }
  for (const receipt of state.lifecycleCommandReceipts) {
    for (const reference of receipt.evidenceReferences) add(reference);
  }
  return [...references].sort((left, right) => left.localeCompare(right));
}

export type GovernedClosureOutcomeTone = "applied" | "rejected" | "unknown" | "non_applied";

export function connectorOutcomeTone(outcome: CommandConnectorOutcome): GovernedClosureOutcomeTone {
  if (outcome === "applied") return "applied";
  if (outcome === "rejected") return "rejected";
  if (outcome === "unknown") return "unknown";
  return "non_applied";
}

/**
 * What the Commander actually reviewed: the exact result package revision and
 * binding at review time, captured separately from the live record so a later
 * change is detectable rather than silently absorbed into the command.
 */
export interface ResultReviewConfirmation {
  resultPackageId: string;
  revision: number;
  binding: string;
  confirmedAt: string;
}

export function confirmResultReview(
  result: CommandConnectorResultPackage,
  confirmedAt: string,
): ResultReviewConfirmation {
  return {
    resultPackageId: result.id,
    revision: result.revision,
    binding: result.binding,
    confirmedAt,
  };
}

/**
 * Describe any drift between the reviewed revision/binding and the current
 * record. A non-null result means the command would be applied against content
 * the Commander did not review; the connector rejects it, and the workspace
 * warns before that happens.
 */
export function resultReviewDrift(
  confirmation: ResultReviewConfirmation,
  result: CommandConnectorResultPackage | null,
): string | null {
  if (!result) return "The reviewed result package is no longer present in state.";
  if (result.id !== confirmation.resultPackageId) return "The reviewed result package is no longer the selected package.";
  if (result.revision !== confirmation.revision) {
    return `Reviewed revision ${confirmation.revision}; the record is now revision ${result.revision}.`;
  }
  if (result.binding !== confirmation.binding) return "The result binding changed after review.";
  return null;
}
