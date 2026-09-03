import { useMemo, useState } from "react";
import type {
  CastraCommand,
  CastraState,
  RemoteAllowedActivity,
  RemoteCompanionSessionState,
  RemoteWorkSource,
  RemoteWorkTarget,
} from "../domain/types";
import { evaluateRemoteProposal, remoteProposalHash } from "../domain/remoteWork";
import { shortId } from "../domain/ids";
import { companionBoundaryStatus, companionProtocol } from "./companionProtocol";
import { commandConnectorContract } from "./commandConnector";
import { hostedControlPlaneTarget, validateHostedControlPlane } from "./controlPlane";

interface Props {
  state: CastraState;
  execute: (commands: CastraCommand[]) => Promise<boolean>;
}

function title(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

const activities: RemoteAllowedActivity[] = [
  "draft_assist",
  "commander_intent_draft",
  "short_summary",
  "fact_grounded_rewrite",
  "bounded_extraction",
];

const sources: RemoteWorkSource[] = ["web", "codex_text", "voice", "external_handoff"];

export function RemoteWorkbench({ state, execute }: Props) {
  const [source, setSource] = useState<RemoteWorkSource>("web");
  const [sourceText, setSourceText] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [activity, setActivity] = useState<RemoteAllowedActivity>("commander_intent_draft");
  const [policyId, setPolicyId] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [targetValue, setTargetValue] = useState("commander_intent_draft:unassigned");
  const currentPolicyIds = new Set(state.localModelPolicyVersions.map((item) => item.supersedesId).filter(Boolean));
  const remotePolicies = state.localModelPolicyVersions.filter((item) => !currentPolicyIds.has(item.id) && item.workflowKey === "remote_work");
  const effectivePolicyId = policyId || remotePolicies[0]?.id || "";
  const policy = remotePolicies.find((item) => item.id === effectivePolicyId) ?? null;
  const latestCatalog = state.localModelCatalogObservations.at(-1) ?? null;
  const modelOptions = (policy?.allowedModelNames ?? []).map((name) => ({
    name,
    digest: latestCatalog?.models.find((model) => model.name === name)?.digest ?? "unavailable",
  }));
  const effectiveModel = selectedModel && modelOptions.some((item) => item.name === selectedModel)
    ? selectedModel
    : modelOptions[0]?.name ?? "";
  const selectedModelEvidence = modelOptions.find((item) => item.name === effectiveModel) ?? null;
  const targets = useMemo(() => [
    { value: "commander_intent_draft:unassigned", label: "Commander’s Intent draft · unassigned" },
    ...state.campaigns.map((item) => ({ value: `campaign:${item.id}`, label: `Campaign · ${item.title}` })),
    ...state.missions.map((item) => ({ value: `mission:${item.id}`, label: `Mission · ${item.title}` })),
    ...state.actions.map((item) => ({ value: `action:${item.id}`, label: `Action · ${item.title}` })),
  ], [state.actions, state.campaigns, state.missions]);
  const companion = [...state.remoteCompanionRegistrations].reverse().find((item) => item.pairingState !== "revoked") ?? null;
  const controlPlane = validateHostedControlPlane(null);
  const latestReceipt = state.remoteWorkReceipts.at(-1) ?? null;
  const boundary = companionBoundaryStatus(latestReceipt?.id ?? "none");
  const remoteAudits = state.auditEvents.filter((event) => event.entityType.startsWith("remote_"));

  async function createProposal(event: React.FormEvent) {
    event.preventDefault();
    if (!policy || !selectedModelEvidence) return;
    const [targetType, ...targetIdParts] = targetValue.split(":");
    const target: RemoteWorkTarget = { type: targetType as RemoteWorkTarget["type"], id: targetIdParts.join(":") };
    const succeeded = await execute([{
      type: "remote_work.proposal.create",
      source,
      sourceText,
      sourceReference,
      target,
      allowedActivity: activity,
      runtimeSelection: {
        runtimeKind: "local_ollama",
        runtimeReference: "ollama_loopback",
        modelPolicyVersionId: policy.id,
        selectedModelName: selectedModelEvidence.name,
        selectedModelDigest: selectedModelEvidence.digest,
      },
    }]);
    if (succeeded) {
      setSourceText("");
      setSourceReference("");
    }
  }

  function setCompanionState(sessionState: Exclude<RemoteCompanionSessionState, "disabled" | "revoked">) {
    if (!companion) return;
    void execute([{ type: "remote_work.companion.session.set", companionId: companion.id, sessionState }]);
  }

  return (
    <>
      <div className="page-heading remote-title">
        <div><span className="eyebrow">A010 local package · remote queue disabled</span><h1>Remote Workbench</h1><p>Inspect the guarded remote-work simulation and current-user Companion boundary. The package is manually launchable, but this browser has no process transport and hosted remote dispatch is not configured.</p></div>
        <span className="remote-proof-stamp">LOCAL PACKAGE · REMOTE OFF</span>
      </div>

      <section className="remote-boundary-banner">
        <div><span>Hosted control plane</span><strong>{title(controlPlane.status)}</strong><small>{controlPlane.statement}</small></div>
        <div><span>Phase 1 package</span><strong>{title(hostedControlPlaneTarget.phase1PackageStatus)}</strong><small>Contract {hostedControlPlaneTarget.contractVersion} · migration {hostedControlPlaneTarget.migrationVersion} · server adapter disabled.</small></div>
        <div><span>Intended target</span><strong>Vercel UI + Supabase ledger</strong><small>Feasibility pattern only · no account, dependency, credentials, privileged browser table access, or network call.</small></div>
        <div><span>Companion package</span><strong>{title(boundary.implementation)}</strong><small>Current-user manual launch · local stdio adapter · listener {companionProtocol.listener} · browser transport absent.</small></div>
        <div><span>Codex subscription adapter</span><strong>Repository ready</strong><small>Requires runtime-reported ChatGPT subscription plus an exact observed model/reasoning match. API auth and fallback are refused.</small></div>
        <div><span>API-metered use</span><strong>0</strong><small>No OpenAI, Anthropic, Realtime, provider, or model API call.</small></div>
      </section>

      <div className="remote-layout">
        <section className="remote-panel">
          <div className="section-heading"><div><span className="eyebrow">Current-user package and placeholder pairing</span><h2>Companion evidence</h2></div></div>
          {!companion ? (
            <div className="remote-empty"><p>No Companion metadata is recorded. Registration below stores only a visibly labelled placeholder fingerprint—never a key or secret.</p><button className="button button-accent" onClick={() => void execute([{ type: "remote_work.companion.register_placeholder", displayName: "Windows current-user proof Companion", publicFingerprintPlaceholder: "PLACEHOLDER:LOCAL_POC_ONLY" }])}>Record placeholder Companion</button></div>
          ) : (
            <div className="companion-card">
              <div><span className={`status status-${companion.sessionState === "ready" ? "completed" : "blocked"}`}>{title(companion.sessionState)}</span><strong>{companion.displayName}</strong><small>{shortId(companion.id)} · {companion.platform} · {title(companion.userScope)}</small></div>
              <dl><div><dt>Pairing</dt><dd>{title(companion.pairingState)}</dd></div><div><dt>Fingerprint</dt><dd>{companion.publicFingerprintPlaceholder}</dd></div><div><dt>Protocol</dt><dd>{companion.protocolVersion}</dd></div><div><dt>Last receipt</dt><dd>{companion.lastReceiptAt ? dateLabel(companion.lastReceiptAt) : "None"}</dd></div></dl>
              <p className="form-warning">The card remains simulation metadata. “Ready” exercises IndexedDB guards; it does not start the A010 process or prove cryptographic pairing. Use the current-user command guide for the separate local package.</p>
              <div className="record-controls"><button className="button button-small" onClick={() => setCompanionState("ready")}>Simulate ready</button><button className="button button-small" onClick={() => setCompanionState("degraded")}>Simulate degraded</button><button className="button button-small" onClick={() => setCompanionState("offline")}>Simulate offline</button><button className="button button-danger" onClick={() => void execute([{ type: "remote_work.companion.disable", companionId: companion.id, reason: "Commander local emergency disable from Remote Workbench." }])}>Local disable</button><button className="button button-danger" onClick={() => void execute([{ type: "remote_work.companion.revoke", companionId: companion.id, reason: "Commander revoked placeholder pairing from Remote Workbench." }])}>Revoke</button></div>
            </div>
          )}
        </section>

        <section className="remote-panel">
          <div className="section-heading"><div><span className="eyebrow">Exact content · one runtime selection</span><h2>Create draft proposal</h2></div></div>
          <form className="remote-form" onSubmit={createProposal}>
            <div className="form-split"><label>Proposal source<select value={source} onChange={(event) => setSource(event.target.value as RemoteWorkSource)}>{sources.map((item) => <option value={item} key={item}>{title(item)}</option>)}</select></label><label>Allowed activity<select value={activity} onChange={(event) => setActivity(event.target.value as RemoteAllowedActivity)}>{activities.map((item) => <option value={item} key={item}>{title(item)}</option>)}</select></label></div>
            <label>Target<select value={targetValue} onChange={(event) => setTargetValue(event.target.value)}>{targets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label>Supplied source text<textarea required rows={6} value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="Bounded facts for a draft-only proposal. Do not enter credentials or sensitive secrets." /></label>
            <label>Source reference (optional)<input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} placeholder="Record, chat, or manual reference—never a credential" /></label>
            <div className="form-split"><label>Remote-work model policy<select value={effectivePolicyId} onChange={(event) => { setPolicyId(event.target.value); setSelectedModel(""); }}><option value="" disabled>No policy selected</option>{remotePolicies.map((item) => <option value={item.id} key={item.id}>{item.name} · v{item.version} · {item.activityKey}</option>)}</select></label><label>Exact policy-allowed model<select value={effectiveModel} onChange={(event) => setSelectedModel(event.target.value)}><option value="" disabled>No model selected</option>{modelOptions.map((item) => <option value={item.name} key={item.name}>{item.name} · {item.digest === "unavailable" ? "digest unavailable" : item.digest.slice(0, 12)}</option>)}</select></label></div>
            <p className="source-callout"><strong>One selection only</strong><span>Local Ollama · fixed loopback concept · policy {effectivePolicyId ? shortId(effectivePolicyId) : "unavailable"} · model digest {selectedModelEvidence?.digest ?? "unavailable"}. No fallback list is stored.</span></p>
            {source === "voice" && <p className="form-warning">Voice supplies proposal text only. It never approves, releases, claims, or executes work.</p>}
            {remotePolicies.length === 0 && <p className="form-warning">Blocked: create an enabled, Product-Owner-permitted Low-risk completion policy with workflow key <code>remote_work</code> in Local Models. This screen does not create or weaken policy.</p>}
            <button className="button button-primary" disabled={!policy || !selectedModelEvidence || !sourceText.trim()}>Create reviewable draft</button>
          </form>
        </section>
      </div>

      <div className="section-heading"><div><span className="eyebrow">Commander-bound approval</span><h2>Proposals and release gates</h2></div></div>
      <div className="remote-proposal-list">
        {[...state.remoteWorkProposals].reverse().map((proposal) => {
          const hash = remoteProposalHash(proposal);
          const decision = [...state.remoteCommanderDecisions].reverse().find((item) => item.proposalId === proposal.id) ?? null;
          const job = state.remoteWorkJobs.find((item) => item.proposalId === proposal.id) ?? null;
          const gate = evaluateRemoteProposal(state, proposal, new Date().toISOString());
          return <article key={proposal.id}>
            <div className="remote-card-heading"><div><span className="record-id">{shortId(proposal.id)} · r{proposal.revision}</span><h3>{title(proposal.allowedActivity)}</h3><small>{title(proposal.source)} · {proposal.target.type}:{proposal.target.id}</small></div><span className={`status status-${gate.ready ? "completed" : "blocked"}`}>{job ? title(job.status) : gate.ready ? "Release ready" : "Blocked"}</span></div>
            <p>{proposal.sourceText}</p>
            <div className="remote-evidence-grid"><span><b>Source hash</b>{proposal.sourceHash}</span><span><b>Approval hash</b>{hash}</span><span><b>Runtime/model</b>{proposal.runtimeSelection.runtimeKind} · {proposal.runtimeSelection.selectedModelName}</span><span><b>Authority</b>Proposal only · no mutation</span></div>
            {decision && <div className="remote-decision">Commander {decision.decision} · {decision.expiresAt ? `expires ${dateLabel(decision.expiresAt)}` : "no approval expiry"} · {decision.reason}</div>}
            {!gate.ready && !job && <ul className="remote-blockers">{gate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
            <div className="record-controls">
              {!job && <><button className="button button-accent" onClick={() => void execute([{ type: "remote_work.proposal.decide", proposalId: proposal.id, decision: "approved", reason: "Commander approved exact Low-risk draft-only content for the local deterministic proof.", expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() }])}>Approve exact content · 30 min</button><button className="button button-quiet" onClick={() => void execute([{ type: "remote_work.proposal.decide", proposalId: proposal.id, decision: "rejected", reason: "Commander rejected this draft proposal." }])}>Reject</button></>}
              {!job && companion && <button className="button button-primary" disabled={!gate.ready} onClick={() => void execute([{ type: "remote_work.job.release", proposalId: proposal.id, companionId: companion.id }])}>Release to local proof queue</button>}
            </div>
          </article>;
        })}
        {state.remoteWorkProposals.length === 0 && <div className="inline-empty">No remote-work proposals. Creating one writes only local IndexedDB state and ordered audit.</div>}
      </div>

      <div className="section-heading"><div><span className="eyebrow">At-most-once state machine</span><h2>Local job simulation</h2></div></div>
      <div className="remote-job-list">
        {[...state.remoteWorkJobs].reverse().map((job) => {
          const attempt = state.remoteWorkAttempts.find((item) => item.jobId === job.id) ?? null;
          const receipt = state.remoteWorkReceipts.find((item) => item.jobId === job.id) ?? null;
          return <article key={job.id}>
            <div className="remote-card-heading"><div><span className="record-id">{shortId(job.id)}</span><h3>{title(job.status)}</h3><small>Expires {dateLabel(job.expiresAt)} · attempt {attempt ? "1/1" : "0/1"}</small></div><span className="remote-proof-stamp">SIMULATED</span></div>
            <div className="remote-evidence-grid"><span><b>Proposal snapshot</b>{job.proposalHash}</span><span><b>Companion</b>{shortId(job.companionId)}</span><span><b>Runtime</b>{job.runtimeSelection.runtimeReference}</span><span><b>Calls</b>Provider 0 · Model 0</span></div>
            {receipt && <div className="remote-receipt"><strong>{title(receipt.outcome)} receipt</strong><span>{receipt.reasonCode} · {receipt.reason}</span>{receipt.redactedResult && <pre>{receipt.redactedResult}</pre>}<small>Immutable · proposal only · {receipt.evidenceMode}</small></div>}
            {!receipt && <div className="record-controls">
              {job.status === "queued" && <><button className="button button-accent" onClick={() => void execute([{ type: "remote_work.job.claim", jobId: job.id, companionId: job.companionId, leaseExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString() }])}>Simulate outbound claim</button><button className="button button-quiet" onClick={() => void execute([{ type: "remote_work.job.reject", jobId: job.id, companionId: job.companionId, reason: "Deterministic proof rejection before execution." }])}>Simulate reject</button></>}
              {job.status === "claimed" && attempt && <button className="button button-accent" onClick={() => void execute([{ type: "remote_work.job.start", jobId: job.id, attemptId: attempt.id }])}>Simulate start · no model</button>}
              {job.status === "executing" && attempt && <><button className="button button-accent" onClick={() => void execute([{ type: "remote_work.job.outcome.record", jobId: job.id, attemptId: attempt.id, outcome: "proposal", redactedResult: "Deterministic state-machine evidence only. No model generated this text.", reasonCode: "simulation_complete", reason: "Local proof recorded a review-only simulated result." }])}>Record simulated result</button><button className="button button-quiet" onClick={() => void execute([{ type: "remote_work.job.outcome.record", jobId: job.id, attemptId: attempt.id, outcome: "failed", redactedResult: "", reasonCode: "simulation_failed", reason: "Local proof recorded a deterministic failure without a model call." }])}>Record simulated failure</button><button className="button button-quiet" onClick={() => void execute([{ type: "remote_work.job.outcome.record", jobId: job.id, attemptId: attempt.id, outcome: "unknown", redactedResult: "", reasonCode: "simulation_unknown", reason: "Outcome deliberately recorded unknown; automatic retry is prohibited." }])}>Record unknown</button></>}
              <button className="button button-danger" onClick={() => void execute([{ type: "remote_work.job.cancel", jobId: job.id, reason: "Commander canceled the local deterministic proof job." }])}>Cancel</button>
            </div>}
          </article>;
        })}
        {state.remoteWorkJobs.length === 0 && <div className="inline-empty">No jobs released. Nothing can contact a provider, Companion, or model.</div>}
      </div>

      <div className="section-heading"><div><span className="eyebrow">AERARIUM-compatible separation</span><h2>Four evidence buckets</h2></div></div>
      <div className="remote-cost-grid">
        {latestReceipt ? Object.entries(latestReceipt.evidenceBuckets).map(([name, bucket]) => <article key={name}><span>{title(name)}</span><strong>{title(bucket.availability)}</strong><small>{bucket.amountMinor === null ? "Cost unavailable" : `${bucket.amountMinor} ${bucket.currency} minor units`} · tokens {bucket.tokens ?? "unavailable"} · runtime {bucket.observedRuntimeMs ?? "unavailable"}</small><p>{bucket.provenance}</p></article>) : <div className="inline-empty">No receipt exists. Subscription interaction, local runtime, hosted provider/infrastructure, and API-metered use remain separate and unavailable; no cost or usage is invented.</div>}
      </div>

      <div className="remote-layout remote-lower">
        <section className="remote-panel"><div className="section-heading"><div><span className="eyebrow">Future connector boundary</span><h2>Command Connector</h2></div></div><p className="muted-copy">{commandConnectorContract.confirmation}</p><div className="connector-operation-list">{commandConnectorContract.allowedOperations.map((operation) => <span key={operation}>{title(operation)}</span>)}</div><p className="form-warning">No raw database, queue, Ollama, Companion/device, credential, file, terminal, browser, tool, or authoritative-record operation.</p><small>{commandConnectorContract.runtimeBoundary}</small></section>
        <section className="remote-panel"><div className="section-heading"><div><span className="eyebrow">Ordered evidence</span><h2>Remote-work audit</h2></div></div><div className="remote-audit-list">{[...remoteAudits].reverse().slice(0, 12).map((event) => <article key={event.id}><span>#{event.sequence}</span><div><strong>{event.summary}</strong><small>{event.kind} · {event.origin} · {shortId(event.entityId)}</small></div></article>)}{remoteAudits.length === 0 && <div className="inline-empty">No remote-work audit events.</div>}</div></section>
      </div>

      <p className="remote-footnote">{hostedControlPlaneTarget.status} · {boundary.statement} Provider setup, real pairing, remote credentials, outbound transport, model invocation, semantic quality, multi-device operation, and deployment remain unverified and outside this action.</p>
    </>
  );
}
