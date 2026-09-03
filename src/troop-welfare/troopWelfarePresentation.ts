import type {
  TroopWelfareAudienceRequest,
  TroopWelfareCapability,
  TroopWelfareEvent,
  TroopWelfareGenerationJob,
} from "./troopWelfare";

export type TroopWelfareActivityId = "dj" | "requests" | "trivia" | "karaoke" | "challenges" | "craps";

export interface TroopWelfareActivity {
  id: TroopWelfareActivityId;
  label: string;
  shortLabel: string;
  state: "active" | "available" | "coming_soon" | "placeholder";
}

export const TROOP_WELFARE_ACTIVITIES: readonly TroopWelfareActivity[] = [
  { id: "dj", label: "AI DJ SARGE", shortLabel: "DJ", state: "active" },
  { id: "requests", label: "Music Requests", shortLabel: "Requests", state: "available" },
  { id: "trivia", label: "Trivia", shortLabel: "Trivia", state: "coming_soon" },
  { id: "karaoke", label: "Karaoke", shortLabel: "Karaoke", state: "coming_soon" },
  { id: "challenges", label: "Team Challenges", shortLabel: "Challenges", state: "coming_soon" },
  { id: "craps", label: "CRAPS Simulator", shortLabel: "CRAPS", state: "placeholder" },
];

export const TROOP_WELFARE_TIMELINE_LANES = [
  { label: "Deck A · local", color: "teal", clips: [{ left: 4, width: 24, label: "Dawn patrol" }, { left: 32, width: 18, label: "Transition" }, { left: 73, width: 20, label: "Hold" }] },
  { label: "Deck B · local", color: "violet", clips: [{ left: 14, width: 30, label: "Comms cadence" }, { left: 48, width: 31, label: "Night shift" }] },
  { label: "AI cue · reviewed", color: "coral", clips: [{ left: 38, width: 17, label: "Candidate" }, { left: 59, width: 14, label: "Energy lift" }] },
  { label: "Audience request", color: "blue", clips: [{ left: 7, width: 15, label: "Moderated" }, { left: 82, width: 10, label: "Next" }] },
] as const;

export interface TroopWelfarePresentationSeed {
  event: TroopWelfareEvent;
  capability: TroopWelfareCapability;
  requests: TroopWelfareAudienceRequest[];
  jobs: TroopWelfareGenerationJob[];
}

export interface TroopWelfareSanitizedWebMcpStep {
  readonly sequence: number;
  readonly tool: string;
  readonly classification: "read_only" | "proposal";
  readonly outcome: "complete" | "refused";
}

export interface TroopWelfareSanitizedWebMcpActivity {
  readonly expectedReadOnlyTools: readonly string[];
  readonly steps: readonly TroopWelfareSanitizedWebMcpStep[];
}

export function summarizeTroopWelfareWebMcpActivity(activity?: TroopWelfareSanitizedWebMcpActivity) {
  if (!activity) return { state: "empty" as const, completed: 0, expected: 0, rows: [] as readonly TroopWelfareSanitizedWebMcpStep[] };
  const expected = new Set(activity.expectedReadOnlyTools);
  const completed = new Set(activity.steps.filter((step) => step.classification === "read_only" && step.outcome === "complete" && expected.has(step.tool)).map((step) => step.tool)).size;
  const rows = activity.steps.slice(-5);
  const state = activity.steps.length === 0 ? "pending" as const : completed === 0 && activity.steps.some((step) => step.outcome === "refused") ? "refused" as const : completed < expected.size ? "pending" as const : "complete" as const;
  return { state, completed, expected: expected.size, rows };
}

/** Deterministic synthetic state only; it never leaves the current React tab. */
export function buildTroopWelfarePresentationSeed(nowIso: string): TroopWelfarePresentationSeed {
  const expiresAt = new Date(new Date(nowIso).getTime() + 26 * 60_000).toISOString();
  const base = { createdAt: nowIso, updatedAt: nowIso };
  return {
    event: {
      id: "twf_seed_event",
      title: "Morale Set · Local Preview",
      participationMode: "mixed",
      status: "active",
      createdAt: nowIso,
      startedAt: nowIso,
      lastPausedAt: null,
      stoppedAt: null,
      provenance: "synthetic_local_demo",
    },
    capability: {
      id: "twf_seed_capability",
      eventId: "twf_seed_event",
      issuedAt: nowIso,
      expiresAt,
      ttlMinutes: 26,
      usedAt: null,
      revokedAt: null,
      provenance: "synthetic_local_demo",
    },
    requests: [{
      id: "twf_seed_request",
      nickname: "Northstar",
      requestText: "Steady, instrumental-ready transition for the next checkpoint.",
      submittedAt: nowIso,
      status: "moderated_ok",
      provenance: "synthetic_local_demo",
    }],
    jobs: [
      {
        id: "twf_seed_deck_a",
        requestId: null,
        source: "local_placeholder",
        provenanceLabel: "Local placeholder only — no provider execution",
        state: "ready",
        moderationPassed: true,
        rightsReviewPassed: true,
        ...base,
      },
      {
        id: "twf_seed_deck_b",
        requestId: null,
        source: "local_placeholder",
        provenanceLabel: "Local placeholder only — no provider execution",
        state: "ready",
        moderationPassed: true,
        rightsReviewPassed: true,
        ...base,
      },
      {
        id: "twf_seed_ai_candidate",
        requestId: "twf_seed_request",
        source: "ai",
        provenanceLabel: "AI-suggested seed (local placeholder, no provider call)",
        state: "reviewed",
        moderationPassed: true,
        rightsReviewPassed: false,
        ...base,
      },
    ],
  };
}

export function troopWelfareActivityLabel(id: TroopWelfareActivityId): string {
  return TROOP_WELFARE_ACTIVITIES.find((activity) => activity.id === id)?.label ?? "Activity";
}
