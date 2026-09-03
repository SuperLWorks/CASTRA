import { findAuthSecretViolations } from "./authentication.js";
import { emptyState } from "./commands.js";
import { deploymentEligibilityTemplate } from "./deploymentEligibility.js";
import {
  canonicalHostedJson,
  hostedSha256,
  hostedSha256Bytes,
  hostedStateDocumentDigest,
} from "./hostedOperationalStateDigest.js";
import {
  INITIAL_IMPORT_CONTRACT_VERSION,
  INITIAL_IMPORT_IDEMPOTENCY_PREFIX,
  LEGACY_A020_FIXTURE,
  MANDATORY_MIGRATION_LIMITATIONS,
  NOTION_EXPORT_CONVERTER_VERSION,
  NOTION_EXPORT_SCHEMA_VERSION,
  NOTION_HIGH_WATER_MANIFEST_VERSION,
  NOTION_MIGRATION_PROVENANCE_VERSION,
} from "./initialHostedStateImportContract.js";
import { refreshOpenWorkProjection } from "./openWork.js";
import type {
  Action,
  Approval,
  Campaign,
  CastraState,
  Mission,
  NotionMigrationEvidenceReference,
  NotionMigrationRecordSource,
  RecordStatus,
} from "./types.js";

export * from "./initialHostedStateImportContract.js";

interface InitialImportBrowserAuthReceipt {
  allowed: boolean;
  status: string;
  identityReference: string | null;
  authorities: string[];
  stepUpEvidence?: {
    sensitiveAction: string;
    scopeBindingDigest?: string | null;
    verifiedAt: string;
    validUntil: string;
    policy: string;
    protectedMutationPerformed: false;
    credentialRetained: false;
  } | null;
  evidence: {
    requestReference: string;
    providerReceiptReference: string;
    configurationVersion: string;
    secretMaterialStored: false;
  };
}

interface PreparedInitialImportReviewCommand {
  commandType: "initial_import";
  expectedRevision: 0;
  stateSchemaVersion: 13;
  idempotencyKey: string;
  requestBindingDigest: string;
  stateDigest: string;
  stateDocument: CastraState;
  manifestDigest: string;
}

const exportKeys = ["authority", "campaignCode", "capture", "limitations", "records", "schemaVersion", "sourceSystem"] as const;
const captureKeys = ["captureId", "completedAt", "exporterVersion", "sourceRevision", "startedAt"] as const;
const recordKeys = [
  "approval", "assignedRole", "evidenceReferences", "intent", "objective", "parentCode", "recordType",
  "sourceCreatedAt", "sourceLastEditedAt", "sourceObservedAt", "sourceRecordId", "sourceRevision", "sourceUrl",
  "stableCode", "status", "summary", "title", "unresolvedFields", "unsupportedFields",
] as const;
const evidenceKeys = ["kind", "reference"] as const;
const manifestKeys = [
  "approvalRequirement", "authority", "campaignCode", "converterVersion", "counts", "digests", "exportSchemaVersion",
  "limitations", "manifestVersion", "normalization", "openActionCodes", "source", "stateSchemaVersion",
] as const;
const manifestSourceKeys = ["captureId", "revision", "time"] as const;
const manifestDigestKeys = ["canonicalExport", "normalizedState", "rawArtifact"] as const;
const manifestCountKeys = ["actions", "campaigns", "missions", "totalRecords"] as const;
const normalizationKeys = [
  "canonicalJson", "digestAlgorithm", "rawArtifactBytes", "rawBom", "rawEncoding", "rawLineEndings", "rawTerminalNewline",
] as const;
const approvalRequirementKeys = ["authority", "decision", "scope"] as const;
const statusValues = ["not_started", "in_progress", "blocked", "done"] as const;
const approvalValues = ["approved", "proposed", "rejected", "draft", "unrecorded"] as const;
const roleValues = ["CENSOR", "COMMANDER", "FIREWATCH", "FORGE", "OVERWATCH", "QUARTERMASTER", "RECON", "SARGE", "SCRIBE", "SENTRY", "SIGNAL", "VEXILLARIUS"] as const;
const nullableFieldNames = ["assignedRole", "intent", "objective", "sourceCreatedAt", "sourceLastEditedAt", "sourceRevision", "summary"] as const;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const campaignCodePattern = /^C[0-9]{3}$/;
const missionCodePattern = /^C[0-9]{3}\.M[0-9]{3}$/;
const actionCodePattern = /^C[0-9]{3}\.M[0-9]{3}\.A[0-9]{3}$/;
const notionIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const notionUrlPattern = /^https:\/\/app\.notion\.com\/p\/[a-f0-9]{32}$/;
const captureIdPattern = /^notion-capture:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const exporterVersionPattern = /^castra-notion-exporter\/[0-9]+\.[0-9]+\.[0-9]+$/;
const rfc3339Pattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$/;

type NotionOperationalStatus = typeof statusValues[number];
type NotionOperationalApproval = typeof approvalValues[number];
type NotionOperationalRole = typeof roleValues[number];
type NullableFieldName = typeof nullableFieldNames[number];

export interface NotionOperationalCapture {
  captureId: string;
  sourceRevision: string;
  startedAt: string;
  completedAt: string;
  exporterVersion: string;
}

export interface NotionOperationalRecord {
  recordType: "campaign" | "mission" | "action";
  stableCode: string;
  parentCode: string | null;
  sourceRecordId: string;
  sourceUrl: string;
  title: string;
  intent: string | null;
  objective: string | null;
  status: NotionOperationalStatus;
  approval: NotionOperationalApproval;
  assignedRole: NotionOperationalRole | null;
  sourceRevision: string | null;
  sourceCreatedAt: string | null;
  sourceLastEditedAt: string | null;
  sourceObservedAt: string;
  summary: string | null;
  evidenceReferences: NotionMigrationEvidenceReference[];
  unresolvedFields: NullableFieldName[];
  unsupportedFields: NullableFieldName[];
}

export interface NotionOperationalExport {
  schemaVersion: typeof NOTION_EXPORT_SCHEMA_VERSION;
  sourceSystem: "notion_pre_cutover";
  authority: "notion_authoritative_pre_cutover";
  campaignCode: string;
  capture: NotionOperationalCapture;
  records: NotionOperationalRecord[];
  limitations: string[];
}

