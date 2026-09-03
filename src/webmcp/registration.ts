/**
 * C001.M017.A001 — WebMCP capability detection and lifecycle-safe registration.
 *
 * The production path is the real browser API: `document.modelContext
 * .registerTool(...)`. No runtime shim or polyfill is added, and no package is
 * introduced. Where the browser does not expose the capability, CASTRA registers
 * nothing and says so; it never simulates a tool surface.
 *
 * Lifecycle contract:
 *
 * - `registerTool` is asynchronous. It resolves when the tool is registered,
 *   rejects when the host refuses it, and offers no unregistration handle and
 *   no `unregisterTool`: the only withdrawal mechanism is aborting the signal
 *   passed in the registration options.
 * - This adapter therefore owns one `AbortController` for the exact five-tool
 *   surface and registers every tool against it. That controller is linked one
 *   way from the caller's experience signal, so an experience abort, unmount,
 *   or mode change withdraws the surface while nothing here ever aborts the
 *   caller's own signal.
 * - Every registration promise is awaited together and fails fast. `registered`
 *   is reported only after all of them resolve while the owned signal is still
 *   live, and the first rejection aborts the owned controller immediately rather
 *   than waiting for a sibling the host may still be holding, so a
 *   half-registered surface never survives and rollback can never be held open.
 * - A second registration against the same model context withdraws the live
 *   CASTRA surface first, so a duplicate live registration is unreachable even
 *   if a caller forgets to abort. Bookkeeping entries are removed by identity,
 *   so a superseded call whose host promises settle late cannot withdraw the
 *   replacement.
 * - Read callbacks read only the injected snapshot. Proposal callbacks
 *   additionally read and replace exactly one ephemeral client-local draft
 *   through the injected proposal boundary, and read one application-computed
 *   closure preparation. No callback holds a repository, a fetch, a command
 *   dispatcher, a lifecycle executor, or a persistence handle, so a protected
 *   effect is not reachable from a tool invocation.
 * - Closure eligibility is never recomputed here. `prepare_confirmation` shapes
 *   whatever the application's own `tier1DirectCloseReview` produced and refuses
 *   when that review says the target is unknown, stale, or ineligible.
 * - The proposal boundary is a required option with an explicit `available:
 *   false` form. Until the visible drafting surface exists, the application says
 *   so and the three proposal tools refuse honestly; nothing pretends to hold a
 *   draft the Commander cannot see.
 * - Every failure is a structured refusal with a stable reason code. Nothing
 *   here falls back to another data source when the bound context is missing,
 *   stale, or ambiguous.
 * - An optional execution observer may be bound in the registration options. It
 *   receives exactly one sanitized event after each completed or refused
 *   invocation of a live registered tool, and that event carries only a
 *   page-local sequence, the exact canonical tool name, the tool's own declared
 *   read-only/proposal classification, and the complete/refused outcome. No tool
 *   input, result, summary, reason message, record identifier, timestamp,
 *   credential, account, provider, Production, or operational value is copied or
 *   derived into it. The observer is notified after the response is built, is
 *   never awaited, and cannot change a response, a refusal, a registration, or
 *   the withdrawal contract.
 */

import {
  WEBMCP_CAPABILITY_STATEMENT,
  WEBMCP_CONTRACT_VERSION,
  WEBMCP_INPUT_SCHEMAS,
  WEBMCP_LIMITS,
  WEBMCP_TOOL_ANNOTATIONS,
  WEBMCP_TOOL_DESCRIPTIONS,
  WEBMCP_TOOL_NAMES,
  WEBMCP_UNTRUSTED_TEXT_NOTICE,
  boundedText,
  buildRefusal,
  toolResponse,
  isProposalTool,
  type WebMcpAuthorityDescriptor,
  type WebMcpCapabilityDetection,
  type WebMcpClientDraft,
  type WebMcpClosurePreparation,
  type WebMcpCommandStatusPayload,
  type WebMcpConfirmationPayload,
  type WebMcpCurrentGate,
  type WebMcpExperienceMode,
  type WebMcpMissionRollupSnapshot,
  type WebMcpModelContext,
  type WebMcpOpenWorkEntryPayload,
  type WebMcpOpenWorkEntrySnapshot,
  type WebMcpOpenWorkPayload,
  type WebMcpPlanDraft,
  type WebMcpPlanDraftPayload,
  type WebMcpPlanReviewPayload,
  type WebMcpProposalBoundary,
  type WebMcpRecordSnapshot,
  type WebMcpRefusalCode,
  type WebMcpRelatedMissionPayload,
  type WebMcpSnapshotReader,
  type WebMcpStateSnapshot,
  type WebMcpToolDescriptor,
  type WebMcpToolName,
  type WebMcpToolResponse,
} from "./contracts";
import {
  buildConfirmationDraft,
  buildPlanTargetIndex,
  confirmationDraftTransition,
  parseConfirmationInput,
  parsePlanDraftInput,
  planDraftTransition,
  reviewPlanDraft,
  summarizeReview,
  usableClientDraft,
  type WebMcpConfirmationRequest,
  type WebMcpDraftTransition,
  type WebMcpProposalResult,
} from "./proposals";

/* -------------------------------------------------------------------------- */
/* Capability detection                                                       */
/* -------------------------------------------------------------------------- */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Property reads are wrapped: a hostile or exotic getter must not throw here. */
function readProperty(source: unknown, key: string): unknown {
  if (!isObject(source)) return undefined;
  try {
    return source[key];
  } catch {
    return undefined;
  }
}

function unsupported(message: string): WebMcpCapabilityDetection {
  return { supported: false, reasonCode: "unsupported_capability", message };
}

/**
 * Detect `document.modelContext.registerTool` on the supplied host.
 *
 * The default host is `globalThis`, so production code calls this with no
 * argument and reaches the real `document`. Detection is strict about the exact
 * path: a `modelContext` that is not reachable through `document`, or a
 * `registerTool` that is not callable, is treated as unsupported rather than
 * probed further.
 */
