import type { CastraState, MissionOpenWorkRollup, OpenWorkIndexEntry } from "./types.js";

export const STATUS_PUBLICATION_CONTRACT_VERSION = "castra-one-way-status-publication/1.0.0" as const;
export const STATUS_PUBLICATION_LABEL = "DERIVED FROM CASTRA · READ ONLY · NOT OPERATIONAL AUTHORITY" as const;

export type StatusPublicationMode = "disabled_pre_cutover" | "enabled_post_cutover";
export type StatusSnapshotSourceAuthority = "castra_candidate_pre_cutover" | "castra_post_cutover";
export type StatusPublicationOutcome = "disabled" | "rejected" | "stale" | "published" | "failed";

export interface StatusPublicationCutoverBinding {
  cutoverId: string;
  authorityContractVersion: "castra-operational-authority/1.0.0";
  cutoverReceiptReference: string;
  sourceStateRevision: string;
  verified: boolean;
}

export interface StatusPublicationConfiguration {
  mode: StatusPublicationMode;
  destination: "notion_derived_summary";
  maximumSnapshotAgeSeconds: number;
  cutoverBinding: StatusPublicationCutoverBinding | null;
}

export interface DerivedOpenWorkRecord {
  recordType: OpenWorkIndexEntry["recordType"];
  recordId: string;
  missionId: string;
  campaignId: string | null;
  title: string;
  parentTitle: string;
  state: OpenWorkIndexEntry["state"];
  summary: string;
  owner: string;
  blocker: string;
  nextGate: string;
  evidenceReference: string;
  sourceRevision: string;
  updatedAt: string;
}

export interface DerivedMissionRollup {
  missionId: string;
  campaignId: string;
  missionTitle: string;
  state: MissionOpenWorkRollup["state"];
  totalActions: number;
  openActions: number;
  inProgressActions: number;
  blockedActions: number;
  commanderReviewActions: number;
  readyActions: number;
  reconciliationRequiredActions: number;
  completedActions: number;
  nextGate: string;
  evidenceReference: string;
  sourceRevision: string;
}

export interface DerivedStatusSnapshot {
  contractVersion: typeof STATUS_PUBLICATION_CONTRACT_VERSION;
  snapshotId: string;
  sourceAuthority: StatusSnapshotSourceAuthority;
  sourceStateRevision: string;
  generatedAt: string;
  presentationLabel: typeof STATUS_PUBLICATION_LABEL;
  derivedOnly: true;
  acceptsCommands: false;
  readBackPermitted: false;
  openWork: DerivedOpenWorkRecord[];
  missionRollups: DerivedMissionRollup[];
}

export interface StatusPublicationAdapter {
  publish(snapshot: Readonly<DerivedStatusSnapshot>, context: Readonly<{
    destination: "notion_derived_summary";
    idempotencyKey: string;
  }>): Promise<{ publicationReference: string }>;
}

export interface StatusPublicationReceipt {
  contractVersion: typeof STATUS_PUBLICATION_CONTRACT_VERSION;
  snapshotId: string;
  sourceStateRevision: string;
  outcome: StatusPublicationOutcome;
  attemptedAt: string;
  attemptCount: 0 | 1;
  publicationReference: string;
  reason: string;
  authoritativeStateMutation: "none";
  rollbackRequired: false;
  automaticRetryScheduled: false;
}

export const PRE_CUTOVER_STATUS_PUBLICATION_CONFIGURATION: Readonly<StatusPublicationConfiguration> = Object.freeze({
  mode: "disabled_pre_cutover",
  destination: "notion_derived_summary",
  maximumSnapshotAgeSeconds: 300,
  cutoverBinding: null,
});

function openWorkRecord(entry: OpenWorkIndexEntry): DerivedOpenWorkRecord {
  return {
    recordType: entry.recordType,
    recordId: entry.recordId,
    missionId: entry.missionId,
    campaignId: entry.campaignId,
    title: entry.title,
    parentTitle: entry.parentTitle,
    state: entry.state,
    summary: entry.summary,
    owner: entry.owner,
    blocker: entry.blocker,
    nextGate: entry.nextGate,
    evidenceReference: entry.evidenceReference,
    sourceRevision: entry.sourceRevision,
    updatedAt: entry.updatedAt,
  };
}

function missionRollup(rollup: MissionOpenWorkRollup): DerivedMissionRollup {
  return {
    missionId: rollup.missionId,
    campaignId: rollup.campaignId,
    missionTitle: rollup.missionTitle,
    state: rollup.state,
    totalActions: rollup.totalActions,
    openActions: rollup.openActions,
    inProgressActions: rollup.inProgressActions,
    blockedActions: rollup.blockedActions,
    commanderReviewActions: rollup.commanderReviewActions,
    readyActions: rollup.readyActions,
    reconciliationRequiredActions: rollup.reconciliationRequiredActions,
    completedActions: rollup.completedActions,
    nextGate: rollup.nextGate,
    evidenceReference: rollup.evidenceReference,
    sourceRevision: rollup.sourceRevision,
  };
}

