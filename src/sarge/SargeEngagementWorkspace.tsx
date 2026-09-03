import { useEffect, useMemo, useState } from "react";
import type {
  CastraCommand,
  CastraState,
  SargeEngagementMode,
  SargeEngagementTarget,
  SargeRequestedActivity,
  SargeResultOutcome,
} from "../domain/types";
import { evaluateSargeRequest, latestSargeDecision } from "../domain/sarge";

interface Props {
  state: CastraState;
  execute: (commands: CastraCommand[]) => Promise<boolean>;
  initialTarget: SargeEngagementTarget;
  returnToTarget: () => void;
}

const MODE_COPY: Record<SargeEngagementMode, { label: string; activity: SargeRequestedActivity; description: string }> = {
  consult: { label: "Consult", activity: "bounded_consultation", description: "Frame a bounded question and return review-only advice." },
  develop_plan: { label: "Develop Plan", activity: "plan_decomposition", description: "Propose decomposition, protected role assignments, and evidence gates." },
  coordinate_approved_work: { label: "Coordinate Approved Work", activity: "approved_work_coordination", description: "Prepare coordination proposals for work the Commander already approved; no execution occurs here." },
};

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stateLabel(value: string): string {
  if (value === "not_present") return "Not Present";
  if (value === "not_configured") return "Not Configured";
  if (value === "repository_ready") return "Repository Ready";
  if (value === "unavailable_limit") return "Unavailable · limit";
  return humanize(value);
}