export function detectWebMcpCapability(host: unknown = globalThis): WebMcpCapabilityDetection {
  const documentCandidate = readProperty(host, "document");
  if (!isObject(documentCandidate)) {
    return unsupported("No document is available, so the WebMCP model context cannot be reached.");
  }
  const modelContext = readProperty(documentCandidate, "modelContext");
  if (!isObject(modelContext)) {
    return unsupported("This browser does not expose document.modelContext. No WebMCP tool was registered.");
  }
  if (typeof readProperty(modelContext, "registerTool") !== "function") {
    return unsupported("document.modelContext exists but exposes no callable registerTool. No WebMCP tool was registered.");
  }
  return { supported: true, modelContext: modelContext as unknown as WebMcpModelContext };
}

/* -------------------------------------------------------------------------- */
/* Registration lifecycle                                                     */
/* -------------------------------------------------------------------------- */

/**
 * How a live surface is withdrawn. The standard browser surface offers exactly
 * one mechanism, so this reports whether there is a surface to withdraw at all
 * rather than which of several strategies was chosen.
 */
export type WebMcpUnregistrationStrategy = "owned_abort_signal" | "none";

/* -------------------------------------------------------------------------- */
/* Bounded execution observation                                              */
/* -------------------------------------------------------------------------- */

/**
 * The invoked tool's own declared classification, read from the exact
 * `readOnlyHint` annotation the host and the agent already see. It is never
 * recomputed, softened, or inferred here, so an observed event cannot describe a
 * draft-replacing tool as read-only.
 */
export type WebMcpExecutionClassification = "read_only" | "proposal";

/** Whether the invocation produced a structured result or a structured refusal. */
export type WebMcpExecutionOutcome = "complete" | "refused";

/**
 * One sanitized observation of one invocation.
 *
 * This is the whole event. There is deliberately no field for the input, the
 * result, the response text, the refusal message or reason code, a record
 * identifier, a revision, a timestamp, an authority descriptor, a draft, or any
 * other operational value, so a payload cannot leak through this surface even if
 * a consumer renders the event verbatim. `sequence` counts invocations of this
 * exact registered surface, starting at 1; it is a page-local ordinal, not a
 * clock, an identifier, or a measure of anything outside this page.
 */
export interface WebMcpExecutionEvent {
  readonly sequence: number;
  readonly tool: WebMcpToolName;
  readonly classification: WebMcpExecutionClassification;
  readonly outcome: WebMcpExecutionOutcome;
}

/**
 * The optional observation injection point. It is a plain notification: it
 * returns nothing, is called after the response is already built, and is never
 * awaited, so it cannot alter, delay, or fail an invocation.
 */
export type WebMcpExecutionObserver = (event: WebMcpExecutionEvent) => void;

/** The adapter-internal emitter one registration owns. */
type ExecutionEmitter = (name: WebMcpToolName, response: WebMcpToolResponse) => void;

const NO_EXECUTION_EMITTER: ExecutionEmitter = () => {};

/**
 * Build the per-registration emitter.
 *
 * The counter lives in this closure, so it is scoped to exactly the surface it
 * describes: a withdrawn-and-replaced surface starts a fresh sequence at 1, in
 * step with the application resetting its own activity for the new experience,
 * and two independent contexts never share a counter.
 *
 * Two boundaries are enforced here rather than trusted to the consumer. An
 * invocation reaching a withdrawn surface emits nothing, because that surface's
 * observer binding was withdrawn with it and a retained agent callback must not
 * be able to write into the next experience's activity. And an observer that
 * throws is contained: the tool response is already built and is returned
 * unchanged, exactly as if no observer were bound.
 */
function buildExecutionEmitter(
  observer: WebMcpExecutionObserver | undefined,
  surface: AbortSignal,
): ExecutionEmitter {
  if (typeof observer !== "function") return NO_EXECUTION_EMITTER;
  let sequence = 0;
  return (name, response) => {
    if (surface.aborted) return;
    sequence += 1;
    // Constructed field by field from four bounded values. Nothing is spread,
    // copied, or derived from the request or the response body.
    const event: WebMcpExecutionEvent = {
      sequence,
      tool: name,
      classification: WEBMCP_TOOL_ANNOTATIONS[name].readOnlyHint ? "read_only" : "proposal",
      outcome: response.isError ? "refused" : "complete",
    };
    try {
      observer(event);
    } catch {
      // A defective observer is a consumer defect, never a tool failure.
    }
  };
}

export interface WebMcpRegistrationOptions {
  /** The result of `detectWebMcpCapability`. Passed in so tests never patch globals. */
  readonly detection: WebMcpCapabilityDetection;
  /** The experience this registration is bound to. A snapshot in another mode is refused. */
  readonly mode: WebMcpExperienceMode;
  /** The only read data source available to a callback. */
  readonly readSnapshot: WebMcpSnapshotReader;
  /**
   * The client-draft and closure-preparation controller. Required, not optional:
   * an application that has not wired a visible drafting surface must say so
   * with `{ available: false, reason }` rather than leaving the position
   * unstated, and the proposal tools then refuse honestly.
   */
  readonly proposals: WebMcpProposalBoundary;
  /**
   * The experience signal. Aborting it withdraws this surface. The link is one
   * way: this adapter never aborts the caller's signal.
   */
  readonly signal: AbortSignal;
  /**
   * Optional. Notified once after each completed or refused invocation of this
   * surface with the sanitized `WebMcpExecutionEvent` above. Omitting it changes
   * nothing: the tools register, answer, refuse, and withdraw identically.
   */
  readonly onExecution?: WebMcpExecutionObserver;
}

export interface WebMcpRegistrationOutcome {
  readonly contractVersion: typeof WEBMCP_CONTRACT_VERSION;
  readonly status: "registered" | "not_registered";
  readonly mode: WebMcpExperienceMode;
  readonly registeredTools: readonly WebMcpToolName[];
  readonly unregistration: WebMcpUnregistrationStrategy;
  readonly reasonCode: WebMcpRefusalCode | null;
  readonly message: string;
}

/**
 * One bookkeeping entry per registered tool name. `surface` is the controller
 * this adapter owns for the whole five-tool surface; aborting it is what makes
 * the browser unregister. Entries are compared by identity, never by name
 * alone, so a call can only ever remove its own.
 */
