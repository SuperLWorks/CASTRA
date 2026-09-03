import { applyCommand, emptyState } from "../domain/commands";
import { deploymentAssessmentOf, deploymentEligibilityTemplate } from "../domain/deploymentEligibility";
import type {
  CastraCommand,
  CastraState,
  CommandContext,
  IdKind,
  UIReviewDestination,
  UIReviewScenario,
  UIReviewStandardState,
} from "../domain/types";

export const UI03_FIXTURE_ID = "castra-ui03-populated-prototype";
export const UI03_FIXTURE_REVISION = "C001.M010.A002.fixture.r1";
export const UI03_FIXTURE_TIMESTAMP = "2026-08-10T12:00:00.000Z";
export const UI03_REVIEW_SESSION_KEY = "castra.ui03.review-session.v1";

export interface UI03ReviewCase {
  logicalId: string;
  destination: UIReviewDestination;
  destinationLabel: string;
  scenario: UIReviewScenario;
  standardState: UIReviewStandardState;
  inspectionFocus: string;
  knownIntentionalGaps: string;
  requestedDecision: string;
}

export interface UI03FixtureManifest {
  contract: "castra.ui-review.fixture-manifest";
  contractVersion: 1;
  fixtureId: typeof UI03_FIXTURE_ID;
  fixtureRevision: typeof UI03_FIXTURE_REVISION;
  fixedTimestamp: typeof UI03_FIXTURE_TIMESTAMP;
  authority: "demonstration_only";
  persistence: "ephemeral_session_projection";
  authoritativeWrites: false;
  externalActions: false;
  visibleLabel: "DEMONSTRATION DATA · NOT AUTHORITATIVE";
  scenarios: UIReviewScenario[];
  reviewCases: UI03ReviewCase[];
}

const destinations: Array<{
  destination: UIReviewDestination;
  label: string;
  focus: string;
  gap: string;
  decision: string;
}> = [
  { destination: "overview", label: "Command Overview", focus: "Readiness, hierarchy rollups, approvals, and exception visibility.", gap: "Review Mode does not exercise live editing or cross-device persistence.", decision: "Is the command-post summary sufficient to orient a Commander?" },
  { destination: "campaigns", label: "Campaigns, Missions, and Actions", focus: "Hierarchy, approval state, deployment eligibility, notes, blocked work, and archive cues.", gap: "Fixture records are read-only and cannot prove authoring ergonomics.", decision: "Is hierarchy and current authority discoverable at operational density?" },
  { destination: "testing", label: "Testing and Punch Items", focus: "Plan/cycle/case/result relationships, immutable adverse results, Punch verification, FIREWATCH, and exit gates.", gap: "A003 owns UI-review findings and Punch creation; this packet records none.", decision: "Are quality state, unresolved work, and exit authority understandable?" },
  { destination: "aerarium", label: "AERARIUM", focus: "Observed runtime, provider actual, subscription allocation, token estimate, API-equivalent estimate, and unavailable/provisional labels.", gap: "All displayed values are fixed synthetic fixture values, not provider telemetry.", decision: "Are separate measure types and provenance legible without blending actuals and estimates?" },
  { destination: "graph", label: "Commander Graph", focus: "Source-backed nodes/edges, provenance legend, traceability, and deterministic gaps.", gap: "No external Graphify connection or write-back is exercised.", decision: "Can the Commander explain why important nodes, relationships, and gaps exist?" },
  { destination: "team", label: "Team / Roles", focus: "Themed role names, canonical IDs, icons, compact labels, and protected authority boundaries.", gap: "Review Mode disables role edits; persistence is covered by existing tests.", decision: "Are themed roles clear without obscuring canonical identity or authority?" },
  { destination: "configuration", label: "Configuration", focus: "Theme profiles, semantic tokens, label modes, version lineage, and no-data-reset boundary.", gap: "Configuration controls are intentionally disabled in Review Mode.", decision: "Is the presentation configuration understandable and safely separated from authority?" },
  { destination: "deployment-workbench", label: "Deployment Workbench", focus: "Preview/Production separation, exact request evidence, manual receipts, blocks, and no-provider boundary.", gap: "No provider connection, deployment, DNS change, or credential flow exists.", decision: "Does the workbench distinguish governed evidence from actual provider action?" },
  { destination: "remote-work", label: "Remote Workbench", focus: "Proposal/approval binding, Companion state, job/attempt/unknown receipt, provider readiness, and evidence buckets.", gap: "All Companion/job behavior is deterministic simulation; live remote execution is absent.", decision: "Are local simulation, unconfigured provider state, and at-most-once uncertainty unmistakable?" },
];

