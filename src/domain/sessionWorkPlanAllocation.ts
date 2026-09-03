import { canonicalHostedJson, hostedSha256 } from "./hostedOperationalStateDigest.js";
import { findAuthSecretViolations } from "./authentication.js";
import type { Action, AuditEvent, Campaign, Mission } from "./types.js";

/**
 * ACT-c417cbd5 / P04 — nonvisual authority plane for one exact Commander
 * Session Work Plan selection.
 *
 * This module is pure. It performs no I/O, reads no clock, generates no
 * identifier, and reaches no provider. Every non-deterministic input is
 * injected, so the same request against the same authoritative state document
 * always produces the same plan, the same ordered audit event, and the same
 * receipt core.
 *
 * Authority bound here:
 *
 *  - Identifier Ontology R1, Commander-approved 2026-08-25
 *    (DATA-SCOPE.md#withheld-internal-reference).
 *    Human identifiers are strict, uppercase, zero-padded, exactly three
 *    numeric digits per segment. Nothing here normalizes, repairs, guesses, or
 *    invents one.
 *  - Numbering is derived only from the complete authoritative state document
 *    the server supplies. A number claimed anywhere in that document — active,
 *    completed, or archived — is never handed out again.
 *  - Opaque record identity is the machine primary. Git identity is
 *    receipt-derived from the opaque record id and is never derived from a
 *    human identifier.
 */

export const sessionWorkPlanAllocationContractVersion = "castra-session-work-plan-allocation/1.0.0" as const;
export const sessionWorkPlanAllocationCommandType = "session_work_plan_allocation" as const;
export const sessionWorkPlanAllocationAuditKind = "session_work_plan.allocation_applied" as const;
export const identifierOntologyRevision = "R1" as const;
export const sessionWorkPlanAllocationIdempotencyPrefix = "state-write:swp-allocation:" as const;

/**
 * ACT-a5ae5f26 / P04-FU01 — the typed predecessor relation carries its own
 * version rather than bumping the outer allocation contract.
 *
 * The outer `castra-session-work-plan-allocation/1.0.0` is deliberately
 * unchanged, exactly as P04 left the hosted contract version unchanged when it
 * added its own sub-contract. The reason is not cosmetic:
 *
 *  - the request change is strictly additive and optional. A byte-identical
 *    pre-existing request still passes exact-key validation and still produces
 *    the identical request binding digest, so nothing already dispatched
 *    becomes unbindable;
 *  - replay resolution reads the retained receipt core out of the audit trail
 *    and re-digests the stored bytes. A receipt written before this change
 *    still reproduces its recorded digest and still replays;
 *  - bumping the pinned version would instead have made every previously
 *    applied transaction non-replayable, because shape validation runs before
 *    replay resolution. That is a regression, not a safety gain.
 *
 * A consumer that needs to know whether a receipt was produced with predecessor
 * support reads `predecessorContract` on the receipt core, which is present
 * from this version onward and absent on every earlier receipt.
 */
export const sessionWorkPlanPredecessorContractVersion = "castra-session-work-plan-predecessor/1.0.0" as const;

/**
 * Identifier Ontology R1 exactly as approved. These patterns are the only
 * authoritative form. A value that fails them is nonconforming, never repaired.
 */
export const strictIdentifierPatterns = {
  warEffort: /^W\d{3}$/,
  campaign: /^C\d{3}$/,
  mission: /^C\d{3}\.M\d{3}$/,
  action: /^C\d{3}\.M\d{3}\.A\d{3}$/,
  punchItem: /^C\d{3}\.M\d{3}\.A\d{3}\.P\d{3}$/,
  auditFinding: /^C\d{3}\.M\d{3}\.AF\d{3}$/,
} as const;

export type IdentifierOntologyClass = keyof typeof strictIdentifierPatterns;

/**
 * Reuse-avoidance scan only.
 *
 * Deliberately looser than the ontology — case-insensitive and variable digit
 * width — so a number already claimed by a nonconforming legacy code can never
 * be handed out a second time. A value matched only by this scan is never
 * displayed as authoritative, never accepted as a parent code, and never
 * allocated. This is the conservative side of the strict/loose split recorded
 * as RECON finding F08.
 */
const reuseScanPattern = /^C(\d{1,9})(?:\.M(\d{1,9})(?:\.A(\d{1,9}))?)?/i;

/** A token shaped like any governed code, in any digit width or case. */
const codeShapedTokenPattern = /^(?:W\d{1,9}|C\d{1,9}(?:\.M\d{1,9}(?:\.A\d{1,9}(?:\.P\d{1,9})?|\.AF\d{1,9})?)?)$/i;

/** The exact import-contract separator between a stable code and a title. */
export const stableCodeTitleSeparator = " — ";

const maximumOrdinal = 999;
const maximumTitleLength = 200;
const maximumDescriptionLength = 2000;
/**
 * The canonical machine primary: a three-letter record-class prefix, an
 * underscore, and one lower-case hyphenated UUID. Both components are captured
 * in full, because receipt-derived Git identity is built from the complete
 * identifier rather than from a truncated prefix.
 */
const canonicalOpaqueIdPattern = /^([a-z]{3})_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const idempotencyPattern = /^state-write:swp-allocation:[a-zA-Z0-9._:-]{8,150}$/;

export type SessionWorkPlanAllocationReasonCode =
  | "INVALID_REQUEST_SHAPE"
  | "CONTRACT_VERSION_REJECTED"
  | "REQUEST_BINDING_DIGEST_MISMATCH"
  | "SECRET_MATERIAL_REJECTED"
  | "DECISION_EXPIRED"
  | "STALE_REVISION"
  | "STALE_STATE_DIGEST"
  | "ALTERED_IDEMPOTENCY_REUSE"
  | "REPLAY_RECEIPT_UNVERIFIABLE"
  | "STATE_DOCUMENT_MALFORMED"
  | "DUPLICATE_PROPOSAL_ID"
  | "UNKNOWN_SELECTION_PROPOSAL_ID"
  | "SELECTION_TREATMENT_CONFLICT"
  | "DUPLICATE_EXISTING_TARGET"
  | "TARGET_RECORD_NOT_FOUND"
  | "STALE_RECORD_REVISION"
  | "CROSS_SCOPE_TARGET"
  | "TARGET_MISSION_REQUIRED"
  | "CAMPAIGN_RECORD_NOT_FOUND"
  | "MISSION_RECORD_NOT_FOUND"
  | "PARENT_STABLE_CODE_UNAVAILABLE"
  | "PARENT_STABLE_CODE_NONCONFORMING"
  | "PARENT_STABLE_CODE_CONFLICT"
  | "TITLE_CONTAINS_STABLE_CODE"
  | "INVALID_TITLE"
  | "IDENTIFIER_SPACE_EXHAUSTED"
  | "GIT_IDENTITY_COLLISION"
  | "STATE_SECRET_VIOLATION"
  | "DUPLICATE_PREDECESSOR_REFERENCE"
  | "PREDECESSOR_RECORD_NOT_FOUND"
  | "PREDECESSOR_RECORD_ARCHIVED"
  | "PREDECESSOR_PARENT_MISSION_UNRESOLVED"
  | "PREDECESSOR_CROSS_CAMPAIGN"
  | "PREDECESSOR_SELF_REFERENCE";

export interface SessionWorkPlanBinding {
  planId: string;
  planRevision: number;
  planDigest: string;
}

export interface SessionWorkPlanDecisionBinding {
  decisionId: string;
  decidingAuthority: "Commander";
  decidedAt: string;
  expiresAt: string | null;
  verbatimSelection: string;
}

