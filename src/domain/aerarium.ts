import type {
  AerariumCommand,
  AerariumRun,
  AerariumRunEvent,
  AerariumStoredMeasure,
  AuditEvent,
  AuditKind,
  CastraCommand,
  CastraState,
  CommandContext,
  ModelProfileVersion,
  SubscriptionPlanVersion,
  VersionedConfiguration,
  WorkLink,
} from "./types.js";

export function isAerariumCommand(command: CastraCommand): command is AerariumCommand {
  return (
    command.type.startsWith("aerarium_") ||
    command.type.startsWith("subscription_plan.") ||
    command.type.startsWith("price_card.") ||
    command.type.startsWith("model_profile.") ||
    command.type.startsWith("allocation_rule.") ||
    command.type.startsWith("budget_settings.")
  );
}

function text(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function instant(value: string, label: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) throw new Error(`${label} is invalid.`);
  return new Date(timestamp).toISOString();
}

function nonnegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or greater.`);
  return value;
}

function workExists(state: CastraState, link: WorkLink): boolean {
  if (link.type === "baseops") return Boolean(link.id.trim());
  const collection =
    link.type === "campaign" ? state.campaigns : link.type === "mission" ? state.missions : state.actions;
  return collection.some((record) => record.id === link.id);
}

function appendAudit(
  state: CastraState,
  context: CommandContext,
  occurredAt: string,
  kind: AuditKind,
  target: { type: AuditEvent["entityType"]; id: string },
  summary: string,
  detail: Record<string, string> = {},
): CastraState {
  const event: AuditEvent = {
    id: context.id("audit"),
    sequence: state.nextAuditSequence,
    occurredAt,
    actor: "Commander",
    origin: "direct",
    kind,
    entityType: target.type,
    entityId: target.id,
    summary,
    detail,
  };
  return {
    ...state,
    nextAuditSequence: state.nextAuditSequence + 1,
    auditEvents: [...state.auditEvents, event],
  };
}

function eventsForRun(state: CastraState, runId: string): AerariumRunEvent[] {
  return state.aerariumRunEvents.filter((event) => event.runId === runId);
}

export interface RunLifecycle {
  status: "running" | "paused" | "blocked" | "ended";
  unresolvedEnd: boolean;
  lastEvent: AerariumRunEvent | undefined;
}

export function runLifecycle(state: CastraState, runId: string): RunLifecycle {
  const events = eventsForRun(state, runId);
  let status: RunLifecycle["status"] = "running";
  for (const event of events) {
    if (event.type === "start" || event.type === "resume" || event.type === "unblocked") status = "running";
    if (event.type === "pause") status = "paused";
    if (event.type === "blocked") status = "blocked";
    if (event.type === "end") status = "ended";
  }
  return { status, unresolvedEnd: !events.some((event) => event.type === "end"), lastEvent: events.at(-1) };
}

interface RuntimeInterval {
  start: number;
  end: number;
}

function activeIntervals(state: CastraState, runId: string, asOf: string): RuntimeInterval[] {
  const events = eventsForRun(state, runId);
  const asOfMs = Date.parse(asOf);
  const intervals: RuntimeInterval[] = [];
  let activeStart: number | null = null;
  for (const event of events) {
    const eventMs = Date.parse(event.occurredAt);
    if (eventMs > asOfMs) break;
    if (["start", "resume", "unblocked"].includes(event.type) && activeStart === null) activeStart = eventMs;
    if (["pause", "blocked", "end"].includes(event.type) && activeStart !== null) {
      intervals.push({ start: activeStart, end: Math.max(activeStart, eventMs) });
      activeStart = null;
    }
  }
  if (activeStart !== null) intervals.push({ start: activeStart, end: Math.max(activeStart, asOfMs) });
  return intervals;
}

export interface ObservedRuntime {
  availability: "available";
  activeRuntimeMs: number;
  unresolvedEnd: boolean;
  provenance: "local_event_timestamps";
  confidence: "observed";
}

export function observedRuntime(state: CastraState, runId: string, asOf: string): ObservedRuntime {
  if (!state.aerariumRuns.some((run) => run.id === runId)) throw new Error("AERARIUM run not found.");
  const intervals = activeIntervals(state, runId, instant(asOf, "As-of time"));
  return {
    availability: "available",
    activeRuntimeMs: intervals.reduce((total, interval) => total + interval.end - interval.start, 0),
    unresolvedEnd: runLifecycle(state, runId).unresolvedEnd,
    provenance: "local_event_timestamps",
    confidence: "observed",
  };
}

function clippedRuntime(
  state: CastraState,
  runId: string,
  asOf: string,
  periodStart: string,
  periodEnd: string,
): number {
  const start = Date.parse(periodStart);
  const end = Math.min(Date.parse(periodEnd), Date.parse(asOf));
  if (end <= start) return 0;
  return activeIntervals(state, runId, new Date(end).toISOString()).reduce((total, interval) => {
    const overlapStart = Math.max(start, interval.start);
    const overlapEnd = Math.min(end, interval.end);
    return total + Math.max(0, overlapEnd - overlapStart);
  }, 0);
}

export interface UnavailableCalculation {
  availability: "unavailable";
  reason: string;
}

export interface AvailableEstimate {
  availability: "available";
  profile: ModelProfileVersion;
  priceCardVersionId: string;
  inputCharacters: number;
  outputCharacters: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  apiEquivalentMinor: number;
  currency: string;
}

export type RunEstimate = UnavailableCalculation | AvailableEstimate;

export function estimateRun(state: CastraState, runId: string): RunEstimate {
  const run = state.aerariumRuns.find((item) => item.id === runId);
  if (!run) throw new Error("AERARIUM run not found.");
  const profile = state.modelProfileVersions
    .filter(
      (item) => item.modelKey === run.modelKey && (!item.roleId || item.roleId === run.roleId),
    )
    .sort((left, right) => left.version - right.version)
    .at(-1);
  if (!profile) return { availability: "unavailable", reason: "No applicable model profile matches this run." };
  const outcome = eventsForRun(state, run.id)
    .filter((event) => event.type === "outcome" && (event.inputCharacters !== null || event.outputCharacters !== null))
    .at(-1);
  if (!outcome) return { availability: "unavailable", reason: "No character counts were recorded with an outcome event." };
  const priceCard = state.priceCardVersions.find((card) => card.id === profile.priceCardVersionId);
  if (!priceCard) return { availability: "unavailable", reason: "The matched profile's price card is unavailable." };
  const inputCharacters = outcome.inputCharacters ?? 0;
  const outputCharacters = outcome.outputCharacters ?? 0;
  const inputTokens = Math.ceil(inputCharacters / profile.charactersPerToken);
  const outputTokens = Math.ceil(outputCharacters / profile.charactersPerToken);
  const apiEquivalentMinor =
    (inputTokens / 1_000_000) * priceCard.inputPerMillionMinor +
    (outputTokens / 1_000_000) * priceCard.outputPerMillionMinor;
  return {
    availability: "available",
    profile,
    priceCardVersionId: priceCard.id,
    inputCharacters,
    outputCharacters,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    apiEquivalentMinor,
    currency: priceCard.currency,
  };
}

export interface AvailableAllocation {
  availability: "available";
  allocatedMinor: number;
  currency: string;
  targetRuntimeMs: number;
  eligibleRuntimeDenominatorMs: number;
  planFeeMinor: number;
  periodStart: string;
  periodEnd: string;
  subscriptionPlanVersionId: string;
  allocationRuleVersionId: string;
  provisional: boolean;
}

export type RunAllocation = UnavailableCalculation | AvailableAllocation;

export function allocateRun(
  state: CastraState,
  allocationRuleVersionId: string,
  runId: string,
  asOf: string,
): RunAllocation {
  const rule = state.allocationRuleVersions.find((item) => item.id === allocationRuleVersionId);
  if (!rule) return { availability: "unavailable", reason: "Allocation rule is unavailable." };
  const plan = state.subscriptionPlanVersions.find((item) => item.id === rule.subscriptionPlanVersionId);
  if (!plan) return { availability: "unavailable", reason: "Subscription plan version is unavailable." };
  const run = state.aerariumRuns.find((item) => item.id === runId);
  if (!run) throw new Error("AERARIUM run not found.");
  const eligible = state.aerariumRuns.filter(
    (item) => rule.eligibleRoleIds.length === 0 || rule.eligibleRoleIds.includes(item.roleId),
  );
  if (!eligible.some((item) => item.id === run.id)) {
    return { availability: "unavailable", reason: "Run role is not eligible under this allocation rule." };
  }
  const normalizedAsOf = instant(asOf, "As-of time");
  const runtimes = eligible.map((item) => ({
    run: item,
    runtime: clippedRuntime(state, item.id, normalizedAsOf, plan.periodStart, plan.periodEnd),
  }));
  const denominator = runtimes.reduce((total, item) => total + item.runtime, 0);
  const targetRuntime = runtimes.find((item) => item.run.id === run.id)?.runtime ?? 0;
  if (denominator === 0 || targetRuntime === 0) {
    return { availability: "unavailable", reason: "Eligible active runtime denominator is unavailable or zero." };
  }
  return {
    availability: "available",
    allocatedMinor: (plan.planFeeMinor * targetRuntime) / denominator,
    currency: plan.currency,
    targetRuntimeMs: targetRuntime,
    eligibleRuntimeDenominatorMs: denominator,
    planFeeMinor: plan.planFeeMinor,
    periodStart: plan.periodStart,
    periodEnd: plan.periodEnd,
    subscriptionPlanVersionId: plan.id,
    allocationRuleVersionId: rule.id,
    provisional:
      Date.parse(normalizedAsOf) < Date.parse(plan.periodEnd) ||
      runtimes.some((item) => item.runtime > 0 && runLifecycle(state, item.run.id).unresolvedEnd),
  };
}

function nextVersion<T extends VersionedConfiguration>(
  records: T[],
  supersedesId: string | undefined,
  newId: string,
): Pick<VersionedConfiguration, "familyId" | "version" | "supersedesId"> {
  if (!supersedesId) return { familyId: newId, version: 1, supersedesId: null };
  const previous = records.find((item) => item.id === supersedesId);
  if (!previous) throw new Error("Configuration version to supersede was not found.");
  return { familyId: previous.familyId, version: previous.version + 1, supersedesId: previous.id };
}

function requireRun(state: CastraState, runId: string): AerariumRun {
  const run = state.aerariumRuns.find((item) => item.id === runId);
  if (!run) throw new Error("AERARIUM run not found.");
  return run;
}

function appendMeasure(
  state: CastraState,
  context: CommandContext,
  occurredAt: string,
  measure: AerariumStoredMeasure,
): CastraState {
  return appendAudit(
    { ...state, aerariumMeasures: [...state.aerariumMeasures, measure] },
    context,
    occurredAt,
    "aerarium_measure.recorded",
    { type: "aerarium_measure", id: measure.id },
    `AERARIUM measure recorded: ${measure.kind}`,
    { runId: measure.runId, kind: measure.kind, provenance: measure.provenance },
  );
}

export interface RunMeasureView {
  kind:
    | "observed_runtime"
    | "provider_actual"
    | "allocated_subscription_cost"
    | "estimated_tokens"
    | "api_equivalent_estimate";
  availability: "available" | "unavailable";
  value: number | null;
  unit: "milliseconds" | "minor_currency" | "tokens";
  currency: string;
  provenance: string;
  confidence: string;
  reason: string;
  provisional: boolean;
}

export function runMeasureViews(state: CastraState, runId: string, asOf: string): RunMeasureView[] {
  const runtime = observedRuntime(state, runId, asOf);
  const stored = state.aerariumMeasures.filter((measure) => measure.runId === runId);
  const latest = (kind: AerariumStoredMeasure["kind"]) => stored.filter((measure) => measure.kind === kind).at(-1);
  const definitions: Array<{
    kind: Exclude<RunMeasureView["kind"], "observed_runtime">;
    unavailableReason: string;
  }> = [
    { kind: "provider_actual", unavailableReason: "No manually evidenced provider actual was recorded." },
    { kind: "allocated_subscription_cost", unavailableReason: "No allocation snapshot was recorded." },
    { kind: "estimated_tokens", unavailableReason: estimateRun(state, runId).availability === "unavailable" ? (estimateRun(state, runId) as UnavailableCalculation).reason : "No estimate snapshot was recorded." },
    { kind: "api_equivalent_estimate", unavailableReason: estimateRun(state, runId).availability === "unavailable" ? (estimateRun(state, runId) as UnavailableCalculation).reason : "No API-equivalent snapshot was recorded." },
  ];
  return [
    {
      kind: "observed_runtime",
      availability: "available",
      value: runtime.activeRuntimeMs,
      unit: "milliseconds",
      currency: "",
      provenance: runtime.provenance,
      confidence: runtime.confidence,
      reason: "",
      provisional: runtime.unresolvedEnd,
    },
    ...definitions.map(({ kind, unavailableReason }): RunMeasureView => {
      const measure = latest(kind);
      return measure
        ? {
            kind,
            availability: "available",
            value: measure.value,
            unit: measure.unit,
            currency: measure.currency,
            provenance: measure.provenance,
            confidence: measure.confidence,
            reason: "",
            provisional: measure.provisional,
          }
        : {
            kind,
            availability: "unavailable",
            value: null,
            unit: kind === "estimated_tokens" ? "tokens" : "minor_currency",
            currency: "",
            provenance: "unavailable",
            confidence: "unavailable",
            reason: unavailableReason,
            provisional: false,
          };
    }),
  ];
}

export function applyAerariumCommand(
  state: CastraState,
  command: AerariumCommand,
  context: CommandContext,
): CastraState {
  const recordedAt = context.now();

  if (command.type === "aerarium_run.create") {
    if (!workExists(state, command.work)) throw new Error("Linked work record not found.");
    const runId = context.id("aerarium_run");
    const startId = context.id("aerarium_run_event");
    const startedAt = instant(command.startedAt, "Start time");
    const run: AerariumRun = {
      id: runId,
      title: text(command.title, "Run title"),
      work: command.work,
      roleId: text(command.roleId, "Role"),
      modelKey: command.modelKey.trim(),
      createdAt: recordedAt,
    };
    const start: AerariumRunEvent = {
      id: startId,
      runId,
      type: "start",
      occurredAt: startedAt,
      note: "",
      outcome: "",
      inputCharacters: null,
      outputCharacters: null,
      createdAt: recordedAt,
    };
    let next = appendAudit(
      { ...state, aerariumRuns: [...state.aerariumRuns, run] },
      context,
      recordedAt,
      "aerarium_run.created",
      { type: "aerarium_run", id: run.id },
      `AERARIUM run created: ${run.title}`,
      { workType: run.work.type, workId: run.work.id, roleId: run.roleId },
    );
    next = appendAudit(
      { ...next, aerariumRunEvents: [...next.aerariumRunEvents, start] },
      context,
      recordedAt,
      "aerarium_run_event.appended",
      { type: "aerarium_run_event", id: start.id },
      `Run event appended: start — ${run.title}`,
      { runId: run.id, occurredAt: start.occurredAt },
    );
    return next;
  }

  if (command.type === "aerarium_run_event.append") {
    const run = requireRun(state, command.runId);
    const lifecycle = runLifecycle(state, run.id);
    const occurredAt = instant(command.occurredAt, "Event time");
    if (lifecycle.lastEvent && Date.parse(occurredAt) < Date.parse(lifecycle.lastEvent.occurredAt)) {
      throw new Error("Run events must be appended in chronological order.");
    }
    if (lifecycle.status === "ended" && command.eventType !== "outcome") {
      throw new Error("Only an outcome event may be appended after the run ends.");
    }
    const allowed: Record<typeof lifecycle.status, Array<Exclude<AerariumRunEvent["type"], "start">>> = {
      running: ["pause", "blocked", "end", "outcome"],
      paused: ["resume", "end", "outcome"],
      blocked: ["unblocked", "end", "outcome"],
      ended: ["outcome"],
    };
    if (!allowed[lifecycle.status].includes(command.eventType)) {
      throw new Error(`Event ${command.eventType} is not allowed while the run is ${lifecycle.status}.`);
    }
    if (command.eventType === "outcome") text(command.outcome, "Outcome");
    for (const [value, label] of [
      [command.inputCharacters, "Input characters"],
      [command.outputCharacters, "Output characters"],
    ] as const) {
      if (value !== null && (!Number.isInteger(value) || value < 0)) throw new Error(`${label} must be a whole number or unavailable.`);
    }
    const event: AerariumRunEvent = {
      id: context.id("aerarium_run_event"),
      runId: run.id,
      type: command.eventType,
      occurredAt,
      note: command.note.trim(),
      outcome: command.outcome.trim(),
      inputCharacters: command.inputCharacters,
      outputCharacters: command.outputCharacters,
      createdAt: recordedAt,
    };
    return appendAudit(
      { ...state, aerariumRunEvents: [...state.aerariumRunEvents, event] },
      context,
      recordedAt,
      "aerarium_run_event.appended",
      { type: "aerarium_run_event", id: event.id },
      `Run event appended: ${event.type} — ${run.title}`,
      { runId: run.id, occurredAt: event.occurredAt },
    );
  }

  if (command.type === "subscription_plan.version.create") {
    const id = context.id("subscription_plan_version");
    const version = nextVersion(state.subscriptionPlanVersions, command.supersedesId, id);
    const periodStart = instant(command.periodStart, "Period start");
    const periodEnd = instant(command.periodEnd, "Period end");
    if (Date.parse(periodEnd) <= Date.parse(periodStart)) throw new Error("Plan period end must be after its start.");
    const record: SubscriptionPlanVersion = {
      id,
      ...version,
      name: text(command.name, "Plan name"),
      currency: text(command.currency, "Currency").toUpperCase(),
      planFeeMinor: nonnegative(command.planFeeMinor, "Plan fee"),
      periodStart,
      periodEnd,
      createdAt: recordedAt,
    };
    return appendAudit(
      { ...state, subscriptionPlanVersions: [...state.subscriptionPlanVersions, record] },
      context,
      recordedAt,
      "aerarium_configuration.version_created",
      { type: "subscription_plan_version", id },
      `Subscription plan version created: ${record.name} v${record.version}`,
      { familyId: record.familyId, version: String(record.version) },
    );
  }

  if (command.type === "price_card.version.create") {
    const id = context.id("price_card_version");
    const version = nextVersion(state.priceCardVersions, command.supersedesId, id);
    const record = {
      id,
      ...version,
      name: text(command.name, "Price card name"),
      currency: text(command.currency, "Currency").toUpperCase(),
      inputPerMillionMinor: nonnegative(command.inputPerMillionMinor, "Input price"),
      outputPerMillionMinor: nonnegative(command.outputPerMillionMinor, "Output price"),
      createdAt: recordedAt,
    };
    return appendAudit(
      { ...state, priceCardVersions: [...state.priceCardVersions, record] },
      context,
      recordedAt,
      "aerarium_configuration.version_created",
      { type: "price_card_version", id },
      `Price card version created: ${record.name} v${record.version}`,
      { familyId: record.familyId, version: String(record.version) },
    );
  }

  if (command.type === "model_profile.version.create") {
    if (!state.priceCardVersions.some((card) => card.id === command.priceCardVersionId)) {
      throw new Error("An exact price card version is required.");
    }
    const id = context.id("model_profile_version");
    const version = nextVersion(state.modelProfileVersions, command.supersedesId, id);
    if (!Number.isFinite(command.charactersPerToken) || command.charactersPerToken <= 0) {
      throw new Error("Characters per token must be greater than zero.");
    }
    const record = {
      id,
      ...version,
      name: text(command.name, "Profile name"),
      modelKey: text(command.modelKey, "Model key"),
      roleId: command.roleId.trim(),
      charactersPerToken: command.charactersPerToken,
      priceCardVersionId: command.priceCardVersionId,
      createdAt: recordedAt,
    };
    return appendAudit(
      { ...state, modelProfileVersions: [...state.modelProfileVersions, record] },
      context,
      recordedAt,
      "aerarium_configuration.version_created",
      { type: "model_profile_version", id },
      `Model profile version created: ${record.name} v${record.version}`,
      { familyId: record.familyId, version: String(record.version), priceCardVersionId: record.priceCardVersionId },
    );
  }

  if (command.type === "allocation_rule.version.create") {
    if (!state.subscriptionPlanVersions.some((plan) => plan.id === command.subscriptionPlanVersionId)) {
      throw new Error("An exact subscription plan version is required.");
    }
    const id = context.id("allocation_rule_version");
    const version = nextVersion(state.allocationRuleVersions, command.supersedesId, id);
    const record = {
      id,
      ...version,
      name: text(command.name, "Allocation rule name"),
      subscriptionPlanVersionId: command.subscriptionPlanVersionId,
      eligibleRoleIds: [...new Set(command.eligibleRoleIds.map((role) => role.trim()).filter(Boolean))],
      formula: "eligible_active_runtime" as const,
      createdAt: recordedAt,
    };
    return appendAudit(
      { ...state, allocationRuleVersions: [...state.allocationRuleVersions, record] },
      context,
      recordedAt,
      "aerarium_configuration.version_created",
      { type: "allocation_rule_version", id },
      `Allocation rule version created: ${record.name} v${record.version}`,
      { familyId: record.familyId, version: String(record.version), formula: record.formula },
    );
  }

  if (command.type === "budget_settings.version.create") {
    const id = context.id("budget_settings_version");
    const version = nextVersion(state.budgetSettingsVersions, command.supersedesId, id);
    const record = {
      id,
      ...version,
      name: text(command.name, "Settings name"),
      currency: text(command.currency, "Currency").toUpperCase(),
      budgetMinor: nonnegative(command.budgetMinor, "Budget"),
      confirmationThresholdMinor: nonnegative(command.confirmationThresholdMinor, "Confirmation threshold"),
      requireConfirmation: command.requireConfirmation,
      createdAt: recordedAt,
    };
    return appendAudit(
      { ...state, budgetSettingsVersions: [...state.budgetSettingsVersions, record] },
      context,
      recordedAt,
      "aerarium_configuration.version_created",
      { type: "budget_settings_version", id },
      `Budget settings version created: ${record.name} v${record.version}`,
      { familyId: record.familyId, version: String(record.version) },
    );
  }

  if (command.type === "aerarium_provider_actual.record") {
    requireRun(state, command.runId);
    const measure: AerariumStoredMeasure = {
      id: context.id("aerarium_measure"),
      runId: command.runId,
      kind: "provider_actual",
      value: nonnegative(command.valueMinor, "Provider actual"),
      unit: "minor_currency",
      currency: text(command.currency, "Currency").toUpperCase(),
      provenance: "manual_provider_evidence",
      confidence: "manual_evidence",
      evidenceReference: text(command.evidenceReference, "Provider evidence reference"),
      profileVersionId: "",
      priceCardVersionId: "",
      subscriptionPlanVersionId: "",
      allocationRuleVersionId: "",
      provisional: false,
      inputs: { enteredBy: "Commander" },
      createdAt: recordedAt,
    };
    return appendMeasure(state, context, recordedAt, measure);
  }

  if (command.type === "aerarium_estimate.snapshot") {
    requireRun(state, command.runId);
    const estimate = estimateRun(state, command.runId);
    if (estimate.availability === "unavailable") throw new Error(`Estimate unavailable: ${estimate.reason}`);
    const shared = {
      runId: command.runId,
      evidenceReference: "",
      profileVersionId: estimate.profile.id,
      priceCardVersionId: estimate.priceCardVersionId,
      subscriptionPlanVersionId: "",
      allocationRuleVersionId: "",
      provisional: false,
      createdAt: recordedAt,
    };
    const tokenMeasure: AerariumStoredMeasure = {
      id: context.id("aerarium_measure"),
      ...shared,
      kind: "estimated_tokens",
      value: estimate.totalTokens,
      unit: "tokens",
      currency: "",
      provenance: "character_count_profile_estimate",
      confidence: "deterministic",
      inputs: {
        inputCharacters: estimate.inputCharacters,
        outputCharacters: estimate.outputCharacters,
        charactersPerToken: estimate.profile.charactersPerToken,
        inputTokens: estimate.inputTokens,
        outputTokens: estimate.outputTokens,
      },
    };
    const apiMeasure: AerariumStoredMeasure = {
      id: context.id("aerarium_measure"),
      ...shared,
      kind: "api_equivalent_estimate",
      value: estimate.apiEquivalentMinor,
      unit: "minor_currency",
      currency: estimate.currency,
      provenance: "profile_price_card_estimate",
      confidence: "deterministic",
      inputs: {
        inputTokens: estimate.inputTokens,
        outputTokens: estimate.outputTokens,
        profileVersion: estimate.profile.version,
      },
    };
    return appendMeasure(
      appendMeasure(state, context, recordedAt, tokenMeasure),
      context,
      recordedAt,
      apiMeasure,
    );
  }

  const run = requireRun(state, command.runId);
  const allocation = allocateRun(state, command.allocationRuleVersionId, run.id, command.asOf);
  if (allocation.availability === "unavailable") throw new Error(`Allocation unavailable: ${allocation.reason}`);
  const measure: AerariumStoredMeasure = {
    id: context.id("aerarium_measure"),
    runId: run.id,
    kind: "allocated_subscription_cost",
    value: allocation.allocatedMinor,
    unit: "minor_currency",
    currency: allocation.currency,
    provenance: "eligible_active_runtime_allocation",
    confidence: "allocation",
    evidenceReference: "",
    profileVersionId: "",
    priceCardVersionId: "",
    subscriptionPlanVersionId: allocation.subscriptionPlanVersionId,
    allocationRuleVersionId: allocation.allocationRuleVersionId,
    provisional: allocation.provisional,
    inputs: {
      planFeeMinor: allocation.planFeeMinor,
      targetRuntimeMs: allocation.targetRuntimeMs,
      eligibleRuntimeDenominatorMs: allocation.eligibleRuntimeDenominatorMs,
      periodStart: allocation.periodStart,
      periodEnd: allocation.periodEnd,
      asOf: command.asOf,
    },
    createdAt: recordedAt,
  };
  return appendMeasure(state, context, recordedAt, measure);
}
