import type {
  Action,
  ActionAttentionState,
  ActionOperationalContext,
  CastraState,
  Mission,
  MissionOpenWorkRollup,
  MissionRollupState,
  OpenWorkIndexEntry,
  OpenWorkState,
  RecordStatus,
} from "./types.js";

export const OPEN_WORK_INDEX_CONTRACT_VERSION = "castra-open-work-index/1.0.0" as const;

const attentionStates = new Set<ActionAttentionState>([
  "normal",
  "commander_review",
  "ready_for_mission_closure",
  "reconciliation_required",
]);

const recordStatuses = new Set<RecordStatus>([
  "draft",
  "planned",
  "active",
  "in_progress",
  "blocked",
  "completed",
]);

const statePriority: Record<OpenWorkState, number> = {
  reconciliation_required: 0,
  blocked: 1,
  commander_review: 2,
  ready_for_mission_closure: 3,
  in_progress: 4,
  open: 5,
};

const missionStatePriority: Record<MissionRollupState, number> = {
  reconciliation_required: 0,
  blocked: 1,
  commander_review: 2,
  ready_for_mission_closure: 3,
  in_progress: 4,
  open: 5,
  no_open_work: 6,
  completed: 7,
};

function boundedText(value: unknown, fallback: string, maximum: number): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  if (!normalized) return fallback;
  return normalized.slice(0, maximum);
}

function boundedEvidenceReferences(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((reference): reference is string => typeof reference === "string")
    .map((reference) => reference.trim())
    .filter(Boolean)
    .map((reference) => reference.slice(0, 240)))]
    .slice(0, 20);
}

export function defaultActionOperationalContext(): ActionOperationalContext {
  return {
    owner: "Unassigned",
    blocker: "",
    nextGate: "Define the next gate.",
    evidenceReference: "",
    attentionState: "normal",
  };
}

export function normalizeActionOperationalContext(value: unknown): ActionOperationalContext {
  const candidate = value && typeof value === "object" ? value as Partial<ActionOperationalContext> : {};
  const evidenceReferences = boundedEvidenceReferences(candidate.evidenceReferences);
  return {
    owner: typeof candidate.owner === "string" ? candidate.owner.trim().slice(0, 120) : "Unassigned",
    blocker: boundedText(candidate.blocker, "", 500),
    nextGate: typeof candidate.nextGate === "string" ? candidate.nextGate.trim().slice(0, 500) : "Define the next gate.",
    evidenceReference: boundedText(candidate.evidenceReference, "", 240),
    ...(Array.isArray(candidate.evidenceReferences) ? { evidenceReferences } : {}),
    attentionState: attentionStates.has(candidate.attentionState as ActionAttentionState)
      ? candidate.attentionState as ActionAttentionState
      : "normal",
  };
}

function actionState(action: Action, context: ActionOperationalContext, integrityValid: boolean): OpenWorkState | null {
  if (action.archivedAt || action.status === "completed") return null;
  if (!integrityValid || !recordStatuses.has(action.status) || context.attentionState === "reconciliation_required") {
    return "reconciliation_required";
  }
  if (action.status === "blocked") return "blocked";
  if (context.attentionState === "commander_review") return "commander_review";
  if (context.attentionState === "ready_for_mission_closure") return "ready_for_mission_closure";
  if (action.status === "in_progress") return "in_progress";
  return "open";
}

function missionState(mission: Mission, entries: OpenWorkIndexEntry[], totalActions: number, completedActions: number, integrityValid: boolean): MissionRollupState {
  if (!integrityValid) return "reconciliation_required";
  if (mission.status === "completed") return entries.length ? "reconciliation_required" : "completed";
  if (entries.some((entry) => entry.state === "reconciliation_required")) return "reconciliation_required";
  if (entries.some((entry) => entry.state === "blocked")) return "blocked";
  if (entries.some((entry) => entry.state === "commander_review")) return "commander_review";
  if (entries.some((entry) => entry.state === "ready_for_mission_closure")) return "ready_for_mission_closure";
  if (entries.some((entry) => entry.state === "in_progress")) return "in_progress";
  if (entries.some((entry) => entry.state === "open")) return "open";
  if (mission.status === "active" && totalActions > 0 && completedActions === totalActions) return "ready_for_mission_closure";
  if (mission.status === "planned" || mission.status === "active") return "open";
  return "no_open_work";
}