interface LiveRegistration {
  readonly name: WebMcpToolName;
  readonly surface: AbortController;
}

/**
 * Live CASTRA registrations per model context. A WeakMap keyed by the browser
 * object keeps this bookkeeping from outliving the page's context and keeps two
 * independent contexts (production and a test double) from interfering.
 */
const liveRegistrations = new WeakMap<WebMcpModelContext, Map<WebMcpToolName, LiveRegistration>>();

function liveMap(modelContext: WebMcpModelContext): Map<WebMcpToolName, LiveRegistration> {
  const existing = liveRegistrations.get(modelContext);
  if (existing) return existing;
  const created = new Map<WebMcpToolName, LiveRegistration>();
  liveRegistrations.set(modelContext, created);
  return created;
}

/** The CASTRA tools currently registered on this model context. */
export function activeWebMcpToolNames(modelContext: WebMcpModelContext): WebMcpToolName[] {
  return [...liveMap(modelContext).keys()];
}

/**
 * Drop only the identical entries a call recorded.
 *
 * The identity check is what makes a late withdrawal harmless: a superseded
 * registration whose host promises settle after a replacement has already taken
 * its tool names finds a different entry under each name, removes nothing, and
 * so cannot clear the live surface.
 */
function forgetRegistrations(modelContext: WebMcpModelContext, entries: readonly LiveRegistration[]): void {
  const map = liveMap(modelContext);
  for (const entry of entries) {
    if (map.get(entry.name) === entry) map.delete(entry.name);
  }
}

/**
 * Withdraw every live CASTRA surface on this model context by aborting the
 * controller that owns it. The browser performs the unregistration; this
 * adapter owns only the signal, and aborting an already aborted controller is a
 * no-op, so repeated withdrawal stays once-only.
 */
function releaseEverything(modelContext: WebMcpModelContext): void {
  for (const entry of [...liveMap(modelContext).values()]) {
    entry.surface.abort();
  }
}

function outcome(
  status: WebMcpRegistrationOutcome["status"],
  mode: WebMcpExperienceMode,
  registeredTools: readonly WebMcpToolName[],
  unregistration: WebMcpUnregistrationStrategy,
  reasonCode: WebMcpRefusalCode | null,
  message: string,
): WebMcpRegistrationOutcome {
  return {
    contractVersion: WEBMCP_CONTRACT_VERSION,
    status,
    mode,
    registeredTools,
    unregistration,
    reasonCode,
    message,
  };
}

function buildDescriptor(
  name: WebMcpToolName,
  options: WebMcpRegistrationOptions,
  surface: AbortSignal,
  emitExecution: ExecutionEmitter,
): WebMcpToolDescriptor {
  return {
    name,
    description: WEBMCP_TOOL_DESCRIPTIONS[name],
    inputSchema: WEBMCP_INPUT_SCHEMAS[name],
    annotations: WEBMCP_TOOL_ANNOTATIONS[name],
    // The callback body is synchronous and pure: no await, no I/O, no timer.
    // The promise exists only because the WebMCP surface expects one.
    execute: (input?: unknown) => {
      // The response is computed exactly as before and is never reshaped,
      // delayed, or made conditional on the observation below.
      const response = executeTool(name, input, options, surface);
      emitExecution(name, response);
      return Promise.resolve(response);
    },
  };
}

/**
 * Call the host once, with the owned surface signal as its registration option.
 *
 * A conforming host returns a promise. A non-conforming one that throws
 * synchronously is converted into a rejection here, so every registration is
 * observed the same way and nothing escapes this adapter as an exception.
 */
function callRegisterTool(
  modelContext: WebMcpModelContext,
  descriptor: WebMcpToolDescriptor,
  surface: AbortSignal,
): Promise<void> {
  try {
    return Promise.resolve(modelContext.registerTool(descriptor, { signal: surface }));
  } catch (thrown) {
    return Promise.reject(thrown instanceof Error ? thrown : new Error(String(thrown)));
  }
}

/** The first host rejection reason, bounded like every other untrusted string. */
function rejectionMessage(reason: unknown): string {
  const fallback = "The browser rejected the tool descriptor.";
  const message = reason instanceof Error ? boundedText(reason.message, 240) : "";
  return message || fallback;
}

/**
 * The outcome for a call whose owned surface was already withdrawn — by a
 * replacement, by the experience ending, or by an unmount — before it could
 * report a surface.
 *
 * Withdrawal outranks every settlement. The browser has already unregistered
 * whatever this call registered, and reporting `registered` would be untrue.
 */
function withdrawnOutcome(mode: WebMcpExperienceMode): WebMcpRegistrationOutcome {
  return outcome(
    "not_registered",
    mode,
    [],
    "none",
    "registration_aborted",
    "The WebMCP surface was withdrawn before both registrations completed. This call registered nothing.",
  );
}

/**
 * Register the CASTRA read-only and proposal-only WebMCP surface for one
 * experience.
 *
 * Registers exactly the five declared tools, in declared order, or nothing.
 * Never rejects: an unsupported capability, an already aborted signal, a host
 * that refuses a descriptor, and a withdrawal that lands while registration is
 * still in flight all resolve to a structured `not_registered` outcome, and a
 * partial registration is withdrawn before this function resolves.
 */