const scenarios: Array<{ scenario: UIReviewScenario; standardState: UIReviewStandardState }> = [
  { scenario: "normal", standardState: "normal" },
  { scenario: "dense", standardState: "dense" },
  { scenario: "blocked", standardState: "permission_blocked" },
  { scenario: "exception", standardState: "error" },
  { scenario: "empty", standardState: "empty" },
];

export const UI03_FIXTURE_MANIFEST: UI03FixtureManifest = {
  contract: "castra.ui-review.fixture-manifest",
  contractVersion: 1,
  fixtureId: UI03_FIXTURE_ID,
  fixtureRevision: UI03_FIXTURE_REVISION,
  fixedTimestamp: UI03_FIXTURE_TIMESTAMP,
  authority: "demonstration_only",
  persistence: "ephemeral_session_projection",
  authoritativeWrites: false,
  externalActions: false,
  visibleLabel: "DEMONSTRATION DATA · NOT AUTHORITATIVE",
  scenarios: scenarios.map((item) => item.scenario),
  reviewCases: destinations.flatMap((screen) => scenarios.map((state) => ({
    logicalId: `ui03-${screen.destination}-${state.scenario}`,
    destination: screen.destination,
    destinationLabel: screen.label,
    scenario: state.scenario,
    standardState: state.standardState,
    inspectionFocus: screen.focus,
    knownIntentionalGaps: state.scenario === "empty"
      ? `${screen.gap} Empty is reviewed separately and is not populated-prototype evidence.`
      : screen.gap,
    requestedDecision: screen.decision,
  }))),
};

export interface UI03ReviewSession {
  contractVersion: 1;
  fixtureId: typeof UI03_FIXTURE_ID;
  fixtureRevision: typeof UI03_FIXTURE_REVISION;
  scenario: UIReviewScenario;
  authoritativeDigest: string;
}

export type UI03BlockedAction = "authoritative_command" | "external_action" | "model_or_connector";

export function requireUI03ReviewReadOnly(action: UI03BlockedAction): never {
  const label = action.replaceAll("_", " ");
  throw new Error(`UI-03 Review Mode rejects ${label}; authoritative and external state remain unchanged.`);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

export function authoritativeStateDigest(state: CastraState): string {
  const text = JSON.stringify(stableValue(state));
  let high = 0x9e3779b9;
  let low = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    low = Math.imul(low ^ text.charCodeAt(index), 0x01000193);
    high = Math.imul(high ^ (text.charCodeAt(index) + index), 0x85ebca6b);
  }
  return `castra-state-v1:${(high >>> 0).toString(16).padStart(8, "0")}${(low >>> 0).toString(16).padStart(8, "0")}`;
}

function fixtureContext(): CommandContext {
  const counters = new Map<IdKind, number>();
  let timeTick = 0;
  return {
    id: (kind) => {
      const next = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, next);
      return `${kind}_ui03_${String(next).padStart(3, "0")}`;
    },
    now: () => new Date(Date.parse(UI03_FIXTURE_TIMESTAMP) + timeTick++ * 1_000).toISOString(),
    commandAuthority: "Commander",
  };
}

function dispatch(state: CastraState, context: CommandContext, command: CastraCommand): CastraState {
  return applyCommand(state, command, context);
}

function eligibleAssessment() {
  return {
    ...deploymentAssessmentOf(deploymentEligibilityTemplate()),
    webDeploymentIntent: "intended" as const,
    brandedSubdomainRequirement: "required" as const,
    standardPattern: "applies" as const,
    commercialUse: "commercial_branded" as const,
    providerEligibility: "verified_eligible" as const,
    proposedHostname: "castra.superlworks.com",
    dnsAuthorityState: "SYNTHETIC REVIEW: Porkbun authority; no DNS state inspected or changed.",
    exportImportImplication: "SYNTHETIC REVIEW: IndexedDB export/import remains separate and browser-origin scoped.",
    hostedPersistenceImplication: "SYNTHETIC REVIEW: hosted UI does not imply shared persistence.",
    authenticationImplication: "SYNTHETIC REVIEW: hosted identity remains a separate controlled capability.",
    synchronizationImplication: "SYNTHETIC REVIEW: no multi-device synchronization is claimed.",
    migrationImplication: "SYNTHETIC REVIEW: no data migration is performed.",
    providerChangeAssessment: "SYNTHETIC REVIEW: plan, cost, capability, terms, and policy require fresh evidence.",
    evidenceReference: "fixture://ui03/deployment-eligibility",
  };
}

