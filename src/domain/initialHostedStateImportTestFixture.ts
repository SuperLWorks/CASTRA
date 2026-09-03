import {
  buildHighWaterManifestForExport,
  buildInitialImportCandidate,
  bytesToBase64,
  type InitialImportCandidate,
  type NotionHighWaterManifest,
  type NotionOperationalExport,
} from "./initialHostedStateImport.js";

const observedAt = "2026-08-15T15:10:00.000Z";

function notionUrl(id: string): string {
  return `https://app.notion.com/p/${id.replaceAll("-", "")}`;
}

export function validNotionOperationalExport(): NotionOperationalExport {
  const campaignId = "11111111-1111-4111-8111-111111111111";
  const missionId = "22222222-2222-4222-8222-222222222222";
  const actionId = "33333333-3333-4333-8333-333333333333";
  return {
    schemaVersion: "castra-notion-operational-export/2.0.0",
    sourceSystem: "notion_pre_cutover",
    authority: "notion_authoritative_pre_cutover",
    campaignCode: "C001",
    capture: {
      captureId: "notion-capture:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sourceRevision: "notion-high-water:fixture-0001",
      startedAt: "2026-08-15T15:09:00.000Z",
      completedAt: observedAt,
      exporterVersion: "castra-notion-exporter/2.0.0",
    },
    records: [
      {
        recordType: "campaign",
        stableCode: "C001",
        parentCode: null,
        sourceRecordId: campaignId,
        sourceUrl: notionUrl(campaignId),
        title: "C001 — CASTRA Product Completion",
        intent: "Make CASTRA the operational authority only after verified cutover.",
        objective: null,
        status: "in_progress",
        approval: "approved",
        assignedRole: null,
        sourceRevision: "notion-record:campaign:7",
        sourceCreatedAt: "2026-08-01T12:00:00.000Z",
        sourceLastEditedAt: "2026-08-15T15:08:00.000Z",
        sourceObservedAt: observedAt,
        summary: "Active product-completion Campaign.",
        evidenceReferences: [{ kind: "notion_page", reference: notionUrl(campaignId) }],
        unresolvedFields: [],
        unsupportedFields: ["assignedRole", "objective"],
      },
      {
        recordType: "mission",
        stableCode: "C001.M013",
        parentCode: "C001",
        sourceRecordId: missionId,
        sourceUrl: notionUrl(missionId),
        title: "C001.M013 — Operational Authority Cutover",
        intent: null,
        objective: "Establish one governed operational authority.",
        status: "in_progress",
        approval: "approved",
        assignedRole: null,
        sourceRevision: "notion-record:mission:5",
        sourceCreatedAt: "2026-08-10T12:00:00.000Z",
        sourceLastEditedAt: "2026-08-15T15:08:30.000Z",
        sourceObservedAt: observedAt,
        summary: "Cutover remains controlled by Notion until A010.",
        evidenceReferences: [{ kind: "notion_page", reference: notionUrl(missionId) }],
        unresolvedFields: [],
        unsupportedFields: ["assignedRole", "intent"],
      },
      {
        recordType: "action",
        stableCode: "C001.M013.A010",
        parentCode: "C001.M013",
        sourceRecordId: actionId,
        sourceUrl: notionUrl(actionId),
        title: "C001.M013.A010 — Execute approved operational-authority cutover",
        intent: null,
        objective: "Apply the separately approved high-water state and verify the receipt.",
        status: "not_started",
        approval: "approved",
        assignedRole: "SARGE",
        sourceRevision: "notion-record:action:9",
        sourceCreatedAt: "2026-08-11T12:00:00.000Z",
        sourceLastEditedAt: "2026-08-15T15:09:30.000Z",
        sourceObservedAt: observedAt,
        summary: "The expected open cutover Action.",
        evidenceReferences: [{ kind: "notion_page", reference: notionUrl(actionId) }],
        unresolvedFields: [],
        unsupportedFields: ["intent"],
      },
    ],
    limitations: ["Fixture represents record semantics only and does not authorize Production."],
  };
}

export function rawExportBytes(source: NotionOperationalExport = validNotionOperationalExport()): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(source, null, 2)}\n`);
}

export async function validInitialImportFixture(): Promise<{
  rawBytes: Uint8Array;
  rawExportBase64: string;
  manifest: NotionHighWaterManifest;
  candidate: InitialImportCandidate;
}> {
  const rawBytes = rawExportBytes();
  const manifest = await buildHighWaterManifestForExport(rawBytes);
  const rawExportBase64 = bytesToBase64(rawBytes);
  const candidate = await buildInitialImportCandidate({ rawExportBase64, manifest });
  return { rawBytes, rawExportBase64, manifest, candidate };
}
