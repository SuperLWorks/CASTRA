import { useMemo, useState } from "react";
import type {
  CanonicalRoleId,
  CastraCommand,
  CastraState,
  LocalModelCommand,
  LocalModelPolicyVersion,
  LocalModelRiskTier,
  WorkLink,
} from "../domain/types";
import { resolveLocalModelSelection } from "../domain/localModel";
import { canonicalRoleIds, presentRole } from "../domain/presentation";
import { shortId } from "../domain/ids";
import { ollamaAdapter } from "../connectors/ollamaAdapter";

export interface InvocationInput {
  workflowKey: string;
  activityKey: string;
  riskTier: LocalModelRiskTier;
  roleId: CanonicalRoleId;
  work: WorkLink;
  prompt: string;
}

interface Props {
  state: CastraState;
  execute: (commands: CastraCommand[]) => Promise<boolean>;
  runProposal: (input: InvocationInput) => Promise<boolean>;
}

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function valueList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function duration(value: number | null): string {
  if (value === null) return "Unavailable";
  return `${value.toFixed(value < 100 ? 1 : 0)} ms`;
}

function PolicyForm({
  state,
  previous,
  execute,
  close,
}: {
  state: CastraState;
  previous: LocalModelPolicyVersion | null;
  execute: Props["execute"];
  close: () => void;
}) {
  const [name, setName] = useState(previous?.name ?? "Low-risk local proposal policy");
  const [workflowKey, setWorkflowKey] = useState(previous?.workflowKey ?? "campaign_specification");
  const [activityKey, setActivityKey] = useState(previous?.activityKey ?? "draft_assist");
  const [riskTier, setRiskTier] = useState<LocalModelRiskTier>(previous?.riskTier ?? "low");
  const [permitted, setPermitted] = useState(previous?.productOwnerPermitted ?? false);
  const [enabled, setEnabled] = useState(previous?.enabled ?? false);
  const [models, setModels] = useState(previous?.allowedModelNames.join(", ") ?? "");
  const [roleId, setRoleId] = useState<CanonicalRoleId | "">(previous?.roleId ?? "");
  const [roleModels, setRoleModels] = useState(previous?.rolePreferredModelNames.join(", ") ?? "");
  const [requiredCapability, setRequiredCapability] = useState(previous?.requiredCapability ?? "completion");
  const [maxInput, setMaxInput] = useState(String(previous?.maxInputCharacters ?? 8_000));
  const [maxOutput, setMaxOutput] = useState(String(previous?.maxOutputTokens ?? 512));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const command: LocalModelCommand = {
      type: "local_model.policy.version.create",
      supersedesId: previous?.id,
      name,
      workflowKey,
      activityKey,
      riskTier,
      productOwnerPermitted: permitted,
      enabled,
      allowedModelNames: valueList(models),
      roleId,
      rolePreferredModelNames: valueList(roleModels),
      requiredCapability,
      maxInputCharacters: Number(maxInput),
      maxOutputTokens: Number(maxOutput),
    };
    if (await execute([command])) close();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section className="modal local-model-modal" role="dialog" aria-modal="true" aria-labelledby="local-policy-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading"><div><span className="eyebrow">Versioned Commander policy</span><h2 id="local-policy-title">{previous ? "New policy version" : "Create local-model policy"}</h2></div><button className="icon-button" aria-label="Close" onClick={close}>×</button></div>
        <form onSubmit={submit}>
          <label>Policy name<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
          <div className="form-split"><label>Workflow key<input required value={workflowKey} onChange={(event) => setWorkflowKey(event.target.value)} /></label><label>Activity key<input required value={activityKey} onChange={(event) => setActivityKey(event.target.value)} /></label></div>
          <div className="form-split"><label>Activity risk<select value={riskTier} onChange={(event) => setRiskTier(event.target.value as LocalModelRiskTier)}><option value="low">Low</option><option value="medium">Medium — blocked in R1</option><option value="high">High — blocked in R1</option></select></label><label>Required discovered capability<select value={requiredCapability} onChange={(event) => setRequiredCapability(event.target.value as typeof requiredCapability)}><option value="completion">Completion</option><option value="tools">Tools</option><option value="thinking">Thinking</option><option value="vision">Vision</option></select></label></div>
          <label>Activity-allowed installed model names (comma separated)<input required value={models} onChange={(event) => setModels(event.target.value)} placeholder="example-model:tag" /></label>
          <div className="form-split"><label>Optional canonical role preference<select value={roleId} onChange={(event) => setRoleId(event.target.value as CanonicalRoleId | "")}><option value="">Any role</option>{canonicalRoleIds.map((id) => <option key={id} value={id}>{presentRole(state, id, "full_name").canonicalName} · {id}</option>)}</select></label><label>Role-preferred models (must also be activity allowed)<input value={roleModels} onChange={(event) => setRoleModels(event.target.value)} /></label></div>
          <div className="form-split"><label>Maximum input characters<input required type="number" min="1" max="100000" step="1" value={maxInput} onChange={(event) => setMaxInput(event.target.value)} /></label><label>Maximum output tokens<input required type="number" min="1" max="32768" step="1" value={maxOutput} onChange={(event) => setMaxOutput(event.target.value)} /></label></div>
          <div className="form-split"><label className="check-label"><input type="checkbox" checked={permitted} onChange={(event) => setPermitted(event.target.checked)} /> Product Owner permitted</label><label className="check-label"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Policy enabled</label></div>
          <p className="form-warning">The activity allowlist is authoritative. Role preferences cannot introduce a model outside it. Release 1 invokes only exact low-risk matches.</p>
          <p className="form-note">A policy version records permission; it never installs, pulls, starts, or invokes a model.</p>
          <div className="modal-actions"><button type="button" className="button button-quiet" onClick={close}>Cancel</button><button className="button button-primary" type="submit">Record policy version</button></div>
        </form>
      </section>
    </div>
  );
}

