import { findAuthSecretViolations } from "./authentication.js";
import {
  assertNoDuplicateJsonProperties,
  NOTION_EXPORT_CONVERTER_VERSION,
  NOTION_EXPORT_SCHEMA_VERSION,
  NOTION_MIGRATION_PROVENANCE_VERSION,
} from "./initialHostedStateImport.js";
import {
  canonicalHostedJson,
  hostedSha256,
  hostedSha256Bytes,
  hostedStateDocumentDigest,
} from "./hostedOperationalStateDigest.js";
import { refreshOpenWorkProjection } from "./openWork.js";
import type { Action, CastraState, NotionMigrationRecordSource } from "./types.js";

export const POST_HIGH_WATER_RECONCILIATION_CONTRACT_VERSION = "castra-governed-post-high-water-reconciliation/1.0.0" as const;
export const A050_SOURCE_ARTIFACT_DIGEST = "sha256:d4ffe2020691455d210d0099b75162015e01fd2bf664147419d826ca56a50319" as const;
export const A050_PACKAGE_CANONICAL_DIGEST = "sha256:3a355012b25baeef9f62a23c925d366ad3edbd50546fd335d2ad39798b8b5ee9" as const;
export const A040_BASE_STATE_DIGEST = "sha256:d41cb5160cc65c580396cdff0a2eb478efe75e6316ee9f0d4a5f45a6384c3aa6" as const;
export const A040_INITIAL_IMPORT_REQUEST_BINDING = "sha256:d2a6001c194c72f0c0737288913f1473f7b4ba2f6284c3dcda850287ad7f9953" as const;
export const A040_MANIFEST_DIGEST = "sha256:b2bfa4c9f225f9ec7e70fc2a778c8180fce77379fba13803dba5990078972dbf" as const;

const A040_RAW_EXPORT_DIGEST = "sha256:bad74606ed01970e0244ce4e1614144cc1446d3afa7cc7b15b418da3f83056cd";
const A040_CANONICAL_EXPORT_DIGEST = "sha256:3dcf37dc39eac8fc428e8f08cdc35f5c25dbd993d5c066e83d8d4fe620194798";
const A041_FIREWATCH_RECEIPT_DIGEST = "809243509782e011038261cb87afe6cb1ba88f13f4febec2e7dfc85b71eab870";
const A050_SCHEMA_VERSION = "castra-notion-post-high-water-reconciliation/1.0.0";
const A050_PRODUCER = "/root/scribe_a050";
const PARENT_MISSION_CODE = "C001.M013";
const parentMissionUrls = new Set([
  "unavailable-in-public-preview",
]);
const expectedCodes = [
  "C001.M013.A041",
  "C001.M013.A042",
  "C001.M013.A043",
  "C001.M013.A044",
  "C001.M013.A045",
  "C001.M013.A046",
  "C001.M013.A047",
  "C001.M013.A048",
  "C001.M013.A049",
  "C001.M013.A050",
] as const;
const expectedOpenActions = ["C001.M007.A010", "C001.M013.A010", "C001.M013.A019"] as const;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const sourceRecordIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const sourceUrlPattern = /^https:\/\/app\.notion\.com\/p\/[a-f0-9]{32}$/;
const actionRoles = new Set(["CENSOR", "COMMANDER", "FIREWATCH", "FORGE", "OVERWATCH", "QUARTERMASTER", "RECON", "SARGE", "SCRIBE", "SENTRY", "SIGNAL", "VEXILLARIUS"]);
const topLevelKeys = [
  "a041ValueFreeProgress", "actionId", "authority", "campaignId", "capture", "deltaClassification",
  "highWaterBinding", "hostedBaselineBinding", "missionId", "nextGate", "packageCanonicalSha256",
  "producedAt", "producedBy", "reconciliationInstruction", "records", "schemaVersion", "scopeLedger",
] as const;
const recordKeys = [
  "parentMissionCode", "properties", "recordCanonicalSha256", "recordType", "sourceCreatedAt", "sourceLastEditedAt",
  "sourceObservedAt", "sourceRecordId", "sourceRevision", "sourceUrl", "stableCode",
] as const;
const actionPropertyKeys = [
  "Action", "Action Code", "Approval", "Assigned Agent", "Evidence Required", "Execution Mode", "Mission", "Notes", "Objective", "Status",
] as const;

