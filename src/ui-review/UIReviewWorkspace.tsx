import { useEffect, useMemo, useState } from "react";
import type { CastraCommand, CastraState, UIReviewApplicability, UIReviewCheckpointCode, UIReviewDestination, UIReviewScenario } from "../domain/types";
import { UI_REVIEW_CHECKPOINT_CATALOG } from "../domain/uiReview";
import { shortId } from "../domain/ids";
import { UI03_FIXTURE_MANIFEST, UI03_FIXTURE_REVISION } from "./ui03Fixture";

interface UIReviewWorkspaceProps {
  state: CastraState;
  execute: (commands: CastraCommand[]) => Promise<boolean> | void;
  reviewMode?: boolean;
  reviewScenario?: UIReviewScenario | null;
  enterReviewMode?: () => void;
  openReviewTarget?: (destination: UIReviewDestination, scenario: UIReviewScenario) => void;
  focusCheckpointId?: string | null;
}

const allCheckpointCodes = UI_REVIEW_CHECKPOINT_CATALOG.map((entry) => entry.code);

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function UIReviewWorkspace({ state, execute, reviewMode = false, reviewScenario = null, enterReviewMode, openReviewTarget, focusCheckpointId = null }: UIReviewWorkspaceProps) {
  const campaignsWithoutPlans = useMemo(
    () => state.campaigns.filter((campaign) => !campaign.archivedAt && !state.uiReviewPlans.some((plan) => plan.campaignId === campaign.id)),
    [state.campaigns, state.uiReviewPlans],
  );
  const [showCreate, setShowCreate] = useState(false);
  const [campaignId, setCampaignId] = useState(campaignsWithoutPlans[0]?.id ?? "");
  const [applicability, setApplicability] = useState<UIReviewApplicability>("ui");
  const [requiredCheckpoints, setRequiredCheckpoints] = useState<UIReviewCheckpointCode[]>(allCheckpointCodes);
  const [experienceIntent, setExperienceIntent] = useState("");
  const [devices, setDevices] = useState("Desktop and mobile-responsive browser views");
  const [themeNavigation, setThemeNavigation] = useState("Commander-selected semantic theme with persistent left navigation");
  const [demonstrationData, setDemonstrationData] = useState("Deterministic, visibly labelled demonstration records isolated from Commander data");
  const [evidenceRequirement, setEvidenceRequirement] = useState("Screen/state inventory plus source-attributed visual evidence");
  const [screenshotRequired, setScreenshotRequired] = useState(true);
  const [notApplicableReason, setNotApplicableReason] = useState("");
  const [notApplicableEvidence, setNotApplicableEvidence] = useState("");

  useEffect(() => {
    if (!campaignsWithoutPlans.some((campaign) => campaign.id === campaignId)) {
      setCampaignId(campaignsWithoutPlans[0]?.id ?? "");
    }
  }, [campaignId, campaignsWithoutPlans]);

  useEffect(() => {
    if (!focusCheckpointId) return;
    const target = document.getElementById(`ui-review-checkpoint-${focusCheckpointId}`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusCheckpointId]);

  function toggleCheckpoint(code: UIReviewCheckpointCode) {
    setRequiredCheckpoints((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  }

  async function createPlan(event: React.FormEvent) {
    event.preventDefault();
    const success = await execute([{
      type: "ui_review.plan.create",
      campaignId,
      applicability,
      applicabilityReason: applicability === "not_applicable" ? notApplicableReason : "UI-bearing Campaign",
      applicabilityEvidenceReference: applicability === "not_applicable" ? notApplicableEvidence : "",
      experienceIntent: applicability === "ui" ? experienceIntent : "",
      devicesAndScreenSizes: applicability === "ui" ? devices : "",
      themeAndNavigationPattern: applicability === "ui" ? themeNavigation : "",
      requiredCheckpoints: applicability === "ui" ? requiredCheckpoints : [],
      demonstrationDataNeeds: applicability === "ui" ? demonstrationData : "",
      evidenceRequirement: applicability === "ui" ? evidenceRequirement : "",
      screenshotRequired: applicability === "ui" && screenshotRequired,
    }]);
    if (success) setShowCreate(false);
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Deterministic Campaign gate</span>
          <h1>UI Reviews</h1>
          <p>Configure review intent and preserve exact-scope Commander decisions, evidence, comments, invalidations, and linked Punch Items.</p>
        </div>
        <div className="record-controls">
          {!reviewMode && enterReviewMode && <button className="button button-primary" onClick={enterReviewMode}>Enter UI-03 Review Mode</button>}
          {!reviewMode && campaignsWithoutPlans.length > 0 && <button className="button button-accent" onClick={() => setShowCreate((current) => !current)}>{showCreate ? "Close" : "＋ Configure plan"}</button>}
        </div>
      </div>

      <section className="ui-review-boundary">
        <div><span className="eyebrow">{reviewMode ? "Preserved A002 populated prototype" : "Integrated review sequence"}</span><strong>{reviewMode ? `UI-03 immutable packet · ${UI03_FIXTURE_REVISION}` : "UI-03 Rework required recorded · UI-05 ready for Commander review"}</strong></div>
        <p>{reviewMode ? "Review-only fixture records remain isolated from Commander data. A003 recorded Rework required against this exact revision; thirteen preserved findings map to A005–A008 and no duplicate Punch Item was fabricated." : "The reusable seven-checkpoint workflow, exact-scope decision binding, evidence preservation, invalidation, and remediation mapping are available for future Campaigns. The integrated UI-05 packet remains open and unapproved."}</p>
      </section>

      {reviewMode && <section className="ui03-review-packet">
        <div className="section-heading"><div><span className="eyebrow">Preserved A003 evidence sequence</span><h2>Screen/state packet</h2><p>Choose a scenario for any destination to inspect the immutable A002 evidence that governed the recorded A003 rework decision.</p></div><span className="integrity-mark">{UI03_FIXTURE_MANIFEST.reviewCases.length} fixed review cases</span></div>
        <div className="ui03-review-case-grid">{UI03_FIXTURE_MANIFEST.reviewCases.filter((item) => item.scenario === (reviewScenario ?? "normal")).map((reviewCase) => <article key={reviewCase.logicalId}>
          <div><span className="record-id">{reviewCase.logicalId}</span><h3>{reviewCase.destinationLabel}</h3><span className="status status-draft">{label(reviewCase.scenario)}</span></div>
          <p><strong>Inspect</strong>{reviewCase.inspectionFocus}</p>
          <p><strong>Intentional gap</strong>{reviewCase.knownIntentionalGaps}</p>
          <p><strong>Original A003 review question</strong>{reviewCase.requestedDecision}</p>
          <div className="ui03-state-links">{UI03_FIXTURE_MANIFEST.scenarios.map((scenario) => <button key={scenario} className={`button button-small ${scenario === reviewCase.scenario ? "button-accent" : "button-quiet"}`} onClick={() => openReviewTarget?.(reviewCase.destination, scenario)}>{label(scenario)}</button>)}</div>
        </article>)}</div>
      </section>}

      {showCreate && (
        <form className="ui-review-form" onSubmit={createPlan}>
          <div className="section-heading"><div><span className="eyebrow">Campaign specification questions</span><h2>Configure UI review</h2></div></div>
          <label>Campaign<select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} required>{campaignsWithoutPlans.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}</select></label>
          <label>UI applicability<select value={applicability} onChange={(event) => setApplicability(event.target.value as UIReviewApplicability)}><option value="ui">UI-bearing Campaign</option><option value="not_applicable">Not applicable</option></select></label>
          {applicability === "not_applicable" ? (
            <div className="ui-review-field-grid">
              <label>Commander reason<textarea value={notApplicableReason} onChange={(event) => setNotApplicableReason(event.target.value)} required /></label>
              <label>Evidence/reference<input value={notApplicableEvidence} onChange={(event) => setNotApplicableEvidence(event.target.value)} required /></label>
            </div>
          ) : (
            <>
              <label>Experience intent<textarea value={experienceIntent} onChange={(event) => setExperienceIntent(event.target.value)} required /></label>
              <div className="ui-review-field-grid">
                <label>Devices / screen sizes<input value={devices} onChange={(event) => setDevices(event.target.value)} required /></label>
                <label>Theme / navigation pattern<input value={themeNavigation} onChange={(event) => setThemeNavigation(event.target.value)} required /></label>
                <label>Demonstration-data needs<textarea value={demonstrationData} onChange={(event) => setDemonstrationData(event.target.value)} required /></label>
                <label>Evidence requirement<textarea value={evidenceRequirement} onChange={(event) => setEvidenceRequirement(event.target.value)} required /></label>
              </div>
              <fieldset><legend>Required checkpoints</legend><div className="ui-review-checklist">{UI_REVIEW_CHECKPOINT_CATALOG.map((entry) => <label key={entry.code}><input type="checkbox" checked={requiredCheckpoints.includes(entry.code)} onChange={() => toggleCheckpoint(entry.code)} />{entry.code} · {entry.name}</label>)}</div></fieldset>
              <label className="toggle"><input type="checkbox" checked={screenshotRequired} onChange={(event) => setScreenshotRequired(event.target.checked)} /> Screenshot evidence required</label>
            </>
          )}
          <div className="record-controls"><button className="button button-primary" type="submit">Record configuration</button></div>
        </form>
      )}

      <section>
        <div className="section-heading"><div><span className="eyebrow">Reusable standard catalog</span><h2>Seven checkpoints</h2></div></div>
        <div className="ui-review-catalog">{UI_REVIEW_CHECKPOINT_CATALOG.map((entry) => <article key={entry.code}><span className="record-id">{entry.code}</span><strong>{entry.name}</strong><p>{entry.intent}</p></article>)}</div>
      </section>

      <section>
        <div className="section-heading"><div><span className="eyebrow">Campaign review plans</span><h2>Configured evidence</h2></div></div>
        {state.uiReviewPlans.length === 0 && <div className="inline-empty">No Campaign UI review plan is configured. The reusable checkpoint catalog and isolation contract are ready; no approval is implied.</div>}
        <div className="ui-review-plan-list">{state.uiReviewPlans.map((plan) => {
          const campaign = state.campaigns.find((item) => item.id === plan.campaignId);
          const checkpoints = state.uiReviewCheckpoints.filter((item) => item.planId === plan.id && plan.requiredCheckpoints.includes(item.code));
          const fixture = state.uiReviewFixtureContracts.find((item) => item.planId === plan.id);
          const checkpointIds = new Set(checkpoints.map((item) => item.id));
          const reviewItems = state.uiReviewItems.filter((item) => checkpointIds.has(item.checkpointId));
          return <article className="ui-review-plan" key={plan.id}>
            <div className="ui-review-plan-heading"><div><span className="record-id">{shortId(plan.id)} · revision {plan.revision}</span><h3>{campaign?.title ?? (reviewMode ? "SYNTHETIC · CASTRA Release 1" : "Missing Campaign")}</h3></div><span className={`status status-${plan.status === "configured" ? "active" : "draft"}`}>{label(plan.status)}</span></div>
            {plan.applicability === "not_applicable" ? <div className="evidence-callout"><strong>Not applicable · Commander evidence required</strong><p>{plan.applicabilityReason}</p><small>{plan.applicabilityEvidenceReference}</small></div> : <>
              <div className="ui-review-spec-grid"><span><strong>Intent</strong>{plan.experienceIntent}</span><span><strong>Devices</strong>{plan.devicesAndScreenSizes}</span><span><strong>Theme/navigation</strong>{plan.themeAndNavigationPattern}</span><span><strong>Approver</strong>{plan.approver}</span><span><strong>Evidence</strong>{plan.evidenceRequirement}</span><span><strong>Screenshots</strong>{plan.screenshotRequired ? "Required" : "Not required"}</span></div>
              {fixture && <div className="fixture-contract"><strong>{fixture.visibleLabel}</strong><span>{fixture.status.replaceAll("_", " ")} · isolated namespace {fixture.namespace}</span></div>}
              <div className="ui-review-checkpoint-list">{checkpoints.map((checkpoint) => {
                const inventory = state.uiReviewInventoryEntries.filter((item) => item.checkpointId === checkpoint.id);
                const decisions = state.uiReviewDecisions.filter((item) => item.checkpointId === checkpoint.id);
                const latestDecision = decisions.at(-1);
                const invalidation = latestDecision && state.uiReviewInvalidations.find((item) => item.decisionId === latestDecision.id);
                const punchIds = latestDecision?.punchItemIds ?? [];
                return <div id={`ui-review-checkpoint-${checkpoint.id}`} className={`ui-review-checkpoint ${focusCheckpointId === checkpoint.id ? "is-focused" : ""}`} tabIndex={-1} key={checkpoint.id}><div><span className="record-id">{checkpoint.code} · r{checkpoint.revision}</span><strong>{checkpoint.name}</strong><small>{checkpoint.scope || "Scope not configured"} · {inventory.length} screen/state entries</small></div><div><span className={`status status-${checkpoint.status === "approved" ? "completed" : checkpoint.status === "invalidated" ? "blocked" : "draft"}`}>{label(checkpoint.status)}</span>{latestDecision && <small>{label(latestDecision.disposition)} · scope {latestDecision.inventoryEvidenceScope}</small>}{invalidation && <small className="critical-copy">Invalidated: {invalidation.reason}</small>}{punchIds.length > 0 && <small>{punchIds.length} linked Punch Item{punchIds.length === 1 ? "" : "s"}</small>}</div></div>;
              })}</div>
              {reviewItems.length > 0 && <div className="ui-review-item-list"><span className="eyebrow">Traceable review comments and remediation</span>{reviewItems.map((item) => {
                const link = state.uiReviewPunchLinks.find((candidate) => candidate.reviewItemId === item.id);
                const punch = link && state.punchItems.find((candidate) => candidate.id === link.punchItemId);
                const remediationCodes = item.componentReference.match(/C001\.M010\.A00[5-8]/g) ?? [];
                const remediationActions = remediationCodes.map((code) => state.actions.find((action) => action.title.startsWith(code))).filter(Boolean);
                return <div key={item.id}><strong>{item.screenReference}{item.componentReference ? ` / ${item.componentReference}` : ""}</strong><p>{item.comment}</p><small>{item.sourceAttribution} · {item.sourceReference} · {label(item.severity)}</small>{remediationActions.length > 0 && <small>Mapped remediation: {remediationActions.map((action) => `${action!.title.split(" — ")[0]} · ${label(action!.status)}`).join("; ")}</small>}{punch ? <small>Distinct Punch {shortId(punch.id)} · {label(punch.status)} · original comment preserved</small> : <small>{remediationActions.length ? "Existing Actions govern remediation; no duplicate Punch Item was created." : "No linked Punch Item"}</small>}</div>;
              })}</div>}
            </>}
          </article>;
        })}</div>
      </section>
    </>
  );
}
