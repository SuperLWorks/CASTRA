import type { CastraState } from "../domain/types";
import type { InitialImportCandidate } from "../domain/initialHostedStateImport";
import { INITIAL_IMPORT_IDEMPOTENCY_PREFIX } from "../domain/initialHostedStateImportContract";
import {
  hostedRequestBindingDigest,
  hostedRestoreBinding,
  hostedStateDocumentDigest,
  hostedWriteBinding,
} from "../domain/hostedOperationalStateDigest";
import {
  readActionPredecessorIds,
  type ActionPredecessorRelationProblem,
} from "../domain/sessionWorkPlanAllocation";
import { normalizeState, type StateRepository } from "./repository";
import {
  IndexedDbPendingHostedStateCommandStore,
  type PendingHostedStateCommandRecord,
  type PendingHostedStateCommandStore,
  type PreparedHostedStateCommand,
  type PreparedHostedStateInitialImport,
  type PreparedHostedStateRestore,
  type PreparedHostedStateWrite,
} from "./hostedStatePendingCommand";

export type { PendingHostedStateCommandRecord, PreparedHostedStateCommand, PreparedHostedStateInitialImport, PreparedHostedStateRestore, PreparedHostedStateWrite } from "./hostedStatePendingCommand";

export type HostedStateAvailability = "disabled_pre_cutover" | "empty" | "loaded" | "denied" | "unavailable";

export interface HostedStateLoadResult {
  availability: HostedStateAvailability;
  revision: number;
  state: CastraState | null;
  stateDigest: string | null;
  reasonCode: string | null;
}

export interface HostedStateWriteResult {
  outcome: "applied" | "restored" | "replayed" | "rejected";
  revision: number;
  reasonCode: string;
}

export interface HostedStateTransport {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  cookie(): string;
  requestReference(): string;
  idempotencyKey(commandType?: "write" | "restore" | "initial_import"): string;
}

export interface HostedStateBoundWriteContext {
  expectedRevision: number;
  resultingRevision: number;
  idempotencyKey: string;
}

/**
 * The verdict of the credential-free same-origin session resolution that runs
 * immediately before an authenticated hosted mutation.
 *
 * The readable `__Host-castra_csrf` proof the browser must echo on every write
 * is issued by the authentication boundary with a bounded lifetime. A page left
 * open past that lifetime still holds a valid application session, still shows
 * an authenticated Commander and loaded hosted state, and yet can no longer
 * dispatch a command. Resolving the session again re-issues the readable proof
 * and revalidates the current Commander receipt in one credential-free round
 * trip, so the Commander recovers without reloading the page.
 *
 * This is an availability control, never a security control. It does not
 * weaken, extend, or substitute for the server's CSRF, origin, application
 * session, or row-level controls: the dispatch below still requires a readable
 * proof and the server still validates it independently.
 */
export interface HostedStateSessionProofResult {
  authenticatedCommander: boolean;
  publicMessage: string;
}

export type HostedStateSessionProofRenewal = () => Promise<HostedStateSessionProofResult>;

/**
 * A known, no-mutation stop. The session could not be renewed as an
 * authenticated Commander, so nothing was prepared, retained, or dispatched and
 * there is no unknown outcome to reconcile.
 */
export class HostedStateSessionProofError extends Error {
  readonly commandDispatched = false as const;
  readonly commandRetained = false as const;
  readonly automaticRetryScheduled = false as const;

  constructor(readonly publicMessage: string) {
    super(`The authenticated Commander session could not be renewed, so no hosted command was dispatched. ${publicMessage} Sign in again on this CASTRA address, then reissue the command.`);
    this.name = "HostedStateSessionProofError";
  }
}

/**
 * Authoritative state moved past the revision and digest the Commander was
 * shown. The command is stopped before preparation, so nothing left the
 * browser; the caller adopts `fresh`, keeps any open form or review, and asks
 * for a second review of the current state.
 */