export interface SessionWorkPlanExecutionEnvelope {
  envelopeId: string;
  campaignId: string;
  missionId: string | null;
}

export interface SessionWorkPlanSelection {
  selected: string[];
  deferred: string[];
  rejected: string[];
}

export type SessionWorkPlanProposalTarget =
  | { kind: "existing_mission"; missionId: string; expectedRecordRevision: number }
  | { kind: "existing_action"; actionId: string; expectedRecordRevision: number }
  | { kind: "new_mission"; campaignId: string; title: string; description: string }
  | {
    kind: "new_action";
    missionId: string;
    title: string;
    description: string;
    actionKind: "standard" | "deployment";
    /**
     * Optional so a pre-existing request binds byte-identically. Present and
     * `[]` is an explicit "no predecessor"; absent is the legacy encoding of
     * the same fact. The two are *different requests* and therefore bind to
     * different digests — that is deliberate. Normalizing them together in the
     * binding would let an altered replay of a legacy command smuggle in a
     * changed proposal under the original idempotency identity.
     */
    predecessorActionIds?: string[];
  };

export interface SessionWorkPlanProposal {
  proposalId: string;
  treatment: "selected" | "deferred" | "rejected";
  target: SessionWorkPlanProposalTarget;
}

export interface SessionWorkPlanAllocationRequest {
  commandType: typeof sessionWorkPlanAllocationCommandType;
  contractVersion: typeof sessionWorkPlanAllocationContractVersion;
  plan: SessionWorkPlanBinding;
  decision: SessionWorkPlanDecisionBinding;
  envelope: SessionWorkPlanExecutionEnvelope;
  selection: SessionWorkPlanSelection;
  proposals: SessionWorkPlanProposal[];
  expectedRevision: number;
  expectedStateDigest: string;
  idempotencyKey: string;
  requestBindingDigest: string;
}

export interface SessionWorkPlanGitBinding {
  identitySource: "opaque_record_id";
  derivedFromHumanIdentifier: false;
  available: boolean;
  branch: string | null;
  worktree: string | null;
  reasonCode: "OPAQUE_RECORD_ID_UNAVAILABLE" | null;
}

export type StableCodeState = "allocated" | "existing_strict" | "unavailable" | "nonconforming" | "conflict";

/**
 * One reviewable, replay-stable predecessor edge.
 *
 * Both endpoints are named by opaque record identity and the resolved parentage
 * is carried alongside, so an auditor can confirm the same-Campaign rule from
 * the receipt alone without re-reading authoritative state. `relation` records
 * which side of the permitted rule the edge landed on: a cross-Mission edge is
 * legitimate and is preserved as such rather than being flattened into the
 * Mission-local case.
 */
export interface SessionWorkPlanPredecessorBinding {
  predecessorActionId: string;
  predecessorMissionId: string;
  campaignId: string;
  relation: "same_mission" | "same_campaign_cross_mission";
}

export interface SessionWorkPlanAllocatedRecord {
  proposalId: string;
  disposition: "created" | "linked";
  recordType: "mission" | "action";
  opaqueRecordId: string;
  stableCode: string | null;
  stableCodeState: StableCodeState;
  recordRevision: number;
  parentOpaqueId: string;
  parentStableCode: string | null;
  git: SessionWorkPlanGitBinding;
  /**
   * Always present, in the order the proposal declared. Empty for a Mission,
   * for a linked record, and for a new Action that declared none — a linked
   * record is bound exactly as it stands and this transaction never writes a
   * predecessor onto one.
   */
  predecessors: SessionWorkPlanPredecessorBinding[];
}

export interface SessionWorkPlanAllocationNumberingBasis {
  computedServerSide: true;
  basis: "all_campaign_mission_action_records_including_completed_and_archived";
  numberReusePolicy: "never_reuse";
  allocationOrder: "canonical_ascending_proposal_id";
  clientSuppliedIdentifierAccepted: false;
}

/**
 * The constant, self-describing statement of the predecessor rule this receipt
 * was produced under. It exists so a reviewer reading one receipt can see the
 * exact relation semantics that were enforced, without inferring them from the
 * absence of a rejection.
 */
export interface SessionWorkPlanPredecessorContractBinding {
  contractVersion: typeof sessionWorkPlanPredecessorContractVersion;
  relationScope: "same_campaign_cross_mission_permitted";
  distinctFromFollowUpRelation: true;
  emptyRepresentation: "empty_array";
  existingRecordsOnly: true;
}

export interface SessionWorkPlanAllocationAuditBinding {
  kind: typeof sessionWorkPlanAllocationAuditKind;
  eventId: string;
  sequence: number;
  entityType: "campaign" | "mission";
  entityId: string;
}

/**
 * The deterministic part of the receipt. It is embedded verbatim in the audit
 * event, so it cannot contain the digest of the document that carries it.
 */
export interface SessionWorkPlanAllocationReceiptCore {
  contractVersion: typeof sessionWorkPlanAllocationContractVersion;
  receiptId: string;
  identifierOntology: typeof identifierOntologyRevision;
  outcome: "applied" | "no_effect";
  occurredAt: string;
  plan: SessionWorkPlanBinding;
  decision: SessionWorkPlanDecisionBinding;
  envelope: SessionWorkPlanExecutionEnvelope;
  idempotencyKey: string;
  requestBindingDigest: string;
  before: { revision: number; stateDigest: string };
  resultRevision: number;
  treatment: SessionWorkPlanSelection;
  created: SessionWorkPlanAllocatedRecord[];
  linked: SessionWorkPlanAllocatedRecord[];
  unallocatedProposalIds: string[];
  audit: SessionWorkPlanAllocationAuditBinding | null;
  numbering: SessionWorkPlanAllocationNumberingBasis;
  predecessorContract: SessionWorkPlanPredecessorContractBinding;
  automaticRetryScheduled: false;
  immutable: true;
}

export type ResultStateDigestSource =
  | "hosted_write_receipt"
  | "unchanged_no_effect"
  | "not_redispatched_on_replay";

export interface SessionWorkPlanAllocationReceipt extends SessionWorkPlanAllocationReceiptCore {
  result: { revision: number; stateDigest: string | null; stateDigestSource: ResultStateDigestSource };
  receiptCoreDigest: string;
  receiptDigest: string;
  replayed: boolean;
}

export interface SessionWorkPlanAllocationStateDocument {
  schemaVersion: 13;
  nextAuditSequence: number;
  campaigns: Campaign[];
  missions: Mission[];
  actions: Action[];
  auditEvents: AuditEvent[];
  [key: string]: unknown;
}

export interface SessionWorkPlanAllocationIdentityFactory {
  recordId(recordType: "mission" | "action"): string;
  auditEventId(): string;
  receiptId(): string;
}

export type SessionWorkPlanAllocationPlanResult =
  | { status: "rejected"; reasonCode: SessionWorkPlanAllocationReasonCode; detail: string }
  | { status: "replayed"; core: SessionWorkPlanAllocationReceiptCore; coreDigest: string }
  | { status: "no_effect"; core: SessionWorkPlanAllocationReceiptCore; coreDigest: string }
  | {
    status: "planned";
    core: SessionWorkPlanAllocationReceiptCore;
    coreDigest: string;
    nextState: SessionWorkPlanAllocationStateDocument;
    auditEvent: AuditEvent;
  };