export function SargeEngagementWorkspace({ state, execute, initialTarget, returnToTarget }: Props) {
  const policy = state.sargeRuntimePolicyVersions.at(-1)!;
  const [mode, setMode] = useState<SargeEngagementMode>("consult");
  const [scopeText, setScopeText] = useState(`Review ${initialTarget.label} and propose the next bounded, evidence-backed step.`);
  const [runtimeOptionId, setRuntimeOptionId] = useState<string>(policy.defaultRuntimeOptionId);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const requests = state.sargeEngagementRequests;

  useEffect(() => {
    if (!selectedRequestId && requests.length) setSelectedRequestId(requests.at(-1)!.id);
  }, [requests.length, selectedRequestId]);

  useEffect(() => {
    const option = policy.runtimeOptions.find((item) => item.id === runtimeOptionId);
    if (!option?.eligibleModes.includes(mode)) setRuntimeOptionId(policy.defaultRuntimeOptionId);
  }, [mode, policy, runtimeOptionId]);

  const selected = useMemo(() => requests.find((item) => item.id === selectedRequestId) ?? null, [requests, selectedRequestId]);
  const decision = selected ? latestSargeDecision(state, selected.id) : null;
  const result = selected ? [...state.sargeResultPackages].reverse().find((item) => item.requestId === selected.id && item.requestRevision === selected.revision) ?? null : null;
  const gate = selected ? evaluateSargeRequest(state, selected, new Date().toISOString()) : null;

  async function createRequest() {
    const ok = await execute([{
      type: "sarge.engagement.create",
      target: initialTarget,
      mode,
      requestedActivity: MODE_COPY[mode].activity,
      scopeText,
      runtimePolicyVersionId: policy.id,
      selectedRuntimeOptionId: runtimeOptionId,
    }]);
    if (ok) {
      setSelectedRequestId(null);
      setNotice("Draft request recorded. It cannot execute or change authoritative work until the Commander records an exact-scope decision.");
    }
  }

  async function decide(decisionValue: "approved" | "rejected") {
    if (!selected) return;
    const expiry = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
    const ok = await execute([{
      type: "sarge.engagement.decide",
      requestId: selected.id,
      decision: decisionValue,
      reason: decisionValue === "approved" ? "Approved for repository-only proposal simulation; no runtime, provider, model, tool, or authority action." : "Commander rejected this proposal scope.",
      expiresAt: decisionValue === "approved" ? expiry : undefined,
    }]);
    if (ok) setNotice(decisionValue === "approved" ? "Exact request revision approved for one hour. This does not authorize runtime execution." : "Request rejected; no work executed.");
  }

  async function recordResult(outcome: SargeResultOutcome) {
    if (!selected) return;
    const isProposal = outcome === "simulation_proposal";
    const ok = await execute([{
      type: "sarge.engagement.result.record",
      requestId: selected.id,
      outcome,
      proposalText: isProposal ? `Repository simulation for ${selected.target.label}: clarify the desired end state, confirm source evidence, decompose only approved work, assign protected roles without changing their authority, and return each result for Commander review.` : "",
      proposedAssignments: isProposal ? [
        { canonicalRoleId: "RECON", activity: "Confirm supplied evidence and unresolved facts.", runtimeOptionId: selected.selectedRuntimeOptionId, authority: "proposal_only" },
        { canonicalRoleId: "FORGE", activity: "Propose an implementation slice after evidence review.", runtimeOptionId: selected.selectedRuntimeOptionId, authority: "proposal_only" },
        { canonicalRoleId: "FIREWATCH", activity: "Propose verification gates and negative paths.", runtimeOptionId: selected.selectedRuntimeOptionId, authority: "proposal_only" },
      ] : [],
      reasonCode: outcome === "simulation_proposal" ? "repository_simulation_only" : outcome === "limit_wait" ? "subscription_limit" : outcome,
      reason: outcome === "simulation_proposal" ? "Deterministic demonstration of the proposal/review contract; no SARGE runtime executed." : "Runtime execution is unavailable in this repository-only foundation; no fallback occurred.",
      waitUntil: outcome === "limit_wait" ? new Date(Date.now() + 60 * 60 * 1_000).toISOString() : undefined,
    }]);
    if (ok) setNotice("Immutable result receipt recorded with zero model, provider, tool, and authoritative-mutation counts.");
  }

  return <>
    <div className="page-heading sticky-page-heading">
      <div><span className="eyebrow">SARGE · orchestration role · proposal authority only</span><h1>Engage SARGE</h1><p>Prepare and review an exact-scope orchestration request. This repository foundation does not execute a model, provider, CLI, Companion, API, tool, or authoritative state change.</p></div>
      <div className="record-controls"><span className="status status-draft">Repository Ready · execution Not Present</span><button className="button button-quiet" onClick={returnToTarget}>Return to target</button></div>
    </div>

    <section className="sarge-boundary" role="status">
      <strong>No credential fields · no silent fallback</strong>
      <span>Subscriptions are first-party product sessions, not APIs. Metered API remains Off. Unknown billing is blocked. Subscription limits become visible unavailable/wait receipts.</span>
    </section>

    <div className="sarge-workspace-grid">
      <section className="sarge-request-builder">
        <div className="section-heading"><div><span className="eyebrow">Exact target · revision {initialTarget.revision}</span><h2>{initialTarget.label}</h2><p>{humanize(initialTarget.type)} · {initialTarget.id}</p></div></div>
        <fieldset><legend>Engagement mode</legend><div className="sarge-mode-grid">{(Object.keys(MODE_COPY) as SargeEngagementMode[]).map((value) => <button type="button" key={value} className={mode === value ? "active" : ""} aria-pressed={mode === value} onClick={() => setMode(value)}><strong>{MODE_COPY[value].label}</strong><span>{MODE_COPY[value].description}</span></button>)}</div></fieldset>
        <label>Bounded supplied scope<textarea value={scopeText} onChange={(event) => setScopeText(event.target.value)} rows={5} maxLength={8000} /></label>
        <label>Selected runtime<select value={runtimeOptionId} onChange={(event) => setRuntimeOptionId(event.target.value)}>{policy.runtimeOptions.map((option) => <option key={option.id} value={option.id} disabled={option.availability === "blocked" || !option.eligibleModes.includes(mode)}>{option.label} · {stateLabel(option.availability)} · {humanize(option.billingClass)}</option>)}</select></label>
        <div className="runtime-option-cards">{policy.runtimeOptions.map((option) => <article key={option.id} className={runtimeOptionId === option.id ? "selected" : ""}><div><strong>{option.label}</strong><span className={`status status-${option.availability === "blocked" ? "blocked" : "draft"}`}>{stateLabel(option.availability)}</span></div><p>{option.policyNote}</p><small>{humanize(option.billingClass)} · {option.modelReference} · API fallback Off</small></article>)}</div>
        <button className="button button-primary" onClick={createRequest}>Create draft engagement request</button>
      </section>

      <section className="sarge-review-surface">
        <div className="section-heading"><div><span className="eyebrow">Immutable review surface</span><h2>Commander decision & result</h2></div></div>
        {!selected && <div className="inline-empty">No SARGE engagement request has been recorded.</div>}
        {selected && <>
          <label>Recorded request<select value={selected.id} onChange={(event) => setSelectedRequestId(event.target.value)}>{[...requests].reverse().map((request) => <option key={request.id} value={request.id}>{request.target.label} · r{request.revision} · {MODE_COPY[request.mode].label}</option>)}</select></label>
          <article className="sarge-request-receipt"><span className="record-id">{selected.id}</span><h3>{selected.target.label}</h3><p>{selected.scopeText}</p><dl><div><dt>Hash</dt><dd>{selected.materialHash}</dd></div><div><dt>Runtime</dt><dd>{selected.selectedRuntimeOptionId} · {humanize(selected.billingClass)}</dd></div><div><dt>Authority</dt><dd>Proposal only</dd></div><div><dt>Execution</dt><dd>Not Present</dd></div></dl></article>
          {!decision || decision.requestRevision !== selected.revision || decision.requestHash !== selected.materialHash ? <div className="sarge-decision-actions"><button className="button button-primary" onClick={() => decide("approved")}>Approve exact request for simulation</button><button className="button button-quiet" onClick={() => decide("rejected")}>Reject</button></div> : <section className={`decision-banner ${decision.decision === "approved" ? "decision-pass" : "decision-blocked"}`}><strong>{decision.decision === "approved" ? "Commander approved exact revision" : "Commander rejected request"}</strong><span>{decision.reason}</span><small>{decision.expiresAt ? `Expires ${new Date(decision.expiresAt).toLocaleString()}` : "No execution authorized"}</small></section>}
          {gate && <section className="sarge-gate"><strong>{gate.ready ? "Review gate ready" : "Review gate blocked"}</strong>{gate.reasons.length ? <ul>{gate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p>One immutable repository-only result may be recorded. This is not runtime execution.</p>}</section>}
          {gate?.ready && !result && <div className="sarge-result-actions"><button className="button button-primary" onClick={() => recordResult("simulation_proposal")}>Record proposal simulation</button><button className="button button-quiet" onClick={() => recordResult("unavailable")}>Record unavailable</button><button className="button button-quiet" onClick={() => recordResult("limit_wait")}>Record subscription limit/wait</button><button className="button button-quiet" onClick={() => recordResult("unknown")}>Record unknown</button></div>}
          {result && <article className="sarge-result-package"><span className="status status-draft">{humanize(result.outcome)}</span><h3>Immutable result package</h3>{result.proposalText && <p>{result.proposalText}</p>}{result.proposedAssignments.map((assignment) => <div key={`${assignment.canonicalRoleId}-${assignment.activity}`}><strong>{assignment.canonicalRoleId}</strong><span>{assignment.activity}</span><small>{assignment.runtimeOptionId} · proposal only</small></div>)}<footer>0 model calls · 0 provider calls · 0 tool calls · 0 authoritative mutations · paid fallback Off</footer></article>}
        </>}
        {notice && <p className="sarge-notice" role="status">{notice}</p>}
      </section>
    </div>
  </>;
}
