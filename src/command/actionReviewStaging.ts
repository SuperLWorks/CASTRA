/**
 * C001.M016 — "Stage for Commander Review" payload helper.
 *
 * This module is deliberately pure. It normalizes what a Commander typed into
 * the Action review form, canonicalizes it, digests it, and returns **exactly
 * one** `action.operational_context.update` command for the existing
 * application `execute` callback to submit.
 *
 * What this module is not:
 *
 * - It is **not** a mutation path. It never touches a repository, `/api/state`,
 *   `HostedStateRepository`, `fetch`, storage, or any React state. The single
 *   authoritative mutation path remains `execute` → `persistAndConfirm` →
 *   `HostedStateRepository`, which keeps the authenticated same-origin proof,
 *   CSRF handling, store-revision protection, request binding, idempotency
 *   retention, authoritative reread, rejection handling, and unknown-outcome
 *   reconciliation exactly where they already live.
 * - It is **not** an authority source. It never sets `commandAuthority`, and it
 *   cannot emit `record.approve`, `action.close`, `mission.close`,
 *   `record.reopen`, `action.follow_up.create`, or any other lifecycle command.
 *   `buildActionReviewStagingPlan` has one literal command type and no branch
 *   that can produce another.
 *
 * Revision binding note (read before changing this file): the domain contract in
 * `src/domain/types.ts` defines `action.operational_context.update` as
 * `{ type, actionId, context }`. It carries **no** `expectedRevision` field, and
 * adding one would be a domain-command change that is out of scope here. So the
 * reviewed Action revision is bound two ways instead:
 *
 * 1. it is part of the canonical payload that produces the displayed SHA-256
 *    digest, so a different revision is a visibly different digest; and
 * 2. `actionReviewStagingStillBound` re-checks the live Action id/revision at
 *    the submission boundary, so a drifted Action disables submission.
 *
 * The authoritative store-revision check itself stays in the hosted write path.
 */
import type {
  ActionAttentionState,
  ActionOperationalContext,
  CastraCommand,
  RecordStatus,
} from "../domain/types";

/** The one and only command type this module is permitted to emit. */
export const ACTION_REVIEW_STAGING_COMMAND_TYPE = "action.operational_context.update" as const;

/** Canonical payload contract marker; part of the digested bytes. */
export const ACTION_REVIEW_STAGING_CONTRACT = "castra.action-review-staging/1" as const;

/**
 * Evidence bounds. These mirror the readable evidence contract in
 * `src/domain/commands.ts` (`lifecycleEvidence`): at most 20 references, each at
 * most 240 characters. Over-contract input is rejected with a visible message;
 * nothing is silently truncated here or anywhere downstream of here.
 */
export const ACTION_REVIEW_EVIDENCE_LIMIT = 20;
export const ACTION_REVIEW_EVIDENCE_LENGTH_LIMIT = 240;

/**
 * Exact free-text boundaries enforced by `normalizeActionOperationalContext`
 * in `src/domain/openWork.ts`. The review helper rejects over-contract values
 * instead of digesting bytes the domain would silently shorten.
 */
export const ACTION_REVIEW_OWNER_LENGTH_LIMIT = 120;
export const ACTION_REVIEW_BLOCKER_LENGTH_LIMIT = 500;
export const ACTION_REVIEW_NEXT_GATE_LENGTH_LIMIT = 500;

/**
 * The attention states the domain actually supports today
 * (`ActionAttentionState` in `src/domain/types.ts`, schema revision 13). This
 * list is derived from that union and must never invent a state the domain
 * cannot store.
 */
export const ACTION_REVIEW_ATTENTION_STATES: readonly ActionAttentionState[] = [
  "normal",
  "commander_review",
  "ready_for_mission_closure",
  "reconciliation_required",
];

/** Plain Commander-facing labels for the domain attention states. */
export const ACTION_REVIEW_ATTENTION_LABELS: Record<ActionAttentionState, string> = {
  normal: "Normal work",
  commander_review: "Ready for Commander review",
  ready_for_mission_closure: "Ready for Mission closure",
  reconciliation_required: "Reconciliation required",
};

/**
 * Command types this control must never emit. Exported so a test can assert the
 * boundary directly instead of trusting a comment.
 */
export const ACTION_REVIEW_STAGING_FORBIDDEN_COMMAND_TYPES: readonly string[] = [
  "record.approve",
  "record.transition",
  "record.archive",
  "record.restore",
  "action.close",
  "mission.close",
  "record.reopen",
  "action.follow_up.create",
];

