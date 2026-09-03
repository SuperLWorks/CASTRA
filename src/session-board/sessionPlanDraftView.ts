/**
 * C001.M017.A001 — pure, dependency-free view model for the visible Session
 * Work Plan draft surface (`SessionPlanDraftSurface`).
 *
 * This module never calls `reviewPlanDraft`, `buildPlanTargetIndex`,
 * `summarizeReview`, or any other WebMCP adapter logic, and it never
 * recomputes, reorders, filters out, rescores, or truncates a review finding.
 * It only groups and labels findings that were already computed elsewhere
 * (by the exact same canonical `src/webmcp/proposals.ts` functions the
 * `review_plan` tool itself uses), in the exact order they were emitted.
 *
 * It performs no I/O, holds no state, and imports no runtime value from
 * `src/webmcp/`, `src/domain/`, React, or any network/repository/persistence
 * module — only structural WebMCP protocol types, for compile-time checking.
 */
import type {
  WebMcpClientDraft,
  WebMcpExperienceMode,
  WebMcpPlanDraft,
  WebMcpPlanDraftCard,
  WebMcpPlanTargetKind,
  WebMcpReviewCheck,
  WebMcpReviewCounts,
  WebMcpReviewDimension,
  WebMcpReviewResult,
} from "../webmcp/contracts";

/**
 * Keep the reversible page draft scoped to one exact WebMCP experience.
 *
 * The registration adapter correctly refuses a draft whose recorded mode no
 * longer matches the active mode. Clearing at the App boundary on a real mode
 * transition prevents that fail-closed refusal from stranding an invisible
 * draft in the newly active experience. A render within the same mode keeps
 * the current draft and its stable registration boundary unchanged.
 */
export function draftAfterExperienceTransition(
  draft: WebMcpClientDraft | null,
  previousMode: WebMcpExperienceMode | null,
  nextMode: WebMcpExperienceMode | null,
): WebMcpClientDraft | null {
  return previousMode === nextMode ? draft : null;
}

/** Bound alongside `readyForCommanderSelection` wherever it is rendered. */
export const SESSION_PLAN_DRAFT_READINESS_CAPTION =
  "Ready for Commander selection means no blocking finding remains in this draft. It is not an approval and not an acceptance.";

export const SESSION_PLAN_DRAFT_EMPTY_MESSAGE =
  "No Session Work Plan draft exists in this page yet. A WebMCP-capable agent can draft one with draft_session_plan; nothing is inferred from CASTRA state.";

export const SESSION_PLAN_DRAFT_UNAVAILABLE_REVIEW_MODE =
  "Review Mode is read-only, so the Session Work Plan draft surface is not bound here.";

export const SESSION_PLAN_DRAFT_UNAVAILABLE_DEFAULT =
  "The Session Work Plan draft surface is bound only in the authenticated live and Public Demo experiences.";

export const PLAN_TARGET_KIND_LABELS: Readonly<Record<WebMcpPlanTargetKind, string>> = {
  new_mission: "New Mission",
  new_action: "New Action",
  existing_mission: "Existing Mission",
  existing_action: "Existing Action",
};

export const REVIEW_RESULT_LABELS: Readonly<Record<WebMcpReviewResult, string>> = {
  pass: "Pass",
  attention: "Attention",
  blocking: "Blocking",
};

export const REVIEW_DIMENSION_LABELS: Readonly<Record<WebMcpReviewDimension, string>> = {
  scope: "Scope",
  parent_target: "Parent / Target",
  dependencies_sequence: "Dependencies & Sequence",
  acceptance_criteria: "Acceptance Criteria",
  verification_evidence: "Verification & Evidence",
  exclusions: "Exclusions",
  stop_conditions: "Stop Conditions",
  protected_gates: "Protected Gates",
};

export function planTargetKindLabel(kind: WebMcpPlanTargetKind): string {
  return PLAN_TARGET_KIND_LABELS[kind];
}

export function reviewResultLabel(result: WebMcpReviewResult): string {
  return REVIEW_RESULT_LABELS[result];
}

export function reviewDimensionLabel(dimension: WebMcpReviewDimension): string {
  return REVIEW_DIMENSION_LABELS[dimension];
}

/**
 * The already-computed overall review, as `App.tsx` binds it from
 * `reviewPlanDraft`/`summarizeReview` (`src/webmcp/proposals.ts`) against the
 * exact snapshot the active experience displays. This module only groups and
 * labels the `checks` it is given; it never derives `counts` or
 * `readyForCommanderSelection` itself.
 */
export interface SessionPlanDraftReviewSummary {
  readonly reviewedRevision: number;
  readonly checks: readonly WebMcpReviewCheck[];
  readonly counts: WebMcpReviewCounts;
  readonly readyForCommanderSelection: boolean;
}

export interface SessionPlanDraftCardGroup {
  readonly proposalId: string;
  readonly card: WebMcpPlanDraftCard;
  readonly targetKindLabel: string;
  readonly checks: readonly WebMcpReviewCheck[];
  readonly counts: WebMcpReviewCounts;
}

export interface SessionPlanDraftReviewGrouping {
  readonly planLevelChecks: readonly WebMcpReviewCheck[];
  readonly cardGroups: readonly SessionPlanDraftCardGroup[];
}

function countResults(checks: readonly WebMcpReviewCheck[]): WebMcpReviewCounts {
  let pass = 0;
  let attention = 0;
  let blocking = 0;
  for (const entry of checks) {
    if (entry.result === "pass") pass += 1;
    else if (entry.result === "attention") attention += 1;
    else blocking += 1;
  }
  return { pass, attention, blocking };
}

/**
 * Partition one already-emitted `checks` array by `proposalId`, preserving
 * the exact order each check was emitted in.
 *
 * Every check ends up in exactly one group — the plan-level group
 * (`proposalId === null`) or the one card group whose `proposalId` matches —
 * so nothing is dropped from the overall result. `result` and `detail` are
 * carried through unchanged from the exact `checks` this function was given,
 * and card groups are returned in `plan.cards` order, the same order
 * `reviewPlanDraft` itself emits them in.
 */
export function groupPlanReviewChecks(
  plan: WebMcpPlanDraft,
  checks: readonly WebMcpReviewCheck[],
): SessionPlanDraftReviewGrouping {
  const planLevelChecks = checks.filter((entry) => entry.proposalId === null);
  const cardGroups = plan.cards.map((card) => {
    const cardChecks = checks.filter((entry) => entry.proposalId === card.proposalId);
    return {
      proposalId: card.proposalId,
      card,
      targetKindLabel: planTargetKindLabel(card.targetKind),
      checks: cardChecks,
      counts: countResults(cardChecks),
    };
  });
  return { planLevelChecks, cardGroups };
}

export function formatReviewCounts(counts: WebMcpReviewCounts): string {
  return `${counts.pass} pass · ${counts.attention} attention · ${counts.blocking} blocking`;
}

export function readinessLabel(readyForCommanderSelection: boolean): string {
  return readyForCommanderSelection ? "Ready for Commander selection" : "Not ready for Commander selection";
}
