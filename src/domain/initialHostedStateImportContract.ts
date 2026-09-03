export const INITIAL_IMPORT_CONTRACT_VERSION = "castra-governed-initial-import/2.0.0" as const;
export const NOTION_MIGRATION_PACKAGE_VERSION = "castra-notion-migration-record-package/1.0.0" as const;
export const NOTION_EXPORT_SCHEMA_VERSION = "castra-notion-operational-export/2.0.0" as const;
export const NOTION_HIGH_WATER_MANIFEST_VERSION = "castra-notion-operational-high-water/1.0.0" as const;
export const NOTION_EXPORT_CONVERTER_VERSION = "castra-notion-operational-to-state-13/2.0.0" as const;
export const NOTION_MIGRATION_PROVENANCE_VERSION = "castra-notion-migration-provenance/1.0.0" as const;
export const INITIAL_IMPORT_RECEIPT_VERSION = "castra-governed-initial-import-receipt/1.0.0" as const;
export const INITIAL_IMPORT_IDEMPOTENCY_PREFIX = "state-write:initial-import:" as const;

export const MANDATORY_MIGRATION_LIMITATIONS = [
  "CASTRA baseline timestamps and revision 1 are migration observations, not original Notion lifecycle history.",
  "No Notion page bodies, comments, discussions, attachments, files, transcripts, private identities, secrets, provider configuration, or historical events are included.",
  "The normalized target is non-authoritative until the verified A010 cutover receipt transfers authority.",
] as const;

// Historical-fixture constants are deliberately isolated from runtime acceptance.
export const LEGACY_A020_FIXTURE = {
  schemaVersion: "castra-operational-export/1.0.0",
  rawArtifactDigest: "sha256:09abc93808929924340508c4d3cd564559f97f8c94558261923dc9b21c79a6d6",
  byteCount: 93_895,
  sourceRevision: "notion-live-fetch:2026-08-15T14:23:09.764Z",
  records: 108,
  missions: 14,
  actions: 94,
} as const;