interface A050ActionProperties {
  Action: string;
  "Action Code": string;
  Approval: "Approved";
  "Assigned Agent": string;
  "Evidence Required": string;
  "Execution Mode": "Direct";
  Mission: [string];
  Notes: string;
  Objective: string;
  Status: "Done";
}

interface A050ActionRecord {
  recordType: "action";
  stableCode: string;
  sourceRecordId: string;
  sourceUrl: string;
  sourceCreatedAt: string;
  sourceObservedAt: string;
  sourceLastEditedAt: null;
  sourceRevision: null;
  parentMissionCode: typeof PARENT_MISSION_CODE;
  properties: A050ActionProperties;
  recordCanonicalSha256: string;
}

interface A050Package {
  [key: string]: unknown;
  schemaVersion: typeof A050_SCHEMA_VERSION;
  campaignId: "C001";
  missionId: typeof PARENT_MISSION_CODE;
  actionId: "C001.M013.A050";
  producedAt: string;
  producedBy: typeof A050_PRODUCER;
  authority: "notion_authoritative_pre_cutover";
  capture: Record<string, unknown>;
  highWaterBinding: Record<string, unknown>;
  hostedBaselineBinding: Record<string, unknown>;
  a041ValueFreeProgress: Record<string, unknown>;
  deltaClassification: Record<string, unknown>;
  records: A050ActionRecord[];
  reconciliationInstruction: Record<string, unknown>;
  scopeLedger: Record<string, unknown>;
  nextGate: string;
  packageCanonicalSha256: typeof A050_PACKAGE_CANONICAL_DIGEST;
}

export interface PostHighWaterReconciliationCandidate {
  contractVersion: typeof POST_HIGH_WATER_RECONCILIATION_CONTRACT_VERSION;
  sourceArtifactDigest: typeof A050_SOURCE_ARTIFACT_DIGEST;
  packageCanonicalDigest: typeof A050_PACKAGE_CANONICAL_DIGEST;
  baseStateDigest: typeof A040_BASE_STATE_DIGEST;
  initialImportRequestBinding: typeof A040_INITIAL_IMPORT_REQUEST_BINDING;
  expectedRevision: 1;
  expectedResultingRevision: 2;
  resultingStateDigest: string;
  counts: { campaigns: 1; missions: 14; actions: 124; totalRecords: 139; completedActions: 121 };
  exactOpenActionSet: string[];
  state: CastraState;
  secretMaterialImported: false;
  identityMaterialImported: false;
  baseRecordsReplaced: false;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new Error(`${label} contains missing, extra, or unaccepted fields.`);
  }
}

function exactText(value: unknown, label: string, maximum = 16_000): string {
  if (typeof value !== "string" || !value || value.length > maximum || value.trim() !== value || value.includes("\r")) {
    throw new Error(`${label} is missing or is not exporter-normalized.`);
  }
  return value;
}

function exactArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function exactStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(`${label} must be an explicit string array.`);
  return value as string[];
}