export class HostedStateStaleBaselineError extends Error {
  readonly commandDispatched = false as const;
  readonly commandRetained = false as const;

  constructor(
    readonly baseline: { revision: number; stateDigest: string },
    readonly fresh: HostedStateLoadResult,
  ) {
    super(`Authoritative hosted state advanced from revision ${baseline.revision} to revision ${fresh.revision} before this command was prepared. Nothing was dispatched. The refreshed state is now displayed; review it and issue the command again.`);
    this.name = "HostedStateStaleBaselineError";
  }
}

/**
 * A terminal receipt was returned, but the authoritative re-read does not match
 * the exact revision and state digest that receipt bound. The committed result
 * cannot be displayed and the local candidate must never be shown in its place.
 */
export class HostedStateUnconfirmedResultError extends Error {
  readonly reconciliationRequired = true as const;
  readonly localCandidateDisplayed = false as const;
  readonly automaticRetryScheduled = false as const;

  constructor(
    readonly result: HostedStateWriteResult,
    readonly expectedStateDigest: string,
    readonly reloaded: HostedStateLoadResult,
  ) {
    super(`The hosted command returned ${result.outcome} at revision ${result.revision}, but the authoritative re-read reported ${reloaded.availability} at revision ${reloaded.revision}. The displayed state was not replaced by the local candidate. Stop and reconcile the authoritative record before issuing another command.`);
    this.name = "HostedStateUnconfirmedResultError";
  }
}

/**
 * Everything a quiet authenticated page must satisfy before a deterministic
 * authoritative re-read is allowed to run on focus or visibility. There is no
 * model, no timer-driven write, and no external call in this decision.
 */
export interface HostedStateFreshnessGate {
  authoritativeHostedSession: boolean;
  availability: HostedStateAvailability | "checking_hosted";
  retainedUnknownCommand: boolean;
  commandInFlight: boolean;
  readOnlyReviewSession: boolean;
  demonstrationSession: boolean;
  documentVisible: boolean;
}

export interface HostedStateFreshnessGateResult {
  permitted: boolean;
  reason: string;
}

export function hostedStateRefreshPermitted(gate: HostedStateFreshnessGate): HostedStateFreshnessGateResult {
  // Public Demo is unauthenticated and memory-only and must never reach
  // `/api/state`; Review Mode is read-only; the local candidate path is not
  // operational authority and is not re-read from the hosted boundary.
  if (gate.demonstrationSession) return { permitted: false, reason: "public_demo_memory_only" };
  if (gate.readOnlyReviewSession) return { permitted: false, reason: "read_only_review_session" };
  if (!gate.authoritativeHostedSession) return { permitted: false, reason: "not_an_authenticated_hosted_session" };
  if (gate.availability !== "loaded") return { permitted: false, reason: `hosted_state_${gate.availability}` };
  if (gate.retainedUnknownCommand) return { permitted: false, reason: "retained_unknown_command" };
  if (gate.commandInFlight) return { permitted: false, reason: "command_in_flight" };
  if (!gate.documentVisible) return { permitted: false, reason: "document_not_visible" };
  return { permitted: true, reason: "authoritative_reread_permitted" };
}

export type HostedStateAdoptionVerdict = "unchanged" | "adopt" | "review_again" | "fail_closed";

export interface HostedStateAdoptionDecision {
  verdict: HostedStateAdoptionVerdict;
  message: string | null;
}

/**
 * Decides what a completed authoritative re-read may do to the display. An
 * unusable result never falls back to a cached or local document, and work in
 * progress is never overwritten — it is preserved with a review-again notice.
 */