export type ActionOperationalContextUpdateCommand = Extract<
  CastraCommand,
  { type: "action.operational_context.update" }
>;

/**
 * The structural subset of an `Action` this helper reads. `Action` is assignable
 * to it, and a test can build one without constructing whole hosted state.
 */
export interface ActionReviewStagingSource {
  id: string;
  revision: number;
  status: RecordStatus;
  archivedAt: string | null;
  operationalContext?: ActionOperationalContext;
}

export interface ActionReviewStagingInput {
  actionId: string;
  /** The Action record revision the Commander reviewed. */
  expectedRevision: number;
  owner: string;
  blocker: string;
  nextGate: string;
  primaryEvidenceReference: string;
  evidenceReferences: string[];
  attentionState: ActionAttentionState;
}

export interface ActionReviewStagingPlan {
  actionId: string;
  expectedRevision: number;
  context: ActionOperationalContext;
  /** Exactly one command, for the existing `execute` callback. */
  command: ActionOperationalContextUpdateCommand;
  canonicalPayload: string;
  /** `sha256:<64 lowercase hex characters>`. */
  payloadDigest: string;
}

export interface ActionReviewStagingReview {
  /** True only when a complete, submittable plan was produced. */
  valid: boolean;
  /** Commander-facing validation messages. Empty when `valid` is true. */
  issues: string[];
  /** Non-blocking advisories, such as "this changes nothing". */
  advisories: string[];
  plan: ActionReviewStagingPlan | null;
}

/**
 * Eligibility mirrors what `applyCommandCore` accepts for
 * `action.operational_context.update`: an archived Action must be restored
 * first, and a completed Action is immutable until a governed Commander reopen.
 */
export function actionReviewStagingEligible(action: ActionReviewStagingSource): boolean {
  return !action.archivedAt && action.status !== "completed";
}

/** Why the control is hidden, in Commander-facing words. Null when eligible. */
export function actionReviewStagingUnavailableReason(
  action: ActionReviewStagingSource,
): string | null {
  if (action.archivedAt) return "Restore the Action before staging it for Commander review.";
  if (action.status === "completed") {
    return "Completed Actions are immutable. Use a governed Commander reopen or a follow-up Action.";
  }
  return null;
}

/** Form defaults, rebuilt from the Action's current operational context. */
export function actionReviewStagingDefaults(
  action: ActionReviewStagingSource,
): ActionReviewStagingInput {
  const context = action.operationalContext;
  const primary = context?.evidenceReference ?? "";
  const listed = context?.evidenceReferences ?? [];
  return {
    actionId: action.id,
    expectedRevision: action.revision,
    owner: context?.owner ?? "",
    blocker: context?.blocker ?? "",
    nextGate: context?.nextGate ?? "",
    primaryEvidenceReference: primary,
    evidenceReferences: normalizeActionReviewEvidence(primary, listed),
    attentionState: attentionStateOrDefault(context?.attentionState),
  };
}

function attentionStateOrDefault(value: unknown): ActionAttentionState {
  return ACTION_REVIEW_ATTENTION_STATES.includes(value as ActionAttentionState)
    ? (value as ActionAttentionState)
    : "normal";
}

/**
 * Trim, drop blanks, de-duplicate in stable first-seen order, and bind the
 * primary reference to position zero when one was supplied. Nothing is dropped
 * for exceeding a bound here — the bound is enforced as a validation issue so an
 * over-contract package is visible rather than silently shortened.
 */
export function normalizeActionReviewEvidence(
  primaryEvidenceReference: string,
  evidenceReferences: readonly string[],
): string[] {
  const ordered = [primaryEvidenceReference, ...evidenceReferences]
    .map((reference) => (typeof reference === "string" ? reference.trim() : ""))
    .filter((reference) => reference.length > 0);
  const seen = new Set<string>();
  const stable: string[] = [];
  for (const reference of ordered) {
    if (seen.has(reference)) continue;
    seen.add(reference);
    stable.push(reference);
  }
  return stable;
}