function buildHierarchy(state: CastraState, context: CommandContext, scenario: UIReviewScenario): CastraState {
  state = dispatch(state, context, { type: "campaign.create", title: "SYNTHETIC · CASTRA Release 1", description: "UI-03 review Campaign; demonstration data only.", commanderIntent: "Review a deterministic, evidence-first mission command interface without changing Commander records.", notes: "Fixture revision C001.M010.A002.fixture.r1" });
  const campaignId = state.campaigns[0].id;
  state = dispatch(state, context, { type: "campaign.deployment_eligibility.update", campaignId, assessment: eligibleAssessment() });
  state = dispatch(state, context, { type: "campaign.deployment_eligibility.disposition", campaignId, disposition: "eligible", explanation: "SYNTHETIC REVIEW ONLY: fixed fixture evidence satisfies the demonstration gate." });
  state = dispatch(state, context, { type: "record.approve", entityType: "campaign", entityId: campaignId });

  const missionTitles = scenario === "dense"
    ? ["Experience verification", "Governed local compute", "Deployment readiness", "Evidence operations"]
    : ["Experience verification", "Governed local compute", "Deployment readiness"];
  for (const [index, title] of missionTitles.entries()) {
    state = dispatch(state, context, { type: "mission.create", campaignId, title: `SYNTHETIC · ${title}`, description: `Fixed mission ${index + 1} for the ${scenario} review scenario.`, notes: "Demonstration record" });
    state = dispatch(state, context, { type: "record.approve", entityType: "mission", entityId: state.missions.at(-1)!.id });
  }
  const actionDefinitions = [
    { mission: 0, title: "Prepare UI-03 review packet", kind: "standard" as const },
    { mission: 0, title: "Resolve evidence navigation finding", kind: "standard" as const },
    { mission: 1, title: "Validate draft-only remote boundary", kind: "standard" as const },
    { mission: 2, title: "Record Manual-Assist deployment evidence", kind: "deployment" as const },
  ];
  if (scenario === "dense") {
    actionDefinitions.push(
      { mission: 1, title: "Review Companion revocation behavior", kind: "standard" },
      { mission: 2, title: "Rehearse preview receipt reconciliation", kind: "deployment" },
      { mission: 3, title: "Inspect graph provenance gaps", kind: "standard" },
    );
  }
  for (const definition of actionDefinitions) {
    state = dispatch(state, context, { type: "action.create", missionId: state.missions[definition.mission].id, title: `SYNTHETIC · ${definition.title}`, description: "Read-only UI-03 fixture Action.", notes: "No external action", actionKind: definition.kind });
    const actionId = state.actions.at(-1)!.id;
    state = dispatch(state, context, { type: "record.transition", entityType: "action", entityId: actionId, status: "in_progress" });
    if ((scenario === "blocked" && definition === actionDefinitions[0]) || (scenario === "dense" && state.actions.length % 3 === 0)) {
      state = dispatch(state, context, { type: "record.transition", entityType: "action", entityId: actionId, status: "blocked" });
    } else if (state.actions.length % 2 === 0) {
      state = dispatch(state, context, {
        type: "action.close",
        commandId: `ui03-close-${actionId}`,
        actionId,
        expectedRevision: state.actions.at(-1)!.revision,
        reason: "Synthetic fixture closure for deterministic UI-state coverage.",
        evidenceReferences: ["fixture://ui03/governed-close"],
      });
    }
    state = dispatch(state, context, { type: "record.approve", entityType: "action", entityId: actionId });
  }
  return state;
}