function assertNoPrivateIdentityOrSecretMaterial(value: unknown): void {
  if (findAuthSecretViolations(value, "A050 package").length) throw new Error("A050 package contains prohibited secret material.");
  const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const phonePattern = /\b(?:\+?1[ .-]?)?(?:\([0-9]{3}\)|[0-9]{3})[ .-][0-9]{3}[ .-][0-9]{4}\b/;
  const connectionPattern = /(?:postgres(?:ql)?|mysql|mongodb):\/\/[^\s]+/i;
  const prohibitedKeys = new Set(["email", "emailaddress", "phone", "phonenumber", "username", "account", "accountid", "personid", "privateidentity", "connectionstring", "databaseurl"]);
  const seen = new Set<object>();
  const visit = (candidate: unknown, path: string): void => {
    if (typeof candidate === "string") {
      if (emailPattern.test(candidate) || phonePattern.test(candidate) || connectionPattern.test(candidate)) {
        throw new Error(`A050 package contains private identity or connection material at ${path}.`);
      }
      return;
    }
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) return;
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      candidate.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(candidate as Record<string, unknown>)) {
      if (prohibitedKeys.has(key.replace(/[^a-z0-9]/gi, "").toLowerCase())) {
        throw new Error(`A050 package contains a prohibited private-identity field at ${path}.${key}.`);
      }
      visit(child, `${path}.${key}`);
    }
  };
  visit(value, "A050 package");
}

function validateExactPackageBindings(value: Record<string, unknown>): void {
  exactKeys(value, topLevelKeys, "A050 package");
  if (value.schemaVersion !== A050_SCHEMA_VERSION || value.campaignId !== "C001" || value.missionId !== PARENT_MISSION_CODE
    || value.actionId !== "C001.M013.A050" || value.producedBy !== A050_PRODUCER
    || value.authority !== "notion_authoritative_pre_cutover" || value.packageCanonicalSha256 !== A050_PACKAGE_CANONICAL_DIGEST) {
    throw new Error("A050 package identity, schema, producer, or authority binding differs.");
  }
  exactText(value.producedAt, "A050 package producedAt", 64);
  exactText(value.nextGate, "A050 package nextGate");

  const highWater = objectValue(value.highWaterBinding, "A050 high-water binding");
  if (highWater.manifestDigest !== A040_MANIFEST_DIGEST || highWater.rawExportDigest !== A040_RAW_EXPORT_DIGEST
    || highWater.normalizedStateDigest !== A040_BASE_STATE_DIGEST || highWater.approvedBaseRecordCount !== 129
    || highWater.approvedBaseAltered !== false || highWater.approvedBaseRefetched !== false) {
    throw new Error("A050 package does not bind the exact immutable A040 high-water baseline.");
  }

  const hosted = objectValue(value.hostedBaselineBinding, "A050 hosted baseline binding");
  const hostedCounts = objectValue(hosted.counts, "A050 hosted baseline counts");
  if (hosted.origin !== "https://castra.superlworks.com" || hosted.expectedCurrentRevision !== 1
    || hosted.terminalReason !== "STATE_APPLIED" || hosted.initialImportRequestBinding !== A040_INITIAL_IMPORT_REQUEST_BINDING
    || hostedCounts.campaigns !== 1 || hostedCounts.missions !== 14 || hostedCounts.actions !== 114
    || hostedCounts.totalRecords !== 129 || hostedCounts.completedActions !== 111
    || !exactArray(exactStringArray(hosted.exactOpenActionSet, "A050 hosted open Action set"), expectedOpenActions)) {
    throw new Error("A050 package hosted revision-1 binding differs from the accepted A040 import.");
  }

  const capture = objectValue(value.capture, "A050 capture");
  const range = objectValue(capture.exactStableCodeRange, "A050 capture stable-code range");
  if (capture.returnedRecordCount !== 10 || capture.queryHasMore !== false || capture.baseRecordsRefetched !== 0
    || capture.baseRecordsRevalidated !== 0 || range.first !== expectedCodes[0] || range.last !== expectedCodes.at(-1)
    || !exactArray(exactStringArray(range.orderedCodes, "A050 capture ordered codes"), expectedCodes)) {
    throw new Error("A050 package is not the exact bounded ten-record differential capture.");
  }

  const classification = objectValue(value.deltaClassification, "A050 delta classification");
  if (classification.approvedBaseInferredIntoDelta !== false || classification.pageBodiesIncluded !== false
    || classification.historicalEventsIncluded !== false
    || !exactArray(exactStringArray(classification.terminalRecords, "A050 terminal records"), expectedCodes)
    || exactStringArray(classification.nonTerminalRecords, "A050 non-terminal records").length !== 0) {
    throw new Error("A050 delta classification contains non-terminal, inferred-base, page-body, or history scope.");
  }

  const instruction = objectValue(value.reconciliationInstruction, "A050 reconciliation instruction");
  const result = objectValue(instruction.expectedResultAfterCurrentDelta, "A050 expected result");
  const terminalA041 = objectValue(instruction.terminalA041Replacement, "A050 terminal A041 replacement");
  if (instruction.operation !== "governed_non_empty_post_high_water_delta" || instruction.expectedHostedRevision !== 1
    || instruction.expectedResultingRevisionIfNextWrite !== 2 || instruction.expectedBaseNormalizedStateDigest !== A040_BASE_STATE_DIGEST
    || !exactArray(exactStringArray(instruction.orderedStableCodes, "A050 instruction ordered codes"), expectedCodes)
    || result.campaigns !== 1 || result.missions !== 14 || result.actions !== 124 || result.totalRecords !== 139
    || result.completedActions !== 121 || !exactArray(exactStringArray(result.exactOpenActionSet, "A050 result open Action set"), expectedOpenActions)
    || terminalA041.captured !== true || terminalA041.firewatchReceiptSha256 !== A041_FIREWATCH_RECEIPT_DIGEST
    || terminalA041.retainedOtherDeltaRecordsWithoutRefetch !== 9 || terminalA041.fullRecaptureRequired !== false
    || terminalA041.mergeReviewRequired !== false) {
    throw new Error("A050 reconciliation instruction differs from the approved exact revision-1 to revision-2 operation.");
  }

  const progress = objectValue(value.a041ValueFreeProgress, "A050 A041 progress");
  const firewatch = objectValue(progress.firewatchReceipt, "A050 A041 FIREWATCH receipt");
  if (progress.authenticationChanged !== false || progress.actionStatus !== "Done" || progress.firewatchDisposition !== "Pass"
    || progress.authorityTransferred !== false || firewatch.sha256 !== A041_FIREWATCH_RECEIPT_DIGEST) {
    throw new Error("A050 A041 terminal overlay is not the accepted unchanged-auth FIREWATCH Pass.");
  }

  const scope = objectValue(value.scopeLedger, "A050 scope ledger");
  if (scope.castraHostedStateMutated !== false || scope.supabaseMutated !== false || scope.vercelMutated !== false
    || scope.productionMutated !== false || scope.authenticationChanged !== false || scope.a041Closed !== true
    || scope.a010Executed !== false || scope.authorityTransferred !== false) {
    throw new Error("A050 scope ledger contains an unaccepted prior mutation or authority transfer.");
  }
}