export async function registerCastraWebMcpTools(
  options: WebMcpRegistrationOptions,
): Promise<WebMcpRegistrationOutcome> {
  const { detection, mode, signal } = options;
  if (!detection.supported) {
    return outcome("not_registered", mode, [], "none", detection.reasonCode, detection.message);
  }
  if (signal.aborted) {
    return outcome(
      "not_registered",
      mode,
      [],
      "none",
      "registration_aborted",
      "The registration signal was already aborted. No WebMCP tool was registered.",
    );
  }

  const modelContext = detection.modelContext;
  // Replace, never duplicate. Any live CASTRA surface on this model context is
  // withdrawn before the new one is registered, so the ordering an agent
  // observes is unregister-then-register.
  releaseEverything(modelContext);

  // One controller owns this exact five-tool surface, and it is linked one way
  // from the experience signal. Every withdrawal path — experience abort,
  // unmount, mode change, replacement, partial rejection — aborts this same
  // controller, so the browser has exactly one unregistration trigger to
  // honour. The listener is itself scoped to the owned signal, so a withdrawn
  // surface leaves nothing attached to the caller's signal.
  const surface = new AbortController();
  signal.addEventListener("abort", () => surface.abort(), { once: true, signal: surface.signal });

  // Scoped to this exact surface and to its withdrawal, so the sequence a
  // consumer observes belongs to one registration and stops with it.
  const emitExecution = buildExecutionEmitter(options.onExecution, surface.signal);

  const map = liveMap(modelContext);
  const entries: LiveRegistration[] = WEBMCP_TOOL_NAMES.map((name) => ({ name, surface }));
  // Recorded before the first await so a replacement arriving while these
  // registrations are still in flight can find this surface and withdraw it.
  for (const entry of entries) map.set(entry.name, entry);
  surface.signal.addEventListener("abort", () => forgetRegistrations(modelContext, entries), { once: true });

  // Fail fast, not all-settled: `Promise.all` rejects on the first refusal
  // instead of waiting for a sibling the host may hold indefinitely, so a
  // partial live surface can never outlast the call that created it. It also
  // subscribes to every registration up front, so a later sibling rejection —
  // including the one the host raises for a still-pending registration when the
  // rollback below aborts the signal — is already observed and never escapes as
  // an unhandled rejection.
  try {
    await Promise.all(
      entries.map((entry) => callRegisterTool(
        modelContext,
        buildDescriptor(entry.name, options, surface.signal, emitExecution),
        surface.signal,
      )),
    );
  } catch (rejection) {
    // A withdrawal that already happened outranks the refusal. This call's
    // tool names now hold a replacement's bookkeeping, so it withdraws nothing
    // further and reports the withdrawal rather than the host's reason.
    if (surface.signal.aborted) return withdrawnOutcome(mode);
    // A partial success is not a surface. Aborting the owned controller
    // withdraws whichever registration did succeed and drops this call's
    // bookkeeping through the same single path as every other withdrawal.
    surface.abort();
    return outcome("not_registered", mode, [], "none", "registration_failed", rejectionMessage(rejection));
  }

  // Both resolved, but withdrawal still outranks settlement: a superseded call
  // whose host promises resolve after a replacement took over registered
  // nothing that is still live, and reporting `registered` would be untrue.
  if (surface.signal.aborted) return withdrawnOutcome(mode);

  return outcome(
    "registered",
    mode,
    entries.map((entry) => entry.name),
    "owned_abort_signal",
    null,
    `Registered ${entries.length} read-only and proposal-only CASTRA tools for the ${mode} experience.`,
  );
}

/* -------------------------------------------------------------------------- */
/* Input validation                                                           */
/* -------------------------------------------------------------------------- */

interface OpenWorkQuery {
  readonly missionId: string | null;
  readonly recordId: string | null;
  readonly limit: number;
}

/** One parse-result shape for the whole adapter, shared with the proposal core. */
type ParsedInput<T> = WebMcpProposalResult<T>;

function rejected<T>(reasonCode: WebMcpRefusalCode, message: string): ParsedInput<T> {
  return { ok: false, reasonCode, message };
}

/** Shared by the two tools that declare no arguments at all. */
function parseNoArgumentInput(input: unknown, tool: WebMcpToolName): ParsedInput<null> {
  if (input === undefined || input === null) return { ok: true, value: null };
  if (!isObject(input) || Array.isArray(input)) {
    return rejected("invalid_input", `${tool} accepts an empty object only.`);
  }
  const keys = Object.keys(input);
  if (keys.length > 0) {
    return rejected("invalid_input", `${tool} accepts no arguments; received "${boundedText(keys[0], 60)}".`);
  }
  return { ok: true, value: null };
}

const OPEN_WORK_ARGUMENT_NAMES = ["missionId", "recordId", "limit"] as const;

/**
 * Identifiers are compared exactly, so normalization must not change them. A
 * value that `boundedText` would alter carries control characters, collapsed
 * whitespace, or excess length and is refused rather than silently repaired.
 */
function parseIdentifier(candidate: Record<string, unknown>, key: string): ParsedInput<string | null> {
  if (!(key in candidate) || candidate[key] === undefined) return { ok: true, value: null };
  const value = candidate[key];
  if (typeof value !== "string") return rejected("invalid_input", `"${key}" must be a string.`);
  const trimmed = value.trim();
  if (!trimmed) return rejected("invalid_input", `"${key}" must not be empty.`);
  if (trimmed.length > WEBMCP_LIMITS.identifierMaxLength) {
    return rejected("invalid_input", `"${key}" exceeds ${WEBMCP_LIMITS.identifierMaxLength} characters.`);
  }
  if (boundedText(trimmed, WEBMCP_LIMITS.identifierMaxLength) !== trimmed) {
    return rejected("invalid_input", `"${key}" contains characters that are not permitted in a record identifier.`);
  }
  return { ok: true, value: trimmed };
}

function parseOpenWorkInput(input: unknown): ParsedInput<OpenWorkQuery> {
  const fallback: OpenWorkQuery = { missionId: null, recordId: null, limit: WEBMCP_LIMITS.defaultResultLimit };
  if (input === undefined || input === null) return { ok: true, value: fallback };
  if (!isObject(input) || Array.isArray(input)) {
    return rejected("invalid_input", "inspect_open_work accepts an object with optional missionId, recordId, and limit.");
  }
  const candidate = input;
  for (const key of Object.keys(candidate)) {
    if (!OPEN_WORK_ARGUMENT_NAMES.includes(key as (typeof OPEN_WORK_ARGUMENT_NAMES)[number])) {
      return rejected("invalid_input", `Unsupported argument "${boundedText(key, 60)}".`);
    }
  }

  const missionId = parseIdentifier(candidate, "missionId");
  if (!missionId.ok) return rejected(missionId.reasonCode, missionId.message);
  const recordId = parseIdentifier(candidate, "recordId");
  if (!recordId.ok) return rejected(recordId.reasonCode, recordId.message);

  let limit: number = WEBMCP_LIMITS.defaultResultLimit;
  if ("limit" in candidate && candidate.limit !== undefined) {
    const value = candidate.limit;
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return rejected("invalid_input", '"limit" must be a whole number.');
    }
    if (value < 1) return rejected("invalid_input", '"limit" must be at least 1.');
    if (value > WEBMCP_LIMITS.maximumResultLimit) {
      return rejected("limit_exceeded", `"limit" must not exceed ${WEBMCP_LIMITS.maximumResultLimit}.`);
    }
    limit = value;
  }

  return { ok: true, value: { missionId: missionId.value, recordId: recordId.value, limit } };
}