function buildTesting(state: CastraState, context: CommandContext, scenario: UIReviewScenario): CastraState {
  const campaignId = state.campaigns[0].id;
  state = dispatch(state, context, { type: "test_plan.create", title: "SYNTHETIC · Release 1 local acceptance", description: "Fixed UI-03 testing evidence.", link: { type: "campaign", id: campaignId } });
  const planId = state.testPlans[0].id;
  state = dispatch(state, context, { type: "test_plan.status", testPlanId: planId, status: "active" });
  state = dispatch(state, context, { type: "test_cycle.create", testPlanId: planId, title: "SYNTHETIC · Round 1" });
  const cycleId = state.testCycles[0].id;
  state = dispatch(state, context, { type: "test_cycle.status", testCycleId: cycleId, status: "active" });

  const cases = scenario === "dense"
    ? ["Hierarchy persistence", "Punch linkage", "AERARIUM provenance", "Graph traceability", "Theme boundary", "Deployment block"]
    : ["Hierarchy persistence", "Punch linkage", "AERARIUM provenance"];
  for (const [index, title] of cases.entries()) {
    const adverse = index === 1 || (scenario === "blocked" && index === 0) || (scenario === "exception" && index === 2);
    state = dispatch(state, context, { type: "test_case.create", testPlanId: planId, title: `SYNTHETIC · ${title}`, expectedResult: "Deterministic evidence remains traceable and authoritative state is unchanged.", requirementReference: `fixture://ui03/requirement/${index + 1}`, sourceReference: `fixture://ui03/source/${index + 1}`, required: index !== 1, severity: adverse ? (scenario === "blocked" ? "critical" : "high") : "medium" });
    const caseId = state.testCases.at(-1)!.id;
    state = dispatch(state, context, { type: "test_case.status", testCaseId: caseId, status: "ready" });
    const outcome = adverse
      ? scenario === "exception" ? "blocked" as const : scenario === "blocked" ? "fail" as const : "accepted_with_follow_up" as const
      : "pass" as const;
    state = dispatch(state, context, { type: "test_result.record", testCaseId: caseId, testCycleId: cycleId, outcome,
      actualResult: outcome === "pass" ? "Fixed acceptance evidence matched." : outcome === "fail" ? "Fixed blocked-scenario failure." : outcome === "blocked" ? "Fixture dependency unavailable." : "Accepted with separately tracked synthetic follow-up.",
      executor: "FIREWATCH · SYNTHETIC", executedAt: `2026-08-10T12:${String(10 + index).padStart(2, "0")}:00.000Z`,
      evidenceReference: outcome === "blocked" ? "" : `fixture://ui03/test-result/${index + 1}`,
      resultReference: `fixture://ui03/result/${index + 1}`, unavailableReason: outcome === "blocked" ? "SYNTHETIC REVIEW: dependent screen evidence unavailable." : "" });
    if (["fail", "blocked", "accepted_with_follow_up"].includes(outcome)) {
      const resultId = state.testResults.at(-1)!.id;
      state = dispatch(state, context, { type: "punch_item.create_from_result", testResultId: resultId, title: `SYNTHETIC · Remediate ${title}`, description: "Separate fixed remediation record; original result preserved.", severity: adverse ? (scenario === "blocked" ? "critical" : "high") : "medium" });
      if (scenario !== "blocked" && scenario !== "exception") {
        const punchId = state.punchItems.at(-1)!.id;
        state = dispatch(state, context, { type: "punch_item.transition", punchItemId: punchId, status: "in_remediation" });
        state = dispatch(state, context, { type: "punch_item.transition", punchItemId: punchId, status: "ready_for_verification" });
        state = dispatch(state, context, { type: "punch_item.verify", punchItemId: punchId, evidenceReference: `fixture://ui03/punch-verified/${index + 1}` });
      }
    }
  }
  state = dispatch(state, context, { type: "test_cycle.status", testCycleId: cycleId, status: "completed" });
  state = dispatch(state, context, { type: "test_plan.status", testPlanId: planId, status: "exit_review" });
  state = dispatch(state, context, { type: "firewatch_verification.record", testPlanId: planId,
    outcome: scenario === "exception" ? "unavailable" : scenario === "blocked" ? "issues_found" : "verified",
    verifiedAt: "2026-08-10T12:30:00.000Z",
    evidenceReference: scenario === "exception" ? "" : "fixture://ui03/firewatch",
    unavailableReason: scenario === "exception" ? "SYNTHETIC REVIEW: independent verification unavailable." : "" });
  state = dispatch(state, context, { type: "exit_decision.record", testPlanId: planId,
    decision: scenario === "blocked" ? "fail" : scenario === "exception" ? "defer" : "conditional_pass",
    rationale: scenario === "blocked" ? "SYNTHETIC REVIEW: required failed test and critical Punch block exit." : scenario === "exception" ? "SYNTHETIC REVIEW: verification evidence unavailable." : "SYNTHETIC REVIEW: local slice may advance to the next defined gate; no release claim." });
  return state;
}

