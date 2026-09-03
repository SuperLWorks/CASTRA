import { useMemo, useState } from "react";
import {
  allocateRun,
  estimateRun,
  observedRuntime,
  runLifecycle,
  runMeasureViews,
} from "../domain/aerarium";
import { shortId } from "../domain/ids";
import { canonicalRoleIds, canonicalRoleNames, presentRole } from "../domain/presentation";
import type {
  AerariumRun,
  AerariumRunEventType,
  CastraCommand,
  CastraState,
  WorkLink,
} from "../domain/types";

type AerariumTab = "ledger" | "rollups";
type ConfigKind = "plan" | "price" | "profile" | "allocation" | "budget";
type ModalRequest =
  | { kind: "run" }
  | { kind: "event"; runId: string; eventType: Exclude<AerariumRunEventType, "start"> }
  | { kind: "provider"; runId: string }
  | { kind: "allocation_snapshot"; runId: string }
  | { kind: "config"; configKind: ConfigKind; supersedesId?: string };

interface Props {
  state: CastraState;
  execute: (commands: CastraCommand[]) => Promise<boolean>;
}

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function workLabel(state: CastraState, link: WorkLink): string {
  if (link.type === "baseops") return `BASEOPS · ${link.id}`;
  const records =
    link.type === "campaign" ? state.campaigns : link.type === "mission" ? state.missions : state.actions;
  const record = records.find((item) => item.id === link.id);
  return record ? `${label(link.type)} · ${record.title}` : `${label(link.type)} · ${shortId(link.id)}`;
}

function RoleLabel({ state, roleId, className = "role-chip" }: { state: CastraState; roleId: string; className?: string }) {
  const presented = presentRole(state, roleId);
  return <span className={className} style={{ "--role-accent": presented.accentColor } as React.CSSProperties} title={presented.accessibleTitle} aria-label={presented.accessibleTitle}>{presented.visualLabel}</span>;
}

function duration(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours > 0 ? `${hours}h ${remaining}m` : `${remaining}m`;
}

function money(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

function localInput(iso?: string): string {
  const date = new Date(iso ?? Date.now());
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 19);
}

function Status({ value, warning = false }: { value: string; warning?: boolean }) {
  return <span className={`aer-status ${warning ? "aer-status-warning" : ""}`}>{label(value)}</span>;
}