async function parseExactA050Package(rawBytes: Uint8Array): Promise<A050Package> {
  if (rawBytes.byteLength === 0 || rawBytes.byteLength > 256_000) throw new Error("A050 package is empty or exceeds the bounded package size.");
  if (await hostedSha256Bytes(rawBytes) !== A050_SOURCE_ARTIFACT_DIGEST) {
    throw new Error("Selected file is not the exact terminal A050 package artifact.");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
  } catch {
    throw new Error("A050 package is not valid UTF-8.");
  }
  assertNoDuplicateJsonProperties(text, "A050 package");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("A050 package is malformed JSON.");
  } finally {
    text = "";
  }
  const candidate = objectValue(parsed, "A050 package");
  validateExactPackageBindings(candidate);
  assertNoPrivateIdentityOrSecretMaterial(candidate);
  const { packageCanonicalSha256: _, ...canonicalPackage } = candidate;
  if (await hostedSha256(canonicalHostedJson(canonicalPackage)) !== A050_PACKAGE_CANONICAL_DIGEST) {
    throw new Error("A050 package canonical digest does not match the approved terminal binding.");
  }
  return candidate as A050Package;
}

function openActionCodes(state: CastraState): string[] {
  return state.actions.filter((action) => !action.archivedAt && action.status !== "completed").map((action) => action.id).sort();
}

