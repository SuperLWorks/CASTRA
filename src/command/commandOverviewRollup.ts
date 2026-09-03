import { observedRuntime } from "../domain/aerarium";
import type { CastraState, OpenWorkIndexEntry, OpenWorkState } from "../domain/types";

/**
 * A deterministic, truthful traffic-light summary of the whole local Open
 * Work Index. `"blocked"` outranks `"attention"`, which outranks `"on_track"`.
 * This never manufactures urgency: an empty portfolio is `"on_track"`.
 */
export type CommandOverviewPortfolioHealth = "on_track" | "attention" | "blocked";

/**
 * The one next permitted action the compact Command Overview header leads
 * with. `available` is `false` only when the local Open Work Index has no
 * entry at all — in that case the header must render `Unavailable`/"No open
 * work", never a zero or a fabricated activity.
 */
export interface CommandOverviewNextPermittedAction {
  available: boolean;
  title: string;
  nextGate: string;
  owner: string;
  recordId: string | null;
  campaignId: string | null;
}

/**
 * Priority order used only to pick which single Open Work Index entry is
 * surfaced as "the one next permitted action". Reconciliation and blocked
 * work outrank routine work so the Commander is led to the most urgent gate
 * first; this ordering never changes `state`, `owner`, or `nextGate` values.
 */
const NEXT_PERMITTED_ACTION_PRIORITY: readonly OpenWorkState[] = [
  "reconciliation_required",
  "blocked",
  "commander_review",
  "ready_for_mission_closure",
  "in_progress",
  "open",
];

function pickNextPermittedActionEntry(openWork: readonly OpenWorkIndexEntry[]): OpenWorkIndexEntry | null {
  for (const priorityState of NEXT_PERMITTED_ACTION_PRIORITY) {
    const match = openWork.find((entry) => entry.state === priorityState);
    if (match) return match;
  }
  return null;
}

export function buildCommandOverviewRollup(state: CastraState, asOf: string) {
  const activeCampaigns = state.campaigns.filter((record) => !record.archivedAt);
  const activeMissions = state.missions.filter((record) => !record.archivedAt);
  const activeActions = state.actions.filter((record) => !record.archivedAt);
  const blockedActions = activeActions.filter((record) => record.status === "blocked");
  const openPunches = state.punchItems.filter((item) => ["open", "in_remediation", "ready_for_verification"].includes(item.status));
  const criticalOrHighOpenPunches = openPunches.filter((item) => item.severity === "critical" || item.severity === "high");
  const providerActual = state.aerariumMeasures.filter((measure) => measure.kind === "provider_actual");
  const allocatedSubscription = state.aerariumMeasures.filter((measure) => measure.kind === "allocated_subscription_cost");
  const apiEquivalentEstimate = state.aerariumMeasures.filter((measure) => measure.kind === "api_equivalent_estimate");
  const observedRuntimeMs = state.aerariumRuns.reduce((sum, run) => sum + observedRuntime(state, run.id, asOf).activeRuntimeMs, 0);

  const openWork = state.openWorkIndex;
  const blockedOpenWork = openWork.filter((entry) => entry.state === "blocked" || entry.state === "reconciliation_required");
  const attentionOpenWork = openWork.filter(
    (entry) => entry.state === "commander_review" || entry.state === "ready_for_mission_closure",
  );

  let portfolioHealth: CommandOverviewPortfolioHealth = "on_track";
  if (blockedActions.length > 0 || blockedOpenWork.length > 0) {
    portfolioHealth = "blocked";
  } else if (attentionOpenWork.length > 0 || criticalOrHighOpenPunches.length > 0) {
    portfolioHealth = "attention";
  }

  const nextPermittedActionEntry = pickNextPermittedActionEntry(openWork);
  const nextPermittedAction: CommandOverviewNextPermittedAction = nextPermittedActionEntry
    ? {
        available: true,
        title: nextPermittedActionEntry.title,
        nextGate: nextPermittedActionEntry.nextGate || "Unavailable",
        owner: nextPermittedActionEntry.owner || "Unavailable",
        recordId: nextPermittedActionEntry.recordId,
        campaignId: nextPermittedActionEntry.campaignId,
      }
    : {
        available: false,
        title: "No open work is recorded in the local Open Work Index.",
        nextGate: "Unavailable",
        owner: "Unavailable",
        recordId: null,
        campaignId: null,
      };

  return {
    campaigns: activeCampaigns.length,
    missions: activeMissions.length,
    actions: activeActions.length,
    completedActions: activeActions.filter((record) => record.status === "completed").length,
    blockedActions: blockedActions.length,
    openPunches: openPunches.length,
    observedRuntimeMs,
    providerActualMinor: providerActual.reduce((sum, item) => sum + item.value, 0),
    allocatedSubscriptionMinor: allocatedSubscription.reduce((sum, item) => sum + item.value, 0),
    apiEquivalentEstimateMinor: apiEquivalentEstimate.reduce((sum, item) => sum + item.value, 0),
    providerActualAvailable: providerActual.length > 0,
    allocatedSubscriptionAvailable: allocatedSubscription.length > 0,
    apiEquivalentEstimateAvailable: apiEquivalentEstimate.length > 0,
    portfolioHealth,
    nextPermittedAction,
  };
}