export function hostedStateAdoptionDecision(input: {
  baseline: { revision: number; stateDigest: string | null };
  fresh: HostedStateLoadResult;
  userWorkInProgress: boolean;
}): HostedStateAdoptionDecision {
  const { baseline, fresh, userWorkInProgress } = input;
  if (fresh.availability !== "loaded" || !fresh.state || fresh.stateDigest === null) {
    return {
      verdict: "fail_closed",
      message: `Hosted operational state is ${fresh.availability}. The displayed state was not replaced and no local fallback was used.`,
    };
  }
  if (fresh.revision === baseline.revision && fresh.stateDigest === baseline.stateDigest) {
    return { verdict: "unchanged", message: null };
  }
  if (userWorkInProgress) {
    return {
      verdict: "review_again",
      message: `Authoritative hosted state advanced to revision ${fresh.revision} while your entry was open. Your entry was preserved and nothing was written. Review the refreshed state, then submit again.`,
    };
  }
  return {
    verdict: "adopt",
    message: `Adopted authoritative hosted revision ${fresh.revision}.`,
  };
}

/**
 * Selects the exact authoritative read one hosted write must prove itself
 * against before it is prepared.
 *
 * `rendered` is the confirmed result held in React state — the revision and
 * digest the Commander is being shown. It is the correct baseline for the first
 * write of a flow.
 *
 * It is not correct for a second write issued from the same asynchronous flow.
 * Replacing React state does not replace the value already captured by the
 * running closure, so `rendered` is still the pre-write revision N while the
 * authoritative store — and the display itself, once React re-renders — are
 * both already at N+1. Using it would stop a legitimate two-step workflow after
 * its first mutation had already applied, leaving the authoritative record with
 * the first step and never the second.
 *
 * So a confirmed preceding write in the same flow takes precedence and is the
 * only baseline source considered. A preceding result that is not a usable
 * loaded read fails closed to no baseline; it never falls back to the older
 * rendered one.
 *
 * This chooses which authoritative read is claimed as current. It does not
 * relax the proof of that claim: `confirmAuthoritativeBaseline` still re-reads
 * hosted state and still raises `HostedStateStaleBaselineError` before any
 * preparation or dispatch whenever the store has moved past the baseline.
 */
export function hostedWriteBaseline(input: {
  precedingConfirmedWrite?: HostedStateLoadResult | null;
  rendered: HostedStateLoadResult | null;
}): { revision: number; stateDigest: string } | null {
  const source = input.precedingConfirmedWrite ?? input.rendered;
  return source && source.availability === "loaded" && source.stateDigest !== null
    ? { revision: source.revision, stateDigest: source.stateDigest }
    : null;
}

const defaultTransport: HostedStateTransport = {
  fetch: (input, init) => globalThis.fetch(input, init),
  cookie: () => globalThis.document?.cookie ?? "",
  requestReference: () => `state-request:browser:${globalThis.crypto.randomUUID()}`,
  idempotencyKey: (commandType = "write") => commandType === "initial_import"
    ? `${INITIAL_IMPORT_IDEMPOTENCY_PREFIX}${globalThis.crypto.randomUUID()}`
    : `state-${commandType}:${globalThis.crypto.randomUUID()}`,
};

