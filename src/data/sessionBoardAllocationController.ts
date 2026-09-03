import { shortId } from "../domain/ids";
import { canonicalHostedJson, hostedSha256 } from "../domain/hostedOperationalStateDigest";
import {
  looksLikeGovernedCodeToken,
  readActionPredecessorIds,
  resolveStableCode,
  stableCodeTitleSeparator,
  validSessionWorkPlanAllocationIdempotencyKey,
  type SessionWorkPlanAllocatedRecord,
  type SessionWorkPlanAllocationReceipt,
  type SessionWorkPlanAllocationRequest,
  type SessionWorkPlanBinding,
  type SessionWorkPlanDecisionBinding,
  type SessionWorkPlanExecutionEnvelope,
  type SessionWorkPlanPredecessorBinding,
  type SessionWorkPlanProposal,
  type SessionWorkPlanProposalTarget,
  type SessionWorkPlanSelection,
} from "../domain/sessionWorkPlanAllocation";
import type { Action, CastraState, Mission } from "../domain/types";
import {
  MemoryRetainedSessionWorkPlanAllocationStore,
  SessionWorkPlanAllocationClient,
  SessionWorkPlanAllocationUnknownOutcomeError,
  type RetainedSessionWorkPlanAllocationStore,
  type SessionWorkPlanAllocationDispatchResult,
  type SessionWorkPlanAllocationTransport,
} from "./sessionWorkPlanAllocation";

/**
 * ACT-c417cbd5 / P04 — the authenticated controller path between the accepted
 * Session Board selection and `SessionWorkPlanAllocationClient`.
 *
 * Fresh integrated FIREWATCH recorded FW-P04-INTEGRATED-LIVE-ALLOCATION-WIRING-001:
 * the authority engine and its browser client existed, but no product path
 * reached them, so the Commander's selection could not become one governed
 * transaction. This module is that missing path and nothing else.
 *
 * What it deliberately does not do:
 *
 *  - it allocates nothing and numbers nothing. Every stable code, ordinal, and
 *    Git name is server-derived and arrives only inside a verified receipt;
 *  - it never reads a proposal, revision, title, or parent out of repository
 *    text. The only repository-resident constants are the exact opaque record
 *    identities and plan/envelope bindings recorded in the immutable P04
 *    allocation-link and Commander-selection receipts, and each one must still
 *    be found in loaded authoritative state before it is usable;
 *  - it never substitutes the synthetic Session Board fixture in authenticated
 *    mode, and it is never reachable from Public Demo or UI Review;
 *  - it never generates a retry or a replacement idempotency identity. Every
 *    uncertainty — transport, envelope, receipt, or post-write reconciliation —
 *    retains the exact original command and offers only exact reconciliation.
 */

/* -------------------------------------------------------------------------- */
/* Structural mirror of the accepted Session Board presentation contract       */
/* -------------------------------------------------------------------------- */

/**
 * These view shapes deliberately do not import `src/session-board/*`.
 *
 * `verification/module-registry.v1.json` records `session-board-ui` as a module
 * consumed by `application-shell`; importing it from `src/data/**` would invert
 * that declared direction, and the registry is outside this correction's write
 * allowlist. `src/App.tsx` is already a declared consumer of both modules, so
 * the structural join happens exactly where the registry says it should.
 *
 * Every field name and type below matches `SessionBoardScenarioFixture` and
 * `SessionBoardOutcome` exactly, and each string-literal union here is a subset
 * of the corresponding published union. A divergence therefore fails at the
 * `src/App.tsx` call site as a compile error rather than silently at runtime.
 */
export interface SessionBoardGateView {
  title: string;
  source: string;
  unmetCondition?: string;
}

export interface SessionBoardProposalView {
  proposalId: string;
  proposalLabel: string;
  humanIdentity: string;
  machineIdentity: string;
  shortMachineIdentity: string;
  fullMachineIdentity: string;
  branchHint: string;
  worktreeHint: string;
  state: "pending";
  outcome: string;
  dependencies: string[];
  expectedTimeMinutes: number;
  marginalCostUsd: number;
  risk: string;
  acceptanceCriteria: string[];
  protectedGates: SessionBoardGateView[];
  lifecycleState: string;
  protectedNextGate: string;
}

export interface SessionBoardOutcomeView {
  receiptIdentity: string;
  fullOpaqueIdentity: string;
  machineOpaqueIdentity: string;
  receiptBranch: string;
  receiptWorktree: string;
  progress: string[];
  verification: string[];
  blockers: string[];
  freshness: string;
  nextGate: string;
}

export interface SessionBoardFixtureView {
  scenario: "normal";
  heading: string;
  boundaryNotice: string;
  proposals: SessionBoardProposalView[];
  defaultSelectedIds: string[];
  hasUnknownOutcome: boolean;
  unknownOutcomeGuidance: string;
  allowAuthorizedRetry: boolean;
}

/**
 * Duplicated rather than imported, for the module-direction reason above. The
 * value is the published `SESSION_BOARD_PENDING_HUMAN_IDENTITY`; it is the
 * honest display for a record whose stable code is genuinely unallocated, and
 * it is never used to repair or invent one.
 */
const PENDING_HUMAN_IDENTITY = "Pending authoritative allocation";

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

/* -------------------------------------------------------------------------- */
/* Generic immutable Commander plan input                                      */
/* -------------------------------------------------------------------------- */

/**
 * ACT-a5ae5f26 / P04-FU01 — the plan the board executes is now an input, not a
 * constant.
 *
 * RECON finding M016-BOOTSTRAP-002: the backend allocation contract already
 * accepted arbitrary `new_mission`, `new_action`, and existing-record proposals,
 * but the deployed controller was hard-wired to the two P04 proposals, so no
 * other Commander selection could reach it. The fix is to hand the controller a
 * validated, immutable plan and keep every existing control unchanged.
 *
 * What a plan deliberately cannot express:
 *
 *  - a stable code, an ordinal, or any numbering. Titles carrying a code-shaped
 *    token are refused by the same rule the server enforces, and no field can
 *    hold a proposed identifier;
 *  - a record revision. `expectedRecordRevision` is resolved from the loaded
 *    authoritative read at binding time, never supplied by the caller;
 *  - a parent per proposal. Parentage comes from the plan header, so a proposal
 *    cannot bind to a Mission or Campaign the Commander did not review.
 */
export type SessionBoardPlanTarget =
  | { kind: "existing_mission"; missionId: string }
  | { kind: "existing_action"; actionId: string }
  | { kind: "new_mission"; title: string; description: string }
  | {
    kind: "new_action";
    title: string;
    description: string;
    actionKind: "standard" | "deployment";
    /**
     * Existing Action record ids this new Action depends on. Cross-Mission is
     * permitted inside the plan's Campaign; the server is still the authority
     * and re-checks every reference before mutating anything.
     */
    predecessorActionIds: readonly string[];
  };

export interface SessionBoardPlanProposal {
  proposalId: string;
  proposalLabel: string;
  /**
   * The treatment the plan itself carries. A Commander selection may promote a
   * `selected` or `deferred` proposal, and may leave any proposal unselected;
   * a `rejected` proposal stays rejected and can never be authorized from the
   * board, because rejecting it was already a decision.
   */
  treatment: "selected" | "deferred" | "rejected";
  target: SessionBoardPlanTarget;
  outcome: string;
  dependencies: readonly string[];
  expectedTimeMinutes: number;
  marginalCostUsd: number;
  risk: string;
  acceptanceCriteria: readonly string[];
  protectedGates: readonly SessionBoardGateView[];
  protectedNextGate: string;
}

export interface SessionBoardPlan {
  planId: string;
  planRevision: number;
  /**
   * `sha256:<64 hex>` of this plan's own canonical content, as produced by
   * `sessionBoardPlanContentDigest`.
   *
   * ACT-a5ae5f26 / P04-FU01 rework FW-P04-FU01-001: this used to be the digest
   * of the reviewed plan *file*, which nothing could recompute at runtime, so
   * only its syntax was ever checked and the dispatched proposal content was
   * never actually bound to the reviewed plan. It now has exactly one meaning —
   * the recomputable digest of the reviewed plan content — and
   * `verifySessionBoardPlanContent` fails closed before dispatch unless the
   * recomputation matches it exactly. The reviewed source document is still
   * recorded, as provenance, by `SESSION_BOARD_PLAN_DOCUMENT_DIGEST`.
   */
  planDigest: string;
  /** The Commander decision/selection record that bounds this execution. */
  envelopeId: string;
  /**
   * The target Campaign, or `null` to resolve it from the bound Mission's
   * parent in authoritative state. `null` is not a wildcard: it is only usable
   * when a Mission is bound, and the resolved Campaign is then recorded in the
   * binding exactly as authoritative state reports it.
   */
  campaignId: string | null;
  /** The target Mission, or `null` for a Campaign-scoped plan. */
  missionId: string | null;
  decisionIdPrefix: string;
  decisionExpiresAt: string | null;
  /**
   * The authoritative baseline the Commander reviewed. When either is present
   * it must equal the loaded baseline at authorization time or the command is
   * refused; when both are `null` the loaded baseline is used as before.
   */
  expectedRevision: number | null;
  expectedStateDigest: string | null;
  /**
   * A caller-bound idempotency identity, or `null` to let the transport mint
   * one. A supplied identity is never regenerated and never replaced.
   */
  idempotencyKey: string | null;
  heading: string;
  proposals: readonly SessionBoardPlanProposal[];
}

export type SessionBoardPlanReasonCode =
  | "PLAN_SHAPE_INVALID"
  | "PLAN_DIGEST_INVALID"
  | "PLAN_EMPTY"
  | "PLAN_DUPLICATE_PROPOSAL_ID"
  | "PLAN_INVALID_TREATMENT"
  | "PLAN_UNSUPPORTED_PROPOSAL_KIND"
  | "PLAN_PARENT_MISSION_REQUIRED"
  | "PLAN_PARENT_CAMPAIGN_REQUIRED"
  | "PLAN_SUPPLIED_IDENTIFIER_REJECTED"
  | "PLAN_INVALID_TITLE"
  | "PLAN_DUPLICATE_PREDECESSOR"
  | "PLAN_EXPIRY_INVALID"
  | "PLAN_BASELINE_INVALID"
  | "PLAN_IDEMPOTENCY_IDENTITY_INVALID";

export type SessionBoardPlanValidation =
  | { status: "valid" }
  | { status: "invalid"; reasonCode: SessionBoardPlanReasonCode; message: string };

const PLAN_MAXIMUM_PROPOSALS = 200;
const PLAN_MAXIMUM_TITLE_LENGTH = 200;
const PLAN_MAXIMUM_DESCRIPTION_LENGTH = 2000;
const PLAN_MAXIMUM_PREDECESSORS = 50;
const SUPPORTED_PLAN_TARGET_KINDS = ["existing_mission", "existing_action", "new_mission", "new_action"] as const;
const PLAN_TREATMENTS = ["selected", "deferred", "rejected"] as const;

function invalidPlan(reasonCode: SessionBoardPlanReasonCode, message: string): SessionBoardPlanValidation {
  return { status: "invalid", reasonCode, message };
}

function usableString(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximumLength;
}

/**
 * Refuses a title that carries, or looks like it carries, a governed code.
 *
 * This is the same rule the server applies, imported rather than re-derived, so
 * a caller cannot inject `C001.M013.A099 — …` as a "title" and have the record
 * come back wearing a number nobody allocated.
 */
