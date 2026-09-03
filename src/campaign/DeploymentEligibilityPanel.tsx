import { useState } from "react";
import type {
  Campaign,
  CastraCommand,
  DeploymentEligibilityDisposition,
} from "../domain/types";
import {
  deploymentAssessmentOf,
  deploymentGateSatisfied,
  type DeploymentEligibilityAssessment,
} from "../domain/deploymentEligibility";

function label(value: string | null): string {
  if (!value) return "Unresolved";
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function display(value: string): string {
  return value.trim() || "Not recorded";
}

function GateForm({
  campaign,
  execute,
  close,
}: {
  campaign: Campaign;
  execute: (commands: CastraCommand[]) => Promise<boolean>;
  close: () => void;
}) {
  const [assessment, setAssessment] = useState<DeploymentEligibilityAssessment>(
    deploymentAssessmentOf(campaign.deploymentEligibility),
  );
  const [disposition, setDisposition] = useState<DeploymentEligibilityDisposition | "">(
    campaign.deploymentEligibility.disposition ?? "",
  );
  const [explanation, setExplanation] = useState(
    campaign.deploymentEligibility.dispositionExplanation,
  );

  function update<K extends keyof DeploymentEligibilityAssessment>(
    key: K,
    value: DeploymentEligibilityAssessment[K],
  ) {
    setAssessment((current) => ({ ...current, [key]: value }));
    setDisposition("");
    setExplanation("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const commands: CastraCommand[] = [
      {
        type: "campaign.deployment_eligibility.update",
        campaignId: campaign.id,
        assessment,
      },
    ];
    if (disposition) {
      commands.push({
        type: "campaign.deployment_eligibility.disposition",
        campaignId: campaign.id,
        disposition,
        explanation,
      });
    }
    if (await execute(commands)) close();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section className="modal deployment-modal" role="dialog" aria-modal="true" aria-labelledby="deployment-gate-form-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div><span className="eyebrow">Campaign specification</span><h2 id="deployment-gate-form-title">Deployment Eligibility & Standard Pattern</h2></div>
          <button className="icon-button" aria-label="Close" onClick={close}>×</button>
        </div>
        <form onSubmit={submit}>
          <div className="form-split">
            <label>
              Web deployment intended?
              <select value={assessment.webDeploymentIntent} onChange={(event) => update("webDeploymentIntent", event.target.value as DeploymentEligibilityAssessment["webDeploymentIntent"])}>
                <option value="unresolved">Unresolved</option><option value="intended">Intended</option><option value="not_intended">Not intended</option>
              </select>
            </label>
            <label>
              Branded Super L Works subdomain required?
              <select value={assessment.brandedSubdomainRequirement} onChange={(event) => update("brandedSubdomainRequirement", event.target.value as DeploymentEligibilityAssessment["brandedSubdomainRequirement"])}>
                <option value="unresolved">Unresolved</option><option value="required">Required</option><option value="not_required">Not required</option>
              </select>
            </label>
          </div>
          <label>
            Standard Vercel + Porkbun subdomain pattern
            <select value={assessment.standardPattern} onChange={(event) => update("standardPattern", event.target.value as DeploymentEligibilityAssessment["standardPattern"])}>
              <option value="unresolved">Unresolved</option><option value="applies">Applies</option><option value="exception_required">Exception required</option><option value="not_applicable">Not applicable</option>
            </select>
          </label>
          <div className="form-split">
            <label>
              Intended use
              <select value={assessment.commercialUse} onChange={(event) => update("commercialUse", event.target.value as DeploymentEligibilityAssessment["commercialUse"])}>
                <option value="unresolved">Unresolved</option><option value="commercial_branded">Commercial / branded</option><option value="non_commercial">Non-commercial</option>
              </select>
            </label>
            <label>
              Provider account / plan eligibility under current terms
              <select value={assessment.providerEligibility} onChange={(event) => update("providerEligibility", event.target.value as DeploymentEligibilityAssessment["providerEligibility"])}>
                <option value="unresolved">Unresolved</option><option value="verified_eligible">Verified eligible</option><option value="not_eligible">Not eligible</option>
              </select>
            </label>
          </div>
          <div className="form-split">
            <label>Proposed hostname<input value={assessment.proposedHostname} onChange={(event) => update("proposedHostname", event.target.value)} placeholder="product.superlworks.com" /></label>
            <label>DNS authority state<input value={assessment.dnsAuthorityState} onChange={(event) => update("dnsAuthorityState", event.target.value)} placeholder="Provider, access, and current-record evidence" /></label>
          </div>
          <fieldset className="deployment-implications">
            <legend>Browser-origin & data implications</legend>
            <label>Export / import<textarea rows={2} value={assessment.exportImportImplication} onChange={(event) => update("exportImportImplication", event.target.value)} /></label>
            <label>Hosted persistence<textarea rows={2} value={assessment.hostedPersistenceImplication} onChange={(event) => update("hostedPersistenceImplication", event.target.value)} /></label>
            <label>Authentication<textarea rows={2} value={assessment.authenticationImplication} onChange={(event) => update("authenticationImplication", event.target.value)} /></label>
            <label>Synchronization<textarea rows={2} value={assessment.synchronizationImplication} onChange={(event) => update("synchronizationImplication", event.target.value)} /></label>
            <label>Migration<textarea rows={2} value={assessment.migrationImplication} onChange={(event) => update("migrationImplication", event.target.value)} /></label>
          </fieldset>
          <label>Provider plan cost, usage, capability, terms, or policy change<textarea rows={3} value={assessment.providerChangeAssessment} onChange={(event) => update("providerChangeAssessment", event.target.value)} /></label>
          <label>Evidence / reference<textarea rows={2} value={assessment.evidenceReference} onChange={(event) => update("evidenceReference", event.target.value)} placeholder="Direct source, account observation, decision, or recorded unavailable state" /></label>
          <div className="form-split disposition-inputs">
            <label>
              Commander disposition
              <select value={disposition} onChange={(event) => setDisposition(event.target.value as DeploymentEligibilityDisposition | "")}>
                <option value="">Unresolved — do not record</option>
                <option value="eligible">Eligible</option>
                <option value="not_applicable">Not applicable</option>
                <option value="product_owner_decision_required">Product Owner decision required</option>
              </select>
            </label>
            <label>Disposition explanation<textarea required={Boolean(disposition)} rows={3} value={explanation} onChange={(event) => setExplanation(event.target.value)} /></label>
          </div>
          <p className="form-warning">Changing any assessment or evidence field clears the prior disposition and Campaign approval. Eligible requires complete implications, evidence, DNS/provider assessment, and a verified eligible provider plan.</p>
          <p className="form-note">This local specification command does not contact Vercel, Porkbun, DNS, or any external service.</p>
          <div className="modal-actions"><button type="button" className="button button-quiet" onClick={close}>Cancel</button><button type="submit" className="button button-primary">Save specification gate</button></div>
        </form>
      </section>
    </div>
  );
}

export function DeploymentEligibilityPanel({
  campaign,
  execute,
}: {
  campaign: Campaign;
  execute: (commands: CastraCommand[]) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const gate = campaign.deploymentEligibility;
  const ready = deploymentGateSatisfied(campaign);
  const dispositionLabel = label(gate.disposition);
  return (
    <>
      <section className={`deployment-gate ${ready ? "ready" : "blocked"}`}>
        <div className="deployment-gate-heading">
          <div>
            <span className="eyebrow">Specification gate</span>
            <h2>Deployment Eligibility & Standard Pattern</h2>
            <p>{ready ? "External-release representation and deployment actions are eligible to proceed through their normal Commander controls." : "Local design and build may continue. Campaign completion and deployment actions remain blocked."}</p>
          </div>
          <div className="deployment-gate-actions"><span className={`deployment-disposition ${ready ? "ready" : "blocked"}`}>{dispositionLabel}</span>{!campaign.archivedAt && <button className="button button-accent" onClick={() => setEditing(true)}>Edit specification</button>}</div>
        </div>
        <dl className="deployment-detail-grid">
          <div><dt>Web deployment intended</dt><dd>{label(gate.webDeploymentIntent)}</dd></div>
          <div><dt>Branded subdomain</dt><dd>{label(gate.brandedSubdomainRequirement)}</dd></div>
          <div><dt>Standard pattern</dt><dd>{label(gate.standardPattern)}</dd></div>
          <div><dt>Commercial / branded use</dt><dd>{label(gate.commercialUse)}</dd></div>
          <div><dt>Provider plan eligibility</dt><dd>{label(gate.providerEligibility)}</dd></div>
          <div><dt>Proposed hostname</dt><dd>{display(gate.proposedHostname)}</dd></div>
          <div><dt>DNS authority state</dt><dd>{display(gate.dnsAuthorityState)}</dd></div>
          <div><dt>Provider change assessment</dt><dd>{display(gate.providerChangeAssessment)}</dd></div>
        </dl>
        <div className="deployment-implication-grid">
          <strong>Browser-origin & data implications</strong>
          <span><b>Export / import</b>{display(gate.exportImportImplication)}</span>
          <span><b>Hosted persistence</b>{display(gate.hostedPersistenceImplication)}</span>
          <span><b>Authentication</b>{display(gate.authenticationImplication)}</span>
          <span><b>Synchronization</b>{display(gate.synchronizationImplication)}</span>
          <span><b>Migration</b>{display(gate.migrationImplication)}</span>
        </div>
        <div className="deployment-evidence"><span><strong>Evidence / reference</strong>{display(gate.evidenceReference)}</span><span><strong>Disposition explanation</strong>{display(gate.dispositionExplanation)}</span>{gate.disposedAt && <small>Recorded by {gate.disposedBy} · {new Date(gate.disposedAt).toLocaleString()}</small>}</div>
      </section>
      {editing && <GateForm campaign={campaign} execute={execute} close={() => setEditing(false)} />}
    </>
  );
}