function AerariumModal({
  request,
  state,
  close,
  execute,
}: {
  request: ModalRequest;
  state: CastraState;
  close: () => void;
  execute: (commands: CastraCommand[]) => Promise<boolean>;
}) {
  const configKind = request.kind === "config" ? request.configKind : null;
  const previous = useMemo(() => {
    if (request.kind !== "config" || !request.supersedesId) return undefined;
    const collections = {
      plan: state.subscriptionPlanVersions,
      price: state.priceCardVersions,
      profile: state.modelProfileVersions,
      allocation: state.allocationRuleVersions,
      budget: state.budgetSettingsVersions,
    };
    return collections[request.configKind].find((item) => item.id === request.supersedesId);
  }, [request, state]);
  const previousData = previous as unknown as Record<string, unknown> | undefined;
  const [title, setTitle] = useState((previousData?.name as string) ?? "");
  const [description, setDescription] = useState("");
  const [workValue, setWorkValue] = useState("");
  const [roleId, setRoleId] = useState((previousData?.roleId as string) ?? "FORGE");
  const [modelKey, setModelKey] = useState((previousData?.modelKey as string) ?? "");
  const [occurredAt, setOccurredAt] = useState(localInput());
  const [eventOutcome, setEventOutcome] = useState("");
  const [inputCharacters, setInputCharacters] = useState("");
  const [outputCharacters, setOutputCharacters] = useState("");
  const [currency, setCurrency] = useState((previousData?.currency as string) ?? "USD");
  const [valueMinor, setValueMinor] = useState(
    String(
      previousData?.planFeeMinor ??
        previousData?.inputPerMillionMinor ??
        previousData?.budgetMinor ??
        "",
    ),
  );
  const [evidenceReference, setEvidenceReference] = useState("");
  const [periodStart, setPeriodStart] = useState(localInput(previousData?.periodStart as string | undefined));
  const [periodEnd, setPeriodEnd] = useState(localInput(previousData?.periodEnd as string | undefined));
  const [secondaryMinor, setSecondaryMinor] = useState(
    String(
      previousData?.outputPerMillionMinor ??
        previousData?.confirmationThresholdMinor ??
        "",
    ),
  );
  const [charactersPerToken, setCharactersPerToken] = useState(
    String(previousData?.charactersPerToken ?? ""),
  );
  const [priceCardVersionId, setPriceCardVersionId] = useState(
    (previousData?.priceCardVersionId as string) ?? state.priceCardVersions.at(-1)?.id ?? "",
  );
  const [subscriptionPlanVersionId, setSubscriptionPlanVersionId] = useState(
    (previousData?.subscriptionPlanVersionId as string) ?? state.subscriptionPlanVersions.at(-1)?.id ?? "",
  );
  const [eligibleRoles, setEligibleRoles] = useState(
    ((previousData?.eligibleRoleIds as string[] | undefined) ?? []).join(", "),
  );
  const [requireConfirmation, setRequireConfirmation] = useState(
    (previousData?.requireConfirmation as boolean | undefined) ?? true,
  );
  const [allocationRuleId, setAllocationRuleId] = useState(state.allocationRuleVersions.at(-1)?.id ?? "");

  const workOptions = [
    ...state.campaigns.map((record) => ({ value: `campaign:${record.id}`, label: `Campaign · ${record.title}` })),
    ...state.missions.map((record) => ({ value: `mission:${record.id}`, label: `Mission · ${record.title}` })),
    ...state.actions.map((record) => ({ value: `action:${record.id}`, label: `Action · ${record.title}` })),
  ];

  async function submit(command: CastraCommand) {
    if (await execute([command])) close();
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (request.kind === "run") {
      const divider = workValue.indexOf(":");
      await submit({
        type: "aerarium_run.create",
        title,
        work: { type: workValue.slice(0, divider) as WorkLink["type"], id: workValue.slice(divider + 1) },
        roleId,
        modelKey,
        startedAt: occurredAt,
      });
    } else if (request.kind === "event") {
      await submit({
        type: "aerarium_run_event.append",
        runId: request.runId,
        eventType: request.eventType,
        occurredAt,
        note: description,
        outcome: eventOutcome,
        inputCharacters: inputCharacters === "" ? null : Number(inputCharacters),
        outputCharacters: outputCharacters === "" ? null : Number(outputCharacters),
      });
    } else if (request.kind === "provider") {
      await submit({
        type: "aerarium_provider_actual.record",
        runId: request.runId,
        valueMinor: Number(valueMinor),
        currency,
        evidenceReference,
      });
    } else if (request.kind === "allocation_snapshot") {
      await submit({
        type: "aerarium_allocation.snapshot",
        runId: request.runId,
        allocationRuleVersionId: allocationRuleId,
        asOf: occurredAt,
      });
    } else if (configKind === "plan") {
      await submit({
        type: "subscription_plan.version.create",
        supersedesId: request.supersedesId,
        name: title,
        currency,
        planFeeMinor: Number(valueMinor),
        periodStart,
        periodEnd,
      });
    } else if (configKind === "price") {
      await submit({
        type: "price_card.version.create",
        supersedesId: request.supersedesId,
        name: title,
        currency,
        inputPerMillionMinor: Number(valueMinor),
        outputPerMillionMinor: Number(secondaryMinor),
      });
    } else if (configKind === "profile") {
      await submit({
        type: "model_profile.version.create",
        supersedesId: request.supersedesId,
        name: title,
        modelKey,
        roleId,
        charactersPerToken: Number(charactersPerToken),
        priceCardVersionId,
      });
    } else if (configKind === "allocation") {
      await submit({
        type: "allocation_rule.version.create",
        supersedesId: request.supersedesId,
        name: title,
        subscriptionPlanVersionId,
        eligibleRoleIds: eligibleRoles.split(",").map((role) => role.trim()).filter(Boolean),
      });
    } else {
      await submit({
        type: "budget_settings.version.create",
        supersedesId: request.supersedesId,
        name: title,
        currency,
        budgetMinor: Number(valueMinor),
        confirmationThresholdMinor: Number(secondaryMinor),
        requireConfirmation,
      });
    }
  }

  const modalTitle =
    request.kind === "run"
      ? "Create Run"
      : request.kind === "event"
        ? `Append ${label(request.eventType)} Event`
        : request.kind === "provider"
          ? "Record Provider Actual Evidence"
          : request.kind === "allocation_snapshot"
            ? "Snapshot Subscription Allocation"
            : `${request.supersedesId ? "New" : "Create"} ${label(request.configKind)} Version`;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="aerarium-form-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading"><div><span className="eyebrow">AERARIUM · auditable local input</span><h2 id="aerarium-form-title">{modalTitle}</h2></div><button className="icon-button" aria-label="Close" onClick={close}>×</button></div>
        <form onSubmit={onSubmit}>
          {request.kind === "run" && <><label>Run title<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Work-item context<select required value={workValue} onChange={(event) => setWorkValue(event.target.value)}><option value="" disabled>Select work item</option>{workOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><div className="form-split"><label>Protected canonical role<select required value={roleId} onChange={(event) => setRoleId(event.target.value)}>{canonicalRoleIds.map((canonicalId) => <option key={canonicalId} value={canonicalId}>{presentRole(state, canonicalId, "full_name").displayName} · {canonicalRoleNames[canonicalId]}</option>)}</select></label><label>Model key (optional)<input value={modelKey} onChange={(event) => setModelKey(event.target.value)} placeholder="Blank means estimates unavailable" /></label></div><label>Start time<input required type="datetime-local" step="1" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></label></>}
          {request.kind === "event" && <><label>Event time<input required type="datetime-local" step="1" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></label>{request.eventType === "outcome" && <><label>Outcome<input required value={eventOutcome} onChange={(event) => setEventOutcome(event.target.value)} /></label><div className="form-split"><label>Observed input characters (optional)<input type="number" min="0" step="1" value={inputCharacters} onChange={(event) => setInputCharacters(event.target.value)} /></label><label>Observed output characters (optional)<input type="number" min="0" step="1" value={outputCharacters} onChange={(event) => setOutputCharacters(event.target.value)} /></label></div></>}<label>Note<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label></>}
          {request.kind === "provider" && <><div className="source-callout"><strong>Manual provider evidence only</strong><span>This is not fetched or independently verified. It remains separately labelled as provider actual.</span></div><div className="form-split"><label>Actual in minor currency units<input required type="number" min="0" step="any" value={valueMinor} onChange={(event) => setValueMinor(event.target.value)} /></label><label>Currency<input required value={currency} onChange={(event) => setCurrency(event.target.value)} /></label></div><label>Provider evidence reference<input required value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} /></label></>}
          {request.kind === "allocation_snapshot" && <><label>Allocation rule version<select required value={allocationRuleId} onChange={(event) => setAllocationRuleId(event.target.value)}><option value="" disabled>Select exact version</option>{state.allocationRuleVersions.map((rule) => <option key={rule.id} value={rule.id}>{rule.name} v{rule.version} · {shortId(rule.id)}</option>)}</select></label><label>As-of time<input required type="datetime-local" step="1" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></label><div className="source-callout"><strong>Default formula</strong><span>Plan fee × target eligible active runtime ÷ eligible runtime denominator. Inputs are stored with the snapshot.</span></div></>}
          {request.kind === "config" && <><div className="source-callout"><strong>Append-only configuration version</strong><span>Prior versions remain unchanged and continue to support historical measures.</span></div><label>Name<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label></>}
          {configKind === "plan" && <><div className="form-split"><label>Plan fee in minor units<input required type="number" min="0" step="any" value={valueMinor} onChange={(event) => setValueMinor(event.target.value)} /></label><label>Currency<input required value={currency} onChange={(event) => setCurrency(event.target.value)} /></label></div><div className="form-split"><label>Period start<input required type="datetime-local" step="1" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label><label>Period end<input required type="datetime-local" step="1" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label></div></>}
          {configKind === "price" && <><div className="form-split"><label>Input / million tokens, minor units<input required type="number" min="0" step="any" value={valueMinor} onChange={(event) => setValueMinor(event.target.value)} /></label><label>Output / million tokens, minor units<input required type="number" min="0" step="any" value={secondaryMinor} onChange={(event) => setSecondaryMinor(event.target.value)} /></label></div><label>Currency<input required value={currency} onChange={(event) => setCurrency(event.target.value)} /></label></>}
          {configKind === "profile" && <><div className="form-split"><label>Model key<input required value={modelKey} onChange={(event) => setModelKey(event.target.value)} /></label><label>Exact canonical role match (optional)<select value={roleId} onChange={(event) => setRoleId(event.target.value)}><option value="">Any recorded role</option>{canonicalRoleIds.map((canonicalId) => <option key={canonicalId} value={canonicalId}>{presentRole(state, canonicalId, "full_name").displayName} · {canonicalRoleNames[canonicalId]}</option>)}</select></label></div><label>Characters per estimated token<input required type="number" min="0.000001" step="any" value={charactersPerToken} onChange={(event) => setCharactersPerToken(event.target.value)} /></label><label>Exact price card version<select required value={priceCardVersionId} onChange={(event) => setPriceCardVersionId(event.target.value)}><option value="" disabled>Select price card</option>{state.priceCardVersions.map((card) => <option key={card.id} value={card.id}>{card.name} v{card.version} · {shortId(card.id)}</option>)}</select></label></>}
          {configKind === "allocation" && <><label>Exact subscription plan version<select required value={subscriptionPlanVersionId} onChange={(event) => setSubscriptionPlanVersionId(event.target.value)}><option value="" disabled>Select plan</option>{state.subscriptionPlanVersions.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} v{plan.version} · {shortId(plan.id)}</option>)}</select></label><label>Eligible roles, comma-separated<input value={eligibleRoles} onChange={(event) => setEligibleRoles(event.target.value)} placeholder="Blank means all recorded roles" /></label><div className="source-callout"><strong>Formula locked for this version</strong><span>Plan fee × eligible active runtime ÷ total eligible active runtime.</span></div></>}
          {configKind === "budget" && <><div className="form-split"><label>Local budget in minor units<input required type="number" min="0" step="any" value={valueMinor} onChange={(event) => setValueMinor(event.target.value)} /></label><label>Confirmation threshold in minor units<input required type="number" min="0" step="any" value={secondaryMinor} onChange={(event) => setSecondaryMinor(event.target.value)} /></label></div><label>Currency<input required value={currency} onChange={(event) => setCurrency(event.target.value)} /></label><label className="check-label"><input type="checkbox" checked={requireConfirmation} onChange={(event) => setRequireConfirmation(event.target.checked)} /> Require Commander confirmation at threshold</label></>}
          <p className="form-note">No provider integration is called and no telemetry is invented. This operation writes ordered local audit evidence.</p>
          <div className="modal-actions"><button type="button" className="button button-quiet" onClick={close}>Cancel</button><button type="submit" className="button button-primary">Record</button></div>
        </form>
      </section>
    </div>
  );
}