function planTitleProblem(title: string): SessionBoardPlanReasonCode | null {
  const trimmed = title.trim();
  if (!trimmed || trimmed.length > PLAN_MAXIMUM_TITLE_LENGTH) return "PLAN_INVALID_TITLE";
  if (trimmed.includes(stableCodeTitleSeparator)) return "PLAN_SUPPLIED_IDENTIFIER_REJECTED";
  if (looksLikeGovernedCodeToken(trimmed.split(/\s/, 1)[0])) return "PLAN_SUPPLIED_IDENTIFIER_REJECTED";
  return null;
}

function planTargetProblem(target: SessionBoardPlanTarget): SessionBoardPlanValidation | null {
  if (!SUPPORTED_PLAN_TARGET_KINDS.includes(target.kind)) {
    return invalidPlan("PLAN_UNSUPPORTED_PROPOSAL_KIND", `Proposal kind ${String(target.kind)} is not a supported allocation target.`);
  }
  if (target.kind === "existing_mission" && !usableString(target.missionId, 120)) {
    return invalidPlan("PLAN_SHAPE_INVALID", "An existing-Mission proposal must name an opaque Mission record id.");
  }
  if (target.kind === "existing_action" && !usableString(target.actionId, 120)) {
    return invalidPlan("PLAN_SHAPE_INVALID", "An existing-Action proposal must name an opaque Action record id.");
  }
  if (target.kind === "new_mission" || target.kind === "new_action") {
    const titleProblem = planTitleProblem(target.title);
    if (titleProblem) {
      return invalidPlan(titleProblem, `Proposal title "${target.title}" is not acceptable; the server allocates every identifier.`);
    }
    if (typeof target.description !== "string" || target.description.length > PLAN_MAXIMUM_DESCRIPTION_LENGTH) {
      return invalidPlan("PLAN_SHAPE_INVALID", "A new-record proposal description must be a string within the accepted length.");
    }
  }
  if (target.kind === "new_action") {
    if (target.actionKind !== "standard" && target.actionKind !== "deployment") {
      return invalidPlan("PLAN_UNSUPPORTED_PROPOSAL_KIND", `Action kind ${String(target.actionKind)} is not supported.`);
    }
    if (!Array.isArray(target.predecessorActionIds) || target.predecessorActionIds.length > PLAN_MAXIMUM_PREDECESSORS) {
      return invalidPlan("PLAN_SHAPE_INVALID", "Predecessors must be an array of at most 50 opaque Action record ids.");
    }
    const seen = new Set<string>();
    for (const predecessorActionId of target.predecessorActionIds) {
      if (!usableString(predecessorActionId, 120)) {
        return invalidPlan("PLAN_SHAPE_INVALID", "Every predecessor must be a non-empty opaque Action record id.");
      }
      if (seen.has(predecessorActionId)) {
        return invalidPlan("PLAN_DUPLICATE_PREDECESSOR", `Predecessor ${predecessorActionId} is named more than once by one proposal.`);
      }
      seen.add(predecessorActionId);
    }
  }
  return null;
}

/**
 * Mechanical, pre-dispatch validation of one plan.
 *
 * Nothing is prepared, bound, or sent while this returns `invalid`: an
 * incomplete or self-contradictory plan produces a stop and no command, which
 * is the "no mutation on invalid input" half of the contract.
 */
export function validateSessionBoardPlan(plan: SessionBoardPlan): SessionBoardPlanValidation {
  if (!usableString(plan.planId, 160)) return invalidPlan("PLAN_SHAPE_INVALID", "The plan must carry a plan identifier.");
  if (!Number.isSafeInteger(plan.planRevision) || plan.planRevision < 1) {
    return invalidPlan("PLAN_SHAPE_INVALID", "The plan must carry a positive integer revision.");
  }
  if (typeof plan.planDigest !== "string" || !DIGEST_PATTERN.test(plan.planDigest)) {
    return invalidPlan("PLAN_DIGEST_INVALID", "The plan must bind the exact sha256 digest of the reviewed plan document.");
  }
  if (!usableString(plan.envelopeId, 160)) return invalidPlan("PLAN_SHAPE_INVALID", "The plan must bind a Commander decision envelope.");
  if (!usableString(plan.decisionIdPrefix, 160)) return invalidPlan("PLAN_SHAPE_INVALID", "The plan must bind a decision identity prefix.");
  if (!usableString(plan.heading, 200)) return invalidPlan("PLAN_SHAPE_INVALID", "The plan must carry a board heading.");
  if (plan.campaignId !== null && !usableString(plan.campaignId, 120)) {
    return invalidPlan("PLAN_SHAPE_INVALID", "The plan Campaign must be an opaque record id or null.");
  }
  if (plan.missionId !== null && !usableString(plan.missionId, 120)) {
    return invalidPlan("PLAN_SHAPE_INVALID", "The plan Mission must be an opaque record id or null.");
  }
  if (plan.campaignId === null && plan.missionId === null) {
    return invalidPlan("PLAN_PARENT_CAMPAIGN_REQUIRED", "A plan must bind a Campaign, or a Mission from which the Campaign is resolved.");
  }
  if (plan.decisionExpiresAt !== null
    && (!ISO_TIMESTAMP_PATTERN.test(plan.decisionExpiresAt) || !Number.isFinite(Date.parse(plan.decisionExpiresAt)))) {
    return invalidPlan("PLAN_EXPIRY_INVALID", "The plan expiry must be a usable ISO-8601 instant or null.");
  }
  if (plan.expectedRevision !== null && (!Number.isSafeInteger(plan.expectedRevision) || plan.expectedRevision < 1)) {
    return invalidPlan("PLAN_BASELINE_INVALID", "A bound expected revision must be a positive integer.");
  }
  if (plan.expectedStateDigest !== null && !DIGEST_PATTERN.test(plan.expectedStateDigest)) {
    return invalidPlan("PLAN_BASELINE_INVALID", "A bound expected state digest must be a sha256 digest.");
  }
  if (plan.idempotencyKey !== null && !validSessionWorkPlanAllocationIdempotencyKey(plan.idempotencyKey)) {
    return invalidPlan("PLAN_IDEMPOTENCY_IDENTITY_INVALID", "A bound idempotency identity must match the accepted allocation identity form.");
  }
  if (!Array.isArray(plan.proposals) || plan.proposals.length === 0) {
    return invalidPlan("PLAN_EMPTY", "A plan with no proposal is not an executable Commander selection.");
  }
  if (plan.proposals.length > PLAN_MAXIMUM_PROPOSALS) {
    return invalidPlan("PLAN_SHAPE_INVALID", `A plan may carry at most ${PLAN_MAXIMUM_PROPOSALS} proposals.`);
  }

  const seenProposalIds = new Set<string>();
  for (const proposal of plan.proposals) {
    if (!usableString(proposal.proposalId, 120)) {
      return invalidPlan("PLAN_SHAPE_INVALID", "Every proposal must carry a non-empty proposal identifier.");
    }
    if (seenProposalIds.has(proposal.proposalId)) {
      return invalidPlan("PLAN_DUPLICATE_PROPOSAL_ID", `Proposal ${proposal.proposalId} appears more than once in this plan.`);
    }
    seenProposalIds.add(proposal.proposalId);
    if (!PLAN_TREATMENTS.includes(proposal.treatment)) {
      return invalidPlan("PLAN_INVALID_TREATMENT", `Proposal ${proposal.proposalId} carries treatment ${String(proposal.treatment)}, which is not a selection treatment.`);
    }
    if (!proposal.target || typeof proposal.target !== "object") {
      return invalidPlan("PLAN_SHAPE_INVALID", `Proposal ${proposal.proposalId} carries no allocation target.`);
    }
    const targetProblem = planTargetProblem(proposal.target);
    if (targetProblem) return targetProblem;
    if (proposal.target.kind === "existing_action" || proposal.target.kind === "new_action") {
      if (plan.missionId === null) {
        return invalidPlan("PLAN_PARENT_MISSION_REQUIRED", `Proposal ${proposal.proposalId} targets an Action, which requires the plan to bind its Mission.`);
      }
    }
  }

  return { status: "valid" };
}

/**
 * Each branch is written out with an explicit return type rather than spreading
 * the union in one expression, so the compiler checks the copy against
 * `SessionBoardPlanTarget` member by member instead of inferring a shape that
 * merely happens to be assignable.
 */
function frozenSessionBoardPlanTarget(target: SessionBoardPlanTarget): SessionBoardPlanTarget {
  if (target.kind === "new_action") {
    return Object.freeze({
      kind: "new_action" as const,
      title: target.title,
      description: target.description,
      actionKind: target.actionKind,
      predecessorActionIds: Object.freeze([...target.predecessorActionIds]),
    });
  }
  if (target.kind === "new_mission") {
    return Object.freeze({ kind: "new_mission" as const, title: target.title, description: target.description });
  }
  if (target.kind === "existing_action") {
    return Object.freeze({ kind: "existing_action" as const, actionId: target.actionId });
  }
  return Object.freeze({ kind: "existing_mission" as const, missionId: target.missionId });
}

/**
 * A structural, deeply frozen copy of the plan.
 *
 * The binding keeps this copy rather than the caller's object, so a plan cannot
 * be mutated after it was validated and displayed and before it is authorized.
 * The caller's own object is never frozen — freezing an input is a side effect
 * the caller did not ask for, and a caller that reuses its plan object for a
 * second board would find it unexpectedly immutable.
 */
export function frozenSessionBoardPlan(plan: SessionBoardPlan): SessionBoardPlan {
  const proposals: SessionBoardPlanProposal[] = plan.proposals.map((proposal) => Object.freeze({
    proposalId: proposal.proposalId,
    proposalLabel: proposal.proposalLabel,
    treatment: proposal.treatment,
    target: frozenSessionBoardPlanTarget(proposal.target),
    outcome: proposal.outcome,
    dependencies: Object.freeze([...proposal.dependencies]),
    expectedTimeMinutes: proposal.expectedTimeMinutes,
    marginalCostUsd: proposal.marginalCostUsd,
    risk: proposal.risk,
    acceptanceCriteria: Object.freeze([...proposal.acceptanceCriteria]),
    protectedGates: Object.freeze(proposal.protectedGates.map((gate) => Object.freeze({ ...gate }))),
    protectedNextGate: proposal.protectedNextGate,
  }));
  return Object.freeze({
    planId: plan.planId,
    planRevision: plan.planRevision,
    planDigest: plan.planDigest,
    envelopeId: plan.envelopeId,
    campaignId: plan.campaignId,
    missionId: plan.missionId,
    decisionIdPrefix: plan.decisionIdPrefix,
    decisionExpiresAt: plan.decisionExpiresAt,
    expectedRevision: plan.expectedRevision,
    expectedStateDigest: plan.expectedStateDigest,
    idempotencyKey: plan.idempotencyKey,
    heading: plan.heading,
    proposals: Object.freeze(proposals),
  });
}

/* -------------------------------------------------------------------------- */
/* Immutable plan-content integrity                                            */
/* -------------------------------------------------------------------------- */

/**
 * ACT-a5ae5f26 / P04-FU01 rework FW-P04-FU01-001.
 *
 * The digest is domain-separated by this contract string so a plan-content
 * digest can never collide with, or be mistaken for, a state digest, a request
 * binding digest, or a receipt digest computed over the same canonical JSON.
 */