function readableCookie(name: string, cookieHeader: string): string | null {
  for (const entry of cookieHeader.split(";")) {
    const [key, ...value] = entry.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function responseObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

const terminalOutcomes = ["applied", "restored", "replayed", "rejected"] as const;
const terminalReasonCodes = ["STATE_APPLIED", "STATE_RESTORED", "EXACT_REPLAY", "STALE_REVISION", "ALTERED_IDEMPOTENCY_REUSE"] as const;
const digestPattern = /^sha256:[a-f0-9]{64}$/;

function terminalWriteResult(
  response: Response,
  value: Record<string, unknown> | null,
  command: PreparedHostedStateCommand,
): HostedStateWriteResult | null {
  if (
    !value
    || value.contractVersion !== "castra-hosted-operational-state/1.1.0"
    || value.migrationVersion !== "202608150002"
    || value.configured !== true
    || value.authority !== "castra_candidate_hosted_state"
    || value.providerTokensReturnedToBrowser !== false
    || value.serviceRoleUsed !== false
    || value.secretMaterialStored !== false
  ) return null;

  const outcome = String(value.status);
  if (!(terminalOutcomes as readonly string[]).includes(outcome)) return null;
  if ((outcome === "rejected" ? response.status !== 409 : response.status !== 200)) return null;
  if ((command.commandType === "write" || command.commandType === "initial_import") && outcome === "restored") return null;
  if (command.commandType === "restore" && outcome === "applied") return null;

  const revision = value.revision;
  const receipt = responseObject(value.receipt);
  const receiptOutcome = receipt ? String(receipt.outcome) : "";
  const reasonCode = receipt ? String(receipt.reasonCode) : "";
  const stateDigest = receipt?.stateDigest;
  if (
    typeof revision !== "number"
    || !Number.isSafeInteger(revision)
    || revision < 0
    || !receipt
    || receipt.idempotencyKey !== command.idempotencyKey
    || receipt.requestBindingDigest !== command.requestBindingDigest
    || typeof receipt.expectedRevision !== "number"
    || !Number.isSafeInteger(receipt.expectedRevision)
    || receipt.expectedRevision !== command.expectedRevision
    || typeof receipt.resultingRevision !== "number"
    || !Number.isSafeInteger(receipt.resultingRevision)
    || receipt.resultingRevision !== revision
    || receiptOutcome !== outcome
    || !(terminalReasonCodes as readonly string[]).includes(reasonCode)
    || value.reasonCode !== reasonCode
    || typeof receipt.occurredAt !== "string"
    || !receipt.occurredAt
    || receipt.immutable !== true
    || receipt.automaticRetryScheduled !== false
  ) return null;

  const expectedReason = outcome === "applied"
    ? "STATE_APPLIED"
    : outcome === "restored"
      ? "STATE_RESTORED"
      : outcome === "replayed"
        ? "EXACT_REPLAY"
        : null;
  if (expectedReason && reasonCode !== expectedReason) return null;
  if (outcome === "rejected" && reasonCode !== "STALE_REVISION" && reasonCode !== "ALTERED_IDEMPOTENCY_REUSE") return null;
  if (outcome === "rejected" ? stateDigest !== null : typeof stateDigest !== "string" || !digestPattern.test(stateDigest)) return null;

  if (command.commandType === "initial_import") {
    const initialReceipt = responseObject(value.initialImportReceipt);
    if (!initialReceipt
      || initialReceipt.contractVersion !== "castra-governed-initial-import-receipt/1.0.0"
      || initialReceipt.manifestDigest !== command.manifestDigest
      || initialReceipt.requestBindingDigest !== command.requestBindingDigest
      || initialReceipt.expectedRevision !== 0
      || initialReceipt.resultingRevision !== revision
      || initialReceipt.stateDigest !== stateDigest
      || initialReceipt.outcome !== outcome
      || initialReceipt.reasonCode !== reasonCode
      || initialReceipt.immutable !== true
      || initialReceipt.authorityAfterImport !== "notion_pre_cutover"
      || initialReceipt.detachedApprovalVerified !== true
      || initialReceipt.privateIdentityIncluded !== false
      || initialReceipt.secretMaterialStored !== false) return null;
  }

  return { outcome: outcome as HostedStateWriteResult["outcome"], revision, reasonCode };
}

/**
 * ACT-a5ae5f26 / P04-FU01 rework FW-P04-FU01-003 — predecessor integrity at the
 * authenticated hosted-authority read boundary.
 *
 * `normalizeState` deliberately passes `predecessorActionIds` through untouched,
 * so a hosted document carrying a malformed relation used to reach consumers,
 * where the lenient normalizer would drop the unreadable members and present the
 * remainder as the record's declared dependencies. Once hosted state is
 * activated, an unreadable authoritative document is unavailable, not partially
 * usable: this returns the exact problem and the caller fails closed with no
 * state, no digest, and no local substitute.
 *
 * Absence stays honest: a record written before this sub-contract carries no
 * field, `readActionPredecessorIds` reads that as the exact empty set, and it
 * remains loadable exactly as before.
 */
function hostedPredecessorRelationProblem(stateDocument: unknown): ActionPredecessorRelationProblem | null {
  if (stateDocument === null || typeof stateDocument !== "object") return null;
  const actions: unknown = (stateDocument as { actions?: unknown }).actions;
  // A document whose `actions` is not an array is already rejected downstream by
  // the state-digest comparison; this check owns only the relation itself.
  if (!Array.isArray(actions)) return null;
  for (const candidate of actions) {
    if (candidate === null || typeof candidate !== "object") continue;
    const read = readActionPredecessorIds((candidate as { predecessorActionIds?: unknown }).predecessorActionIds);
    if (read.status === "malformed") return read.problem;
  }
  return null;
}

export class HostedStateUnknownOutcomeError extends Error {
  readonly retainedDurably = true as const;

  constructor(readonly preparedCommand: PreparedHostedStateCommand) {
    super("The hosted state outcome is unknown. The exact command was retained. Reconcile it explicitly before issuing another command.");
    this.name = "HostedStateUnknownOutcomeError";
  }
}

export class HostedStateRepository implements StateRepository {
  private revision = 0;
  private availability: HostedStateAvailability = "disabled_pre_cutover";

  constructor(
    private readonly transport: HostedStateTransport = defaultTransport,
    private readonly pendingStore: PendingHostedStateCommandStore = new IndexedDbPendingHostedStateCommandStore(),
    private readonly sessionProofRenewal: HostedStateSessionProofRenewal | null = null,
  ) {}

  currentRevision(): number {
    return this.revision;
  }

  currentAvailability(): HostedStateAvailability {
    return this.availability;
  }

  pendingCommand(): Promise<PendingHostedStateCommandRecord | null> {
    return this.pendingStore.load();
  }

  async inspect(): Promise<HostedStateLoadResult> {
    let response: Response;
    try {
      response = await this.transport.fetch("/api/state", {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-CASTRA-Request-Reference": this.transport.requestReference(),
        },
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        referrerPolicy: "no-referrer",
      });
    } catch {
      this.availability = "unavailable";
      return { availability: "unavailable", revision: this.revision, state: null, stateDigest: null, reasonCode: "NETWORK_UNAVAILABLE" };
    }
    // A body the boundary declares as JSON but that cannot be read or parsed is
    // an unusable authoritative read, not a transport success. Normalizing it
    // here to the same fail-closed unavailable result as any other malformed
    // response is what stops a caller — the activation path and the quiet-page
    // re-read alike — from continuing to present hosted state as loaded and
    // writable after it. Nothing is substituted from a local or cached document.
    let value: Record<string, unknown> | null;
    try {
      value = response.headers.get("content-type")?.toLowerCase().includes("application/json")
      ? responseObject(await response.json())
      : null;
    } catch {
      this.availability = "unavailable";
      return { availability: "unavailable", revision: this.revision, state: null, stateDigest: null, reasonCode: "INVALID_RESPONSE" };
    }
    if (!value || value.contractVersion !== "castra-hosted-operational-state/1.1.0" || value.providerTokensReturnedToBrowser !== false || value.serviceRoleUsed !== false) {
      this.availability = "unavailable";
      return { availability: "unavailable", revision: this.revision, state: null, stateDigest: null, reasonCode: "INVALID_RESPONSE" };
    }
    const status = String(value.status);
    if (status === "disabled_pre_cutover") {
      this.availability = "disabled_pre_cutover";
      this.revision = 0;
      return { availability: this.availability, revision: 0, state: null, stateDigest: null, reasonCode: String(value.reasonCode ?? "HOSTED_STATE_NOT_ACTIVATED") };
    }
    if (status === "empty") {
      this.availability = "empty";
      this.revision = 0;
      return { availability: "empty", revision: 0, state: null, stateDigest: null, reasonCode: null };
    }
    if (status === "loaded" && Number.isSafeInteger(value.revision) && Number(value.revision) > 0 && typeof value.stateDigest === "string" && value.stateDocument) {
      // Checked against the document exactly as the boundary returned it, before
      // normalization, so nothing has had a chance to reinterpret the relation.
      const predecessorProblem = hostedPredecessorRelationProblem(value.stateDocument);
      if (predecessorProblem) {
        this.availability = "unavailable";
        return { availability: "unavailable", revision: this.revision, state: null, stateDigest: null, reasonCode: predecessorProblem };
      }
      const state = normalizeState(value.stateDocument as Partial<CastraState>);
      if (await hostedStateDocumentDigest(state) !== value.stateDigest) {
        this.availability = "unavailable";
        return { availability: "unavailable", revision: this.revision, state: null, stateDigest: null, reasonCode: "STATE_DIGEST_MISMATCH" };
      }
      this.availability = "loaded";
      this.revision = Number(value.revision);
      return { availability: "loaded", revision: this.revision, state, stateDigest: value.stateDigest, reasonCode: null };
    }
    this.availability = response.status === 401 || response.status === 403 ? "denied" : "unavailable";
    return { availability: this.availability, revision: this.revision, state: null, stateDigest: null, reasonCode: String(value.reasonCode ?? "HOSTED_STATE_UNAVAILABLE") };
  }

  async load(): Promise<CastraState> {
    const result = await this.inspect();
    if (result.availability !== "loaded" || !result.state) {
      throw new Error(`Hosted operational state is ${result.availability}; no authoritative state was loaded.`);
    }
    return result.state;
  }

  async prepareSave(state: CastraState): Promise<PreparedHostedStateWrite> {
    if (this.availability !== "loaded" || this.revision < 1) {
      throw new Error("Ordinary hosted-state writes require a loaded revision. Use the governed initial-import control for an empty store.");
    }
    if (await this.pendingStore.load()) throw new Error("An unknown hosted-state command is retained. Reconcile it before preparing another command.");
    const normalized = normalizeState(state);
    const idempotencyKey = this.transport.idempotencyKey("write");
    const stateDigest = await hostedStateDocumentDigest(normalized);
    const requestBindingDigest = await hostedRequestBindingDigest(hostedWriteBinding({
      expectedRevision: this.revision,
      idempotencyKey,
      stateDigest,
      stateSchemaVersion: 13,
    }));
    return {
      commandType: "write",
      expectedRevision: this.revision,
      idempotencyKey,
      requestBindingDigest,
      stateDigest,
      stateSchemaVersion: 13,
      stateDocument: normalized,
    };
  }

  /**
   * Prepares one ordinary revisioned write whose state document must contain a
   * receipt bound to the exact idempotency key. The callback runs only after
   * the durable-pending gate and loaded-revision gate pass. Nothing is sent by
   * this method; commitPrepared remains the only dispatch boundary.
   */
  async prepareBoundSave(
    buildState: (context: HostedStateBoundWriteContext) => CastraState | Promise<CastraState>,
    namespace: "decision-inbox" | "tier1-direct-close",
  ): Promise<PreparedHostedStateWrite> {
    if (this.availability !== "loaded" || this.revision < 1) {
      throw new Error("Bound hosted-state writes require a loaded authoritative revision.");
    }
    if (await this.pendingStore.load()) throw new Error("An unknown hosted-state command is retained. Reconcile it before preparing another command.");
    const idempotencyKey = `state-write:${namespace}:${globalThis.crypto.randomUUID()}`;
    const normalized = normalizeState(await buildState({
      expectedRevision: this.revision,
      resultingRevision: this.revision + 1,
      idempotencyKey,
    }));
    const stateDigest = await hostedStateDocumentDigest(normalized);
    const requestBindingDigest = await hostedRequestBindingDigest(hostedWriteBinding({
      expectedRevision: this.revision,
      idempotencyKey,
      stateDigest,
      stateSchemaVersion: 13,
    }));
    return {
      commandType: "write",
      expectedRevision: this.revision,
      idempotencyKey,
      requestBindingDigest,
      stateDigest,
      stateSchemaVersion: 13,
      stateDocument: normalized,
    };
  }

  async prepareInitialImport(candidate: InitialImportCandidate): Promise<PreparedHostedStateInitialImport> {
    if (this.availability !== "empty" || this.revision !== 0) {
      throw new Error("Governed initial import requires an inspected empty hosted store at revision 0.");
    }
    if (await this.pendingStore.load()) throw new Error("An unknown hosted-state command is retained. Reconcile it before preparing initial import.");
    const normalized = normalizeState(candidate.state);
    const stateDigest = await hostedStateDocumentDigest(normalized);
    if (stateDigest !== candidate.normalizedStateDigest || candidate.manifest.digests.normalizedState !== stateDigest) {
      throw new Error("Initial import state does not match the exact manifest-bound deterministic state digest.");
    }
    const idempotencyKey = this.transport.idempotencyKey("initial_import");
    if (!idempotencyKey.startsWith(INITIAL_IMPORT_IDEMPOTENCY_PREFIX)) throw new Error("Initial import idempotency key is not bound to the governed import namespace.");
    const requestBindingDigest = await hostedRequestBindingDigest(hostedWriteBinding({
      expectedRevision: 0,
      idempotencyKey,
      stateDigest,
      stateSchemaVersion: 13,
    }));
    return {
      commandType: "initial_import",
      expectedRevision: 0,
      idempotencyKey,
      requestBindingDigest,
      stateDigest,
      stateSchemaVersion: 13,
      stateDocument: normalized,
      rawExportBase64: candidate.rawExportBase64,
      manifest: candidate.manifest,
      manifestDigest: candidate.manifestDigest,
      commanderApprovalProof: {
        mechanism: "same_origin_http_only_step_up",
        sensitiveAction: "operational_state_initial_import",
        scopeBindingDigest: candidate.manifestDigest,
        exactManifestOnly: true,
        privateIdentityIncluded: false,
        secretMaterialStored: false,
      },
    };
  }

  async prepareRestore(targetRevision: number): Promise<PreparedHostedStateRestore> {
    if (await this.pendingStore.load()) throw new Error("An unknown hosted-state command is retained. Reconcile it before preparing recovery.");
    if (!Number.isSafeInteger(targetRevision) || targetRevision <= 0 || targetRevision >= this.revision) {
      throw new Error("Recovery requires an earlier positive hosted-state revision.");
    }
    const idempotencyKey = this.transport.idempotencyKey("restore");
    const binding = hostedRestoreBinding({
      expectedRevision: this.revision,
      targetRevision,
      idempotencyKey,
    });
    return { ...binding, requestBindingDigest: await hostedRequestBindingDigest(binding) };
  }

  private async unknown(command: PreparedHostedStateCommand): Promise<never> {
    await this.pendingStore.retain(command);
    throw new HostedStateUnknownOutcomeError(command);
  }

  /**
   * Renews the readable same-origin proof and revalidates the current
   * Commander receipt immediately before a mutation. When no renewal is
   * configured — the local candidate path and every test double that does not
   * exercise it — behaviour is exactly as before and the dispatch below still
   * fails closed without a readable proof.
   */
  async renewSessionProof(): Promise<void> {
    if (!this.sessionProofRenewal) return;
    const proof = await this.sessionProofRenewal();
    if (!proof.authenticatedCommander) throw new HostedStateSessionProofError(proof.publicMessage);
  }

  /**
   * Re-reads authoritative hosted state and proves it still matches the exact
   * revision and digest the Commander reviewed. Nothing is prepared or
   * dispatched here; a mismatch stops the command and carries the fresh
   * authoritative result back for display.
   */
  async confirmAuthoritativeBaseline(baseline: { revision: number; stateDigest: string }): Promise<HostedStateLoadResult> {
    const fresh = await this.inspect();
    if (fresh.availability !== "loaded" || !fresh.state || fresh.stateDigest === null) {
      throw new Error(`Hosted operational state is ${fresh.availability}; no command was prepared and no local fallback was used.`);
    }
    if (fresh.revision !== baseline.revision || fresh.stateDigest !== baseline.stateDigest) {
      throw new HostedStateStaleBaselineError(baseline, fresh);
    }
    return fresh;
  }

  /**
   * Re-reads authoritative hosted state after a terminal receipt and returns it
   * only when its revision equals the terminal result revision and its digest
   * equals the digest the dispatched command bound. Anything else fails closed;
   * the caller must never display its own candidate document instead.
   */
  async confirmAppliedResult(
    command: { stateDigest: string },
    result: HostedStateWriteResult,
  ): Promise<HostedStateLoadResult> {
    const reloaded = await this.inspect();
    if (reloaded.availability !== "loaded"
      || !reloaded.state
      || reloaded.revision !== result.revision
      || reloaded.stateDigest !== command.stateDigest) {
      throw new HostedStateUnconfirmedResultError(result, command.stateDigest, reloaded);
    }
    return reloaded;
  }

  async commitPrepared(command: PreparedHostedStateCommand): Promise<HostedStateWriteResult> {
    // Renewal runs before the proof is read and before the command is retained,
    // so a failed or non-Commander session is a known stop with no dispatch,
    // no retained record, and no replacement idempotency key.
    await this.renewSessionProof();
    const csrf = readableCookie("__Host-castra_csrf", this.transport.cookie());
    if (!csrf) throw new Error("Hosted operational state requires the current same-origin CSRF proof.");
    await this.pendingStore.retain(command);
    let response: Response;
    let value: Record<string, unknown> | null;
    try {
      response = await this.transport.fetch("/api/state", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-CASTRA-CSRF": csrf,
          "X-CASTRA-Request-Reference": this.transport.requestReference(),
        },
        body: JSON.stringify(command),
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        referrerPolicy: "no-referrer",
      });
      value = response.headers.get("content-type")?.toLowerCase().includes("application/json")
        ? responseObject(await response.json())
        : null;
    } catch {
      return this.unknown(command);
    }
    const result = terminalWriteResult(response, value, command);
    if (!result) return this.unknown(command);
    if (result.outcome === "applied" || result.outcome === "restored" || result.outcome === "replayed") {
      this.revision = result.revision;
      this.availability = "loaded";
    }
    await this.pendingStore.clearExact(command.idempotencyKey, command.requestBindingDigest);
    return result;
  }

  async reconcilePending(): Promise<HostedStateWriteResult> {
    const retained = await this.pendingStore.load();
    if (!retained) throw new Error("There is no retained hosted-state command to reconcile.");
    return this.commitPrepared(retained.command);
  }

  async save(state: CastraState): Promise<void> {
    if (this.availability !== "loaded") {
      throw new Error(`Hosted operational state is ${this.availability}; local fallback is prohibited after activation.`);
    }
    const result = await this.commitPrepared(await this.prepareSave(state));
    if (result.outcome === "rejected") throw new Error(`Hosted operational state rejected the write: ${result.reasonCode}.`);
  }

  async restore(targetRevision: number): Promise<HostedStateWriteResult> {
    if (this.availability !== "loaded") throw new Error("Hosted operational state must be loaded before recovery.");
    const result = await this.commitPrepared(await this.prepareRestore(targetRevision));
    if (result.outcome === "rejected") throw new Error(`Hosted operational-state recovery was rejected: ${result.reasonCode}.`);
    return result;
  }
}