/**
 * True only for an ordinary JSON-shaped record.
 *
 * Prototype *identity* is deliberately not compared against this module's own
 * `Object.prototype`. An ordinary object that arrived through
 * `structuredClone()`, a worker or adapter boundary, a VM context, or a
 * serverless runtime carries the originating realm's `Object.prototype`, so an
 * identity comparison rejects a perfectly well-formed authoritative document
 * and turns a healthy read into `STATE_DOCUMENT_MALFORMED`. Recognition is
 * therefore structural and realm-independent:
 *
 *  - `null`, primitives, and arrays are never records;
 *  - anything carrying a built-in brand — Date, Map, Set, RegExp, Error,
 *    Promise, typed arrays, module namespaces, and every other exotic object in
 *    any realm — is rejected by its `Object.prototype.toString` tag;
 *  - a class instance is rejected, because its prototype is not itself the root
 *    of the prototype chain;
 *  - a null-prototype object is accepted, exactly as before.
 *
 * Nothing is loosened downstream: what is admitted here is still only an
 * ordinary record, and `exactKeys()` then rejects any unknown, symbol, or
 * missing property, so exact-request validation keeps its full strength.
 */
function plainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype === null || prototype === Object.prototype) return true;
  if (typeof prototype !== "object" || Object.getPrototypeOf(prototype) !== null) return false;
  const constructor: unknown = (prototype as { constructor?: unknown }).constructor;
  return typeof constructor === "function" && constructor.name === "Object";
}

function exactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!plainObject(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length || keys.some((key) => typeof key !== "string")) return false;
  return expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function nonEmptyString(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximumLength;
}

function safeCount(value: unknown, minimum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

function isoTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function sortedCopy(values: readonly string[]): string[] {
  return [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function byProposalId<T extends { proposalId: string }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) =>
    left.proposalId < right.proposalId ? -1 : left.proposalId > right.proposalId ? 1 : 0);
}

/** True only for the strict Commander-approved form of the given class. */
export function conformsToIdentifierOntology(ontologyClass: IdentifierOntologyClass, value: string): boolean {
  return strictIdentifierPatterns[ontologyClass].test(value);
}

/**
 * True for any token shaped like a governed code, in any digit width or case.
 *
 * Exported so a caller-side plan validator can refuse a supplied identifier
 * using the exact rule the server enforces, instead of maintaining a second,
 * quietly divergent copy of it. This is a *recognition* helper only: a caller
 * that passes it has still supplied nothing authoritative, and the server
 * remains the only place a code is allocated.
 */
export function looksLikeGovernedCodeToken(value: string): boolean {
  return codeShapedTokenPattern.test(value);
}

/**
 * True only for the exact idempotency identity form this contract accepts.
 * Exported for the same single-definition reason as above.
 */
export function validSessionWorkPlanAllocationIdempotencyKey(value: string): boolean {
  return idempotencyPattern.test(value);
}

function paddedOrdinal(value: number): string {
  return String(value).padStart(3, "0");
}

/**
 * Every code a record could be claiming: the exact import-contract title prefix
 * and the record id when the id is itself a code. Only code-shaped tokens are
 * treated as claims, so an ordinary title containing an em dash is not mistaken
 * for an identifier. Values are returned exactly as recorded — never trimmed,
 * upper-cased, or repaired.
 */
function stableCodeCandidates(record: { id: string; title: string }): string[] {
  const candidates: string[] = [];
  const separatorIndex = record.title.indexOf(stableCodeTitleSeparator);
  if (separatorIndex > 0) {
    const head = record.title.slice(0, separatorIndex);
    if (codeShapedTokenPattern.test(head)) candidates.push(head);
  }
  if (!record.id.includes("_") && codeShapedTokenPattern.test(record.id)) candidates.push(record.id);
  return candidates;
}

export type StableCodeResolution =
  | { state: "existing_strict"; code: string }
  | { state: "unavailable"; code: null }
  | { state: "nonconforming"; code: null }
  | { state: "conflict"; code: null };

/**
 * Resolves the authoritative human identifier of an existing record under
 * Identifier Ontology R1. A loose or lower-case value is reported as
 * `nonconforming` and is never repaired into an authoritative code; two
 * disagreeing code-shaped derivations are reported as `conflict`.
 */
export function resolveStableCode(
  ontologyClass: IdentifierOntologyClass,
  record: { id: string; title: string },
): StableCodeResolution {
  const candidates = stableCodeCandidates(record);
  if (candidates.length === 0) return { state: "unavailable", code: null };
  const distinct = [...new Set(candidates)];
  if (distinct.length > 1) return { state: "conflict", code: null };
  return conformsToIdentifierOntology(ontologyClass, distinct[0])
    ? { state: "existing_strict", code: distinct[0] }
    : { state: "nonconforming", code: null };
}

export interface ParentScope {
  campaignNumber: number;
  missionNumber: number | null;
}

function parentScopeOf(code: string): ParentScope | null {
  if (conformsToIdentifierOntology("campaign", code)) {
    return { campaignNumber: Number(code.slice(1)), missionNumber: null };
  }
  if (conformsToIdentifierOntology("mission", code)) {
    const [campaign, mission] = code.split(".");
    return { campaignNumber: Number(campaign.slice(1)), missionNumber: Number(mission.slice(1)) };
  }
  return null;
}

/**
 * Highest ordinal already claimed inside a parent scope, computed across every
 * record in the complete authoritative document — active, completed, and
 * archived alike, and including records parented elsewhere whose code claims
 * this scope. The loose scan is intentional and exists only so a claimed number
 * can never be handed out twice.
 */
export function highestClaimedOrdinal(
  scope: ParentScope,
  records: ReadonlyArray<{ id: string; title: string }>,
  childKind: "mission" | "action",
): number {
  let highest = 0;
  for (const record of records) {
    for (const candidate of stableCodeCandidates(record)) {
      const match = reuseScanPattern.exec(candidate);
      if (!match || Number(match[1]) !== scope.campaignNumber) continue;
      if (childKind === "mission") {
        if (match[2] === undefined) continue;
        const ordinal = Number(match[2]);
        if (Number.isSafeInteger(ordinal) && ordinal > highest) highest = ordinal;
        continue;
      }
      if (match[2] === undefined || match[3] === undefined) continue;
      if (Number(match[2]) !== scope.missionNumber) continue;
      const ordinal = Number(match[3]);
      if (Number.isSafeInteger(ordinal) && ordinal > highest) highest = ordinal;
    }
  }
  return highest;
}

/**
 * Receipt-derived Git identity, derived only from the opaque record id and the
 * allocation date. A human identifier is never an input. A record whose id is
 * not a canonical opaque id yields no Git identity and an explicit reason code
 * rather than a guess.
 *
 * The derivation is injective over canonical opaque record ids: the complete
 * normalized identifier is carried, not a short prefix, so the original record
 * id is recoverable from the branch and two distinct records can never derive
 * the same branch or worktree — within one transaction or across transactions
 * on the same date. A truncating derivation cannot make that guarantee, which
 * is why the eight-character form was replaced.
 */
export function deriveGitBinding(input: {
  recordType: "mission" | "action";
  opaqueRecordId: string;
  occurredAt: string;
}): SessionWorkPlanGitBinding {
  const match = canonicalOpaqueIdPattern.exec(input.opaqueRecordId);
  if (!match) {
    return {
      identitySource: "opaque_record_id",
      derivedFromHumanIdentifier: false,
      available: false,
      branch: null,
      worktree: null,
      reasonCode: "OPAQUE_RECORD_ID_UNAVAILABLE",
    };
  }
  // The complete normalized identifier: `act_<uuid>` becomes `act-<uuid>`.
  const segment = `${match[1]}-${match[2]}`;
  const date = input.occurredAt.slice(0, 10).replaceAll("-", "");
  return {
    identitySource: "opaque_record_id",
    derivedFromHumanIdentifier: false,
    available: true,
    branch: `${input.recordType}/${segment}-${date}`,
    worktree: `work/${segment}-${date}`,
    reasonCode: null,
  };
}