export const SESSION_BOARD_PLAN_CONTENT_CONTRACT = "castra-session-board-plan-content/1.0.0";

/**
 * Written out per kind rather than copied, so the canonical content contains
 * exactly the reviewed target fields. A caller cannot add a property that rides
 * along into the digest, and cannot omit one that silently leaves it.
 */
function planTargetContent(target: SessionBoardPlanTarget): Record<string, unknown> {
  if (target.kind === "new_action") {
    return {
      kind: "new_action",
      title: target.title,
      description: target.description,
      actionKind: target.actionKind,
      // Order is content: a reordered dependency list is a different plan.
      predecessorActionIds: [...target.predecessorActionIds],
    };
  }
  if (target.kind === "new_mission") {
    return { kind: "new_mission", title: target.title, description: target.description };
  }
  if (target.kind === "existing_action") {
    return { kind: "existing_action", actionId: target.actionId };
  }
  return { kind: "existing_mission", missionId: target.missionId };
}

/**
 * The one canonical representation of the reviewed plan content.
 *
 * Every field that constitutes the Commander-reviewed plan is present — the plan
 * identity and revision, the envelope and parentage, the decision binding and
 * expiry, the expected authoritative baseline, the bound idempotency identity,
 * the heading, and every proposal with its treatment, target, and review
 * metadata — so changing any one of them changes the digest.
 *
 * `planDigest` itself is the one excluded field, and it is excluded for the only
 * reason a field ever should be: it is the digest of this representation, so
 * including it would be circular. Proposal order is preserved rather than
 * sorted, because the reviewed order is what the board displays and what the
 * default selection is derived from.
 */
export function sessionBoardPlanContent(plan: SessionBoardPlan): Record<string, unknown> {
  return {
    contract: SESSION_BOARD_PLAN_CONTENT_CONTRACT,
    planId: plan.planId,
    planRevision: plan.planRevision,
    envelopeId: plan.envelopeId,
    campaignId: plan.campaignId,
    missionId: plan.missionId,
    decisionIdPrefix: plan.decisionIdPrefix,
    decisionExpiresAt: plan.decisionExpiresAt,
    expectedRevision: plan.expectedRevision,
    expectedStateDigest: plan.expectedStateDigest,
    idempotencyKey: plan.idempotencyKey,
    heading: plan.heading,
    proposals: plan.proposals.map((proposal) => ({
      proposalId: proposal.proposalId,
      proposalLabel: proposal.proposalLabel,
      treatment: proposal.treatment,
      target: planTargetContent(proposal.target),
      outcome: proposal.outcome,
      dependencies: [...proposal.dependencies],
      expectedTimeMinutes: proposal.expectedTimeMinutes,
      marginalCostUsd: proposal.marginalCostUsd,
      risk: proposal.risk,
      acceptanceCriteria: [...proposal.acceptanceCriteria],
      protectedGates: proposal.protectedGates.map((gate) => (gate.unmetCondition === undefined
        ? { title: gate.title, source: gate.source }
        : { title: gate.title, source: gate.source, unmetCondition: gate.unmetCondition })),
      protectedNextGate: proposal.protectedNextGate,
    })),
  };
}

/** The recomputable `sha256:` digest a conforming plan must carry as `planDigest`. */
export function sessionBoardPlanContentDigest(plan: SessionBoardPlan): Promise<string> {
  return hostedSha256(canonicalHostedJson(sessionBoardPlanContent(plan)));
}

export type SessionBoardPlanIntegrity =
  | { status: "verified"; planDigest: string }
  | { status: "mismatch"; boundDigest: string; recomputedDigest: string | null; message: string };

/**
 * Recomputes the canonical content digest and accepts the plan only on an exact
 * match with the digest it claims.
 *
 * This is the check the earlier candidate lacked: syntactic validation proved
 * `planDigest` was shaped like a digest, never that it was *this* plan's digest,
 * so a proposal, target, treatment, decision binding, baseline, idempotency
 * identity, or expiry could be altered after review while the plan still
 * presented the reviewed digest. Anything that cannot be recomputed — including
 * a plan that is not canonically serializable — is a mismatch, never a pass.
 */
export async function verifySessionBoardPlanContent(plan: SessionBoardPlan): Promise<SessionBoardPlanIntegrity> {
  const boundDigest = typeof plan.planDigest === "string" ? plan.planDigest : String(plan.planDigest);
  if (typeof plan.planDigest !== "string" || !DIGEST_PATTERN.test(plan.planDigest)) {
    return {
      status: "mismatch",
      boundDigest,
      recomputedDigest: null,
      message: `Plan ${plan.planId} carries no usable sha256 plan-content digest. No allocation command was prepared.`,
    };
  }
  let recomputedDigest: string;
  try {
    recomputedDigest = await sessionBoardPlanContentDigest(plan);
  } catch {
    return {
      status: "mismatch",
      boundDigest,
      recomputedDigest: null,
      message: `Plan ${plan.planId} r${plan.planRevision} content could not be canonically represented, so its digest could not be recomputed. No allocation command was prepared.`,
    };
  }
  if (recomputedDigest !== plan.planDigest) {
    return {
      status: "mismatch",
      boundDigest,
      recomputedDigest,
      message: `Plan ${plan.planId} r${plan.planRevision} content digest is ${recomputedDigest}, not the bound ${plan.planDigest}. The plan content differs from the reviewed plan; no allocation command was prepared.`,
    };
  }
  return { status: "verified", planDigest: recomputedDigest };
}

/* -------------------------------------------------------------------------- */
/* Immutable P04 bindings                                                      */
/* -------------------------------------------------------------------------- */

/** `DATA-SCOPE.md#withheld-internal-reference`. */
export const SESSION_BOARD_PLAN_FILE = "DATA-SCOPE.md#withheld-internal-reference";

/**
 * The exact SHA-256 of that plan *file*, as enumerated in the immutable inputs
 * of the approved P04 correction envelope.
 *
 * It is retained as provenance — it records which reviewed document this plan
 * was transcribed from — and it is deliberately no longer the plan's
 * `planDigest`. A file digest cannot be recomputed from the plan a browser holds,
 * so binding it as `planDigest` could only ever be checked for syntax, which is
 * precisely the FW-P04-FU01-001 defect. Nothing consumes this constant as an
 * integrity control, and it is never a second, weaker meaning of `planDigest`.
 */
export const SESSION_BOARD_PLAN_DOCUMENT_DIGEST = "sha256:851a402b1e41b7f2c4df23c9fcd5beb606dbf1b5d81fd05e443abb91adf0db62";

/**
 * The canonical content digest of `P04_SESSION_BOARD_PLAN`, recomputed and
 * verified before any P04 authorization is prepared.
 *
 * It is a literal rather than a call to `sessionBoardPlanContentDigest`, and
 * that is the whole point: a derived constant would silently follow any edit to
 * the proposal set, so nothing would ever be rejected. Because this value is
 * fixed here, changing any reviewed field below fails the pre-dispatch check
 * until the change is deliberately re-recorded.
 */
export const SESSION_BOARD_PLAN_DIGEST = "sha256:057e38774f5aecda6f6528997c3b09ae4bede298b052ae160b3464119427a83b";

export const SESSION_BOARD_PLAN_ID = "C001-MIS-6b667e3d-SWP-SIGNAL-P04-2026-08-25";
export const SESSION_BOARD_PLAN_REVISION = 1;

/**
 * The bound execution envelope is the Commander selection receipt
 * `C001-MIS-6b667e3d-SWP-SIGNAL-P04-COMMANDER-SELECTION-20260825-R1`, which is
 * the record that fixes the approved plan revision, the selected proposal set,
 * the authorized effects, the `$0.00` ceiling, and the exclusions.
 */
export const SESSION_BOARD_ENVELOPE_ID = "C001-MIS-6b667e3d-SWP-SIGNAL-P04-COMMANDER-SELECTION-20260825-R1";

/** Opaque Mission identity from the immutable P04 allocation-link receipt. */
export const SESSION_BOARD_MISSION_ID = "mis_6b667e3d-afb1-4e47-823a-4b42fc413475";

/**
 * The click-time Commander decision is a fresh decision each time, so its
 * identity carries the exact instant it was made. It is never reused and never
 * back-dated.
 */
export const SESSION_BOARD_DECISION_ID_PREFIX = "C001-MIS-6b667e3d-SWP-SIGNAL-P04-SESSION-BOARD-DECISION-";

interface ApprovedProposalBinding {
  proposalId: string;
  actionId: string;
  outcome: string;
  dependencies: string[];
  expectedTimeMinutes: number;
  marginalCostUsd: number;
  risk: string;
  acceptanceCriteria: string[];
  protectedGates: SessionBoardGateView[];
  protectedNextGate: string;
}

/**
 * The complete approved proposal set of plan revision 1, in the order the
 * Commander approved it. Both proposals target Action records that already
 * exist in authoritative state, so this transaction links and allocates nothing
 * new; the opaque identities come from the immutable allocation-link receipt and
 * must still be present in loaded state before they are bound.
 */
export const APPROVED_SESSION_BOARD_PROPOSALS: readonly ApprovedProposalBinding[] = [
  {
    proposalId: "S25-SIG",
    actionId: "act_bc7296dc-fea1-4fae-85f5-40efbd0cc8c7",
    outcome: "One durable, versioned SIGNAL configuration binds a reproducible research, intent, implementation, machine check, Commander review, and bounded rework cycle.",
    dependencies: ["Live authority revision 44", "Commander selection of this plan revision"],
    expectedTimeMinutes: 120,
    marginalCostUsd: 0,
    risk: "A product alias or subscription entitlement may not resolve exactly; the recorded rule is to stop rather than substitute.",
    acceptanceCriteria: [
      "SIGNAL resolves exactly to OpenAI Codex, gpt-5.3-codex-spark, high effort, subscription authentication",
      "No fallback model exists and RECON plus Commander inputs are mandatory",
      "The SARGE machine check cannot claim human QA and the rework ceiling is deterministic",
    ],
    protectedGates: [
      { title: "Commander role-contract acceptance", source: `${SESSION_BOARD_PLAN_ID} r${SESSION_BOARD_PLAN_REVISION}` },
    ],
    protectedNextGate: "Commander accepts the human-readable role contract.",
  },
  {
    proposalId: "S25-P04",
    actionId: "act_c417cbd5-8a52-4bc5-bf4a-1836b13f8069",
    outcome: "One exact Commander decision links or allocates only the selected records at one expected revision, binds the execution envelope, and returns receipt-derived Git identity.",
    dependencies: ["S25-SIG", "P03 Profile A, D01 to D11", "Live P04 revision 1"],
    expectedTimeMinutes: 840,
    marginalCostUsd: 0,
    risk: "Allocation defects can create durable record or Git identity errors, so stale, duplicate, partial, invalid, expired, and unknown requests must all fail closed under the same idempotency identity.",
    acceptanceCriteria: [
      "Arbitrary subset selection and one binding Commander decision",
      "Unselected cards remain unallocated",
      "Exact-revision atomic link or allocation across active, completed, and archived records",
      "Git names are derived only from returned receipts",
      "Public Demo and UI Review stay memory-only and visibly non-authoritative",
    ],
    protectedGates: [
      { title: "Fresh independent FIREWATCH verification", source: "Progressive Verification Ladder" },
      { title: "Commander acceptance and governed close", source: SESSION_BOARD_ENVELOPE_ID },
    ],
    protectedNextGate: "Independent verification, then the protected Commander acceptance and governed close gate.",
  },
] as const;