export function buildDerivedStatusSnapshot(
  state: Pick<CastraState, "openWorkIndex" | "missionOpenWorkRollups">,
  input: Pick<DerivedStatusSnapshot, "snapshotId" | "sourceAuthority" | "sourceStateRevision" | "generatedAt">,
): DerivedStatusSnapshot {
  const openWork = state.openWorkIndex.map(openWorkRecord).sort((left, right) =>
    left.campaignId?.localeCompare(right.campaignId ?? "")
    || left.missionId.localeCompare(right.missionId)
    || left.recordType.localeCompare(right.recordType)
    || left.recordId.localeCompare(right.recordId));
  const missionRollups = state.missionOpenWorkRollups
    .filter((rollup) => rollup.state !== "completed" && rollup.state !== "no_open_work")
    .map(missionRollup)
    .sort((left, right) => left.campaignId.localeCompare(right.campaignId) || left.missionId.localeCompare(right.missionId));
  return {
    contractVersion: STATUS_PUBLICATION_CONTRACT_VERSION,
    ...input,
    presentationLabel: STATUS_PUBLICATION_LABEL,
    derivedOnly: true,
    acceptsCommands: false,
    readBackPermitted: false,
    openWork,
    missionRollups,
  };
}

function receipt(snapshot: DerivedStatusSnapshot, attemptedAt: string, values: Pick<StatusPublicationReceipt, "outcome" | "attemptCount" | "publicationReference" | "reason">): StatusPublicationReceipt {
  return {
    contractVersion: STATUS_PUBLICATION_CONTRACT_VERSION,
    snapshotId: snapshot.snapshotId,
    sourceStateRevision: snapshot.sourceStateRevision,
    attemptedAt,
    ...values,
    authoritativeStateMutation: "none",
    rollbackRequired: false,
    automaticRetryScheduled: false,
  };
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

export async function publishDerivedStatusSnapshot(
  snapshot: DerivedStatusSnapshot,
  configuration: Readonly<StatusPublicationConfiguration>,
  adapter: StatusPublicationAdapter,
  attemptedAt: string,
): Promise<StatusPublicationReceipt> {
  if (configuration.mode === "disabled_pre_cutover") {
    return receipt(snapshot, attemptedAt, {
      outcome: "disabled",
      attemptCount: 0,
      publicationReference: "",
      reason: "One-way publication is disabled until the verified A010 cutover receipt exists.",
    });
  }
  const binding = configuration.cutoverBinding;
  if (!binding?.verified || !binding.cutoverId.trim() || !binding.cutoverReceiptReference.trim()) {
    return receipt(snapshot, attemptedAt, {
      outcome: "rejected",
      attemptCount: 0,
      publicationReference: "",
      reason: "A verified A010 cutover binding is required.",
    });
  }
  if (snapshot.sourceAuthority !== "castra_post_cutover" || binding.sourceStateRevision !== snapshot.sourceStateRevision) {
    return receipt(snapshot, attemptedAt, {
      outcome: "rejected",
      attemptCount: 0,
      publicationReference: "",
      reason: "The snapshot authority or source revision does not match the verified cutover binding.",
    });
  }
  const ageSeconds = (Date.parse(attemptedAt) - Date.parse(snapshot.generatedAt)) / 1_000;
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > configuration.maximumSnapshotAgeSeconds) {
    return receipt(snapshot, attemptedAt, {
      outcome: "stale",
      attemptCount: 0,
      publicationReference: "",
      reason: "The derived snapshot is outside the configured publication-age boundary.",
    });
  }
  const immutableSnapshot = deepFreeze(structuredClone(snapshot));
  const idempotencyKey = `notion-derived-summary:${binding.cutoverId}:${snapshot.sourceStateRevision}`;
  try {
    const result = await adapter.publish(immutableSnapshot, Object.freeze({
      destination: configuration.destination,
      idempotencyKey,
    }));
    return receipt(snapshot, attemptedAt, {
      outcome: "published",
      attemptCount: 1,
      publicationReference: result.publicationReference,
      reason: "A labelled one-way derived snapshot was published after the authoritative CASTRA state was already committed.",
    });
  } catch {
    return receipt(snapshot, attemptedAt, {
      outcome: "failed",
      attemptCount: 1,
      publicationReference: "",
      reason: "Derived publication failed independently; CASTRA state and authority are unchanged.",
    });
  }
}