/* -------------------------------------------------------------------------- */
/* Snapshot validation                                                        */
/* -------------------------------------------------------------------------- */

function authorityUsable(value: unknown): value is WebMcpAuthorityDescriptor {
  if (!isObject(value)) return false;
  return typeof value.mode === "string"
    && typeof value.authorityClass === "string"
    && typeof value.freshness === "string"
    && typeof value.source === "string";
}

function snapshotUsable(value: unknown): value is WebMcpStateSnapshot {
  if (!isObject(value)) return false;
  if (!authorityUsable(value.authority)) return false;
  return Array.isArray(value.campaigns)
    && Array.isArray(value.missions)
    && Array.isArray(value.actions)
    && Array.isArray(value.openWorkIndex)
    && Array.isArray(value.missionOpenWorkRollups);
}

/* -------------------------------------------------------------------------- */
/* Read projections                                                           */
/* -------------------------------------------------------------------------- */

function activeRecordCount(records: readonly WebMcpRecordSnapshot[]): number {
  return records.filter((record) => !record.archivedAt).length;
}

function countState(entries: readonly WebMcpOpenWorkEntrySnapshot[], state: string): number {
  return entries.filter((entry) => entry.state === state).length;
}

function boundedEntry(entry: WebMcpOpenWorkEntrySnapshot): WebMcpOpenWorkEntryPayload {
  return {
    recordType: boundedText(entry.recordType, 40),
    recordId: boundedText(entry.recordId, WEBMCP_LIMITS.identifierMaxLength),
    missionId: boundedText(entry.missionId, WEBMCP_LIMITS.identifierMaxLength),
    campaignId: typeof entry.campaignId === "string"
      ? boundedText(entry.campaignId, WEBMCP_LIMITS.identifierMaxLength)
      : null,
    title: boundedText(entry.title, WEBMCP_LIMITS.titleMaxLength),
    parentTitle: boundedText(entry.parentTitle, WEBMCP_LIMITS.titleMaxLength),
    state: boundedText(entry.state, 40),
    sourceStatus: boundedText(entry.sourceStatus, 40),
    summary: boundedText(entry.summary, WEBMCP_LIMITS.summaryMaxLength),
    owner: boundedText(entry.owner, WEBMCP_LIMITS.titleMaxLength),
    blocker: boundedText(entry.blocker, WEBMCP_LIMITS.summaryMaxLength),
    nextGate: boundedText(entry.nextGate, WEBMCP_LIMITS.gateMaxLength),
    evidenceReference: boundedText(entry.evidenceReference, WEBMCP_LIMITS.evidenceMaxLength),
    updatedAt: boundedText(entry.updatedAt, 40),
  };
}

function currentGateOf(entries: readonly WebMcpOpenWorkEntrySnapshot[]): WebMcpCurrentGate | null {
  // The domain projection is already ordered by attention priority, so the
  // leading entry is CASTRA's current gate. No priority rule is re-implemented.
  const leading = entries.length > 0 ? entries[0] : null;
  if (!leading) return null;
  const bounded = boundedEntry(leading);
  return {
    recordType: bounded.recordType,
    recordId: bounded.recordId,
    title: bounded.title,
    parentTitle: bounded.parentTitle,
    state: bounded.state,
    owner: bounded.owner,
    blocker: bounded.blocker,
    nextGate: bounded.nextGate,
    evidenceReference: bounded.evidenceReference,
  };
}

function evidenceReferencesOf(entries: readonly WebMcpOpenWorkEntrySnapshot[]): string[] {
  const references: string[] = [];
  for (const entry of entries) {
    const reference = boundedText(entry.evidenceReference, WEBMCP_LIMITS.evidenceMaxLength);
    if (!reference || references.includes(reference)) continue;
    references.push(reference);
    if (references.length >= WEBMCP_LIMITS.maximumEvidenceReferences) break;
  }
  return references;
}

function provenanceOf(mode: WebMcpExperienceMode, entries: readonly WebMcpOpenWorkEntrySnapshot[]): string {
  const sourceRevision = entries.length > 0 ? boundedText(entries[0].sourceRevision, WEBMCP_LIMITS.summaryMaxLength) : "";
  const suffix = sourceRevision ? ` Projection source revision: ${sourceRevision}.` : "";
  return `Derived from the open-work projection rendered in the active ${mode} experience.${suffix}`;
}

function relatedMission(
  rollup: WebMcpMissionRollupSnapshot,
  relationship: WebMcpRelatedMissionPayload["relationship"],
): WebMcpRelatedMissionPayload {
  return {
    missionId: boundedText(rollup.missionId, WEBMCP_LIMITS.identifierMaxLength),
    campaignId: boundedText(rollup.campaignId, WEBMCP_LIMITS.identifierMaxLength),
    missionTitle: boundedText(rollup.missionTitle, WEBMCP_LIMITS.titleMaxLength),
    state: boundedText(rollup.state, 40),
    totalActions: rollup.totalActions,
    openActions: rollup.openActions,
    inProgressActions: rollup.inProgressActions,
    blockedActions: rollup.blockedActions,
    commanderReviewActions: rollup.commanderReviewActions,
    readyActions: rollup.readyActions,
    reconciliationRequiredActions: rollup.reconciliationRequiredActions,
    completedActions: rollup.completedActions,
    nextGate: boundedText(rollup.nextGate, WEBMCP_LIMITS.gateMaxLength),
    evidenceReference: boundedText(rollup.evidenceReference, WEBMCP_LIMITS.evidenceMaxLength),
    relationship,
  };
}

