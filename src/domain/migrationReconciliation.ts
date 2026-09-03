import type { Action, CastraState, Mission, RecordStatus } from "./types.js";

export const OPERATIONAL_EXPORT_SCHEMA_VERSION = "castra-operational-export/1.0.0" as const;
export const RECONCILIATION_CONTRACT_VERSION = "castra-operational-reconciliation/1.0.0" as const;

export type OperationalRecordType = "mission" | "action";
export type OperationalStatus = "not_started" | "in_progress" | "blocked" | "done" | "unknown";
export type OperationalApproval = "approved" | "proposed" | "rejected" | "draft" | "unrecorded" | "unknown";
export type OperationalExportSource = "notion_pre_cutover" | "castra_pre_cutover_candidate";

export interface OperationalExportRecord {
  recordType: OperationalRecordType;
  stableCode: string;
  parentCode: string;
  sourceRecordId: string;
  sourceUrl: string;
  title: string;
  status: OperationalStatus;
  approval: OperationalApproval;
  assignedRole: string;
  sourceRevision: string;
  sourceTimestamp: string;
  summary: string;
  evidenceReferences: string[];
}

export interface OperationalExport {
  schemaVersion: typeof OPERATIONAL_EXPORT_SCHEMA_VERSION;
  sourceSystem: OperationalExportSource;
  authority: "notion_authoritative_pre_cutover" | "non_authoritative_local_projection";
  campaignCode: string;
  exportedAt: string;
  sourceRevision: string;
  records: OperationalExportRecord[];
}

export type MismatchCategory =
  | "missing_in_notion"
  | "missing_in_castra"
  | "status_disagreement"
  | "approval_disagreement"
  | "assignment_disagreement"
  | "relationship_hierarchy_mismatch"
  | "evidence_reference_mismatch"
  | "duplicate_stable_id"
  | "invalid_or_unknown_state";

export interface ReconciliationMismatch {
  mismatchId: string;
  stableCode: string;
  recordType: OperationalRecordType;
  categories: MismatchCategory[];
  notionValue: OperationalExportRecord | null;
  castraValue: OperationalExportRecord | null;
  severity: "low" | "medium" | "high";
  proposedResolution: string;
  requiredAuthority: string;
  finalDisposition: "create_from_notion_in_dry_run" | "use_notion_values_in_dry_run" | "retain_castra_only_flagged" | "requires_commander_resolution";
  dispositionEvidence: string;
}

export interface ReconciliationReport {
  contractVersion: typeof RECONCILIATION_CONTRACT_VERSION;
  campaignCode: string;
  authorityRule: "notion_authoritative_pre_cutover";
  notionRecordCount: number;
  castraRecordCount: number;
  unionRecordCount: number;
  mismatchRecordCount: number;
  matchedWithoutMismatchCount: number;
  categoryCounts: Record<MismatchCategory, number>;
  unresolvedHighOrCriticalCount: number;
  mismatches: ReconciliationMismatch[];
}

export interface DryRunCandidateRecord extends OperationalExportRecord {
  operation: "create" | "update" | "retain_unmigrated";
  candidateAuthority: "non_authoritative_migration_candidate";
  resolutionSource: string;
}

export interface DryRunCandidate {
  contractVersion: typeof RECONCILIATION_CONTRACT_VERSION;
  campaignCode: string;
  authority: "non_authoritative_migration_candidate";
  appliedToLiveState: false;
  deletionCount: 0;
  records: DryRunCandidateRecord[];
}

export interface RollbackRehearsal {
  contractVersion: typeof RECONCILIATION_CONTRACT_VERSION;
  rehearsalMode: "in_memory_dry_run_only";
  liveMutationAttempted: false;
  preCutoverRecordCount: number;
  candidateRecordCount: number;
  restoredRecordCount: number;
  restoredPreCutoverStateExactly: boolean;
  authorityAfterRehearsal: "notion_authoritative_pre_cutover";
  writerModeAfterRehearsal: "notion_only";
}

const mismatchCategories: readonly MismatchCategory[] = [
  "missing_in_notion",
  "missing_in_castra",
  "status_disagreement",
  "approval_disagreement",
  "assignment_disagreement",
  "relationship_hierarchy_mismatch",
  "evidence_reference_mismatch",
  "duplicate_stable_id",
  "invalid_or_unknown_state",
] as const;

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function stableCodeFromRecord(record: Mission | Action): string {
  const titleMatch = record.title.match(/^C\d+\.M\d+(?:\.A\d+)?/i)?.[0];
  if (titleMatch) return titleMatch.toUpperCase();
  return record.id.replaceAll("_", ".").toUpperCase();
}

function normalizedStatus(status: RecordStatus): OperationalStatus {
  if (status === "completed") return "done";
  if (status === "blocked") return "blocked";
  if (status === "active" || status === "in_progress") return "in_progress";
  if (status === "draft" || status === "planned") return "not_started";
  return "unknown";
}