function RunList({ state, open, create }: { state: CastraState; open: (runId: string) => void; create: () => void }) {
  const asOf = new Date().toISOString();
  return <><div className="page-heading"><div><span className="eyebrow">Append-only effort ledger</span><h1>Runs</h1><p>Local event timestamps are observed runtime evidence. Costs and estimates remain separately labelled.</p></div><button className="button button-primary" onClick={create}>＋ Run</button></div><div className="aer-run-list">{state.aerariumRuns.length === 0 && <div className="inline-empty">No AERARIUM runs recorded.</div>}{[...state.aerariumRuns].reverse().map((run) => { const lifecycle = runLifecycle(state, run.id); const runtime = observedRuntime(state, run.id, asOf); return <button className="aer-run-row" key={run.id} onClick={() => open(run.id)}><div><span className="record-id">{shortId(run.id)}</span><strong>{run.title}</strong><small>{workLabel(state, run.work)}</small></div><RoleLabel state={state} roleId={run.roleId} /><span>{duration(runtime.activeRuntimeMs)}</span><div className="badge-row"><Status value={lifecycle.status} />{lifecycle.unresolvedEnd && <Status value="unresolved end" warning />}</div><span className="aer-arrow">→</span></button>; })}</div></>;
}

function RunDetail({ state, run, back, execute, openModal }: { state: CastraState; run: AerariumRun; back: () => void; execute: Props["execute"]; openModal: (request: ModalRequest) => void }) {
  const asOf = new Date().toISOString();
  const lifecycle = runLifecycle(state, run.id);
  const events = state.aerariumRunEvents.filter((event) => event.runId === run.id);
  const measures = runMeasureViews(state, run.id, asOf);
  const stored = state.aerariumMeasures.filter((measure) => measure.runId === run.id);
  const estimate = estimateRun(state, run.id);
  const presentedRole = presentRole(state, run.roleId, "full_name");
  const eventButtons: Array<{ type: Exclude<AerariumRunEventType, "start">; label: string }> =
    lifecycle.status === "running" ? [{ type: "pause", label: "Pause" }, { type: "blocked", label: "Block" }, { type: "end", label: "End" }, { type: "outcome", label: "Outcome" }] : lifecycle.status === "paused" ? [{ type: "resume", label: "Resume" }, { type: "end", label: "End" }, { type: "outcome", label: "Outcome" }] : lifecycle.status === "blocked" ? [{ type: "unblocked", label: "Unblock" }, { type: "end", label: "End" }, { type: "outcome", label: "Outcome" }] : [{ type: "outcome", label: "Outcome" }];
  return <><button className="back-link" onClick={back}>← All runs</button><div className="page-heading aer-run-heading"><div><span className="eyebrow">Run · {shortId(run.id)}</span><h1>{run.title}</h1><p>{workLabel(state, run.work)} · Role {presentedRole.displayName} ({presentedRole.canonicalName} · {presentedRole.canonicalId}) · Model {run.modelKey || "Unavailable"}</p><div className="badge-row"><Status value={lifecycle.status} />{lifecycle.unresolvedEnd && <Status value="missing end stamp" warning />}</div></div><div className="record-controls">{eventButtons.map((button) => <button key={button.type} className={button.type === "end" ? "button button-danger" : "button button-accent"} onClick={() => openModal({ kind: "event", runId: run.id, eventType: button.type })}>{button.label}</button>)}</div></div><section className="aer-provenance-banner"><strong>No blended actual cost</strong><span>Observed runtime, evidenced provider actual, subscription allocation, token estimate, and API-equivalent estimate remain independent measures.</span></section><div className="aer-measure-grid">{measures.map((measure) => <article className={`aer-measure ${measure.availability === "unavailable" ? "unavailable" : ""}`} key={measure.kind}><span>{label(measure.kind)}</span><strong>{measure.availability === "unavailable" ? "Unavailable" : measure.unit === "milliseconds" ? duration(measure.value!) : measure.unit === "tokens" ? Math.round(measure.value!).toLocaleString() : money(measure.value!, measure.currency)}</strong><small>{measure.availability === "unavailable" ? measure.reason : `${label(measure.provenance)} · ${label(measure.confidence)}${measure.provisional ? " · Provisional" : ""}`}</small></article>)}</div><div className="aer-measure-actions"><button className="button button-quiet" onClick={() => openModal({ kind: "provider", runId: run.id })}>Record provider evidence</button><button className="button button-accent" disabled={estimate.availability === "unavailable"} title={estimate.availability === "unavailable" ? estimate.reason : ""} onClick={() => execute([{ type: "aerarium_estimate.snapshot", runId: run.id }])}>Snapshot estimates</button><button className="button button-accent" disabled={state.allocationRuleVersions.length === 0} onClick={() => openModal({ kind: "allocation_snapshot", runId: run.id })}>Snapshot allocation</button></div><div className="section-heading"><div><span className="eyebrow">Append-only timeline</span><h2>Run Events</h2></div></div><div className="aer-event-list">{events.map((event) => <article key={event.id}><div className="aer-event-mark">{event.type === "start" ? "▶" : event.type === "end" ? "■" : "◆"}</div><div><span className="record-id">{shortId(event.id)}</span><strong>{label(event.type)}</strong><small>{new Date(event.occurredAt).toLocaleString()}</small>{event.note && <p>{event.note}</p>}{event.outcome && <p>Outcome: {event.outcome}</p>}{(event.inputCharacters !== null || event.outputCharacters !== null) && <p>Recorded characters: input {event.inputCharacters ?? "unavailable"}, output {event.outputCharacters ?? "unavailable"}</p>}</div></article>)}</div><div className="section-heading"><div><span className="eyebrow">Historical snapshots</span><h2>Stored Measures</h2></div></div><div className="aer-stored-list">{stored.length === 0 && <div className="inline-empty compact">No manual or calculated snapshots recorded.</div>}{stored.map((measure) => <article key={measure.id}><div><span className="record-id">{shortId(measure.id)}</span><strong>{label(measure.kind)}</strong><small>{label(measure.provenance)} · {label(measure.confidence)}{measure.provisional ? " · Provisional" : ""}</small></div><strong>{measure.unit === "tokens" ? Math.round(measure.value).toLocaleString() : money(measure.value, measure.currency)}</strong><div className="measure-links"><span>Profile: {measure.profileVersionId ? shortId(measure.profileVersionId) : "—"}</span><span>Price card: {measure.priceCardVersionId ? shortId(measure.priceCardVersionId) : "—"}</span><span>Plan: {measure.subscriptionPlanVersionId ? shortId(measure.subscriptionPlanVersionId) : "—"}</span><span>Rule: {measure.allocationRuleVersionId ? shortId(measure.allocationRuleVersionId) : "—"}</span></div><code>{JSON.stringify(measure.inputs)}</code></article>)}</div></>;
}