function buildAerarium(state: CastraState, context: CommandContext, scenario: UIReviewScenario): CastraState {
  state = dispatch(state, context, { type: "subscription_plan.version.create", name: "SYNTHETIC · Local tool plan", currency: "USD", planFeeMinor: 2_000, periodStart: "2026-08-01T00:00:00.000Z", periodEnd: "2026-09-01T00:00:00.000Z" });
  state = dispatch(state, context, { type: "price_card.version.create", name: "SYNTHETIC · API-equivalent card", currency: "USD", inputPerMillionMinor: 150, outputPerMillionMinor: 600 });
  state = dispatch(state, context, { type: "model_profile.version.create", name: "SYNTHETIC · Character estimate", modelKey: "fixture-local-model", roleId: "FORGE", charactersPerToken: 4, priceCardVersionId: state.priceCardVersions[0].id });
  state = dispatch(state, context, { type: "allocation_rule.version.create", name: "SYNTHETIC · Eligible active runtime", subscriptionPlanVersionId: state.subscriptionPlanVersions[0].id, eligibleRoleIds: ["FORGE", "FIREWATCH"] });
  state = dispatch(state, context, { type: "budget_settings.version.create", name: "SYNTHETIC · Commander review budget", currency: "USD", budgetMinor: 10_000, confirmationThresholdMinor: 2_500, requireConfirmation: true });
  state = dispatch(state, context, { type: "aerarium_run.create", title: "SYNTHETIC · UI-03 evidence preparation", work: { type: "campaign", id: state.campaigns[0].id }, roleId: "FORGE", modelKey: "fixture-local-model", startedAt: "2026-08-10T09:00:00.000Z" });
  const runId = state.aerariumRuns[0].id;
  state = dispatch(state, context, { type: "aerarium_run_event.append", runId, eventType: "pause", occurredAt: "2026-08-10T09:10:00.000Z", note: "SYNTHETIC · Commander review pause", outcome: "", inputCharacters: null, outputCharacters: null });
  state = dispatch(state, context, { type: "aerarium_run_event.append", runId, eventType: "resume", occurredAt: "2026-08-10T09:12:00.000Z", note: "SYNTHETIC · Review resumed", outcome: "", inputCharacters: null, outputCharacters: null });
  state = dispatch(state, context, { type: "aerarium_run_event.append", runId, eventType: "outcome", occurredAt: "2026-08-10T09:20:00.000Z", note: "Fixed counts are fixture inputs, not telemetry.", outcome: "SYNTHETIC · Review packet drafted", inputCharacters: 4_000, outputCharacters: 1_200 });
  state = dispatch(state, context, { type: "aerarium_run_event.append", runId, eventType: "end", occurredAt: "2026-08-10T09:30:00.000Z", note: "SYNTHETIC · Fixed end stamp", outcome: "", inputCharacters: null, outputCharacters: null });
  state = dispatch(state, context, { type: "aerarium_estimate.snapshot", runId });
  state = dispatch(state, context, { type: "aerarium_provider_actual.record", runId, valueMinor: 325, currency: "USD", evidenceReference: "fixture://ui03/manual-provider-actual" });
  state = dispatch(state, context, { type: "aerarium_allocation.snapshot", runId, allocationRuleVersionId: state.allocationRuleVersions[0].id, asOf: "2026-08-10T10:00:00.000Z" });
  if (scenario === "dense" || scenario === "exception") {
    state = dispatch(state, context, { type: "aerarium_run.create", title: scenario === "exception" ? "SYNTHETIC · Unresolved interrupted run" : "SYNTHETIC · Dense assurance review", work: { type: "action", id: state.actions[0].id }, roleId: "FIREWATCH", modelKey: "unmatched-fixture-model", startedAt: "2026-08-10T10:00:00.000Z" });
    const secondRun = state.aerariumRuns.at(-1)!.id;
    state = dispatch(state, context, { type: "aerarium_run_event.append", runId: secondRun, eventType: scenario === "exception" ? "blocked" : "outcome", occurredAt: "2026-08-10T10:15:00.000Z", note: "SYNTHETIC · No matching profile; estimates remain unavailable.", outcome: scenario === "exception" ? "" : "SYNTHETIC · Dense evidence reviewed", inputCharacters: null, outputCharacters: null });
  }
  return state;
}

