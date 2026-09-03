import type { ConfigurationPreferences } from "../team-configuration/configurationCenter.js";

export type EntityType = "campaign" | "mission" | "action";

export type TestEntityType =
  | "test_plan"
  | "test_cycle"
  | "test_case"
  | "test_result"
  | "punch_item"
  | "firewatch_verification"
  | "exit_decision";

export type AerariumEntityType =
  | "aerarium_run"
  | "aerarium_run_event"
  | "aerarium_measure"
  | "subscription_plan_version"
  | "model_profile_version"
  | "price_card_version"
  | "allocation_rule_version"
  | "budget_settings_version";

export type PresentationEntityType = "presentation_settings_version";

export type LocalModelEntityType =
  | "local_model_policy_version"
  | "local_model_catalog_observation"
  | "local_model_invocation"
  | "local_model_proposal"
  | "local_model_review";

export type RemoteWorkEntityType =
  | "remote_work_proposal"
  | "remote_commander_decision"
  | "remote_companion_registration"
  | "remote_work_job"
  | "remote_work_attempt"
  | "remote_work_receipt";

export type DeploymentWorkbenchEntityType =
  | "deployment_request"
  | "deployment_commander_decision"
  | "deployment_receipt";

export type UIReviewEntityType =
  | "ui_review_plan"
  | "ui_review_fixture_contract"
  | "ui_review_checkpoint"
  | "ui_review_inventory_entry"
  | "ui_review_item"
  | "ui_review_decision"
  | "ui_review_invalidation"
  | "ui_review_punch_link";

export type AuthenticationEntityType =
  | "welcome_access_configuration_version"
  | "authentication_policy_version"
  | "identity_reference_version"
  | "authority_assignment"
  | "auth_workflow_record"
  | "session_receipt"
  | "step_up_receipt"
  | "auth_event";

export type SargeEngagementEntityType =
  | "sarge_runtime_policy_version"
  | "sarge_engagement_request"
  | "sarge_commander_decision"
  | "sarge_result_package";

export type CommandConnectorEntityType =
  | "command_connector_identity_receipt"
  | "command_connector_result_package"
  | "command_connector_receipt";

export type AuditEntityType = EntityType | TestEntityType | AerariumEntityType | PresentationEntityType | LocalModelEntityType | RemoteWorkEntityType | DeploymentWorkbenchEntityType | UIReviewEntityType | AuthenticationEntityType | SargeEngagementEntityType | CommandConnectorEntityType;
export type IdKind = AuditEntityType | "audit";

export type RecordStatus =
  | "draft"
  | "planned"
  | "active"
  | "in_progress"
  | "blocked"
  | "completed";

export interface Approval {
  approvedAt: string;
  approvedBy: "Commander";
  revision: number;
}