function ReviewForm({ proposalId, execute, close }: { proposalId: string; execute: Props["execute"]; close: () => void }) {
  const [decision, setDecision] = useState<"noted" | "rejected">("noted");
  const [notes, setNotes] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (await execute([{ type: "local_model.proposal.review", proposalId, decision, notes }])) close();
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="local-review-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">Commander review only</span><h2 id="local-review-title">Review proposal</h2></div><button className="icon-button" aria-label="Close" onClick={close}>×</button></div><form onSubmit={submit}><label>Review decision<select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)}><option value="noted">Noted for reference</option><option value="rejected">Rejected</option></select></label><label>Review notes<textarea required rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} /></label><p className="form-warning">Review does not apply content, approve a record, transition a state, communicate externally, or publish.</p><div className="modal-actions"><button type="button" className="button button-quiet" onClick={close}>Cancel</button><button type="submit" className="button button-primary">Record review</button></div></form></section></div>;
}

export function LocalModelWorkspace({ state, execute, runProposal }: Props) {
  const [policyModal, setPolicyModal] = useState<LocalModelPolicyVersion | "new" | null>(null);
  const [reviewProposalId, setReviewProposalId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [invoking, setInvoking] = useState(false);
  const [workflowKey, setWorkflowKey] = useState("campaign_specification");
  const [activityKey, setActivityKey] = useState("draft_assist");
  const [riskTier, setRiskTier] = useState<LocalModelRiskTier>("low");
  const [roleId, setRoleId] = useState<CanonicalRoleId>("SARGE");
  const workOptions = useMemo(() => [
    ...state.campaigns.map((item) => ({ value: `campaign:${item.id}`, label: `Campaign · ${item.title}` })),
    ...state.missions.map((item) => ({ value: `mission:${item.id}`, label: `Mission · ${item.title}` })),
    ...state.actions.map((item) => ({ value: `action:${item.id}`, label: `Action · ${item.title}` })),
  ], [state.actions, state.campaigns, state.missions]);
  const [workValue, setWorkValue] = useState(workOptions[0]?.value ?? "");
  const [prompt, setPrompt] = useState("");
  const latestCatalog = state.localModelCatalogObservations.at(-1) ?? null;
  const currentPolicyIds = new Set(state.localModelPolicyVersions.map((item) => item.supersedesId).filter(Boolean));
  const policies = state.localModelPolicyVersions.filter((item) => !currentPolicyIds.has(item.id));
  const [workType, workId] = workValue.split(":");
  const selection = resolveLocalModelSelection(state, { workflowKey, activityKey, riskTier, roleId, prompt });

  async function observeCatalog() {
    setChecking(true);
    try {
      const result = await ollamaAdapter.discover();
      await execute([{ type: "local_model.catalog.record", ...result }]);
    } finally {
      setChecking(false);
    }
  }

  async function invoke(event: React.FormEvent) {
    event.preventDefault();
    if (!workId) return;
    setInvoking(true);
    try {
      await runProposal({ workflowKey, activityKey, riskTier, roleId, work: { type: workType as WorkLink["type"], id: workId }, prompt });
    } finally {
      setInvoking(false);
    }
  }

  return <>
    <div className="page-heading local-model-title"><div><span className="eyebrow">Explicit · loopback · proposal only</span><h1>Local Models</h1><p>Commander-triggered Ollama proposals under versioned activity policy. No automatic, remote, paid, authoritative, approval, or publication path exists.</p></div><button className="button button-accent" disabled={checking} onClick={observeCatalog}>{checking ? "Checking loopback…" : "Check local runtime"}</button></div>
    <section className={`local-runtime-banner ${latestCatalog?.runtimeStatus === "healthy" ? "healthy" : "unavailable"}`}>
      <div><span className="eyebrow">Fixed adapter contract</span><strong>Ollama · 127.0.0.1:11434</strong><small>Redirects rejected · endpoint not configurable · no credentials</small></div>
      <div><span>Runtime</span><strong>{latestCatalog ? label(latestCatalog.runtimeStatus) : "Not checked"}</strong><small>{latestCatalog?.runtimeVersion || latestCatalog?.unavailableReason || "Use the explicit check to record local availability."}</small></div>
      <div><span>Installed catalog</span><strong>{latestCatalog?.models.length ?? 0} models</strong><small>{latestCatalog ? `${latestCatalog.adapterVersion} · ${latestCatalog.catalogVersion}` : "No observation recorded"}</small></div>
      <div><span>Fallback</span><strong>None</strong><small>Unavailable remains unavailable; zero remote calls.</small></div>
    </section>

    <div className="local-model-layout">
      <section className="local-invocation-panel">
        <div className="section-heading"><div><span className="eyebrow">Bounded activity request</span><h2>Request a reviewable proposal</h2></div></div>
        <form onSubmit={invoke}>
          <div className="form-split"><label>Workflow key<input required value={workflowKey} onChange={(event) => setWorkflowKey(event.target.value)} /></label><label>Activity key<input required value={activityKey} onChange={(event) => setActivityKey(event.target.value)} /></label></div>
          <div className="form-split"><label>Activity risk<select value={riskTier} onChange={(event) => setRiskTier(event.target.value as LocalModelRiskTier)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Canonical agent role<select value={roleId} onChange={(event) => setRoleId(event.target.value as CanonicalRoleId)}>{canonicalRoleIds.filter((id) => id !== "COMMANDER_PRODUCT_OWNER").map((id) => <option key={id} value={id}>{presentRole(state, id, "full_name").displayName} · {id}</option>)}</select></label></div>
          <label>Authoritative work context<select required value={workValue} onChange={(event) => setWorkValue(event.target.value)}><option value="" disabled>Select a work record</option>{workOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Proposal prompt<textarea required rows={7} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Do not include credentials or material that is not approved for local processing." /></label>
          <div className={`local-selection ${selection.ready ? "ready" : "blocked"}`}><strong>{selection.ready ? `Selected locally: ${selection.model?.name}` : "Invocation unavailable"}</strong><span>{selection.reason}</span>{selection.policy && <small>Policy {shortId(selection.policy.id)} v{selection.policy.version} · activity allowlist controls role preference</small>}</div>
          <button className="button button-primary" type="submit" disabled={invoking || !workId || !prompt.trim()}>{invoking ? "Recording explicit request…" : "Request local proposal"}</button>
        </form>
      </section>

      <section className="local-policy-panel">
        <div className="section-heading"><div><span className="eyebrow">Versioned permission</span><h2>Workflow & role policies</h2></div><button className="button button-accent" onClick={() => setPolicyModal("new")}>＋ Policy</button></div>
        {policies.length === 0 && <div className="inline-empty compact">No current local-model policy. Requests are recorded as blocked without an adapter call.</div>}
        <div className="local-policy-list">{policies.map((policy) => <article key={policy.id}><div><span className="record-id">{shortId(policy.id)} · v{policy.version}</span><strong>{policy.name}</strong><small>{policy.workflowKey} / {policy.activityKey} · {label(policy.riskTier)} risk</small></div><div className="badge-row"><span className={`test-status ${policy.enabled && policy.productOwnerPermitted ? "test-status-pass" : "test-status-unavailable"}`}>{policy.enabled && policy.productOwnerPermitted ? "Permitted" : "Disabled / not permitted"}</span><span>{policy.roleId || "Any role"}</span></div><p>Allowed: {policy.allowedModelNames.join(", ")}<br />Role preference: {policy.rolePreferredModelNames.join(", ") || "none"}<br />Capability: {policy.requiredCapability}</p><button className="button button-quiet" onClick={() => setPolicyModal(policy)}>New version</button></article>)}</div>
      </section>
    </div>

    <div className="section-heading"><div><span className="eyebrow">Immutable outcomes</span><h2>Proposal & unavailable history</h2></div></div>
    {state.localModelProposals.length === 0 && <div className="inline-empty">No local-model outcomes recorded.</div>}
    <div className="local-proposal-list">{[...state.localModelProposals].reverse().map((proposal) => {
      const invocation = state.localModelInvocations.find((item) => item.id === proposal.invocationId);
      const reviews = state.localModelReviews.filter((item) => item.proposalId === proposal.id);
      return <article className={proposal.status} key={proposal.id}><div className="local-proposal-heading"><div><span className="record-id">{shortId(proposal.id)}</span><h3>{proposal.status === "proposal" ? `Proposal · ${proposal.modelName}` : "Local model unavailable"}</h3></div><span className={`test-status ${proposal.status === "proposal" ? "test-status-pass" : "test-status-unavailable"}`}>{label(proposal.status)}</span></div>{proposal.status === "proposal" ? <pre>{proposal.content}</pre> : <p>{proposal.unavailableCode}: {proposal.unavailableReason}</p>}<div className="local-provenance-grid"><span><b>Invocation</b>{invocation ? shortId(invocation.id) : "Unavailable"}</span><span><b>Policy / catalog</b>{invocation?.policyVersionId ? `${shortId(invocation.policyVersionId)} / ${shortId(invocation.catalogObservationId)}` : "Unavailable"}</span><span><b>AERARIUM run</b>{invocation?.aerariumRunId ? shortId(invocation.aerariumRunId) : "Unavailable"}</span><span><b>Runtime reported tokens</b>{proposal.usage.promptTokens ?? "Unavailable"} in / {proposal.usage.completionTokens ?? "Unavailable"} out</span><span><b>Runtime reported total</b>{duration(proposal.usage.totalDurationMs)}</span><span><b>Authority</b>Proposal only · never applied</span></div><div className="local-review-strip"><span>{reviews.length ? `${reviews.length} Commander review record(s) · latest ${label(reviews.at(-1)!.decision)}` : "Unreviewed"}</span><button className="button button-quiet" onClick={() => setReviewProposalId(proposal.id)}>Review</button></div></article>;
    })}</div>

    <div className="section-heading"><div><span className="eyebrow">Append-only locality evidence</span><h2>Catalog observations</h2></div></div>
    <div className="local-catalog-list">{[...state.localModelCatalogObservations].reverse().map((observation) => <article key={observation.id}><span className="record-id">{shortId(observation.id)}</span><strong>{label(observation.runtimeStatus)} · {observation.models.length} installed</strong><small>{new Date(observation.observedAt).toLocaleString()} · {observation.endpointOrigin} · {observation.locality}</small><p>{observation.runtimeStatus === "healthy" ? observation.models.map((item) => `${item.name} [${item.capabilities.join("/") || "capabilities unavailable"}]`).join(", ") || "No installed models" : observation.unavailableReason}</p></article>)}</div>

    {policyModal && <PolicyForm state={state} previous={policyModal === "new" ? null : policyModal} execute={execute} close={() => setPolicyModal(null)} />}
    {reviewProposalId && <ReviewForm proposalId={reviewProposalId} execute={execute} close={() => setReviewProposalId(null)} />}
  </>;
}
