import {
  composeSessionWorkPlanAllocationReceipt,
  sessionWorkPlanAllocationBindingDigest,
  sessionWorkPlanAllocationCommandType,
  sessionWorkPlanAllocationContractVersion,
  sessionWorkPlanAllocationIdempotencyPrefix,
  sessionWorkPlanAllocationReceiptCoreDigest,
  sessionWorkPlanAllocationReceiptCoreOf,
  type SessionWorkPlanAllocationRequest,
  type SessionWorkPlanAllocationReceipt,
  type SessionWorkPlanBinding,
  type SessionWorkPlanDecisionBinding,
  type SessionWorkPlanExecutionEnvelope,
  type SessionWorkPlanProposal,
  type SessionWorkPlanSelection,
} from "../domain/sessionWorkPlanAllocation";

/**
 * ACT-c417cbd5 / P04 — browser dispatch client for one Commander Session Work
 * Plan selection.
 *
 * This client is deliberately incapable of allocating anything. It holds no
 * numbering rule, no stable-code derivation, and no next-number arithmetic: it
 * binds the Commander's exact selection and the exact authoritative baseline
 * the Commander reviewed, sends it, and then proves that what came back is the
 * receipt for that exact request.
 *
 * An unknown outcome is terminal and blocking. The exact command is retained
 * under its original identity, no retry is scheduled, and no replacement
 * idempotency key is ever issued.
 */

const hostedContractVersion = "castra-hosted-operational-state/1.1.0";
const allocationContractVersion = sessionWorkPlanAllocationContractVersion;
const digestPattern = /^sha256:[a-f0-9]{64}$/;

export interface SessionWorkPlanAllocationTransport {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  cookie(): string;
  requestReference(): string;
  idempotencyKey(): string;
}

export const defaultSessionWorkPlanAllocationTransport: SessionWorkPlanAllocationTransport = {
  fetch: (input, init) => globalThis.fetch(input, init),
  cookie: () => globalThis.document?.cookie ?? "",
  requestReference: () => `state-request:browser:${globalThis.crypto.randomUUID()}`,
  idempotencyKey: () => `${sessionWorkPlanAllocationIdempotencyPrefix}${globalThis.crypto.randomUUID()}`,
};

export interface RetainedSessionWorkPlanAllocationCommand {
  request: SessionWorkPlanAllocationRequest;
  retainedAt: string;
}

export interface RetainedSessionWorkPlanAllocationStore {
  load(): Promise<RetainedSessionWorkPlanAllocationCommand | null>;
  retain(command: RetainedSessionWorkPlanAllocationCommand): Promise<void>;
  clearExact(idempotencyKey: string, requestBindingDigest: string): Promise<void>;
}

/**
 * In-memory retention.
 *
 * It fails closed for the session that holds it: while a command is retained no
 * further allocation may be prepared or dispatched. Retention that survives a
 * reload would require the durable pending-command store, which is outside this
 * Action's write allowlist; that gap is recorded in the P04 implementation
 * receipt rather than silently approximated here.
 */
export class MemoryRetainedSessionWorkPlanAllocationStore implements RetainedSessionWorkPlanAllocationStore {
  private retained: RetainedSessionWorkPlanAllocationCommand | null = null;

  load(): Promise<RetainedSessionWorkPlanAllocationCommand | null> {
    return Promise.resolve(this.retained);
  }

  retain(command: RetainedSessionWorkPlanAllocationCommand): Promise<void> {
    if (this.retained
      && (this.retained.request.idempotencyKey !== command.request.idempotencyKey
        || this.retained.request.requestBindingDigest !== command.request.requestBindingDigest)) {
      return Promise.reject(new Error("A different unknown allocation command is already retained. Reconcile it before preparing another."));
    }
    this.retained = command;
    return Promise.resolve();
  }

  clearExact(idempotencyKey: string, requestBindingDigest: string): Promise<void> {
    if (this.retained
      && this.retained.request.idempotencyKey === idempotencyKey
      && this.retained.request.requestBindingDigest === requestBindingDigest) {
      this.retained = null;
    }
    return Promise.resolve();
  }
}

export class SessionWorkPlanAllocationUnknownOutcomeError extends Error {
  readonly retained = true as const;
  readonly automaticRetryScheduled = false as const;
  readonly replacementIdempotencyKeyIssued = false as const;

