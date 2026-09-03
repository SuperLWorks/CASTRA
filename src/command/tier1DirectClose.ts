import { applyCommand } from "../domain/commands";
import { shortId } from "../domain/ids";
import { normalizeActionOperationalContext } from "../domain/openWork";
import type { Action, CastraState, CommandContext } from "../domain/types";

export const TIER1_DIRECT_CLOSE_RISK = "C001.M013.A080-T1DC-W001";
export const TIER1_DIRECT_CLOSE_REASON =
  `Tier 1 direct Commander closure from the Action item; the displayed evidence package was accepted. Residual risk ${TIER1_DIRECT_CLOSE_RISK}.`;

export interface Tier1DirectCloseReview {
  visible: boolean;
  eligible: boolean;
  issues: string[];
  actionId: string;
  expectedRevision: number;
  resultingRevision: number;
  evidenceReferences: string[];
  buttonLabel: string;
  target: string;
  effect: string;
  rollback: string;
  alternatives: string[];
  residualRisk: string;
}
function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function auditEvidence(state: CastraState, actionId: string): string[] {
  return state.auditEvents
    .filter((event) => event.entityType === "action" && event.entityId === actionId && event.kind === "decision_inbox.approved")
    .flatMap((event) => (event.detail.evidence ?? "").split(" | "));
}

export function tier1DirectCloseReview(state: CastraState, action: Action): Tier1DirectCloseReview {
  const context = normalizeActionOperationalContext(action.operationalContext);
  const evidenceReferences = unique([
    context.evidenceReference,
    ...(context.evidenceReferences ?? []),
    ...auditEvidence(state, action.id),
  ]);
  const issues: string[] = [];

  if (action.archivedAt) issues.push("Restore the Action before closure.");
  if (action.actionKind !== "standard") issues.push("Deployment Actions use the extended governed closure path.");
  if (action.status !== "in_progress") issues.push("The Action must be In Progress.");
  if (context.attentionState !== "commander_review") issues.push("The Action is not marked Ready for Commander Review.");
  if (context.blocker) issues.push(`Resolve the recorded blocker: ${context.blocker}`);
  if (action.approval && action.approval.revision !== action.revision) issues.push("The existing approval is stale for the current Action revision.");
  if (evidenceReferences.length === 0) issues.push("Bind at least one Action evidence reference.");
  if (evidenceReferences.length > 20) issues.push("The evidence package exceeds the 20-reference lifecycle limit.");
  if (evidenceReferences.some((reference) => reference.length > 240)) issues.push("An evidence reference exceeds the 240-character lifecycle limit.");

  const code = shortId(action.id);
  return {
    visible: !action.archivedAt
      && action.actionKind === "standard"
      && ["in_progress", "blocked"].includes(action.status)
      && context.attentionState === "commander_review",
    eligible: issues.length === 0,
    issues,
    actionId: action.id,
    expectedRevision: action.revision,
    resultingRevision: action.revision + 1,
    evidenceReferences,
    buttonLabel: action.approval?.revision === action.revision ? `Close ${code}` : `Approve & Close ${code}`,
    target: `${action.id} at Action revision ${action.revision}`,
    effect: `Record Commander approval on revision ${action.revision + 1}, mark the Action Completed, bind the displayed evidence, append the lifecycle/audit receipt, and refresh Open Work.`,
    rollback: "Before closure, leave the Action open. After closure, use the governed exact-revision reopen command with reason and evidence; a deployment rollback does not reverse authoritative state.",
    alternatives: ["Leave the Action open", "Use the extended Governed Closure workspace"],
    residualRisk: `A valid sole-Commander browser session can accept the displayed evidence and close this eligible Tier 1 Action in one act (${TIER1_DIRECT_CLOSE_RISK}).`,
  };
}

export function applyTier1DirectClose(
  state: CastraState,
  input: {
    actionId: string;
    expectedRevision: number;
    expectedEvidenceReferences: string[];
    commandId: string;
  },
  context: CommandContext,
): CastraState {
  if (context.commandAuthority !== "Commander") {
    throw new Error("Tier 1 direct closure requires the authenticated Commander command context.");
  }
  const action = state.actions.find((item) => item.id === input.actionId);
  if (!action) throw new Error("The Action is no longer present in authoritative state.");
  const review = tier1DirectCloseReview(state, action);
  if (!review.eligible) throw new Error(`Tier 1 direct closure is unavailable: ${review.issues.join(" ")}`);
  if (review.expectedRevision !== input.expectedRevision) {
    throw new Error(`The Action changed after review: expected revision ${input.expectedRevision}, current ${review.expectedRevision}.`);
  }
  if (JSON.stringify(review.evidenceReferences) !== JSON.stringify(input.expectedEvidenceReferences)) {
    throw new Error("The Action evidence package changed after review.");
  }

  return applyCommand(state, {
    type: "action.close",
    commandId: input.commandId,
    actionId: action.id,
    expectedRevision: action.revision,
    reason: TIER1_DIRECT_CLOSE_REASON,
    evidenceReferences: review.evidenceReferences,
  }, context);
}