/**
 * Canonical binding of one allocation request. Selection arrays and proposals
 * are ordered canonically first, so a request that differs only in presentation
 * order binds identically and an altered replay is always a genuine change.
 */
export function sessionWorkPlanAllocationBinding(
  request: Omit<SessionWorkPlanAllocationRequest, "requestBindingDigest">,
): Record<string, unknown> {
  return {
    commandType: request.commandType,
    contractVersion: request.contractVersion,
    plan: request.plan,
    decision: request.decision,
    envelope: request.envelope,
    selection: {
      selected: sortedCopy(request.selection.selected),
      deferred: sortedCopy(request.selection.deferred),
      rejected: sortedCopy(request.selection.rejected),
    },
    proposals: byProposalId(request.proposals),
    expectedRevision: request.expectedRevision,
    expectedStateDigest: request.expectedStateDigest,
    idempotencyKey: request.idempotencyKey,
  };
}

export function sessionWorkPlanAllocationBindingDigest(
  request: Omit<SessionWorkPlanAllocationRequest, "requestBindingDigest">,
): Promise<string> {
  return hostedSha256(canonicalHostedJson(sessionWorkPlanAllocationBinding(request)));
}

export function sessionWorkPlanAllocationReceiptCoreDigest(
  core: SessionWorkPlanAllocationReceiptCore,
): Promise<string> {
  return hostedSha256(canonicalHostedJson(core));
}

/** Strips the response-level fields so a caller can re-derive the core digest. */
export function sessionWorkPlanAllocationReceiptCoreOf(
  receipt: SessionWorkPlanAllocationReceipt,
): SessionWorkPlanAllocationReceiptCore {
  const core: Record<string, unknown> = { ...receipt };
  delete core.result;
  delete core.receiptCoreDigest;
  delete core.receiptDigest;
  delete core.replayed;
  return core as unknown as SessionWorkPlanAllocationReceiptCore;
}

/**
 * Composes the returned receipt.
 *
 * `receiptDigest` covers the core and its digest only. The applied state digest
 * is deliberately excluded: the core is embedded in the very document that
 * digest describes, so including it would be circular, and excluding it is what
 * makes an exact replay return a byte-identical receipt digest.
 */
export async function composeSessionWorkPlanAllocationReceipt(input: {
  core: SessionWorkPlanAllocationReceiptCore;
  coreDigest: string;
  resultStateDigest: string | null;
  resultStateDigestSource: ResultStateDigestSource;
  replayed: boolean;
}): Promise<SessionWorkPlanAllocationReceipt> {
  const receiptDigest = await hostedSha256(canonicalHostedJson({
    core: input.core,
    coreDigest: input.coreDigest,
  }));
  return {
    ...input.core,
    result: {
      revision: input.core.resultRevision,
      stateDigest: input.resultStateDigest,
      stateDigestSource: input.resultStateDigestSource,
    },
    receiptCoreDigest: input.coreDigest,
    receiptDigest,
    replayed: input.replayed,
  };
}

function rejected(
  reasonCode: SessionWorkPlanAllocationReasonCode,
  detail: string,
): SessionWorkPlanAllocationPlanResult {
  return { status: "rejected", reasonCode, detail };
}

function validStateDocument(value: unknown): value is SessionWorkPlanAllocationStateDocument {
  if (!plainObject(value) || value.schemaVersion !== 13) return false;
  if (!safeCount(value.nextAuditSequence, 1)) return false;
  return ["campaigns", "missions", "actions", "auditEvents"].every((key) => Array.isArray(value[key]));
}

const requestKeys = [
  "commandType",
  "contractVersion",
  "plan",
  "decision",
  "envelope",
  "selection",
  "proposals",
  "expectedRevision",
  "expectedStateDigest",
  "idempotencyKey",
  "requestBindingDigest",
] as const;
const planKeys = ["planId", "planRevision", "planDigest"] as const;
const decisionKeys = ["decisionId", "decidingAuthority", "decidedAt", "expiresAt", "verbatimSelection"] as const;
const envelopeKeys = ["envelopeId", "campaignId", "missionId"] as const;
const selectionKeys = ["selected", "deferred", "rejected"] as const;
const proposalKeys = ["proposalId", "treatment", "target"] as const;

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 200 && value.every((item) => nonEmptyString(item, 120));
}

const maximumPredecessors = 50;

function predecessorIdArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= maximumPredecessors
    && value.every((item) => nonEmptyString(item, 120));
}

/**
 * The one honest empty representation, used for reads of any record whose
 * predecessor field may predate this contract.
 *
 * Absent, `null`, and any non-array all mean exactly "no declared predecessor"
 * and normalize to `[]`. A non-string entry cannot denote a record identity, so
 * it is dropped rather than coerced into one. Nothing here adds, reorders,
 * de-duplicates, repairs, or infers an identifier: an absent field never becomes
 * a link, and a present link is returned exactly as recorded.
 *
 * This is the *lenient* reader, and it is correct only where dropping an
 * unreadable member is honest — the local, non-authoritative candidate path and
 * ordinary display. A boundary that must not interpret a relation it cannot read
 * exactly uses `readActionPredecessorIds` instead.
 */
export function normalizeActionPredecessorIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

/**
 * ACT-a5ae5f26 / P04-FU01 rework FW-P04-FU01-003.
 *
 * Why a stored predecessor member may not be silently dropped: the lenient
 * normalizer above turns `["act_a", 7]` into `["act_a"]`, which reads as "this
 * record declares exactly one dependency". At an authoritative boundary that is
 * a fabricated relation — the honest statement is "this relation cannot be read,
 * so nothing may be concluded from it".
 */
export type ActionPredecessorRelationProblem =
  | "PREDECESSOR_RELATION_NOT_AN_ARRAY"
  | "PREDECESSOR_RELATION_TOO_LONG"
  | "PREDECESSOR_MEMBER_NOT_AN_ACTION_ID"
  | "PREDECESSOR_MEMBER_DUPLICATED";

export type ActionPredecessorRelationRead =
  | { status: "exact"; predecessorActionIds: string[] }
  | { status: "malformed"; problem: ActionPredecessorRelationProblem; detail: string };

/**
 * The strict counterpart of `normalizeActionPredecessorIds`.
 *
 * Legacy *absence* is still the honest empty list: a record written before this
 * sub-contract existed carries no field, and `undefined` therefore reads as the
 * exact empty set. Everything that is actually present must be exactly what the
 * write contract admits — an array of at most `maximumPredecessors` unique,
 * nonempty opaque Action ids — and is otherwise reported as malformed with no
 * partial interpretation. `null` is a present value, not an absence, so it is
 * malformed here even though the lenient reader accepts it as empty.
 *
 * Order is preserved exactly and never sorted: the declared order is part of the
 * relation, and an exact reconciliation must be able to see a reordering.
 */