/**
 * The accepted P04 selection expressed in the generic plan form.
 *
 * This is the default the board uses when no plan is supplied, and it is built
 * from the same immutable constants above rather than restated, so P04 behavior
 * is preserved by construction: the same plan identity, envelope, decision
 * prefix, Mission, proposals, order, and default selection as before.
 *
 * `campaignId` stays `null` deliberately. P04 resolved the Campaign from the
 * bound Mission's parent in authoritative state and never carried a
 * repository-resident Campaign identity; hard-coding one here would invent an
 * authority claim P04 never made and would fail closed if the live parent ever
 * differed from the guess.
 */
export const P04_SESSION_BOARD_PLAN: SessionBoardPlan = frozenSessionBoardPlan({
  planId: SESSION_BOARD_PLAN_ID,
  planRevision: SESSION_BOARD_PLAN_REVISION,
  planDigest: SESSION_BOARD_PLAN_DIGEST,
  envelopeId: SESSION_BOARD_ENVELOPE_ID,
  campaignId: null,
  missionId: SESSION_BOARD_MISSION_ID,
  decisionIdPrefix: SESSION_BOARD_DECISION_ID_PREFIX,
  decisionExpiresAt: null,
  expectedRevision: null,
  expectedStateDigest: null,
  idempotencyKey: null,
  heading: "Session Board — authoritative allocation",
  proposals: APPROVED_SESSION_BOARD_PROPOSALS.map((approved) => ({
    proposalId: approved.proposalId,
    proposalLabel: approved.proposalId,
    treatment: "selected" as const,
    target: { kind: "existing_action" as const, actionId: approved.actionId },
    outcome: approved.outcome,
    dependencies: approved.dependencies,
    expectedTimeMinutes: approved.expectedTimeMinutes,
    marginalCostUsd: approved.marginalCostUsd,
    risk: approved.risk,
    acceptanceCriteria: approved.acceptanceCriteria,
    protectedGates: approved.protectedGates,
    protectedNextGate: approved.protectedNextGate,
  })),
});

/* -------------------------------------------------------------------------- */
/* Authoritative baseline adapter                                              */
/* -------------------------------------------------------------------------- */

/**
 * The exact authoritative read this controller accepts. It is structurally the
 * hosted repository's `HostedStateLoadResult`; it is declared here so the
 * controller and its tests never need the hosted transport.
 */
export interface AuthoritativeSessionBoardRead {
  availability: string;
  revision: number;
  stateDigest: string | null;
  state: CastraState | null;
}

/**
 * One plan proposal resolved into the exact dispatchable allocation target.
 *
 * The resolution — not the plan — is what carries `expectedRecordRevision`,
 * because that value is read from the loaded authoritative document at binding
 * time. A caller can never supply it, so the exact-revision guarantee cannot be
 * weakened by a stale or hand-written plan.
 */
export interface AuthoritativeSessionBoardProposal {
  proposalId: string;
  treatment: "selected" | "deferred" | "rejected";
  target: SessionWorkPlanProposalTarget;
}

export interface AuthoritativeSessionBoardBinding {
  /** The exact immutable plan this board was built from. */
  plan: SessionBoardPlan;
  campaignId: string;
  missionId: string | null;
  proposals: AuthoritativeSessionBoardProposal[];
  baseline: { revision: number; stateDigest: string };
}

export type SessionBoardBindingReasonCode =
  | "AUTHORITATIVE_STATE_NOT_LOADED"
  | "AUTHORITATIVE_BASELINE_INCOMPLETE"
  | "PLAN_INVALID"
  | "MISSION_RECORD_NOT_FOUND"
  | "MISSION_OUTSIDE_BOUND_CAMPAIGN"
  | "MISSION_REVISION_UNUSABLE"
  | "CAMPAIGN_RECORD_NOT_FOUND"
  | "ACTION_RECORD_NOT_FOUND"
  | "ACTION_OUTSIDE_BOUND_MISSION"
  | "ACTION_REVISION_UNUSABLE"
  | "PREDECESSOR_RECORD_NOT_FOUND"
  | "PREDECESSOR_RECORD_ARCHIVED"
  | "PREDECESSOR_OUTSIDE_BOUND_CAMPAIGN";

export type AuthoritativeSessionBoardBindingResult =
  | { status: "bound"; fixture: SessionBoardFixtureView; binding: AuthoritativeSessionBoardBinding }
  | {
    status: "unavailable";
    fixture: SessionBoardFixtureView;
    reasonCode: SessionBoardBindingReasonCode;
    message: string;
  };

function unavailableFixture(message: string): SessionBoardFixtureView {
  return {
    scenario: "normal",
    heading: "Session Board — authoritative binding unavailable",
    boundaryNotice: `${message} No synthetic fixture is substituted in an authenticated session and no command can be prepared.`,
    proposals: [],
    defaultSelectedIds: [],
    hasUnknownOutcome: false,
    unknownOutcomeGuidance: "No allocation command has been prepared in this session.",
    allowAuthorizedRetry: false,
  };
}

function unavailable(
  reasonCode: SessionBoardBindingReasonCode,
  message: string,
): AuthoritativeSessionBoardBindingResult {
  return { status: "unavailable", fixture: unavailableFixture(message), reasonCode, message };
}

function humanIdentityOf(record: Action | Mission, kind: "action" | "mission"): string {
  const resolution = resolveStableCode(kind, record);
  return resolution.state === "existing_strict" ? resolution.code : PENDING_HUMAN_IDENTITY;
}

function lifecycleStateOf(record: Action | Mission): string {
  const approval = record.approval
    ? ` · Commander approval bound at record revision ${record.approval.revision}`
    : "";
  return `${record.status} · record revision ${record.revision}${approval}`;
}

/** The honest lifecycle line for a record that does not exist yet. */
const UNALLOCATED_LIFECYCLE_STATE = "not allocated · no record revision until the receipt returns";

function usableRecordRevision(revision: number): boolean {
  return Number.isSafeInteger(revision) && revision >= 1;
}

/**
 * Builds the authenticated Session Board from the exact records the loaded
 * authoritative read contains, for whichever validated plan is supplied.
 *
 * The plan parameter defaults to the accepted P04 plan, so the deployed
 * behavior and every existing caller are unchanged; supplying a different
 * validated plan is what generalizes the board.
 *
 * Branch and worktree hints are intentionally empty. Git identity is
 * receipt-derived from the opaque record id and does not exist before the
 * transaction returns, so presenting a hint here would be a guess wearing the
 * costume of an identity. A new-record proposal has no opaque identity yet
 * either, so it displays the pending human identity and empty machine identity
 * rather than a placeholder that could be mistaken for an allocation.
 */
