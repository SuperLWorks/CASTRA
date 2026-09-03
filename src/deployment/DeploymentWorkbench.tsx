import { useMemo, useState } from "react";
import type {
  CastraCommand,
  CastraState,
  DeploymentEnvironment,
  DeploymentReceiptState,
  DeploymentRequest,
} from "../domain/types";
import { deploymentGateSatisfied } from "../domain/deploymentEligibility";
import { evaluateDeploymentHandoff } from "../domain/deploymentWorkbench";
import { shortId } from "../domain/ids";

interface Props {
  state: CastraState;
  execute: (commands: CastraCommand[]) => Promise<boolean>;
}

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function EditRequestModal({ request, state, execute, close }: { request: DeploymentRequest; state: CastraState; execute: Props["execute"]; close: () => void }) {
  const [providerLabel, setProviderLabel] = useState(request.providerLabel);
  const [environment, setEnvironment] = useState<DeploymentEnvironment>(request.environment);
  const [sourceBuildReference, setSourceBuildReference] = useState(request.sourceBuildReference);
  const [targetHostname, setTargetHostname] = useState(request.targetHostname);
  const [previewReceiptId, setPreviewReceiptId] = useState(request.previewReceiptId);
  const verifiedPreviewReceipts = state.deploymentReceipts.filter((receipt) => receipt.state === "verified" && state.deploymentRequests.some((item) => item.id === receipt.requestId && item.environment === "preview"));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (await execute([{ type: "deployment_request.update", requestId: request.id, providerLabel, environment, sourceBuildReference, targetHostname, previewReceiptId: environment === "production" ? previewReceiptId : "" }])) close();
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}><section className="modal deployment-assist-modal" role="dialog" aria-modal="true" aria-labelledby="edit-deployment-request-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">Material input revision</span><h2 id="edit-deployment-request-title">Edit Deployment Request</h2></div><button className="icon-button" aria-label="Close" onClick={close}>×</button></div><form onSubmit={submit}><div className="form-split"><label>Provider label<input required value={providerLabel} onChange={(event) => setProviderLabel(event.target.value)} /></label><label>Environment<select value={environment} onChange={(event) => setEnvironment(event.target.value as DeploymentEnvironment)}><option value="preview">Preview</option><option value="production">Production</option></select></label></div><label>Source / build reference<textarea required rows={3} value={sourceBuildReference} onChange={(event) => setSourceBuildReference(event.target.value)} /></label><label>Target hostname<input required value={targetHostname} onChange={(event) => setTargetHostname(event.target.value)} /></label>{environment === "production" && <label>Verified Preview receipt<select required value={previewReceiptId} onChange={(event) => setPreviewReceiptId(event.target.value)}><option value="">Select verified Preview evidence</option>{verifiedPreviewReceipts.map((receipt) => <option value={receipt.id} key={receipt.id}>{shortId(receipt.id)} · {dateLabel(receipt.observedAt)}</option>)}</select></label>}<p className="form-warning">Provider, source/build, hostname, environment, or Preview-evidence changes create a new revision/hash and invalidate prior approval. A request with any receipt evidence is immutable.</p><div className="modal-actions"><button type="button" className="button button-quiet" onClick={close}>Cancel</button><button className="button button-primary">Save material revision</button></div></form></section></div>;
}

