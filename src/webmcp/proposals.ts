/**
 * C001.M017.A001 — bounded draft, review, and confirmation preparation.
 *
 * This module is pure. It performs no I/O, reads no clock, generates no
 * identifier, holds no state, and imports nothing but the WebMCP contracts: no
 * repository, no `/api/state`, no authentication, no provider, no deployment
 * path, and no lifecycle-command executor. Every non-deterministic input is
 * supplied by the caller, so the same draft and the same preparation always
 * produce the same result, the same checks, in the same order.
 *
 * What it may change: nothing. It *computes* the next value of one ephemeral,
 * client-local draft and hands it back. The adapter passes that value to the
 * application's own draft setter. No function here can allocate a record code,
 * create a record, dispatch a command, approve, close, persist, publish, deploy,
 * spend, or reach a credential — none of those is expressible in its inputs or
 * its outputs.
 *
 * Two deliberate asymmetries, both of which favour the Commander:
 *
 * - **Over-limit input is refused, never truncated.** A plan silently cut down
 *   to fit reads as a complete plan. Bounds are therefore validated first, and
 *   `boundedText` afterwards only strips control characters and collapses
 *   separator runs in text that already fits.
 * - **An incomplete plan is reviewed, not refused.** `draft_session_plan`
 *   requires only identity, title, and target kind, because refusing an
 *   incomplete card would hide the exact gap `review_plan` exists to report. A
 *   refusal is reserved for a malformed request, a missing controller, a missing
 *   draft, an unknown or ineligible target, and mismatched authority.
 */

import {
  WEBMCP_LIMITS,
  WEBMCP_DRAFT_REVERSAL_NOTE,
  WEBMCP_REVIEW_DIMENSIONS,
  boundedText,
  type WebMcpClientDraft,
  type WebMcpClosurePreparation,
  type WebMcpConfirmationDraft,
  type WebMcpDraftReplacement,
  type WebMcpExperienceMode,
  type WebMcpPlanDraft,
  type WebMcpPlanDraftCard,
  type WebMcpPlanTargetKind,
  type WebMcpRefusalCode,
  type WebMcpReviewCheck,
  type WebMcpReviewCounts,
  type WebMcpReviewDimension,
  type WebMcpReviewResult,
  type WebMcpStateSnapshot,
} from "./contracts";

/**
 * Structurally identical to the adapter's own parse result, so a refusal
 * produced here is returned by the adapter unchanged rather than re-coded.
 */
export type WebMcpProposalResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reasonCode: WebMcpRefusalCode; readonly message: string };

function refuse<T>(reasonCode: WebMcpRefusalCode, message: string): WebMcpProposalResult<T> {
  return { ok: false, reasonCode, message };
}

const PLAN_TARGET_KINDS: readonly WebMcpPlanTargetKind[] = [
  "new_mission",
  "new_action",
  "existing_mission",
  "existing_action",
];

/** The two card kinds whose `target` names a record that must already exist. */
const EXISTING_TARGET_KINDS: readonly WebMcpPlanTargetKind[] = ["existing_mission", "existing_action"];

/* -------------------------------------------------------------------------- */
/* Typed plan target index                                                    */
/* -------------------------------------------------------------------------- */

export type WebMcpPlanRecordKind = "campaign" | "mission" | "action";

const PLAN_RECORD_KIND_LABELS: Readonly<Record<WebMcpPlanRecordKind, string>> = {
  campaign: "Campaign",
  mission: "Mission",
  action: "Action",
};

/**
 * What the active experience says each identifier denotes.
 *
 * `kinds` is built by `buildPlanTargetIndex` below from the snapshot's own
 * arrays and typed fields — never from the shape of the identifier text, which
 * is untrusted Commander data and carries no authority about record kind. An
 * identifier the snapshot reports under more than one kind is `"ambiguous"`
 * rather than resolved to a guess.
 *
 * `identifiers` is the wider all-record union. It exists for dependency
 * resolution, where any record kind is a legitimate predecessor, and is
 * deliberately *not* usable for parent/target validation: reading only that set
 * is exactly the defect this index replaces.
 */
export interface WebMcpPlanTargetIndex {
  readonly kinds: ReadonlyMap<string, WebMcpPlanRecordKind | "ambiguous">;
  readonly identifiers: ReadonlySet<string>;
}

/** The exact record kind each card kind requires of its named parent or target. */
const REQUIRED_TARGET_KIND: Readonly<Record<WebMcpPlanTargetKind, WebMcpPlanRecordKind>> = {
  new_mission: "campaign",
  new_action: "mission",
  existing_mission: "mission",
  existing_action: "action",
};

