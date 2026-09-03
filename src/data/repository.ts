import { emptyState } from "../domain/commands";
import type { CastraState } from "../domain/types";
import { normalizeDeploymentEligibility } from "../domain/deploymentEligibility";
import { findAuthSecretViolations } from "../domain/authentication";
import { normalizeActionOperationalContext, refreshOpenWorkProjection } from "../domain/openWork";

export interface StateRepository {
  load(): Promise<CastraState>;
  save(state: CastraState): Promise<void>;
}

export function normalizeState(stored: Partial<CastraState> | undefined): CastraState {
  const clean = emptyState();
  if (!stored) return clean;
  const redactedText = (value: string, fallback: string): string => findAuthSecretViolations(value).length ? fallback : value;
  const redactedDetail = (detail: Record<string, string> | undefined): Record<string, string> => Object.fromEntries(
    Object.entries(detail ?? {}).filter(([key, value]) => findAuthSecretViolations({ [key]: value }).length === 0),
  );
  const normalized: CastraState = {
    ...clean,
    schemaVersion: 13,
    migrationProvenance: stored.migrationProvenance ?? [],
    nextAuditSequence: stored.nextAuditSequence ?? clean.nextAuditSequence,
    nextAuthEventSequence: stored.nextAuthEventSequence ?? 1,
    campaigns: (stored.campaigns ?? []).map((campaign) => ({
      ...campaign,
      deploymentEligibility: normalizeDeploymentEligibility(campaign.deploymentEligibility),
    })),
    missions: stored.missions ?? [],
    actions: (stored.actions ?? []).map((action) => ({
      ...action,
      actionKind: action.actionKind === "deployment" ? "deployment" : "standard",
      operationalContext: normalizeActionOperationalContext(action.operationalContext),
      followUpToActionId: typeof action.followUpToActionId === "string" ? action.followUpToActionId : null,
    })),
    openWorkIndex: [],
    missionOpenWorkRollups: [],
    lifecycleCommandReceipts: (stored.lifecycleCommandReceipts ?? []).map((receipt) => ({
      commandId: receipt.commandId,
      commandType: receipt.commandType,
      entityType: receipt.entityType,
      entityId: receipt.entityId,
      expectedRevision: receipt.expectedRevision,
      resultingRevision: receipt.resultingRevision,
      binding: receipt.binding,
      reason: redactedText(receipt.reason, "Redacted lifecycle reason."),
      evidenceReferences: receipt.evidenceReferences
        .map((reference) => redactedText(reference, "redacted-unavailable"))
        .filter((reference) => reference !== "redacted-unavailable"),
      auditSequence: receipt.auditSequence,
      followUpActionId: receipt.followUpActionId ?? null,
      occurredAt: receipt.occurredAt,
    })),
    commandConnectorIdentityReceipts: (stored.commandConnectorIdentityReceipts ?? []).map((receipt) => ({
      ...receipt,
      identityReference: redactedText(receipt.identityReference, "redacted-identity"),
      sessionReference: redactedText(receipt.sessionReference, "redacted-session"),
      evidenceReference: redactedText(receipt.evidenceReference, "redacted-unavailable"),
      secretMaterialStored: false,
    })),
    commandConnectorResultPackages: (stored.commandConnectorResultPackages ?? []).map((result) => ({
      ...result,
      agentIdentity: redactedText(result.agentIdentity, "redacted-agent"),
      modelIdentity: redactedText(result.modelIdentity, "unavailable"),
      evidenceReferences: result.evidenceReferences.map((reference) => redactedText(reference, "redacted-unavailable")),
      tests: result.tests.map((test) => ({
        ...test,
        evidenceReference: redactedText(test.evidenceReference, "redacted-unavailable"),
      })),
      blockers: result.blockers.map((blocker) => redactedText(blocker, "Redacted blocker.")),
      effortCostProvenance: redactedText(result.effortCostProvenance, "Unavailable"),
      nextStepRecommendation: redactedText(result.nextStepRecommendation, "Unavailable"),
    })),
    commandConnectorReceipts: (stored.commandConnectorReceipts ?? []).map((receipt) => ({
      ...receipt,
      reason: redactedText(receipt.reason, "Redacted connector outcome."),
      directDatabaseWrite: false,
    })),
    testPlans: stored.testPlans ?? [],
    testCycles: stored.testCycles ?? [],
    testCases: stored.testCases ?? [],
    testResults: stored.testResults ?? [],
    punchItems: (stored.punchItems ?? []).map((punch) => ({
      ...punch,
      testPlanId: punch.testPlanId ?? null,
      testResultId: punch.testResultId ?? null,
      source: punch.source === "ui_review" ? "ui_review" : "test_result",
      uiReviewItemId: punch.uiReviewItemId ?? null,
      uiReviewDecisionId: punch.uiReviewDecisionId ?? null,
    })),
    firewatchVerifications: stored.firewatchVerifications ?? [],
    exitDecisions: stored.exitDecisions ?? [],
    aerariumRuns: stored.aerariumRuns ?? [],
    aerariumRunEvents: stored.aerariumRunEvents ?? [],
    aerariumMeasures: stored.aerariumMeasures ?? [],
    subscriptionPlanVersions: stored.subscriptionPlanVersions ?? [],
    modelProfileVersions: stored.modelProfileVersions ?? [],
    priceCardVersions: stored.priceCardVersions ?? [],
    allocationRuleVersions: stored.allocationRuleVersions ?? [],
    budgetSettingsVersions: stored.budgetSettingsVersions ?? [],
    presentationVersions: (stored.presentationVersions ?? []).map((version) => ({
      ...version,
      modelSelections: version.modelSelections ?? [],
    })),
    localModelPolicyVersions: stored.localModelPolicyVersions ?? [],
    localModelCatalogObservations: stored.localModelCatalogObservations ?? [],
    localModelInvocations: stored.localModelInvocations ?? [],
    localModelProposals: stored.localModelProposals ?? [],
    localModelReviews: stored.localModelReviews ?? [],
    remoteWorkProposals: stored.remoteWorkProposals ?? [],
    remoteCommanderDecisions: stored.remoteCommanderDecisions ?? [],
    remoteCompanionRegistrations: stored.remoteCompanionRegistrations ?? [],
    remoteWorkJobs: stored.remoteWorkJobs ?? [],
    remoteWorkAttempts: stored.remoteWorkAttempts ?? [],
    remoteWorkReceipts: stored.remoteWorkReceipts ?? [],
    deploymentRequests: stored.deploymentRequests ?? [],
    deploymentCommanderDecisions: stored.deploymentCommanderDecisions ?? [],
    deploymentReceipts: stored.deploymentReceipts ?? [],
    uiReviewPlans: stored.uiReviewPlans ?? [],
    uiReviewFixtureContracts: stored.uiReviewFixtureContracts ?? [],
    uiReviewCheckpoints: stored.uiReviewCheckpoints ?? [],
    uiReviewInventoryEntries: (stored.uiReviewInventoryEntries ?? []).map((entry) => ({
      ...entry,
      destination: entry.destination ?? null,
      inspectionFocus: entry.inspectionFocus ?? "",
      knownIntentionalGaps: entry.knownIntentionalGaps ?? "",
      requestedDecision: entry.requestedDecision ?? "",
    })),
    uiReviewItems: stored.uiReviewItems ?? [],
    uiReviewDecisions: stored.uiReviewDecisions ?? [],
    uiReviewInvalidations: stored.uiReviewInvalidations ?? [],
    uiReviewPunchLinks: stored.uiReviewPunchLinks ?? [],
    welcomeAccessConfigurationVersions: (stored.welcomeAccessConfigurationVersions ?? []).map((version) => ({
      id: version.id,
      familyId: version.familyId,
      version: version.version,
      supersedesId: version.supersedesId,
      createdAt: version.createdAt,
      contractVersion: 1,
      destinations: version.destinations.map((item) => ({ id: item.id, label: item.label, availability: item.availability })),
      authenticatedTarget: "command_overview",
      currentA001DefaultRoute: "command_overview",
      publicWelcomeDefaultDeferred: true,
      acceptsCredentials: false,
    })),
    authenticationPolicyVersions: (stored.authenticationPolicyVersions ?? []).map((policy) => ({
      id: policy.id,
      familyId: policy.familyId,
      version: policy.version,
      supersedesId: policy.supersedesId,
      createdAt: policy.createdAt,
      contractVersion: 1,
      deploymentModel: "single_commander_single_instance",
      enrollmentMode: "administrator_provisioned_initial_commander",
      maximumProductionIdentities: 1,
      inviteOnly: false,
      publicSignupEnabled: false,
      primaryMethod: policy.primaryMethod === "magic_link" ? "magic_link" : "email_password",
      allowedMethods: policy.primaryMethod === "magic_link" ? ["magic_link", "email_password"] : ["email_password"],
      magicLinkEnabled: policy.primaryMethod === "magic_link" && policy.magicLinkEnabled === true,
      emailVerificationRequired: true,
      idleTimeoutSeconds: 7 * 24 * 60 * 60,
      absoluteTimeoutSeconds: 30 * 24 * 60 * 60,
      productOwnerStepUpFreshnessSeconds: policy.productOwnerStepUpFreshnessSeconds,
      valuesStatus: "commander_accepted",
      providerState: policy.providerState === "deterministic_test" ? "deterministic_test" : "disabled",
      providerAdapter: "provider_neutral_server_contract",
      offlineAccess: "no_new_or_renewed_session",
      callbackRedirectAllowlist: policy.callbackRedirectAllowlist.filter((item) => /^https:\/\/castra\.superlworks\.com\/(?:api\/)?auth\/callback$/i.test(item)),
      cookieScope: "host_only_http_only_same_site",
      browserTokenPersistence: "prohibited",
      demoIdentity: "none",
      demoSessionReuse: false,
      demoDataTransfer: false,
      networkRequired: true,
    })),
    identityReferenceVersions: (stored.identityReferenceVersions ?? []).map((identity) => ({
      id: identity.id,
      familyId: identity.familyId,
      version: identity.version,
      supersedesId: identity.supersedesId,
      createdAt: identity.createdAt,
      contractVersion: 1,
      providerSubjectReference: identity.providerSubjectReference,
      displayReference: identity.displayReference,
      lifecycleState: identity.lifecycleState,
      verificationState: identity.verificationState,
      evidenceReference: identity.evidenceReference,
      secretMaterialStored: false,
    })),
    authorityAssignments: (stored.authorityAssignments ?? []).map((assignment) => ({
      id: assignment.id,
      identityFamilyId: assignment.identityFamilyId,
      authority: assignment.authority,
      status: assignment.status,
      evidenceReference: redactedText(assignment.evidenceReference, "redacted-unavailable"),
      assignedAt: assignment.assignedAt,
      recordedBy: assignment.recordedBy,
    })),
    authWorkflowRecords: (stored.authWorkflowRecords ?? []).map((record) => ({
      id: record.id,
      contractVersion: 1,
      workflow: record.workflow,
      identityFamilyId: record.identityFamilyId,
      state: record.state,
      networkRequired: record.networkRequired,
      networkAvailable: record.networkAvailable,
      providerState: record.providerState,
      failureCategory: record.failureCategory,
      publicMessage: redactedText(record.publicMessage, "Authentication outcome redacted."),
      callbackReference: redactedText(record.callbackReference, ""),
      provenance: record.provenance,
      secretMaterialStored: false,
      createdAt: record.createdAt,
    })),
    sessionReceipts: (stored.sessionReceipts ?? []).map((receipt) => ({
      id: receipt.id,
      contractVersion: 1,
      sessionReference: receipt.sessionReference,
      identityFamilyId: receipt.identityFamilyId,
      authorityAssignmentIds: receipt.authorityAssignmentIds ?? [],
      supersedesReceiptId: receipt.supersedesReceiptId,
      createdAt: receipt.createdAt,
      lastActiveAt: receipt.lastActiveAt,
      idleExpiresAt: receipt.idleExpiresAt,
      absoluteExpiresAt: receipt.absoluteExpiresAt,
      renewalDueAt: receipt.renewalDueAt,
      expiresAt: receipt.expiresAt,
      revokedAt: receipt.revokedAt,
      status: receipt.status,
      deviceReference: receipt.deviceReference,
      provenance: receipt.provenance,
      invalidationReason: receipt.invalidationReason,
      secretMaterialStored: false,
      recordedAt: receipt.recordedAt,
    })),
    stepUpReceipts: (stored.stepUpReceipts ?? []).map((receipt) => ({
      id: receipt.id,
      contractVersion: 1,
      identityFamilyId: receipt.identityFamilyId,
      authority: "Product Owner",
      sensitiveActionClass: receipt.sensitiveActionClass,
      outcome: receipt.outcome,
      verifiedAt: receipt.verifiedAt,
      validUntil: receipt.validUntil,
      evidenceReference: receipt.evidenceReference,
      provenance: receipt.provenance,
      secretMaterialStored: false,
      recordedAt: receipt.recordedAt,
    })),
    authEvents: (stored.authEvents ?? []).map((event) => ({
      id: event.id,
      sequence: event.sequence,
      occurredAt: event.occurredAt,
      workflow: event.workflow,
      status: event.status,
      identityFamilyId: event.identityFamilyId,
      failureCategory: event.failureCategory,
      publicMessage: redactedText(event.publicMessage, "Authentication outcome redacted."),
      evidenceReference: redactedText(event.evidenceReference, "redacted-unavailable"),
      redaction: "no_account_enumeration_no_secrets",
    })),
    sargeRuntimePolicyVersions: stored.sargeRuntimePolicyVersions?.length ? stored.sargeRuntimePolicyVersions : clean.sargeRuntimePolicyVersions,
    sargeEngagementRequests: stored.sargeEngagementRequests ?? [],
    sargeCommanderDecisions: stored.sargeCommanderDecisions ?? [],
    sargeResultPackages: stored.sargeResultPackages ?? [],
    auditEvents: (stored.auditEvents ?? []).map((event) => ({
      id: event.id,
      sequence: event.sequence,
      occurredAt: event.occurredAt,
      actor: event.actor,
      origin: event.origin,
      kind: event.kind,
      entityType: event.entityType,
      entityId: event.entityId,
      summary: redactedText(event.summary, "Redacted audit event."),
      detail: redactedDetail(event.detail),
    })),
  };
  return refreshOpenWorkProjection(normalized);
}

const databaseName = "castra-release-1";
const databaseVersion = 2;
const storeName = "authoritative-state";
const pendingHostedCommandStoreName = "pending-hosted-state-command";
const stateKey = "commander";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onerror = () => reject(request.error ?? new Error("Unable to open local database."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName);
      }
      if (!database.objectStoreNames.contains(pendingHostedCommandStoreName)) {
        database.createObjectStore(pendingHostedCommandStoreName);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local database operation failed."));
  });
}

export class IndexedDbStateRepository implements StateRepository {
  async load(): Promise<CastraState> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(storeName, "readonly");
      const result = await requestResult(
        transaction.objectStore(storeName).get(stateKey) as IDBRequest<CastraState | undefined>,
      );
      return normalizeState(result);
    } finally {
      database.close();
    }
  }

  async save(state: CastraState): Promise<void> {
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(storeName, "readwrite");
        transaction.objectStore(storeName).put(state, stateKey);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("Unable to save local state."));
        transaction.onabort = () =>
          reject(transaction.error ?? new Error("Local state save was aborted."));
      });
    } finally {
      database.close();
    }
  }
}
