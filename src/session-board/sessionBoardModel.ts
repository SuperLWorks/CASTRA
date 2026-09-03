export const SESSION_BOARD_CRITERIA_IDS = [
  "SB-01",
  "SB-02",
  "SB-03",
  "SB-04",
  "SB-05",
  "SB-06",
  "SB-07",
  "SB-08",
  "SB-09",
  "SB-10",
  "SB-11",
  "SB-12",
] as const;

export const SESSION_BOARD_PENDING_HUMAN_IDENTITY = "Pending authoritative allocation";

export type SessionBoardCriteriaId = (typeof SESSION_BOARD_CRITERIA_IDS)[number];

export type SessionBoardState = "pending" | "protected" | "authorized" | "deferred" | "blocked" | "conflict" | "exception" | "empty";

export type SessionBoardScenario = "normal" | "dense" | "blocked" | "exception" | "empty";

export interface SessionBoardGate {
  title: string;
  source: string;
  unmetCondition?: string;
}

export interface SessionBoardProposal {
  proposalId: string;
  proposalLabel: string;
  humanIdentity: string;
  machineIdentity: string;
  shortMachineIdentity: string;
  fullMachineIdentity: string;
  branchHint: string;
  worktreeHint: string;
  state: SessionBoardState;
  outcome: string;
  dependencies: string[];
  expectedTimeMinutes: number;
  marginalCostUsd: number;
  risk: string;
  acceptanceCriteria: string[];
  protectedGates: SessionBoardGate[];
  lifecycleState: string;
  protectedNextGate: string;
}

export interface SessionBoardSummary {
  selectedCount: number;
  selectedTimeMinutes: number;
  selectedCostUsd: number;
  blockedReasons: string[];
  criticalProtectedGates: string[];
  effects: string[];
}

export interface SessionBoardSelection {
  selectedProposalIds: string[];
  summary: SessionBoardSummary;
  canAuthorize: boolean;
}

export type SessionBoardAuthorityStatus = "ready" | "submitting" | "applied" | "rejected" | "unknown";

export interface SessionBoardAuthority {
  status: SessionBoardAuthorityStatus;
  message: string;
  result: SessionBoardOutcome | null;
  onAuthorize: (selectedProposalIds: string[]) => void;
  onReconcile?: () => void;
}

export interface SessionBoardOneShotDecision {
  allowed: boolean;
}

export function canDispatchAuthorization(
  authority: SessionBoardAuthority | undefined,
  selection: SessionBoardSelection,
  hasDispatched: boolean,
): SessionBoardOneShotDecision {
  return {
    allowed: authority?.status === "ready" && selection.canAuthorize && !hasDispatched,
  };
}

export function canDispatchReconcile(
  authority: SessionBoardAuthority | undefined,
  hasDispatched: boolean,
): SessionBoardOneShotDecision {
  return {
    allowed: authority?.status === "unknown" && Boolean(authority.onReconcile) && !hasDispatched,
  };
}

export function canRenderAuthorityResult(
  allowRehearsal: boolean,
  rehearsalAuthorized: boolean,
  authority: SessionBoardAuthority | undefined,
): boolean {
  return allowRehearsal
    ? rehearsalAuthorized
    : authority?.status === "applied" && authority.result !== null;
}

export function getAuthorityResult(authority: SessionBoardAuthority | undefined): SessionBoardOutcome | undefined {
  if (authority?.status === "applied") {
    return authority.result ?? undefined;
  }
  return undefined;
}

export interface SessionBoardOutcome {
  receiptIdentity: string;
  fullOpaqueIdentity: string;
  machineOpaqueIdentity: string;
  receiptBranch: string;
  receiptWorktree: string;
  progress: string[];
  verification: string[];
  blockers: string[];
  freshness: string;
  nextGate: string;
}

export interface SessionBoardScenarioFixture {
  scenario: SessionBoardScenario;
  heading: string;
  boundaryNotice: string;
  proposals: SessionBoardProposal[];
  defaultSelectedIds: string[];
  defaultOutcome?: SessionBoardOutcome;
  hasUnknownOutcome: boolean;
  unknownOutcomeGuidance: string;
  allowAuthorizedRetry: boolean;
}

export function buildSelectionSummary(
  proposals: ReadonlyArray<SessionBoardProposal>,
  selectedIds: ReadonlyArray<string>,
): SessionBoardSelection {
  const knownProposalIds = new Set(proposals.map((proposal) => proposal.proposalId));
  const selectedProposalIdSet = new Set(selectedIds.filter((id) => knownProposalIds.has(id)));
  const selectedProposalIds = proposals
    .map((proposal) => proposal.proposalId)
    .filter((id) => selectedProposalIdSet.has(id));
  let selectedTimeMinutes = 0;
  let selectedCostUsd = 0;
  const blockedReasons: string[] = [];
  const criticalProtectedGates: string[] = [];
  const effects: string[] = [];

  for (const proposal of proposals) {
    if (!selectedProposalIdSet.has(proposal.proposalId)) {
      continue;
    }
    selectedTimeMinutes += proposal.expectedTimeMinutes;
    selectedCostUsd += proposal.marginalCostUsd;
    effects.push(proposal.outcome);
    const unmet = proposal.protectedGates.filter((gate) => gate.unmetCondition);
    if (
      proposal.state === "protected" ||
      proposal.state === "blocked" ||
      proposal.state === "conflict" ||
      proposal.state === "exception"
    ) {
      blockedReasons.push(`${proposal.humanIdentity}: ${proposal.outcome}`);
    }
    for (const gate of unmet) {
      criticalProtectedGates.push(`${gate.title}: ${gate.unmetCondition}`);
    }
  }

  return {
    selectedProposalIds,
    summary: {
      selectedCount: selectedProposalIds.length,
      selectedTimeMinutes,
      selectedCostUsd,
      blockedReasons,
      criticalProtectedGates,
      effects: Array.from(new Set(effects)),
    },
    canAuthorize: blockedReasons.length === 0 && criticalProtectedGates.length === 0 && selectedProposalIds.length > 0,
  };
}

export function findSelectionToggles(
  proposals: ReadonlyArray<SessionBoardProposal>,
  current: ReadonlyArray<string>,
  proposalId: string,
): string[] {
  const proposalIds = new Set(proposals.map((proposal) => proposal.proposalId));
  const selected = new Set(current.filter((id) => proposalIds.has(id)));
  const allowed = proposals.find((proposal) => proposal.proposalId === proposalId);
  if (!allowed) return [...selected];

  if (selected.has(proposalId)) {
    selected.delete(proposalId);
  } else if (allowed.state === "protected" || allowed.state === "blocked") {
    return [...selected];
  } else {
    selected.add(proposalId);
  }

  return [...selected];
}

export function selectionHasSelection(selection: ReadonlyArray<string>): boolean {
  return selection.length > 0;
}

export function formatUsd(value: number): string {
  if (value === 0) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);
}

export function formatMinutes(totalMinutes: number): string {
  if (totalMinutes === 0) return "0m";
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const remainder = totalMinutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