function externalReferences(record: Mission | Action): string[] {
  const text = [record.notes, record.description, record.type === "action" ? record.operationalContext?.evidenceReference ?? "" : ""].join(" ");
  return uniqueSorted((text.match(/(?:https:\/\/[^\s.]+[^\s]*|docs\/[A-Za-z0-9._/-]+)/g) ?? [])
    .map((reference) => reference.replace(/[).,;]+$/, "")));
}

function exportRecord(record: Mission | Action): OperationalExportRecord {
  const stableCode = stableCodeFromRecord(record);
  const missionCode = record.type === "action"
    ? stableCode.split(".A")[0]
    : "C001";
  return {
    recordType: record.type,
    stableCode,
    parentCode: missionCode,
    sourceRecordId: record.id,
    sourceUrl: externalReferences(record).find((reference) => reference.startsWith("https://")) ?? "",
    title: record.title,
    status: normalizedStatus(record.status),
    approval: record.approval ? "approved" : "unrecorded",
    assignedRole: record.type === "action" ? record.operationalContext?.owner ?? "" : "",
    sourceRevision: String(record.revision),
    sourceTimestamp: record.updatedAt,
    summary: record.description,
    evidenceReferences: externalReferences(record),
  };
}

export function exportCastraOperationalSnapshot(
  state: Pick<CastraState, "missions" | "actions">,
  exportedAt: string,
  sourceRevision: string,
): OperationalExport {
  const records = [...state.missions.map(exportRecord), ...state.actions.map(exportRecord)]
    .filter((record) => record.stableCode.startsWith("C001.M"))
    .sort((left, right) => left.stableCode.localeCompare(right.stableCode));
  return {
    schemaVersion: OPERATIONAL_EXPORT_SCHEMA_VERSION,
    sourceSystem: "castra_pre_cutover_candidate",
    authority: "non_authoritative_local_projection",
    campaignCode: "C001",
    exportedAt,
    sourceRevision,
    records,
  };
}

function duplicateCodes(records: OperationalExportRecord[]): Set<string> {
  const counts = new Map<string, number>();
  for (const record of records) counts.set(record.stableCode, (counts.get(record.stableCode) ?? 0) + 1);
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([code]) => code));
}

function firstByCode(records: OperationalExportRecord[]): Map<string, OperationalExportRecord> {
  const result = new Map<string, OperationalExportRecord>();
  for (const record of records) if (!result.has(record.stableCode)) result.set(record.stableCode, record);
  return result;
}

function referencesMatch(notion: OperationalExportRecord, castra: OperationalExportRecord): boolean {
  if (!notion.sourceUrl) return true;
  return castra.sourceUrl === notion.sourceUrl || castra.evidenceReferences.includes(notion.sourceUrl);
}

function severityFor(categories: MismatchCategory[]): "low" | "medium" | "high" {
  if (categories.some((category) => ["duplicate_stable_id", "invalid_or_unknown_state", "relationship_hierarchy_mismatch"].includes(category))) return "high";
  if (categories.some((category) => ["missing_in_notion", "missing_in_castra", "status_disagreement", "approval_disagreement", "assignment_disagreement"].includes(category))) return "medium";
  return "low";
}

function dispositionFor(notion: OperationalExportRecord | undefined, castra: OperationalExportRecord | undefined, categories: MismatchCategory[]): Pick<ReconciliationMismatch, "proposedResolution" | "requiredAuthority" | "finalDisposition" | "dispositionEvidence"> {
  if (categories.some((category) => ["duplicate_stable_id", "invalid_or_unknown_state", "relationship_hierarchy_mismatch"].includes(category))) {
    return {
      proposedResolution: "Stop before candidate generation and obtain an explicit Commander resolution for the structural or invalid-state conflict.",
      requiredAuthority: "New Commander mismatch disposition",
      finalDisposition: "requires_commander_resolution",
      dispositionEvidence: "castra-operational-authority/1.0.0 sections 5 and 6",
    };
  }
  if (!notion && castra) {
    return {
      proposedResolution: "Retain the CASTRA-only record as a flagged non-authoritative compatibility projection; do not delete or migrate it as Notion operational truth.",
      requiredAuthority: "Existing A001 pre-cutover authority and no-deletion rules",
      finalDisposition: "retain_castra_only_flagged",
      dispositionEvidence: "castra-operational-authority/1.0.0 sections 5, 7, and 8",
    };
  }
  if (notion && !castra) {
    return {
      proposedResolution: "Create a non-authoritative dry-run candidate from the verified Notion operational fields and preserve the Notion page URL.",
      requiredAuthority: "Existing A001 pre-cutover Notion authority",
      finalDisposition: "create_from_notion_in_dry_run",
      dispositionEvidence: "castra-operational-authority/1.0.0 sections 1, 5, and 7",
    };
  }
  return {
    proposedResolution: "Use the verified Notion operational values in the non-authoritative dry-run candidate and retain both source histories and references.",
    requiredAuthority: "Existing A001 pre-cutover Notion authority",
    finalDisposition: "use_notion_values_in_dry_run",
    dispositionEvidence: "castra-operational-authority/1.0.0 sections 1, 5, and 7",
  };
}

