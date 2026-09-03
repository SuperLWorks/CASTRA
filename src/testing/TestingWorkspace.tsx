import { useEffect, useMemo, useState } from "react";
import { shortId } from "../domain/ids";
import { latestResultForCase, testPlanRollup } from "../domain/testing";
import type {
  CastraCommand,
  CastraState,
  ExitDecisionValue,
  FirewatchVerificationOutcome,
  PunchItem,
  Severity,
  TestCase,
  TestOutcome,
  TestPlan,
  WorkLink,
} from "../domain/types";

type TestingModalRequest =
  | { kind: "plan" }
  | { kind: "cycle"; planId: string }
  | { kind: "case"; planId: string }
  | { kind: "result"; testCaseId: string }
  | { kind: "punch"; testResultId: string }
  | { kind: "punch_edit"; punchItemId: string }
  | { kind: "punch_verify"; punchItemId: string }
  | { kind: "punch_waive"; punchItemId: string }
  | { kind: "firewatch"; planId: string }
  | { kind: "exit"; planId: string };

interface TestingWorkspaceProps {
  state: CastraState;
  context: WorkLink | null;
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

function TestStatus({ value }: { value: string }) {
  return <span className={`test-status test-status-${value}`}>{label(value)}</span>;
}

function TestingModal({
  request,
  state,
  context,
  close,
  execute,
}: {
  request: TestingModalRequest;
  state: CastraState;
  context: WorkLink | null;
  close: () => void;
  execute: (commands: CastraCommand[]) => Promise<boolean>;
}) {
  const existingPunch =
    "punchItemId" in request
      ? state.punchItems.find((punch) => punch.id === request.punchItemId)
      : undefined;
  const sourceResult =
    request.kind === "punch"
      ? state.testResults.find((result) => result.id === request.testResultId)
      : undefined;
  const sourceCase = sourceResult
    ? state.testCases.find((testCase) => testCase.id === sourceResult.testCaseId)
    : request.kind === "result"
      ? state.testCases.find((testCase) => testCase.id === request.testCaseId)
      : undefined;
  const sourcePlan = sourceCase
    ? state.testPlans.find((plan) => plan.id === sourceCase.testPlanId)
    : undefined;
  const defaultSeverity: Severity = sourceCase
    ? sourceResult?.outcome === "accepted_with_follow_up"
      ? sourceCase.severity === "critical" || sourceCase.severity === "high"
        ? sourceCase.severity
        : "medium"
      : sourceCase.severity === "critical"
        ? "critical"
        : "high"
    : existingPunch?.severity ?? "medium";

  const [title, setTitle] = useState(
    request.kind === "punch"
      ? `Resolve: ${sourceCase?.title ?? "test issue"}`
      : existingPunch?.title ?? "",
  );
  const [description, setDescription] = useState(existingPunch?.description ?? "");
  const [linkValue, setLinkValue] = useState(
    context ? `${context.type}:${context.id}` : "",
  );
  const [expectedResult, setExpectedResult] = useState("");
  const [requirementReference, setRequirementReference] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [required, setRequired] = useState(true);
  const [severity, setSeverity] = useState<Severity>(defaultSeverity);
  const [cycleId, setCycleId] = useState(
    sourceCase
      ? state.testCycles.find(
          (cycle) => cycle.testPlanId === sourceCase.testPlanId && cycle.status === "active",
        )?.id ?? ""
      : "",
  );
  const [outcome, setOutcome] = useState<TestOutcome>("pass");
  const [actualResult, setActualResult] = useState("");
  const [executor, setExecutor] = useState("");
  const [eventTime, setEventTime] = useState(new Date().toISOString().slice(0, 16));
  const [evidenceReference, setEvidenceReference] = useState("");
  const [resultReference, setResultReference] = useState("");
  const [unavailableReason, setUnavailableReason] = useState("");
  const [waiverReason, setWaiverReason] = useState("");
  const [verificationOutcome, setVerificationOutcome] =
    useState<FirewatchVerificationOutcome>("verified");
  const [exitDecision, setExitDecision] = useState<ExitDecisionValue>("defer");
  const [rationale, setRationale] = useState("");

  const workOptions = [
    ...state.campaigns.map((record) => ({ value: `campaign:${record.id}`, label: `Campaign · ${record.title}` })),
    ...state.missions.map((record) => ({ value: `mission:${record.id}`, label: `Mission · ${record.title}` })),
    ...state.actions.map((record) => ({ value: `action:${record.id}`, label: `Action · ${record.title}` })),
  ];
  const activeCycles = sourceCase
    ? state.testCycles.filter(
        (cycle) => cycle.testPlanId === sourceCase.testPlanId && cycle.status === "active",
      )
    : [];

  async function submit(command: CastraCommand) {
    if (await execute([command])) close();
  }

  function formTitle(): string {
    const titles: Record<TestingModalRequest["kind"], string> = {
      plan: "Create Test Plan",
      cycle: "Create Test Cycle",
      case: "Create Test Case",
      result: "Record Test Result",
      punch: "Create Punch Item",
      punch_edit: "Edit Punch Item",
      punch_verify: "Verify Punch Item",
      punch_waive: "Commander Waiver",
      firewatch: "Record FIREWATCH Verification",
      exit: "Commander Exit Decision",
    };
    return titles[request.kind];
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (request.kind === "plan") {
      const divider = linkValue.indexOf(":");
      await submit({
        type: "test_plan.create",
        title,
        description,
        link: { type: linkValue.slice(0, divider) as WorkLink["type"], id: linkValue.slice(divider + 1) },
      });
    } else if (request.kind === "cycle") {
      await submit({ type: "test_cycle.create", testPlanId: request.planId, title });
    } else if (request.kind === "case") {
      await submit({
        type: "test_case.create",
        testPlanId: request.planId,
        title,
        expectedResult,
        requirementReference,
        sourceReference,
        required,
        severity,
      });
    } else if (request.kind === "result") {
      await submit({
        type: "test_result.record",
        testCaseId: request.testCaseId,
        testCycleId: cycleId,
        outcome,
        actualResult,
        executor,
        executedAt: eventTime,
        evidenceReference,
        resultReference,
        unavailableReason,
      });
    } else if (request.kind === "punch") {
      await submit({
        type: "punch_item.create_from_result",
        testResultId: request.testResultId,
        title,
        description,
        severity,
      });
    } else if (request.kind === "punch_edit") {
      await submit({
        type: "punch_item.update",
        punchItemId: request.punchItemId,
        title,
        description,
        severity,
      });
    } else if (request.kind === "punch_verify") {
      await submit({
        type: "punch_item.verify",
        punchItemId: request.punchItemId,
        evidenceReference,
      });
    } else if (request.kind === "punch_waive") {
      await submit({ type: "punch_item.waive", punchItemId: request.punchItemId, reason: waiverReason });
    } else if (request.kind === "firewatch") {
      await submit({
        type: "firewatch_verification.record",
        testPlanId: request.planId,
        outcome: verificationOutcome,
        verifiedAt: eventTime,
        evidenceReference,
        unavailableReason,
      });
    } else {
      await submit({
        type: "exit_decision.record",
        testPlanId: request.planId,
        decision: exitDecision,
        rationale,
      });
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="testing-form-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div><span className="eyebrow">Deterministic direct operation</span><h2 id="testing-form-title">{formTitle()}</h2></div>
          <button className="icon-button" aria-label="Close" onClick={close}>×</button>
        </div>
        <form onSubmit={onSubmit}>
          {request.kind === "plan" && (
            <>
              <label>Title<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
              <label>Linked work record<select required value={linkValue} onChange={(event) => setLinkValue(event.target.value)}><option value="" disabled>Select context</option>{workOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label>Description<textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            </>
          )}
          {request.kind === "cycle" && <label>Cycle title<input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Commissioning cycle 1" /></label>}
          {request.kind === "case" && (
            <>
              <label>Case title<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
              <label>Expected result<textarea required rows={3} value={expectedResult} onChange={(event) => setExpectedResult(event.target.value)} /></label>
              <label>Requirement reference<input required value={requirementReference} onChange={(event) => setRequirementReference(event.target.value)} placeholder="Requirement ID or evidence link" /></label>
              <label>Source reference<input required value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} placeholder="Specification, drawing, issue, or record" /></label>
              <div className="form-split"><label>Severity<select value={severity} onChange={(event) => setSeverity(event.target.value as Severity)}>{["low", "medium", "high", "critical"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label><label className="check-label"><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} /> Required for exit</label></div>
            </>
          )}
          {request.kind === "result" && (
            <>
              {activeCycles.length === 0 && <p className="form-warning">Activate a test cycle before recording a result.</p>}
              <label>Active cycle<select required value={cycleId} onChange={(event) => setCycleId(event.target.value)}><option value="" disabled>Select active cycle</option>{activeCycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.title}</option>)}</select></label>
              <div className="form-split"><label>Outcome<select value={outcome} onChange={(event) => setOutcome(event.target.value as TestOutcome)}>{["not_run", "pass", "fail", "blocked", "accepted_with_follow_up"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label><label>Executed at<input required type="datetime-local" value={eventTime} onChange={(event) => setEventTime(event.target.value)} /></label></div>
              <label>Executor<input required value={executor} onChange={(event) => setExecutor(event.target.value)} /></label>
              <label>Actual result<textarea rows={3} value={actualResult} onChange={(event) => setActualResult(event.target.value)} /></label>
              <label>Evidence reference<input value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Artifact, image, log, or URL" /></label>
              <label>Result reference<input value={resultReference} onChange={(event) => setResultReference(event.target.value)} placeholder="Report or execution record" /></label>
              <label>Unavailable reason<textarea rows={2} value={unavailableReason} onChange={(event) => setUnavailableReason(event.target.value)} placeholder="Required when evidence and reference are unavailable" /></label>
            </>
          )}
          {(request.kind === "punch" || request.kind === "punch_edit") && (
            <>
              {request.kind === "punch" && sourcePlan && <div className="source-callout"><strong>Original result preserved</strong><span>{sourceResult?.outcome ? label(sourceResult.outcome) : "Result"} · {shortId(sourceResult!.id)}</span><span>{workLabel(state, sourcePlan.link)}</span><span>Requirement: {sourceCase?.requirementReference}</span></div>}
              <label>Editable title<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
              <label>Description<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
              <label>Severity suggestion<select value={severity} onChange={(event) => setSeverity(event.target.value as Severity)}>{["low", "medium", "high", "critical"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
            </>
          )}
          {request.kind === "punch_verify" && <><div className="source-callout"><strong>Evidence-gated verified close</strong><span>This records supplied FIREWATCH evidence; it does not dispatch FIREWATCH.</span></div><label>Verification evidence<input required value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} /></label></>}
          {request.kind === "punch_waive" && <><div className="source-callout"><strong>Commander acceptance required</strong><span>The reason and acceptance time are retained in the punch item and audit trail.</span></div><label>Waiver reason<textarea required rows={4} value={waiverReason} onChange={(event) => setWaiverReason(event.target.value)} /></label></>}
          {request.kind === "firewatch" && (
            <>
              <div className="source-callout"><strong>No FIREWATCH action is being run</strong><span>Record only evidence that already exists, or explicitly mark it unavailable.</span></div>
              <div className="form-split"><label>Outcome<select value={verificationOutcome} onChange={(event) => setVerificationOutcome(event.target.value as FirewatchVerificationOutcome)}>{["verified", "issues_found", "unavailable"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label><label>Verified at<input required type="datetime-local" value={eventTime} onChange={(event) => setEventTime(event.target.value)} /></label></div>
              <label>Evidence reference<input value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} /></label>
              <label>Unavailable reason<textarea rows={2} value={unavailableReason} onChange={(event) => setUnavailableReason(event.target.value)} /></label>
            </>
          )}
          {request.kind === "exit" && (
            <>
              <label>Decision<select value={exitDecision} onChange={(event) => setExitDecision(event.target.value as ExitDecisionValue)}>{["pass", "conditional_pass", "fail", "defer"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
              <label>Commander rationale<textarea required rows={4} value={rationale} onChange={(event) => setRationale(event.target.value)} /></label>
            </>
          )}
          <p className="form-note">This change is local, ordered, and auditable. No LLM, agent, connector, or external service is called.</p>
          <div className="modal-actions"><button type="button" className="button button-quiet" onClick={close}>Cancel</button><button type="submit" className="button button-primary">Record change</button></div>
        </form>
      </section>
    </div>
  );
}

function PlanCard({ plan, state, open }: { plan: TestPlan; state: CastraState; open: () => void }) {
  const rollup = testPlanRollup(state, plan.id);
  return (
    <button className="test-plan-card" onClick={open}>
      <div className="card-topline"><span className="record-id">{shortId(plan.id)}</span><TestStatus value={plan.status} /></div>
      <h3>{plan.title}</h3><p>{workLabel(state, plan.link)}</p>
      <div className="test-card-rollup"><span>{rollup.executed}/{rollup.planned} executed</span><span>{rollup.pass} pass</span><span>{rollup.punchOpen} punch open</span></div>
      <strong className={rollup.exitReady ? "readiness-ready" : "readiness-blocked"}>{rollup.exitReady ? "Exit ready" : `${rollup.blockers.length} exit blocker${rollup.blockers.length === 1 ? "" : "s"}`}</strong>
    </button>
  );
}

function PlanDetail({
  plan,
  state,
  back,
  execute,
  openModal,
}: {
  plan: TestPlan;
  state: CastraState;
  back: () => void;
  execute: (commands: CastraCommand[]) => Promise<boolean>;
  openModal: (request: TestingModalRequest) => void;
}) {
  const rollup = testPlanRollup(state, plan.id);
  const cycles = state.testCycles.filter((cycle) => cycle.testPlanId === plan.id);
  const cases = state.testCases.filter((testCase) => testCase.testPlanId === plan.id);
  const punches = state.punchItems.filter((punch) => punch.testPlanId === plan.id);
  const firewatch = state.firewatchVerifications.filter((item) => item.testPlanId === plan.id).at(-1);
  const decision = state.exitDecisions.filter((item) => item.testPlanId === plan.id).at(-1);
  const planNext = plan.status === "draft" ? "active" : plan.status === "active" ? "exit_review" : plan.status === "exit_review" ? "closed" : null;

  return (
    <>
      <button className="back-link" onClick={back}>← All test plans</button>
      <div className="page-heading testing-title"><div><span className="eyebrow">Test Plan · {shortId(plan.id)}</span><h1>{plan.title}</h1><p>{workLabel(state, plan.link)} · {plan.description || "No description"}</p><TestStatus value={plan.status} /></div><div className="record-controls">{plan.status === "exit_review" && <button className="button button-accent" onClick={() => execute([{ type: "test_plan.status", testPlanId: plan.id, status: "active" }])}>Return to Active</button>}{planNext && <button className="button button-primary" onClick={() => execute([{ type: "test_plan.status", testPlanId: plan.id, status: planNext }])}>Move to {label(planNext)}</button>}</div></div>
      <div className="test-rollup-grid">
        {[['Planned', rollup.planned], ['Executed', rollup.executed], ['Pass', rollup.pass], ['Fail', rollup.fail], ['Blocked', rollup.blocked], ['Follow-up', rollup.followUp], ['Punch open', rollup.punchOpen], ['Punch verified', rollup.punchVerified]].map(([name, value]) => <div className="test-metric" key={name}><span>{name}</span><strong>{value}</strong></div>)}
      </div>
      <section className={`exit-gate ${rollup.exitReady ? "ready" : "blocked"}`}><div><span className="eyebrow">Deterministic exit gate</span><h2>{rollup.exitReady ? "Ready for Commander pass decision" : "Pass decision blocked"}</h2></div>{rollup.blockers.length > 0 && <ul>{rollup.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}</section>

      <div className="section-heading"><div><span className="eyebrow">Execution windows</span><h2>Test Cycles</h2></div><button className="button button-primary" onClick={() => openModal({ kind: "cycle", planId: plan.id })}>＋ Cycle</button></div>
      <div className="cycle-list">{cycles.length === 0 && <div className="inline-empty compact">Create and activate a cycle before recording results.</div>}{cycles.map((cycle) => <div className="cycle-row" key={cycle.id}><div><span className="record-id">{shortId(cycle.id)}</span><strong>{cycle.title}</strong></div><TestStatus value={cycle.status} /><div className="record-controls">{cycle.status === "planned" && <button className="button button-small" onClick={() => execute([{ type: "test_cycle.status", testCycleId: cycle.id, status: "active" }])}>Activate</button>}{cycle.status === "active" && <button className="button button-small" onClick={() => execute([{ type: "test_cycle.status", testCycleId: cycle.id, status: "completed" }])}>Complete</button>}</div></div>)}</div>

      <div className="section-heading"><div><span className="eyebrow">Requirements under test</span><h2>Test Cases & Results</h2></div><button className="button button-primary" onClick={() => openModal({ kind: "case", planId: plan.id })}>＋ Test Case</button></div>
      <div className="test-case-list">{cases.length === 0 && <div className="inline-empty compact">No test cases yet.</div>}{cases.map((testCase) => {
        const result = latestResultForCase(state, testCase.id);
        const punch = result ? punches.find((item) => item.testResultId === result.id) : undefined;
        return <article className="test-case-card" key={testCase.id}><div className="test-case-heading"><div><span className="record-id">{shortId(testCase.id)}</span><h3>{testCase.title}</h3><div className="badge-row"><TestStatus value={testCase.status} /><span className={`severity severity-${testCase.severity}`}>{label(testCase.severity)}</span>{testCase.required && <span className="required-mark">Required</span>}</div></div><div className="record-controls">{testCase.status === "draft" && <button className="button button-small" onClick={() => execute([{ type: "test_case.status", testCaseId: testCase.id, status: "ready" }])}>Mark Ready</button>}{testCase.status !== "retired" && <button className="button button-accent" onClick={() => openModal({ kind: "result", testCaseId: testCase.id })}>Record Result</button>}<button className="button button-quiet" onClick={() => execute([{ type: "test_case.status", testCaseId: testCase.id, status: "retired" }])}>Retire</button></div></div><div className="case-references"><span><strong>Expected</strong>{testCase.expectedResult}</span><span><strong>Requirement</strong>{testCase.requirementReference}</span><span><strong>Source</strong>{testCase.sourceReference}</span></div>{result ? <div className="result-strip"><div><TestStatus value={result.outcome} /><strong>{result.actualResult || "No actual-result narrative"}</strong><small>{result.executor} · {new Date(result.executedAt).toLocaleString()} · {result.evidenceReference || result.resultReference || `Unavailable: ${result.unavailableReason}`}</small></div>{["fail", "blocked", "accepted_with_follow_up"].includes(result.outcome) && !punch && <button className="button button-primary" onClick={() => openModal({ kind: "punch", testResultId: result.id })}>Create Punch Item</button>}{punch && <span className="linked-punch">Linked {shortId(punch.id)} · {label(punch.status)}</span>}</div> : <div className="result-strip empty-result">Not run</div>}</article>;
      })}</div>

      <div className="section-heading"><div><span className="eyebrow">Separate remediation records</span><h2>Punch Items</h2></div></div>
      <div className="punch-list">{punches.length === 0 && <div className="inline-empty compact">Failed, blocked, and follow-up results can create linked punch items.</div>}{punches.map((punch: PunchItem) => <article className="punch-card" key={punch.id}><div><span className="record-id">{shortId(punch.id)} · Result {shortId(punch.testResultId)}</span><h3>{punch.title}</h3><p>{punch.description || "No remediation notes."}</p><div className="badge-row"><TestStatus value={punch.status} /><span className={`severity severity-${punch.severity}`}>{label(punch.severity)}</span></div><small>Requirement: {punch.requirementReference} · Evidence: {punch.evidenceReference || "Unavailable on original result"}</small>{punch.verificationEvidence && <small>Verification: {punch.verificationEvidence}</small>}{punch.waiverReason && <small>Commander waiver: {punch.waiverReason}</small>}</div><div className="record-controls">{["open", "in_remediation", "ready_for_verification"].includes(punch.status) && <button className="button button-quiet" onClick={() => openModal({ kind: "punch_edit", punchItemId: punch.id })}>Edit</button>}{punch.status === "open" && <button className="button button-accent" onClick={() => execute([{ type: "punch_item.transition", punchItemId: punch.id, status: "in_remediation" }])}>Start Remediation</button>}{punch.status === "in_remediation" && <button className="button button-accent" onClick={() => execute([{ type: "punch_item.transition", punchItemId: punch.id, status: "ready_for_verification" }])}>Ready for Verification</button>}{punch.status === "ready_for_verification" && <><button className="button button-primary" onClick={() => openModal({ kind: "punch_verify", punchItemId: punch.id })}>Verify Close</button><button className="button button-quiet" onClick={() => execute([{ type: "punch_item.transition", punchItemId: punch.id, status: "in_remediation" }])}>Return</button></>}{["open", "in_remediation", "ready_for_verification"].includes(punch.status) && <><button className="button button-quiet" onClick={() => openModal({ kind: "punch_waive", punchItemId: punch.id })}>Commander Waiver</button><button className="button button-danger" onClick={() => execute([{ type: "punch_item.transition", punchItemId: punch.id, status: "cancelled" }])}>Cancel</button></>}</div></article>)}</div>

      <div className="assurance-grid"><section className="assurance-panel"><span className="eyebrow">Independent assurance record</span><h2>FIREWATCH Verification</h2>{firewatch ? <div className="assurance-current"><TestStatus value={firewatch.outcome} /><p>{firewatch.evidenceReference || `Unavailable: ${firewatch.unavailableReason}`}</p><small>{new Date(firewatch.verifiedAt).toLocaleString()}</small></div> : <p className="muted-copy">No FIREWATCH evidence recorded. Castra will not invent it.</p>}<button className="button button-accent" onClick={() => openModal({ kind: "firewatch", planId: plan.id })}>Record supplied evidence</button></section><section className="assurance-panel"><span className="eyebrow">Final authority</span><h2>Commander Exit Decision</h2>{decision ? <div className="assurance-current"><TestStatus value={decision.decision} /><p>{decision.rationale}</p><small>{new Date(decision.decidedAt).toLocaleString()}</small></div> : <p className="muted-copy">No exit decision recorded.</p>}<button className="button button-primary" onClick={() => openModal({ kind: "exit", planId: plan.id })}>Record exit decision</button></section></div>
    </>
  );
}

export function TestingWorkspace({ state, context, execute }: TestingWorkspaceProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [modal, setModal] = useState<TestingModalRequest | null>(null);
  useEffect(() => setSelectedPlanId(null), [context?.id, context?.type]);
  const plans = useMemo(
    () => state.testPlans.filter((plan) => !context || (plan.link.type === context.type && plan.link.id === context.id)),
    [context, state.testPlans],
  );
  const selected = state.testPlans.find((plan) => plan.id === selectedPlanId);

  return (
    <>
      {selected ? (
        <PlanDetail plan={selected} state={state} back={() => setSelectedPlanId(null)} execute={execute} openModal={setModal} />
      ) : (
        <>
          <div className="page-heading"><div><span className="eyebrow">Evidence-led test management</span><h1>Testing & Punch</h1><p>{context ? `Context: ${workLabel(state, context)}` : "Test plans across Campaign, Mission, and Action records."}</p></div><button className="button button-primary" onClick={() => setModal({ kind: "plan" })}>＋ Test Plan</button></div>
          <div className="test-plan-grid">{plans.length === 0 && <div className="inline-empty">No test plans in this context.</div>}{plans.map((plan) => <PlanCard key={plan.id} plan={plan} state={state} open={() => setSelectedPlanId(plan.id)} />)}</div>
        </>
      )}
      {modal && <TestingModal key={`${modal.kind}-${"planId" in modal ? modal.planId : "punchItemId" in modal ? modal.punchItemId : "testCaseId" in modal ? modal.testCaseId : "testResultId" in modal ? modal.testResultId : "new"}`} request={modal} state={state} context={context} close={() => setModal(null)} execute={execute} />}
    </>
  );
}