/**
 * Deterministic canonical JSON: object keys sorted by UTF-16 code unit, array
 * order preserved, `undefined` members omitted, no incidental whitespace. Two
 * inputs that normalize to the same values always produce identical bytes.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, member]) => member !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`).join(",")}}`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("A non-finite number cannot be canonicalized.");
    return JSON.stringify(value);
  }
  const serialized = JSON.stringify(value);
  return serialized === undefined ? "null" : serialized;
}

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotateRight(value: number, amount: number): number {
  return ((value >>> amount) | (value << (32 - amount))) >>> 0;
}

/**
 * FIPS 180-4 SHA-256 over the UTF-8 bytes of `text`, returned as 64 lowercase
 * hex characters.
 *
 * This is a small, synchronous, dependency-free implementation on purpose. The
 * review digest must be computable and displayable during a plain render, must
 * be identical in the browser and in a test runner, and must not depend on an
 * asynchronous Web Crypto call or on the hosted-state digest helpers, which
 * belong to the hosted write path and are not a review-form concern. It is used
 * only to show the Commander what is about to be submitted; it is not a
 * substitute for the hosted request-binding digest.
 */
export function actionReviewSha256Hex(text: string): string {
  if (typeof TextEncoder !== "function") {
    throw new Error("No UTF-8 encoder is available in this runtime, so the payload digest cannot be computed.");
  }
  const bytes = new TextEncoder().encode(text);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const block = new Uint8Array(paddedLength);
  block.set(bytes);
  block[bytes.length] = 0x80;
  for (let index = 0; index < 8; index += 1) {
    block[paddedLength - 1 - index] = Math.floor(bitLength / 2 ** (8 * index)) & 0xff;
  }

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const position = offset + index * 4;
      schedule[index] = (
        (block[position] << 24)
        | (block[position + 1] << 16)
        | (block[position + 2] << 8)
        | block[position + 3]
      ) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const previous = schedule[index - 15];
      const ahead = schedule[index - 2];
      const s0 = (rotateRight(previous, 7) ^ rotateRight(previous, 18) ^ (previous >>> 3)) >>> 0;
      const s1 = (rotateRight(ahead, 17) ^ rotateRight(ahead, 19) ^ (ahead >>> 10)) >>> 0;
      schedule[index] = (schedule[index - 16] + s0 + schedule[index - 7] + s1) >>> 0;
    }

    let a = hash[0];
    let b = hash[1];
    let c = hash[2];
    let d = hash[3];
    let e = hash[4];
    let f = hash[5];
    let g = hash[6];
    let h = hash[7];

    for (let index = 0; index < 64; index += 1) {
      const s1 = (rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)) >>> 0;
      const choose = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + choose + SHA256_ROUND_CONSTANTS[index] + schedule[index]) >>> 0;
      const s0 = (rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)) >>> 0;
      const majority = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return Array.from(hash, (word) => word.toString(16).padStart(8, "0")).join("");
}

/**
 * The exact bytes that are digested and displayed. The reviewed Action id and
 * revision are inside the digest, so a stale review can never look like a fresh
 * one.
 */
