import type { Action, AuditEvent, Campaign, CastraState, Mission, RecordStatus, UIReviewCheckpoint, UIReviewCheckpointStatus } from "../domain/types";

export interface CampaignFlowStep {
  id: string;
  label: string;
  status: RecordStatus | UIReviewCheckpointStatus | "unavailable";
  missionId: string | null;
  checkpointId: string | null;
  description: string;
  evidenceReference: string;
  kind: "record" | "checkpoint" | "planned_gate";
}

export interface CampaignMissionProjection {
  mission: Mission;
  actions: Action[];
  checkpoints: UIReviewCheckpoint[];
  audits: AuditEvent[];
  assignedRoleIds: string[];
}

function codeFromNotes(value: string): string {
  return value.match(/Action Code ([A-Z0-9.]+)/)?.[1] ?? value.match(/Mission Code ([A-Z0-9.]+)/)?.[1] ?? "";
}

function missionByCode(state: CastraState, code: string): Mission | null {
  return state.missions.find((mission) => mission.id === code.toLowerCase().replaceAll(".", "_") || codeFromNotes(mission.notes) === code || mission.title.startsWith(code)) ?? null;
}

function missionByTitle(state: CastraState, campaignId: string, pattern: RegExp): Mission | null {
  return state.missions.find((mission) => mission.campaignId === campaignId && pattern.test(mission.title)) ?? null;
}

function statusOf(mission: Mission | null): RecordStatus | "unavailable" {
  return mission?.status ?? "unavailable";
}

export function campaignMissionProjections(state: CastraState, campaign: Campaign): CampaignMissionProjection[] {
  const checkpoints = state.uiReviewPlans.find((plan) => plan.campaignId === campaign.id)
    ? state.uiReviewCheckpoints.filter((checkpoint) => state.uiReviewPlans.find((plan) => plan.id === checkpoint.planId)?.campaignId === campaign.id)
    : [];
  return state.missions.filter((mission) => mission.campaignId === campaign.id).map((mission) => {
    const actions = state.actions.filter((action) => action.missionId === mission.id);
    const actionIds = new Set(actions.map((action) => action.id));
    const audits = state.auditEvents.filter((event) => event.entityId === mission.id || actionIds.has(event.entityId) || Object.values(event.detail).includes(mission.id));
    const assignedRoleIds = [...new Set(actions.map((action) => action.notes.match(/Assigned canonical role:\s*([^\.]+)\./)?.[1]?.trim()).filter((value): value is string => Boolean(value)))];
    const missionCheckpoints = /UI review/i.test(mission.title) || mission.id === "c001_m010" ? checkpoints : [];
    return { mission, actions, checkpoints: missionCheckpoints, audits, assignedRoleIds };
  });
}

export function buildCampaignFlow(state: CastraState, campaign: Campaign): CampaignFlowStep[] {
  const m000 = missionByCode(state, "C001.M000") ?? missionByTitle(state, campaign.id, /Specification Gate/i);
  const discovery = missionByCode(state, "C001.M001") ?? missionByTitle(state, campaign.id, /Discovery|RECON/i);
  const build = missionByCode(state, "C001.M003") ?? missionByTitle(state, campaign.id, /^Build$/i);
  const auth = missionByCode(state, "C001.M012") ?? missionByTitle(state, campaign.id, /Authentication/i);
  const verification = missionByCode(state, "C001.M007") ?? missionByTitle(state, campaign.id, /Verification Testing/i);
  const deployment = missionByCode(state, "C001.M007") ?? missionByTitle(state, campaign.id, /^Deployment$/i);
  const baseops = missionByCode(state, "C001.M008") ?? missionByTitle(state, campaign.id, /BASEOPS/i);
  const zeroVat = missionByTitle(state, campaign.id, /0VAT|Zero Day Vulnerability/i);
  const plan = state.uiReviewPlans.find((item) => item.campaignId === campaign.id);
  const checkpoints = plan ? state.uiReviewCheckpoints.filter((item) => item.planId === plan.id) : [];
  const checkpointStep = (code: UIReviewCheckpoint["code"]): CampaignFlowStep => {
    const checkpoint = checkpoints.find((item) => item.code === code);
    return {
      id: `flow_${campaign.id}_${code.toLowerCase()}`,
      label: code,
      status: checkpoint?.status ?? "unavailable",
      missionId: missionByCode(state, "C001.M010")?.id ?? missionByTitle(state, campaign.id, /UI Review/i)?.id ?? null,
      checkpointId: checkpoint?.id ?? null,
      description: checkpoint ? `${checkpoint.name}. ${checkpoint.scope}` : `${code} is required by the Campaign template but has no configured checkpoint record yet.`,
      evidenceReference: checkpoint?.evidenceReferences[0] ?? "Unavailable — no checkpoint evidence reference.",
      kind: "checkpoint",
    };
  };
  const recordStep = (id: string, label: string, mission: Mission | null, description: string): CampaignFlowStep => ({
    id, label, status: statusOf(mission), missionId: mission?.id ?? null, checkpointId: null,
    description: mission?.description || description,
    evidenceReference: mission?.notes || "Unavailable — no source-backed Mission record.", kind: mission ? "record" : "planned_gate",
  });
  const intentAction = m000 ? state.actions.find((action) => action.missionId === m000.id && /Commander'?s Intent/i.test(action.title)) : null;
  return [
    { id: `flow_${campaign.id}_intent`, label: "Commander's Intent", status: intentAction?.status ?? (campaign.commanderIntent ? "active" : "unavailable"), missionId: m000?.id ?? null, checkpointId: null, description: campaign.commanderIntent || "Commander intent is unavailable.", evidenceReference: intentAction?.notes || campaign.notes, kind: m000 ? "record" : "planned_gate" },
    recordStep(`flow_${campaign.id}_spec`, "Specification", m000, "Specification Gate is required but has no source-backed Mission record."),
    recordStep(`flow_${campaign.id}_discovery`, "RECON / Discovery", discovery, "Discovery is required by the template."),
    checkpointStep("UI-01"), checkpointStep("UI-02"),
    recordStep(`flow_${campaign.id}_auth`, "Authentication", auth, "Authentication must be addressed before complete UI and security acceptance."),
    recordStep(`flow_${campaign.id}_build`, "Build", build, "Build Mission is required by the template."),
    checkpointStep("UI-03"), checkpointStep("UI-04"), checkpointStep("UI-05"),
    recordStep(`flow_${campaign.id}_verify`, "Verification Testing", verification, "Verification evidence must prove conformance to approved requirements."),
    checkpointStep("UI-06"),
    recordStep(`flow_${campaign.id}_0vat`, "0VAT", zeroVat, "Planned pre-deployment vulnerability assessment. No historical C001 0VAT result is claimed."),
    recordStep(`flow_${campaign.id}_deploy`, "Deployment", deployment, "Deployment remains governed by eligibility, testing, 0VAT, and Commander confirmation."),
    recordStep(`flow_${campaign.id}_baseops`, "BASEOPS", baseops, "BASEOPS begins only after accepted handoff."),
    checkpointStep("UI-07"),
  ];
}

export function campaignRecordIds(state: CastraState, campaignId: string): Set<string> {
  const missionIds = new Set(state.missions.filter((mission) => mission.campaignId === campaignId).map((mission) => mission.id));
  return new Set([campaignId, ...missionIds, ...state.actions.filter((action) => missionIds.has(action.missionId)).map((action) => action.id)]);
}