export function readActionPredecessorIds(value: unknown): ActionPredecessorRelationRead {
  if (value === undefined) return { status: "exact", predecessorActionIds: [] };
  if (!Array.isArray(value)) {
    return {
      status: "malformed",
      problem: "PREDECESSOR_RELATION_NOT_AN_ARRAY",
      detail: `A present predecessor relation must be an array; this one is ${value === null ? "null" : typeof value}.`,
    };
  }
  if (value.length > maximumPredecessors) {
    return {
      status: "malformed",
      problem: "PREDECESSOR_RELATION_TOO_LONG",
      detail: `A predecessor relation may name at most ${maximumPredecessors} Actions; this one names ${value.length}.`,
    };
  }
  const predecessorActionIds: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (!nonEmptyString(entry, 120)) {
      return {
        status: "malformed",
        problem: "PREDECESSOR_MEMBER_NOT_AN_ACTION_ID",
        detail: `Predecessor member ${index} is not a nonempty opaque Action record id.`,
      };
    }
    if (predecessorActionIds.includes(entry)) {
      return {
        status: "malformed",
        problem: "PREDECESSOR_MEMBER_DUPLICATED",
        detail: `Predecessor ${entry} appears more than once in one stored relation.`,
      };
    }
    predecessorActionIds.push(entry);
  }
  return { status: "exact", predecessorActionIds };
}

function validTarget(value: unknown): value is SessionWorkPlanProposalTarget {
  if (!plainObject(value)) return false;
  if (value.kind === "existing_mission") {
    return exactKeys(value, ["kind", "missionId", "expectedRecordRevision"])
      && nonEmptyString(value.missionId, 120) && safeCount(value.expectedRecordRevision, 1);
  }
  if (value.kind === "existing_action") {
    return exactKeys(value, ["kind", "actionId", "expectedRecordRevision"])
      && nonEmptyString(value.actionId, 120) && safeCount(value.expectedRecordRevision, 1);
  }
  if (value.kind === "new_mission") {
    return exactKeys(value, ["kind", "campaignId", "title", "description"])
      && nonEmptyString(value.campaignId, 120)
      && nonEmptyString(value.title, maximumTitleLength)
      && typeof value.description === "string" && value.description.length <= maximumDescriptionLength;
  }
  if (value.kind === "new_action") {
    // Exactly one of two exact key sets: the pre-P04-FU01 form, and the same
    // form extended by the optional predecessor list. Both are exact, so an
    // unknown property is still rejected outright and a caller still cannot
    // smuggle a proposed stable code or a precomputed ordinal through either.
    const legacyKeys = exactKeys(value, ["kind", "missionId", "title", "description", "actionKind"]);
    const extendedKeys = exactKeys(value, ["kind", "missionId", "title", "description", "actionKind", "predecessorActionIds"]);
    if (!legacyKeys && !extendedKeys) return false;
    if (extendedKeys && !predecessorIdArray(value.predecessorActionIds)) return false;
    return nonEmptyString(value.missionId, 120)
      && nonEmptyString(value.title, maximumTitleLength)
      && typeof value.description === "string" && value.description.length <= maximumDescriptionLength
      && (value.actionKind === "standard" || value.actionKind === "deployment");
  }
  return false;
}

/**
 * Strict exact-key-set structural validation. An unknown property anywhere in
 * the envelope is rejected outright, which is also what structurally prevents a
 * caller from smuggling a proposed stable code or a precomputed next number
 * into the request.
 */
export function validSessionWorkPlanAllocationRequestShape(value: unknown): value is SessionWorkPlanAllocationRequest {
  if (!exactKeys(value, requestKeys)) return false;
  if (value.commandType !== sessionWorkPlanAllocationCommandType) return false;
  if (value.contractVersion !== sessionWorkPlanAllocationContractVersion) return false;

  const plan: unknown = value.plan;
  if (!exactKeys(plan, planKeys)) return false;
  if (!nonEmptyString(plan.planId, 160) || !safeCount(plan.planRevision, 1)) return false;
  if (typeof plan.planDigest !== "string" || !digestPattern.test(plan.planDigest)) return false;

  const decision: unknown = value.decision;
  if (!exactKeys(decision, decisionKeys)) return false;
  if (!nonEmptyString(decision.decisionId, 160) || decision.decidingAuthority !== "Commander") return false;
  if (!isoTimestamp(decision.decidedAt)) return false;
  if (!(decision.expiresAt === null || isoTimestamp(decision.expiresAt))) return false;
  if (!nonEmptyString(decision.verbatimSelection, 1000)) return false;

  const envelope: unknown = value.envelope;
  if (!exactKeys(envelope, envelopeKeys)) return false;
  if (!nonEmptyString(envelope.envelopeId, 160) || !nonEmptyString(envelope.campaignId, 120)) return false;
  if (!(envelope.missionId === null || nonEmptyString(envelope.missionId, 120))) return false;

  const selection: unknown = value.selection;
  if (!exactKeys(selection, selectionKeys)) return false;
  if (!stringArray(selection.selected) || !stringArray(selection.deferred) || !stringArray(selection.rejected)) return false;

  const proposals: unknown = value.proposals;
  if (!Array.isArray(proposals) || proposals.length > 200) return false;
  for (const candidate of proposals) {
    const proposal: unknown = candidate;
    if (!exactKeys(proposal, proposalKeys)) return false;
    if (!nonEmptyString(proposal.proposalId, 120)) return false;
    if (!["selected", "deferred", "rejected"].includes(String(proposal.treatment))) return false;
    if (!validTarget(proposal.target)) return false;
  }

  if (!safeCount(value.expectedRevision, 1)) return false;
  if (typeof value.expectedStateDigest !== "string" || !digestPattern.test(value.expectedStateDigest)) return false;
  if (typeof value.idempotencyKey !== "string" || !idempotencyPattern.test(value.idempotencyKey)) return false;
  if (typeof value.requestBindingDigest !== "string" || !digestPattern.test(value.requestBindingDigest)) return false;
  return true;
}

function titleRejection(title: string): SessionWorkPlanAllocationReasonCode | null {
  const trimmed = title.trim();
  if (!trimmed || trimmed.length > maximumTitleLength) return "INVALID_TITLE";
  if (trimmed.includes(stableCodeTitleSeparator)) return "TITLE_CONTAINS_STABLE_CODE";
  const leadingToken = trimmed.split(/\s/, 1)[0];
  if (codeShapedTokenPattern.test(leadingToken)) return "TITLE_CONTAINS_STABLE_CODE";
  return null;
}

function newBaseRecord(input: {
  id: string;
  stableCode: string;
  title: string;
  description: string;
  occurredAt: string;
}) {
  return {
    id: input.id,
    title: `${input.stableCode}${stableCodeTitleSeparator}${input.title.trim()}`,
    description: input.description.trim(),
    notes: "",
    status: "planned" as const,
    revision: 1,
    approval: null,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
    archivedAt: null,
  };
}

function parentCodeRejection(
  resolution: StableCodeResolution,
  detail: string,
): SessionWorkPlanAllocationPlanResult {
  const reasonCode: SessionWorkPlanAllocationReasonCode = resolution.state === "conflict"
    ? "PARENT_STABLE_CODE_CONFLICT"
    : resolution.state === "nonconforming"
      ? "PARENT_STABLE_CODE_NONCONFORMING"
      : "PARENT_STABLE_CODE_UNAVAILABLE";
  return rejected(reasonCode, detail);
}

const numberingBasis: SessionWorkPlanAllocationNumberingBasis = {
  computedServerSide: true,
  basis: "all_campaign_mission_action_records_including_completed_and_archived",
  numberReusePolicy: "never_reuse",
  allocationOrder: "canonical_ascending_proposal_id",
  clientSuppliedIdentifierAccepted: false,
};

const predecessorContract: SessionWorkPlanPredecessorContractBinding = {
  contractVersion: sessionWorkPlanPredecessorContractVersion,
  relationScope: "same_campaign_cross_mission_permitted",
  distinctFromFollowUpRelation: true,
  emptyRepresentation: "empty_array",
  existingRecordsOnly: true,
};

