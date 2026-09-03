import {
  SESSION_BOARD_CRITERIA_IDS,
  SessionBoardOutcome,
  SessionBoardProposal,
  SessionBoardScenario,
  SessionBoardScenarioFixture,
  SESSION_BOARD_PENDING_HUMAN_IDENTITY,
} from "./sessionBoardModel";

const baseProposals: SessionBoardProposal[] = [
  {
    proposalId: "p-01",
    proposalLabel: "S25-SIG",
    humanIdentity: SESSION_BOARD_PENDING_HUMAN_IDENTITY,
    machineIdentity: "ACT-bc7296dc",
    shortMachineIdentity: "ACT-bc7296dc",
    fullMachineIdentity: "act_bc7296dc-fea1-4fae-85f5-40efbd0cc8c7",
    branchHint: "action/act-c417cbd5-p04-signal-ui-r2-20260825",
    worktreeHint: "work/act-c417cbd5-p04-signal-ui-r2-20260825",
    state: "pending",
    outcome: "Authoritative allocation pending. Human identity: pending authoritative allocation.",
    dependencies: ["AUTH-RUNTIME-BOUND-01"],
    expectedTimeMinutes: 180,
    marginalCostUsd: 0,
    risk: "Controlled UI-only boundary; authority mutation intentionally absent.",
    acceptanceCriteria: [
      "One clear authorization review surface",
      "No authority mutation during local rehearsal",
      "Primary outcome is the chosen action and gate summary.",
    ],
    protectedGates: [
      {
        title: "Authority callback",
        source: "Commander callback",
        unmetCondition: undefined,
      },
    ],
    lifecycleState: "Ready for rehearsal",
    protectedNextGate: "Governed allocation callback",
  },
  {
    proposalId: "p-02",
    proposalLabel: "S25-P04",
    humanIdentity: SESSION_BOARD_PENDING_HUMAN_IDENTITY,
    machineIdentity: "ACT-c417cbd5",
    shortMachineIdentity: "ACT-c417cbd5",
    fullMachineIdentity: "act_c417cbd5-8a52-4bc5-bf4a-1836b13f8069",
    branchHint: "action/act-c417cbd5-p04-signal-ui-r2-20260825",
    worktreeHint: "work/act-c417cbd5-p04-signal-ui-r2-20260825",
    state: "pending",
    outcome: "Candidate selected for release-plane review only.",
    dependencies: ["AUTH-RUNTIME-BOUND-02", "S25-SIG"],
    expectedTimeMinutes: 240,
    marginalCostUsd: 0,
    risk: "High if allocation boundaries are crossed; controls are disabled locally.",
    acceptanceCriteria: [
      "Any subset of proposals can be selected",
      "Unselected cards remain unallocated",
      "Post-authorization identity remains copyable and visible",
    ],
    protectedGates: [
      {
        title: "Gate: envelope",
        source: "Session Board envelope",
        unmetCondition: undefined,
      },
    ],
    lifecycleState: "Ready for rehearsal",
    protectedNextGate: "Governed authorization binding",
  },
  {
    proposalId: "p-03",
    proposalLabel: "SYN-01",
    humanIdentity: SESSION_BOARD_PENDING_HUMAN_IDENTITY,
    machineIdentity: "SYNTHETIC-SYN-01",
    shortMachineIdentity: "SYN-SYN-01",
    fullMachineIdentity: "act_synthetic-0001",
    branchHint: "action/act-c417cbd5-p04-signal-ui-r2-20260825",
    worktreeHint: "work/act-c417cbd5-p04-signal-ui-r2-20260825",
    state: "deferred",
    outcome: "Deferred from this subset for synthetic rehearsal.",
    dependencies: ["None"],
    expectedTimeMinutes: 90,
    marginalCostUsd: 0,
    risk: "Low; synthetic selector-only path.",
    acceptanceCriteria: ["Supports arbitrary subset review", "Reject path does not auto-allocate"],
    protectedGates: [
      {
        title: "Allocation identity",
        source: "Authority allocator",
        unmetCondition: undefined,
      },
    ],
    lifecycleState: "Synthetic optional",
    protectedNextGate: "No action unless selected in same subset",
  },
  {
    proposalId: "p-04",
    proposalLabel: "SYN-02",
    humanIdentity: SESSION_BOARD_PENDING_HUMAN_IDENTITY,
    machineIdentity: "SYNTHETIC-SYN-02",
    shortMachineIdentity: "SYN-SYN-02",
    fullMachineIdentity: "act_synthetic-0002",
    branchHint: "action/act-c417cbd5-p04-signal-ui-r2-20260825",
    worktreeHint: "work/act-c417cbd5-p04-signal-ui-r2-20260825",
    state: "deferred",
    outcome: "Alternate scoped option with no required dependency.",
    dependencies: ["None"],
    expectedTimeMinutes: 45,
    marginalCostUsd: 0,
    risk: "Low; synthetic option.",
    acceptanceCriteria: ["Can remain unselected", "Does not promote visual emphasis when not selected"],
    protectedGates: [
      {
        title: "Boundary proof",
        source: "Local rehearsal",
        unmetCondition: undefined,
      },
    ],
    lifecycleState: "Synthetic optional",
    protectedNextGate: "No local authority effect",
  },
];