const SETTLED_MISSION_STATES = ["completed", "no_open_work"];

/**
 * Mission roll-ups relevant to the returned entries, plus the sibling Missions
 * in the same Campaigns that still hold open work. Both come from the projection
 * the application already supplied; no dependency is inferred here.
 */
function relatedMissionsFor(
  snapshot: WebMcpStateSnapshot,
  entries: readonly WebMcpOpenWorkEntrySnapshot[],
): WebMcpRelatedMissionPayload[] {
  const missionIds = new Set(entries.map((entry) => entry.missionId));
  const campaignIds = new Set(entries.map((entry) => entry.campaignId).filter((id): id is string => typeof id === "string"));
  const related: WebMcpRelatedMissionPayload[] = [];
  for (const rollup of snapshot.missionOpenWorkRollups) {
    if (!missionIds.has(rollup.missionId)) continue;
    related.push(relatedMission(rollup, "returned_mission"));
    if (related.length >= WEBMCP_LIMITS.maximumRelatedMissions) return related;
  }
  for (const rollup of snapshot.missionOpenWorkRollups) {
    if (missionIds.has(rollup.missionId)) continue;
    if (!campaignIds.has(rollup.campaignId)) continue;
    if (SETTLED_MISSION_STATES.includes(rollup.state)) continue;
    related.push(relatedMission(rollup, "cross_mission_open_work"));
    if (related.length >= WEBMCP_LIMITS.maximumRelatedMissions) return related;
  }
  return related;
}

function knownMissionIds(snapshot: WebMcpStateSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const mission of snapshot.missions) ids.add(mission.id);
  for (const rollup of snapshot.missionOpenWorkRollups) ids.add(rollup.missionId);
  for (const entry of snapshot.openWorkIndex) ids.add(entry.missionId);
  return ids;
}

function knownRecordIds(snapshot: WebMcpStateSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const mission of snapshot.missions) ids.add(mission.id);
  for (const action of snapshot.actions) ids.add(action.id);
  for (const entry of snapshot.openWorkIndex) ids.add(entry.recordId);
  return ids;
}

function buildCommandStatusPayload(
  mode: WebMcpExperienceMode,
  snapshot: WebMcpStateSnapshot,
): WebMcpCommandStatusPayload {
  const entries = snapshot.openWorkIndex;
  return {
    contractVersion: WEBMCP_CONTRACT_VERSION,
    tool: "read_command_status",
    status: "ok",
    mode,
    authority: snapshot.authority,
    records: {
      campaigns: activeRecordCount(snapshot.campaigns),
      missions: activeRecordCount(snapshot.missions),
      actions: activeRecordCount(snapshot.actions),
    },
    openWork: {
      total: entries.length,
      open: countState(entries, "open"),
      inProgress: countState(entries, "in_progress"),
      blocked: countState(entries, "blocked"),
      commanderReview: countState(entries, "commander_review"),
      readyForMissionClosure: countState(entries, "ready_for_mission_closure"),
      reconciliationRequired: countState(entries, "reconciliation_required"),
    },
    currentGate: currentGateOf(entries),
    evidenceReferences: evidenceReferencesOf(entries),
    provenance: provenanceOf(mode, entries),
    capabilities: WEBMCP_CAPABILITY_STATEMENT,
    dataHandling: WEBMCP_UNTRUSTED_TEXT_NOTICE,
  };
}

function buildOpenWorkPayload(
  mode: WebMcpExperienceMode,
  snapshot: WebMcpStateSnapshot,
  query: OpenWorkQuery,
): WebMcpOpenWorkPayload | { readonly refusal: WebMcpRefusalCode; readonly message: string } {
  if (query.missionId && !knownMissionIds(snapshot).has(query.missionId)) {
    return {
      refusal: "unknown_identifier",
      message: "No Mission with that identifier is present in the active experience. Nothing was inferred or substituted.",
    };
  }
  if (query.recordId && !knownRecordIds(snapshot).has(query.recordId)) {
    return {
      refusal: "unknown_identifier",
      message: "No record with that identifier is present in the active experience. Nothing was inferred or substituted.",
    };
  }

  const matched = snapshot.openWorkIndex.filter((entry) => {
    if (query.missionId && entry.missionId !== query.missionId) return false;
    if (query.recordId && entry.recordId !== query.recordId) return false;
    return true;
  });
  const selected = matched.slice(0, query.limit);

  return {
    contractVersion: WEBMCP_CONTRACT_VERSION,
    tool: "inspect_open_work",
    status: "ok",
    mode,
    authority: snapshot.authority,
    query: { missionId: query.missionId, recordId: query.recordId, limit: query.limit },
    matched: matched.length,
    returned: selected.length,
    truncated: matched.length > selected.length,
    entries: selected.map(boundedEntry),
    relatedMissions: relatedMissionsFor(snapshot, selected),
    provenance: provenanceOf(mode, snapshot.openWorkIndex),
    capabilities: WEBMCP_CAPABILITY_STATEMENT,
    dataHandling: WEBMCP_UNTRUSTED_TEXT_NOTICE,
  };
}

/* -------------------------------------------------------------------------- */
/* Tool execution                                                             */
/* -------------------------------------------------------------------------- */

function refuse(
  name: WebMcpToolName,
  mode: WebMcpExperienceMode,
  reasonCode: WebMcpRefusalCode,
  message: string,
): WebMcpToolResponse {
  return toolResponse(buildRefusal(name, mode, reasonCode, message));
}

/* -------------------------------------------------------------------------- */
/* Proposal execution                                                         */
/* -------------------------------------------------------------------------- */

/** The available form of the boundary, once availability has been established. */
type AvailableProposalBoundary = Extract<WebMcpProposalBoundary, { available: true }>;

/**
 * Read the exact current client draft.
 *
 * A reader that throws, or that returns something this adapter could not have
 * produced, is an unusable controller — not an empty one. Treating either as
 * "no draft" would let the next proposal call silently overwrite whatever the
 * Commander is actually looking at, so both fail closed instead.
 */