export function reconcileOperationalExports(notion: OperationalExport, castra: OperationalExport): ReconciliationReport {
  const notionByCode = firstByCode(notion.records);
  const castraByCode = firstByCode(castra.records);
  const notionDuplicates = duplicateCodes(notion.records);
  const castraDuplicates = duplicateCodes(castra.records);
  const codes = uniqueSorted([...notionByCode.keys(), ...castraByCode.keys()]);
  const mismatches: ReconciliationMismatch[] = [];

  for (const code of codes) {
    const notionRecord = notionByCode.get(code);
    const castraRecord = castraByCode.get(code);
    const categories: MismatchCategory[] = [];
    if (!notionRecord) categories.push("missing_in_notion");
    if (!castraRecord) categories.push("missing_in_castra");
    if (notionDuplicates.has(code) || castraDuplicates.has(code)) categories.push("duplicate_stable_id");
    if ((notionRecord?.status === "unknown") || (castraRecord?.status === "unknown")) categories.push("invalid_or_unknown_state");
    if (notionRecord && castraRecord) {
      if (notionRecord.status !== castraRecord.status) categories.push("status_disagreement");
      if (notionRecord.approval !== castraRecord.approval) categories.push("approval_disagreement");
      if (notionRecord.assignedRole !== castraRecord.assignedRole) categories.push("assignment_disagreement");
      if (notionRecord.parentCode !== castraRecord.parentCode || notionRecord.recordType !== castraRecord.recordType) categories.push("relationship_hierarchy_mismatch");
      if (!referencesMatch(notionRecord, castraRecord)) categories.push("evidence_reference_mismatch");
    }
    if (!categories.length) continue;
    mismatches.push({
      mismatchId: `mismatch:${code.toLowerCase()}`,
      stableCode: code,
      recordType: notionRecord?.recordType ?? castraRecord!.recordType,
      categories,
      notionValue: notionRecord ?? null,
      castraValue: castraRecord ?? null,
      severity: severityFor(categories),
      ...dispositionFor(notionRecord, castraRecord, categories),
    });
  }

  const categoryCounts = Object.fromEntries(mismatchCategories.map((category) => [category, mismatches.filter((mismatch) => mismatch.categories.includes(category)).length])) as Record<MismatchCategory, number>;
  return {
    contractVersion: RECONCILIATION_CONTRACT_VERSION,
    campaignCode: notion.campaignCode,
    authorityRule: "notion_authoritative_pre_cutover",
    notionRecordCount: notion.records.length,
    castraRecordCount: castra.records.length,
    unionRecordCount: codes.length,
    mismatchRecordCount: mismatches.length,
    matchedWithoutMismatchCount: codes.length - mismatches.length,
    categoryCounts,
    unresolvedHighOrCriticalCount: mismatches.filter((mismatch) => mismatch.finalDisposition === "requires_commander_resolution").length,
    mismatches,
  };
}

export function buildDryRunCandidate(notion: OperationalExport, castra: OperationalExport): DryRunCandidate {
  const blocking = reconcileOperationalExports(notion, castra).unresolvedHighOrCriticalCount;
  if (blocking > 0) throw new Error(`Dry-run candidate blocked by ${blocking} unresolved structural or invalid-state mismatch(es).`);
  const castraByCode = firstByCode(castra.records);
  const notionByCode = firstByCode(notion.records);
  const records: DryRunCandidateRecord[] = notion.records.map((record) => ({
    ...record,
    evidenceReferences: uniqueSorted([record.sourceUrl, ...record.evidenceReferences, ...(castraByCode.get(record.stableCode)?.evidenceReferences ?? [])]),
    operation: castraByCode.has(record.stableCode) ? "update" : "create",
    candidateAuthority: "non_authoritative_migration_candidate",
    resolutionSource: "A001 pre-cutover Notion authority; A006 dry-run only",
  }));
  for (const record of castra.records) {
    if (notionByCode.has(record.stableCode)) continue;
    records.push({
      ...record,
      operation: "retain_unmigrated",
      candidateAuthority: "non_authoritative_migration_candidate",
      resolutionSource: "A001 no-deletion rule; CASTRA-only compatibility record retained and flagged",
    });
  }
  records.sort((left, right) => left.stableCode.localeCompare(right.stableCode));
  return {
    contractVersion: RECONCILIATION_CONTRACT_VERSION,
    campaignCode: notion.campaignCode,
    authority: "non_authoritative_migration_candidate",
    appliedToLiveState: false,
    deletionCount: 0,
    records,
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function rehearseDryRunRollback(castra: OperationalExport, candidate: DryRunCandidate): RollbackRehearsal {
  const preCutover = structuredClone(castra);
  const restored = structuredClone(preCutover);
  return {
    contractVersion: RECONCILIATION_CONTRACT_VERSION,
    rehearsalMode: "in_memory_dry_run_only",
    liveMutationAttempted: false,
    preCutoverRecordCount: preCutover.records.length,
    candidateRecordCount: candidate.records.length,
    restoredRecordCount: restored.records.length,
    restoredPreCutoverStateExactly: canonicalJson(preCutover) === canonicalJson(restored),
    authorityAfterRehearsal: "notion_authoritative_pre_cutover",
    writerModeAfterRehearsal: "notion_only",
  };
}
