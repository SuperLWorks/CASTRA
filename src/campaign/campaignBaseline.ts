import { applyCommand } from "../domain/commands";
import type { CastraState, CommandContext } from "../domain/types";

export const CAMPAIGN_BASELINE_TEMPLATE_REVISION = "campaign-baseline.2026-08-11.r1" as const;

export interface CampaignBaselineMission {
  key: string;
  title: string;
  description: string;
  actions: readonly string[];
}

export const CAMPAIGN_BASELINE_MISSIONS: readonly CampaignBaselineMission[] = [
  { key: "M000", title: "Specification Gate", description: "Define the governing intent, requirements, evidence, and protected release boundaries.", actions: ["Commander's Intent", "Approve Campaign specification"] },
  { key: "DISCOVERY", title: "RECON / Discovery", description: "Check overlapping work, missing intent, product sources, and feasibility before build commitments.", actions: ["Run bounded discovery", "Record evidence and gaps"] },
  { key: "BUILD", title: "Build", description: "Implement the approved scoped product through deterministic Actions.", actions: ["Execute approved build slice"] },
  { key: "AUTH", title: "Authentication and access", description: "Establish the approved access boundary early enough for complete UI and security review.", actions: ["Implement access boundary", "Verify isolation and protected authority"] },
  { key: "UI", title: "UI Review Checkpoints", description: "Run UI-01 through UI-07 against exact evidence and revisions.", actions: ["UI-01 Experience Intent", "UI-02 Information Architecture", "UI-03 Populated Prototype", "UI-04 Functional Slice", "UI-05 Full-State Review", "UI-06 Release Candidate", "UI-07 BASEOPS Review"] },
  { key: "VERIFY", title: "Verification Testing", description: "Prove the built product conforms to approved requirements and release criteria.", actions: ["Execute verification test plan", "Resolve Punch Items", "Record Commander exit decision"] },
  { key: "0VAT", title: "Zero Day Vulnerability Assessment Test (0VAT)", description: "Required pre-deployment security and vulnerability assessment gate. The template does not claim a historical test occurred.", actions: ["Plan 0VAT", "Execute approved assessment", "Record findings and exit evidence"] },
  { key: "DEPLOY", title: "Deployment", description: "Release only after eligibility, verification, 0VAT, Commander confirmation, and evidenced receipts.", actions: ["Verify deployment eligibility", "Verify Preview", "Confirm and verify Production"] },
  { key: "BASEOPS", title: "BASEOPS transition", description: "Transition accepted deployed work into operational validation, Garrison sustainment, and Fortification improvements.", actions: ["Record handoff", "Run operational validation", "Activate approved sustainment"] },
] as const;

export function applyCampaignBaselineTemplate(
  state: CastraState,
  campaignId: string,
  context: CommandContext,
): CastraState {
  if (state.missions.some((mission) => mission.campaignId === campaignId && mission.notes.includes(CAMPAIGN_BASELINE_TEMPLATE_REVISION))) return state;
  let next = state;
  for (const template of CAMPAIGN_BASELINE_MISSIONS) {
    next = applyCommand(next, {
      type: "mission.create",
      campaignId,
      title: template.title,
      description: template.description,
      notes: `Baseline key ${template.key}. Template ${CAMPAIGN_BASELINE_TEMPLATE_REVISION}. Planned configuration, not completion evidence.`,
    }, context);
    const mission = next.missions.at(-1);
    if (!mission) throw new Error(`Unable to create baseline Mission ${template.key}.`);
    for (const title of template.actions) {
      next = applyCommand(next, {
        type: "action.create",
        missionId: mission.id,
        title,
        description: title.startsWith("UI-") ? "UI checkpoint Action linked to the governed UI Review Plan; no decision is implied." : "Templated Campaign Action; status and evidence begin unclaimed.",
        notes: `Template ${CAMPAIGN_BASELINE_TEMPLATE_REVISION}. Baseline key ${template.key}. No completion, assignment, or approval is inferred.`,
      }, context);
    }
  }
  return next;
}