type PredecessorResolution =
  | { status: "resolved"; bindings: SessionWorkPlanPredecessorBinding[] }
  | { status: "rejected"; reasonCode: SessionWorkPlanAllocationReasonCode; detail: string };

/**
 * Resolves one proposal's declared predecessors against the authoritative
 * document exactly as loaded.
 *
 * Only records that already exist in that document are acceptable, which is why
 * this runs before anything is created: a reference can never resolve to a
 * record this same transaction is minting, and the caller therefore cannot make
 * a dependency on an identity it could not have reviewed.
 *
 * Every failure mode is a distinct reason code, because "rejected" alone does
 * not tell a Commander whether the plan named a record that is absent, archived,
 * orphaned, or simply in another Campaign. Order is fixed so the same bad input
 * always produces the same code.
 */
function resolvePredecessors(input: {
  proposalId: string;
  declared: readonly string[];
  targetMissionId: string;
  campaignId: string;
  actionsById: ReadonlyMap<string, Action>;
  missionsById: ReadonlyMap<string, Mission>;
}): PredecessorResolution {
  const bindings: SessionWorkPlanPredecessorBinding[] = [];
  const seen = new Set<string>();

  for (const predecessorActionId of input.declared) {
    if (seen.has(predecessorActionId)) {
      return {
        status: "rejected",
        reasonCode: "DUPLICATE_PREDECESSOR_REFERENCE",
        detail: `Proposal ${input.proposalId} names predecessor ${predecessorActionId} more than once.`,
      };
    }
    seen.add(predecessorActionId);

    const predecessor = input.actionsById.get(predecessorActionId);
    if (!predecessor) {
      return {
        status: "rejected",
        reasonCode: "PREDECESSOR_RECORD_NOT_FOUND",
        detail: `Proposal ${input.proposalId} names predecessor Action ${predecessorActionId}, which is not an existing Action in authoritative state.`,
      };
    }
    if (predecessor.archivedAt !== null) {
      return {
        status: "rejected",
        reasonCode: "PREDECESSOR_RECORD_ARCHIVED",
        detail: `Proposal ${input.proposalId} depends on archived Action ${predecessorActionId}. An archived record is not a usable dependency.`,
      };
    }
    const parentMission = input.missionsById.get(predecessor.missionId);
    if (!parentMission) {
      return {
        status: "rejected",
        reasonCode: "PREDECESSOR_PARENT_MISSION_UNRESOLVED",
        detail: `Predecessor Action ${predecessorActionId} names Mission ${predecessor.missionId}, which authoritative state does not contain. The Campaign rule cannot be evaluated, so the reference is refused.`,
      };
    }
    if (parentMission.campaignId !== input.campaignId) {
      return {
        status: "rejected",
        reasonCode: "PREDECESSOR_CROSS_CAMPAIGN",
        detail: `Predecessor Action ${predecessorActionId} belongs to Campaign ${parentMission.campaignId}, not the target Campaign ${input.campaignId}. Cross-Mission is permitted; cross-Campaign is not.`,
      };
    }
    bindings.push({
      predecessorActionId,
      predecessorMissionId: parentMission.id,
      campaignId: parentMission.campaignId,
      relation: parentMission.id === input.targetMissionId ? "same_mission" : "same_campaign_cross_mission",
    });
  }

  return { status: "resolved", bindings };
}

/**
 * Plans exactly one Commander-selected Session Work Plan transaction.
 *
 * Nothing is mutated. The caller receives a fail-closed rejection, an exact
 * replay of a previously applied transaction, an explicit no-effect result, or
 * a fully formed next state document with its ordered audit event.
 */