interface RollupAccumulator { key: string; label: string; accessibleTitle: string; runtime: number; provider: number; providerCount: number; allocated: number; allocatedCount: number; tokens: number; tokenCount: number; api: number; apiCount: number; currency: string }

function Rollups({ state }: { state: CastraState }) {
  const [dimension, setDimension] = useState<"campaign" | "mission" | "action" | "role">("campaign");
  const asOf = new Date().toISOString();
  const rows = new Map<string, RollupAccumulator>();
  for (const run of state.aerariumRuns) {
    if (dimension !== "role" && run.work.type !== dimension) continue;
    const key = dimension === "role" ? run.roleId : run.work.id;
    const presented = presentRole(state, run.roleId);
    const row = rows.get(key) ?? { key, label: dimension === "role" ? presented.visualLabel : workLabel(state, run.work), accessibleTitle: dimension === "role" ? presented.accessibleTitle : workLabel(state, run.work), runtime: 0, provider: 0, providerCount: 0, allocated: 0, allocatedCount: 0, tokens: 0, tokenCount: 0, api: 0, apiCount: 0, currency: "" };
    row.runtime += observedRuntime(state, run.id, asOf).activeRuntimeMs;
    for (const kind of ["provider_actual", "allocated_subscription_cost", "estimated_tokens", "api_equivalent_estimate"] as const) {
      const measure = state.aerariumMeasures.filter((item) => item.runId === run.id && item.kind === kind).at(-1);
      if (!measure) continue;
      if (kind === "provider_actual") { row.provider += measure.value; row.providerCount += 1; }
      if (kind === "allocated_subscription_cost") { row.allocated += measure.value; row.allocatedCount += 1; }
      if (kind === "estimated_tokens") { row.tokens += measure.value; row.tokenCount += 1; }
      if (kind === "api_equivalent_estimate") { row.api += measure.value; row.apiCount += 1; }
      if (measure.currency) row.currency = measure.currency;
    }
    rows.set(key, row);
  }
  return <><div className="page-heading"><div><span className="eyebrow">Separated measure summaries</span><h1>Rollups</h1><p>Direct work context and role labels only. Unavailable measures remain unavailable rather than zero-cost actuals.</p></div></div><div className="aer-dimension-tabs">{["campaign", "mission", "action", "role"].map((value) => <button key={value} className={dimension === value ? "active" : ""} onClick={() => setDimension(value as typeof dimension)}>{label(value)}</button>)}</div><div className="aer-rollup-table"><div className="aer-rollup-head"><span>{label(dimension)}</span><span>Observed runtime</span><span>Provider actual</span><span>Allocated subscription</span><span>Estimated tokens</span><span>API-equivalent estimate</span></div>{rows.size === 0 && <div className="inline-empty compact">No direct {dimension} run context recorded.</div>}{[...rows.values()].map((row) => <div className="aer-rollup-row" key={row.key}><strong title={row.accessibleTitle}>{row.label}</strong><span>{duration(row.runtime)}</span><span>{row.providerCount ? money(row.provider, row.currency || "USD") : "Unavailable"}</span><span>{row.allocatedCount ? money(row.allocated, row.currency || "USD") : "Unavailable"}</span><span>{row.tokenCount ? Math.round(row.tokens).toLocaleString() : "Unavailable"}</span><span>{row.apiCount ? money(row.api, row.currency || "USD") : "Unavailable"}</span></div>)}</div></>;
}