export function buildAuthoritativeSessionBoardBinding(
  loaded: AuthoritativeSessionBoardRead | null,
  suppliedPlan: SessionBoardPlan = P04_SESSION_BOARD_PLAN,
): AuthoritativeSessionBoardBindingResult {
  const planValidation = validateSessionBoardPlan(suppliedPlan);
  if (planValidation.status === "invalid") {
    return unavailable(
      "PLAN_INVALID",
      `The supplied Session Board plan is not executable (${planValidation.reasonCode}): ${planValidation.message}`,
    );
  }
  const plan = frozenSessionBoardPlan(suppliedPlan);

  if (!loaded || loaded.availability !== "loaded" || !loaded.state) {
    return unavailable(
      "AUTHORITATIVE_STATE_NOT_LOADED",
      "Authoritative hosted state is not loaded in this session.",
    );
  }
  if (!usableRecordRevision(loaded.revision)
    || typeof loaded.stateDigest !== "string" || !DIGEST_PATTERN.test(loaded.stateDigest)) {
    return unavailable(
      "AUTHORITATIVE_BASELINE_INCOMPLETE",
      "The loaded hosted result carries no usable authoritative revision and state digest.",
    );
  }

  const state = loaded.state;
  const baseline = { revision: loaded.revision, stateDigest: loaded.stateDigest };

  const mission = plan.missionId === null
    ? null
    : state.missions.find((candidate) => candidate.id === plan.missionId) ?? null;
  if (plan.missionId !== null && !mission) {
    return unavailable(
      "MISSION_RECORD_NOT_FOUND",
      `The bound Mission ${plan.missionId} is not present in authoritative state.`,
    );
  }

  // A plan that names its Campaign is bound to that exact record; a plan that
  // does not resolves the Campaign from the bound Mission's parent, which is
  // exactly what P04 did and is the only reason `campaignId` may be null.
  const campaignId = plan.campaignId ?? mission?.campaignId ?? null;
  const campaign = campaignId === null
    ? undefined
    : state.campaigns.find((candidate) => candidate.id === campaignId);
  if (!campaign) {
    return unavailable(
      "CAMPAIGN_RECORD_NOT_FOUND",
      `The bound Campaign ${campaignId ?? "(unresolved)"} is not present in authoritative state.`,
    );
  }
  if (mission && mission.campaignId !== campaign.id) {
    return unavailable(
      "MISSION_OUTSIDE_BOUND_CAMPAIGN",
      `Mission ${mission.id} belongs to Campaign ${mission.campaignId}, not the bound Campaign ${campaign.id}.`,
    );
  }

  const actionsById = new Map(state.actions.map((record) => [record.id, record]));
  const missionsById = new Map(state.missions.map((record) => [record.id, record]));
  const proposals: AuthoritativeSessionBoardProposal[] = [];
  const cards: SessionBoardProposalView[] = [];

  for (const proposal of plan.proposals) {
    const planned = proposal.target;
    let target: SessionWorkPlanProposalTarget;
    let humanIdentity = PENDING_HUMAN_IDENTITY;
    let opaqueRecordId = "";
    let lifecycleState = UNALLOCATED_LIFECYCLE_STATE;
    const dependencies = [...proposal.dependencies];

    if (planned.kind === "existing_action") {
      const record = actionsById.get(planned.actionId);
      if (!record) {
        return unavailable(
          "ACTION_RECORD_NOT_FOUND",
          `Proposal ${proposal.proposalId} targets Action ${planned.actionId}, which is not present in authoritative state.`,
        );
      }
      if (!mission || record.missionId !== mission.id) {
        return unavailable(
          "ACTION_OUTSIDE_BOUND_MISSION",
          `Action ${planned.actionId} is outside the bound Mission ${mission?.id ?? "(unbound)"}.`,
        );
      }
      if (!usableRecordRevision(record.revision)) {
        return unavailable(
          "ACTION_REVISION_UNUSABLE",
          `Action ${planned.actionId} carries no usable record revision.`,
        );
      }
      target = { kind: "existing_action", actionId: record.id, expectedRecordRevision: record.revision };
      humanIdentity = humanIdentityOf(record, "action");
      opaqueRecordId = record.id;
      lifecycleState = lifecycleStateOf(record);
    } else if (planned.kind === "existing_mission") {
      const record = missionsById.get(planned.missionId);
      if (!record) {
        return unavailable(
          "MISSION_RECORD_NOT_FOUND",
          `Proposal ${proposal.proposalId} targets Mission ${planned.missionId}, which is not present in authoritative state.`,
        );
      }
      if (record.campaignId !== campaign.id) {
        return unavailable(
          "MISSION_OUTSIDE_BOUND_CAMPAIGN",
          `Mission ${planned.missionId} is outside the bound Campaign ${campaign.id}.`,
        );
      }
      if (!usableRecordRevision(record.revision)) {
        return unavailable(
          "MISSION_REVISION_UNUSABLE",
          `Mission ${planned.missionId} carries no usable record revision.`,
        );
      }
      target = { kind: "existing_mission", missionId: record.id, expectedRecordRevision: record.revision };
      humanIdentity = humanIdentityOf(record, "mission");
      opaqueRecordId = record.id;
      lifecycleState = lifecycleStateOf(record);
    } else if (planned.kind === "new_mission") {
      target = {
        kind: "new_mission",
        campaignId: campaign.id,
        title: planned.title,
        description: planned.description,
      };
    } else {
      // `validateSessionBoardPlan` already refused an Action proposal on a plan
      // with no Mission, so this narrowing is a type guarantee rather than a
      // second policy decision.
      if (!mission) {
        return unavailable(
          "MISSION_RECORD_NOT_FOUND",
          `Proposal ${proposal.proposalId} allocates an Action but the plan binds no Mission.`,
        );
      }
      // Predecessors are pre-checked here so an unusable dependency stops the
      // board rather than the transport. This is a display-time convenience
      // check, not the authority: the server independently re-resolves every
      // reference against its own document before any mutation.
      for (const predecessorActionId of planned.predecessorActionIds) {
        const predecessor = actionsById.get(predecessorActionId);
        if (!predecessor) {
          return unavailable(
            "PREDECESSOR_RECORD_NOT_FOUND",
            `Proposal ${proposal.proposalId} depends on Action ${predecessorActionId}, which is not present in authoritative state.`,
          );
        }
        if (predecessor.archivedAt !== null) {
          return unavailable(
            "PREDECESSOR_RECORD_ARCHIVED",
            `Proposal ${proposal.proposalId} depends on archived Action ${predecessorActionId}.`,
          );
        }
        const parentMission = missionsById.get(predecessor.missionId);
        if (!parentMission || parentMission.campaignId !== campaign.id) {
          return unavailable(
            "PREDECESSOR_OUTSIDE_BOUND_CAMPAIGN",
            `Proposal ${proposal.proposalId} depends on Action ${predecessorActionId}, which does not resolve inside the bound Campaign ${campaign.id}.`,
          );
        }
        dependencies.push(`Predecessor ${shortId(predecessor.id)} · Mission ${shortId(parentMission.id)} · ${parentMission.id === mission.id ? "same Mission" : "same Campaign, different Mission"}`);
      }
      target = {
        kind: "new_action",
        missionId: mission.id,
        title: planned.title,
        description: planned.description,
        actionKind: planned.actionKind,
        predecessorActionIds: [...planned.predecessorActionIds],
      };
    }

    proposals.push({ proposalId: proposal.proposalId, treatment: proposal.treatment, target });
    cards.push({
      proposalId: proposal.proposalId,
      proposalLabel: proposal.proposalLabel,
      humanIdentity,
      machineIdentity: opaqueRecordId ? shortId(opaqueRecordId) : "",
      shortMachineIdentity: opaqueRecordId ? shortId(opaqueRecordId) : "",
      fullMachineIdentity: opaqueRecordId,
      branchHint: "",
      worktreeHint: "",
      state: "pending",
      outcome: proposal.outcome,
      dependencies,
      expectedTimeMinutes: proposal.expectedTimeMinutes,
      marginalCostUsd: proposal.marginalCostUsd,
      risk: proposal.risk,
      acceptanceCriteria: [...proposal.acceptanceCriteria],
      protectedGates: proposal.protectedGates.map((gate) => ({ ...gate })),
      lifecycleState,
      protectedNextGate: proposal.protectedNextGate,
    });
  }

  return {
    status: "bound",
    fixture: {
      scenario: "normal",
      heading: plan.heading,
      boundaryNotice: `Authoritative CASTRA hosted state · revision ${baseline.revision} · ${baseline.stateDigest}. One authorization dispatches exactly one governed allocation command bound to this exact revision and digest; unselected proposals are recorded as deferred and are never allocated.`,
      proposals: cards,
      defaultSelectedIds: plan.proposals
        .filter((proposal) => proposal.treatment === "selected")
        .map((proposal) => proposal.proposalId),
      hasUnknownOutcome: false,
      unknownOutcomeGuidance: "No allocation command has been prepared in this session.",
      allowAuthorizedRetry: false,
    },
    binding: {
      plan,
      campaignId: campaign.id,
      missionId: mission?.id ?? null,
      proposals,
      baseline,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Request construction                                                        */
/* -------------------------------------------------------------------------- */

export type SessionBoardAllocationRefusalCode =
  | "EMPTY_SELECTION"
  | "UNKNOWN_PROPOSAL_ID"
  | "REJECTED_PROPOSAL_SELECTED"
  | "PLAN_CONTENT_DIGEST_MISMATCH"
  | "INVALID_BASELINE"
  | "BASELINE_MISMATCH"
  | "PLAN_BASELINE_MISMATCH"
  | "INVALID_DECISION_TIME"
  | "DECISION_EXPIRED"
  | "PREPARATION_REFUSED"
  | "COMMAND_IN_FLIGHT"
  | "NO_RETAINED_COMMAND";

export interface SessionBoardAllocationRequestInput {
  plan: SessionWorkPlanBinding;
  decision: SessionWorkPlanDecisionBinding;
  envelope: SessionWorkPlanExecutionEnvelope;
  selection: SessionWorkPlanSelection;
  proposals: SessionWorkPlanProposal[];
  baseline: { revision: number; stateDigest: string };
  /**
   * Present only when the plan bound one. Absent leaves the transport to mint a
   * fresh identity exactly as before; nothing here ever replaces a bound one.
   */
  idempotencyKey?: string;
}

export type SessionBoardAllocationInputResult =
  | { status: "ready"; input: SessionBoardAllocationRequestInput }
  | { status: "refused"; reasonCode: SessionBoardAllocationRefusalCode; message: string };

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

/**
 * Converts one Commander selection into one exact allocation request.
 *
 * Every proposal in the bound plan is always carried, so the server sees the
 * complete set and an explicit treatment for each member: what was chosen is
 * `selected`, what the plan already rejected stays `rejected`, and everything
 * else is `deferred` rather than absent. An identifier the plan does not contain
 * — including any synthetic Demo proposal id — is refused here and never reaches
 * the transport.
 */
export function buildSessionBoardAllocationInput(input: {
  binding: AuthoritativeSessionBoardBinding;
  selectedProposalIds: readonly string[];
  baseline: { revision: number; stateDigest: string };
  decidedAt: string;
}): SessionBoardAllocationInputResult {
  const { binding, baseline, decidedAt } = input;
  const plan = binding.plan;

  if (!ISO_TIMESTAMP_PATTERN.test(decidedAt) || !Number.isFinite(Date.parse(decidedAt))) {
    return {
      status: "refused",
      reasonCode: "INVALID_DECISION_TIME",
      message: "The Commander decision time is not a usable ISO-8601 instant. No allocation command was prepared.",
    };
  }
  if (plan.decisionExpiresAt !== null && Date.parse(plan.decisionExpiresAt) <= Date.parse(decidedAt)) {
    return {
      status: "refused",
      reasonCode: "DECISION_EXPIRED",
      message: `The bound Commander decision expired at ${plan.decisionExpiresAt}. No allocation command was prepared; a fresh decision is required.`,
    };
  }
  if (!Number.isSafeInteger(baseline.revision) || baseline.revision < 1 || !DIGEST_PATTERN.test(baseline.stateDigest)) {
    return {
      status: "refused",
      reasonCode: "INVALID_BASELINE",
      message: "No loaded authoritative revision and state digest are available. The allocation failed closed and no local candidate was used.",
    };
  }
  if (baseline.revision !== binding.baseline.revision || baseline.stateDigest !== binding.baseline.stateDigest) {
    return {
      status: "refused",
      reasonCode: "BASELINE_MISMATCH",
      message: `The displayed Session Board was built at revision ${binding.baseline.revision} but the current authoritative baseline is revision ${baseline.revision}. Review the refreshed board before authorizing.`,
    };
  }
  // A plan that pinned the reviewed baseline is executable only against that
  // exact baseline. This is a second, independent stop from the display check
  // above: it catches a plan reviewed against a different revision entirely,
  // not merely a board that went stale while it was open.
  if ((plan.expectedRevision !== null && plan.expectedRevision !== baseline.revision)
    || (plan.expectedStateDigest !== null && plan.expectedStateDigest !== baseline.stateDigest)) {
    return {
      status: "refused",
      reasonCode: "PLAN_BASELINE_MISMATCH",
      message: `Plan ${plan.planId} r${plan.planRevision} is bound to authoritative revision ${plan.expectedRevision ?? "(any)"} and digest ${plan.expectedStateDigest ?? "(any)"}, which is not the current baseline revision ${baseline.revision}. No allocation command was prepared.`,
    };
  }

  const known = new Map(binding.proposals.map((proposal) => [proposal.proposalId, proposal]));
  const selectedIds: string[] = [];
  for (const candidate of input.selectedProposalIds) {
    const proposal = known.get(candidate);
    if (!proposal) {
      return {
        status: "refused",
        reasonCode: "UNKNOWN_PROPOSAL_ID",
        message: `Proposal ${candidate} is not part of the approved ${plan.planId} revision ${plan.planRevision} set. No allocation command was prepared.`,
      };
    }
    if (proposal.treatment === "rejected") {
      return {
        status: "refused",
        reasonCode: "REJECTED_PROPOSAL_SELECTED",
        message: `Proposal ${candidate} was rejected in ${plan.planId} r${plan.planRevision}. A rejected proposal is a recorded decision and cannot be authorized from the board.`,
      };
    }
    if (!selectedIds.includes(candidate)) selectedIds.push(candidate);
  }
  if (selectedIds.length === 0) {
    return {
      status: "refused",
      reasonCode: "EMPTY_SELECTION",
      message: "Select at least one proposal. An empty selection is not a Commander allocation decision and is never dispatched.",
    };
  }

  const selectedSet = new Set(selectedIds);
  const rejectedIds = binding.proposals
    .filter((proposal) => proposal.treatment === "rejected")
    .map((proposal) => proposal.proposalId);
  const deferredIds = binding.proposals
    .filter((proposal) => proposal.treatment !== "rejected" && !selectedSet.has(proposal.proposalId))
    .map((proposal) => proposal.proposalId);

  const proposals: SessionWorkPlanProposal[] = binding.proposals.map((proposal) => ({
    proposalId: proposal.proposalId,
    treatment: selectedSet.has(proposal.proposalId)
      ? "selected"
      : proposal.treatment === "rejected" ? "rejected" : "deferred",
    target: proposal.target,
  }));

  const prepared: SessionBoardAllocationRequestInput = {
    plan: {
      planId: plan.planId,
      planRevision: plan.planRevision,
      planDigest: plan.planDigest,
    },
    decision: {
      decisionId: `${plan.decisionIdPrefix}${decidedAt}`,
      decidingAuthority: "Commander",
      decidedAt,
      expiresAt: plan.decisionExpiresAt,
      verbatimSelection: `Authorize ${plan.planId} r${plan.planRevision}: ${sorted(selectedIds).join(", ")}.`,
    },
    envelope: {
      envelopeId: plan.envelopeId,
      campaignId: binding.campaignId,
      missionId: binding.missionId,
    },
    selection: { selected: sorted(selectedIds), deferred: sorted(deferredIds), rejected: sorted(rejectedIds) },
    proposals,
    baseline: { revision: baseline.revision, stateDigest: baseline.stateDigest },
  };

  return {
    status: "ready",
    input: plan.idempotencyKey === null ? prepared : { ...prepared, idempotencyKey: plan.idempotencyKey },
  };
}

/* -------------------------------------------------------------------------- */
/* Receipt-derived projection and reconciliation                               */
/* -------------------------------------------------------------------------- */

function joinValues(values: readonly (string | null)[]): string {
  return values.filter((value): value is string => typeof value === "string" && value.length > 0).join(" · ");
}

function allocatedRecords(receipt: SessionWorkPlanAllocationReceipt): SessionWorkPlanAllocatedRecord[] {
  return [...receipt.created, ...receipt.linked];
}

/**
 * Reads the predecessor edges off one allocated record without assuming the
 * field is there.
 *
 * A receipt produced before the predecessor sub-contract legitimately carries no
 * `predecessors`, and a receipt is a value that crossed a transport boundary.
 * Absent means "no declared edge", which is exactly the honest empty
 * representation — it never means "unknown, so assume something".
 */
function receiptPredecessorsOf(record: SessionWorkPlanAllocatedRecord): SessionWorkPlanPredecessorBinding[] {
  const declared: unknown = (record as { predecessors?: unknown }).predecessors;
  return Array.isArray(declared) ? declared as SessionWorkPlanPredecessorBinding[] : [];
}

/**
 * Projects one verified receipt into the accepted result presentation.
 *
 * The only two inputs are the receipt whose digests the client already proved
 * reproduce, and the authoritative re-read that reconciled against it. Nothing is
 * composed from the request, the fixture, or the display.
 *
 * Correction SARGE-P04-FORGE-RECEIPT-PROJECTION-004: the transport `outcome` and
 * `reasonCode` used to be interpolated here. They are not receipt-bound —
 * `reasonCode` in particular is a transport field the receipt never carries — so
 * presenting them inside `result` contradicted the receipt-only claim. Both now
 * stay outside `result`, on the settled outcome and in `authority.message`, and
 * the outcome line below is derived from `receipt.outcome` and `receipt.replayed`,
 * which the receipt does bind.
 */
export function sessionBoardOutcomeFromReceipt(input: {
  receipt: SessionWorkPlanAllocationReceipt;
  reloaded: AuthoritativeSessionBoardRead;
}): SessionBoardOutcomeView {
  const { receipt, reloaded } = input;
  const records = allocatedRecords(receipt);
  const reloadedDigest = reloaded.stateDigest ?? "digest unavailable";

  const progress = [
    `Receipt outcome ${receipt.outcome} · replayed ${receipt.replayed}`,
    `Authoritative revision ${receipt.before.revision} → ${receipt.result.revision}`,
    `Created ${receipt.created.length} · linked ${receipt.linked.length} · unallocated ${receipt.unallocatedProposalIds.length}`,
    ...records.map((record) => {
      const predecessors = receiptPredecessorsOf(record);
      const dependency = predecessors.length === 0
        ? " · no declared predecessor"
        : ` · predecessors ${predecessors.map((binding) => `${binding.predecessorActionId} (${binding.relation})`).join(", ")}`;
      return `${record.proposalId} ${record.disposition} ${record.recordType} ${record.opaqueRecordId} · code ${record.stableCode ?? "unavailable"} (${record.stableCodeState}) · record revision ${record.recordRevision}${dependency}`;
    }),
  ];

  const verification = [
    `Receipt ${receipt.receiptId} · identifier ontology ${receipt.identifierOntology}`,
    `Receipt core digest ${receipt.receiptCoreDigest}`,
    `Receipt digest ${receipt.receiptDigest}`,
    `Request binding digest ${receipt.requestBindingDigest}`,
    `Idempotency identity ${receipt.idempotencyKey}`,
    `Plan ${receipt.plan.planId} r${receipt.plan.planRevision} · ${receipt.plan.planDigest}`,
    `Envelope ${receipt.envelope.envelopeId} · decision ${receipt.decision.decisionId}`,
    `Numbering ${receipt.numbering.basis} · reuse ${receipt.numbering.numberReusePolicy} · client-supplied identifier accepted ${receipt.numbering.clientSuppliedIdentifierAccepted}`,
    receipt.predecessorContract
      ? `Predecessor contract ${receipt.predecessorContract.contractVersion} · ${receipt.predecessorContract.relationScope} · distinct from the follow-up relation ${receipt.predecessorContract.distinctFromFollowUpRelation} · ${records.reduce((total, record) => total + receiptPredecessorsOf(record).length, 0)} edges bound`
      : "This receipt predates the typed predecessor sub-contract and declares no dependency edge.",
    `Automatic retry scheduled ${receipt.automaticRetryScheduled} · replayed ${receipt.replayed}`,
    `Result state digest ${receipt.result.stateDigest ?? "not redispatched on replay"} (${receipt.result.stateDigestSource})`,
    receipt.audit
      ? `Audit ${receipt.audit.kind} sequence ${receipt.audit.sequence} · ${receipt.audit.eventId}`
      : "No audit event was recorded for this outcome.",
    `Authoritative re-read reconciled at revision ${reloaded.revision} · ${reloadedDigest}`,
  ];

  const blockers = [
    receipt.unallocatedProposalIds.length > 0
      ? `Deferred and not allocated: ${receipt.unallocatedProposalIds.join(", ")}`
      : "No proposal was deferred in this transaction.",
    ...records
      .filter((record) => !record.git.available)
      .map((record) => `Git identity unavailable for ${record.proposalId}: ${record.git.reasonCode ?? "unspecified"}`),
  ];

  return {
    receiptIdentity: receipt.receiptId,
    fullOpaqueIdentity: joinValues(records.map((record) => record.opaqueRecordId)),
    machineOpaqueIdentity: joinValues(records.map((record) => shortId(record.opaqueRecordId))),
    receiptBranch: joinValues(records.map((record) => record.git.branch)),
    receiptWorktree: joinValues(records.map((record) => record.git.worktree)),
    progress,
    verification,
    blockers,
    freshness: `Authoritative re-read at revision ${reloaded.revision} · ${reloadedDigest}, reconciled against the verified receipt.`,
    nextGate: "Independent FIREWATCH verification, then the protected Commander acceptance and governed close gate. This allocation performed no lifecycle transition, approval, or deployment.",
  };
}

export type SessionBoardReconciliation =
  | { status: "reconciled" }
  | { status: "mismatch"; message: string };

/**
 * A terminal receipt is a claim, not a result.
 *
 * Applied, replayed, and no-effect outcomes are each accepted only after the
 * authoritative store is re-read and agrees with the receipt. A replay is
 * checked more loosely on revision alone and not on digest, because the original
 * transaction was not redispatched and the store has legitimately moved on since
 * it applied; it is still required to contain every record the receipt names.
 */
export function reconcileSessionBoardAllocation(input: {
  receipt: SessionWorkPlanAllocationReceipt;
  dispatchRevision: number | null;
  dispatchStateDigest: string | null;
  reloaded: AuthoritativeSessionBoardRead;
}): SessionBoardReconciliation {
  const { receipt, reloaded } = input;
  if (reloaded.availability !== "loaded" || !reloaded.state || typeof reloaded.stateDigest !== "string") {
    return {
      status: "mismatch",
      message: "The allocation returned a terminal receipt but authoritative state could not be re-read. Reconcile the exact retained command before issuing another command.",
    };
  }
  const reloadedState = reloaded.state;

  if (receipt.replayed) {
    if (reloaded.revision < receipt.result.revision) {
      return {
        status: "mismatch",
        message: `The replayed receipt records revision ${receipt.result.revision} but the authoritative store re-read as revision ${reloaded.revision}.`,
      };
    }
  } else {
    if (reloaded.revision !== receipt.result.revision) {
      return {
        status: "mismatch",
        message: `The receipt records revision ${receipt.result.revision} but the authoritative store re-read as revision ${reloaded.revision}.`,
      };
    }
    if (receipt.result.stateDigest === null || receipt.result.stateDigest !== reloaded.stateDigest) {
      return {
        status: "mismatch",
        message: "The receipt state digest does not match the authoritative re-read. The result was not presented as successful.",
      };
    }
    if (input.dispatchRevision !== null && input.dispatchRevision !== reloaded.revision) {
      return {
        status: "mismatch",
        message: `The hosted response reported revision ${input.dispatchRevision} but the authoritative re-read is revision ${reloaded.revision}.`,
      };
    }
    if (input.dispatchStateDigest !== null && input.dispatchStateDigest !== reloaded.stateDigest) {
      return {
        status: "mismatch",
        message: "The hosted response state digest does not match the authoritative re-read.",
      };
    }
  }

  for (const record of allocatedRecords(receipt)) {
    const present = record.recordType === "mission"
      ? reloadedState.missions.find((candidate) => candidate.id === record.opaqueRecordId)
      : reloadedState.actions.find((candidate) => candidate.id === record.opaqueRecordId);
    if (!present) {
      return {
        status: "mismatch",
        message: `The receipt names ${record.recordType} ${record.opaqueRecordId}, which the authoritative re-read does not contain.`,
      };
    }
    if (!receipt.replayed && present.revision !== record.recordRevision) {
      return {
        status: "mismatch",
        message: `Record ${record.opaqueRecordId} re-read at revision ${present.revision}, not the receipted revision ${record.recordRevision}.`,
      };
    }
    // A receipt that claims dependency edges is only accepted once the store is
    // seen to hold exactly those edges, in that order. A durable relationship
    // that exists solely inside a receipt is a claim, not a relationship.
    //
    // FW-P04-FU01-002: the comparison used to be skipped whenever the receipted
    // list was empty, so a created Action the receipt says has no dependency
    // could reconcile against a store holding one. The exact set is now compared
    // for every receipted Action, the empty set included, and a relation that
    // cannot be read exactly fails closed instead of being normalized away.
    if (record.recordType === "action") {
      const stored = readActionPredecessorIds((present as Action).predecessorActionIds);
      if (stored.status === "malformed") {
        return {
          status: "mismatch",
          message: `Record ${record.opaqueRecordId} re-read with a predecessor relation that cannot be read exactly (${stored.problem}): ${stored.detail}`,
        };
      }
      // `created` carries the record's complete edge set, because this
      // transaction wrote it. `linked` is documented as always empty precisely
      // because a linked record is bound exactly as it stands and this
      // transaction neither reads nor writes an edge on it — so for a linked
      // record the receipt asserts no set, and inventing one to compare against
      // would manufacture a mismatch out of a pre-existing dependency the
      // Commander never asked this transaction to touch. Readability above is
      // still required for both.
      const receipted = receiptPredecessorsOf(record).map((binding) => binding.predecessorActionId);
      const claimsExactSet = record.disposition === "created" || receipted.length > 0;
      const exact = stored.predecessorActionIds;
      if (claimsExactSet
        && (exact.length !== receipted.length || exact.some((value, index) => value !== receipted[index]))) {
        return {
          status: "mismatch",
          message: `Record ${record.opaqueRecordId} re-read with predecessors [${exact.join(", ")}], not the receipted [${receipted.join(", ")}].`,
        };
      }
    }
  }

  return { status: "reconciled" };
}

/* -------------------------------------------------------------------------- */
/* Authority prop contract consumed by the Session Board                       */
/* -------------------------------------------------------------------------- */

export type SessionBoardAuthorityStatus = "ready" | "submitting" | "unknown" | "applied" | "rejected";

/**
 * The exact authority contract the accepted Session Board consumes.
 *
 * `onReconcile` is present only while an unknown command is retained, so the
 * board cannot render a reconciliation control in any other state, and no state
 * offers a retry.
 */
export interface SessionBoardAuthorityContract {
  status: SessionBoardAuthorityStatus;
  message: string;
  result: SessionBoardOutcomeView | null;
  onAuthorize: (selectedProposalIds: string[]) => void;
  onReconcile?: () => void;
}

export interface SessionBoardBaselineIdentity {
  revision: number;
  stateDigest: string;
}

export interface SessionBoardAuthorityViewState {
  status: SessionBoardAuthorityStatus;
  message: string;
  result: SessionBoardOutcomeView | null;
  retained: boolean;
  /**
   * The exact authoritative baseline this state was decided against, or null when
   * it was not decided against one. It exists so a stop can be recognised as
   * stale when — and only when — authority genuinely moves.
   */
  baselineAtDecision: SessionBoardBaselineIdentity | null;
}

export const initialSessionBoardAuthorityViewState: SessionBoardAuthorityViewState = {
  status: "ready",
  message: "Select the proposals to authorize. One authorization dispatches exactly one governed allocation command bound to the displayed authoritative revision and digest.",
  result: null,
  retained: false,
  baselineAtDecision: null,
};

function sameBaseline(
  left: SessionBoardBaselineIdentity | null,
  right: SessionBoardBaselineIdentity | null,
): boolean {
  if (left === null || right === null) return left === right;
  return left.revision === right.revision && left.stateDigest === right.stateDigest;
}

/**
 * Correction SARGE-P04-FORGE-REJECTED-RECOVERY-003.
 *
 * A known no-mutation rejection is safe and recoverable, but it used to persist
 * for the life of the single-page session because nothing ever restored `ready`.
 * A rejection is cleared only when authority has genuinely moved past the exact
 * baseline the stop was decided against.
 *
 * Freshness is deliberately strict: an authoritative re-read that returns the
 * same revision *and* the same digest is not fresh and clears nothing, because
 * the condition that produced the stop demonstrably still holds.
 *
 * `unknown` is never reset by this path under any baseline movement. A retained
 * command stays retained until it is explicitly reconciled, and so does its
 * block; the same applies while a command is in flight.
 */
export function sessionBoardAuthorityViewAfterBaseline(input: {
  view: SessionBoardAuthorityViewState;
  baseline: SessionBoardBaselineIdentity | null;
  commandInFlight: boolean;
}): SessionBoardAuthorityViewState {
  const { view } = input;
  if (view.status !== "rejected") return view;
  if (view.retained || input.commandInFlight) return view;
  if (sameBaseline(view.baselineAtDecision, input.baseline)) return view;
  return {
    ...initialSessionBoardAuthorityViewState,
    baselineAtDecision: input.baseline,
  };
}

export type AuthoritativeWriteBlockReason = "hosted_command_unknown" | "allocation_command_unknown";

export type PermittedExactReconciliation = "none" | "hosted_exact_command" | "allocation_exact_command";

export interface AuthoritativeWriteGate {
  blocked: boolean;
  reason: AuthoritativeWriteBlockReason | null;
  message: string | null;
  permittedReconciliation: PermittedExactReconciliation;
}

/**
 * Correction SARGE-P04-FORGE-UNKNOWN-GLOBAL-WRITE-BLOCK-001.
 *
 * One gate for every authoritative mutation in the application.
 *
 * Two independent unknown-outcome sources exist — the hosted repository's
 * retained pending command and the Session Board's retained allocation command —
 * and every authoritative writer previously consulted only the first. A retained
 * allocation therefore blocked the Session Board while leaving record commands,
 * the Decision Inbox, Tier 1 direct closure, governed closure, local-model
 * proposals, import, and recovery free to advance the revision underneath it.
 *
 * Either source now blocks every authoritative mutation, and exactly one exact
 * reconciliation stays available: the one matching the source actually retained.
 * The hosted source takes precedence because it is durable and is resolved
 * through its own step-up path; the allocation block is memory-only under the
 * accepted G1 residual. Nothing here ever offers a retry.
 */
export function authoritativeWriteGate(input: {
  hostedUnknownCommand: boolean;
  retainedAllocationUnknown: boolean;
}): AuthoritativeWriteGate {
  if (input.hostedUnknownCommand) {
    return {
      blocked: true,
      reason: "hosted_command_unknown",
      message: "A hosted-state command has an unknown outcome. Use Reconcile exact command before issuing another command.",
      permittedReconciliation: "hosted_exact_command",
    };
  }
  if (input.retainedAllocationUnknown) {
    return {
      blocked: true,
      reason: "allocation_command_unknown",
      message: "A Session Board allocation command has an unknown outcome. Reconcile that exact command before issuing any other authoritative command. No retry was scheduled and no replacement identity was issued.",
      permittedReconciliation: "allocation_exact_command",
    };
  }
  return { blocked: false, reason: null, message: null, permittedReconciliation: "none" };
}

export interface SessionBoardAuthorityGate {
  authenticatedLiveCommander: boolean;
  reviewMode: boolean;
  hostedAvailability: string;
  hostedUnknownCommand: boolean;
  controlBusy: boolean;
  retainedAllocationUnknown: boolean;
  authoritativeBindingBound: boolean;
}

/**
 * Criterion 4, stated once and enforced twice: the App renders the authority
 * status only for an authenticated live session, and the callback itself
 * re-evaluates this gate at the click boundary before anything is prepared.
 */
export function sessionBoardAuthorityDispatchPermitted(gate: SessionBoardAuthorityGate): boolean {
  return gate.authenticatedLiveCommander
    && !gate.reviewMode
    && gate.hostedAvailability === "loaded"
    && !gate.hostedUnknownCommand
    && !gate.controlBusy
    && !gate.retainedAllocationUnknown
    && gate.authoritativeBindingBound;
}

/** Exact reconciliation is offered only while an unknown command is retained. */
export function sessionBoardReconcilePermitted(gate: SessionBoardAuthorityGate): boolean {
  return gate.authenticatedLiveCommander
    && !gate.reviewMode
    && gate.hostedAvailability === "loaded"
    && !gate.hostedUnknownCommand
    && !gate.controlBusy
    && gate.retainedAllocationUnknown;
}

function nonEmptyMessage(status: SessionBoardAuthorityStatus, message: string): string {
  if (message.trim().length > 0) return message;
  if (status === "submitting") return "The governed allocation command is in flight. No second command may be prepared until it settles.";
  if (status === "unknown") return "The allocation outcome is unknown. The exact command is retained under its original idempotency identity; reconcile it explicitly. No retry was scheduled and no replacement key was issued.";
  if (status === "applied") return "The allocation was applied and reconciled against the authoritative re-read.";
  if (status === "rejected") return "The allocation stopped before any state change.";
  return initialSessionBoardAuthorityViewState.message;
}

/**
 * Builds the exact prop object the Session Board receives. `message` is always
 * nonempty, `result` is receipt-derived or null, and `onReconcile` is absent
 * unless an unknown command is retained.
 */
export function buildSessionBoardAuthority(input: {
  view: SessionBoardAuthorityViewState;
  gate: SessionBoardAuthorityGate;
  onAuthorize: (selectedProposalIds: string[]) => void;
  onReconcile: () => void;
}): SessionBoardAuthorityContract {
  const status: SessionBoardAuthorityStatus = input.view.status === "ready" && !sessionBoardAuthorityDispatchPermitted(input.gate)
    ? "rejected"
    : input.view.status;
  const message = status === "rejected" && input.view.status === "ready"
    ? "Authorization is unavailable in this state. It requires the authenticated live Commander, loaded hosted authority, an authoritative Session Board binding, no Review Mode, no busy control, and no retained unknown command."
    : nonEmptyMessage(status, input.view.message);
  const contract: SessionBoardAuthorityContract = {
    status,
    message,
    result: status === "applied" ? input.view.result : null,
    onAuthorize: input.onAuthorize,
  };
  return sessionBoardReconcilePermitted(input.gate)
    ? { ...contract, onReconcile: input.onReconcile }
    : contract;
}

/* -------------------------------------------------------------------------- */
/* Controller                                                                  */
/* -------------------------------------------------------------------------- */

export interface SessionBoardAllocationOutcome {
  status: "applied" | "rejected" | "unknown" | "refused";
  reasonCode: string;
  message: string;
  retained: boolean;
  receipt: SessionWorkPlanAllocationReceipt | null;
  result: SessionBoardOutcomeView | null;
  reloaded: AuthoritativeSessionBoardRead | null;
  /**
   * The exact authoritative baseline this attempt was decided against, so a stop
   * can later be recognised as stale when authority genuinely moves.
   */
  baseline: SessionBoardBaselineIdentity | null;
}

export function sessionBoardAuthorityViewStateFrom(
  outcome: SessionBoardAllocationOutcome,
): SessionBoardAuthorityViewState {
  const status: SessionBoardAuthorityStatus = outcome.status === "applied"
    ? "applied"
    : outcome.status === "unknown" ? "unknown" : "rejected";
  return {
    status,
    message: nonEmptyMessage(status, outcome.message),
    result: outcome.status === "applied" ? outcome.result : null,
    retained: outcome.retained,
    baselineAtDecision: outcome.baseline,
  };
}

/**
 * Correction 003-known-rejection-fresh-baseline-recovery.
 *
 * The settled view, already re-evaluated against the baseline the board is
 * *currently* displaying.
 *
 * The first attempt at finding 003 made recovery reactive to baseline changes
 * only, which left one ordering permanently stuck: authorize against B1, adopt a
 * genuinely fresh B2 while that command is submitting, then settle B1 as a known
 * no-mutation rejection. The recovery rule correctly declined to reset while the
 * command was in flight, and by the time the rejection was installed the
 * displayed baseline had already finished moving — so a baseline-change trigger
 * never fired again and the board stayed rejected while showing fresh authority.
 *
 * Settlement is therefore its own trigger. This runs once the controller promise
 * has resolved and its latch has been released, so `commandInFlight` is false for
 * the command that just settled and the only in-flight state it can observe is a
 * genuinely different command.
 *
 * Every preserved invariant belongs to `sessionBoardAuthorityViewAfterBaseline`
 * and is unchanged: an identical baseline never clears a rejection, and unknown,
 * retained, and in-flight states are never reset.
 */
export function sessionBoardAuthorityViewAfterSettlement(input: {
  outcome: SessionBoardAllocationOutcome;
  displayedBaseline: SessionBoardBaselineIdentity | null;
  commandInFlight: boolean;
}): SessionBoardAuthorityViewState {
  return sessionBoardAuthorityViewAfterBaseline({
    view: sessionBoardAuthorityViewStateFrom(input.outcome),
    baseline: input.displayedBaseline,
    commandInFlight: input.commandInFlight,
  });
}

/**
 * Positive, explicit classification of the client's dispatch union.
 *
 * `SessionWorkPlanAllocationDispatchResult` discriminates on `outcome`, but each
 * constituent carries a *union* of literals there. A negative test —
 * `outcome !== "rejected" && outcome !== "denied" && outcome !== "unavailable"` —
 * therefore only refines the literal type inside each constituent and never
 * removes one, so the stopped constituent survives and `receipt`, `revision`, and
 * `stateDigest` remain inaccessible. Narrowing must run in the positive
 * direction, which keeps only the constituents whose discriminant is comparable
 * to the tested literal.
 *
 * Both helpers return the narrowed value or `null` rather than acting as `is`
 * predicates, so the call site works with a plain non-union value and depends on
 * no narrowing of its own. Do not "simplify" either of these back into a
 * negative test at the call site.
 */
function stoppedAllocationDispatch(result: SessionWorkPlanAllocationDispatchResult) {
  if (result.outcome === "rejected" || result.outcome === "denied" || result.outcome === "unavailable") {
    return result;
  }
  return null;
}

function terminalAllocationDispatch(result: SessionWorkPlanAllocationDispatchResult) {
  if (result.outcome === "applied" || result.outcome === "replayed" || result.outcome === "no_effect") {
    return result;
  }
  return null;
}

/**
 * One Commander selection, one governed transaction.
 *
 * The controller owns the retention store it shares with the client, which is
 * what lets a *post-write* reconciliation failure re-retain the exact original
 * command. Without that, an unverifiable success would silently release the
 * block and permit a second, differently-keyed write against an unknown state.
 */
export class SessionBoardAllocationController {
  /**
   * Correction SARGE-P04-FORGE-INFLIGHT-LATCH-002.
   *
   * A plain synchronous boolean, deliberately not React state and deliberately
   * not derived from the retention store. Both alternatives are asynchronous
   * relative to a click: React re-renders a frame later, and the retention store
   * is only populated *after* a dispatch fails. Between two clicks in the same
   * tick, neither has changed yet, so two authorizations could each build their
   * own decision, request binding, and idempotency identity and both reach the
   * transport. A synchronous latch closes that window in the only place it can be
   * closed — before preparation, inside the single writer.
   */
  private commandLatched = false;

  constructor(
    private readonly client: SessionWorkPlanAllocationClient,
    private readonly retention: RetainedSessionWorkPlanAllocationStore,
    private readonly reload: () => Promise<AuthoritativeSessionBoardRead>,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async retainedUnknownCommand(): Promise<boolean> {
    return await this.retention.load() !== null;
  }

  /** Synchronous, so a caller can read it inside an effect without awaiting. */
  commandInFlight(): boolean {
    return this.commandLatched;
  }

  /**
   * Test-and-set with no `await` between the test and the set, which is what
   * makes it a latch rather than a hint. An `async` method body runs
   * synchronously up to its first `await`, so this executes to completion before
   * a second caller in the same tick can enter.
   */
  private acquire(): boolean {
    if (this.commandLatched) return false;
    this.commandLatched = true;
    return true;
  }

  private release(): void {
    this.commandLatched = false;
  }

  private async refused(
    reasonCode: SessionBoardAllocationRefusalCode,
    message: string,
    baseline: SessionBoardBaselineIdentity | null,
  ): Promise<SessionBoardAllocationOutcome> {
    return {
      status: "refused",
      reasonCode,
      message,
      retained: await this.retainedUnknownCommand(),
      receipt: null,
      result: null,
      reloaded: null,
      baseline,
    };
  }

  async authorize(input: {
    binding: AuthoritativeSessionBoardBinding;
    selectedProposalIds: readonly string[];
    baseline: { revision: number; stateDigest: string };
  }): Promise<SessionBoardAllocationOutcome> {
    if (!this.acquire()) {
      return this.refused(
        "COMMAND_IN_FLIGHT",
        "A Session Board allocation command is already in flight. No second decision, request binding, or idempotency identity was created, and nothing was dispatched.",
        input.baseline,
      );
    }
    try {
      // FW-P04-FU01-001: the immutable plan is proved to be the reviewed plan
      // before a decision, a request binding, or an idempotency identity is
      // created — so a plan altered after review produces a stop and no command
      // rather than a governed mutation carrying the reviewed digest.
      const integrity = await verifySessionBoardPlanContent(input.binding.plan);
      if (integrity.status === "mismatch") {
        return await this.refused("PLAN_CONTENT_DIGEST_MISMATCH", integrity.message, input.baseline);
      }

      const prepared = buildSessionBoardAllocationInput({
        binding: input.binding,
        selectedProposalIds: input.selectedProposalIds,
        baseline: input.baseline,
        decidedAt: this.now(),
      });
      if (prepared.status === "refused") {
        return await this.refused(prepared.reasonCode, prepared.message, input.baseline);
      }

      let request: SessionWorkPlanAllocationRequest;
      try {
        request = await this.client.prepare(prepared.input);
      } catch (reason) {
        return await this.refused(
          "PREPARATION_REFUSED",
          reason instanceof Error ? reason.message : "The allocation command could not be prepared.",
          input.baseline,
        );
      }
      return await this.dispatchAndSettle(request, () => this.client.dispatch(request));
    } finally {
      this.release();
    }
  }

  /**
   * The only permitted continuation after an unknown outcome: the identical
   * command under its original identity, requested explicitly.
   */
  async reconcile(): Promise<SessionBoardAllocationOutcome> {
    if (!this.acquire()) {
      return this.refused(
        "COMMAND_IN_FLIGHT",
        "A Session Board allocation command is already in flight. The retained command was not redispatched.",
        null,
      );
    }
    try {
      const retained = await this.retention.load();
      if (!retained) {
        return await this.refused(
          "NO_RETAINED_COMMAND",
          "There is no retained Session Work Plan allocation command to reconcile.",
          null,
        );
      }
      return await this.dispatchAndSettle(retained.request, () => this.client.reconcileRetained());
    } finally {
      this.release();
    }
  }

  private async dispatchAndSettle(
    request: SessionWorkPlanAllocationRequest,
    send: () => Promise<SessionWorkPlanAllocationDispatchResult>,
  ): Promise<SessionBoardAllocationOutcome> {
    // The exact baseline this attempt was decided against, taken from the request
    // itself so it is identical for an authorization and for the reconciliation
    // of that same retained command.
    const baseline: SessionBoardBaselineIdentity = {
      revision: request.expectedRevision,
      stateDigest: request.expectedStateDigest,
    };

    let dispatched: SessionWorkPlanAllocationDispatchResult;
    try {
      dispatched = await send();
    } catch (reason) {
      if (reason instanceof SessionWorkPlanAllocationUnknownOutcomeError) {
        return this.unknown(request, reason.reasonCode, reason.message, baseline);
      }
      // A stop the client raised before the transport was reached leaves nothing
      // retained; anything else is treated as unknown and fails closed.
      const retained = await this.retainedUnknownCommand();
      const message = reason instanceof Error ? reason.message : "The allocation command could not be dispatched.";
      if (!retained) return this.refused("PREPARATION_REFUSED", message, baseline);
      return this.unknown(request, "DISPATCH_UNCLASSIFIED", message, baseline);
    }

    const stopped = stoppedAllocationDispatch(dispatched);
    if (stopped) {
      return {
        status: "rejected",
        reasonCode: stopped.reasonCode,
        message: `The allocation stopped before any state change: ${stopped.reasonCode}.${stopped.detail ? ` ${stopped.detail}` : ""} Re-read authoritative state and review the selection again.`,
        retained: await this.retainedUnknownCommand(),
        receipt: null,
        result: null,
        reloaded: null,
        baseline,
      };
    }

    const terminal = terminalAllocationDispatch(dispatched);
    if (!terminal) {
      // Unreachable through the verified client, which already raises an unknown
      // outcome for an unrecognised shape. It is classified as unknown rather
      // than as a clean stop because a result this controller cannot classify
      // must never be presented to the Commander as "nothing happened".
      return this.unknown(
        request,
        "UNRECOGNIZED_ALLOCATION_OUTCOME",
        "The allocation transport returned a result this controller cannot classify.",
        baseline,
      );
    }

    let reloaded: AuthoritativeSessionBoardRead;
    try {
      reloaded = await this.reload();
    } catch (reason) {
      return this.unknown(
        request,
        "RESULT_RECONCILIATION_UNAVAILABLE",
        reason instanceof Error
          ? `The allocation returned a terminal receipt but the authoritative re-read failed: ${reason.message}`
          : "The allocation returned a terminal receipt but the authoritative re-read failed.",
        baseline,
      );
    }

    const reconciliation = reconcileSessionBoardAllocation({
      receipt: terminal.receipt,
      dispatchRevision: terminal.revision,
      dispatchStateDigest: terminal.stateDigest,
      reloaded,
    });
    if (reconciliation.status === "mismatch") {
      return this.unknown(request, "RESULT_RECONCILIATION_MISMATCH", reconciliation.message, baseline);
    }

    return {
      status: "applied",
      reasonCode: terminal.reasonCode,
      // The transport outcome and reason belong in this message, which is
      // guidance, and not in `result`, which is receipt-derived only.
      message: `Allocation ${terminal.outcome} · ${terminal.reasonCode} · authoritative revision ${reloaded.revision} · receipt ${terminal.receipt.receiptId}. Unselected proposals were recorded as deferred and were not allocated.`,
      retained: await this.retainedUnknownCommand(),
      receipt: terminal.receipt,
      result: sessionBoardOutcomeFromReceipt({ receipt: terminal.receipt, reloaded }),
      reloaded,
      baseline,
    };
  }

  /**
   * Retains the exact original command under its original identity. The client
   * releases retention once it verifies a terminal receipt, so a later
   * reconciliation failure must put it back; re-retaining the identical command
   * is accepted by the store, while a different one is refused.
   */
  private async unknown(
    request: SessionWorkPlanAllocationRequest,
    reasonCode: string,
    message: string,
    baseline: SessionBoardBaselineIdentity,
  ): Promise<SessionBoardAllocationOutcome> {
    let retained = true;
    try {
      await this.retention.retain({ request, retainedAt: this.now() });
    } catch {
      retained = await this.retainedUnknownCommand();
    }
    return {
      status: "unknown",
      reasonCode,
      message: `${message} The exact command is retained under idempotency identity ${request.idempotencyKey}; no retry was scheduled and no replacement identity was issued.`,
      retained,
      receipt: null,
      result: null,
      reloaded: null,
      baseline,
    };
  }
}

/**
 * Builds the controller with a client that shares its retention store, so a
 * post-write reconciliation failure can block further writes in this session.
 */
export function createSessionBoardAllocationController(input: {
  reload: () => Promise<AuthoritativeSessionBoardRead>;
  transport?: SessionWorkPlanAllocationTransport;
  retention?: RetainedSessionWorkPlanAllocationStore;
  now?: () => string;
}): SessionBoardAllocationController {
  const retention = input.retention ?? new MemoryRetainedSessionWorkPlanAllocationStore();
  const client = new SessionWorkPlanAllocationClient(input.transport, retention);
  return new SessionBoardAllocationController(client, retention, input.reload, input.now);
}