export function canonicalActionReviewPayload(input: {
  actionId: string;
  expectedRevision: number;
  context: ActionOperationalContext;
}): string {
  return canonicalJson({
    contract: ACTION_REVIEW_STAGING_CONTRACT,
    commandType: ACTION_REVIEW_STAGING_COMMAND_TYPE,
    actionId: input.actionId,
    expectedRevision: input.expectedRevision,
    owner: input.context.owner,
    blocker: input.context.blocker,
    nextGate: input.context.nextGate,
    evidenceReference: input.context.evidenceReference,
    evidenceReferences: input.context.evidenceReferences ?? [],
    attentionState: input.context.attentionState,
  });
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Normalize, validate, canonicalize, digest, and build the single command.
 * Returns issues instead of throwing so the form can disable submission and
 * show every problem at once.
 */
export function buildActionReviewStagingPlan(
  input: ActionReviewStagingInput,
  current?: ActionOperationalContext,
): ActionReviewStagingReview {
  const issues: string[] = [];
  const advisories: string[] = [];

  const actionId = trimmed(input.actionId);
  if (!actionId) issues.push("Select an Action before preparing a review payload.");

  const expectedRevision = input.expectedRevision;
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    issues.push("The reviewed Action revision must be a positive whole number.");
  }

  const owner = trimmed(input.owner);
  if (!owner) issues.push("Enter the operational owner.");
  if (owner.length > ACTION_REVIEW_OWNER_LENGTH_LIMIT) {
    issues.push(`The operational owner must be ${ACTION_REVIEW_OWNER_LENGTH_LIMIT} characters or fewer.`);
  }

  const nextGate = trimmed(input.nextGate);
  if (!nextGate) issues.push("Enter the next gate.");
  if (nextGate.length > ACTION_REVIEW_NEXT_GATE_LENGTH_LIMIT) {
    issues.push(`The next gate must be ${ACTION_REVIEW_NEXT_GATE_LENGTH_LIMIT} characters or fewer.`);
  }

  const blocker = trimmed(input.blocker);
  if (blocker.length > ACTION_REVIEW_BLOCKER_LENGTH_LIMIT) {
    issues.push(`The blocker must be ${ACTION_REVIEW_BLOCKER_LENGTH_LIMIT} characters or fewer.`);
  }

  const attentionState = ACTION_REVIEW_ATTENTION_STATES.includes(input.attentionState)
    ? input.attentionState
    : null;
  if (!attentionState) issues.push("Choose an attention state the domain supports.");

  const evidenceReferences = normalizeActionReviewEvidence(
    input.primaryEvidenceReference,
    Array.isArray(input.evidenceReferences) ? input.evidenceReferences : [],
  );
  if (evidenceReferences.length > ACTION_REVIEW_EVIDENCE_LIMIT) {
    issues.push(
      `Evidence references are limited to ${ACTION_REVIEW_EVIDENCE_LIMIT}. Remove ${
        evidenceReferences.length - ACTION_REVIEW_EVIDENCE_LIMIT
      } reference(s); nothing is truncated automatically.`,
    );
  }
  const overLong = evidenceReferences.filter(
    (reference) => reference.length > ACTION_REVIEW_EVIDENCE_LENGTH_LIMIT,
  );
  if (overLong.length > 0) {
    issues.push(
      `Each evidence reference must be ${ACTION_REVIEW_EVIDENCE_LENGTH_LIMIT} characters or fewer; ${overLong.length} reference(s) exceed it.`,
    );
  }
  if (attentionState === "commander_review" && evidenceReferences.length === 0) {
    issues.push("Bind at least one evidence reference before requesting Commander review.");
  }

  if (issues.length > 0 || !attentionState) {
    return { valid: false, issues, advisories, plan: null };
  }

  const context: ActionOperationalContext = {
    owner,
    blocker,
    nextGate,
    evidenceReference: evidenceReferences[0] ?? "",
    evidenceReferences,
    attentionState,
  };

  let canonicalPayload: string;
  let payloadDigest: string;
  try {
    canonicalPayload = canonicalActionReviewPayload({ actionId, expectedRevision, context });
    payloadDigest = `sha256:${actionReviewSha256Hex(canonicalPayload)}`;
  } catch (reason) {
    issues.push(
      reason instanceof Error
        ? `The payload digest is unavailable: ${reason.message}`
        : "The payload digest is unavailable, so the payload cannot be submitted.",
    );
    return { valid: false, issues, advisories, plan: null };
  }

  if (current && operationalContextUnchanged(current, context)) {
    advisories.push(
      "This payload matches the operational context already recorded on the Action, so submitting it changes nothing.",
    );
  }

  return {
    valid: true,
    issues,
    advisories,
    plan: {
      actionId,
      expectedRevision,
      context,
      command: { type: ACTION_REVIEW_STAGING_COMMAND_TYPE, actionId, context },
      canonicalPayload,
      payloadDigest,
    },
  };
}

function operationalContextUnchanged(
  current: ActionOperationalContext,
  next: ActionOperationalContext,
): boolean {
  return canonicalJson({
    owner: trimmed(current.owner),
    blocker: trimmed(current.blocker),
    nextGate: trimmed(current.nextGate),
    evidenceReferences: normalizeActionReviewEvidence(
      current.evidenceReference ?? "",
      current.evidenceReferences ?? [],
    ),
    attentionState: attentionStateOrDefault(current.attentionState),
  }) === canonicalJson({
    owner: next.owner,
    blocker: next.blocker,
    nextGate: next.nextGate,
    evidenceReferences: next.evidenceReferences ?? [],
    attentionState: next.attentionState,
  });
}

/**
 * True only when the reviewed plan still describes the live Action: same
 * record, same revision, and still eligible. The form must disable submission
 * whenever this is false and rebuild from current state instead.
 */
export function actionReviewStagingStillBound(
  plan: Pick<ActionReviewStagingPlan, "actionId" | "expectedRevision">,
  action: ActionReviewStagingSource,
): boolean {
  return plan.actionId === action.id
    && plan.expectedRevision === action.revision
    && actionReviewStagingEligible(action);
}

/** True only for the one permitted command type. */
export function isActionReviewStagingCommand(command: { type: string }): boolean {
  return command.type === ACTION_REVIEW_STAGING_COMMAND_TYPE;
}