async function assertExactA040Base(state: CastraState, hostedRevision: number): Promise<void> {
  if (hostedRevision !== 1) throw new Error("Post-high-water reconciliation requires exact hosted revision 1.");
  if (await hostedStateDocumentDigest(state) !== A040_BASE_STATE_DIGEST) throw new Error("Hosted state is not the exact approved A040 normalized baseline.");
  if (state.campaigns.length !== 1 || state.missions.length !== 14 || state.actions.length !== 114
    || state.campaigns.length + state.missions.length + state.actions.length !== 129
    || state.actions.filter((action) => action.status === "completed").length !== 111
    || !exactArray(openActionCodes(state), expectedOpenActions)) {
    throw new Error("Hosted state counts or open Action set differ from the exact A040 baseline.");
  }
  if (state.campaigns[0]?.id !== "C001" || state.missions.filter((mission) => mission.id === PARENT_MISSION_CODE && mission.campaignId === "C001").length !== 1) {
    throw new Error("Hosted state does not contain the exact C001/M013 parent closure.");
  }
  const provenance = state.migrationProvenance;
  const base = provenance[0];
  if (provenance.length !== 1 || !base || base.contractVersion !== NOTION_MIGRATION_PROVENANCE_VERSION
    || base.exportSchemaVersion !== NOTION_EXPORT_SCHEMA_VERSION || base.converterVersion !== NOTION_EXPORT_CONVERTER_VERSION
    || base.authority !== "notion_authoritative_pre_cutover" || base.campaignCode !== "C001"
    || base.rawArtifactDigest !== A040_RAW_EXPORT_DIGEST || base.canonicalExportDigest !== A040_CANONICAL_EXPORT_DIGEST
    || base.counts.campaigns !== 1 || base.counts.missions !== 14 || base.counts.actions !== 114 || base.counts.totalRecords !== 129
    || base.recordSources.length !== 129) {
    throw new Error("Hosted state A040 migration provenance differs from the approved baseline.");
  }
  const baseCodes = [...state.campaigns, ...state.missions, ...state.actions].map((record) => record.id).sort();
  const sourceCodes = base.recordSources.map((record) => record.stableCode).sort();
  if (!exactArray(baseCodes, sourceCodes) || new Set(baseCodes).size !== 129) throw new Error("A040 base record provenance is incomplete or duplicated.");
  if (expectedCodes.some((code) => state.actions.some((action) => action.id === code))) {
    throw new Error("One or more A041-A050 Actions already exist outside an exact retained-command replay.");
  }
}