export interface BaseRecord {
  id: string;
  title: string;
  description: string;
  notes: string;
  status: RecordStatus;
  revision: number;
  approval: Approval | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export type DeploymentIntent = "unresolved" | "intended" | "not_intended";
export type BrandedSubdomainRequirement = "unresolved" | "required" | "not_required";
export type StandardDeploymentPattern =
  | "unresolved"
  | "applies"
  | "exception_required"
  | "not_applicable";
export type CommercialUseAssessment =
  | "unresolved"
  | "commercial_branded"
  | "non_commercial";
export type ProviderEligibilityAssessment =
  | "unresolved"
  | "verified_eligible"
  | "not_eligible";
export type DeploymentEligibilityDisposition =
  | "eligible"
  | "not_applicable"
  | "product_owner_decision_required";

export interface DeploymentEligibility {
  webDeploymentIntent: DeploymentIntent;
  brandedSubdomainRequirement: BrandedSubdomainRequirement;
  standardPattern: StandardDeploymentPattern;
  commercialUse: CommercialUseAssessment;
  providerEligibility: ProviderEligibilityAssessment;
  proposedHostname: string;
  dnsAuthorityState: string;
  exportImportImplication: string;
  hostedPersistenceImplication: string;
  authenticationImplication: string;
  synchronizationImplication: string;
  migrationImplication: string;
  providerChangeAssessment: string;
  evidenceReference: string;
  disposition: DeploymentEligibilityDisposition | null;
  dispositionExplanation: string;
  disposedAt: string | null;
  disposedBy: "Commander" | null;
}

export interface Campaign extends BaseRecord {
  type: "campaign";
  commanderIntent: string;
  deploymentEligibility: DeploymentEligibility;
}

export interface Mission extends BaseRecord {
  type: "mission";
  campaignId: string;
}

export interface Action extends BaseRecord {
  type: "action";
  missionId: string;
  actionKind: "standard" | "deployment";
  operationalContext?: ActionOperationalContext;
  followUpToActionId?: string | null;
  /**
   * ACT-a5ae5f26 / P04-FU01 — typed dependency predecessors.
   *
   * This is deliberately **not** `followUpToActionId` and never replaces it.
   * `followUpToActionId` is the immutable child/follow-up lineage created by
   * `action.follow_up.create`: exactly one parent, always inside the source
   * Campaign, and bound to a completed source Action. `predecessorActionIds` is
   * a many-valued dependency relation: "this Action depends on those Actions
   * having landed first." A record may carry both, one, or neither, and the two
   * fields never derive, imply, or overwrite one another.
   *
   * Entries are opaque Action record ids. Cross-Mission references are
   * explicitly permitted **inside one Campaign**; the allocation boundary
   * rejects a missing, duplicate, self, archived, orphan-parent, or
   * cross-Campaign reference before any mutation.
   *
   * The field is optional so every pre-existing revision-13 record stays valid
   * unchanged. Absent and `[]` both mean "no declared predecessor" — see
   * `normalizeActionPredecessorIds` for the one honest empty representation.
   * Nothing anywhere infers a link from absence.
   */
  predecessorActionIds?: string[];
}

export type CastraRecord = Campaign | Mission | Action;

export type OpenWorkState =
  | "open"
  | "in_progress"
  | "blocked"
  | "commander_review"
  | "ready_for_mission_closure"
  | "reconciliation_required";

export type ActionAttentionState =
  | "normal"
  | "commander_review"
  | "ready_for_mission_closure"
  | "reconciliation_required";

export interface ActionOperationalContext {
  owner: string;
  blocker: string;
  nextGate: string;
  evidenceReference: string;
  /**
   * Full Action-level evidence package used by the Tier 1 direct Commander
   * close path. `evidenceReference` remains the primary projection value for
   * backward compatibility with revision-13 hosted state documents.
   */
  evidenceReferences?: string[];
  attentionState: ActionAttentionState;
}

export interface OpenWorkIndexEntry {
  authority: "non_authoritative_local_projection";
  recordType: "mission" | "action";
  recordId: string;
  missionId: string;
  campaignId: string | null;
  title: string;
  parentTitle: string;
  state: OpenWorkState;
  sourceStatus: RecordStatus;
  summary: string;
  owner: string;
  blocker: string;
  nextGate: string;
  evidenceReference: string;
  sourceRevision: string;
  updatedAt: string;
}

export type MissionRollupState = OpenWorkState | "completed" | "no_open_work";

export interface MissionOpenWorkRollup {
  authority: "non_authoritative_local_projection";
  missionId: string;
  campaignId: string;
  missionTitle: string;
  state: MissionRollupState;
  totalActions: number;
  openActions: number;
  inProgressActions: number;
  blockedActions: number;
  commanderReviewActions: number;
  readyActions: number;
  reconciliationRequiredActions: number;
  completedActions: number;
  archivedActions: number;
  openWorkRecordIds: string[];
  nextGate: string;
  evidenceReference: string;
  sourceRevision: string;
}

export type LifecycleCommandType =
  | "action.close"
  | "mission.close"
  | "record.reopen"
  | "action.follow_up.create";

export interface LifecycleCommandReceipt {
  commandId: string;
  commandType: LifecycleCommandType;
  entityType: "mission" | "action";
  entityId: string;
  expectedRevision: number;
  resultingRevision: number;
  binding: string;
  reason: string;
  evidenceReferences: string[];
  auditSequence: number;
  followUpActionId: string | null;
  occurredAt: string;
}

export type CommandConnectorChannel = "ui" | "codex" | "voice" | "agent";
export type CommandConnectorAuthority = "Agent" | "Commander";
export type CommandConnectorResultStatus = "received" | "applied" | "offline" | "expired" | "cancelled" | "failed" | "unknown" | "rejected";
export type CommandConnectorOutcome = "applied" | "offline" | "expired" | "cancelled" | "failed" | "unknown" | "rejected";

export interface CommandConnectorIdentityReceipt {
  id: string;
  contractVersion: 1;
  identityReference: string;
  sessionReference: string;
  channel: CommandConnectorChannel;
  authority: CommandConnectorAuthority;
  evidenceReference: string;
  issuedAt: string;
  validUntil: string;
  revokedAt: string | null;
  secretMaterialStored: false;
}

export interface CommandConnectorTestResult {
  name: string;
  outcome: "pass" | "fail" | "blocked" | "not_run";
  evidenceReference: string;
}

export interface CommandConnectorResultPackage {
  id: string;
  contractVersion: 1;
  submissionId: string;
  binding: string;
  revision: number;
  identityReceiptId: string;
  workReference: string;
  agentIdentity: string;
  modelIdentity: string;
  proposedStatus: string;
  evidenceReferences: string[];
  tests: CommandConnectorTestResult[];
  blockers: string[];
  effortCostProvenance: string;
  nextStepRecommendation: string;
  status: CommandConnectorResultStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CommandConnectorReceipt {
  id: string;
  contractVersion: 1;
  idempotencyKey: string;
  binding: string;
  resultPackageId: string;
  resultPackageRevision: number;
  resultPackageBinding: string;
  identityReceiptId: string;
  authorityReceiptId: string;
  channel: CommandConnectorChannel;
  lifecycleCommandId: string;
  outcome: CommandConnectorOutcome;
  reasonCode: string;
  reason: string;
  lifecycleReceiptCommandId: string | null;
  auditSequence: number;
  occurredAt: string;
  directDatabaseWrite: false;
}

export type AuditKind =
  | "record.created"
  | "record.updated"
  | "record.moved"
  | "record.archived"
  | "record.restored"
  | "status.transitioned"
  | "action.operational_context.updated"
  | "record.closed"
  | "record.reopened"
  | "action.follow_up.created"
  | "command_connector.identity_recorded"
  | "command_connector.result_received"
  | "command_connector.outcome_recorded"
  | "command_connector.command_applied"
  | "decision_inbox.approved"
  | "decision_inbox.rejected"
  | "approval.granted"
  | "approval.invalidated"
  | "deployment_eligibility.updated"
  | "deployment_eligibility.disposition_recorded"
  | "deployment_eligibility.disposition_invalidated"
  | "test_plan.created"
  | "test_plan.status_changed"
  | "test_cycle.created"
  | "test_cycle.status_changed"
  | "test_case.created"
  | "test_case.status_changed"
  | "test_result.recorded"
  | "punch_item.created"
  | "punch_item.updated"
  | "punch_item.status_changed"
  | "punch_item.verified"
  | "punch_item.waived"
  | "firewatch_verification.recorded"
  | "exit_decision.recorded"
  | "aerarium_run.created"
  | "aerarium_run_event.appended"
  | "aerarium_measure.recorded"
  | "aerarium_configuration.version_created"
  | "presentation.profile_applied"
  | "presentation.role_updated"
  | "presentation.label_mode_changed"
  | "presentation.configuration_saved"
  | "local_model.policy_version_created"
  | "local_model.catalog_observed"
  | "local_model.invocation_requested"
  | "local_model.invocation_blocked"
  | "local_model.proposal_recorded"
  | "local_model.unavailable_recorded"
  | "local_model.proposal_reviewed"
  | "remote_work.proposal_created"
  | "remote_work.proposal_updated"
  | "remote_work.approval_recorded"
  | "remote_work.approval_rejected"
  | "remote_work.approval_invalidated"
  | "remote_work.companion_registered"
  | "remote_work.companion_session_changed"
  | "remote_work.companion_disabled"
  | "remote_work.companion_revoked"
  | "remote_work.job_released"
  | "remote_work.job_claimed"
  | "remote_work.job_rejected"
  | "remote_work.job_started"
  | "remote_work.job_canceled"
  | "remote_work.receipt_recorded"
  | "deployment_request.created"
  | "deployment_request.updated"
  | "deployment_request.approved"
  | "deployment_request.rejected"
  | "deployment_request.approval_invalidated"
  | "deployment_handoff.requested"
  | "deployment_receipt.recorded"
  | "deployment_request.cancelled"
  | "ui_review.plan_created"
  | "ui_review.plan_updated"
  | "ui_review.checkpoint_updated"
  | "ui_review.inventory_added"
  | "ui_review.item_created"
  | "ui_review.decision_recorded"
  | "ui_review.decision_invalidated"
  | "ui_review.punch_linked"
  | "welcome_access.configuration_version_created"
  | "auth.policy_version_created"
  | "auth.identity_version_recorded"
  | "auth.authority_assigned"
  | "auth.authority_revoked"
  | "auth.workflow_recorded"
  | "auth.session_receipt_recorded"
  | "auth.session_renewed"
  | "auth.session_invalidated"
  | "auth.step_up_recorded"
  | "auth.access_denied"
  | "sarge.request_created"
  | "sarge.request_updated"
  | "sarge.approval_recorded"
  | "sarge.approval_rejected"
  | "sarge.approval_invalidated"
  | "sarge.result_recorded"
  /**
   * ACT-c417cbd5 / P04 — one ordered transaction event per applied Commander
   * Session Work Plan selection. It carries the exact idempotency identity,
   * request binding digest, and receipt core, so an exact replay is served from
   * the audit trail instead of being recomputed against a moved store.
   */
  | "session_work_plan.allocation_applied";

export interface AuditEvent {
  id: string;
  sequence: number;
  occurredAt: string;
  actor: "Commander" | "Local model adapter" | "Local Companion simulator" | "Governed connector";
  origin: "direct" | "ollama_loopback" | "local_companion_simulation" | "command_connector";
  kind: AuditKind;
  entityType: AuditEntityType;
  entityId: string;
  summary: string;
  detail: Record<string, string>;
}

export interface NotionMigrationEvidenceReference {
  kind: "notion_page" | "repository_path" | "https_url" | "digest";
  reference: string;
}

export interface NotionMigrationRecordSource {
  stableCode: string;
  sourceRecordId: string;
  sourceUrl: string;
  sourceRevision: string | null;
  sourceCreatedAt: string | null;
  sourceLastEditedAt: string | null;
  sourceObservedAt: string;
  sourceApproval: "approved" | "proposed" | "rejected" | "draft" | "unrecorded";
  assignedRole: "CENSOR" | "COMMANDER" | "FIREWATCH" | "FORGE" | "OVERWATCH" | "QUARTERMASTER" | "RECON" | "SARGE" | "SCRIBE" | "SENTRY" | "SIGNAL" | "VEXILLARIUS" | null;
  intent: string | null;
  objective: string | null;
  summary: string | null;
  evidenceReferences: NotionMigrationEvidenceReference[];
  unresolvedFields: string[];
  unsupportedFields: string[];
}

export interface NotionMigrationProvenance {
  contractVersion: "castra-notion-migration-provenance/1.0.0";
  exportSchemaVersion: "castra-notion-operational-export/2.0.0";
  converterVersion: "castra-notion-operational-to-state-13/2.0.0";
  authority: "notion_authoritative_pre_cutover";
  campaignCode: string;
  captureId: string;
  sourceRevision: string;
  sourceTime: string;
  rawArtifactDigest: string;
  canonicalExportDigest: string;
  counts: { campaigns: 1; missions: number; actions: number; totalRecords: number };
  timestampSemantics: "baseline_observation_not_historical_lifecycle";
  limitations: string[];
  recordSources: NotionMigrationRecordSource[];
}

export interface CastraState {
  schemaVersion: 13;
  migrationProvenance: NotionMigrationProvenance[];
  nextAuditSequence: number;
  nextAuthEventSequence: number;
  campaigns: Campaign[];
  missions: Mission[];
  actions: Action[];
  openWorkIndex: OpenWorkIndexEntry[];
  missionOpenWorkRollups: MissionOpenWorkRollup[];
  lifecycleCommandReceipts: LifecycleCommandReceipt[];
  commandConnectorIdentityReceipts: CommandConnectorIdentityReceipt[];
  commandConnectorResultPackages: CommandConnectorResultPackage[];
  commandConnectorReceipts: CommandConnectorReceipt[];
  testPlans: TestPlan[];
  testCycles: TestCycle[];
  testCases: TestCase[];
  testResults: TestResult[];
  punchItems: PunchItem[];
  firewatchVerifications: FirewatchVerification[];
  exitDecisions: ExitDecision[];
  aerariumRuns: AerariumRun[];
  aerariumRunEvents: AerariumRunEvent[];
  aerariumMeasures: AerariumStoredMeasure[];
  subscriptionPlanVersions: SubscriptionPlanVersion[];
  modelProfileVersions: ModelProfileVersion[];
  priceCardVersions: PriceCardVersion[];
  allocationRuleVersions: AllocationRuleVersion[];
  budgetSettingsVersions: BudgetSettingsVersion[];
  presentationVersions: PresentationSettingsVersion[];
  localModelPolicyVersions: LocalModelPolicyVersion[];
  localModelCatalogObservations: LocalModelCatalogObservation[];
  localModelInvocations: LocalModelInvocation[];
  localModelProposals: LocalModelProposal[];
  localModelReviews: LocalModelProposalReview[];
  remoteWorkProposals: RemoteWorkProposal[];
  remoteCommanderDecisions: RemoteCommanderDecision[];
  remoteCompanionRegistrations: RemoteCompanionRegistration[];
  remoteWorkJobs: RemoteWorkJob[];
  remoteWorkAttempts: RemoteWorkAttempt[];
  remoteWorkReceipts: RemoteWorkReceipt[];
  deploymentRequests: DeploymentRequest[];
  deploymentCommanderDecisions: DeploymentCommanderDecision[];
  deploymentReceipts: DeploymentReceipt[];
  uiReviewPlans: UIReviewPlan[];
  uiReviewFixtureContracts: UIReviewFixtureContract[];
  uiReviewCheckpoints: UIReviewCheckpoint[];
  uiReviewInventoryEntries: UIReviewInventoryEntry[];
  uiReviewItems: UIReviewItem[];
  uiReviewDecisions: UIReviewDecision[];
  uiReviewInvalidations: UIReviewDecisionInvalidation[];
  uiReviewPunchLinks: UIReviewPunchLink[];
  welcomeAccessConfigurationVersions: WelcomeAccessConfigurationVersion[];
  authenticationPolicyVersions: AuthenticationPolicyVersion[];
  identityReferenceVersions: IdentityReferenceVersion[];
  authorityAssignments: AuthorityAssignment[];
  authWorkflowRecords: AuthWorkflowRecord[];
  sessionReceipts: SessionReceipt[];
  stepUpReceipts: StepUpReceipt[];
  authEvents: AuthEvent[];
  sargeRuntimePolicyVersions: SargeRuntimePolicyVersion[];
  sargeEngagementRequests: SargeEngagementRequest[];
  sargeCommanderDecisions: SargeCommanderDecision[];
  sargeResultPackages: SargeResultPackage[];
  auditEvents: AuditEvent[];
}

export type WorkLinkType = EntityType | "baseops";

export interface WorkLink {
  type: WorkLinkType;
  id: string;
}

export type TestPlanStatus = "draft" | "active" | "exit_review" | "closed";
export type TestCycleStatus = "planned" | "active" | "completed";
export type TestCaseStatus = "draft" | "ready" | "executed" | "retired";
export type TestOutcome =
  | "not_run"
  | "pass"
  | "fail"
  | "blocked"
  | "accepted_with_follow_up";
export type Severity = "low" | "medium" | "high" | "critical";
export type PunchStatus =
  | "open"
  | "in_remediation"
  | "ready_for_verification"
  | "verified_closed"
  | "waived"
  | "cancelled";

export interface TestPlan {
  id: string;
  title: string;
  description: string;
  link: WorkLink;
  status: TestPlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TestCycle {
  id: string;
  testPlanId: string;
  title: string;
  status: TestCycleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TestCase {
  id: string;
  testPlanId: string;
  title: string;
  status: TestCaseStatus;
  expectedResult: string;
  requirementReference: string;
  sourceReference: string;
  required: boolean;
  severity: Severity;
  createdAt: string;
  updatedAt: string;
}

export interface TestResult {
  id: string;
  testPlanId: string;
  testCycleId: string;
  testCaseId: string;
  outcome: TestOutcome;
  actualResult: string;
  executor: string;
  executedAt: string;
  evidenceReference: string;
  resultReference: string;
  unavailableReason: string;
  createdAt: string;
}

export interface PunchItem {
  id: string;
  testPlanId: string | null;
  testResultId: string | null;
  source: "test_result" | "ui_review";
  uiReviewItemId: string | null;
  uiReviewDecisionId: string | null;
  affectedWork: WorkLink;
  title: string;
  description: string;
  status: PunchStatus;
  severity: Severity;
  requirementReference: string;
  evidenceReference: string;
  verificationEvidence: string;
  verifiedAt: string | null;
  waiverReason: string;
  commanderAcceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type UIReviewCheckpointCode =
  | "UI-01"
  | "UI-02"
  | "UI-03"
  | "UI-04"
  | "UI-05"
  | "UI-06"
  | "UI-07";

export type UIReviewApplicability = "ui" | "not_applicable";
export type UIReviewPlanStatus = "draft" | "configured" | "not_applicable";
export type UIReviewCheckpointStatus =
  | "not_started"
  | "ready_for_review"
  | "approved"
  | "approved_with_punch_items"
  | "rework_required"
  | "invalidated";
export type UIReviewDisposition = "approve" | "approve_with_punch_items" | "rework_required";
export type UIReviewStandardState =
  | "empty"
  | "normal"
  | "dense"
  | "loading"
  | "unavailable"
  | "error"
  | "permission_blocked"
  | "archived"
  | "mobile_responsive";

export type UIReviewScenario = "normal" | "dense" | "blocked" | "exception" | "empty";
export type UIReviewDestination =
  | "overview"
  | "campaigns"
  | "testing"
  | "aerarium"
  | "graph"
  | "team"
  | "configuration"
  | "deployment-workbench"
  | "remote-work";

export interface UIReviewPlan {
  id: string;
  contractVersion: 1;
  campaignId: string;
  revision: number;
  applicability: UIReviewApplicability;
  applicabilityReason: string;
  applicabilityEvidenceReference: string;
  experienceIntent: string;
  devicesAndScreenSizes: string;
  themeAndNavigationPattern: string;
  requiredCheckpoints: UIReviewCheckpointCode[];
  demonstrationDataNeeds: string;
  approver: "Commander";
  evidenceRequirement: string;
  screenshotRequired: boolean;
  status: UIReviewPlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UIReviewFixtureContract {
  id: string;
  contractVersion: 1;
  planId: string;
  namespace: string;
  visibleLabel: "DEMONSTRATION DATA · NOT AUTHORITATIVE";
  authority: "demonstration_only";
  storageBoundary: "isolated_ui_review_fixture";
  canTargetAuthoritativeData: false;
  populated: boolean;
  status: "contract_only_not_built" | "populated";
  createdAt: string;
}

export interface UIReviewCheckpoint {
  id: string;
  planId: string;
  code: UIReviewCheckpointCode;
  name: string;
  revision: number;
  scope: string;
  coveredUiRevision: string;
  status: UIReviewCheckpointStatus;
  evidenceRequirement: string;
  evidenceReferences: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UIReviewInventoryEntry {
  id: string;
  checkpointId: string;
  screenKey: string;
  screenName: string;
  componentReference: string;
  states: UIReviewStandardState[];
  additionalStates: string[];
  evidenceReferences: string[];
  fixtureContractId: string;
  dataSource: "ui_review_fixture";
  destination: UIReviewDestination | null;
  inspectionFocus: string;
  knownIntentionalGaps: string;
  requestedDecision: string;
  createdAt: string;
}

export interface UIReviewItem {
  id: string;
  checkpointId: string;
  inventoryEntryId: string;
  screenReference: string;
  componentReference: string;
  sourceAttribution: string;
  sourceReference: string;
  comment: string;
  severity: Severity;
  createdAt: string;
  createdBy: "Commander";
}

export interface UIReviewDecision {
  id: string;
  checkpointId: string;
  checkpointRevision: number;
  inventoryEvidenceScope: string;
  disposition: UIReviewDisposition;
  rationale: string;
  evidenceReferences: string[];
  punchItemIds: string[];
  decidedAt: string;
  decidedBy: "Commander";
}

export interface UIReviewDecisionInvalidation {
  id: string;
  decisionId: string;
  checkpointId: string;
  reason: string;
  previousScope: string;
  newCheckpointRevision: number;
  invalidatedAt: string;
}

export interface UIReviewPunchLink {
  id: string;
  reviewItemId: string;
  decisionId: string | null;
  punchItemId: string;
  createdAt: string;
}

export type FirewatchVerificationOutcome = "verified" | "issues_found" | "unavailable";

export interface FirewatchVerification {
  id: string;
  testPlanId: string;
  outcome: FirewatchVerificationOutcome;
  evidenceReference: string;
  unavailableReason: string;
  verifiedAt: string;
  recordedAt: string;
}

export type ExitDecisionValue = "pass" | "conditional_pass" | "fail" | "defer";

export interface ExitDecision {
  id: string;
  testPlanId: string;
  decision: ExitDecisionValue;
  rationale: string;
  decidedAt: string;
  decidedBy: "Commander";
}

export type AerariumRunEventType =
  | "start"
  | "pause"
  | "resume"
  | "blocked"
  | "unblocked"
  | "end"
  | "outcome";

export interface AerariumRun {
  id: string;
  title: string;
  work: WorkLink;
  roleId: string;
  modelKey: string;
  createdAt: string;
}

export interface AerariumRunEvent {
  id: string;
  runId: string;
  type: AerariumRunEventType;
  occurredAt: string;
  note: string;
  outcome: string;
  inputCharacters: number | null;
  outputCharacters: number | null;
  createdAt: string;
}

export interface VersionedConfiguration {
  id: string;
  familyId: string;
  version: number;
  supersedesId: string | null;
  createdAt: string;
}

export type WelcomeDestination = "login" | "public_demo" | "about";
export type AuthenticationMethod = "email_password" | "magic_link";
export type AuthenticationProviderState = "disabled" | "deterministic_test" | "live_unverified";

export interface WelcomeAccessConfigurationVersion extends VersionedConfiguration {
  contractVersion: 1;
  destinations: Array<{
    id: WelcomeDestination;
    label: "Log in to CASTRA" | "Enter Public Demo" | "About CASTRA";
    availability: "contract_only" | "informational";
  }>;
  authenticatedTarget: "command_overview";
  currentA001DefaultRoute: "command_overview";
  publicWelcomeDefaultDeferred: true;
  acceptsCredentials: false;
}

export interface AuthenticationPolicyVersion extends VersionedConfiguration {
  contractVersion: 1;
  deploymentModel: "single_commander_single_instance";
  enrollmentMode: "administrator_provisioned_initial_commander";
  maximumProductionIdentities: 1;
  inviteOnly: false;
  publicSignupEnabled: false;
  primaryMethod: AuthenticationMethod;
  allowedMethods: AuthenticationMethod[];
  magicLinkEnabled: boolean;
  emailVerificationRequired: true;
  idleTimeoutSeconds: number;
  absoluteTimeoutSeconds: number;
  productOwnerStepUpFreshnessSeconds: number;
  valuesStatus: "proposed_for_commander_acceptance" | "commander_accepted";
  providerState: AuthenticationProviderState;
  providerAdapter: "provider_neutral_server_contract";
  offlineAccess: "no_new_or_renewed_session";
  callbackRedirectAllowlist: string[];
  cookieScope: "host_only_http_only_same_site";
  browserTokenPersistence: "prohibited";
  demoIdentity: "none";
  demoSessionReuse: false;
  demoDataTransfer: false;
  networkRequired: true;
}

export type IdentityLifecycleState = "invited" | "active" | "disabled" | "revoked";
export type IdentityVerificationState = "unverified" | "verified";

export interface IdentityReferenceVersion extends VersionedConfiguration {
  contractVersion: 1;
  providerSubjectReference: string;
  displayReference: string;
  lifecycleState: IdentityLifecycleState;
  verificationState: IdentityVerificationState;
  evidenceReference: string;
  secretMaterialStored: false;
}

export type AuthorityKind = "Commander" | "Product Owner";
export interface AuthorityAssignment {
  id: string;
  identityFamilyId: string;
  authority: AuthorityKind;
  status: "assigned" | "revoked";
  evidenceReference: string;
  assignedAt: string;
  recordedBy: "Commander" | "Product Owner";
}

export type AuthWorkflowKind =
  | "demo_entry"
  | "invite"
  | "claim"
  | "email_verification"
  | "password_login"
  | "magic_link_login"
  | "recovery_request"
  | "password_reset"
  | "auth_callback"
  | "session_refresh"
  | "logout"
  | "revoke"
  | "disable"
  | "forbidden"
  | "rate_limit"
  | "offline"
  | "provider_failure"
  | "risk_event";

export type AuthWorkflowState =
  | "requested"
  | "pending"
  | "unavailable"
  | "succeeded"
  | "failed"
  | "verified"
  | "authenticated"
  | "refreshed"
  | "logged_out"
  | "revoked"
  | "disabled"
  | "forbidden"
  | "rate_limited"
  | "offline"
  | "provider_failure";

export type AuthFailureCategory =
  | "none"
  | "unavailable"
  | "offline"
  | "invalid_credentials_or_account"
  | "verification_required"
  | "disabled_or_revoked"
  | "expired"
  | "forbidden"
  | "rate_limited"
  | "provider_failure"
  | "callback_rejected"
  | "secret_rejected";

export interface AuthWorkflowRecord {
  id: string;
  contractVersion: 1;
  workflow: AuthWorkflowKind;
  identityFamilyId: string | null;
  state: AuthWorkflowState;
  networkRequired: boolean;
  networkAvailable: boolean;
  providerState: AuthenticationProviderState;
  failureCategory: AuthFailureCategory;
  publicMessage: string;
  callbackReference: string;
  provenance: "disabled_provider_contract" | "deterministic_test_only" | "commander_direct";
  secretMaterialStored: false;
  createdAt: string;
}

export type SessionReceiptStatus = "active" | "expired" | "revoked" | "unavailable";
export interface SessionReceipt {
  id: string;
  contractVersion: 1;
  sessionReference: string;
  identityFamilyId: string;
  authorityAssignmentIds: string[];
  supersedesReceiptId: string | null;
  createdAt: string;
  lastActiveAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  renewalDueAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: SessionReceiptStatus;
  deviceReference: string;
  provenance: "deterministic_test_only" | "server_receipt_unverified";
  invalidationReason: string;
  secretMaterialStored: false;
  recordedAt: string;
}

export type SensitiveActionClass =
  | "foundation_manifest_change"
  | "authentication_policy_change"
  | "authority_change"
  | "production_template_activation";

export interface StepUpReceipt {
  id: string;
  contractVersion: 1;
  identityFamilyId: string;
  authority: "Product Owner";
  sensitiveActionClass: SensitiveActionClass;
  outcome: "passed" | "failed" | "unavailable";
  verifiedAt: string;
  validUntil: string;
  evidenceReference: string;
  provenance: "deterministic_test_only" | "server_receipt_unverified";
  secretMaterialStored: false;
  recordedAt: string;
}

export interface AuthEvent {
  id: string;
  sequence: number;
  occurredAt: string;
  workflow: AuthWorkflowKind | "access_check" | "session" | "step_up" | "authority" | "identity" | "policy" | "welcome";
  status: AuthWorkflowState | SessionReceiptStatus | "allowed" | "denied" | "recorded";
  identityFamilyId: string | null;
  failureCategory: AuthFailureCategory;
  publicMessage: string;
  evidenceReference: string;
  redaction: "no_account_enumeration_no_secrets";
}

export type CanonicalRoleId =
  | "COMMANDER_PRODUCT_OWNER"
  | "SARGE"
  | "FORGE"
  | "SIGNAL"
  | "RECON"
  | "SCRIBE"
  | "QUARTERMASTER"
  | "FIREWATCH"
  | "VEXILLARIUS"
  | "CENSOR";

export type LocalModelRiskTier = "low" | "medium" | "high";
export type LocalModelCapability = "completion" | "tools" | "thinking" | "vision";

export interface LocalModelCatalogEntry {
  name: string;
  digest: string;
  sizeBytes: number;
  modifiedAt: string;
  capabilities: LocalModelCapability[];
}

export interface LocalModelCatalogObservation {
  id: string;
  adapterId: "ollama_loopback";
  adapterVersion: string;
  catalogVersion: string;
  endpointOrigin: "http://127.0.0.1:11434";
  locality: "fixed_os_loopback";
  localityEvidence: string;
  runtimeStatus: "healthy" | "unavailable";
  runtimeVersion: string;
  models: LocalModelCatalogEntry[];
  unavailableReason: string;
  observedAt: string;
}

export interface LocalModelPolicyVersion extends VersionedConfiguration {
  name: string;
  workflowKey: string;
  activityKey: string;
  riskTier: LocalModelRiskTier;
  productOwnerPermitted: boolean;
  enabled: boolean;
  allowedModelNames: string[];
  roleId: CanonicalRoleId | "";
  rolePreferredModelNames: string[];
  requiredCapability: LocalModelCapability;
  maxInputCharacters: number;
  maxOutputTokens: number;
}

export interface LocalModelInvocation {
  id: string;
  workflowKey: string;
  activityKey: string;
  riskTier: LocalModelRiskTier;
  roleId: CanonicalRoleId;
  work: WorkLink;
  prompt: string;
  selectedModelName: string;
  selectedModelDigest: string;
  policyVersionId: string;
  catalogObservationId: string;
  adapterId: "ollama_loopback";
  adapterVersion: string;
  catalogVersion: string;
  endpointOrigin: "http://127.0.0.1:11434";
  locality: "fixed_os_loopback";
  status: "ready" | "policy_blocked";
  unavailableReason: string;
  aerariumRunId: string;
  requestedAt: string;
}

export interface LocalModelRuntimeUsage {
  source: "ollama_response" | "unavailable";
  promptTokens: number | null;
  completionTokens: number | null;
  totalDurationMs: number | null;
  loadDurationMs: number | null;
  promptEvalDurationMs: number | null;
  evalDurationMs: number | null;
}

export interface LocalModelProposal {
  id: string;
  invocationId: string;
  status: "proposal" | "unavailable";
  content: string;
  unavailableCode: string;
  unavailableReason: string;
  modelName: string;
  modelDigest: string;
  usage: LocalModelRuntimeUsage;
  createdAt: string;
}

export interface LocalModelProposalReview {
  id: string;
  proposalId: string;
  decision: "noted" | "rejected";
  notes: string;
  reviewedBy: "Commander";
  reviewedAt: string;
}

export type RemoteWorkSource = "web" | "codex_text" | "voice" | "external_handoff";
export type RemoteAllowedActivity =
  | "draft_assist"
  | "commander_intent_draft"
  | "short_summary"
  | "fact_grounded_rewrite"
  | "bounded_extraction";
export type RemoteRuntimeKind =
  | "local_ollama"
  | "codex_subscription_handoff"
  | "chatgpt_subscription_handoff"
  | "claude_code_subscription_handoff";

export interface RemoteWorkTarget {
  type: WorkLinkType | "commander_intent_draft";
  id: string;
}

export interface RemoteRuntimeSelection {
  runtimeKind: RemoteRuntimeKind;
  runtimeReference: string;
  modelPolicyVersionId: string;
  selectedModelName: string;
  selectedModelDigest: string;
}

export interface RemoteWorkProposal {
  id: string;
  revision: number;
  source: RemoteWorkSource;
  sourceText: string;
  sourceHash: string;
  sourceReference: string;
  target: RemoteWorkTarget;
  allowedActivity: RemoteAllowedActivity;
  riskTier: "low";
  authority: "proposal_only";
  runtimeSelection: RemoteRuntimeSelection;
  createdAt: string;
  updatedAt: string;
}

export interface RemoteCommanderDecision {
  id: string;
  proposalId: string;
  proposalRevision: number;
  proposalHash: string;
  decision: "approved" | "rejected";
  reason: string;
  decidedBy: "Commander";
  decidedAt: string;
  expiresAt: string | null;
}

export type SargeEngagementMode = "consult" | "develop_plan" | "coordinate_approved_work";
export type SargeRequestedActivity = "bounded_consultation" | "plan_decomposition" | "approved_work_coordination";
export type SargeTargetType = "command_overview" | "campaign" | "mission" | "action" | "ui_review_checkpoint" | "punch_item";
export type SargeRuntimeAdapter = "ollama_loopback" | "codex_first_party_subscription" | "claude_code_first_party_subscription" | "metered_api_exception";
export type SargeBillingClass = "local_no_metered_api" | "subscription_included" | "metered_api" | "unknown";
export type SargeRuntimeAvailability = "repository_ready" | "not_present" | "not_configured" | "unavailable_limit" | "blocked";
export type SargeResultOutcome = "simulation_proposal" | "unavailable" | "limit_wait" | "blocked" | "unknown";

export interface SargeRuntimeOption {
  id: string;
  label: string;
  adapter: SargeRuntimeAdapter;
  billingClass: SargeBillingClass;
  modelReference: string;
  availability: SargeRuntimeAvailability;
  eligibleModes: SargeEngagementMode[];
  activityAllowlist: SargeRequestedActivity[];
  policyNote: string;
  requiresInvocationApproval: boolean;
  apiCostCeilingMinor: number | null;
  apiFallbackAllowed: false;
}

export interface SargeRuntimePolicyVersion extends VersionedConfiguration {
  contractVersion: 1;
  canonicalRoleId: "SARGE";
  workflowKey: "sarge_orchestration";
  defaultRuntimeOptionId: "codex_subscription";
  runtimePriority: ["local_suitable_low_risk", "subscription_first_party", "api_exception_only"];
  runtimeOptions: SargeRuntimeOption[];
  authority: "proposal_only";
  credentialsAccepted: false;
  networkExecutionEnabled: false;
  toolExecutionEnabled: false;
  authoritativeMutationEnabled: false;
}

export interface SargeEngagementTarget {
  type: SargeTargetType;
  id: string;
  revision: number;
  label: string;
}

export interface SargeEngagementRequest {
  id: string;
  revision: number;
  target: SargeEngagementTarget;
  mode: SargeEngagementMode;
  requestedActivity: SargeRequestedActivity;
  scopeText: string;
  scopeHash: string;
  materialHash: string;
  runtimePolicyVersionId: string;
  defaultRuntimeOptionId: string;
  selectedRuntimeOptionId: string;
  selectedRuntimeAdapter: SargeRuntimeAdapter;
  selectedModelReference: string;
  billingClass: SargeBillingClass;
  riskTier: "low";
  authority: "proposal_only";
  apiFallbackAllowed: false;
  status: "draft" | "decision_recorded" | "result_recorded";
  createdAt: string;
  updatedAt: string;
}

export interface SargeCommanderDecision {
  id: string;
  requestId: string;
  requestRevision: number;
  requestHash: string;
  decision: "approved" | "rejected";
  reason: string;
  decidedBy: "Commander";
  decidedAt: string;
  expiresAt: string | null;
}

export interface SargeProposedAssignment {
  canonicalRoleId: CanonicalRoleId;
  activity: string;
  runtimeOptionId: string;
  authority: "proposal_only";
}

export interface SargeResultPackage {
  id: string;
  requestId: string;
  requestRevision: number;
  requestHash: string;
  decisionId: string;
  outcome: SargeResultOutcome;
  proposalText: string;
  proposedAssignments: SargeProposedAssignment[];
  reasonCode: string;
  reason: string;
  waitUntil: string | null;
  evidenceMode: "deterministic_repository_simulation";
  authority: "proposal_only";
  authoritativeMutations: 0;
  providerCalls: 0;
  modelCalls: 0;
  toolCalls: 0;
  automaticPaidFallback: false;
  aerariumLink: {
    billingClass: SargeBillingClass;
    measureState: "zero" | "unavailable";
    amountMinor: 0 | null;
    currency: "USD" | "";
    provenance: string;
  };
  createdAt: string;
}

export type RemoteCompanionPairingState = "placeholder_paired" | "revoked";
export type RemoteCompanionSessionState =
  | "offline"
  | "degraded"
  | "ready"
  | "disabled"
  | "revoked";

export interface RemoteCompanionRegistration {
  id: string;
  commanderId: "COMMANDER_PRODUCT_OWNER";
  displayName: string;
  platform: "windows";
  userScope: "current_user";
  protocolVersion: "castra-companion-poc/1.0.0";
  pairingState: RemoteCompanionPairingState;
  publicFingerprintPlaceholder: string;
  sessionState: RemoteCompanionSessionState;
  lastReceiptAt: string | null;
  registeredAt: string;
  updatedAt: string;
}

export type RemoteWorkJobStatus =
  | "queued"
  | "claimed"
  | "executing"
  | "terminal";

export interface RemoteWorkJob {
  id: string;
  proposalId: string;
  proposalRevision: number;
  proposalHash: string;
  approvalId: string;
  companionId: string;
  runtimeSelection: RemoteRuntimeSelection;
  status: RemoteWorkJobStatus;
  releasedAt: string;
  expiresAt: string;
  canceledAt: string | null;
}

export type RemoteWorkAttemptStatus = "claimed" | "executing" | "terminal";

export interface RemoteWorkAttempt {
  id: string;
  jobId: string;
  companionId: string;
  attemptNumber: 1;
  status: RemoteWorkAttemptStatus;
  leaseExpiresAt: string;
  claimedAt: string;
  startedAt: string | null;
  terminalAt: string | null;
}

export type RemoteReceiptOutcome = "proposal" | "failed" | "unknown" | "canceled" | "rejected";
export type RemoteEvidenceAvailability = "unavailable" | "simulated" | "zero";

export interface RemoteEvidenceBucket {
  availability: RemoteEvidenceAvailability;
  amountMinor: number | null;
  currency: string;
  tokens: number | null;
  observedRuntimeMs: number | null;
  provenance: string;
}

export interface RemoteEvidenceBuckets {
  subscriptionInteraction: RemoteEvidenceBucket;
  localRuntime: RemoteEvidenceBucket;
  hostedProviderInfrastructure: RemoteEvidenceBucket;
  apiMeteredUse: RemoteEvidenceBucket;
}

export interface RemoteWorkReceipt {
  id: string;
  jobId: string;
  attemptId: string | null;
  outcome: RemoteReceiptOutcome;
  redactedResult: string;
  reasonCode: string;
  reason: string;
  authority: "proposal_only";
  evidenceMode: "deterministic_local_simulation";
  modelCalls: 0;
  remoteProviderCalls: 0;
  evidenceBuckets: RemoteEvidenceBuckets;
  createdAt: string;
}

export type DeploymentEnvironment = "preview" | "production";
export type DeploymentRequestState =
  | "draft"
  | "approved"
  | "handoff_requested"
  | "attempted"
  | "verified"
  | "failed"
  | "unknown"
  | "cancelled";
export type DeploymentReceiptState =
  | "manual_assist_requested"
  | "attempted"
  | "verified"
  | "failed"
  | "unknown"
  | "cancelled";

export interface DeploymentRequest {
  id: string;
  revision: number;
  providerLabel: string;
  productName: "CASTRA";
  projectSlug: "castra";
  environment: DeploymentEnvironment;
  sourceBuildReference: string;
  targetHostname: string;
  campaignId: string;
  actionId: string;
  previewReceiptId: string;
  materialInputHash: string;
  state: DeploymentRequestState;
  authority: "manual_assist_record_only";
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentCommanderDecision {
  id: string;
  requestId: string;
  requestRevision: number;
  materialInputHash: string;
  decision: "approved" | "rejected";
  reason: string;
  decidedBy: "Commander";
  decidedAt: string;
  expiresAt: string | null;
}

export interface DeploymentReceipt {
  id: string;
  requestId: string;
  state: DeploymentReceiptState;
  providerUrl: string;
  providerStatusReference: string;
  domainReference: string;
  observedAt: string;
  redactedEvidenceReference: string;
  reason: string;
  externalCallsByCastra: 0;
  automaticRetry: false;
  createdAt: string;
}

export type ThemeProfileId = "slw_oil_gas" | "roman_command" | "operations_neutral" | "comic_command" | "galactic_command_bridge";
export type RoleLabelMode = "icon_only" | "icon_compact" | "full_name";
export type RoleIconChoice =
  | "command"
  | "chevron"
  | "forge"
  | "signal"
  | "compass"
  | "scribe"
  | "supply"
  | "shield"
  | "standard"
  | "scales";

export interface RoleDisplayEntry {
  canonicalId: CanonicalRoleId;
  displayName: string;
  compactCode: string;
  icon: RoleIconChoice;
  accentColor: string;
  description: string;
}

export type RoleRuntimeClass =
  | "human_only"
  | "local_ollama"
  | "codex_subscription_handoff"
  | "chatgpt_subscription_handoff"
  | "claude_code_subscription_handoff";

export type RoleRuntimeAvailability = "human_authority" | "review_required" | "unverified" | "blocked";

export interface RoleModelSelection {
  canonicalId: CanonicalRoleId;
  workflowKey: string;
  runtimeClass: RoleRuntimeClass;
  modelReference: string;
  availability: RoleRuntimeAvailability;
  policyNote: string;
  apiFallbackAllowed: false;
}

export interface PresentationSettingsVersion extends VersionedConfiguration {
  themeProfileId: ThemeProfileId;
  roleProfileName: string;
  aerariumLabelMode: RoleLabelMode;
  roles: RoleDisplayEntry[];
  modelSelections: RoleModelSelection[];
  /** Saved nonsecret preferences only; never evidence of a runtime being applied. */
  configurationPreferences?: ConfigurationPreferences;
}

export interface SubscriptionPlanVersion extends VersionedConfiguration {
  name: string;
  currency: string;
  planFeeMinor: number;
  periodStart: string;
  periodEnd: string;
}

export interface PriceCardVersion extends VersionedConfiguration {
  name: string;
  currency: string;
  inputPerMillionMinor: number;
  outputPerMillionMinor: number;
}

export interface ModelProfileVersion extends VersionedConfiguration {
  name: string;
  modelKey: string;
  roleId: string;
  charactersPerToken: number;
  priceCardVersionId: string;
}

export interface AllocationRuleVersion extends VersionedConfiguration {
  name: string;
  subscriptionPlanVersionId: string;
  eligibleRoleIds: string[];
  formula: "eligible_active_runtime";
}

export interface BudgetSettingsVersion extends VersionedConfiguration {
  name: string;
  currency: string;
  budgetMinor: number;
  confirmationThresholdMinor: number;
  requireConfirmation: boolean;
}

export type AerariumStoredMeasureKind =
  | "provider_actual"
  | "allocated_subscription_cost"
  | "estimated_tokens"
  | "api_equivalent_estimate";

export type MeasureConfidence = "manual_evidence" | "deterministic" | "allocation";

export interface AerariumStoredMeasure {
  id: string;
  runId: string;
  kind: AerariumStoredMeasureKind;
  value: number;
  unit: "minor_currency" | "tokens";
  currency: string;
  provenance: string;
  confidence: MeasureConfidence;
  evidenceReference: string;
  profileVersionId: string;
  priceCardVersionId: string;
  subscriptionPlanVersionId: string;
  allocationRuleVersionId: string;
  provisional: boolean;
  inputs: Record<string, string | number | boolean>;
  createdAt: string;
}

export type CreateCommand =
  | {
      type: "campaign.create";
      title: string;
      description: string;
      commanderIntent: string;
      notes: string;
    }
  | {
      type: "mission.create";
      campaignId: string;
      title: string;
      description: string;
      notes: string;
    }
  | {
      type: "action.create";
      missionId: string;
      title: string;
      description: string;
      notes: string;
      actionKind?: "standard" | "deployment";
    };

export type CastraCommand =
  | CreateCommand
  | {
      type: "record.update";
      entityType: EntityType;
      entityId: string;
      title: string;
      description: string;
      notes: string;
      commanderIntent?: string;
      actionKind?: "standard" | "deployment";
    }
  | {
      type: "campaign.deployment_eligibility.update";
      campaignId: string;
      assessment: Omit<
        DeploymentEligibility,
        "disposition" | "dispositionExplanation" | "disposedAt" | "disposedBy"
      >;
    }
  | {
      type: "campaign.deployment_eligibility.disposition";
      campaignId: string;
      disposition: DeploymentEligibilityDisposition;
      explanation: string;
    }
  | {
      type: "record.move";
      entityType: "mission" | "action";
      entityId: string;
      parentId: string;
    }
  | {
      type: "record.archive" | "record.restore" | "record.approve";
      entityType: EntityType;
      entityId: string;
    }
  | {
      type: "record.transition";
      entityType: EntityType;
      entityId: string;
      status: RecordStatus;
    }
  | {
      type: "action.operational_context.update";
      actionId: string;
      context: ActionOperationalContext;
    }
  | LifecycleCommand
  | TestCommand
  | AerariumCommand
  | PresentationCommand
  | LocalModelCommand
  | RemoteWorkCommand
  | SargeEngagementCommand
  | DeploymentWorkbenchCommand
  | UIReviewCommand
  | AuthenticationCommand;

export type LifecycleCommand =
  | {
      type: "action.close";
      commandId: string;
      actionId: string;
      expectedRevision: number;
      reason: string;
      evidenceReferences: string[];
    }
  | {
      type: "mission.close";
      commandId: string;
      missionId: string;
      expectedRevision: number;
      reason: string;
      evidenceReferences: string[];
    }
  | {
      type: "record.reopen";
      commandId: string;
      entityType: "mission" | "action";
      entityId: string;
      expectedRevision: number;
      reason: string;
      evidenceReferences: string[];
    }
  | {
      type: "action.follow_up.create";
      commandId: string;
      sourceActionId: string;
      expectedSourceRevision: number;
      missionId?: string;
      title: string;
      description: string;
      notes: string;
      reason: string;
      evidenceReferences: string[];
    };

export type SargeEngagementCommand =
  | {
      type: "sarge.engagement.create";
      target: SargeEngagementTarget;
      mode: SargeEngagementMode;
      requestedActivity: SargeRequestedActivity;
      scopeText: string;
      runtimePolicyVersionId: string;
      selectedRuntimeOptionId?: string;
    }
  | {
      type: "sarge.engagement.update";
      requestId: string;
      target: SargeEngagementTarget;
      mode: SargeEngagementMode;
      requestedActivity: SargeRequestedActivity;
      scopeText: string;
      selectedRuntimeOptionId: string;
    }
  | {
      type: "sarge.engagement.decide";
      requestId: string;
      decision: "approved" | "rejected";
      reason: string;
      expiresAt?: string;
    }
  | {
      type: "sarge.engagement.result.record";
      requestId: string;
      outcome: SargeResultOutcome;
      proposalText: string;
      proposedAssignments: SargeProposedAssignment[];
      reasonCode: string;
      reason: string;
      waitUntil?: string;
    };

export type UIReviewCommand =
  | {
      type: "ui_review.plan.create";
      campaignId: string;
      applicability: UIReviewApplicability;
      applicabilityReason: string;
      applicabilityEvidenceReference: string;
      experienceIntent: string;
      devicesAndScreenSizes: string;
      themeAndNavigationPattern: string;
      requiredCheckpoints: UIReviewCheckpointCode[];
      demonstrationDataNeeds: string;
      evidenceRequirement: string;
      screenshotRequired: boolean;
    }
  | {
      type: "ui_review.plan.update";
      planId: string;
      experienceIntent: string;
      devicesAndScreenSizes: string;
      themeAndNavigationPattern: string;
      requiredCheckpoints: UIReviewCheckpointCode[];
      demonstrationDataNeeds: string;
      evidenceRequirement: string;
      screenshotRequired: boolean;
    }
  | {
      type: "ui_review.checkpoint.update";
      checkpointId: string;
      scope: string;
      coveredUiRevision: string;
      evidenceRequirement: string;
      evidenceReferences: string[];
    }
  | { type: "ui_review.checkpoint.ready"; checkpointId: string }
  | {
      type: "ui_review.inventory.add";
      checkpointId: string;
      screenKey: string;
      screenName: string;
      componentReference: string;
      states: UIReviewStandardState[];
      additionalStates: string[];
      evidenceReferences: string[];
      fixtureContractId: string;
      targetAuthority: "ui_review_fixture" | "authoritative";
      destination?: UIReviewDestination;
      inspectionFocus?: string;
      knownIntentionalGaps?: string;
      requestedDecision?: string;
    }
  | {
      type: "ui_review.item.create";
      inventoryEntryId: string;
      screenReference: string;
      componentReference: string;
      sourceAttribution: string;
      sourceReference: string;
      comment: string;
      severity: Severity;
    }
  | {
      type: "ui_review.punch.create";
      reviewItemId: string;
      decisionId?: string;
      title: string;
      description: string;
      severity: Severity;
    }
  | {
      type: "ui_review.decision.record";
      checkpointId: string;
      checkpointRevision: number;
      inventoryEvidenceScope: string;
      disposition: UIReviewDisposition;
      rationale: string;
      evidenceReferences: string[];
      punchItemIds: string[];
    };

export type DeploymentWorkbenchCommand =
  | {
      type: "deployment_request.create";
      providerLabel: string;
      environment: DeploymentEnvironment;
      sourceBuildReference: string;
      targetHostname: string;
      campaignId: string;
      actionId: string;
      previewReceiptId?: string;
    }
  | {
      type: "deployment_request.update";
      requestId: string;
      providerLabel: string;
      environment: DeploymentEnvironment;
      sourceBuildReference: string;
      targetHostname: string;
      previewReceiptId?: string;
    }
  | {
      type: "deployment_request.decide";
      requestId: string;
      decision: "approved" | "rejected";
      reason: string;
      expiresAt?: string;
    }
  | { type: "deployment_handoff.request"; requestId: string }
  | {
      type: "deployment_receipt.record";
      requestId: string;
      state: "attempted" | "verified" | "failed" | "unknown";
      providerUrl: string;
      providerStatusReference: string;
      domainReference: string;
      observedAt: string;
      redactedEvidenceReference: string;
      reason: string;
    }
  | { type: "deployment_request.cancel"; requestId: string; reason: string };

export type RemoteWorkCommand =
  | {
      type: "remote_work.proposal.create";
      source: RemoteWorkSource;
      sourceText: string;
      sourceReference: string;
      target: RemoteWorkTarget;
      allowedActivity: RemoteAllowedActivity;
      runtimeSelection: RemoteRuntimeSelection;
    }
  | {
      type: "remote_work.proposal.update";
      proposalId: string;
      sourceText: string;
      sourceReference: string;
      target: RemoteWorkTarget;
      allowedActivity: RemoteAllowedActivity;
      runtimeSelection: RemoteRuntimeSelection;
    }
  | {
      type: "remote_work.proposal.decide";
      proposalId: string;
      decision: "approved" | "rejected";
      reason: string;
      expiresAt?: string;
    }
  | {
      type: "remote_work.companion.register_placeholder";
      displayName: string;
      publicFingerprintPlaceholder: string;
    }
  | {
      type: "remote_work.companion.session.set";
      companionId: string;
      sessionState: "offline" | "degraded" | "ready";
    }
  | { type: "remote_work.companion.disable"; companionId: string; reason: string }
  | { type: "remote_work.companion.revoke"; companionId: string; reason: string }
  | { type: "remote_work.job.release"; proposalId: string; companionId: string }
  | {
      type: "remote_work.job.claim";
      jobId: string;
      companionId: string;
      leaseExpiresAt: string;
    }
  | { type: "remote_work.job.reject"; jobId: string; companionId: string; reason: string }
  | { type: "remote_work.job.start"; jobId: string; attemptId: string }
  | { type: "remote_work.job.cancel"; jobId: string; reason: string }
  | {
      type: "remote_work.job.outcome.record";
      jobId: string;
      attemptId: string;
      outcome: "proposal" | "failed" | "unknown";
      redactedResult: string;
      reasonCode: string;
      reason: string;
    };

export type PresentationCommand =
  | { type: "presentation.configuration.save"; configurationPreferences: ConfigurationPreferences }
  | { type: "presentation.profile.apply"; themeProfileId: ThemeProfileId }
  | {
      type: "presentation.role.update";
      canonicalId: CanonicalRoleId;
      displayName: string;
      compactCode: string;
      icon: RoleIconChoice;
      accentColor: string;
      description: string;
    }
  | { type: "presentation.label_mode.change"; labelMode: RoleLabelMode }
  | {
      type: "presentation.role_model.change";
      canonicalId: CanonicalRoleId;
      runtimeClass: RoleRuntimeClass;
    };

export type AuthenticationCommand =
  | {
      type: "welcome_access.configuration.version.create";
      supersedesId?: string;
      destinations: WelcomeAccessConfigurationVersion["destinations"];
    }
  | {
      type: "auth.policy.version.create";
      supersedesId?: string;
      idleTimeoutSeconds: number;
      absoluteTimeoutSeconds: number;
      productOwnerStepUpFreshnessSeconds: number;
      valuesStatus: AuthenticationPolicyVersion["valuesStatus"];
      callbackRedirectAllowlist: string[];
      providerState: AuthenticationProviderState;
    }
  | {
      type: "auth.identity.version.record";
      supersedesId?: string;
      providerSubjectReference: string;
      displayReference: string;
      lifecycleState: IdentityLifecycleState;
      verificationState: IdentityVerificationState;
      evidenceReference: string;
    }
  | {
      type: "auth.authority.record";
      identityFamilyId: string;
      authority: AuthorityKind;
      status: "assigned" | "revoked";
      evidenceReference: string;
      recordedBy: "Commander" | "Product Owner";
    }
  | {
      type: "auth.workflow.record";
      workflow: AuthWorkflowKind;
      identityFamilyId?: string;
      state: AuthWorkflowState;
      networkAvailable: boolean;
      providerState: AuthenticationProviderState;
      failureCategory: AuthFailureCategory;
      publicMessage: string;
      callbackReference?: string;
    }
  | {
      type: "auth.session.receipt.record";
      sessionReference: string;
      identityFamilyId: string;
      authorityAssignmentIds: string[];
      createdAt: string;
      lastActiveAt: string;
      idleExpiresAt: string;
      absoluteExpiresAt: string;
      renewalDueAt: string;
      expiresAt: string;
      status: SessionReceiptStatus;
      deviceReference: string;
      provenance: SessionReceipt["provenance"];
    }
  | {
      type: "auth.session.touch";
      sessionReference: string;
      lastActiveAt: string;
      idleExpiresAt: string;
      renewalDueAt: string;
      expiresAt: string;
    }
  | {
      type: "auth.session.invalidate";
      sessionReference: string;
      reason: string;
    }
  | {
      type: "auth.step_up.record";
      identityFamilyId: string;
      sensitiveActionClass: SensitiveActionClass;
      outcome: StepUpReceipt["outcome"];
      verifiedAt: string;
      validUntil: string;
      evidenceReference: string;
      provenance: StepUpReceipt["provenance"];
    };

export type LocalModelCommand =
  | {
      type: "local_model.policy.version.create";
      supersedesId?: string;
      name: string;
      workflowKey: string;
      activityKey: string;
      riskTier: LocalModelRiskTier;
      productOwnerPermitted: boolean;
      enabled: boolean;
      allowedModelNames: string[];
      roleId: CanonicalRoleId | "";
      rolePreferredModelNames: string[];
      requiredCapability: LocalModelCapability;
      maxInputCharacters: number;
      maxOutputTokens: number;
    }
  | {
      type: "local_model.catalog.record";
      adapterId: "ollama_loopback";
      adapterVersion: string;
      catalogVersion: string;
      endpointOrigin: "http://127.0.0.1:11434";
      locality: "fixed_os_loopback";
      localityEvidence: string;
      runtimeStatus: "healthy" | "unavailable";
      runtimeVersion: string;
      models: LocalModelCatalogEntry[];
      unavailableReason: string;
      observedAt: string;
    }
  | {
      type: "local_model.invocation.request";
      workflowKey: string;
      activityKey: string;
      riskTier: LocalModelRiskTier;
      roleId: CanonicalRoleId;
      work: WorkLink;
      prompt: string;
    }
  | {
      type: "local_model.invocation.complete";
      invocationId: string;
      result:
        | {
            status: "proposal";
            content: string;
            modelName: string;
            modelDigest: string;
            usage: LocalModelRuntimeUsage;
          }
        | {
            status: "unavailable";
            code: string;
            reason: string;
          };
    }
  | {
      type: "local_model.proposal.review";
      proposalId: string;
      decision: "noted" | "rejected";
      notes: string;
    };

export type TestCommand =
  | {
      type: "test_plan.create";
      title: string;
      description: string;
      link: WorkLink;
    }
  | { type: "test_plan.status"; testPlanId: string; status: TestPlanStatus }
  | { type: "test_cycle.create"; testPlanId: string; title: string }
  | { type: "test_cycle.status"; testCycleId: string; status: TestCycleStatus }
  | {
      type: "test_case.create";
      testPlanId: string;
      title: string;
      expectedResult: string;
      requirementReference: string;
      sourceReference: string;
      required: boolean;
      severity: Severity;
    }
  | { type: "test_case.status"; testCaseId: string; status: TestCaseStatus }
  | {
      type: "test_result.record";
      testCaseId: string;
      testCycleId: string;
      outcome: TestOutcome;
      actualResult: string;
      executor: string;
      executedAt: string;
      evidenceReference: string;
      resultReference: string;
      unavailableReason: string;
    }
  | {
      type: "punch_item.create_from_result";
      testResultId: string;
      title: string;
      description: string;
      severity: Severity;
    }
  | {
      type: "punch_item.update";
      punchItemId: string;
      title: string;
      description: string;
      severity: Severity;
    }
  | { type: "punch_item.transition"; punchItemId: string; status: PunchStatus }
  | { type: "punch_item.verify"; punchItemId: string; evidenceReference: string }
  | { type: "punch_item.waive"; punchItemId: string; reason: string }
  | {
      type: "firewatch_verification.record";
      testPlanId: string;
      outcome: FirewatchVerificationOutcome;
      verifiedAt: string;
      evidenceReference: string;
      unavailableReason: string;
    }
  | {
      type: "exit_decision.record";
      testPlanId: string;
      decision: ExitDecisionValue;
      rationale: string;
    };

export type AerariumCommand =
  | {
      type: "aerarium_run.create";
      title: string;
      work: WorkLink;
      roleId: string;
      modelKey: string;
      startedAt: string;
    }
  | {
      type: "aerarium_run_event.append";
      runId: string;
      eventType: Exclude<AerariumRunEventType, "start">;
      occurredAt: string;
      note: string;
      outcome: string;
      inputCharacters: number | null;
      outputCharacters: number | null;
    }
  | {
      type: "subscription_plan.version.create";
      supersedesId?: string;
      name: string;
      currency: string;
      planFeeMinor: number;
      periodStart: string;
      periodEnd: string;
    }
  | {
      type: "price_card.version.create";
      supersedesId?: string;
      name: string;
      currency: string;
      inputPerMillionMinor: number;
      outputPerMillionMinor: number;
    }
  | {
      type: "model_profile.version.create";
      supersedesId?: string;
      name: string;
      modelKey: string;
      roleId: string;
      charactersPerToken: number;
      priceCardVersionId: string;
    }
  | {
      type: "allocation_rule.version.create";
      supersedesId?: string;
      name: string;
      subscriptionPlanVersionId: string;
      eligibleRoleIds: string[];
    }
  | {
      type: "budget_settings.version.create";
      supersedesId?: string;
      name: string;
      currency: string;
      budgetMinor: number;
      confirmationThresholdMinor: number;
      requireConfirmation: boolean;
    }
  | {
      type: "aerarium_provider_actual.record";
      runId: string;
      valueMinor: number;
      currency: string;
      evidenceReference: string;
    }
  | { type: "aerarium_estimate.snapshot"; runId: string }
  | { type: "aerarium_allocation.snapshot"; runId: string; allocationRuleVersionId: string; asOf: string };

export interface CommandContext {
  now: () => string;
  id: (kind: IdKind) => string;
  presentationScope?: "authoritative" | "public_demo";
  commandAuthority?: "Commander" | "Agent";
}
