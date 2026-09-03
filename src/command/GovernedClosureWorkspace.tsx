import { useMemo, useState, type FormEvent } from "react";
import type {
  CastraState,
  CommandConnectorAuthority,
  CommandConnectorChannel,
  CommandConnectorReceipt,
  CommandConnectorTestResult,
} from "../domain/types";
import { shortId } from "../domain/ids";
import {
  DEFAULT_IDENTITY_VALIDITY_HOURS,
  NON_APPLIED_CONNECTOR_OUTCOMES,
  activeIdentityReceipts,
  buildActionCloseRequest,
  buildNonAppliedOutcomeRequest,
  closureEligibleActions,
  confirmResultReview,
  connectorOutcomeTone,
  evidenceReferenceSuggestions,
  identityReceiptState,
  resultReviewDrift,
  reviewableResultPackages,
  type GovernedClosureRequest,
  type NonAppliedConnectorOutcome,
  type ResultReviewConfirmation,
} from "./governedClosure";

interface Props {
  state: CastraState;
  /**
   * Supplied by src/App.tsx, which builds the Commander command context on the
   * authenticated session path. This component never constructs that context
   * itself and holds no repository, network, or provider path.
   */
  submit: (request: GovernedClosureRequest) => Promise<boolean>;
  /** A hosted write whose outcome is unknown blocks every further step. */
  hostedCommandUnknown?: boolean;
}

const CHANNELS: CommandConnectorChannel[] = ["ui", "codex", "voice", "agent"];
const AUTHORITIES: CommandConnectorAuthority[] = ["Commander", "Agent"];
const TEST_OUTCOMES: CommandConnectorTestResult["outcome"][] = ["pass", "fail", "blocked", "not_run"];

function title(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function outcomeStatusClass(receipt: CommandConnectorReceipt): string {
  const tone = connectorOutcomeTone(receipt.outcome);
  if (tone === "applied") return "status status-completed";
  if (tone === "rejected") return "status status-blocked";
  return "status status-in_progress";
}

interface EvidencePickerProps {
  label: string;
  help: string;
  values: string[];
  suggestions: string[];
  onChange: (values: string[]) => void;
}

/**
 * Evidence reference picker. Suggestions are derived from authoritative state
 * only; free entry stays available because a new receipt is not yet referenced
 * anywhere. Entries are bounded to the 240-character lifecycle evidence limit.
 */
function EvidencePicker({ label, help, values, suggestions, onChange }: EvidencePickerProps) {
  const [draft, setDraft] = useState("");
  const available = suggestions.filter((item) => !values.includes(item));

  function add(reference: string): void {
    const normalized = reference.trim();
    if (!normalized || values.includes(normalized) || values.length >= 20) return;
    onChange([...values, normalized]);
    setDraft("");
  }

  return (
    <div className="closure-evidence">
      <span className="closure-evidence-label">{label}</span>
      <div className="closure-chips">
        {values.map((value) => (
          <span key={value}>
            {value}
            <button type="button" aria-label={`Remove ${value}`} onClick={() => onChange(values.filter((item) => item !== value))}>×</button>
          </span>
        ))}
        {values.length === 0 && <small className="closure-chips-empty">No evidence reference selected. At least one is required.</small>}
      </div>
      <div className="form-split">
        <label>Recorded evidence references
          <select value="" onChange={(event) => add(event.target.value)} disabled={available.length === 0}>
            <option value="">{available.length === 0 ? "No further recorded reference" : "Select a recorded reference"}</option>
            {available.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>Add a reference
          <input
            value={draft}
            maxLength={240}
            placeholder="DATA-SCOPE.md#withheld-internal-reference — a path or record reference, never a credential"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(draft); } }}
          />
        </label>
      </div>
      <small className="field-help">{help}</small>
    </div>
  );
}