async function validateA050Records(value: A050Package): Promise<A050ActionRecord[]> {
  if (!Array.isArray(value.records) || value.records.length !== expectedCodes.length) throw new Error("A050 package must contain exactly ten records.");
  const records: A050ActionRecord[] = [];
  for (let index = 0; index < value.records.length; index += 1) {
    const recordValue = objectValue(value.records[index], `A050 records[${index}]`);
    exactKeys(recordValue, recordKeys, `A050 records[${index}]`);
    const record = recordValue as unknown as A050ActionRecord;
    const properties = objectValue(record.properties, `A050 records[${index}].properties`);
    exactKeys(properties, actionPropertyKeys, `A050 records[${index}].properties`);
    if (record.recordType !== "action" || record.stableCode !== expectedCodes[index] || record.parentMissionCode !== PARENT_MISSION_CODE
      || !sourceRecordIdPattern.test(record.sourceRecordId) || !sourceUrlPattern.test(record.sourceUrl)
      || record.sourceLastEditedAt !== null || record.sourceRevision !== null || record.properties["Action Code"] !== record.stableCode
      || record.properties.Action !== `${record.stableCode} — ${record.properties.Action.slice(record.stableCode.length + 3)}`
      || record.properties.Approval !== "Approved" || record.properties["Execution Mode"] !== "Direct"
      || record.properties.Status !== "Done" || !actionRoles.has(record.properties["Assigned Agent"].toUpperCase())
      || !Array.isArray(record.properties.Mission) || record.properties.Mission.length !== 1 || !parentMissionUrls.has(record.properties.Mission[0])
      || !digestPattern.test(record.recordCanonicalSha256)) {
      throw new Error(`A050 record ${expectedCodes[index]} has invalid identity, hierarchy, properties, or terminal state.`);
    }
    exactText(record.sourceCreatedAt, `A050 records[${index}].sourceCreatedAt`, 64);
    exactText(record.sourceObservedAt, `A050 records[${index}].sourceObservedAt`, 64);
    exactText(record.properties.Action, `A050 records[${index}].Action`, 500);
    exactText(record.properties.Objective, `A050 records[${index}].Objective`);
    exactText(record.properties.Notes, `A050 records[${index}].Notes`);
    exactText(record.properties["Evidence Required"], `A050 records[${index}].Evidence Required`);
    const { recordCanonicalSha256: _, ...canonicalRecord } = recordValue;
    if (await hostedSha256(canonicalHostedJson(canonicalRecord)) !== record.recordCanonicalSha256) {
      throw new Error(`A050 record ${record.stableCode} canonical digest differs.`);
    }
    records.push(record);
  }
  return records;
}

function assignedRole(value: string): NotionMigrationRecordSource["assignedRole"] {
  return (value.toUpperCase() === "COMMANDER" ? "COMMANDER" : value.toUpperCase()) as NotionMigrationRecordSource["assignedRole"];
}

function deltaRecordSource(record: A050ActionRecord): NotionMigrationRecordSource {
  return {
    stableCode: record.stableCode,
    sourceRecordId: record.sourceRecordId,
    sourceUrl: record.sourceUrl,
    sourceRevision: null,
    sourceCreatedAt: record.sourceCreatedAt,
    sourceLastEditedAt: null,
    sourceObservedAt: record.sourceObservedAt,
    sourceApproval: "approved",
    assignedRole: assignedRole(record.properties["Assigned Agent"]),
    intent: null,
    objective: record.properties.Objective,
    summary: record.properties.Notes,
    evidenceReferences: [{ kind: "digest", reference: record.recordCanonicalSha256 }],
    unresolvedFields: ["sourceLastEditedAt", "sourceRevision"],
    unsupportedFields: ["intent"],
  };
}

function actionFromRecord(record: A050ActionRecord): Action {
  return {
    id: record.stableCode,
    type: "action",
    missionId: PARENT_MISSION_CODE,
    title: record.properties.Action,
    description: record.properties.Objective,
    notes: record.properties.Notes,
    status: "completed",
    revision: 1,
    approval: { approvedAt: record.sourceObservedAt, approvedBy: "Commander", revision: 1 },
    createdAt: record.sourceObservedAt,
    updatedAt: record.sourceObservedAt,
    archivedAt: null,
    actionKind: "standard",
    operationalContext: {
      owner: record.properties["Assigned Agent"],
      blocker: "",
      nextGate: "",
      evidenceReference: record.recordCanonicalSha256,
      attentionState: "normal",
    },
    followUpToActionId: null,
  };
}

function assertExpectedResult(state: CastraState): void {
  if (state.campaigns.length !== 1 || state.missions.length !== 14 || state.actions.length !== 124
    || state.campaigns.length + state.missions.length + state.actions.length !== 139
    || state.actions.filter((action) => action.status === "completed").length !== 121
    || !exactArray(openActionCodes(state), expectedOpenActions)) {
    throw new Error("A050 reconciliation candidate does not produce the exact approved revision-2 counts and open Action set.");
  }
  const delta = state.migrationProvenance.at(-1);
  if (!delta || delta.rawArtifactDigest !== A050_SOURCE_ARTIFACT_DIGEST || delta.canonicalExportDigest !== A050_PACKAGE_CANONICAL_DIGEST
    || delta.recordSources.length !== 10 || !exactArray(delta.recordSources.map((record) => record.stableCode), expectedCodes)) {
    throw new Error("A050 reconciliation candidate does not retain the exact package and ordered record provenance.");
  }
}