export interface NotionHighWaterManifest {
  manifestVersion: typeof NOTION_HIGH_WATER_MANIFEST_VERSION;
  exportSchemaVersion: typeof NOTION_EXPORT_SCHEMA_VERSION;
  converterVersion: typeof NOTION_EXPORT_CONVERTER_VERSION;
  stateSchemaVersion: 13;
  authority: "notion_authoritative_pre_cutover";
  campaignCode: string;
  source: { captureId: string; revision: string; time: string };
  digests: { rawArtifact: string; canonicalExport: string; normalizedState: string };
  counts: { campaigns: 1; missions: number; actions: number; totalRecords: number };
  openActionCodes: string[];
  normalization: {
    rawEncoding: "UTF-8";
    rawBom: false;
    rawLineEndings: "LF";
    rawTerminalNewline: true;
    canonicalJson: "RFC8785-JCS";
    digestAlgorithm: "SHA-256";
    rawArtifactBytes: number;
  };
  approvalRequirement: {
    authority: "Commander";
    decision: "approve_exact_manifest_digest";
    scope: "one_import_or_cutover_attempt";
  };
  limitations: string[];
}

export interface InitialImportCandidate {
  contractVersion: typeof INITIAL_IMPORT_CONTRACT_VERSION;
  converterVersion: typeof NOTION_EXPORT_CONVERTER_VERSION;
  rawExportBase64: string;
  manifest: NotionHighWaterManifest;
  manifestDigest: string;
  sourceArtifactDigest: string;
  exportDigest: string;
  sourceRevision: string;
  counts: NotionHighWaterManifest["counts"];
  normalizedStateDigest: string;
  state: CastraState;
  identityMaterialImported: false;
  secretMaterialImported: false;
  localOrBundledStateRead: false;
}

export interface InitialImportAuthorityEvidence {
  contractVersion: typeof INITIAL_IMPORT_CONTRACT_VERSION;
  receiptDigest: string;
  status: "authenticated";
  commanderAuthorityBound: true;
  productOwnerAuthorityBound: true;
  manifestDigest: string | null;
  exactManifestStepUpBound: boolean;
  identityReferenceIncluded: false;
  secretMaterialStored: false;
}

export interface InitialImportReviewEvidence {
  contractVersion: typeof INITIAL_IMPORT_CONTRACT_VERSION;
  converterVersion: typeof NOTION_EXPORT_CONVERTER_VERSION;
  manifestDigest: string;
  sourceArtifactDigest: string;
  exportDigest: string;
  sourceRevision: string;
  counts: NotionHighWaterManifest["counts"];
  normalizedStateDigest: string;
  expectedRevision: 0;
  idempotencyKey: string;
  requestBindingDigest: string;
  authorityReceiptDigest: string;
  terminalProviderReceipt: "pending_confirmation";
  importedAuthority: "notion_authoritative_pre_cutover";
  authorityAfterImport: "notion_pre_cutover";
  identityReferenceIncluded: false;
  secretMaterialStored: false;
  localOrBundledStateRead: false;
}

export interface LegacyA020FixtureAudit {
  rawArtifactDigest: typeof LEGACY_A020_FIXTURE.rawArtifactDigest;
  byteCount: typeof LEGACY_A020_FIXTURE.byteCount;
  schemaVersion: typeof LEGACY_A020_FIXTURE.schemaVersion;
  records: typeof LEGACY_A020_FIXTURE.records;
  missions: typeof LEGACY_A020_FIXTURE.missions;
  actions: typeof LEGACY_A020_FIXTURE.actions;
  runtimeImportApproved: false;
}

interface ExportAnalysis {
  source: NotionOperationalExport;
  rawExportBase64: string;
  rawArtifactDigest: string;
  canonicalExportDigest: string;
  counts: NotionHighWaterManifest["counts"];
  openActionCodes: string[];
  state: CastraState;
  normalizedStateDigest: string;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new Error(`${label} contains missing, duplicate, or unaccepted fields.`);
  }
}

function assertValidUnicode(value: string, label: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error(`${label} contains invalid Unicode.`);
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error(`${label} contains invalid Unicode.`);
    }
  }
}

function exactText(value: unknown, label: string, maximum = 12_000): string {
  if (typeof value !== "string" || !value || value.length > maximum) throw new Error(`${label} is missing or invalid.`);
  assertValidUnicode(value, label);
  if (value.trim() !== value || value.normalize("NFC") !== value || value.includes("\r")) {
    throw new Error(`${label} is not exporter-normalized.`);
  }
  return value;
}

function nullableText(value: unknown, label: string, maximum = 12_000): string | null {
  return value === null ? null : exactText(value, label, maximum);
}

function exactStringArray(value: unknown, label: string, options: { nonEmpty?: boolean; allowed?: readonly string[] } = {}): string[] {
  if (!Array.isArray(value) || (options.nonEmpty && value.length === 0)) throw new Error(`${label} must be an explicit array.`);
  const result = value.map((entry, index) => exactText(entry, `${label}[${index}]`));
  if (options.allowed && result.some((entry) => !options.allowed!.includes(entry))) throw new Error(`${label} contains an unaccepted value.`);
  if (result.some((entry, index) => index > 0 && ordinalCompare(result[index - 1], entry) >= 0)) {
    throw new Error(`${label} must be unique and in strict ordinal order.`);
  }
  return result;
}

function ordinalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactDateTime(value: unknown, label: string): string {
  const result = exactText(value, label, 64);
  if (!rfc3339Pattern.test(result) || !Number.isFinite(Date.parse(result))) throw new Error(`${label} is not RFC 3339 date-time.`);
  return result;
}

function nullableDateTime(value: unknown, label: string): string | null {
  return value === null ? null : exactDateTime(value, label);
}

function exactDigest(value: unknown, label: string): string {
  const result = exactText(value, label, 71);
  if (!digestPattern.test(result)) throw new Error(`${label} is not a lowercase SHA-256 digest.`);
  return result;
}

function exactInteger(value: unknown, label: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error(`${label} is not an accepted integer.`);
  return Number(value);
}