  constructor(readonly request: SessionWorkPlanAllocationRequest, readonly reasonCode: string) {
    super(`The Session Work Plan allocation outcome is unknown (${reasonCode}). The exact command was retained under its original idempotency identity. Reconcile it explicitly before issuing another command; do not generate a new key.`);
    this.name = "SessionWorkPlanAllocationUnknownOutcomeError";
  }
}

export type SessionWorkPlanAllocationDispatchResult =
  | {
    outcome: "applied" | "replayed" | "no_effect";
    reasonCode: string;
    receipt: SessionWorkPlanAllocationReceipt;
    revision: number | null;
    stateDigest: string | null;
  }
  | { outcome: "rejected" | "denied" | "unavailable"; reasonCode: string; detail: string | null };

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

async function verifiedReceipt(
  candidate: unknown,
  request: SessionWorkPlanAllocationRequest,
): Promise<SessionWorkPlanAllocationReceipt | null> {
  const value = responseObject(candidate);
  if (!value) return null;
  const receipt = value as unknown as SessionWorkPlanAllocationReceipt;
  if (receipt.contractVersion !== allocationContractVersion) return null;
  if (receipt.idempotencyKey !== request.idempotencyKey) return null;
  if (receipt.requestBindingDigest !== request.requestBindingDigest) return null;
  if (receipt.immutable !== true || receipt.automaticRetryScheduled !== false) return null;
  if (!receipt.before || receipt.before.revision !== request.expectedRevision) return null;
  if (receipt.before.stateDigest !== request.expectedStateDigest) return null;
  if (typeof receipt.receiptCoreDigest !== "string" || !digestPattern.test(receipt.receiptCoreDigest)) return null;
  if (typeof receipt.receiptDigest !== "string" || !digestPattern.test(receipt.receiptDigest)) return null;

  // The receipt is only accepted when its own digests are reproducible here.
  // A server that returned a different core, or a different digest for the same
  // core, is not trusted merely because it answered with 200.
  const core = sessionWorkPlanAllocationReceiptCoreOf(receipt);
  if (await sessionWorkPlanAllocationReceiptCoreDigest(core) !== receipt.receiptCoreDigest) return null;
  const recomposed = await composeSessionWorkPlanAllocationReceipt({
    core,
    coreDigest: receipt.receiptCoreDigest,
    resultStateDigest: receipt.result?.stateDigest ?? null,
    resultStateDigestSource: receipt.result?.stateDigestSource ?? "not_redispatched_on_replay",
    replayed: receipt.replayed === true,
  });
  return recomposed.receiptDigest === receipt.receiptDigest ? receipt : null;
}

export class SessionWorkPlanAllocationClient {
  constructor(
    private readonly transport: SessionWorkPlanAllocationTransport = defaultSessionWorkPlanAllocationTransport,
    private readonly retentionStore: RetainedSessionWorkPlanAllocationStore = new MemoryRetainedSessionWorkPlanAllocationStore(),
  ) {}

  retainedCommand(): Promise<RetainedSessionWorkPlanAllocationCommand | null> {
    return this.retentionStore.load();
  }

  /**
   * Binds one exact Commander selection to one exact authoritative baseline.
   *
   * `baseline` must come from a confirmed authoritative read. Nothing here
   * inspects, derives, or invents a number, a stable code, or a Git name — the
   * request carries no field capable of expressing one, and the server rejects
   * any unknown property outright.
   */
  async prepare(input: {
    plan: SessionWorkPlanBinding;
    decision: SessionWorkPlanDecisionBinding;
    envelope: SessionWorkPlanExecutionEnvelope;
    selection: SessionWorkPlanSelection;
    proposals: SessionWorkPlanProposal[];
    baseline: { revision: number; stateDigest: string };
    idempotencyKey?: string;
  }): Promise<SessionWorkPlanAllocationRequest> {
    if (await this.retentionStore.load()) {
      throw new Error("An unknown Session Work Plan allocation command is retained. Reconcile it before preparing another command.");
    }
    if (!Number.isSafeInteger(input.baseline.revision) || input.baseline.revision < 1) {
      throw new Error("Session Work Plan allocation requires a loaded authoritative revision.");
    }
    if (!digestPattern.test(input.baseline.stateDigest)) {
      throw new Error("Session Work Plan allocation requires the exact authoritative state digest the Commander reviewed.");
    }
    const unbound = {
      commandType: sessionWorkPlanAllocationCommandType,
      contractVersion: allocationContractVersion,
      plan: input.plan,
      decision: input.decision,
      envelope: input.envelope,
      selection: input.selection,
      proposals: input.proposals,
      expectedRevision: input.baseline.revision,
      expectedStateDigest: input.baseline.stateDigest,
      idempotencyKey: input.idempotencyKey ?? this.transport.idempotencyKey(),
    } as const;
    return { ...unbound, requestBindingDigest: await sessionWorkPlanAllocationBindingDigest(unbound) };
  }