export async function buildPostHighWaterReconciliationCandidate(input: {
  rawPackageBytes: Uint8Array;
  currentState: CastraState;
  hostedRevision: number;
}): Promise<PostHighWaterReconciliationCandidate> {
  await assertExactA040Base(input.currentState, input.hostedRevision);
  const source = await parseExactA050Package(input.rawPackageBytes);
  const records = await validateA050Records(source);
  const actions = records.map(actionFromRecord);
  const next = refreshOpenWorkProjection({
    ...input.currentState,
    migrationProvenance: [...input.currentState.migrationProvenance, {
      contractVersion: NOTION_MIGRATION_PROVENANCE_VERSION,
      exportSchemaVersion: NOTION_EXPORT_SCHEMA_VERSION,
      converterVersion: NOTION_EXPORT_CONVERTER_VERSION,
      authority: "notion_authoritative_pre_cutover",
      campaignCode: "C001",
      captureId: `notion-post-high-water:${expectedCodes[0]}-${expectedCodes.at(-1)}`,
      sourceRevision: `notion-post-hwm:${A050_PACKAGE_CANONICAL_DIGEST}`,
      sourceTime: source.producedAt,
      rawArtifactDigest: A050_SOURCE_ARTIFACT_DIGEST,
      canonicalExportDigest: A050_PACKAGE_CANONICAL_DIGEST,
      counts: { campaigns: 1, missions: 14, actions: 124, totalRecords: 139 },
      timestampSemantics: "baseline_observation_not_historical_lifecycle",
      limitations: [
        "This entry is the exact A041-A050 post-high-water differential; counts describe the resulting state while recordSources enumerate only the ten appended Actions.",
        "All 129 approved A040 base records and their original migration provenance remain unchanged.",
        "Notion remains operational authority until a verified C001.M013.A010 cutover receipt exists.",
      ],
      recordSources: records.map(deltaRecordSource),
    }],
    actions: [...input.currentState.actions, ...actions],
  });
  assertExpectedResult(next);
  assertNoPrivateIdentityOrSecretMaterial(next.migrationProvenance.at(-1));
  return {
    contractVersion: POST_HIGH_WATER_RECONCILIATION_CONTRACT_VERSION,
    sourceArtifactDigest: A050_SOURCE_ARTIFACT_DIGEST,
    packageCanonicalDigest: A050_PACKAGE_CANONICAL_DIGEST,
    baseStateDigest: A040_BASE_STATE_DIGEST,
    initialImportRequestBinding: A040_INITIAL_IMPORT_REQUEST_BINDING,
    expectedRevision: 1,
    expectedResultingRevision: 2,
    resultingStateDigest: await hostedStateDocumentDigest(next),
    counts: { campaigns: 1, missions: 14, actions: 124, totalRecords: 139, completedActions: 121 },
    exactOpenActionSet: [...expectedOpenActions],
    state: next,
    secretMaterialImported: false,
    identityMaterialImported: false,
    baseRecordsReplaced: false,
  };
}

export function postHighWaterReconciliationControlVisible(input: {
  mode: string;
  availability: string;
  pendingCommand: boolean;
  revision: number;
  receipt: { allowed?: boolean; status?: string } | null;
}): boolean {
  return input.mode === "authenticated_live"
    && input.receipt?.allowed === true
    && input.receipt.status === "authenticated"
    && input.availability === "loaded"
    && input.revision === 1
    && !input.pendingCommand;
}