function safeEvidenceReference(value: unknown, label: string): NotionMigrationEvidenceReference {
  const candidate = objectValue(value, label);
  exactKeys(candidate, evidenceKeys, label);
  const kind = exactText(candidate.kind, `${label}.kind`, 32);
  const reference = exactText(candidate.reference, `${label}.reference`, 2048);
  if (kind === "notion_page") {
    if (!notionUrlPattern.test(reference)) throw new Error(`${label} is not a canonical Notion page reference.`);
  } else if (kind === "repository_path") {
    if (!/^docs\/[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/.test(reference)
      || reference.includes("\\")
      || reference.split("/").some((segment) => segment === "." || segment === ".." || !segment)) {
      throw new Error(`${label} contains an unsafe repository path.`);
    }
  } else if (kind === "https_url") {
    if (!/^https:\/\/[^\s/?#]+(?:\/[^\s?#]*)?$/.test(reference)) throw new Error(`${label} is not a safe HTTPS reference.`);
    const url = new URL(reference);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || reference.includes("\\")) {
      throw new Error(`${label} contains user-info, query, fragment, or unsafe URL syntax.`);
    }
  } else if (kind === "digest") {
    if (!digestPattern.test(reference)) throw new Error(`${label} is not a SHA-256 evidence digest.`);
  } else {
    throw new Error(`${label} has an unaccepted reference kind.`);
  }
  return { kind: kind as NotionMigrationEvidenceReference["kind"], reference };
}

function evidenceArray(value: unknown, label: string): NotionMigrationEvidenceReference[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an explicit array.`);
  const result = value.map((entry, index) => safeEvidenceReference(entry, `${label}[${index}]`));
  const keys = result.map((entry) => `${entry.kind}\u0000${entry.reference}`);
  if (keys.some((entry, index) => index > 0 && ordinalCompare(keys[index - 1], entry) >= 0)) {
    throw new Error(`${label} must be unique and strictly ordered by kind then reference.`);
  }
  return result;
}

function assertMigrationSafe(value: unknown, label: string): void {
  const secretViolations = findAuthSecretViolations(value, label);
  if (secretViolations.length) throw new Error(`${label} contains prohibited secret material.`);
  const prohibitedKeys = new Set(["email", "emailaddress", "phone", "phonenumber", "username", "account", "accountid", "personid", "privateidentity", "connectionstring", "databaseurl"]);
  const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const phonePattern = /\b(?:\+?1[ .-]?)?(?:\([0-9]{3}\)|[0-9]{3})[ .-][0-9]{3}[ .-][0-9]{4}\b/;
  const pemPattern = /-----BEGIN [A-Z0-9 ]*(?:PRIVATE KEY|CERTIFICATE)-----/;
  const seen = new Set<object>();
  const visit = (candidate: unknown, path: string): void => {
    if (typeof candidate === "string") {
      if (emailPattern.test(candidate) || phonePattern.test(candidate) || pemPattern.test(candidate) || /(?:postgres(?:ql)?|mysql|mongodb):\/\/[^\s]+/i.test(candidate)) {
        throw new Error(`${label} contains private identity, key, or connection material at ${path}.`);
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
      const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (prohibitedKeys.has(normalized)) throw new Error(`${label} contains a prohibited private-identity/provider field at ${path}.${key}.`);
      visit(child, `${path}.${key}`);
    }
  };
  visit(value, label);
}

function validateNullDispositions(record: NotionOperationalRecord, label: string): void {
  const unresolved = new Set(record.unresolvedFields);
  const unsupported = new Set(record.unsupportedFields);
  const expectedUnsupported = record.recordType === "campaign"
    ? new Set<NullableFieldName>(["assignedRole", "objective"])
    : record.recordType === "mission"
      ? new Set<NullableFieldName>(["assignedRole", "intent"])
      : new Set<NullableFieldName>(["intent"]);
  for (const field of nullableFieldNames) {
    const value = record[field];
    const isUnsupported = expectedUnsupported.has(field);
    if (isUnsupported && (value !== null || !unsupported.has(field) || unresolved.has(field))) {
      throw new Error(`${label}.${field} must be null and classified only as unsupported.`);
    }
    if (!isUnsupported && value === null && (!unresolved.has(field) || unsupported.has(field))) {
      throw new Error(`${label}.${field} must be classified only as unresolved when null.`);
    }
    if (value !== null && (unresolved.has(field) || unsupported.has(field))) {
      throw new Error(`${label}.${field} is non-null and cannot be classified unresolved or unsupported.`);
    }
  }
  if (unsupported.size !== expectedUnsupported.size || [...unsupported].some((field) => !expectedUnsupported.has(field))) {
    throw new Error(`${label}.unsupportedFields does not exactly match record-type policy.`);
  }
}

function parseRecord(value: unknown, index: number): NotionOperationalRecord {
  const label = `records[${index}]`;
  const candidate = objectValue(value, label);
  exactKeys(candidate, recordKeys, label);
  if (!(["campaign", "mission", "action"] as const).includes(candidate.recordType as "campaign")) throw new Error(`${label}.recordType is unaccepted.`);
  const recordType = candidate.recordType as NotionOperationalRecord["recordType"];
  const stableCode = exactText(candidate.stableCode, `${label}.stableCode`, 32);
  const codePattern = recordType === "campaign" ? campaignCodePattern : recordType === "mission" ? missionCodePattern : actionCodePattern;
  if (!codePattern.test(stableCode)) throw new Error(`${label}.stableCode disagrees with recordType.`);
  const parentCode = candidate.parentCode === null ? null : exactText(candidate.parentCode, `${label}.parentCode`, 32);
  const sourceRecordId = exactText(candidate.sourceRecordId, `${label}.sourceRecordId`, 36);
  const sourceUrl = exactText(candidate.sourceUrl, `${label}.sourceUrl`, 256);
  const status = exactText(candidate.status, `${label}.status`, 32);
  const approval = exactText(candidate.approval, `${label}.approval`, 32);
  const assignedRole = candidate.assignedRole === null ? null : exactText(candidate.assignedRole, `${label}.assignedRole`, 32);
  if (!notionIdPattern.test(sourceRecordId) || !notionUrlPattern.test(sourceUrl)) throw new Error(`${label} has invalid Notion provenance.`);
  if (!(statusValues as readonly string[]).includes(status) || !(approvalValues as readonly string[]).includes(approval)) throw new Error(`${label} has an unknown status or approval.`);
  if (assignedRole !== null && !(roleValues as readonly string[]).includes(assignedRole)) throw new Error(`${label} has an unknown assigned role.`);
  const title = exactText(candidate.title, `${label}.title`, 500);
  if (!title.startsWith(`${stableCode} — `)) throw new Error(`${label}.title must retain the exact stable-code em-dash prefix.`);
  const record: NotionOperationalRecord = {
    recordType,
    stableCode,
    parentCode,
    sourceRecordId,
    sourceUrl,
    title,
    intent: nullableText(candidate.intent, `${label}.intent`),
    objective: nullableText(candidate.objective, `${label}.objective`),
    status: status as NotionOperationalStatus,
    approval: approval as NotionOperationalApproval,
    assignedRole: assignedRole as NotionOperationalRole | null,
    sourceRevision: nullableText(candidate.sourceRevision, `${label}.sourceRevision`),
    sourceCreatedAt: nullableDateTime(candidate.sourceCreatedAt, `${label}.sourceCreatedAt`),
    sourceLastEditedAt: nullableDateTime(candidate.sourceLastEditedAt, `${label}.sourceLastEditedAt`),
    sourceObservedAt: exactDateTime(candidate.sourceObservedAt, `${label}.sourceObservedAt`),
    summary: nullableText(candidate.summary, `${label}.summary`),
    evidenceReferences: evidenceArray(candidate.evidenceReferences, `${label}.evidenceReferences`),
    unresolvedFields: exactStringArray(candidate.unresolvedFields, `${label}.unresolvedFields`, { allowed: nullableFieldNames }) as NullableFieldName[],
    unsupportedFields: exactStringArray(candidate.unsupportedFields, `${label}.unsupportedFields`, { allowed: nullableFieldNames }) as NullableFieldName[],
  };
  validateNullDispositions(record, label);
  return record;
}

export function validateNotionOperationalExport(value: unknown): NotionOperationalExport {
  const candidate = objectValue(value, "export");
  exactKeys(candidate, exportKeys, "export");
  if (candidate.schemaVersion !== NOTION_EXPORT_SCHEMA_VERSION
    || candidate.sourceSystem !== "notion_pre_cutover"
    || candidate.authority !== "notion_authoritative_pre_cutover") {
    throw new Error("Export contract, source, or authority is unaccepted.");
  }
  const campaignCode = exactText(candidate.campaignCode, "export.campaignCode", 4);
  if (!campaignCodePattern.test(campaignCode)) throw new Error("Export campaignCode is invalid.");
  const captureValue = objectValue(candidate.capture, "export.capture");
  exactKeys(captureValue, captureKeys, "export.capture");
  const capture: NotionOperationalCapture = {
    captureId: exactText(captureValue.captureId, "export.capture.captureId", 52),
    sourceRevision: exactText(captureValue.sourceRevision, "export.capture.sourceRevision", 200),
    startedAt: exactDateTime(captureValue.startedAt, "export.capture.startedAt"),
    completedAt: exactDateTime(captureValue.completedAt, "export.capture.completedAt"),
    exporterVersion: exactText(captureValue.exporterVersion, "export.capture.exporterVersion", 80),
  };
  if (!captureIdPattern.test(capture.captureId) || !exporterVersionPattern.test(capture.exporterVersion) || Date.parse(capture.completedAt) < Date.parse(capture.startedAt)) {
    throw new Error("Export capture metadata is invalid.");
  }
  if (!Array.isArray(candidate.records) || candidate.records.length < 1) throw new Error("Export records must be a non-empty array.");
  const records = candidate.records.map(parseRecord);
  if (records.some((record, index) => index > 0 && ordinalCompare(records[index - 1].stableCode, record.stableCode) >= 0)) {
    throw new Error("Export records must be unique and in strict stable-code order.");
  }
  for (const property of ["stableCode", "sourceRecordId", "sourceUrl"] as const) {
    if (new Set(records.map((record) => record[property])).size !== records.length) throw new Error(`Export has duplicate ${property}.`);
  }
  const campaigns = records.filter((record) => record.recordType === "campaign");
  const missions = records.filter((record) => record.recordType === "mission");
  const actions = records.filter((record) => record.recordType === "action");
  if (campaigns.length !== 1 || missions.length < 1 || actions.length < 1 || campaigns[0].stableCode !== campaignCode || campaigns[0].parentCode !== null) {
    throw new Error("Export must contain one matching Campaign plus at least one Mission and Action.");
  }
  const missionCodes = new Set(missions.map((record) => record.stableCode));
  for (const mission of missions) if (mission.parentCode !== campaignCode) throw new Error(`${mission.stableCode} has an invalid Campaign parent.`);
  for (const action of actions) {
    const expectedParent = action.stableCode.replace(/\.A[0-9]{3}$/, "");
    if (action.parentCode !== expectedParent || !missionCodes.has(expectedParent)) throw new Error(`${action.stableCode} has an invalid or missing Mission parent.`);
  }
  const limitations = exactStringArray(candidate.limitations, "export.limitations");
  const result: NotionOperationalExport = {
    schemaVersion: NOTION_EXPORT_SCHEMA_VERSION,
    sourceSystem: "notion_pre_cutover",
    authority: "notion_authoritative_pre_cutover",
    campaignCode,
    capture,
    records,
    limitations,
  };
  assertMigrationSafe(result, "validated export");
  return result;
}

function parseRawExportBytes(rawBytes: Uint8Array): NotionOperationalExport {
  if (!rawBytes.length) throw new Error("Raw export is empty.");
  if (rawBytes[0] === 0xef && rawBytes[1] === 0xbb && rawBytes[2] === 0xbf) throw new Error("Raw export must not contain a UTF-8 BOM.");
  if (rawBytes.includes(0x0d)) throw new Error("Raw export must use LF line endings only.");
  if (rawBytes[rawBytes.length - 1] !== 0x0a || (rawBytes.length > 1 && rawBytes[rawBytes.length - 2] === 0x0a)) {
    throw new Error("Raw export must end with exactly one LF.");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
  } catch {
    throw new Error("Raw export is not valid UTF-8.");
  }
  assertNoDuplicateJsonProperties(text, "Raw export");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Raw export is malformed JSON.");
  } finally {
    text = "";
  }
  assertMigrationSafe(parsed, "decoded raw export");
  return validateNotionOperationalExport(parsed);
}

export function assertNoDuplicateJsonProperties(text: string, label: string): void {
  const containers: Array<{ kind: "array" } | { kind: "object"; keys: Set<string> }> = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "{") {
      containers.push({ kind: "object", keys: new Set<string>() });
      continue;
    }
    if (character === "[") {
      containers.push({ kind: "array" });
      continue;
    }
    if (character === "}" || character === "]") {
      containers.pop();
      continue;
    }
    if (character !== "\"") continue;

    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === "\\") {
        index += 2;
        continue;
      }
      if (text[index] === "\"") break;
      index += 1;
    }
    if (index >= text.length) return;
    let next = index + 1;
    while (next < text.length && /\s/u.test(text[next])) next += 1;
    const container = containers[containers.length - 1];
    if (text[next] !== ":" || container?.kind !== "object") continue;
    let property: string;
    try {
      property = JSON.parse(text.slice(start, index + 1)) as string;
    } catch {
      return;
    }
    if (container.keys.has(property)) throw new Error(`${label} contains duplicate JSON property ${property}.`);
    container.keys.add(property);
  }
}

function stateStatus(status: NotionOperationalStatus): RecordStatus {
  if (status === "not_started") return "planned";
  if (status === "done") return "completed";
  return status;
}

function baselineApproval(value: NotionOperationalApproval, observedAt: string): Approval | null {
  return value === "approved" ? { approvedAt: observedAt, approvedBy: "Commander", revision: 1 } : null;
}

function recordSource(record: NotionOperationalRecord): NotionMigrationRecordSource {
  return {
    stableCode: record.stableCode,
    sourceRecordId: record.sourceRecordId,
    sourceUrl: record.sourceUrl,
    sourceRevision: record.sourceRevision,
    sourceCreatedAt: record.sourceCreatedAt,
    sourceLastEditedAt: record.sourceLastEditedAt,
    sourceObservedAt: record.sourceObservedAt,
    sourceApproval: record.approval,
    assignedRole: record.assignedRole,
    intent: record.intent,
    objective: record.objective,
    summary: record.summary,
    evidenceReferences: record.evidenceReferences,
    unresolvedFields: record.unresolvedFields,
    unsupportedFields: record.unsupportedFields,
  };
}

function firstEvidence(record: NotionOperationalRecord): string {
  return record.evidenceReferences[0]?.reference ?? "";
}

export function convertNotionOperationalExportToState(input: {
  source: NotionOperationalExport;
  rawArtifactDigest: string;
  canonicalExportDigest: string;
}): CastraState {
  const { source, rawArtifactDigest, canonicalExportDigest } = input;
  const observedAt = source.capture.completedAt;
  const campaignSource = source.records.find((record) => record.recordType === "campaign")!;
  const campaigns: Campaign[] = [{
    id: campaignSource.stableCode,
    type: "campaign",
    title: campaignSource.title,
    description: campaignSource.intent ?? campaignSource.summary ?? "",
    notes: campaignSource.summary ?? "",
    status: stateStatus(campaignSource.status),
    revision: 1,
    approval: baselineApproval(campaignSource.approval, observedAt),
    createdAt: observedAt,
    updatedAt: observedAt,
    archivedAt: null,
    commanderIntent: campaignSource.intent ?? "",
    deploymentEligibility: deploymentEligibilityTemplate(),
  }];
  const missions: Mission[] = source.records.filter((record) => record.recordType === "mission").map((record) => ({
    id: record.stableCode,
    type: "mission",
    campaignId: record.parentCode!,
    title: record.title,
    description: record.objective ?? record.summary ?? "",
    notes: record.summary ?? "",
    status: stateStatus(record.status),
    revision: 1,
    approval: baselineApproval(record.approval, observedAt),
    createdAt: observedAt,
    updatedAt: observedAt,
    archivedAt: null,
  }));
  const actions: Action[] = source.records.filter((record) => record.recordType === "action").map((record) => ({
    id: record.stableCode,
    type: "action",
    missionId: record.parentCode!,
    title: record.title,
    description: record.objective ?? record.summary ?? "",
    notes: record.summary ?? "",
    status: stateStatus(record.status),
    revision: 1,
    approval: baselineApproval(record.approval, observedAt),
    createdAt: observedAt,
    updatedAt: observedAt,
    archivedAt: null,
    actionKind: "standard",
    operationalContext: {
      owner: record.assignedRole ?? "",
      blocker: "",
      nextGate: "",
      evidenceReference: firstEvidence(record),
      attentionState: "normal",
    },
    followUpToActionId: null,
  }));
  const counts = { campaigns: 1 as const, missions: missions.length, actions: actions.length, totalRecords: source.records.length };
  const base = emptyState();
  const state = refreshOpenWorkProjection({
    ...base,
    migrationProvenance: [{
      contractVersion: NOTION_MIGRATION_PROVENANCE_VERSION,
      exportSchemaVersion: NOTION_EXPORT_SCHEMA_VERSION,
      converterVersion: NOTION_EXPORT_CONVERTER_VERSION,
      authority: "notion_authoritative_pre_cutover",
      campaignCode: source.campaignCode,
      captureId: source.capture.captureId,
      sourceRevision: source.capture.sourceRevision,
      sourceTime: observedAt,
      rawArtifactDigest,
      canonicalExportDigest,
      counts,
      timestampSemantics: "baseline_observation_not_historical_lifecycle",
      limitations: source.limitations,
      recordSources: source.records.map(recordSource),
    }],
    campaigns,
    missions,
    actions,
  });
  if (state.lifecycleCommandReceipts.length || state.auditEvents.length || state.commandConnectorReceipts.length
    || state.identityReferenceVersions.length || state.authorityAssignments.length || state.sessionReceipts.length
    || state.stepUpReceipts.length || state.authEvents.length || state.deploymentReceipts.length) {
    throw new Error("Converter created prohibited history, execution, identity, authentication, or provider records.");
  }
  assertMigrationSafe(state, "normalized state");
  return state;
}

export function bytesToBase64(rawBytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < rawBytes.length; offset += 32_768) {
    binary += String.fromCharCode(...rawBytes.subarray(offset, Math.min(offset + 32_768, rawBytes.length)));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  if (!value || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Raw export base64 is malformed.");
  }
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("Raw export base64 is malformed.");
  }
  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) result[index] = binary.charCodeAt(index);
  binary = "";
  return result;
}

async function analyzeExportBytes(rawBytes: Uint8Array): Promise<ExportAnalysis> {
  const source = parseRawExportBytes(rawBytes);
  const rawArtifactDigest = await hostedSha256Bytes(rawBytes);
  const canonicalExportDigest = await hostedSha256(canonicalHostedJson(source));
  const state = convertNotionOperationalExportToState({ source, rawArtifactDigest, canonicalExportDigest });
  const normalizedStateDigest = await hostedStateDocumentDigest(state);
  const campaigns = source.records.filter((record) => record.recordType === "campaign").length;
  const missions = source.records.filter((record) => record.recordType === "mission").length;
  const actions = source.records.filter((record) => record.recordType === "action").length;
  const counts = { campaigns: campaigns as 1, missions, actions, totalRecords: source.records.length };
  const openActionCodes = source.records
    .filter((record) => record.recordType === "action" && record.status !== "done")
    .map((record) => record.stableCode);
  return {
    source,
    rawExportBase64: bytesToBase64(rawBytes),
    rawArtifactDigest,
    canonicalExportDigest,
    counts,
    openActionCodes,
    state,
    normalizedStateDigest,
  };
}

function expectedManifestLimitations(exportLimitations: string[]): string[] {
  return [...new Set([...exportLimitations, ...MANDATORY_MIGRATION_LIMITATIONS])].sort(ordinalCompare);
}

export async function buildHighWaterManifestForExport(rawBytes: Uint8Array): Promise<NotionHighWaterManifest> {
  const analysis = await analyzeExportBytes(rawBytes);
  return {
    manifestVersion: NOTION_HIGH_WATER_MANIFEST_VERSION,
    exportSchemaVersion: NOTION_EXPORT_SCHEMA_VERSION,
    converterVersion: NOTION_EXPORT_CONVERTER_VERSION,
    stateSchemaVersion: 13,
    authority: "notion_authoritative_pre_cutover",
    campaignCode: analysis.source.campaignCode,
    source: {
      captureId: analysis.source.capture.captureId,
      revision: analysis.source.capture.sourceRevision,
      time: analysis.source.capture.completedAt,
    },
    digests: {
      rawArtifact: analysis.rawArtifactDigest,
      canonicalExport: analysis.canonicalExportDigest,
      normalizedState: analysis.normalizedStateDigest,
    },
    counts: analysis.counts,
    openActionCodes: analysis.openActionCodes,
    normalization: {
      rawEncoding: "UTF-8",
      rawBom: false,
      rawLineEndings: "LF",
      rawTerminalNewline: true,
      canonicalJson: "RFC8785-JCS",
      digestAlgorithm: "SHA-256",
      rawArtifactBytes: rawBytes.byteLength,
    },
    approvalRequirement: {
      authority: "Commander",
      decision: "approve_exact_manifest_digest",
      scope: "one_import_or_cutover_attempt",
    },
    limitations: expectedManifestLimitations(analysis.source.limitations),
  };
}

export function parseHighWaterManifest(value: unknown): NotionHighWaterManifest {
  const candidate = objectValue(value, "manifest");
  exactKeys(candidate, manifestKeys, "manifest");
  if (candidate.manifestVersion !== NOTION_HIGH_WATER_MANIFEST_VERSION
    || candidate.exportSchemaVersion !== NOTION_EXPORT_SCHEMA_VERSION
    || candidate.converterVersion !== NOTION_EXPORT_CONVERTER_VERSION
    || candidate.stateSchemaVersion !== 13
    || candidate.authority !== "notion_authoritative_pre_cutover") {
    throw new Error("Manifest versions, state schema, or authority are unaccepted.");
  }
  const campaignCode = exactText(candidate.campaignCode, "manifest.campaignCode", 4);
  if (!campaignCodePattern.test(campaignCode)) throw new Error("Manifest campaignCode is invalid.");
  const sourceValue = objectValue(candidate.source, "manifest.source");
  exactKeys(sourceValue, manifestSourceKeys, "manifest.source");
  const source = {
    captureId: exactText(sourceValue.captureId, "manifest.source.captureId", 52),
    revision: exactText(sourceValue.revision, "manifest.source.revision", 200),
    time: exactDateTime(sourceValue.time, "manifest.source.time"),
  };
  if (!captureIdPattern.test(source.captureId)) throw new Error("Manifest captureId is invalid.");
  const digestValue = objectValue(candidate.digests, "manifest.digests");
  exactKeys(digestValue, manifestDigestKeys, "manifest.digests");
  const countsValue = objectValue(candidate.counts, "manifest.counts");
  exactKeys(countsValue, manifestCountKeys, "manifest.counts");
  const campaigns = exactInteger(countsValue.campaigns, "manifest.counts.campaigns", 1);
  const missions = exactInteger(countsValue.missions, "manifest.counts.missions", 1);
  const actions = exactInteger(countsValue.actions, "manifest.counts.actions", 1);
  const totalRecords = exactInteger(countsValue.totalRecords, "manifest.counts.totalRecords", 3);
  if (campaigns !== 1 || totalRecords !== campaigns + missions + actions) throw new Error("Manifest counts are internally inconsistent.");
  const normalizationValue = objectValue(candidate.normalization, "manifest.normalization");
  exactKeys(normalizationValue, normalizationKeys, "manifest.normalization");
  if (normalizationValue.rawEncoding !== "UTF-8" || normalizationValue.rawBom !== false
    || normalizationValue.rawLineEndings !== "LF" || normalizationValue.rawTerminalNewline !== true
    || normalizationValue.canonicalJson !== "RFC8785-JCS" || normalizationValue.digestAlgorithm !== "SHA-256") {
    throw new Error("Manifest normalization policy is unaccepted.");
  }
  const approvalValue = objectValue(candidate.approvalRequirement, "manifest.approvalRequirement");
  exactKeys(approvalValue, approvalRequirementKeys, "manifest.approvalRequirement");
  if (approvalValue.authority !== "Commander" || approvalValue.decision !== "approve_exact_manifest_digest" || approvalValue.scope !== "one_import_or_cutover_attempt") {
    throw new Error("Manifest approval requirement is unaccepted.");
  }
  const result: NotionHighWaterManifest = {
    manifestVersion: NOTION_HIGH_WATER_MANIFEST_VERSION,
    exportSchemaVersion: NOTION_EXPORT_SCHEMA_VERSION,
    converterVersion: NOTION_EXPORT_CONVERTER_VERSION,
    stateSchemaVersion: 13,
    authority: "notion_authoritative_pre_cutover",
    campaignCode,
    source,
    digests: {
      rawArtifact: exactDigest(digestValue.rawArtifact, "manifest.digests.rawArtifact"),
      canonicalExport: exactDigest(digestValue.canonicalExport, "manifest.digests.canonicalExport"),
      normalizedState: exactDigest(digestValue.normalizedState, "manifest.digests.normalizedState"),
    },
    counts: { campaigns: 1, missions, actions, totalRecords },
    openActionCodes: exactStringArray(candidate.openActionCodes, "manifest.openActionCodes", { allowed: undefined }),
    normalization: {
      rawEncoding: "UTF-8",
      rawBom: false,
      rawLineEndings: "LF",
      rawTerminalNewline: true,
      canonicalJson: "RFC8785-JCS",
      digestAlgorithm: "SHA-256",
      rawArtifactBytes: exactInteger(normalizationValue.rawArtifactBytes, "manifest.normalization.rawArtifactBytes", 1),
    },
    approvalRequirement: {
      authority: "Commander",
      decision: "approve_exact_manifest_digest",
      scope: "one_import_or_cutover_attempt",
    },
    limitations: exactStringArray(candidate.limitations, "manifest.limitations", { nonEmpty: true }),
  };
  if (result.openActionCodes.some((code) => !actionCodePattern.test(code))) throw new Error("Manifest openActionCodes contains an invalid Action code.");
  assertMigrationSafe(result, "manifest");
  return result;
}

function exactArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateManifestBindings(manifest: NotionHighWaterManifest, analysis: ExportAnalysis, rawByteCount: number): void {
  const source = analysis.source;
  if (manifest.campaignCode !== source.campaignCode
    || manifest.source.captureId !== source.capture.captureId
    || manifest.source.revision !== source.capture.sourceRevision
    || manifest.source.time !== source.capture.completedAt) throw new Error("Manifest source high-water binding does not match the export.");
  if (manifest.digests.rawArtifact !== analysis.rawArtifactDigest
    || manifest.digests.canonicalExport !== analysis.canonicalExportDigest
    || manifest.digests.normalizedState !== analysis.normalizedStateDigest) throw new Error("Manifest digest binding does not match the export and normalized state.");
  if (canonicalHostedJson(manifest.counts) !== canonicalHostedJson(analysis.counts)
    || manifest.normalization.rawArtifactBytes !== rawByteCount) throw new Error("Manifest counts or raw byte count do not match the export.");
  if (!exactArray(manifest.openActionCodes, analysis.openActionCodes)) throw new Error("Manifest open Action-code set does not match the export.");
  if (!exactArray(manifest.limitations, expectedManifestLimitations(source.limitations))) throw new Error("Manifest limitations are missing, extra, duplicated, or reordered.");
}

export function parseHighWaterManifestText(text: string): NotionHighWaterManifest {
  assertNoDuplicateJsonProperties(text, "High-water manifest");
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error("High-water manifest is malformed JSON.");
  }
  return parseHighWaterManifest(value);
}

export async function buildInitialImportCandidate(input: {
  rawExportBase64: string;
  manifest: unknown;
  manifestDigest?: string;
}): Promise<InitialImportCandidate> {
  const rawBytes = base64ToBytes(input.rawExportBase64);
  try {
    const analysis = await analyzeExportBytes(rawBytes);
    const manifest = parseHighWaterManifest(input.manifest);
    validateManifestBindings(manifest, analysis, rawBytes.byteLength);
    const manifestDigest = await hostedSha256(canonicalHostedJson(manifest));
    if (input.manifestDigest !== undefined && input.manifestDigest !== manifestDigest) throw new Error("External manifest digest does not match the exact parsed manifest.");
    return {
      contractVersion: INITIAL_IMPORT_CONTRACT_VERSION,
      converterVersion: NOTION_EXPORT_CONVERTER_VERSION,
      rawExportBase64: analysis.rawExportBase64,
      manifest,
      manifestDigest,
      sourceArtifactDigest: analysis.rawArtifactDigest,
      exportDigest: analysis.canonicalExportDigest,
      sourceRevision: analysis.source.capture.sourceRevision,
      counts: analysis.counts,
      normalizedStateDigest: analysis.normalizedStateDigest,
      state: analysis.state,
      identityMaterialImported: false,
      secretMaterialImported: false,
      localOrBundledStateRead: false,
    };
  } finally {
    rawBytes.fill(0);
  }
}

export async function buildInitialImportCandidateFromFiles(rawBytes: Uint8Array, manifestText: string): Promise<InitialImportCandidate> {
  return buildInitialImportCandidate({
    rawExportBase64: bytesToBase64(rawBytes),
    manifest: parseHighWaterManifestText(manifestText),
  });
}

function currentAuthorityReceipt(receipt: InitialImportBrowserAuthReceipt | null): asserts receipt is InitialImportBrowserAuthReceipt {
  if (!receipt?.allowed || receipt.status !== "authenticated" || !receipt.identityReference
    || !receipt.authorities.includes("Commander") || !receipt.authorities.includes("Product Owner")) {
    throw new Error("A current authenticated live sole-Commander session with Commander and Product Owner authority is required.");
  }
}

export async function bindInitialImportAuthority(receipt: InitialImportBrowserAuthReceipt | null): Promise<InitialImportAuthorityEvidence> {
  currentAuthorityReceipt(receipt);
  const receiptDigest = await hostedSha256(canonicalHostedJson({
    contractVersion: INITIAL_IMPORT_CONTRACT_VERSION,
    identityReference: receipt.identityReference,
    authorities: [...receipt.authorities].sort(),
    requestReference: receipt.evidence.requestReference,
    providerReceiptReference: receipt.evidence.providerReceiptReference,
    configurationVersion: receipt.evidence.configurationVersion,
    secretMaterialStored: receipt.evidence.secretMaterialStored,
  }));
  return {
    contractVersion: INITIAL_IMPORT_CONTRACT_VERSION,
    receiptDigest,
    status: "authenticated",
    commanderAuthorityBound: true,
    productOwnerAuthorityBound: true,
    manifestDigest: null,
    exactManifestStepUpBound: false,
    identityReferenceIncluded: false,
    secretMaterialStored: false,
  };
}

export async function bindInitialImportApproval(receipt: InitialImportBrowserAuthReceipt | null, manifestDigest: string): Promise<InitialImportAuthorityEvidence> {
  currentAuthorityReceipt(receipt);
  if (!digestPattern.test(manifestDigest)
    || receipt.stepUpEvidence?.sensitiveAction !== "operational_state_initial_import"
    || receipt.stepUpEvidence.scopeBindingDigest !== manifestDigest) {
    throw new Error("A current Product Owner proof bound to the exact high-water manifest is required.");
  }
  const receiptDigest = await hostedSha256(canonicalHostedJson({
    contractVersion: INITIAL_IMPORT_CONTRACT_VERSION,
    manifestDigest,
    identityReference: receipt.identityReference,
    authorities: [...receipt.authorities].sort(),
    stepUp: receipt.stepUpEvidence,
    requestReference: receipt.evidence.requestReference,
    providerReceiptReference: receipt.evidence.providerReceiptReference,
  }));
  return {
    contractVersion: INITIAL_IMPORT_CONTRACT_VERSION,
    receiptDigest,
    status: "authenticated",
    commanderAuthorityBound: true,
    productOwnerAuthorityBound: true,
    manifestDigest,
    exactManifestStepUpBound: true,
    identityReferenceIncluded: false,
    secretMaterialStored: false,
  };
}

export function initialImportControlVisible(input: {
  mode: string;
  availability: string;
  pendingCommand: boolean;
  receipt: InitialImportBrowserAuthReceipt | null;
}): boolean {
  return input.mode === "authenticated_live"
    && input.availability === "empty"
    && !input.pendingCommand
    && input.receipt?.allowed === true
    && input.receipt.status === "authenticated"
    && input.receipt.authorities.includes("Commander")
    && input.receipt.authorities.includes("Product Owner");
}

export async function buildInitialImportReviewEvidence(input: {
  candidate: InitialImportCandidate;
  authority: InitialImportAuthorityEvidence;
  prepared: PreparedInitialImportReviewCommand;
}): Promise<InitialImportReviewEvidence> {
  if (input.prepared.commandType !== "initial_import" || input.prepared.expectedRevision !== 0 || input.prepared.stateSchemaVersion !== 13
    || !input.prepared.idempotencyKey.startsWith(INITIAL_IMPORT_IDEMPOTENCY_PREFIX)
    || input.prepared.manifestDigest !== input.candidate.manifestDigest) {
    throw new Error("Initial import is not bound to the exact expected-revision-0 manifest command.");
  }
  if (input.prepared.stateDigest !== input.candidate.normalizedStateDigest
    || await hostedStateDocumentDigest(input.prepared.stateDocument) !== input.candidate.normalizedStateDigest) {
    throw new Error("Prepared initial-import state does not match the deterministic manifest state.");
  }
  return {
    contractVersion: INITIAL_IMPORT_CONTRACT_VERSION,
    converterVersion: input.candidate.converterVersion,
    manifestDigest: input.candidate.manifestDigest,
    sourceArtifactDigest: input.candidate.sourceArtifactDigest,
    exportDigest: input.candidate.exportDigest,
    sourceRevision: input.candidate.sourceRevision,
    counts: input.candidate.counts,
    normalizedStateDigest: input.candidate.normalizedStateDigest,
    expectedRevision: 0,
    idempotencyKey: input.prepared.idempotencyKey,
    requestBindingDigest: input.prepared.requestBindingDigest,
    authorityReceiptDigest: input.authority.receiptDigest,
    terminalProviderReceipt: "pending_confirmation",
    importedAuthority: "notion_authoritative_pre_cutover",
    authorityAfterImport: "notion_pre_cutover",
    identityReferenceIncluded: false,
    secretMaterialStored: false,
    localOrBundledStateRead: false,
  };
}

export async function auditLegacyA020Fixture(rawBytes: Uint8Array): Promise<LegacyA020FixtureAudit> {
  if (rawBytes.byteLength !== LEGACY_A020_FIXTURE.byteCount || await hostedSha256Bytes(rawBytes) !== LEGACY_A020_FIXTURE.rawArtifactDigest) {
    throw new Error("Historical A020 fixture bytes do not match the immutable receipt.");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
  const value = objectValue(JSON.parse(text) as unknown, "legacy fixture");
  if (value.schemaVersion !== LEGACY_A020_FIXTURE.schemaVersion || value.sourceRevision !== LEGACY_A020_FIXTURE.sourceRevision || !Array.isArray(value.records)) {
    throw new Error("Historical A020 fixture contract or source revision is wrong.");
  }
  const records = value.records.map((entry, index) => objectValue(entry, `legacy records[${index}]`));
  const codes = records.map((record, index) => exactText(record.stableCode, `legacy records[${index}].stableCode`, 32));
  const ids = records.map((record, index) => exactText(record.sourceRecordId, `legacy records[${index}].sourceRecordId`, 36));
  if (records.length !== LEGACY_A020_FIXTURE.records || new Set(codes).size !== records.length || new Set(ids).size !== records.length
    || codes.some((code, index) => index > 0 && ordinalCompare(codes[index - 1], code) >= 0)) {
    throw new Error("Historical A020 fixture ordering or uniqueness is invalid.");
  }
  const missions = records.filter((record) => record.recordType === "mission");
  const actions = records.filter((record) => record.recordType === "action");
  const missionCodes = new Set(missions.map((record) => record.stableCode));
  if (missions.length !== LEGACY_A020_FIXTURE.missions || actions.length !== LEGACY_A020_FIXTURE.actions
    || missions.some((record) => record.parentCode !== "C001")
    || actions.some((record) => !missionCodes.has(record.parentCode))) {
    throw new Error("Historical A020 fixture counts or parent closure are invalid.");
  }
  assertMigrationSafe(value, "historical fixture");
  return {
    rawArtifactDigest: LEGACY_A020_FIXTURE.rawArtifactDigest,
    byteCount: LEGACY_A020_FIXTURE.byteCount,
    schemaVersion: LEGACY_A020_FIXTURE.schemaVersion,
    records: LEGACY_A020_FIXTURE.records,
    missions: LEGACY_A020_FIXTURE.missions,
    actions: LEGACY_A020_FIXTURE.actions,
    runtimeImportApproved: false,
  };
}