function buildPresentation(state: CastraState, context: CommandContext): CastraState {
  state = dispatch(state, context, { type: "presentation.profile.apply", themeProfileId: "roman_command" });
  state = dispatch(state, context, { type: "presentation.profile.apply", themeProfileId: "slw_oil_gas" });
  state = dispatch(state, context, { type: "presentation.role.update", canonicalId: "FORGE", displayName: "FORGE · Delivery Engineering", compactCode: "FRG", icon: "forge", accentColor: "#d8b45a", description: "SYNTHETIC REVIEW display configuration; canonical FORGE authority is unchanged." });
  return dispatch(state, context, { type: "presentation.label_mode.change", labelMode: "icon_compact" });
}

function buildDeployment(state: CastraState, context: CommandContext, scenario: UIReviewScenario): CastraState {
  const campaignId = state.campaigns[0].id;
  const actionId = state.actions.find((action) => action.actionKind === "deployment")!.id;
  state = dispatch(state, context, { type: "deployment_request.create", providerLabel: "Vercel + Porkbun", environment: "preview", sourceBuildReference: "fixture://ui03/build/r1", targetHostname: "castra.superlworks.com", campaignId, actionId });
  const previewRequestId = state.deploymentRequests[0].id;
  state = dispatch(state, context, { type: "deployment_request.decide", requestId: previewRequestId, decision: "approved", reason: "SYNTHETIC REVIEW: exact Preview request approved inside fixture only.", expiresAt: "2026-08-10T14:00:00.000Z" });
  state = dispatch(state, context, { type: "deployment_handoff.request", requestId: previewRequestId });
  state = dispatch(state, context, { type: "deployment_receipt.record", requestId: previewRequestId, state: "attempted", providerUrl: "", providerStatusReference: "", domainReference: "", observedAt: "2026-08-10T12:40:00.000Z", redactedEvidenceReference: "", reason: "SYNTHETIC REVIEW: fixed manual attempt receipt." });
  state = dispatch(state, context, { type: "deployment_receipt.record", requestId: previewRequestId, state: "verified", providerUrl: "https://synthetic-castra-preview.example.test", providerStatusReference: "fixture://ui03/provider/preview-status", domainReference: "fixture://ui03/domain/preview", observedAt: "2026-08-10T12:45:00.000Z", redactedEvidenceReference: "fixture://ui03/deployment/preview-verified", reason: "SYNTHETIC REVIEW: fixed verified Preview receipt; no provider call occurred." });
  const previewReceiptId = state.deploymentReceipts.find((receipt) => receipt.requestId === previewRequestId && receipt.state === "verified")!.id;
  state = dispatch(state, context, { type: "deployment_request.create", providerLabel: "Vercel + Porkbun", environment: "production", sourceBuildReference: "fixture://ui03/build/r1", targetHostname: "castra.superlworks.com", campaignId, actionId, previewReceiptId });
  const productionId = state.deploymentRequests.at(-1)!.id;
  if (scenario !== "blocked") {
    state = dispatch(state, context, { type: "deployment_request.decide", requestId: productionId, decision: "approved", reason: "SYNTHETIC REVIEW: exact Production request approved inside fixture only.", expiresAt: "2026-08-10T14:00:00.000Z" });
    state = dispatch(state, context, { type: "deployment_handoff.request", requestId: productionId });
    state = dispatch(state, context, { type: "deployment_receipt.record", requestId: productionId, state: "attempted", providerUrl: "", providerStatusReference: "", domainReference: "", observedAt: "2026-08-10T12:50:00.000Z", redactedEvidenceReference: "", reason: "SYNTHETIC REVIEW: fixed Production attempt receipt." });
    const terminal = scenario === "exception" ? "unknown" as const : "verified" as const;
    state = dispatch(state, context, { type: "deployment_receipt.record", requestId: productionId, state: terminal,
      providerUrl: terminal === "verified" ? "https://castra.superlworks.com" : "",
      providerStatusReference: terminal === "verified" ? "fixture://ui03/provider/production-status" : "",
      domainReference: terminal === "verified" ? "fixture://ui03/domain/production" : "",
      observedAt: "2026-08-10T12:55:00.000Z",
      redactedEvidenceReference: terminal === "verified" ? "fixture://ui03/deployment/production-verified" : "",
      reason: terminal === "verified" ? "SYNTHETIC REVIEW: fixed evidence-only receipt." : "SYNTHETIC REVIEW: external outcome is unknown; no automatic retry." });
  }
  return state;
}