function ConfigSection({ title, kind, records, open }: { title: string; kind: ConfigKind; records: Array<Record<string, unknown> & { id: string; familyId: string; version: number; name: string }>; open: (request: ModalRequest) => void }) {
  return <section className="aer-config-section"><div className="section-heading"><div><span className="eyebrow">Versioned local configuration</span><h2>{title}</h2></div><button className="button button-primary" onClick={() => open({ kind: "config", configKind: kind })}>＋ Version</button></div><div className="aer-config-grid">{records.length === 0 && <div className="inline-empty compact">No versions configured. Dependent measures remain unavailable.</div>}{records.map((record) => <article key={record.id}><div className="card-topline"><span className="record-id">{shortId(record.id)}</span><Status value={`v${record.version}`} /></div><h3>{record.name}</h3><small>Family {shortId(record.familyId)}</small><dl>{Object.entries(record).filter(([key]) => !["id", "familyId", "version", "name", "createdAt", "supersedesId"].includes(key)).map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{Array.isArray(value) ? value.join(", ") || "All roles" : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}</dd></div>)}</dl><button className="button button-quiet" onClick={() => open({ kind: "config", configKind: kind, supersedesId: record.id })}>New version</button></article>)}</div></section>;
}

function Configuration({ state, open }: { state: CastraState; open: (request: ModalRequest) => void }) {
  return <><div className="page-heading"><div><span className="eyebrow">Commander-controlled assumptions</span><h1>Configuration</h1><p>No defaults are invented. New records create versions; historical records remain linked to exact versions.</p></div></div><ConfigSection title="Subscription Plans" kind="plan" records={state.subscriptionPlanVersions as unknown as Array<Record<string, unknown> & { id: string; familyId: string; version: number; name: string }>} open={open} /><ConfigSection title="Price Cards" kind="price" records={state.priceCardVersions as unknown as Array<Record<string, unknown> & { id: string; familyId: string; version: number; name: string }>} open={open} /><ConfigSection title="Model Profiles" kind="profile" records={state.modelProfileVersions as unknown as Array<Record<string, unknown> & { id: string; familyId: string; version: number; name: string }>} open={open} /><ConfigSection title="Allocation Rules" kind="allocation" records={state.allocationRuleVersions as unknown as Array<Record<string, unknown> & { id: string; familyId: string; version: number; name: string }>} open={open} /><ConfigSection title="Budget & Confirmation Settings" kind="budget" records={state.budgetSettingsVersions as unknown as Array<Record<string, unknown> & { id: string; familyId: string; version: number; name: string }>} open={open} /></>;
}