function sourceRevision(mission: Mission | undefined, campaignRevision: number | undefined, actions: Action[]): string {
  const actionRevision = [...actions]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((action) => `${action.id}:${action.revision}`)
    .join(",");
  return `mission:${mission?.revision ?? "missing"}|campaign:${campaignRevision ?? "missing"}|actions:${actionRevision || "none"}`;
}

function uniqueCounts(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function summaryFor(action: Action): string {
  return boundedText(action.description, boundedText(action.notes, action.title, 240), 240);
}

function stateCount(entries: OpenWorkIndexEntry[], state: OpenWorkState): number {
  return entries.filter((entry) => entry.state === state).length;
}

export function deriveOpenWorkProjection(state: Pick<CastraState, "campaigns" | "missions" | "actions">): {
  openWorkIndex: OpenWorkIndexEntry[];
  missionOpenWorkRollups: MissionOpenWorkRollup[];
} {
  const campaignCounts = uniqueCounts(state.campaigns.map((item) => item.id));
  const missionCounts = uniqueCounts(state.missions.map((item) => item.id));
  const actionCounts = uniqueCounts(state.actions.map((item) => item.id));
  const campaignById = new Map(state.campaigns.map((item) => [item.id, item]));
  const missionById = new Map(state.missions.map((item) => [item.id, item]));
  const openWorkIndex: OpenWorkIndexEntry[] = [];

  for (const action of state.actions) {
    const mission = missionById.get(action.missionId);
    const campaign = mission ? campaignById.get(mission.campaignId) : undefined;
    const context = normalizeActionOperationalContext(action.operationalContext);
    const integrityValid = actionCounts.get(action.id) === 1
      && Boolean(mission)
      && missionCounts.get(action.missionId) === 1
      && Boolean(campaign)
      && campaignCounts.get(mission?.campaignId ?? "") === 1
      && !mission?.archivedAt
      && mission?.status !== "completed"
      && !campaign?.archivedAt
      && campaign?.status !== "completed";
    const stateValue = actionState(action, context, integrityValid);
    if (!stateValue) continue;
    openWorkIndex.push({
      authority: "non_authoritative_local_projection",
      recordType: "action",
      recordId: action.id,
      missionId: action.missionId,
      campaignId: mission?.campaignId ?? null,
      title: action.title,
      parentTitle: mission?.title ?? "Mission unavailable",
      state: stateValue,
      sourceStatus: action.status,
      summary: summaryFor(action),
      owner: context.owner,
      blocker: stateValue === "reconciliation_required"
        ? "Record hierarchy or lifecycle integrity requires reconciliation."
        : stateValue === "blocked"
          ? context.blocker || "Blocked; reason unavailable."
          : context.blocker,
      nextGate: context.nextGate,
      evidenceReference: context.evidenceReference,
      sourceRevision: sourceRevision(mission, campaign?.revision, [action]),
      updatedAt: action.updatedAt,
    });
  }

  const missionOpenWorkRollups: MissionOpenWorkRollup[] = state.missions.map((mission) => {
    const campaign = campaignById.get(mission.campaignId);
    const actions = state.actions.filter((action) => action.missionId === mission.id);
    const visibleActions = actions.filter((action) => !action.archivedAt);
    const entries = openWorkIndex.filter((entry) => entry.missionId === mission.id && entry.recordType === "action");
    const integrityValid = missionCounts.get(mission.id) === 1
      && Boolean(campaign)
      && campaignCounts.get(mission.campaignId) === 1
      && !mission.archivedAt
      && !campaign?.archivedAt
      && actions.every((action) => actionCounts.get(action.id) === 1);
    const completedActions = visibleActions.filter((action) => action.status === "completed").length;
    const stateValue = missionState(mission, entries, visibleActions.length, completedActions, integrityValid);
    const firstGate = entries.find((entry) => entry.nextGate.trim())?.nextGate ?? "No open Action gate is available.";
    const firstEvidence = entries.find((entry) => entry.evidenceReference.trim())?.evidenceReference ?? "";
    return {
      authority: "non_authoritative_local_projection",
      missionId: mission.id,
      campaignId: mission.campaignId,
      missionTitle: mission.title,
      state: stateValue,
      totalActions: visibleActions.length,
      openActions: stateCount(entries, "open"),
      inProgressActions: stateCount(entries, "in_progress"),
      blockedActions: stateCount(entries, "blocked"),
      commanderReviewActions: stateCount(entries, "commander_review"),
      readyActions: stateCount(entries, "ready_for_mission_closure"),
      reconciliationRequiredActions: stateCount(entries, "reconciliation_required"),
      completedActions,
      archivedActions: actions.filter((action) => Boolean(action.archivedAt)).length,
      openWorkRecordIds: entries.map((entry) => entry.recordId).sort(),
      nextGate: stateValue === "ready_for_mission_closure" && entries.length === 0
        ? "Record the governed Mission closure decision."
        : firstGate,
      evidenceReference: firstEvidence,
      sourceRevision: sourceRevision(mission, campaign?.revision, actions),
    };
  });

  for (const rollup of missionOpenWorkRollups) {
    const mission = missionById.get(rollup.missionId);
    if (!mission || mission.archivedAt || mission.status === "completed") continue;
    if (!(["ready_for_mission_closure", "reconciliation_required", "open"] as MissionRollupState[]).includes(rollup.state)) continue;
    if (rollup.openWorkRecordIds.length > 0) continue;
    openWorkIndex.push({
      authority: "non_authoritative_local_projection",
      recordType: "mission",
      recordId: mission.id,
      missionId: mission.id,
      campaignId: mission.campaignId,
      title: mission.title,
      parentTitle: campaignById.get(mission.campaignId)?.title ?? "Campaign unavailable",
      state: rollup.state === "no_open_work" || rollup.state === "completed" ? "open" : rollup.state,
      sourceStatus: mission.status,
      summary: boundedText(mission.description, mission.title, 240),
      owner: "Unassigned",
      blocker: rollup.state === "reconciliation_required" ? "Mission hierarchy or lifecycle integrity requires reconciliation." : "",
      nextGate: rollup.nextGate,
      evidenceReference: rollup.evidenceReference,
      sourceRevision: rollup.sourceRevision,
      updatedAt: mission.updatedAt,
    });
  }

  openWorkIndex.sort((left, right) =>
    statePriority[left.state] - statePriority[right.state]
    || (left.campaignId ?? "").localeCompare(right.campaignId ?? "")
    || left.missionId.localeCompare(right.missionId)
    || left.recordType.localeCompare(right.recordType)
    || left.recordId.localeCompare(right.recordId));
  missionOpenWorkRollups.sort((left, right) =>
    missionStatePriority[left.state] - missionStatePriority[right.state]
    || left.campaignId.localeCompare(right.campaignId)
    || left.missionId.localeCompare(right.missionId));

  return { openWorkIndex, missionOpenWorkRollups };
}

export function refreshOpenWorkProjection(state: CastraState): CastraState {
  const projection = deriveOpenWorkProjection(state);
  return {
    ...state,
    openWorkIndex: projection.openWorkIndex,
    missionOpenWorkRollups: projection.missionOpenWorkRollups,
  };
}