function buildRemote(state: CastraState, context: CommandContext, scenario: UIReviewScenario): CastraState {
  state = dispatch(state, context, { type: "local_model.policy.version.create", name: "SYNTHETIC · Remote draft-only policy", workflowKey: "remote_work", activityKey: "commander_intent_draft", riskTier: "low", productOwnerPermitted: true, enabled: true, allowedModelNames: ["qwen3:0.6b"], roleId: "SARGE", rolePreferredModelNames: ["qwen3:0.6b"], requiredCapability: "completion", maxInputCharacters: 4_000, maxOutputTokens: 256 });
  const policyId = state.localModelPolicyVersions[0].id;
  state = dispatch(state, context, { type: "local_model.catalog.record", adapterId: "ollama_loopback", adapterVersion: "fixture-only/1", catalogVersion: "fixture-catalog/1", endpointOrigin: "http://127.0.0.1:11434", locality: "fixed_os_loopback", localityEvidence: "SYNTHETIC REVIEW ONLY: deterministic catalog record; no runtime call.", runtimeStatus: "healthy", runtimeVersion: "fixture-not-observed", models: [{ name: "qwen3:0.6b", digest: "sha256:fixture-qwen3-06b", sizeBytes: 1, modifiedAt: UI03_FIXTURE_TIMESTAMP, capabilities: ["completion"] }], unavailableReason: "", observedAt: UI03_FIXTURE_TIMESTAMP });
  state = dispatch(state, context, { type: "remote_work.companion.register_placeholder", displayName: "SYNTHETIC · Windows current-user Companion", publicFingerprintPlaceholder: "PLACEHOLDER:UI03_NO_KEY" });
  const companionId = state.remoteCompanionRegistrations[0].id;
  state = dispatch(state, context, { type: "remote_work.companion.session.set", companionId, sessionState: "ready" });
  state = dispatch(state, context, { type: "remote_work.proposal.create", source: "voice", sourceText: "SYNTHETIC supplied facts: draft a two-sentence Commander intent; do not research, approve, or mutate records.", sourceReference: "fixture://ui03/remote/source", target: { type: "commander_intent_draft", id: "fixture-intent" }, allowedActivity: "commander_intent_draft", runtimeSelection: { runtimeKind: "local_ollama", runtimeReference: "ollama_loopback", modelPolicyVersionId: policyId, selectedModelName: "qwen3:0.6b", selectedModelDigest: "sha256:fixture-qwen3-06b" } });
  const proposalId = state.remoteWorkProposals[0].id;
  state = dispatch(state, context, { type: "remote_work.proposal.decide", proposalId, decision: "approved", reason: "SYNTHETIC REVIEW: exact low-risk draft-only content binding.", expiresAt: "2026-08-10T19:00:00.000Z" });
  state = dispatch(state, context, { type: "remote_work.job.release", proposalId, companionId });
  const jobId = state.remoteWorkJobs[0].id;
  state = dispatch(state, context, { type: "remote_work.job.claim", jobId, companionId, leaseExpiresAt: "2026-08-10T12:10:00.000Z" });
  const attemptId = state.remoteWorkAttempts[0].id;
  state = dispatch(state, context, { type: "remote_work.job.start", jobId, attemptId });
  state = dispatch(state, context, { type: "remote_work.job.outcome.record", jobId, attemptId,
    outcome: scenario === "exception" ? "failed" : "unknown", redactedResult: "",
    reasonCode: scenario === "exception" ? "fixture_companion_failure" : "fixture_connection_interrupted",
    reason: scenario === "exception" ? "SYNTHETIC REVIEW: Companion returned a fixed failure without model invocation." : "SYNTHETIC REVIEW: outcome cannot be proven; no silent duplicate or retry." });
  if (scenario === "blocked") {
    state = dispatch(state, context, { type: "remote_work.companion.disable", companionId, reason: "SYNTHETIC REVIEW: emergency-disable state." });
  }
  return state;
}