/**
 * Record one identifier's kind. A second, different kind for the same
 * identifier makes it ambiguous and keeps it ambiguous; nothing here resolves a
 * conflict by preferring one source over another.
 */
export function recordPlanTargetKind(
  kinds: Map<string, WebMcpPlanRecordKind | "ambiguous">,
  identifier: unknown,
  kind: WebMcpPlanRecordKind,
): void {
  if (typeof identifier !== "string" || !identifier) return;
  const existing = kinds.get(identifier);
  if (existing === undefined) {
    kinds.set(identifier, kind);
    return;
  }
  if (existing !== kind) kinds.set(identifier, "ambiguous");
}

/**
 * What each identifier in the active experience denotes, and the wider union of
 * every identifier it contains.
 *
 * Kinds are read from the snapshot's own structure — which array a record came
 * from, and which typed parent field named it — never from the shape of the
 * identifier text. `recordType` is the one string field consulted, and only its
 * two exact governed values are honoured: it is Commander-adjacent projection
 * text, so anything else contributes an identifier without a kind rather than a
 * guessed one.
 *
 * The union is wider than the kind map on purpose. A plan card may depend on any
 * record kind, so dependency resolution reads `identifiers`; a parent or target
 * must be one exact kind, so `parentTargetCheck` reads `kinds`.
 *
 * Exported because every surface that classifies a plan target — the WebMCP
 * adapter today, a visible review surface later — must read one index derived
 * one way. A second derivation is precisely how a wrong-kind parent returns.
 */