export function AerariumConfigurationWorkspace({ state, execute }: Props) {
  const [modal, setModal] = useState<ModalRequest | null>(null);
  return <section className="aerarium-configuration-embedded">
    <div className="presentation-boundary"><strong>AERARIUM configuration is consolidated here</strong><span>Ledger and rollups remain accessible through Command Overview and Campaign stewardship. Every assumption creates an immutable version; no provider data is invented.</span></div>
    <Configuration state={state} open={setModal} />
    {modal && <AerariumModal key={`${modal.kind}-${"configKind" in modal ? `${modal.configKind}-${modal.supersedesId ?? "new"}` : "new"}`} request={modal} state={state} close={() => setModal(null)} execute={execute} />}
  </section>;
}

export function AerariumWorkspace({ state, execute }: Props) {
  const [tab, setTab] = useState<AerariumTab>("ledger");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalRequest | null>(null);
  const selectedRun = state.aerariumRuns.find((run) => run.id === selectedRunId);
  return <><div className="aerarium-header"><div><span className="eyebrow">Treasury & Effort Stewardship</span><h1>AERARIUM</h1><p>Configuration is governed from the main Configuration page.</p></div><nav aria-label="AERARIUM sections">{(["ledger", "rollups"] as const).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => { setTab(item); setSelectedRunId(null); }}>{label(item)}</button>)}</nav></div>{tab === "ledger" && (selectedRun ? <RunDetail state={state} run={selectedRun} back={() => setSelectedRunId(null)} execute={execute} openModal={setModal} /> : <RunList state={state} open={setSelectedRunId} create={() => setModal({ kind: "run" })} />)}{tab === "rollups" && <Rollups state={state} />}{modal && <AerariumModal key={`${modal.kind}-${"runId" in modal ? modal.runId : "configKind" in modal ? `${modal.configKind}-${modal.supersedesId ?? "new"}` : "new"}`} request={modal} state={state} close={() => setModal(null)} execute={execute} />}</>;
}