function buildUI03Packet(state: CastraState, context: CommandContext): CastraState {
  const campaignId = state.campaigns[0].id;
  state = dispatch(state, context, { type: "ui_review.plan.create", campaignId, applicability: "ui", applicabilityReason: "UI-bearing CASTRA Campaign", applicabilityEvidenceReference: "fixture://ui03/applicability", experienceIntent: "A Commander can inspect a realistic evidence-first command post without changing authoritative data.", devicesAndScreenSizes: "Desktop review at 1440×900; responsive intent recorded for later visual review.", themeAndNavigationPattern: "Commander-selected semantic theme and preserved left navigation.", requiredCheckpoints: ["UI-03"], demonstrationDataNeeds: "Fixed internally consistent hierarchy, testing, AERARIUM, graph, presentation, deployment, and remote evidence.", evidenceRequirement: "Complete screen/state inventory and browser evidence for all required destinations.", screenshotRequired: true });
  const plan = state.uiReviewPlans[0];
  const fixture = state.uiReviewFixtureContracts[0];
  state = {
    ...state,
    uiReviewFixtureContracts: state.uiReviewFixtureContracts.map((item) => item.id === fixture.id
      ? { ...item, namespace: `ui-review/${UI03_FIXTURE_ID}/${UI03_FIXTURE_REVISION}`, populated: true, status: "populated" }
      : item),
  };
  const checkpoint = state.uiReviewCheckpoints.find((item) => item.planId === plan.id && item.code === "UI-03")!;
  state = dispatch(state, context, { type: "ui_review.checkpoint.update", checkpointId: checkpoint.id, scope: "All required CASTRA destinations across Normal, Dense, Blocked, Exception, and Empty fixture scenarios.", coveredUiRevision: UI03_FIXTURE_REVISION, evidenceRequirement: "Inspect focus, intentional gaps, and requested decision for every destination/state; A003 records any disposition.", evidenceReferences: ["fixture://ui03/manifest", "docs://C001-M010-A002-UI03-POPULATED-PROTOTYPE"] });
  for (const screen of destinations) {
    const cases = UI03_FIXTURE_MANIFEST.reviewCases.filter((item) => item.destination === screen.destination);
    state = dispatch(state, context, { type: "ui_review.inventory.add", checkpointId: checkpoint.id,
      screenKey: `ui03-${screen.destination}`, screenName: screen.label, componentReference: `App/${screen.destination}`,
      states: [...new Set(cases.map((item) => item.standardState))], additionalStates: cases.map((item) => item.scenario),
      evidenceReferences: cases.map((item) => `fixture://${item.logicalId}`), fixtureContractId: fixture.id,
      targetAuthority: "ui_review_fixture", destination: screen.destination,
      inspectionFocus: screen.focus, knownIntentionalGaps: screen.gap, requestedDecision: screen.decision });
  }
  state = dispatch(state, context, { type: "ui_review.checkpoint.ready", checkpointId: checkpoint.id });
  return state;
}

function emptyScenario(packetState: CastraState): CastraState {
  return {
    ...emptyState(),
    uiReviewPlans: packetState.uiReviewPlans,
    uiReviewFixtureContracts: packetState.uiReviewFixtureContracts,
    uiReviewCheckpoints: packetState.uiReviewCheckpoints,
    uiReviewInventoryEntries: packetState.uiReviewInventoryEntries,
    auditEvents: packetState.auditEvents.filter((event) => event.entityType.startsWith("ui_review_")),
    nextAuditSequence: packetState.auditEvents.filter((event) => event.entityType.startsWith("ui_review_")).length + 1,
  };
}

export function buildUI03ReviewState(scenario: UIReviewScenario): CastraState {
  const context = fixtureContext();
  let state = buildHierarchy(emptyState(), context, scenario);
  state = buildTesting(state, context, scenario);
  state = buildAerarium(state, context, scenario);
  state = buildPresentation(state, context);
  state = buildDeployment(state, context, scenario);
  state = buildRemote(state, context, scenario);
  state = buildUI03Packet(state, context);
  return scenario === "empty" ? emptyScenario(state) : state;
}

export function validateReviewSession(value: unknown, currentAuthoritativeDigest: string): UI03ReviewSession | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<UI03ReviewSession>;
  if (candidate.contractVersion !== 1 || candidate.fixtureId !== UI03_FIXTURE_ID || candidate.fixtureRevision !== UI03_FIXTURE_REVISION) return null;
  if (!candidate.scenario || !UI03_FIXTURE_MANIFEST.scenarios.includes(candidate.scenario)) return null;
  if (candidate.authoritativeDigest !== currentAuthoritativeDigest) return null;
  return candidate as UI03ReviewSession;
}