function readCurrentDraft(
  boundary: AvailableProposalBoundary,
  mode: WebMcpExperienceMode,
): WebMcpProposalResult<WebMcpClientDraft | null> {
  let current: unknown;
  try {
    current = boundary.readClientDraft();
  } catch {
    return {
      ok: false,
      reasonCode: "read_failed",
      message: "The client draft could not be read. No alternative source was consulted.",
    };
  }
  if (current === null || current === undefined) return { ok: true, value: null };
  if (!usableClientDraft(current)) {
    return {
      ok: false,
      reasonCode: "proposal_context_unavailable",
      message: "The bound client draft is not readable as a CASTRA draft. It was left exactly as it is rather than overwritten.",
    };
  }
  if (current.mode !== mode) {
    return {
      ok: false,
      reasonCode: "context_mode_mismatch",
      message: `The bound client draft belongs to the ${boundedText(current.mode, 40)} experience, not the ${mode} experience it would be replaced in. The request was refused rather than answered ambiguously.`,
    };
  }
  return { ok: true, value: current };
}

/**
 * Hand the computed draft to the application's own setter.
 *
 * This is the single place anything in `src/webmcp/` changes CASTRA at all, and
 * what it changes is one page-local value. A setter that throws is reported as a
 * refusal with the draft's fate stated honestly, because this adapter cannot
 * know whether the application accepted it.
 */
function commitDraft(
  boundary: AvailableProposalBoundary,
  transition: WebMcpDraftTransition,
): WebMcpRefusalCode | null {
  try {
    boundary.replaceClientDraft(transition.draft);
    return null;
  } catch {
    return "proposal_context_unavailable";
  }
}

function buildPlanDraftPayload(
  mode: WebMcpExperienceMode,
  snapshot: WebMcpStateSnapshot,
  transition: WebMcpDraftTransition,
  plan: WebMcpPlanDraft,
): WebMcpPlanDraftPayload {
  return {
    contractVersion: WEBMCP_CONTRACT_VERSION,
    tool: "draft_session_plan",
    status: "ok",
    mode,
    authority: snapshot.authority,
    draft: transition.draft,
    replacement: transition.replacement,
    cardCount: plan.cards.length,
    provenance: `Client-local Session Work Plan draft ${transition.replacement.resultingRevision} in the active ${mode} experience. No CASTRA record, code, or number was allocated, and nothing was dispatched.`,
    capabilities: WEBMCP_CAPABILITY_STATEMENT,
    dataHandling: WEBMCP_UNTRUSTED_TEXT_NOTICE,
  };
}

function buildPlanReviewPayload(
  mode: WebMcpExperienceMode,
  snapshot: WebMcpStateSnapshot,
  draft: WebMcpClientDraft,
  plan: WebMcpPlanDraft,
): WebMcpPlanReviewPayload {
  const checks = reviewPlanDraft(plan, buildPlanTargetIndex(snapshot));
  const counts = summarizeReview(checks);
  return {
    contractVersion: WEBMCP_CONTRACT_VERSION,
    tool: "review_plan",
    status: "ok",
    mode,
    authority: snapshot.authority,
    reviewedRevision: draft.revision,
    cardCount: plan.cards.length,
    checks,
    counts,
    readyForCommanderSelection: counts.blocking === 0,
    provenance: `Deterministic check of client-local draft revision ${draft.revision} against the projections rendered in the active ${mode} experience. Not an approval, an acceptance, or an independent verification.`,
    capabilities: WEBMCP_CAPABILITY_STATEMENT,
    dataHandling: WEBMCP_UNTRUSTED_TEXT_NOTICE,
  };
}

function buildConfirmationPayload(
  mode: WebMcpExperienceMode,
  snapshot: WebMcpStateSnapshot,
  transition: WebMcpDraftTransition,
): WebMcpConfirmationPayload {
  const confirmation = transition.draft.confirmation as NonNullable<WebMcpClientDraft["confirmation"]>;
  return {
    contractVersion: WEBMCP_CONTRACT_VERSION,
    tool: "prepare_confirmation",
    status: "ok",
    mode,
    authority: snapshot.authority,
    draft: transition.draft,
    replacement: transition.replacement,
    confirmation,
    provenance: `Staged from the closure review the active ${mode} experience computed for ${confirmation.actionId} at revision ${confirmation.expectedRevision}. Nothing was approved, closed, or dispatched.`,
    capabilities: WEBMCP_CAPABILITY_STATEMENT,
    dataHandling: WEBMCP_UNTRUSTED_TEXT_NOTICE,
  };
}