const baselineOutcome: SessionBoardOutcome = {
  receiptIdentity: "receipt_20260825_session_board_initial_rehearsal",
  fullOpaqueIdentity: "act_c417cbd5-8a52-4bc5-bf4a-1836b13f8069",
  machineOpaqueIdentity: "ACT-c417cbd5",
  receiptBranch: "action/act-c417cbd5-p04-signal-ui-r2-20260825",
  receiptWorktree: "work/act-c417cbd5-p04-signal-ui-r2-20260825",
  progress: [
    "Board rendered in memory",
    "Local proposal selection collected",
    "Rehearsal authorization acknowledged (no write)",
    "Fixture outcome prepared for review only",
  ],
  verification: [
    "No hosted repository imports",
    "No /api/state dependency",
    "No provider connector usage",
    "No automatic retry operation",
  ],
  blockers: ["Authoritative authority callback not yet supplied in this view"],
  freshness: "deterministic synthetic snapshot",
  nextGate: "AUTHORIZED ALLOCATION LINK (Commander callback)",
};

function buildNormalScenario(): SessionBoardScenarioFixture {
  return {
    scenario: "normal",
    heading: "Session Board rehearsal",
    boundaryNotice: "Public Demo synthetic only; no authority mutation occurred.",
    proposals: baseProposals,
    defaultSelectedIds: ["p-01", "p-02"],
    defaultOutcome: baselineOutcome,
    hasUnknownOutcome: false,
    unknownOutcomeGuidance: "No unknown outcome in normal fixture.",
    allowAuthorizedRetry: false,
  };
}

function buildDenseScenario(): SessionBoardScenarioFixture {
  return {
    scenario: "dense",
    heading: "Session Board (dense)",
    boundaryNotice: "Dense synthetic panel for compact display and accessibility checks.",
    proposals: baseProposals,
    defaultSelectedIds: ["p-01", "p-02", "p-03"],
    defaultOutcome: baselineOutcome,
    hasUnknownOutcome: false,
    unknownOutcomeGuidance: "No unknown outcome in dense fixture.",
    allowAuthorizedRetry: false,
  };
}

function buildBlockedScenario(): SessionBoardScenarioFixture {
  const blocked: SessionBoardProposal[] = baseProposals.map((proposal) =>
    proposal.proposalId === "p-02"
      ? {
          ...proposal,
          state: "blocked" as const,
          outcome: "blocked by unmet authority callback",
          protectedGates: [
            {
              title: "Authority callback",
              source: "Commander decision plane",
              unmetCondition: "No authoritative allocation callback is currently injected into this UI.",
            },
          ],
        }
      : proposal,
  );
  return {
    scenario: "blocked",
    heading: "Session Board (protected gate)",
    boundaryNotice: "Protected-gate state is visible and actionable guidance is explicit.",
    proposals: blocked,
    defaultSelectedIds: ["p-02", "p-01"],
    defaultOutcome: baselineOutcome,
    hasUnknownOutcome: false,
    unknownOutcomeGuidance: "No unknown outcome; authorization remains blocked by unmet gate.",
    allowAuthorizedRetry: false,
  };
}

function buildExceptionScenario(): SessionBoardScenarioFixture {
  const withUnknown: SessionBoardScenarioFixture = {
    scenario: "exception",
    heading: "Session Board (exception)",
    boundaryNotice: "Unknown-write outcome example. No retry control is offered in this synthetic state.",
    proposals: baseProposals,
    defaultSelectedIds: ["p-01", "p-02"],
    defaultOutcome: {
      ...baselineOutcome,
      progress: [...baselineOutcome.progress, "Hosted command outcome unknown; retained exact idempotency boundary displayed"],
      blockers: [
        ...baselineOutcome.blockers,
        "Unknown outcome retained; reconciliation guidance is manual only and replay is disabled.",
      ],
    },
    hasUnknownOutcome: true,
    unknownOutcomeGuidance:
      "This result is intentionally unknown and synthetic. No automatic retry is available in Synthetic Preview.",
    allowAuthorizedRetry: false,
  };
  return withUnknown;
}

function buildEmptyScenario(): SessionBoardScenarioFixture {
  return {
    scenario: "empty",
    heading: "Session Board empty set",
    boundaryNotice: "No proposals available in this synthetic deterministic fixture.",
    proposals: [],
    defaultSelectedIds: [],
    defaultOutcome: undefined,
    hasUnknownOutcome: false,
    unknownOutcomeGuidance: "Add proposals in the real candidate flow.",
    allowAuthorizedRetry: false,
  };
}

export function buildSessionBoardFixture(scenario: SessionBoardScenario): SessionBoardScenarioFixture {
  if (scenario === "blocked") return buildBlockedScenario();
  if (scenario === "exception") return buildExceptionScenario();
  if (scenario === "empty") return buildEmptyScenario();
  if (scenario === "dense") return buildDenseScenario();
  return buildNormalScenario();
}

export { SESSION_BOARD_CRITERIA_IDS as sessionBoardCriteriaIds };