function ReceiptModal({ request, receiptState, execute, close }: { request: DeploymentRequest; receiptState: Exclude<DeploymentReceiptState, "manual_assist_requested" | "cancelled">; execute: Props["execute"]; close: () => void }) {
  const [providerUrl, setProviderUrl] = useState("");
  const [providerStatusReference, setProviderStatusReference] = useState("");
  const [domainReference, setDomainReference] = useState("");
  const [observedAt, setObservedAt] = useState(new Date().toISOString().slice(0, 16));
  const [evidenceReference, setEvidenceReference] = useState("");
  const [reason, setReason] = useState(receiptState === "attempted" ? "Commander recorded that a human Manual-Assist attempt occurred outside CASTRA." : "");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (await execute([{ type: "deployment_receipt.record", requestId: request.id, state: receiptState, providerUrl, providerStatusReference, domainReference, observedAt: new Date(observedAt).toISOString(), redactedEvidenceReference: evidenceReference, reason }])) close();
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}><section className="modal deployment-assist-modal" role="dialog" aria-modal="true" aria-labelledby="deployment-receipt-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">Human-observed evidence only</span><h2 id="deployment-receipt-title">Record {label(receiptState)} Receipt</h2></div><button className="icon-button" aria-label="Close" onClick={close}>×</button></div><form onSubmit={submit}><label>Provider URL reference<input value={providerUrl} onChange={(event) => setProviderUrl(event.target.value)} placeholder="https://… (reference only)" /></label><div className="form-split"><label>Provider status reference<input value={providerStatusReference} onChange={(event) => setProviderStatusReference(event.target.value)} /></label><label>Domain reference<input value={domainReference} onChange={(event) => setDomainReference(event.target.value)} /></label></div><label>Observed time<input required type="datetime-local" value={observedAt} onChange={(event) => setObservedAt(event.target.value)} /></label><label>Redacted evidence reference<textarea rows={2} value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Screenshot/file/action reference with secrets removed—never raw provider logs" /></label><label>Reason / observation<textarea required rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label><p className="form-warning">Do not paste passwords, tokens, cookies, authorization headers, environment variables, DNS credentials, or raw provider logs. Recording a receipt never calls or verifies Vercel/Porkbun by itself.</p><div className="modal-actions"><button type="button" className="button button-quiet" onClick={close}>Cancel</button><button className="button button-primary">Record local receipt</button></div></form></section></div>;
}