export async function planSessionWorkPlanAllocation(input: {
  request: unknown;
  stateDocument: unknown;
  before: { revision: number; stateDigest: string };
  occurredAt: string;
  identities: SessionWorkPlanAllocationIdentityFactory;
}): Promise<SessionWorkPlanAllocationPlanResult> {
  const { before, occurredAt, identities } = input;

  const request: unknown = input.request;
  if (!validSessionWorkPlanAllocationRequestShape(request)) {
    return rejected("INVALID_REQUEST_SHAPE", "The allocation envelope failed exact structural validation.");
  }
  if (findAuthSecretViolations(request, "session-work-plan-allocation").length) {
    return rejected("SECRET_MATERIAL_REJECTED", "The allocation envelope contains prohibited secret-like material.");
  }
  if (await sessionWorkPlanAllocationBindingDigest(request) !== request.requestBindingDigest) {
    return rejected("REQUEST_BINDING_DIGEST_MISMATCH", "The supplied request binding digest does not bind this exact request.");
  }
  const state: unknown = input.stateDocument;
  if (!validStateDocument(state)) {
    return rejected("STATE_DOCUMENT_MALFORMED", "The authoritative state document is not a usable schema-13 document.");
  }

  // Replay resolution runs before every semantic check and before any
  // recomputation, because the authoritative document has already advanced past
  // the revision the original transaction saw. Re-deriving numbers here would
  // produce a different, and therefore wrong, answer.
  const priorEvent = state.auditEvents.find((event) =>
    event.kind === sessionWorkPlanAllocationAuditKind
    && event.detail?.idempotencyKey === request.idempotencyKey);
  if (priorEvent) {
    if (priorEvent.detail.requestBindingDigest !== request.requestBindingDigest) {
      return rejected("ALTERED_IDEMPOTENCY_REUSE", "This idempotency identity is already bound to a different request.");
    }
    let core: unknown;
    try {
      core = JSON.parse(priorEvent.detail.receipt ?? "");
    } catch {
      return rejected("REPLAY_RECEIPT_UNVERIFIABLE", "The retained allocation receipt could not be read.");
    }
    const coreDigest = await hostedSha256(canonicalHostedJson(core));
    if (coreDigest !== priorEvent.detail.receiptCoreDigest) {
      return rejected("REPLAY_RECEIPT_UNVERIFIABLE", "The retained allocation receipt does not match its recorded digest.");
    }
    return { status: "replayed", core: core as SessionWorkPlanAllocationReceiptCore, coreDigest };
  }

  if (request.decision.expiresAt !== null && Date.parse(request.decision.expiresAt) <= Date.parse(occurredAt)) {
    return rejected("DECISION_EXPIRED", "The bound Commander decision expired before this transaction.");
  }
  if (request.expectedRevision !== before.revision) {
    return rejected("STALE_REVISION", `Expected authoritative revision ${request.expectedRevision}; the store is at ${before.revision}.`);
  }
  if (request.expectedStateDigest !== before.stateDigest) {
    return rejected("STALE_STATE_DIGEST", "The authoritative state digest moved past the exact reviewed baseline.");
  }

  const proposalIds = request.proposals.map((proposal) => proposal.proposalId);
  if (new Set(proposalIds).size !== proposalIds.length) {
    return rejected("DUPLICATE_PROPOSAL_ID", "The same proposal identifier appears more than once.");
  }
  const declared = new Map<string, "selected" | "deferred" | "rejected">();
  for (const treatmentName of ["selected", "deferred", "rejected"] as const) {
    for (const proposalId of request.selection[treatmentName]) {
      if (declared.has(proposalId)) {
        return rejected("SELECTION_TREATMENT_CONFLICT", `Proposal ${proposalId} is declared under more than one treatment.`);
      }
      declared.set(proposalId, treatmentName);
    }
  }
  for (const proposalId of declared.keys()) {
    if (!proposalIds.includes(proposalId)) {
      return rejected("UNKNOWN_SELECTION_PROPOSAL_ID", `Selection names proposal ${proposalId}, which is not in this plan.`);
    }
  }
  for (const proposal of request.proposals) {
    if (declared.get(proposal.proposalId) !== proposal.treatment) {
      return rejected("SELECTION_TREATMENT_CONFLICT", `Proposal ${proposal.proposalId} has a treatment the selection does not confirm.`);
    }
  }

  const campaign = state.campaigns.find((record) => record.id === request.envelope.campaignId);
  if (!campaign) {
    return rejected("CAMPAIGN_RECORD_NOT_FOUND", "The bound envelope Campaign is not present in authoritative state.");
  }
  const envelopeMission = request.envelope.missionId === null
    ? null
    : state.missions.find((record) => record.id === request.envelope.missionId) ?? null;
  if (request.envelope.missionId !== null && !envelopeMission) {
    return rejected("MISSION_RECORD_NOT_FOUND", "The bound envelope Mission is not present in authoritative state.");
  }
  if (envelopeMission && envelopeMission.campaignId !== campaign.id) {
    return rejected("CROSS_SCOPE_TARGET", "The bound envelope Mission belongs to a different Campaign.");
  }

  const selected = byProposalId(request.proposals.filter((proposal) => proposal.treatment === "selected"));
  const unallocatedProposalIds = sortedCopy(request.proposals
    .filter((proposal) => proposal.treatment !== "selected")
    .map((proposal) => proposal.proposalId));
  const treatment: SessionWorkPlanSelection = {
    selected: sortedCopy(request.selection.selected),
    deferred: sortedCopy(request.selection.deferred),
    rejected: sortedCopy(request.selection.rejected),
  };

  if (selected.length === 0) {
    const core: SessionWorkPlanAllocationReceiptCore = {
      contractVersion: sessionWorkPlanAllocationContractVersion,
      receiptId: identities.receiptId(),
      identifierOntology: identifierOntologyRevision,
      outcome: "no_effect",
      occurredAt,
      plan: request.plan,
      decision: request.decision,
      envelope: request.envelope,
      idempotencyKey: request.idempotencyKey,
      requestBindingDigest: request.requestBindingDigest,
      before,
      resultRevision: before.revision,
      treatment,
      created: [],
      linked: [],
      unallocatedProposalIds,
      audit: null,
      numbering: numberingBasis,
      predecessorContract,
      automaticRetryScheduled: false,
      immutable: true,
    };
    return { status: "no_effect", core, coreDigest: await sessionWorkPlanAllocationReceiptCoreDigest(core) };
  }

  // Predecessor references are resolved against the document exactly as loaded,
  // before a single record is minted. That ordering is the control: it is what
  // makes "reject before mutation" structural rather than a promise, and it is
  // what guarantees a predecessor is a record the Commander could have reviewed
  // rather than one this transaction is creating.
  const actionsById = new Map(state.actions.map((record) => [record.id, record]));
  const missionsById = new Map(state.missions.map((record) => [record.id, record]));
  const resolvedPredecessors = new Map<string, SessionWorkPlanPredecessorBinding[]>();
  for (const proposal of selected) {
    const declaredTarget = proposal.target;
    if (declaredTarget.kind !== "new_action") continue;
    const resolution = resolvePredecessors({
      proposalId: proposal.proposalId,
      // Absent and `[]` are the same fact here. Normalizing at the point of use
      // is safe precisely because the request binding above kept them distinct.
      declared: declaredTarget.predecessorActionIds ?? [],
      targetMissionId: declaredTarget.missionId,
      campaignId: campaign.id,
      actionsById,
      missionsById,
    });
    if (resolution.status === "rejected") return rejected(resolution.reasonCode, resolution.detail);
    resolvedPredecessors.set(proposal.proposalId, resolution.bindings);
  }

  const missions: Mission[] = [...state.missions];
  const actions: Action[] = [...state.actions];
  const created: SessionWorkPlanAllocatedRecord[] = [];
  const linked: SessionWorkPlanAllocatedRecord[] = [];
  const existingTargets = new Set<string>();
  const scanRecords = (): Array<{ id: string; title: string }> => [...state.campaigns, ...missions, ...actions];

  for (const proposal of selected) {
    const target = proposal.target;

    if (target.kind === "existing_mission" || target.kind === "existing_action") {
      const targetId = target.kind === "existing_mission" ? target.missionId : target.actionId;
      if (existingTargets.has(targetId)) {
        return rejected("DUPLICATE_EXISTING_TARGET", `Record ${targetId} is targeted by more than one selected proposal.`);
      }
      existingTargets.add(targetId);
      const record: Mission | Action | undefined = target.kind === "existing_mission"
        ? missions.find((candidate) => candidate.id === targetId)
        : actions.find((candidate) => candidate.id === targetId);
      if (!record) {
        return rejected("TARGET_RECORD_NOT_FOUND", `Selected record ${targetId} is not present in authoritative state.`);
      }
      if (record.revision !== target.expectedRecordRevision) {
        return rejected("STALE_RECORD_REVISION", `Record ${targetId} is at revision ${record.revision}, not the expected ${target.expectedRecordRevision}.`);
      }
      if (record.type === "mission" && record.campaignId !== campaign.id) {
        return rejected("CROSS_SCOPE_TARGET", `Mission ${targetId} is outside the bound Campaign.`);
      }
      if (record.type === "action") {
        if (!envelopeMission) {
          return rejected("TARGET_MISSION_REQUIRED", "Linking an Action requires the envelope to bind its Mission.");
        }
        if (record.missionId !== envelopeMission.id) {
          return rejected("CROSS_SCOPE_TARGET", `Action ${targetId} is outside the bound Mission.`);
        }
      }
      // A linked record is bound exactly as it stands. Nothing about it is
      // rewritten, re-coded, re-parented, or re-revisioned by this transaction.
      const parentRecord: Campaign | Mission = record.type === "mission" ? campaign : envelopeMission as Mission;
      const parentResolution = resolveStableCode(record.type === "mission" ? "campaign" : "mission", parentRecord);
      const resolution = resolveStableCode(record.type === "mission" ? "mission" : "action", record);
      linked.push({
        proposalId: proposal.proposalId,
        disposition: "linked",
        recordType: record.type,
        opaqueRecordId: record.id,
        stableCode: resolution.code,
        stableCodeState: resolution.state,
        recordRevision: record.revision,
        parentOpaqueId: parentRecord.id,
        parentStableCode: parentResolution.code,
        git: deriveGitBinding({ recordType: record.type, opaqueRecordId: record.id, occurredAt }),
        // A linked record is bound exactly as it stands, so this transaction
        // neither reads nor writes a predecessor edge on it.
        predecessors: [],
      });
      continue;
    }

    if (target.kind === "new_mission") {
      if (target.campaignId !== campaign.id) {
        return rejected("CROSS_SCOPE_TARGET", `Proposal ${proposal.proposalId} allocates outside the bound Campaign.`);
      }
      const titleProblem = titleRejection(target.title);
      if (titleProblem) {
        return rejected(titleProblem, `Proposal ${proposal.proposalId} supplies a title the server may not accept.`);
      }
      const parentResolution = resolveStableCode("campaign", campaign);
      if (parentResolution.state !== "existing_strict") {
        return parentCodeRejection(parentResolution, `Campaign ${campaign.id} has no single authoritative stable code, so no Mission number can be allocated.`);
      }
      const scope = parentScopeOf(parentResolution.code);
      if (!scope) {
        return rejected("PARENT_STABLE_CODE_NONCONFORMING", "The Campaign code is not a usable allocation scope.");
      }
      const next = highestClaimedOrdinal(scope, scanRecords(), "mission") + 1;
      if (next > maximumOrdinal) {
        return rejected("IDENTIFIER_SPACE_EXHAUSTED", `Campaign ${parentResolution.code} has no remaining three-digit Mission number.`);
      }
      const stableCode = `${parentResolution.code}.M${paddedOrdinal(next)}`;
      const id = identities.recordId("mission");
      missions.push({
        ...newBaseRecord({ id, stableCode, title: target.title, description: target.description, occurredAt }),
        type: "mission",
        campaignId: campaign.id,
      });
      created.push({
        proposalId: proposal.proposalId,
        disposition: "created",
        recordType: "mission",
        opaqueRecordId: id,
        stableCode,
        stableCodeState: "allocated",
        recordRevision: 1,
        parentOpaqueId: campaign.id,
        parentStableCode: parentResolution.code,
        git: deriveGitBinding({ recordType: "mission", opaqueRecordId: id, occurredAt }),
        // The predecessor relation is an Action-to-Action dependency only.
        predecessors: [],
      });
      continue;
    }

    if (!envelopeMission) {
      return rejected("TARGET_MISSION_REQUIRED", "Allocating an Action requires the envelope to bind its Mission.");
    }
    if (target.missionId !== envelopeMission.id) {
      return rejected("CROSS_SCOPE_TARGET", `Proposal ${proposal.proposalId} allocates outside the bound Mission.`);
    }
    const titleProblem = titleRejection(target.title);
    if (titleProblem) {
      return rejected(titleProblem, `Proposal ${proposal.proposalId} supplies a title the server may not accept.`);
    }
    const parentResolution = resolveStableCode("mission", envelopeMission);
    if (parentResolution.state !== "existing_strict") {
      return parentCodeRejection(parentResolution, `Mission ${envelopeMission.id} has no single authoritative stable code, so no Action number can be allocated.`);
    }
    const scope = parentScopeOf(parentResolution.code);
    if (!scope) {
      return rejected("PARENT_STABLE_CODE_NONCONFORMING", "The Mission code is not a usable allocation scope.");
    }
    const next = highestClaimedOrdinal(scope, scanRecords(), "action") + 1;
    if (next > maximumOrdinal) {
      return rejected("IDENTIFIER_SPACE_EXHAUSTED", `Mission ${parentResolution.code} has no remaining three-digit Action number.`);
    }
    const stableCode = `${parentResolution.code}.A${paddedOrdinal(next)}`;
    const id = identities.recordId("action");
    const predecessors = resolvedPredecessors.get(proposal.proposalId) ?? [];

    // Last fail-closed guard against a degenerate identity source, in the same
    // spirit as the Git identity collision check below. Every reference was
    // already proven to name a record that existed *before* this transaction, so
    // this can only fire if the identity factory hands back an id another record
    // already holds — in which case the new Action would declare itself as its
    // own predecessor. That is refused rather than written.
    if (predecessors.some((binding) => binding.predecessorActionId === id)) {
      return rejected(
        "PREDECESSOR_SELF_REFERENCE",
        `Proposal ${proposal.proposalId} would allocate record ${id}, which its own predecessor list already names.`,
      );
    }

    actions.push({
      ...newBaseRecord({ id, stableCode, title: target.title, description: target.description, occurredAt }),
      type: "action",
      missionId: envelopeMission.id,
      actionKind: target.actionKind,
      operationalContext: {
        owner: "Unassigned",
        blocker: "",
        nextGate: "Define the next gate.",
        evidenceReference: "",
        attentionState: "normal",
      },
      followUpToActionId: null,
      // Written explicitly and always, in the order the proposal declared it.
      // The follow-up lineage above stays `null`: a dependency is not a
      // follow-up, and neither field is ever derived from the other.
      predecessorActionIds: predecessors.map((binding) => binding.predecessorActionId),
    });
    created.push({
      proposalId: proposal.proposalId,
      disposition: "created",
      recordType: "action",
      opaqueRecordId: id,
      stableCode,
      stableCodeState: "allocated",
      recordRevision: 1,
      parentOpaqueId: envelopeMission.id,
      parentStableCode: parentResolution.code,
      git: deriveGitBinding({ recordType: "action", opaqueRecordId: id, occurredAt }),
      predecessors,
    });
  }

  // Derivation is injective over canonical opaque record ids, so this guard no
  // longer compensates for a truncated identifier. It is retained as the last
  // fail-closed defense against a degenerate identity source that hands back an
  // id already held by another record in the same transaction.
  const branches = [...created, ...linked]
    .map((record) => record.git.branch)
    .filter((branch): branch is string => branch !== null);
  if (new Set(branches).size !== branches.length) {
    return rejected("GIT_IDENTITY_COLLISION", "Two selected records derive the same receipt-bound Git identity.");
  }

  const auditEventId = identities.auditEventId();
  const auditSequence = state.nextAuditSequence;
  const auditEntityType = envelopeMission ? "mission" : "campaign";
  const auditEntityId = envelopeMission ? envelopeMission.id : campaign.id;

  const core: SessionWorkPlanAllocationReceiptCore = {
    contractVersion: sessionWorkPlanAllocationContractVersion,
    receiptId: identities.receiptId(),
    identifierOntology: identifierOntologyRevision,
    outcome: "applied",
    occurredAt,
    plan: request.plan,
    decision: request.decision,
    envelope: request.envelope,
    idempotencyKey: request.idempotencyKey,
    requestBindingDigest: request.requestBindingDigest,
    before,
    resultRevision: before.revision + 1,
    treatment,
    created,
    linked,
    unallocatedProposalIds,
    audit: {
      kind: sessionWorkPlanAllocationAuditKind,
      eventId: auditEventId,
      sequence: auditSequence,
      entityType: auditEntityType,
      entityId: auditEntityId,
    },
    numbering: numberingBasis,
    predecessorContract,
    automaticRetryScheduled: false,
    immutable: true,
  };
  const coreDigest = await sessionWorkPlanAllocationReceiptCoreDigest(core);

  const auditEvent: AuditEvent = {
    id: auditEventId,
    sequence: auditSequence,
    occurredAt,
    actor: "Commander",
    origin: "direct",
    kind: sessionWorkPlanAllocationAuditKind,
    entityType: auditEntityType,
    entityId: auditEntityId,
    summary: `Applied Commander Session Work Plan selection ${request.plan.planId} revision ${request.plan.planRevision}: ${created.length} allocated, ${linked.length} linked, ${unallocatedProposalIds.length} left unallocated, ${created.reduce((total, record) => total + record.predecessors.length, 0)} predecessor dependencies bound.`,
    detail: {
      idempotencyKey: request.idempotencyKey,
      requestBindingDigest: request.requestBindingDigest,
      receiptCoreDigest: coreDigest,
      receipt: canonicalHostedJson(core),
    },
  };

  // Only the fragment this transaction adds is scanned. Scanning the whole
  // inherited document would let unrelated historical content block a
  // legitimate allocation, and the inherited content already passed this same
  // control on the write that stored it.
  const addedFragment = {
    createdMissions: missions.slice(state.missions.length),
    createdActions: actions.slice(state.actions.length),
    auditEvent,
  };
  if (findAuthSecretViolations(addedFragment, "session-work-plan-allocation-result").length) {
    return rejected("STATE_SECRET_VIOLATION", "The computed transaction fragment contains prohibited material.");
  }

  const nextState: SessionWorkPlanAllocationStateDocument = {
    ...state,
    nextAuditSequence: state.nextAuditSequence + 1,
    missions,
    actions,
    auditEvents: [...state.auditEvents, auditEvent],
  };

  return { status: "planned", core, coreDigest, nextState, auditEvent };
}