export function buildPlanTargetIndex(snapshot: WebMcpStateSnapshot): WebMcpPlanTargetIndex {
  // The all-record union first: every Mission, Action, and open-work record
  // identifier is a legitimate predecessor for dependency resolution, whether or
  // not the snapshot also reports a kind for it.
  const identifiers = new Set<string>();
  for (const mission of snapshot.missions) identifiers.add(mission.id);
  for (const action of snapshot.actions) identifiers.add(action.id);
  for (const entry of snapshot.openWorkIndex) identifiers.add(entry.recordId);

  const kinds = new Map<string, WebMcpPlanRecordKind | "ambiguous">();

  for (const campaign of snapshot.campaigns) {
    identifiers.add(campaign.id);
    recordPlanTargetKind(kinds, campaign.id, "campaign");
  }
  for (const mission of snapshot.missions) recordPlanTargetKind(kinds, mission.id, "mission");
  for (const action of snapshot.actions) recordPlanTargetKind(kinds, action.id, "action");

  for (const entry of snapshot.openWorkIndex) {
    identifiers.add(entry.missionId);
    recordPlanTargetKind(kinds, entry.missionId, "mission");
    if (typeof entry.campaignId === "string") {
      identifiers.add(entry.campaignId);
      recordPlanTargetKind(kinds, entry.campaignId, "campaign");
    }
    if (entry.recordType === "mission" || entry.recordType === "action") {
      recordPlanTargetKind(kinds, entry.recordId, entry.recordType);
    }
  }
  for (const rollup of snapshot.missionOpenWorkRollups) {
    identifiers.add(rollup.missionId);
    identifiers.add(rollup.campaignId);
    recordPlanTargetKind(kinds, rollup.missionId, "mission");
    recordPlanTargetKind(kinds, rollup.campaignId, "campaign");
  }

  return { kinds, identifiers };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownKeyOf(candidate: Record<string, unknown>, permitted: readonly string[]): string | null {
  for (const key of Object.keys(candidate)) {
    if (!permitted.includes(key)) return key;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Bounded text and list parsing                                              */
/* -------------------------------------------------------------------------- */

/**
 * One bounded untrusted string. `required` distinguishes a field the card
 * cannot exist without from one whose absence is a review finding rather than a
 * malformed request.
 */
function parseText(
  candidate: Record<string, unknown>,
  key: string,
  label: string,
  maximum: number,
  required: boolean,
): WebMcpProposalResult<string> {
  const raw = candidate[key];
  if (raw === undefined || raw === null) {
    if (required) return refuse("invalid_input", `${label} is required.`);
    return { ok: true, value: "" };
  }
  if (typeof raw !== "string") return refuse("invalid_input", `${label} must be a string.`);
  if (raw.length > maximum) {
    return refuse("limit_exceeded", `${label} exceeds ${maximum} characters.`);
  }
  const normalized = boundedText(raw, maximum);
  if (required && !normalized) return refuse("invalid_input", `${label} must not be empty.`);
  return { ok: true, value: normalized };
}

function parseTextList(
  candidate: Record<string, unknown>,
  key: string,
  label: string,
): WebMcpProposalResult<string[]> {
  const raw = candidate[key];
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return refuse("invalid_input", `${label} must be an array of strings.`);
  if (raw.length > WEBMCP_LIMITS.maximumListItems) {
    return refuse("limit_exceeded", `${label} must not exceed ${WEBMCP_LIMITS.maximumListItems} entries.`);
  }
  const entries: string[] = [];
  for (const [index, item] of raw.entries()) {
    if (typeof item !== "string") return refuse("invalid_input", `${label} entry ${index + 1} must be a string.`);
    if (item.length > WEBMCP_LIMITS.listItemMaxLength) {
      return refuse("limit_exceeded", `${label} entry ${index + 1} exceeds ${WEBMCP_LIMITS.listItemMaxLength} characters.`);
    }
    const normalized = boundedText(item, WEBMCP_LIMITS.listItemMaxLength);
    if (!normalized) return refuse("invalid_input", `${label} entry ${index + 1} must not be empty.`);
    entries.push(normalized);
  }
  return { ok: true, value: entries };
}

/* -------------------------------------------------------------------------- */
/* draft_session_plan input                                                   */
/* -------------------------------------------------------------------------- */

const PLAN_INPUT_KEYS = ["intent", "proposals"] as const;

const CARD_KEYS = [
  "proposalId",
  "title",
  "outcome",
  "targetKind",
  "target",
  "dependsOn",
  "acceptanceCriteria",
  "verification",
  "evidenceReferences",
  "exclusions",
  "stopConditions",
  "protectedGates",
] as const;

function parseCard(value: unknown, position: number): WebMcpProposalResult<WebMcpPlanDraftCard> {
  const label = `Proposal card ${position}`;
  if (!isRecord(value)) return refuse("invalid_input", `${label} must be an object.`);
  const unknownKey = unknownKeyOf(value, CARD_KEYS);
  if (unknownKey) {
    return refuse("invalid_input", `${label} has unsupported property "${boundedText(unknownKey, 60)}".`);
  }

  const proposalId = parseText(value, "proposalId", `${label} proposalId`, WEBMCP_LIMITS.proposalIdMaxLength, true);
  if (!proposalId.ok) return proposalId;
  const title = parseText(value, "title", `${label} title`, WEBMCP_LIMITS.titleMaxLength, true);
  if (!title.ok) return title;

  const targetKind = value.targetKind;
  if (typeof targetKind !== "string" || !PLAN_TARGET_KINDS.includes(targetKind as WebMcpPlanTargetKind)) {
    return refuse("invalid_input", `${label} targetKind must be one of ${PLAN_TARGET_KINDS.join(", ")}.`);
  }

  const outcome = parseText(value, "outcome", `${label} outcome`, WEBMCP_LIMITS.outcomeMaxLength, false);
  if (!outcome.ok) return outcome;
  const target = parseText(value, "target", `${label} target`, WEBMCP_LIMITS.identifierMaxLength, false);
  if (!target.ok) return target;
  const verification = parseText(value, "verification", `${label} verification`, WEBMCP_LIMITS.verificationMaxLength, false);
  if (!verification.ok) return verification;

  const dependsOn = parseTextList(value, "dependsOn", `${label} dependsOn`);
  if (!dependsOn.ok) return dependsOn;
  const acceptanceCriteria = parseTextList(value, "acceptanceCriteria", `${label} acceptanceCriteria`);
  if (!acceptanceCriteria.ok) return acceptanceCriteria;
  const evidenceReferences = parseTextList(value, "evidenceReferences", `${label} evidenceReferences`);
  if (!evidenceReferences.ok) return evidenceReferences;
  const exclusions = parseTextList(value, "exclusions", `${label} exclusions`);
  if (!exclusions.ok) return exclusions;
  const stopConditions = parseTextList(value, "stopConditions", `${label} stopConditions`);
  if (!stopConditions.ok) return stopConditions;
  const protectedGates = parseTextList(value, "protectedGates", `${label} protectedGates`);
  if (!protectedGates.ok) return protectedGates;

  return {
    ok: true,
    value: {
      proposalId: proposalId.value,
      title: title.value,
      outcome: outcome.value,
      targetKind: targetKind as WebMcpPlanTargetKind,
      target: target.value,
      dependsOn: dependsOn.value,
      acceptanceCriteria: acceptanceCriteria.value,
      verification: verification.value,
      evidenceReferences: evidenceReferences.value,
      exclusions: exclusions.value,
      stopConditions: stopConditions.value,
      protectedGates: protectedGates.value,
    },
  };
}

/**
 * Parse one `draft_session_plan` request into a bounded, data-only plan draft.
 *
 * A duplicate `proposalId` is refused rather than reviewed: two cards under one
 * label make "the exact current draft" ambiguous for dependency resolution and
 * for the Commander's own selection, so it is a malformed request, not a plan
 * defect. This is the same rule the P04-FU01 allocation contract enforces as
 * `DUPLICATE_PROPOSAL_ID`, applied one step earlier.
 */
export function parsePlanDraftInput(input: unknown): WebMcpProposalResult<WebMcpPlanDraft> {
  if (!isRecord(input)) {
    return refuse("invalid_input", "draft_session_plan requires an object with intent and proposals.");
  }
  const unknownKey = unknownKeyOf(input, PLAN_INPUT_KEYS);
  if (unknownKey) {
    return refuse("invalid_input", `Unsupported argument "${boundedText(unknownKey, 60)}".`);
  }

  const intent = parseText(input, "intent", "intent", WEBMCP_LIMITS.intentMaxLength, true);
  if (!intent.ok) return intent;

  const proposals = input.proposals;
  if (!Array.isArray(proposals)) return refuse("invalid_input", '"proposals" must be an array of proposal cards.');
  if (proposals.length === 0) return refuse("invalid_input", '"proposals" must contain at least one proposal card.');
  if (proposals.length > WEBMCP_LIMITS.maximumProposalCards) {
    return refuse("limit_exceeded", `"proposals" must not exceed ${WEBMCP_LIMITS.maximumProposalCards} cards.`);
  }

  const cards: WebMcpPlanDraftCard[] = [];
  const seen = new Set<string>();
  for (const [index, candidate] of proposals.entries()) {
    const card = parseCard(candidate, index + 1);
    if (!card.ok) return card;
    if (seen.has(card.value.proposalId)) {
      return refuse("invalid_input", `Proposal identifier "${card.value.proposalId}" appears more than once.`);
    }
    seen.add(card.value.proposalId);
    cards.push(card.value);
  }

  return { ok: true, value: { intent: intent.value, cards } };
}

/* -------------------------------------------------------------------------- */
/* prepare_confirmation input                                                 */
/* -------------------------------------------------------------------------- */

export interface WebMcpConfirmationRequest {
  readonly actionId: string;
  /** `null` when the caller pinned no revision. A supplied value must match exactly. */
  readonly expectedRevision: number | null;
}

const CONFIRMATION_INPUT_KEYS = ["actionId", "expectedRevision"] as const;

export function parseConfirmationInput(input: unknown): WebMcpProposalResult<WebMcpConfirmationRequest> {
  if (!isRecord(input)) {
    return refuse("invalid_input", "prepare_confirmation requires an object with an exact actionId.");
  }
  const unknownKey = unknownKeyOf(input, CONFIRMATION_INPUT_KEYS);
  if (unknownKey) {
    return refuse("invalid_input", `Unsupported argument "${boundedText(unknownKey, 60)}".`);
  }

  const raw = input.actionId;
  if (typeof raw !== "string") return refuse("invalid_input", '"actionId" must be a string.');
  const trimmed = raw.trim();
  if (!trimmed) return refuse("invalid_input", '"actionId" must not be empty.');
  if (trimmed.length > WEBMCP_LIMITS.identifierMaxLength) {
    return refuse("limit_exceeded", `"actionId" exceeds ${WEBMCP_LIMITS.identifierMaxLength} characters.`);
  }
  // Identifiers are compared exactly, so a value normalization would alter is
  // refused rather than repaired — the same rule the read tools apply.
  if (boundedText(trimmed, WEBMCP_LIMITS.identifierMaxLength) !== trimmed) {
    return refuse("invalid_input", '"actionId" contains characters that are not permitted in a record identifier.');
  }

  let expectedRevision: number | null = null;
  if ("expectedRevision" in input && input.expectedRevision !== undefined && input.expectedRevision !== null) {
    const value = input.expectedRevision;
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return refuse("invalid_input", '"expectedRevision" must be a whole number.');
    }
    if (value < 1) return refuse("invalid_input", '"expectedRevision" must be at least 1.');
    if (value > WEBMCP_LIMITS.maximumRevision) {
      return refuse("limit_exceeded", `"expectedRevision" must not exceed ${WEBMCP_LIMITS.maximumRevision}.`);
    }
    expectedRevision = value;
  }

  return { ok: true, value: { actionId: trimmed, expectedRevision } };
}

/* -------------------------------------------------------------------------- */
/* Client draft transitions                                                   */
/* -------------------------------------------------------------------------- */

function usablePart(value: unknown): boolean {
  return value === null || isRecord(value);
}

/**
 * True only for a draft this adapter could have produced. A reader that returns
 * something else is reported as an unusable controller rather than overwritten:
 * silently replacing an unreadable draft would discard whatever the Commander is
 * actually looking at.
 */
export function usableClientDraft(value: unknown): value is WebMcpClientDraft {
  if (!isRecord(value)) return false;
  if (typeof value.revision !== "number" || !Number.isInteger(value.revision) || value.revision < 1) return false;
  if (typeof value.mode !== "string") return false;
  return usablePart(value.plan) && usablePart(value.confirmation);
}

export interface WebMcpDraftTransition {
  readonly draft: WebMcpClientDraft;
  readonly replacement: WebMcpDraftReplacement;
}

function nextRevision(current: WebMcpClientDraft | null): WebMcpProposalResult<number> {
  const revision = (current?.revision ?? 0) + 1;
  if (revision > WEBMCP_LIMITS.maximumRevision) {
    return refuse("limit_exceeded", `This page draft has reached the ${WEBMCP_LIMITS.maximumRevision} revision ceiling. Reload CASTRA to start a new draft.`);
  }
  return { ok: true, value: revision };
}

/**
 * Compute the draft that replaces the plan part. The confirmation part is
 * carried through untouched: a new plan draft never silently discards a
 * confirmation the Commander is already reviewing.
 */
export function planDraftTransition(input: {
  contractVersion: WebMcpClientDraft["contractVersion"];
  mode: WebMcpExperienceMode;
  current: WebMcpClientDraft | null;
  plan: WebMcpPlanDraft;
}): WebMcpProposalResult<WebMcpDraftTransition> {
  const revision = nextRevision(input.current);
  if (!revision.ok) return revision;
  return {
    ok: true,
    value: {
      draft: {
        contractVersion: input.contractVersion,
        revision: revision.value,
        mode: input.mode,
        plan: input.plan,
        confirmation: input.current?.confirmation ?? null,
      },
      replacement: {
        replacedPart: "plan",
        previousRevision: input.current?.revision ?? null,
        resultingRevision: revision.value,
        reversal: WEBMCP_DRAFT_REVERSAL_NOTE,
      },
    },
  };
}

/** The mirror image: replace the confirmation part and carry the plan through. */
export function confirmationDraftTransition(input: {
  contractVersion: WebMcpClientDraft["contractVersion"];
  mode: WebMcpExperienceMode;
  current: WebMcpClientDraft | null;
  confirmation: WebMcpConfirmationDraft;
}): WebMcpProposalResult<WebMcpDraftTransition> {
  const revision = nextRevision(input.current);
  if (!revision.ok) return revision;
  return {
    ok: true,
    value: {
      draft: {
        contractVersion: input.contractVersion,
        revision: revision.value,
        mode: input.mode,
        plan: input.current?.plan ?? null,
        confirmation: input.confirmation,
      },
      replacement: {
        replacedPart: "confirmation",
        previousRevision: input.current?.revision ?? null,
        resultingRevision: revision.value,
        reversal: WEBMCP_DRAFT_REVERSAL_NOTE,
      },
    },
  };
}

/* -------------------------------------------------------------------------- */
/* review_plan                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The review rules, stated once so a Commander reading a finding can see why it
 * carries the weight it does.
 *
 * `blocking` is reserved for a gap that makes a governed selection impossible:
 * the card states no outcome, names no target or an unknown one, depends on
 * something that resolves to nothing, states no acceptance criterion, states no
 * verification, or states no stop condition. Everything else that CASTRA
 * doctrine wants — bound evidence, explicit exclusions, named protected gates —
 * is reported as `attention`, because a plan can legitimately reach the
 * Commander with evidence still to be produced.
 *
 * `readyForCommanderSelection` therefore means only "no blocking finding". It is
 * never an approval, an acceptance, or a verification, and the payload says so.
 */
const SHORT_INTENT_THRESHOLD = 24;

function check(
  checkId: string,
  dimension: WebMcpReviewDimension,
  proposalId: string | null,
  result: WebMcpReviewResult,
  detail: string,
): WebMcpReviewCheck {
  return { checkId, dimension, proposalId, result, detail };
}

/** Cards that reference each other in a cycle can never be sequenced. */
function hasDependencyCycle(cards: readonly WebMcpPlanDraftCard[]): boolean {
  const edges = new Map<string, readonly string[]>();
  for (const card of cards) edges.set(card.proposalId, card.dependsOn);
  const visiting = new Set<string>();
  const settled = new Set<string>();

  const walk = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (settled.has(id)) return false;
    visiting.add(id);
    for (const next of edges.get(id) ?? []) {
      if (edges.has(next) && walk(next)) return true;
    }
    visiting.delete(id);
    settled.add(id);
    return false;
  };

  return [...edges.keys()].some((id) => walk(id));
}

function planLevelChecks(plan: WebMcpPlanDraft): WebMcpReviewCheck[] {
  const checks: WebMcpReviewCheck[] = [];

  checks.push(plan.intent.length < SHORT_INTENT_THRESHOLD
    ? check("plan/scope", "scope", null, "attention", `The bound Commander intent is ${plan.intent.length} characters. A plan cannot be checked for scope fit against an intent this short.`)
    : check("plan/scope", "scope", null, "pass", `The plan is bound to ${plan.intent.length} characters of Commander intent across ${plan.cards.length} card(s).`));

  const existingTargets = plan.cards
    .filter((card) => EXISTING_TARGET_KINDS.includes(card.targetKind) && card.target)
    .map((card) => card.target);
  const duplicated = existingTargets.find((target, index) => existingTargets.indexOf(target) !== index) ?? null;
  checks.push(duplicated
    ? check("plan/parent_target", "parent_target", null, "blocking", `Record ${duplicated} is targeted by more than one card. One record cannot be the subject of two selections in one plan.`)
    : check("plan/parent_target", "parent_target", null, "pass", "No existing record is targeted by more than one card."));

  checks.push(hasDependencyCycle(plan.cards)
    ? check("plan/dependencies_sequence", "dependencies_sequence", null, "blocking", "The declared dependencies form a cycle, so the cards cannot be sequenced.")
    : check("plan/dependencies_sequence", "dependencies_sequence", null, "pass", "The declared dependencies can be sequenced."));

  return checks;
}

/**
 * The parent/target dimension for one card.
 *
 * Presence is necessary and not sufficient. The named record must also be the
 * exact kind the card kind requires, because a plan whose new Action is parented
 * by a Campaign is not selectable, and reporting it `pass` would let a
 * wrong-kind parent reach the Commander as ready.
 */
function parentTargetCheck(
  card: WebMcpPlanDraftCard,
  prefix: string,
  targets: WebMcpPlanTargetIndex,
): WebMcpReviewCheck {
  const id = card.proposalId;
  const checkId = `${prefix}/parent_target`;
  const noun = EXISTING_TARGET_KINDS.includes(card.targetKind) ? "target" : "parent";
  const required = REQUIRED_TARGET_KIND[card.targetKind];
  const requiredLabel = PLAN_RECORD_KIND_LABELS[required];

  if (!card.target) {
    return check(checkId, "parent_target", id, "blocking", `A ${card.targetKind} card must name its ${requiredLabel} ${noun} record.`);
  }
  if (!targets.identifiers.has(card.target)) {
    return check(checkId, "parent_target", id, "blocking", `The named ${noun} ${card.target} is not present in the active experience. Nothing was inferred or substituted.`);
  }

  const resolved = targets.kinds.get(card.target);
  if (resolved === undefined) {
    return check(checkId, "parent_target", id, "blocking", `The active experience contains ${card.target} but reports no record kind for it, so it cannot be confirmed as a ${requiredLabel}. Nothing was inferred from the identifier itself.`);
  }
  if (resolved === "ambiguous") {
    return check(checkId, "parent_target", id, "blocking", `The active experience reports ${card.target} under more than one record kind, so it cannot be confirmed as a ${requiredLabel}. Nothing was resolved by preference.`);
  }
  if (resolved !== required) {
    return check(checkId, "parent_target", id, "blocking", `A ${card.targetKind} card requires a ${requiredLabel} ${noun}, but ${card.target} is a ${PLAN_RECORD_KIND_LABELS[resolved]} in the active experience.`);
  }
  return check(checkId, "parent_target", id, "pass", `The named ${noun} ${card.target} is a ${requiredLabel} in the active experience.`);
}

function cardChecks(
  card: WebMcpPlanDraftCard,
  position: number,
  siblingIds: readonly string[],
  targets: WebMcpPlanTargetIndex,
): WebMcpReviewCheck[] {
  const prefix = `card-${position}`;
  const id = card.proposalId;
  const checks: WebMcpReviewCheck[] = [];

  checks.push(card.outcome
    ? check(`${prefix}/scope`, "scope", id, "pass", "One primary outcome is stated.")
    : check(`${prefix}/scope`, "scope", id, "blocking", "No primary outcome is stated, so the Commander cannot judge what selecting this card would achieve."));

  checks.push(parentTargetCheck(card, prefix, targets));

  // Dependency resolution deliberately uses the all-record union: any record
  // kind is a legitimate predecessor, so the kind rule above must not narrow it.
  const unresolved = card.dependsOn.filter((entry) => !siblingIds.includes(entry) && !targets.identifiers.has(entry));
  const forward = card.dependsOn.filter((entry) => siblingIds.indexOf(entry) > position - 1);
  if (unresolved.length > 0) {
    checks.push(check(`${prefix}/dependencies_sequence`, "dependencies_sequence", id, "blocking", `Dependency ${unresolved[0]} names neither a card in this plan nor a record in the active experience.`));
  } else if (card.dependsOn.length === 0) {
    checks.push(check(`${prefix}/dependencies_sequence`, "dependencies_sequence", id, "pass", "This card declares no dependency and can be sequenced independently."));
  } else if (forward.length > 0) {
    checks.push(check(`${prefix}/dependencies_sequence`, "dependencies_sequence", id, "attention", `This card is listed before ${forward[0]}, which it depends on. Confirm the execution order.`));
  } else {
    checks.push(check(`${prefix}/dependencies_sequence`, "dependencies_sequence", id, "pass", `All ${card.dependsOn.length} declared dependencies resolve and precede this card.`));
  }

  checks.push(card.acceptanceCriteria.length > 0
    ? check(`${prefix}/acceptance_criteria`, "acceptance_criteria", id, "pass", `${card.acceptanceCriteria.length} acceptance criterion(s) are stated.`)
    : check(`${prefix}/acceptance_criteria`, "acceptance_criteria", id, "blocking", "No acceptance criterion is stated, so there is no agreed definition of done."));

  if (!card.verification) {
    checks.push(check(`${prefix}/verification_evidence`, "verification_evidence", id, "blocking", "No verification is stated. CASTRA requires a named verification path before work is selected."));
  } else if (card.evidenceReferences.length === 0) {
    checks.push(check(`${prefix}/verification_evidence`, "verification_evidence", id, "attention", "Verification is stated but no evidence reference is bound yet. Evidence may be produced during execution; it must exist before closure."));
  } else {
    checks.push(check(`${prefix}/verification_evidence`, "verification_evidence", id, "pass", `Verification is stated and ${card.evidenceReferences.length} evidence reference(s) are bound.`));
  }

  checks.push(card.exclusions.length > 0
    ? check(`${prefix}/exclusions`, "exclusions", id, "pass", `${card.exclusions.length} exclusion(s) are stated.`)
    : check(`${prefix}/exclusions`, "exclusions", id, "attention", "No exclusion is stated, so the boundary of this card is implicit."));

  checks.push(card.stopConditions.length > 0
    ? check(`${prefix}/stop_conditions`, "stop_conditions", id, "pass", `${card.stopConditions.length} stop condition(s) are stated.`)
    : check(`${prefix}/stop_conditions`, "stop_conditions", id, "blocking", "No stop condition is stated, so nothing tells an executor when to stop and return to the Commander."));

  checks.push(card.protectedGates.length > 0
    ? check(`${prefix}/protected_gates`, "protected_gates", id, "pass", `${card.protectedGates.length} protected gate(s) are named and remain separate Commander decisions.`)
    : check(`${prefix}/protected_gates`, "protected_gates", id, "attention", "No protected gate is named. Name every approval, financial, destructive, credential, Production, authority-transfer, or material-scope gate this card approaches."));

  return checks;
}

/**
 * Every check, in a fixed order: the three plan-level checks first, then each
 * card in declared order, each contributing exactly one check per dimension in
 * `WEBMCP_REVIEW_DIMENSIONS` order. The same draft always produces the same
 * array.
 */
export function reviewPlanDraft(
  plan: WebMcpPlanDraft,
  targets: WebMcpPlanTargetIndex,
): WebMcpReviewCheck[] {
  const siblingIds = plan.cards.map((card) => card.proposalId);
  const checks = planLevelChecks(plan);
  for (const [index, card] of plan.cards.entries()) {
    checks.push(...cardChecks(card, index + 1, siblingIds, targets));
  }
  return checks;
}

export function summarizeReview(checks: readonly WebMcpReviewCheck[]): WebMcpReviewCounts {
  return {
    pass: checks.filter((entry) => entry.result === "pass").length,
    attention: checks.filter((entry) => entry.result === "attention").length,
    blocking: checks.filter((entry) => entry.result === "blocking").length,
  };
}

/** Exported so a consumer can assert the reported dimension order rather than assume it. */
export const REVIEW_DIMENSION_ORDER = WEBMCP_REVIEW_DIMENSIONS;

/* -------------------------------------------------------------------------- */
/* prepare_confirmation                                                       */
/* -------------------------------------------------------------------------- */

function boundedIssues(issues: readonly string[]): string[] {
  return issues
    .slice(0, WEBMCP_LIMITS.maximumIssues)
    .map((issue) => boundedText(issue, WEBMCP_LIMITS.summaryMaxLength))
    .filter(Boolean);
}

/**
 * Turn one application-supplied closure review into the staged confirmation.
 *
 * Nothing about closure eligibility is decided here. The application computes it
 * with its own `tier1DirectCloseReview` and hands the result in; this function
 * refuses when that result says the target is unknown, not the revision the
 * caller reasoned about, or not eligible, and otherwise shapes the exact fields
 * the Commander must see.
 *
 * Check order is deliberate. A revision mismatch is reported before eligibility,
 * because an eligibility answer computed against a revision the caller never saw
 * would describe a different record state than the one it asked about.
 */
export function buildConfirmationDraft(input: {
  request: WebMcpConfirmationRequest;
  preparation: WebMcpClosurePreparation;
}): WebMcpProposalResult<WebMcpConfirmationDraft> {
  const { request, preparation } = input;

  if (preparation.status === "unknown_target") {
    return refuse(
      "unknown_identifier",
      `No Action ${request.actionId} is present in the active experience. Nothing was inferred or substituted.`,
    );
  }

  if (request.expectedRevision !== null && request.expectedRevision !== preparation.expectedRevision) {
    return refuse(
      "stale_context",
      `Action ${preparation.actionId} is at revision ${preparation.expectedRevision}, not the expected ${request.expectedRevision}. Re-read the Action before staging a confirmation.`,
    );
  }

  if (!preparation.visible || !preparation.eligible) {
    const issues = boundedIssues(preparation.issues);
    const detail = issues.length > 0
      ? issues.join(" ")
      : "The Action is not currently in the state this confirmation stages.";
    return refuse(
      "target_not_eligible",
      `Action ${preparation.actionId} cannot be staged for Commander closure yet. ${detail}`,
    );
  }

  const evidenceReferences = preparation.evidenceReferences.map((reference) =>
    boundedText(reference, WEBMCP_LIMITS.evidenceMaxLength));
  if (evidenceReferences.length > WEBMCP_LIMITS.maximumConfirmationEvidence) {
    // Never shown short: the Commander must see the exact package that would be
    // bound, so an oversized package is refused rather than truncated.
    return refuse(
      "limit_exceeded",
      `Action ${preparation.actionId} binds ${evidenceReferences.length} evidence references, above the ${WEBMCP_LIMITS.maximumConfirmationEvidence}-reference lifecycle limit. The package must be reduced in CASTRA before it can be staged.`,
    );
  }

  const actionTitle = boundedText(preparation.actionTitle, WEBMCP_LIMITS.titleMaxLength);
  const evidenceCount = evidenceReferences.length;

  return {
    ok: true,
    value: {
      actionId: boundedText(preparation.actionId, WEBMCP_LIMITS.identifierMaxLength),
      actionTitle,
      missionId: boundedText(preparation.missionId, WEBMCP_LIMITS.identifierMaxLength),
      expectedRevision: preparation.expectedRevision,
      resultingRevision: preparation.resultingRevision,
      evidenceReferences,
      target: boundedText(preparation.target, WEBMCP_LIMITS.summaryMaxLength),
      effect: boundedText(preparation.effect, WEBMCP_LIMITS.gateMaxLength),
      rollback: boundedText(preparation.rollback, WEBMCP_LIMITS.gateMaxLength),
      alternatives: preparation.alternatives
        .slice(0, WEBMCP_LIMITS.maximumListItems)
        .map((alternative) => boundedText(alternative, WEBMCP_LIMITS.listItemMaxLength))
        .filter(Boolean),
      residualRisk: boundedText(preparation.residualRisk, WEBMCP_LIMITS.summaryMaxLength),
      confirmationLabel: boundedText(preparation.buttonLabel, WEBMCP_LIMITS.titleMaxLength),
      confirmationPrompt: `Close "${actionTitle}" (${preparation.actionId}) at revision ${preparation.expectedRevision}, binding the ${evidenceCount} evidence reference${evidenceCount === 1 ? "" : "s"} shown here? Nothing has been closed: this draft was prepared for you, and only your confirmation in CASTRA performs it.`,
      decidedBy: "commander_only",
      executedHere: false,
    },
  };
}