export function DeploymentWorkbench({ state, execute }: Props) {
  const [campaignId, setCampaignId] = useState(state.campaigns[0]?.id ?? "");
  const [actionId, setActionId] = useState("");
  const [environment, setEnvironment] = useState<DeploymentEnvironment>("preview");
  const [providerLabel, setProviderLabel] = useState("Vercel + Porkbun");
  const [sourceBuildReference, setSourceBuildReference] = useState("");
  const [targetHostname, setTargetHostname] = useState("castra.superlworks.com");
  const [previewReceiptId, setPreviewReceiptId] = useState("");
  const [editing, setEditing] = useState<DeploymentRequest | null>(null);
  const [receiptModal, setReceiptModal] = useState<{ request: DeploymentRequest; state: Exclude<DeploymentReceiptState, "manual_assist_requested" | "cancelled"> } | null>(null);
  const campaign = state.campaigns.find((item) => item.id === campaignId) ?? null;
  const deploymentActions = useMemo(() => {
    const missionIds = new Set(state.missions.filter((mission) => mission.campaignId === campaignId).map((mission) => mission.id));
    return state.actions.filter((action) => action.actionKind === "deployment" && missionIds.has(action.missionId));
  }, [campaignId, state.actions, state.missions]);
  const effectiveActionId = actionId && deploymentActions.some((item) => item.id === actionId) ? actionId : deploymentActions[0]?.id ?? "";
  const verifiedPreviewReceipts = state.deploymentReceipts.filter((receipt) => receipt.state === "verified" && state.deploymentRequests.some((item) => item.id === receipt.requestId && item.environment === "preview"));
  const deploymentAudits = state.auditEvents.filter((event) => event.entityType.startsWith("deployment_"));

  async function createRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!campaign || !effectiveActionId) return;
    const succeeded = await execute([{ type: "deployment_request.create", providerLabel, environment, sourceBuildReference, targetHostname, campaignId: campaign.id, actionId: effectiveActionId, previewReceiptId: environment === "production" ? previewReceiptId : "" }]);
    if (succeeded) setSourceBuildReference("");
  }

  return <>
    <div className="page-heading deploy-workbench-title"><div><span className="eyebrow">Deterministic local evidence · human provider action</span><h1>Deployment Workbench</h1><p>Govern a future Vercel/Porkbun handoff without credentials, provider connection, automation, or deployment authority.</p></div><span className="deploy-manual-stamp">MANUAL-ASSIST · NO PROVIDER CONNECTION</span></div>

    <section className="deploy-boundary-banner"><div><span>Product / slug</span><strong>CASTRA / castra</strong><small>Visible product name and technical Vercel slug are protected.</small></div><div><span>Provider pattern</span><strong>Vercel + Porkbun</strong><small>No account, CLI, OAuth, API, cookie, token, or saved session.</small></div><div><span>Target hostname</span><strong>castra.superlworks.com</strong><small>No DNS inspection or change occurs here.</small></div><div><span>CASTRA external calls</span><strong>0</strong><small>Requests and receipts are local records only.</small></div></section>

    <div className="deploy-layout"><section className="deploy-panel"><div className="section-heading"><div><span className="eyebrow">Local proposal record</span><h2>Create Deployment Request</h2></div></div><form className="deploy-form" onSubmit={createRequest}><div className="form-split"><label>Campaign<select required value={campaignId} onChange={(event) => { setCampaignId(event.target.value); setActionId(""); }}><option value="">Select Campaign</option>{state.campaigns.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><label>Deployment-classified Action<select required value={effectiveActionId} onChange={(event) => setActionId(event.target.value)}><option value="">Select deployment Action</option>{deploymentActions.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label></div><div className="form-split"><label>Provider label<input required value={providerLabel} onChange={(event) => setProviderLabel(event.target.value)} /></label><label>Environment<select value={environment} onChange={(event) => setEnvironment(event.target.value as DeploymentEnvironment)}><option value="preview">Preview</option><option value="production">Production</option></select></label></div><label>Source / build reference<textarea required rows={3} value={sourceBuildReference} onChange={(event) => setSourceBuildReference(event.target.value)} placeholder="Local build artifact, version, or source reference—never an environment variable or provider log" /></label><label>Target hostname<input required value={targetHostname} onChange={(event) => setTargetHostname(event.target.value)} /></label>{environment === "production" && <label>Verified Preview receipt<select required value={previewReceiptId} onChange={(event) => setPreviewReceiptId(event.target.value)}><option value="">Production is blocked until a verified Preview receipt is selected</option>{verifiedPreviewReceipts.map((receipt) => <option value={receipt.id} key={receipt.id}>{shortId(receipt.id)} · {dateLabel(receipt.observedAt)}</option>)}</select></label>}<p className="source-callout"><strong>Campaign Deployment Eligibility</strong><span>{campaign ? `${campaign.title}: ${campaign.deploymentEligibility.disposition ?? "unresolved"}` : "Select a Campaign"}. Draft request creation is local; manual handoff remains blocked until the existing gate is satisfied.</span></p>{deploymentActions.length === 0 && <p className="form-warning">No deployment-classified Action exists in this Campaign. Create/classify it through the existing authoritative Campaign workflow; this Workbench cannot bypass that requirement.</p>}<button className="button button-primary" disabled={!campaign || !effectiveActionId || !sourceBuildReference.trim() || (environment === "production" && !previewReceiptId)}>Create local request</button></form></section>

    <section className="deploy-panel"><div className="section-heading"><div><span className="eyebrow">Future human sequence</span><h2>Manual-Assist boundary</h2></div></div><ol className="deploy-sequence"><li>Commander approves the exact local request hash and expiry.</li><li>A human separately signs into Vercel and performs only the approved Preview or Production work.</li><li>A human records a redacted attempted/verified/failed/unknown receipt in CASTRA.</li><li>Only after verified Preview evidence may a separate Production request advance.</li><li>A human separately signs into Porkbun, inspects exact DNS state, and records redacted evidence.</li></ol><p className="form-warning">CASTRA never receives credentials and cannot treat “requested” or “attempted” as success. Unknown, failed, and cancelled states are terminal and never retry automatically.</p></section></div>

    <div className="section-heading"><div><span className="eyebrow">Approval, handoff, and receipts</span><h2>Deployment Requests</h2></div></div>
    <div className="deploy-request-list">{[...state.deploymentRequests].reverse().map((request) => {
      const decision = [...state.deploymentCommanderDecisions].reverse().find((item) => item.requestId === request.id) ?? null;
      const receipts = state.deploymentReceipts.filter((item) => item.requestId === request.id);
      const gate = evaluateDeploymentHandoff(state, request, new Date().toISOString());
      const relatedCampaign = state.campaigns.find((item) => item.id === request.campaignId);
      const terminal = ["verified", "failed", "unknown", "cancelled"].includes(request.state);
      return <article key={request.id}><div className="deploy-request-heading"><div><span className="record-id">{shortId(request.id)} · r{request.revision}</span><h3>{label(request.environment)} · {request.productName}</h3><small>{request.providerLabel} · {request.projectSlug} · {request.targetHostname}</small></div><span className={`status status-${request.state === "verified" ? "completed" : request.state === "draft" || request.state === "unknown" ? "blocked" : "active"}`}>{label(request.state)}</span></div><div className="deploy-request-evidence"><span><b>Source / build</b>{request.sourceBuildReference}</span><span><b>Campaign / Action</b>{shortId(request.campaignId)} / {shortId(request.actionId)}</span><span><b>Material input hash</b>{request.materialInputHash}</span><span><b>Eligibility</b>{relatedCampaign?.deploymentEligibility.disposition ?? "unresolved"}</span></div>{decision && <div className="deploy-decision">Commander {decision.decision} · hash {decision.materialInputHash.slice(0, 24)}… · {decision.expiresAt ? `expires ${dateLabel(decision.expiresAt)}` : "not approved"} · {decision.reason}</div>}{request.state === "approved" && !gate.ready && <ul className="deploy-blockers">{gate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}<div className="record-controls">{!receipts.length && <button className="button button-quiet" onClick={() => setEditing(request)}>Edit material inputs</button>}{!receipts.length && <><button className="button button-accent" onClick={() => void execute([{ type: "deployment_request.decide", requestId: request.id, decision: "approved", reason: "Commander approved the exact Manual-Assist request inputs for local handoff evidence.", expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() }])}>Approve exact request · 30 min</button><button className="button button-quiet" onClick={() => void execute([{ type: "deployment_request.decide", requestId: request.id, decision: "rejected", reason: "Commander rejected this local Deployment Request." }])}>Reject</button></>}{request.state === "approved" && <button className="button button-primary" disabled={!gate.ready} onClick={() => void execute([{ type: "deployment_handoff.request", requestId: request.id }])}>Record manual handoff request · no provider call</button>}{request.state === "handoff_requested" && <button className="button button-accent" onClick={() => setReceiptModal({ request, state: "attempted" })}>Record human attempt</button>}{request.state === "attempted" && <><button className="button button-accent" onClick={() => setReceiptModal({ request, state: "verified" })}>Record verified evidence</button><button className="button button-quiet" onClick={() => setReceiptModal({ request, state: "failed" })}>Record failed</button><button className="button button-quiet" onClick={() => setReceiptModal({ request, state: "unknown" })}>Record unknown</button></>}{!terminal && <button className="button button-danger" onClick={() => void execute([{ type: "deployment_request.cancel", requestId: request.id, reason: "Commander cancelled this Manual-Assist Deployment Request." }])}>Cancel</button>}</div>{receipts.length > 0 && <div className="deploy-receipt-list">{receipts.map((receipt) => <section key={receipt.id}><div><strong>{label(receipt.state)}</strong><span>{shortId(receipt.id)} · observed {dateLabel(receipt.observedAt)}</span></div><p>{receipt.reason}</p><dl><div><dt>Provider URL</dt><dd>{receipt.providerUrl || "Not recorded"}</dd></div><div><dt>Status / domain</dt><dd>{receipt.providerStatusReference || "Not recorded"} / {receipt.domainReference || "Not recorded"}</dd></div><div><dt>Evidence</dt><dd>{receipt.redactedEvidenceReference || "Not recorded"}</dd></div><div><dt>CASTRA calls / retry</dt><dd>0 / {receipt.automaticRetry ? "automatic" : "none"}</dd></div></dl></section>)}</div>}</article>;
    })}{state.deploymentRequests.length === 0 && <div className="inline-empty">No Deployment Requests. Nothing has been handed off, attempted, verified, or deployed.</div>}</div>

    <div className="section-heading"><div><span className="eyebrow">Append-only local evidence</span><h2>Deployment audit</h2></div></div><div className="deploy-audit-list">{[...deploymentAudits].reverse().map((event) => <article key={event.id}><span>#{event.sequence}</span><div><strong>{event.summary}</strong><small>{event.kind} · {shortId(event.entityId)} · CASTRA external calls {event.detail.externalCalls ?? event.detail.externalCallsByCastra ?? "0"}</small></div></article>)}{deploymentAudits.length === 0 && <div className="inline-empty">No Deployment Workbench audit evidence.</div>}</div>

    <p className="deploy-footnote">Manual-Assist / No provider connection. This local feature cannot deploy, publish, change DNS, authenticate, read provider state, invoke a model, or prove external success.</p>
    {editing && <EditRequestModal request={editing} state={state} execute={execute} close={() => setEditing(null)} />}
    {receiptModal && <ReceiptModal request={receiptModal.request} receiptState={receiptModal.state} execute={execute} close={() => setReceiptModal(null)} />}
  </>;
}