  async dispatch(request: SessionWorkPlanAllocationRequest): Promise<SessionWorkPlanAllocationDispatchResult> {
    const csrf = readableCookie("__Host-castra_csrf", this.transport.cookie());
    if (!csrf) throw new Error("Session Work Plan allocation requires the current same-origin CSRF proof.");
    await this.retentionStore.retain({ request, retainedAt: new Date().toISOString() });

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
        body: JSON.stringify(request),
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        referrerPolicy: "no-referrer",
      });
      value = response.headers.get("content-type")?.toLowerCase().includes("application/json")
        ? responseObject(await response.json())
        : null;
    } catch {
      throw new SessionWorkPlanAllocationUnknownOutcomeError(request, "TRANSPORT_UNKNOWN");
    }

    if (!value
      || value.contractVersion !== hostedContractVersion
      || value.providerTokensReturnedToBrowser !== false
      || value.serviceRoleUsed !== false
      || value.secretMaterialStored !== false) {
      throw new SessionWorkPlanAllocationUnknownOutcomeError(request, "INVALID_RESPONSE_ENVELOPE");
    }
    const allocation = responseObject(value.sessionWorkPlanAllocation);
    if (!allocation
      || allocation.contractVersion !== allocationContractVersion
      || allocation.automaticRetryScheduled !== false
      || allocation.replacementIdempotencyKeyIssued !== false) {
      throw new SessionWorkPlanAllocationUnknownOutcomeError(request, "INVALID_ALLOCATION_ENVELOPE");
    }

    const outcome = String(allocation.outcome);
    const reasonCode = String(allocation.reasonCode ?? "UNSPECIFIED");
    const detail = typeof allocation.detail === "string" ? allocation.detail : null;

    if (outcome === "unknown" || allocation.reconciliationRequired === true) {
      throw new SessionWorkPlanAllocationUnknownOutcomeError(request, reasonCode);
    }

    if (outcome === "rejected" || outcome === "denied"
      || (outcome === "unavailable" && allocation.storeMutationAttempted === false)) {
      // A known, no-mutation stop. Nothing was applied, so the retained record
      // is released; a corrected attempt is a new command with a new identity.
      await this.retentionStore.clearExact(request.idempotencyKey, request.requestBindingDigest);
      return { outcome: outcome as "rejected" | "denied" | "unavailable", reasonCode, detail };
    }

    const terminalOutcomes: Array<"applied" | "replayed" | "no_effect"> = ["applied", "replayed", "no_effect"];
    const terminal = terminalOutcomes.find((candidate) => candidate === outcome);
    if (!terminal) {
      throw new SessionWorkPlanAllocationUnknownOutcomeError(request, "UNRECOGNIZED_ALLOCATION_OUTCOME");
    }
    if (response.status !== 200) {
      throw new SessionWorkPlanAllocationUnknownOutcomeError(request, "ALLOCATION_STATUS_MISMATCH");
    }
    const receipt = await verifiedReceipt(allocation.receipt, request);
    if (!receipt || receipt.replayed !== (terminal === "replayed")) {
      throw new SessionWorkPlanAllocationUnknownOutcomeError(request, "ALLOCATION_RECEIPT_UNVERIFIED");
    }
    await this.retentionStore.clearExact(request.idempotencyKey, request.requestBindingDigest);
    return {
      outcome: terminal,
      reasonCode,
      receipt,
      revision: typeof value.revision === "number" ? value.revision : null,
      stateDigest: typeof value.stateDigest === "string" ? value.stateDigest : null,
    };
  }

  /**
   * Reconciles a retained unknown outcome by reissuing the byte-identical
   * command under its original identity. This is the only permitted
   * continuation: it is explicitly requested, never scheduled, and never
   * substitutes a fresh idempotency key.
   */
  async reconcileRetained(): Promise<SessionWorkPlanAllocationDispatchResult> {
    const retained = await this.retentionStore.load();
    if (!retained) throw new Error("There is no retained Session Work Plan allocation command to reconcile.");
    return this.dispatch(retained.request);
  }
}
