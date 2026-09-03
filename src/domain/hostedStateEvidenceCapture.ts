import { findAuthSecretViolations } from "./authentication.js";
import { canonicalHostedJson } from "./hostedOperationalStateDigest.js";
import type { CastraState } from "./types.js";

export const HOSTED_STATE_EVIDENCE_CAPTURE_SCHEMA_VERSION = "castra-hosted-state-evidence-capture/1.0.0" as const;

const digestPattern = /^sha256:[a-f0-9]{64}$/;
const isoInstantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const originPattern = /^https?:\/\/[a-z0-9.:-]+$/i;

/**
 * Structural shape of an already-loaded hosted-state read result. It is declared
 * locally so this domain module stays pure and free of any transport, repository,
 * component, or network dependency.
 */
export interface LoadedHostedStateSource {
  availability: string;
  revision: number;
  state: CastraState | null;
  stateDigest: string | null;
  reasonCode: string | null;
}

export interface HostedStateEvidenceCaptureCounts {
  campaigns: number;
  missions: number;
  actions: number;
  totalRecords: number;
  completedActions: number;
}

export interface HostedStateEvidenceCapture {
  schemaVersion: typeof HOSTED_STATE_EVIDENCE_CAPTURE_SCHEMA_VERSION;
  capturedAt: string;
  origin: string;
  availability: "loaded";
  revision: number;
  stateDigest: string;
  reasonCode: string | null;
  counts: HostedStateEvidenceCaptureCounts;
  exactOpenActionSet: string[];
  stateDocument: CastraState;
  capturedBy: "commander_browser_readonly";
  mutationPerformed: false;
  commandDispatched: false;
}

function openActionCodes(state: CastraState): string[] {
  return state.actions
    .filter((action) => !action.archivedAt && action.status !== "completed")
    .map((action) => action.id)
    .sort();
}

function captureCounts(state: CastraState): HostedStateEvidenceCaptureCounts {
  return {
    campaigns: state.campaigns.length,
    missions: state.missions.length,
    actions: state.actions.length,
    totalRecords: state.campaigns.length + state.missions.length + state.actions.length,
    completedActions: state.actions.filter((action) => action.status === "completed").length,
  };
}

/**
 * Builds the canonical read-only hosted-state evidence artifact from a hosted
 * result that is already loaded in memory. This function never reads, writes,
 * dispatches, or mutates anything; it derives an artifact and fails closed.
 */
export function buildHostedStateEvidenceCapture(input: {
  source: LoadedHostedStateSource;
  capturedAt: string;
  origin: string;
}): HostedStateEvidenceCapture {
  if (input.source.availability !== "loaded") {
    throw new Error(`Hosted operational state is ${input.source.availability}; an evidence capture requires an exactly loaded hosted result.`);
  }
  if (!input.source.state) {
    throw new Error("Hosted operational state reported loaded without a state document; no evidence capture was produced.");
  }
  if (!Number.isSafeInteger(input.source.revision) || input.source.revision < 1) {
    throw new Error("Hosted operational state evidence capture requires a positive integer hosted revision.");
  }
  if (typeof input.source.stateDigest !== "string" || !digestPattern.test(input.source.stateDigest)) {
    throw new Error("Hosted operational state evidence capture requires the exact provider-bound sha256 state digest.");
  }
  if (input.source.reasonCode !== null && (typeof input.source.reasonCode !== "string" || !input.source.reasonCode)) {
    throw new Error("Hosted operational state evidence capture reason code must be an exact string or null.");
  }
  if (typeof input.capturedAt !== "string" || !isoInstantPattern.test(input.capturedAt) || Number.isNaN(Date.parse(input.capturedAt))) {
    throw new Error("Hosted operational state evidence capture requires an ISO 8601 UTC capture instant.");
  }
  if (typeof input.origin !== "string" || !originPattern.test(input.origin) || input.origin.length > 255) {
    throw new Error("Hosted operational state evidence capture requires the exact browser origin.");
  }

  const stateDocument = input.source.state;
  const artifact: HostedStateEvidenceCapture = {
    schemaVersion: HOSTED_STATE_EVIDENCE_CAPTURE_SCHEMA_VERSION,
    capturedAt: input.capturedAt,
    origin: input.origin,
    availability: "loaded",
    revision: input.source.revision,
    stateDigest: input.source.stateDigest,
    reasonCode: input.source.reasonCode,
    counts: captureCounts(stateDocument),
    exactOpenActionSet: openActionCodes(stateDocument),
    stateDocument,
    capturedBy: "commander_browser_readonly",
    mutationPerformed: false,
    commandDispatched: false,
  };

  const violations = findAuthSecretViolations(artifact, "hosted state evidence capture");
  if (violations.length) {
    throw new Error(`Hosted operational state evidence capture rejected: prohibited secret material at ${violations.map((item) => item.path).join(", ")}.`);
  }
  return artifact;
}

/**
 * Serializes the artifact with stable key ordering so an independent verifier can
 * hash the downloaded file and reproduce the same digest byte for byte.
 */
export function serializeHostedStateEvidenceCapture(artifact: HostedStateEvidenceCapture): string {
  return canonicalHostedJson(artifact);
}

export function hostedStateEvidenceCaptureFileName(artifact: HostedStateEvidenceCapture): string {
  return `castra-hosted-state-evidence-${artifact.revision}-${artifact.capturedAt.slice(0, 10)}.json`;
}

export function hostedStateEvidenceExportControlVisible(input: {
  mode: string;
  availability: string;
  receipt: { allowed?: boolean; status?: string } | null;
}): boolean {
  return input.mode === "authenticated_live"
    && input.availability === "loaded"
    && input.receipt?.allowed === true
    && input.receipt.status === "authenticated";
}