/** Ask the application for its own closure review. A thrown call fails closed. */
function readClosurePreparation(
  boundary: AvailableProposalBoundary,
  request: WebMcpConfirmationRequest,
): WebMcpProposalResult<WebMcpClosurePreparation> {
  try {
    return { ok: true, value: boundary.prepareClosure(request.actionId) };
  } catch {
    return {
      ok: false,
      reasonCode: "read_failed",
      message: "The closure review could not be computed for that Action. No alternative source was consulted and nothing was staged.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Tool execution                                                             */
/* -------------------------------------------------------------------------- */

type ParsedProposalInput =
  | { readonly kind: "plan"; readonly plan: WebMcpPlanDraft }
  | { readonly kind: "review" }
  | { readonly kind: "confirmation"; readonly request: WebMcpConfirmationRequest };

function parseProposalInput(
  name: WebMcpToolName,
  input: unknown,
): WebMcpProposalResult<ParsedProposalInput> {
  if (name === "draft_session_plan") {
    const parsed = parsePlanDraftInput(input);
    return parsed.ok ? { ok: true, value: { kind: "plan", plan: parsed.value } } : parsed;
  }
  if (name === "prepare_confirmation") {
    const parsed = parseConfirmationInput(input);
    return parsed.ok ? { ok: true, value: { kind: "confirmation", request: parsed.value } } : parsed;
  }
  const parsed = parseNoArgumentInput(input, "review_plan");
  return parsed.ok ? { ok: true, value: { kind: "review" } } : parsed;
}

/**
 * One invocation. Every exit is a structured response; nothing throws out of a
 * tool callback, and no path reaches a hosted writer, a repository, a lifecycle
 * executor, or a network call.
 *
 * Check order is fixed for every tool: withdrawal, then request shape, then —
 * for a proposal tool — whether a controller is bound at all, then bound state
 * and its mode and freshness, then the tool's own work. The controller check
 * sits before the state read deliberately: a missing drafting surface is a
 * capability fact rather than a state fact, and reporting it first gives the
 * caller the reason it can act on.
 */
function executeTool(
  name: WebMcpToolName,
  input: unknown,
  options: WebMcpRegistrationOptions,
  surface: AbortSignal,
): WebMcpToolResponse {
  const mode = options.mode;

  // The owned surface signal, not the experience signal: a callback retained by
  // an agent must also stop answering when its surface was superseded or rolled
  // back, not only when the experience itself ended.
  if (surface.aborted) {
    return refuse(name, mode, "registration_aborted", "This tool registration was withdrawn when the CASTRA experience changed.");
  }

  const parsedStatus = name === "read_command_status" ? parseNoArgumentInput(input, name) : null;
  if (parsedStatus && !parsedStatus.ok) return refuse(name, mode, parsedStatus.reasonCode, parsedStatus.message);
  const parsedQuery = name === "inspect_open_work" ? parseOpenWorkInput(input) : null;
  if (parsedQuery && !parsedQuery.ok) return refuse(name, mode, parsedQuery.reasonCode, parsedQuery.message);

  const proposal = isProposalTool(name) ? parseProposalInput(name, input) : null;
  if (proposal && !proposal.ok) return refuse(name, mode, proposal.reasonCode, proposal.message);

  let boundary: AvailableProposalBoundary | null = null;
  if (proposal) {
    if (!options.proposals.available) {
      return refuse(
        name,
        mode,
        "proposal_context_unavailable",
        `No CASTRA drafting surface is bound to this experience, so nothing can be drafted, reviewed, or staged. ${boundedText(options.proposals.reason, WEBMCP_LIMITS.summaryMaxLength)}`,
      );
    }
    boundary = options.proposals;
  }

  let snapshot: unknown;
  try {
    snapshot = options.readSnapshot();
  } catch {
    return refuse(name, mode, "read_failed", "The application state could not be read. No alternative source was consulted.");
  }

  if (!snapshotUsable(snapshot)) {
    return refuse(name, mode, "context_unavailable", "No usable CASTRA state is bound to this experience. Nothing was substituted.");
  }
  if (snapshot.authority.mode !== mode) {
    return refuse(
      name,
      mode,
      "context_mode_mismatch",
      `This registration is bound to the ${mode} experience but the bound state reports a different mode. The request was refused rather than answered ambiguously.`,
    );
  }
  if (snapshot.authority.freshness !== "current") {
    return refuse(
      name,
      mode,
      "stale_context",
      `The bound CASTRA state is ${boundedText(snapshot.authority.freshness, 40)}. Re-read authority in CASTRA before relying on it.`,
    );
  }

  if (name === "read_command_status") {
    return toolResponse(buildCommandStatusPayload(mode, snapshot));
  }

  if (proposal && proposal.ok && boundary) {
    return executeProposalTool(name, proposal.value, boundary, mode, snapshot);
  }

  const query = parsedQuery && parsedQuery.ok
    ? parsedQuery.value
    : { missionId: null, recordId: null, limit: WEBMCP_LIMITS.defaultResultLimit };
  const payload = buildOpenWorkPayload(mode, snapshot, query);
  if ("refusal" in payload) return refuse(name, mode, payload.refusal, payload.message);
  return toolResponse(payload);
}

/**
 * The three proposal tools, once the request, the controller, and the bound
 * state have all been established.
 */
function executeProposalTool(
  name: WebMcpToolName,
  parsed: ParsedProposalInput,
  boundary: AvailableProposalBoundary,
  mode: WebMcpExperienceMode,
  snapshot: WebMcpStateSnapshot,
): WebMcpToolResponse {
  const current = readCurrentDraft(boundary, mode);
  if (!current.ok) return refuse(name, mode, current.reasonCode, current.message);

  if (parsed.kind === "review") {
    const plan = current.value?.plan ?? null;
    if (!current.value || !plan) {
      return refuse(
        name,
        mode,
        "draft_unavailable",
        "No Session Work Plan draft exists in this page yet. Draft one before reviewing it; nothing was inferred from CASTRA state.",
      );
    }
    return toolResponse(buildPlanReviewPayload(mode, snapshot, current.value, plan));
  }

  if (parsed.kind === "plan") {
    const transition = planDraftTransition({
      contractVersion: WEBMCP_CONTRACT_VERSION,
      mode,
      current: current.value,
      plan: parsed.plan,
    });
    if (!transition.ok) return refuse(name, mode, transition.reasonCode, transition.message);
    const failure = commitDraft(boundary, transition.value);
    if (failure) {
      return refuse(name, mode, failure, "The CASTRA drafting surface did not accept the draft. Nothing was staged, and no CASTRA state was changed.");
    }
    return toolResponse(buildPlanDraftPayload(mode, snapshot, transition.value, parsed.plan));
  }

  const preparation = readClosurePreparation(boundary, parsed.request);
  if (!preparation.ok) return refuse(name, mode, preparation.reasonCode, preparation.message);
  const confirmation = buildConfirmationDraft({ request: parsed.request, preparation: preparation.value });
  if (!confirmation.ok) return refuse(name, mode, confirmation.reasonCode, confirmation.message);

  const transition = confirmationDraftTransition({
    contractVersion: WEBMCP_CONTRACT_VERSION,
    mode,
    current: current.value,
    confirmation: confirmation.value,
  });
  if (!transition.ok) return refuse(name, mode, transition.reasonCode, transition.message);
  const failure = commitDraft(boundary, transition.value);
  if (failure) {
    return refuse(name, mode, failure, "The CASTRA drafting surface did not accept the confirmation draft. Nothing was staged, and no CASTRA state was changed.");
  }
  return toolResponse(buildConfirmationPayload(mode, snapshot, transition.value));
}