export function GovernedClosureWorkspace({ state, submit, hostedCommandUnknown = false }: Props) {
  const now = new Date().toISOString();

  const [identityReference, setIdentityReference] = useState("");
  const [sessionReference, setSessionReference] = useState("");
  const [identityChannel, setIdentityChannel] = useState<CommandConnectorChannel>("ui");
  const [identityAuthority, setIdentityAuthority] = useState<CommandConnectorAuthority>("Commander");
  const [identityEvidence, setIdentityEvidence] = useState("");
  const [validityHours, setValidityHours] = useState(String(DEFAULT_IDENTITY_VALIDITY_HOURS));

  const [resultIdentityId, setResultIdentityId] = useState("");
  const [submissionId, setSubmissionId] = useState("");
  const [workReference, setWorkReference] = useState("");
  const [agentIdentity, setAgentIdentity] = useState("");
  const [modelIdentity, setModelIdentity] = useState("");
  const [proposedStatus, setProposedStatus] = useState("");
  const [resultEvidence, setResultEvidence] = useState<string[]>([]);
  const [tests, setTests] = useState<CommandConnectorTestResult[]>([]);
  const [blockers, setBlockers] = useState("");
  const [effortCostProvenance, setEffortCostProvenance] = useState("");
  const [nextStepRecommendation, setNextStepRecommendation] = useState("");

  const [selectedResultId, setSelectedResultId] = useState("");
  const [review, setReview] = useState<ResultReviewConfirmation | null>(null);

  const [targetActionId, setTargetActionId] = useState("");
  const [commandId, setCommandId] = useState("");
  const [closureReason, setClosureReason] = useState("");
  const [closureEvidence, setClosureEvidence] = useState<string[]>([]);
  const [authorityReceiptId, setAuthorityReceiptId] = useState("");

  const [outcomeKind, setOutcomeKind] = useState<NonAppliedConnectorOutcome>("unknown");
  const [outcomeKey, setOutcomeKey] = useState("");
  const [outcomeReasonCode, setOutcomeReasonCode] = useState("");
  const [outcomeReason, setOutcomeReason] = useState("");

  const [busy, setBusy] = useState(false);

  const activeReceipts = activeIdentityReceipts(state, now);
  const receivedResults = useMemo(() => reviewableResultPackages(state), [state]);
  const suggestions = useMemo(() => evidenceReferenceSuggestions(state), [state]);
  const eligibleActions = useMemo(() => closureEligibleActions(state), [state]);
  const missionTitle = (missionId: string): string => state.missions.find((item) => item.id === missionId)?.title ?? "Unknown mission";

  const selectedResult = state.commandConnectorResultPackages.find((item) => item.id === selectedResultId) ?? null;
  const reviewedResult = review ? state.commandConnectorResultPackages.find((item) => item.id === review.resultPackageId) ?? null : null;
  const reviewDrift = review ? resultReviewDrift(review, reviewedResult) : null;
  const targetAction = eligibleActions.find((item) => item.id === targetActionId) ?? null;
  const receipts = [...state.commandConnectorReceipts].reverse();
  const validityPreview = Number(validityHours) > 0
    ? new Date(Date.parse(now) + Number(validityHours) * 3_600_000).toISOString()
    : "";

  const locked = busy || hostedCommandUnknown;

  async function run(request: GovernedClosureRequest, onSuccess: () => void): Promise<void> {
    setBusy(true);
    try {
      if (await submit(request)) onSuccess();
    } finally {
      setBusy(false);
    }
  }

  async function recordIdentity(event: FormEvent): Promise<void> {
    event.preventDefault();
    const hours = Number(validityHours);
    if (!Number.isFinite(hours) || hours <= 0) return;
    await run({
      step: "identity",
      input: {
        identityReference,
        sessionReference,
        channel: identityChannel,
        authority: identityAuthority,
        evidenceReference: identityEvidence,
        validUntil: new Date(Date.now() + hours * 3_600_000).toISOString(),
      },
    }, () => {
      setIdentityReference("");
      setSessionReference("");
      setIdentityEvidence("");
    });
  }

  async function submitResult(event: FormEvent): Promise<void> {
    event.preventDefault();
    await run({
      step: "result",
      input: {
        submissionId,
        identityReceiptId: resultIdentityId,
        workReference,
        agentIdentity,
        modelIdentity,
        proposedStatus,
        evidenceReferences: resultEvidence,
        tests,
        blockers: blockers.split("\n").map((item) => item.trim()).filter(Boolean),
        effortCostProvenance,
        nextStepRecommendation,
      },
    }, () => {
      setSubmissionId("");
      setWorkReference("");
      setProposedStatus("");
      setResultEvidence([]);
      setTests([]);
      setBlockers("");
      setEffortCostProvenance("");
      setNextStepRecommendation("");
    });
  }

  async function applyClosure(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!review || !targetAction) return;
    await run(buildActionCloseRequest({
      commandId,
      resultPackageId: review.resultPackageId,
      // The reviewed revision and binding, not the live record. If the package
      // changed after review the connector rejects the command, which is the
      // intended outcome: the Commander approved that exact content.
      expectedResultRevision: review.revision,
      expectedResultBinding: review.binding,
      authorityReceiptId,
      actionId: targetAction.id,
      expectedRevision: targetAction.revision,
      reason: closureReason,
      evidenceReferences: closureEvidence,
    }), () => {
      setCommandId("");
      setClosureReason("");
      setClosureEvidence([]);
      setReview(null);
      setSelectedResultId("");
      setTargetActionId("");
    });
  }

  async function recordOutcome(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!review) return;
    await run(buildNonAppliedOutcomeRequest({
      idempotencyKey: outcomeKey,
      resultPackageId: review.resultPackageId,
      expectedResultRevision: review.revision,
      expectedResultBinding: review.binding,
      authorityReceiptId,
      outcome: outcomeKind,
      reasonCode: outcomeReasonCode,
      reason: outcomeReason,
    }), () => {
      setOutcomeKey("");
      setOutcomeReasonCode("");
      setOutcomeReason("");
      setReview(null);
      setSelectedResultId("");
    });
  }

  return (
    <>
      <div className="page-heading closure-title">
        <div>
          <span className="eyebrow">Governed Command Connector · castra-command-connector/1.0.0</span>
          <h1>Governed Closure</h1>
          <p>The five-step connector path for <code>action.close</code>. Nothing here closes an Action by itself: each step is a separate Commander act against an exact revision and binding, and the connector validates identity, authority, revision, binding, evidence, and idempotency before the deterministic command engine is called.</p>
        </div>
        <span className="closure-stamp">COMMANDER AUTHORITY · action.close</span>
      </div>

      <section className="closure-boundary-banner">
        <div><span>Authority source</span><strong>Authenticated Commander session</strong><small>The Commander command context is built in the application shell on the authenticated path only. No agent identity can reach it.</small></div>
        <div><span>Agent surface</span><strong>Read only</strong><small><code>/api/agent-state</code> is read-only, ignores incoming cookies, and gains no write capability from this workspace.</small></div>
        <div><span>Command scope</span><strong>action.close</strong><small>Mission closure, reopen, and follow-up creation are outside this affordance.</small></div>
        <div><span>Secret boundary</span><strong>Rejected at the connector</strong><small>Passwords, tokens, cookies, authorization values, and credential-shaped input are refused and never stored in connector records.</small></div>
      </section>

      {hostedCommandUnknown && (
        <p className="form-warning">A hosted-state command has an unknown outcome. Every governed closure step is blocked until the exact retained command is reconciled. The retained idempotency key and request binding are preserved; no retry is generated automatically.</p>
      )}

      <div className="closure-layout">
        <section className="closure-panel">
          <div className="section-heading"><div><span className="eyebrow">Step 1 · trust anchor</span><h2>Identity and authority receipts</h2></div></div>
          <p className="muted-copy">Only the Commander can mint a connector identity receipt, including the Agent receipt a result package is submitted under. Validity is bounded and the receipt stores no secret material.</p>
          <form className="closure-form" onSubmit={(event) => void recordIdentity(event)}>
            <div className="form-split">
              <label>Identity reference<input required maxLength={240} value={identityReference} onChange={(event) => setIdentityReference(event.target.value)} placeholder="commander:… or agent:… — never a credential" /></label>
              <label>Session reference<input required maxLength={240} value={sessionReference} onChange={(event) => setSessionReference(event.target.value)} placeholder="session:… — a reference, never a cookie or token value" /></label>
            </div>
            <div className="form-split">
              <label>Authority<select value={identityAuthority} onChange={(event) => setIdentityAuthority(event.target.value as CommandConnectorAuthority)}>{AUTHORITIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label>Channel<select value={identityChannel} onChange={(event) => setIdentityChannel(event.target.value as CommandConnectorChannel)}>{CHANNELS.map((item) => <option key={item} value={item}>{title(item)}</option>)}</select></label>
            </div>
            <label>Identity evidence reference<input required maxLength={240} value={identityEvidence} onChange={(event) => setIdentityEvidence(event.target.value)} placeholder="DATA-SCOPE.md#withheld-internal-reference" /></label>
            <label>Bounded validity (hours)<input required type="number" min={1} max={24} step={1} value={validityHours} onChange={(event) => setValidityHours(event.target.value)} /><small className="field-help">{validityPreview ? `Expires ${dateLabel(validityPreview)}. An expired receipt is refused at command time.` : "Enter a positive number of hours."}</small></label>
            {identityAuthority === "Agent" && <p className="form-warning">An Agent receipt can carry a result package. It can never approve one: the connector requires a Commander authority receipt at command application time.</p>}
            <button className="button button-primary" disabled={locked}>Record identity receipt</button>
          </form>

          <div className="closure-receipt-table">
            {state.commandConnectorIdentityReceipts.length === 0
              ? <div className="inline-empty compact">No connector identity receipt exists. Step 2 cannot start without one.</div>
              : [...state.commandConnectorIdentityReceipts].reverse().map((receipt) => {
                const receiptState = identityReceiptState(receipt, now);
                return <article key={receipt.id}>
                  <div><span className="record-id">{shortId(receipt.id)}</span><strong>{receipt.identityReference}</strong><small>{receipt.authority} · {title(receipt.channel)} · issued {dateLabel(receipt.issuedAt)} · valid to {dateLabel(receipt.validUntil)}</small></div>
                  <span className={`status status-${receiptState === "active" ? "completed" : "blocked"}`}>{title(receiptState)}</span>
                </article>;
              })}
          </div>
        </section>

        <section className="closure-panel">
          <div className="section-heading"><div><span className="eyebrow">Step 2 · structured result</span><h2>Submit result package</h2></div></div>
          <p className="muted-copy">The normalized package receives a deterministic binding and revision. Exact submission replay is idempotent; reusing a submission ID with different content is rejected.</p>
          <form className="closure-form" onSubmit={(event) => void submitResult(event)}>
            <label>Submitting identity receipt
              <select required value={resultIdentityId} onChange={(event) => setResultIdentityId(event.target.value)}>
                <option value="">Select an active identity receipt</option>
                {activeReceipts.map((item) => <option key={item.id} value={item.id}>{item.identityReference} · {item.authority} · {title(item.channel)}</option>)}
              </select>
            </label>
            <div className="form-split">
              <label>Submission ID<input required maxLength={180} value={submissionId} onChange={(event) => setSubmissionId(event.target.value)} placeholder="Stable submission identifier" /></label>
              <label>Work reference<input required maxLength={180} value={workReference} onChange={(event) => setWorkReference(event.target.value)} placeholder="C001.M013.A0xx" /></label>
            </div>
            <div className="form-split">
              <label>Agent identity<input required maxLength={180} value={agentIdentity} onChange={(event) => setAgentIdentity(event.target.value)} placeholder="FORGE, FIREWATCH, SCRIBE …" /></label>
              <label>Observed model identity<input required maxLength={180} value={modelIdentity} onChange={(event) => setModelIdentity(event.target.value)} placeholder="As reported by the executor" /></label>
            </div>
            <label>Proposed status<input required maxLength={120} value={proposedStatus} onChange={(event) => setProposedStatus(event.target.value)} placeholder="Implemented, Verified, Rework required …" /></label>
            <EvidencePicker
              label="Evidence references"
              help="At least one is required; up to 20 entries of 240 characters."
              values={resultEvidence}
              suggestions={suggestions}
              onChange={setResultEvidence}
            />
            <div className="closure-test-rows">
              <span className="closure-evidence-label">Test outcomes</span>
              {tests.map((test, index) => (
                <div className="closure-test-row" key={`test-${index}`}>
                  <input aria-label={`Test ${index + 1} name`} maxLength={180} value={test.name} placeholder="Test name" onChange={(event) => setTests(tests.map((item, position) => position === index ? { ...item, name: event.target.value } : item))} />
                  <select aria-label={`Test ${index + 1} outcome`} value={test.outcome} onChange={(event) => setTests(tests.map((item, position) => position === index ? { ...item, outcome: event.target.value as CommandConnectorTestResult["outcome"] } : item))}>
                    {TEST_OUTCOMES.map((item) => <option key={item} value={item}>{title(item)}</option>)}
                  </select>
                  <input aria-label={`Test ${index + 1} evidence reference`} maxLength={240} value={test.evidenceReference} placeholder="Evidence reference" onChange={(event) => setTests(tests.map((item, position) => position === index ? { ...item, evidenceReference: event.target.value } : item))} />
                  <button type="button" className="button button-small" onClick={() => setTests(tests.filter((_, position) => position !== index))}>Remove</button>
                </div>
              ))}
              <button type="button" className="button button-small" disabled={tests.length >= 50} onClick={() => setTests([...tests, { name: "", outcome: "pass", evidenceReference: "" }])}>Add test outcome</button>
            </div>
            <label>Blockers (one per line, optional)<textarea rows={3} value={blockers} onChange={(event) => setBlockers(event.target.value)} placeholder="Leave empty when the result records no blocker." /></label>
            <label>Effort and cost provenance<textarea required rows={2} maxLength={500} value={effortCostProvenance} onChange={(event) => setEffortCostProvenance(event.target.value)} placeholder="Where the effort and cost figures came from, or that none are claimed." /></label>
            <label>Next-step recommendation<textarea required rows={2} maxLength={500} value={nextStepRecommendation} onChange={(event) => setNextStepRecommendation(event.target.value)} placeholder="The recommendation only. The Commander decides." /></label>
            <button className="button button-primary" disabled={locked || !resultIdentityId || resultEvidence.length === 0}>Submit result package</button>
          </form>
        </section>
      </div>

      <div className="section-heading"><div><span className="eyebrow">Step 3 · exact revision and binding</span><h2>Commander review</h2></div></div>
      <section className="closure-review">
        <label className="closure-review-select">Result package awaiting decision
          <select value={selectedResultId} onChange={(event) => { setSelectedResultId(event.target.value); setReview(null); }}>
            <option value="">Select a received result package</option>
            {receivedResults.map((item) => <option key={item.id} value={item.id}>{item.workReference} · {item.agentIdentity} · r{item.revision}</option>)}
          </select>
        </label>
        {receivedResults.length === 0 && <div className="inline-empty compact">No result package is awaiting a decision.</div>}
        {selectedResult && (
          <>
            <div className="closure-evidence-grid">
              <span><b>Result package</b>{shortId(selectedResult.id)}</span>
              <span><b>Revision</b>{selectedResult.revision}</span>
              <span><b>Binding</b>{selectedResult.binding}</span>
              <span><b>Status</b>{title(selectedResult.status)}</span>
              <span><b>Submission ID</b>{selectedResult.submissionId}</span>
              <span><b>Agent / model</b>{selectedResult.agentIdentity} · {selectedResult.modelIdentity}</span>
              <span><b>Proposed status</b>{selectedResult.proposedStatus}</span>
              <span><b>Submitted</b>{dateLabel(selectedResult.createdAt)}</span>
            </div>
            <dl className="closure-review-detail">
              <div><dt>Work reference</dt><dd>{selectedResult.workReference}</dd></div>
              <div><dt>Evidence references</dt><dd>{selectedResult.evidenceReferences.join(" · ")}</dd></div>
              <div><dt>Tests</dt><dd>{selectedResult.tests.length === 0 ? "None recorded" : selectedResult.tests.map((test) => `${test.name}: ${test.outcome}`).join(" · ")}</dd></div>
              <div><dt>Blockers</dt><dd>{selectedResult.blockers.length === 0 ? "None recorded" : selectedResult.blockers.join(" · ")}</dd></div>
              <div><dt>Effort and cost provenance</dt><dd>{selectedResult.effortCostProvenance}</dd></div>
              <div><dt>Next-step recommendation</dt><dd>{selectedResult.nextStepRecommendation}</dd></div>
            </dl>
            {review
              ? <p className="source-callout"><strong>Reviewed revision {review.revision} · binding {review.binding}</strong><span>Confirmed {dateLabel(review.confirmedAt)}. Step 4 applies the command against these exact reviewed values.</span></p>
              : <button type="button" className="button button-accent" onClick={() => setReview(confirmResultReview(selectedResult, new Date().toISOString()))}>Confirm this exact revision and binding</button>}
            {reviewDrift && <p className="form-warning">{reviewDrift} The command would be applied against content that was not reviewed; the connector will reject it. Review the current revision again.</p>}
          </>
        )}
      </section>

      <div className="section-heading"><div><span className="eyebrow">Step 4 · governed lifecycle command</span><h2>Apply action.close</h2></div></div>
      {!review ? (
        <div className="inline-empty compact">Confirm a result package revision and binding in step 3 before a lifecycle command can be prepared.</div>
      ) : (
        <div className="closure-layout">
          <section className="closure-panel">
            <div className="section-heading"><div><span className="eyebrow">Exact revision · bounded reason · evidence</span><h2>Close an Action</h2></div></div>
            <form className="closure-form" onSubmit={(event) => void applyClosure(event)}>
              <label>Target Action
                <select required value={targetActionId} onChange={(event) => setTargetActionId(event.target.value)}>
                  <option value="">Select an In progress or Blocked Action</option>
                  {eligibleActions.map((item) => <option key={item.id} value={item.id}>{item.title} · {missionTitle(item.missionId)} · r{item.revision}</option>)}
                </select>
                <small className="field-help">{targetAction ? `Expected revision ${targetAction.revision}, prefilled from the current record. A stale revision fails closed.` : "Only unarchived In progress or Blocked Actions accept governed closure."}</small>
              </label>
              <label>Commander authority receipt
                <select required value={authorityReceiptId} onChange={(event) => setAuthorityReceiptId(event.target.value)}>
                  <option value="">Select the authority receipt</option>
                  {activeReceipts.map((item) => <option key={item.id} value={item.id}>{item.identityReference} · {item.authority} · {title(item.channel)}</option>)}
                </select>
                <small className="field-help">An Agent receipt is refused at command time and the refusal is recorded as a rejected connector receipt with its reason.</small>
              </label>
              <label>Command ID and idempotency key
                <input required maxLength={180} value={commandId} onChange={(event) => setCommandId(event.target.value)} placeholder="One identifier for both" />
                <small className="field-help">One field supplies both values because the connector requires them to be equal. Exact replay returns the existing receipt; the same key with different content is rejected.</small>
              </label>
              <label>Closure reason
                <textarea required rows={3} maxLength={180} value={closureReason} onChange={(event) => setClosureReason(event.target.value)} placeholder="Why this exact Action closes now." />
                <small className="field-help">{closureReason.trim().length}/180 characters.</small>
              </label>
              <EvidencePicker
                label="Closure evidence references"
                help="At least one is required. The first entry becomes the closed Action's operational evidence reference."
                values={closureEvidence}
                suggestions={suggestions}
                onChange={setClosureEvidence}
              />
              {reviewDrift && <p className="form-warning">{reviewDrift} Resolve the drift before applying a command.</p>}
              <button className="button button-primary" disabled={locked || !targetAction || !authorityReceiptId || closureEvidence.length === 0}>Apply governed action.close</button>
            </form>
          </section>

          <section className="closure-panel">
            <div className="section-heading"><div><span className="eyebrow">Step 4 alternative · no lifecycle command</span><h2>Record a non-applied outcome</h2></div></div>
            <p className="muted-copy">Offline, expired, cancelled, failed, and unknown outcomes are recorded against the reviewed package without applying any lifecycle command. The connector never retries them; a corrected attempt requires a new result package and a new idempotency key.</p>
            <form className="closure-form" onSubmit={(event) => void recordOutcome(event)}>
              <div className="form-split">
                <label>Outcome<select value={outcomeKind} onChange={(event) => setOutcomeKind(event.target.value as NonAppliedConnectorOutcome)}>{NON_APPLIED_CONNECTOR_OUTCOMES.map((item) => <option key={item} value={item}>{title(item)}</option>)}</select></label>
                <label>Idempotency key<input required maxLength={180} value={outcomeKey} onChange={(event) => setOutcomeKey(event.target.value)} placeholder="Retained for reconciliation" /></label>
              </div>
              <label>Reason code<input required maxLength={120} value={outcomeReasonCode} onChange={(event) => setOutcomeReasonCode(event.target.value)} placeholder="OUTCOME_UNKNOWN, DELIVERY_OFFLINE …" /></label>
              <label>Reason<textarea required rows={3} maxLength={500} value={outcomeReason} onChange={(event) => setOutcomeReason(event.target.value)} placeholder="What is known, and what remains unreconciled." /></label>
              {outcomeKind === "unknown" && <p className="form-warning">Unknown is terminal until it is explicitly reconciled. The idempotency key and result binding are retained exactly as recorded and no automatic retry is generated.</p>}
              <button className="button button-accent" disabled={locked || !authorityReceiptId}>Record outcome</button>
            </form>
          </section>
        </div>
      )}

      <div className="section-heading"><div><span className="eyebrow">Step 5 · durable outcomes</span><h2>Connector receipts</h2></div></div>
      <div className="closure-receipt-list">
        {receipts.length === 0 && <div className="inline-empty">No connector receipt exists. Applied, rejected, and non-applied outcomes all appear here and are never removed.</div>}
        {receipts.map((receipt) => {
          const tone = connectorOutcomeTone(receipt.outcome);
          const lifecycle = state.lifecycleCommandReceipts.find((item) => item.commandId === receipt.lifecycleReceiptCommandId) ?? null;
          return (
            <article key={receipt.id} className={`closure-receipt closure-receipt-${tone}`}>
              <div className="closure-receipt-heading">
                <div><span className="record-id">{shortId(receipt.id)}</span><h3>{title(receipt.outcome)}</h3><small>{receipt.reasonCode} · {dateLabel(receipt.occurredAt)} · {title(receipt.channel)} channel</small></div>
                <span className={outcomeStatusClass(receipt)}>{title(receipt.outcome)}</span>
              </div>
              <p>{receipt.reason}</p>
              <div className="closure-evidence-grid">
                <span><b>Idempotency key</b>{receipt.idempotencyKey}</span>
                <span><b>Receipt binding</b>{receipt.binding}</span>
                <span><b>Result package</b>{shortId(receipt.resultPackageId)} · r{receipt.resultPackageRevision}</span>
                <span><b>Result binding</b>{receipt.resultPackageBinding}</span>
                <span><b>Authority receipt</b>{shortId(receipt.authorityReceiptId)}</span>
                <span><b>Lifecycle command</b>{receipt.lifecycleCommandId || "None"}</span>
                <span><b>Lifecycle receipt</b>{receipt.lifecycleReceiptCommandId ?? "Absent"}</span>
                <span><b>Direct database write</b>False</span>
              </div>
              {tone === "applied" && lifecycle && <p className="closure-receipt-note">Closed {title(lifecycle.entityType)} {shortId(lifecycle.entityId)} at revision {lifecycle.expectedRevision} → {lifecycle.resultingRevision}. Evidence: {lifecycle.evidenceReferences.join(" · ")}</p>}
              {tone === "rejected" && <p className="closure-receipt-note">Rejected. No lifecycle command was applied and the target record is unchanged. A corrected attempt requires a new result package and a new idempotency key.</p>}
              {tone === "unknown" && <p className="closure-receipt-note">Unknown and terminal until explicitly reconciled. The idempotency key and result binding above are the exact retained reconciliation binding. No automatic retry was or will be generated.</p>}
              {tone === "non_applied" && <p className="closure-receipt-note">Recorded without a lifecycle command. The connector does not retry a non-applied outcome.</p>}
            </article>
          );
        })}
      </div>

      <p className="closure-footnote">A005 records no provider endpoint, listener, service credential, hosted queue, or Production connector, and this workspace adds none. It holds no repository, network, IndexedDB, or browser-storage path: every step is submitted to the application shell, which owns the authenticated Commander session and the hosted-state boundary.</p>
    </>
  );
}
