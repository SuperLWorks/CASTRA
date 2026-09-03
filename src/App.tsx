import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ErrorInfo, ReactNode } from "react";
import { allowedTransitions, applyCommand, emptyState, findRecord } from "./domain/commands";
import { createId, shortId } from "./domain/ids";
import type {
  Action,
  ActionAttentionState,
  Campaign,
  CastraCommand,
  CastraRecord,
  CastraState,
  EntityType,
  Mission,
  RecordStatus,
  SargeEngagementTarget,
  UIReviewDestination,
  UIReviewScenario,
  WorkLink,
} from "./domain/types";
import { IndexedDbStateRepository, type StateRepository } from "./data/repository";
import {
  HostedStateRepository,
  HostedStateSessionProofError,
  HostedStateStaleBaselineError,
  HostedStateUnconfirmedResultError,
  HostedStateUnknownOutcomeError,
  hostedStateAdoptionDecision,
  hostedStateRefreshPermitted,
  hostedWriteBaseline,
  type HostedStateAvailability,
  type HostedStateLoadResult,
  type PendingHostedStateCommandRecord,
  type PreparedHostedStateInitialImport,
  type PreparedHostedStateWrite,
} from "./data/hostedStateRepository";
import {
  authoritativeWriteGate,
  buildAuthoritativeSessionBoardBinding,
  buildSessionBoardAuthority,
  createSessionBoardAllocationController,
  initialSessionBoardAuthorityViewState,
  sessionBoardAuthorityDispatchPermitted,
  sessionBoardAuthorityViewAfterBaseline,
  sessionBoardAuthorityViewAfterSettlement,
  sessionBoardReconcilePermitted,
  type SessionBoardAllocationController,
  type SessionBoardAllocationOutcome,
  type SessionBoardAuthorityGate,
  type SessionBoardAuthorityViewState,
  type SessionBoardBaselineIdentity,
} from "./data/sessionBoardAllocationController";
import {
  bindInitialImportApproval,
  bindInitialImportAuthority,
  buildInitialImportCandidateFromFiles,
  buildInitialImportReviewEvidence,
  initialImportControlVisible,
  type InitialImportCandidate,
  type InitialImportReviewEvidence,
} from "./domain/initialHostedStateImport";
import { hostedSha256, hostedStateDocumentDigest } from "./domain/hostedOperationalStateDigest";
import {
  buildPostHighWaterReconciliationCandidate,
  postHighWaterReconciliationControlVisible,
  type PostHighWaterReconciliationCandidate,
} from "./domain/postHighWaterReconciliation";
import {
  buildHostedStateEvidenceCapture,
  hostedStateEvidenceCaptureFileName,
  hostedStateEvidenceExportControlVisible,
  serializeHostedStateEvidenceCapture,
} from "./domain/hostedStateEvidenceCapture";
import { TestingWorkspace } from "./testing/TestingWorkspace";
import { AerariumWorkspace } from "./aerarium/AerariumWorkspace";
import { GraphWorkspace } from "./graph/GraphWorkspace";
import { ConfigurationWorkspace, TeamWorkspace } from "./presentation/PresentationWorkspace";
import { configurationConnectionForApp } from "./team-configuration/configurationConnection";
import { currentPresentation, presentRole, semanticThemeVariables, themeProfile } from "./domain/presentation";
import { LocalModelWorkspace, type InvocationInput } from "./local-models/LocalModelWorkspace";
import { ollamaAdapter } from "./connectors/ollamaAdapter";
import { RemoteWorkbench } from "./remote-work/RemoteWorkbench";
import { SargeEngagementWorkspace } from "./sarge/SargeEngagementWorkspace";
import { DeploymentWorkbench } from "./deployment/DeploymentWorkbench";
import { DeploymentGuideWorkspace } from "./deployment/DeploymentGuideWorkspace";
import { UIReviewWorkspace } from "./ui-review/UIReviewWorkspace";
import { SessionBoard } from "./session-board/SessionBoard";
import { buildSessionBoardFixture } from "./session-board/sessionBoardFixture";
import {
  CommandOverview,
  type CampaignWorkspaceSection,
  type CommandOverviewWebMcpActivity,
} from "./command/CommandOverview";
import { GovernedClosureWorkspace } from "./command/GovernedClosureWorkspace";
import {
  applyTier1DirectClose,
  tier1DirectCloseReview,
  type Tier1DirectCloseReview,
} from "./command/tier1DirectClose";
import {
  ACTION_REVIEW_ATTENTION_LABELS,
  ACTION_REVIEW_ATTENTION_STATES,
  ACTION_REVIEW_STAGING_COMMAND_TYPE,
  actionReviewStagingDefaults,
  actionReviewStagingEligible,
  actionReviewStagingStillBound,
  buildActionReviewStagingPlan,
  type ActionReviewStagingInput,
} from "./command/actionReviewStaging";
import { applyGovernedClosureStep, type GovernedClosureRequest } from "./command/governedClosure";
import { DEMO_NAVIGATION_VIEWS, POST_LOGIN_NAVIGATION } from "./command/navigation";
import { TroopWelfareWorkspace } from "./troop-welfare/TroopWelfareWorkspace";
import { mergeC001SourceBundle } from "./data/c001SourceBundle";
import { applyCampaignBaselineTemplate } from "./campaign/campaignBaseline";
import { buildCampaignFlow, campaignMissionProjections, type CampaignFlowStep } from "./campaign/campaignExperience";
import { demoSyntheticMeasure } from "./demo/demoStewardship";
import { buildGovernedPublicDemoState } from "./demo/publicDemoPresentation";
import { ComicCommandDisclaimer } from "./demo/ComicCommandDisclaimer";
import { GalacticCommandBridgeDisclaimer } from "./demo/GalacticCommandBridgeDisclaimer";
import { WelcomeAccessWorkspace } from "./auth/WelcomeAccessWorkspace";
import { AuthenticatedSessionAccess } from "./auth/AuthenticatedSessionAccess";
import {
  CANONICAL_COMMANDER_ORIGIN,
  LiveBrowserAuthenticationClient,
  commanderSessionProof,
  type BrowserAuthResult,
  type CommanderSessionProof,
} from "./auth/liveAuthClient";
import {
  OPERATIONAL_STATE_INITIAL_IMPORT_PROOF_ACTION,
  OPERATIONAL_STATE_RECOVERY_PROOF_ACTION,
  submitProductOwnerStepUpForm,
} from "./auth/productOwnerStepUpForm";
import {
  initialAuthExperienceState,
  transitionAuthExperience,
  usesPreAuthenticationShell,
  type AuthExperienceEvent,
} from "./auth/deterministicAuthUi";
import {
  authoritativeStateDigest,
  buildUI03ReviewState,
  UI03_FIXTURE_MANIFEST,
  UI03_FIXTURE_REVISION,
  UI03_REVIEW_SESSION_KEY,
  requireUI03ReviewReadOnly,
  validateReviewSession,
  type UI03ReviewSession,
} from "./ui-review/ui03Fixture";
import {
  detectWebMcpCapability,
  registerCastraWebMcpTools,
  type WebMcpExecutionEvent,
} from "./webmcp/registration";
import {
  WEBMCP_DRAFT_REVERSAL_NOTE,
  WEBMCP_READ_ONLY_TOOL_NAMES,
  isProposalTool,
  type WebMcpAuthorityDescriptor,
  type WebMcpClientDraft,
  type WebMcpExperienceMode,
  type WebMcpProposalBoundary,
  type WebMcpStateSnapshot,
} from "./webmcp/contracts";
import { buildPlanTargetIndex, reviewPlanDraft, summarizeReview } from "./webmcp/proposals";
import { SessionPlanDraftSurface } from "./session-board/SessionPlanDraftSurface";
import {
  draftAfterExperienceTransition,
  type SessionPlanDraftReviewSummary,
} from "./session-board/sessionPlanDraftView";

type View =
  | "overview"
  | "welcome-access"
  | "campaigns"
  | "testing"
  | "ui-reviews"
  | "audit"
  | "aerarium"
  | "graph"
  | "configuration"
  | "team"
  | "local-models"
  | "remote-work"
  | "sarge-engagement"
  | "deployment-workbench"
  | "deployment-guide"
  | "governed-closure"
  | "decision-inbox"
  | "war-efforts"
  | "baseops"
  | "session-board"
  | "troop-welfare"
  | "agents";

type FormRequest =
  | { mode: "create"; entityType: EntityType; parentId?: string }
  | { mode: "edit"; entityType: EntityType; entityId: string };

interface PreparedInitialImportReview {
  candidate: InitialImportCandidate;
  prepared: PreparedHostedStateInitialImport;
  evidence: InitialImportReviewEvidence;
}

interface PreparedPostHighWaterReconciliationReview {
  candidate: PostHighWaterReconciliationCandidate;
  prepared: PreparedHostedStateWrite;
}

/**
 * One completed write. `state` is the state that may be displayed. `confirmed`
 * is the exact authoritative result the hosted write was confirmed against, and
 * is null on the pre-cutover local candidate path, which is never authoritative.
 * A second hosted write issued from the same asynchronous flow must carry that
 * exact result forward as its baseline instead of the render-captured one.
 */
interface PersistedWrite {
  state: CastraState;
  confirmed: HostedStateLoadResult | null;
}

const indexedDbRepository = new IndexedDbStateRepository();
const liveAuthenticationClient = new LiveBrowserAuthenticationClient();

/**
 * The mounted application observes every credential-free session renewal, so
 * the visible authentication state stays truthful even when the renewal is
 * triggered from inside the hosted-state dispatch boundary rather than from a
 * control the Commander clicked. CASTRA mounts one application, so this is a
 * single-writer hook rather than a subscriber list.
 */
let commanderSessionObserver: ((result: BrowserAuthResult, proof: CommanderSessionProof) => void) | null = null;

/**
 * Immediately before every authenticated hosted mutation: resolve the session
 * again over the same origin, which re-issues the readable CSRF proof when the
 * boundary's bounded lifetime has passed and revalidates the current Commander
 * receipt. No credential is sent, nothing is written, and no server control is
 * weakened or bypassed — the dispatch still carries and the server still
 * validates the proof.
 */
async function renewLiveCommanderSessionProof(): Promise<CommanderSessionProof> {
  const result = await liveAuthenticationClient.resolveSession();
  const proof = commanderSessionProof(result);
  commanderSessionObserver?.(result, proof);
  return proof;
}

const hostedStateRepository = new HostedStateRepository(undefined, undefined, renewLiveCommanderSessionProof);
let activeStateRepository: StateRepository = indexedDbRepository;

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

const SESSION_BOARD_PENDING_HUMAN_IDENTITY = "Pending authoritative allocation";

type PresentationRecordType = "campaign" | "mission" | "action";

const IDENTIFIER_ONTOLOGY_PATTERNS: Record<PresentationRecordType, RegExp> = {
  campaign: /^C\d{3}$/,
  mission: /^C\d{3}\.M\d{3}$/,
  action: /^C\d{3}\.M\d{3}\.A\d{3}$/,
};

function presentationIdentity(recordType: PresentationRecordType, id: string): string {
  return IDENTIFIER_ONTOLOGY_PATTERNS[recordType].test(id)
    ? id
    : SESSION_BOARD_PENDING_HUMAN_IDENTITY;
}

function presentationIdentitySummary(recordType: PresentationRecordType, id: string): string {
  return `${presentationIdentity(recordType, id)} · ${shortId(id)}`;
}

function PresentationRecordIdentity({ recordType, id }: { recordType: PresentationRecordType; id: string }) {
  return (
    <span className="record-id record-id-stack" aria-label={`${recordType} identity`}>
      <span className="record-id-primary">{presentationIdentity(recordType, id)}</span>
      <span className="record-id-secondary">Short ID: {shortId(id)}</span>
    </span>
  );
}

function StatusBadge({ record }: { record: CastraRecord }) {
  return (
    <span className={`status status-${record.archivedAt ? "archived" : record.status}`}>
      {record.archivedAt ? "Archived" : humanize(record.status)}
    </span>
  );
}

function ApprovalBadge({ record }: { record: CastraRecord }) {
  return record.approval ? (
    <span className="approval approval-approved">✓ Approved · r{record.approval.revision}</span>
  ) : (
    <span className="approval">Awaiting approval</span>
  );
}

interface RecordControlsProps {
  record: CastraRecord;
  execute: (commands: CastraCommand[]) => void;
  edit: () => void;
}

function RecordControls({ record, execute, edit }: RecordControlsProps) {
  const governedClosed = (record.type === "mission" || record.type === "action") && record.status === "completed";
  const governedCloseAvailable = (record.type === "mission" || record.type === "action") && allowedTransitions(record).includes("completed");
  const transitions = allowedTransitions(record).filter((status) => status !== "completed" || record.type === "campaign");
  return (
    <div className="record-controls">
      {!record.archivedAt && (
        <>
          {!governedClosed && <button className="button button-quiet" onClick={edit}>Edit</button>}
          {!governedClosed && record.type !== "action" && !record.approval && (
            <button
              className="button button-quiet"
              onClick={() =>
                execute([
                  {
                    type: "record.approve",
                    entityType: record.type,
                    entityId: record.id,
                  },
                ])
              }
            >
              Approve
            </button>
          )}
          {transitions.map((status) => (
            <button
              className="button button-accent"
              key={status}
              onClick={() =>
                execute([
                  {
                    type: "record.transition",
                    entityType: record.type,
                    entityId: record.id,
                    status,
                  },
                ])
              }
            >
              Move to {humanize(status)}
            </button>
          ))}
          {governedCloseAvailable && record.type !== "action" && <span className="integrity-mark">READY FOR GOVERNED CLOSE · EXACT REVISION + EVIDENCE REQUIRED</span>}
          {governedClosed && <span className="integrity-mark">CLOSED · REOPEN OR FOLLOW-UP REQUIRES COMMANDER COMMAND</span>}
          <button
            className="button button-danger"
            onClick={() =>
              execute([
                { type: "record.archive", entityType: record.type, entityId: record.id },
              ])
            }
          >
            Archive
          </button>
        </>
      )}
      {record.archivedAt && (
        <button
          className="button button-accent"
          onClick={() =>
            execute([
              { type: "record.restore", entityType: record.type, entityId: record.id },
            ])
          }
        >
          Restore
        </button>
      )}
    </div>
  );
}

function Tier1DirectCloseControl({
  state,
  action,
  available,
  busy,
  close,
}: {
  state: CastraState;
  action: Action;
  available: boolean;
  busy: boolean;
  close: (review: Tier1DirectCloseReview) => Promise<boolean>;
}) {
  const review = tier1DirectCloseReview(state, action);
  if (!review.visible) return null;
  const disabled = !available || busy || !review.eligible;
  return (
    <section className="tier1-direct-close" aria-label={`Tier 1 direct closure for ${action.id}`}>
      <div className="tier1-direct-close-heading">
        <div>
          <span className="eyebrow">Ready for Commander decision · CASTRA Tier 1</span>
          <strong>Evidence is preassembled; no manual entry required.</strong>
        </div>
        <button className="button button-primary" disabled={disabled} onClick={() => close(review)}>
          {busy ? "Closing…" : review.buttonLabel}
        </button>
      </div>
      <dl className="tier1-direct-close-summary">
        <div><dt>Target</dt><dd>{review.target}</dd></div>
        <div><dt>Effect</dt><dd>{review.effect}</dd></div>
        <div><dt>Rollback</dt><dd>{review.rollback}</dd></div>
        <div><dt>Alternatives</dt><dd>{review.alternatives.join(" · ")}</dd></div>
        <div><dt>Residual risk</dt><dd>{review.residualRisk}</dd></div>
      </dl>
      <div className="tier1-direct-close-evidence">
        <span>Bound evidence ({review.evidenceReferences.length})</span>
        {review.evidenceReferences.map((reference) => <code key={reference}>{reference}</code>)}
      </div>
      {!available && <p className="tier1-direct-close-blocker">The button activates only in the authenticated live Commander session with hosted authority loaded and no unknown write outcome.</p>}
      {review.issues.length > 0 && <ul className="tier1-direct-close-blocker">{review.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
    </section>
  );
}

/**
 * C001.M016 — "Stage for Commander Review".
 *
 * The visible governed control for an eligible, non-completed Action row. It
 * prepares exactly one `action.operational_context.update` command with
 * `src/command/actionReviewStaging.ts` and hands it to the existing `execute`
 * callback. `execute` → `persistAndConfirm` → `HostedStateRepository` remains
 * the sole mutation path, so the authenticated same-origin proof, CSRF, store
 * revision protection, request binding, idempotency retention, authoritative
 * reread, rejection handling, and unknown-outcome reconciliation are neither
 * duplicated nor bypassed here. Nothing in this component approves, closes, or
 * reopens anything, and it never supplies Commander authority.
 */
function ActionReviewStagingControl({
  action,
  busy,
  execute,
}: {
  action: Action;
  busy: boolean;
  execute: (commands: CastraCommand[]) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ActionReviewStagingInput | null>(null);
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const ownerRef = useRef<HTMLInputElement | null>(null);
  const formId = `action-review-staging-${action.id}`;

  useEffect(() => {
    if (open) ownerRef.current?.focus();
  }, [open]);

  const review = useMemo(
    () => (draft ? buildActionReviewStagingPlan(draft, action.operationalContext) : null),
    [draft, action.operationalContext],
  );

  if (!actionReviewStagingEligible(action)) return null;

  // The reviewed payload is bound to the exact Action and revision it was built
  // from. Any drift disables submission; the Commander rebuilds from current
  // state by closing and reopening the form.
  const bound = draft ? actionReviewStagingStillBound(draft, action) : false;
  const submitDisabled = !review?.plan || !bound || busy || submitting;
  const blockers = [
    busy ? "Another authoritative control is busy." : "",
    submitting ? "The prepared command is in flight; nothing is retried automatically." : "",
    draft && !bound
      ? `The Action is now at revision r${action.revision}. Close and reopen the form to rebuild the payload from current state.`
      : "",
    review && !review.plan ? "The payload digest is unavailable until every required value is valid." : "",
  ].filter(Boolean);

  function update(patch: Partial<ActionReviewStagingInput>): void {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function openReview(): void {
    setDraft(actionReviewStagingDefaults(action));
    setNotice("");
    setOpen(true);
  }

  function closeReview(): void {
    setOpen(false);
    setDraft(null);
  }

  async function submitReview(): Promise<void> {
    if (!review?.plan || !bound || busy || submitting) return;
    const plan = review.plan;
    setSubmitting(true);
    setNotice("");
    try {
      // Exactly one command, through the existing application command path.
      const applied = await execute([plan.command]);
      if (applied) {
        setNotice(`Submitted one ${ACTION_REVIEW_STAGING_COMMAND_TYPE} for ${plan.actionId}, reviewed at Action revision r${plan.expectedRevision} · payload ${plan.payloadDigest}.`);
        closeReview();
        return;
      }
      setNotice("The command was not applied. The exact reason is shown in the page notice; nothing was retried and the reviewed payload is unchanged.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="action-review-staging" aria-label={`Stage ${action.id} for Commander review`}>
      <div className="action-review-staging-heading">
        <div>
          <span className="eyebrow">Operational context · no approval or closure</span>
          <strong>Stage for Commander Review</strong>
        </div>
        <button
          type="button"
          className="button button-small"
          aria-expanded={open}
          aria-controls={open ? formId : undefined}
          onClick={() => (open ? closeReview() : openReview())}
        >
          {open ? "Cancel review" : "Stage for Commander Review"}
        </button>
      </div>
      <p className="action-review-staging-status" role="status" aria-live="polite">{notice}</p>
      {open && draft && (
        <form
          id={formId}
          className="action-review-staging-form"
          onSubmit={(event) => { event.preventDefault(); void submitReview(); }}
        >
          <dl className="action-review-staging-binding">
            <div><dt>Action</dt><dd><code>{action.id}</code></dd></div>
            <div><dt>Reviewed Action revision</dt><dd><code>r{draft.expectedRevision}</code>{bound ? "" : ` · current r${action.revision}`}</dd></div>
            <div><dt>Command</dt><dd><code>{ACTION_REVIEW_STAGING_COMMAND_TYPE}</code></dd></div>
            <div><dt>SHA-256 payload digest</dt><dd><code>{review?.plan?.payloadDigest ?? "Unavailable"}</code></dd></div>
          </dl>
          <div className="action-review-staging-fields">
            <div className="action-review-staging-field">
              <label htmlFor={`${formId}-owner`}>Operational owner</label>
              <input
                id={`${formId}-owner`}
                ref={ownerRef}
                type="text"
                value={draft.owner}
                onChange={(event) => update({ owner: event.target.value })}
              />
            </div>
            <div className="action-review-staging-field">
              <label htmlFor={`${formId}-attention`}>Attention state</label>
              <select
                id={`${formId}-attention`}
                value={draft.attentionState}
                onChange={(event) => update({ attentionState: event.target.value as ActionAttentionState })}
              >
                {ACTION_REVIEW_ATTENTION_STATES.map((attentionState) => (
                  <option key={attentionState} value={attentionState}>
                    {ACTION_REVIEW_ATTENTION_LABELS[attentionState]}
                  </option>
                ))}
              </select>
            </div>
            <div className="action-review-staging-field">
              <label htmlFor={`${formId}-blocker`}>Blocker</label>
              <input
                id={`${formId}-blocker`}
                type="text"
                value={draft.blocker}
                aria-describedby={`${formId}-blocker-help`}
                onChange={(event) => update({ blocker: event.target.value })}
              />
              <small id={`${formId}-blocker-help`}>Leave empty when nothing is blocking the Action.</small>
            </div>
            <div className="action-review-staging-field">
              <label htmlFor={`${formId}-next-gate`}>Next gate</label>
              <input
                id={`${formId}-next-gate`}
                type="text"
                value={draft.nextGate}
                onChange={(event) => update({ nextGate: event.target.value })}
              />
            </div>
            <div className="action-review-staging-field">
              <label htmlFor={`${formId}-primary-evidence`}>Primary evidence reference</label>
              <input
                id={`${formId}-primary-evidence`}
                type="text"
                value={draft.primaryEvidenceReference}
                aria-describedby={`${formId}-primary-evidence-help`}
                onChange={(event) => update({ primaryEvidenceReference: event.target.value })}
              />
              <small id={`${formId}-primary-evidence-help`}>Bound first in the evidence list.</small>
            </div>
            <div className="action-review-staging-field action-review-staging-field-wide">
              <label htmlFor={`${formId}-evidence`}>Evidence references</label>
              <textarea
                id={`${formId}-evidence`}
                rows={3}
                value={draft.evidenceReferences.join("\n")}
                aria-describedby={`${formId}-evidence-help`}
                onChange={(event) => update({ evidenceReferences: event.target.value.split(/\r?\n/) })}
              />
              <small id={`${formId}-evidence-help`}>One reference per line. References are trimmed and de-duplicated in the order shown; an over-contract package is reported, never truncated.</small>
            </div>
          </div>
          {review && review.issues.length > 0 && (
            <ul className="action-review-staging-issue" role="alert">
              {review.issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          )}
          {draft && !bound && (
            <p className="action-review-staging-issue" role="alert">
              The Action moved to revision r{action.revision} after this payload was prepared. Close and reopen the form to rebuild it from current state.
            </p>
          )}
          {review && review.advisories.length > 0 && (
            <p className="action-review-staging-advisory">{review.advisories.join(" ")}</p>
          )}
          {review?.plan && (
            <details className="action-review-staging-payload">
              <summary>Canonical payload · {review.plan.canonicalPayload.length} characters digested</summary>
              <pre>{review.plan.canonicalPayload}</pre>
            </details>
          )}
          <div className="action-review-staging-actions">
            <button type="submit" className="button button-primary" disabled={submitDisabled}>
              {submitting ? "Submitting…" : "Submit review payload"}
            </button>
            <button type="button" className="button button-quiet" onClick={closeReview}>Cancel</button>
          </div>
          {blockers.length > 0 && <p className="action-review-staging-hint">{blockers.join(" ")}</p>}
          <p className="action-review-staging-boundary">
            This prepares exactly one operational-context update and submits it through the existing authenticated command path. It cannot approve, close, or reopen an Action, Mission, or Campaign, and it supplies no Commander authority.
          </p>
        </form>
      )}
    </section>
  );
}

interface RecordFormProps {
  request: FormRequest;
  state: CastraState;
  close: () => void;
  submit: (commands: CastraCommand[]) => void;
}

function RecordForm({ request, state, close, submit }: RecordFormProps) {
  const existing =
    request.mode === "edit"
      ? findRecord(state, request.entityType, request.entityId)
      : undefined;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [commanderIntent, setCommanderIntent] = useState(
    existing?.type === "campaign" ? existing.commanderIntent : "",
  );
  const [actionKind, setActionKind] = useState<"standard" | "deployment">(
    existing?.type === "action" ? existing.actionKind : "standard",
  );
  const existingParent =
    existing?.type === "mission"
      ? existing.campaignId
      : existing?.type === "action"
        ? existing.missionId
        : undefined;
  const [parentId, setParentId] = useState(request.mode === "create" ? request.parentId ?? "" : existingParent ?? "");

  const entityLabel = humanize(request.entityType);
  const parentOptions =
    request.entityType === "mission"
      ? state.campaigns.filter((campaign) => !campaign.archivedAt)
      : request.entityType === "action"
        ? state.missions.filter((mission) => !mission.archivedAt)
        : [];

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (request.mode === "create") {
      if (request.entityType === "campaign") {
        submit([
          {
            type: "campaign.create",
            title,
            description,
            commanderIntent,
            notes,
          },
        ]);
      } else if (request.entityType === "mission") {
        submit([
          { type: "mission.create", campaignId: parentId, title, description, notes },
        ]);
      } else {
        submit([{ type: "action.create", missionId: parentId, title, description, notes, actionKind }]);
      }
      return;
    }

    const commands: CastraCommand[] = [
      {
        type: "record.update",
        entityType: request.entityType,
        entityId: request.entityId,
        title,
        description,
        notes,
        commanderIntent,
        actionKind,
      },
    ];
    if (request.entityType !== "campaign" && parentId !== existingParent) {
      commands.push({
        type: "record.move",
        entityType: request.entityType,
        entityId: request.entityId,
        parentId,
      });
    }
    submit(commands);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">Direct Commander operation</span>
            <h2 id="record-form-title">
              {request.mode === "create" ? "Create" : "Edit"} {entityLabel}
            </h2>
          </div>
          <button className="icon-button" aria-label="Close" onClick={close}>×</button>
        </div>
        <form onSubmit={onSubmit}>
          <label>
            Title
            <input
              autoFocus
              required
              maxLength={180}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          {request.entityType !== "campaign" && (
            <label>
              Parent {request.entityType === "mission" ? "campaign" : "mission"}
              <select required value={parentId} onChange={(event) => setParentId(event.target.value)}>
                <option value="" disabled>Select a parent</option>
                {parentOptions.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {presentationIdentitySummary(request.entityType === "mission" ? "campaign" : "mission", parent.id)} · {parent.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {request.entityType === "campaign" && (
            <>
              <label>
                Commander&apos;s intent
                <textarea
                  rows={3}
                  value={commanderIntent}
                  onChange={(event) => setCommanderIntent(event.target.value)}
                  placeholder="Purpose, desired outcome, and boundaries"
                />
              </label>
              <p className="form-warning">The base Campaign template includes an unresolved Deployment Eligibility & Standard Pattern gate. Complete it from the Campaign Specification panel before external release or deployment work; local design and build may continue.</p>
            </>
          )}
          {request.entityType === "action" && (
            <label>
              Action type
              <select value={actionKind} onChange={(event) => setActionKind(event.target.value as "standard" | "deployment")}>
                <option value="standard">Standard work</option>
                <option value="deployment">Deployment action</option>
              </select>
              <small className="field-help">Deployment actions require an Eligible or Not applicable Campaign disposition. This label does not execute a deployment.</small>
            </label>
          )}
          <label>
            Description
            <textarea
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label>
            Commander notes
            <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <p className="form-note">
            This command is executed locally and appended to the audit trail. No agent or LLM is called.
          </p>
          <div className="modal-actions">
            <button type="button" className="button button-quiet" onClick={close}>Cancel</button>
            <button type="submit" className="button button-primary">
              {request.mode === "create" ? `Create ${entityLabel}` : "Save changes"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function EmptyState({ action }: { action: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-mark">C</div>
      <h2>Establish the first campaign</h2>
      <p>Start with Commander intent. Missions and actions stay subordinate and traceable.</p>
      <button className="button button-primary" onClick={action}>Create campaign</button>
    </div>
  );
}

function Overview({
  state,
  openCampaign,
  createCampaign,
}: {
  state: CastraState;
  openCampaign: (id: string) => void;
  createCampaign: () => void;
}) {
  const activeCampaigns = state.campaigns.filter((record) => !record.archivedAt);
  const activeMissions = state.missions.filter((record) => !record.archivedAt);
  const activeActions = state.actions.filter((record) => !record.archivedAt);
  const completeActions = activeActions.filter((record) => record.status === "completed").length;
  const pendingApprovals = [...activeCampaigns, ...activeMissions, ...activeActions].filter(
    (record) => !record.approval,
  ).length;
  const openWork = state.openWorkIndex;
  const openWorkCounts = {
    blocked: openWork.filter((entry) => entry.state === "blocked").length,
    review: openWork.filter((entry) => entry.state === "commander_review").length,
    ready: openWork.filter((entry) => entry.state === "ready_for_mission_closure").length,
    reconciliation: openWork.filter((entry) => entry.state === "reconciliation_required").length,
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Release 1 · Local command post</span>
          <h1>Command Overview</h1>
          <p>Authoritative records first. Agents may propose; only the Commander decides.</p>
        </div>
        <button className="button button-primary" onClick={createCampaign}>＋ New Campaign</button>
      </div>
      {activeCampaigns.length === 0 ? (
        <EmptyState action={createCampaign} />
      ) : (
        <>
          <div className="metric-grid">
            <div className="metric"><span>Active campaigns</span><strong>{activeCampaigns.length}</strong></div>
            <div className="metric"><span>Missions</span><strong>{activeMissions.length}</strong></div>
            <div className="metric"><span>Actions complete</span><strong>{completeActions}/{activeActions.length}</strong></div>
            <div className="metric attention"><span>Awaiting approval</span><strong>{pendingApprovals}</strong></div>
          </div>
          <section className="open-work-panel" aria-labelledby="open-work-index-title">
            <div className="section-heading">
              <div>
                <span className="eyebrow">M013 · deterministic hot context</span>
                <h2 id="open-work-index-title">Open Work Index</h2>
                <p>Routine status reads this projection without loading closed record bodies.</p>
              </div>
              <span className="integrity-mark">LOCAL PROJECTION · NOT CUTOVER</span>
            </div>
            <div className="open-work-summary" aria-label="Open Work Index summary">
              <span><strong>{openWork.length}</strong> open</span>
              <span><strong>{openWorkCounts.blocked}</strong> blocked</span>
              <span><strong>{openWorkCounts.review}</strong> Commander review</span>
              <span><strong>{openWorkCounts.ready}</strong> ready to close</span>
              <span className={openWorkCounts.reconciliation ? "needs-reconciliation" : ""}><strong>{openWorkCounts.reconciliation}</strong> reconciliation</span>
            </div>
            {openWork.length === 0 ? <div className="inline-empty compact">No open work appears in the local projection.</div> : <div className="open-work-list">
              {openWork.slice(0, 10).map((entry) => <button key={`${entry.recordType}:${entry.recordId}`} disabled={!entry.campaignId} onClick={() => entry.campaignId && openCampaign(entry.campaignId)}>
                <span className={`status status-${entry.state === "reconciliation_required" || entry.state === "blocked" ? "blocked" : entry.state === "ready_for_mission_closure" ? "completed" : entry.state === "commander_review" ? "active" : "planned"}`}>{humanize(entry.state)}</span>
                <strong>{entry.title}</strong>
                <small>{entry.owner} · {entry.nextGate}</small>
                {entry.blocker && <em>{entry.blocker}</em>}
              </button>)}
            </div>}
            {openWork.length > 10 && <p className="open-work-more">Showing the first 10 of {openWork.length} deterministic entries. Open the Campaign for the complete hierarchy.</p>}
          </section>
          <div className="section-heading">
            <div><span className="eyebrow">Portfolio</span><h2>Campaigns</h2></div>
          </div>
          <div className="campaign-grid">
            {activeCampaigns.map((campaign) => {
              const missions = state.missions.filter((mission) => mission.campaignId === campaign.id && !mission.archivedAt);
              const missionIds = new Set(missions.map((mission) => mission.id));
              const actions = state.actions.filter((action) => missionIds.has(action.missionId) && !action.archivedAt);
              const completed = actions.filter((action) => action.status === "completed").length;
              const progress = actions.length ? Math.round((completed / actions.length) * 100) : 0;
              return (
                <button className="campaign-card" key={campaign.id} onClick={() => openCampaign(campaign.id)}>
                  <div className="card-topline">
                    <PresentationRecordIdentity recordType="campaign" id={campaign.id} />
                    <StatusBadge record={campaign} />
                  </div>
                  <h3>{campaign.title}</h3>
                  <p>{campaign.commanderIntent || campaign.description || "No intent recorded yet."}</p>
                  <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                  <div className="card-stats"><span>{missions.length} missions</span><span>{completed}/{actions.length} actions</span><strong>{progress}%</strong></div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function CampaignKpi({ id, label, value, help, onClick, synthetic = false }: { id: string; label: string; value: string | number; help: string; onClick: () => void; synthetic?: boolean }) {
  const helpId = `campaign_kpi_${id}_help`;
  return <div className="compact-kpi-wrap"><button className="overview-kpi compact-kpi" onClick={onClick} aria-describedby={helpId}><span>{label}{synthetic ? "*" : ""}</span><strong>{value}</strong><i aria-hidden="true">Open →</i></button><span className="kpi-tooltip" id={helpId} role="tooltip">{help}</span></div>;
}

function CampaignFlowDetail({ step, state, close }: { step: CampaignFlowStep; state: CastraState; close: () => void }) {
  const mission = step.missionId ? state.missions.find((item) => item.id === step.missionId) : null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}><section className="modal campaign-flow-detail" role="dialog" aria-modal="true" aria-labelledby="campaign-flow-detail-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">Typical Campaign Flow · {humanize(step.status)}</span><h2 id="campaign-flow-detail-title">{step.label}</h2></div><button className="icon-button" aria-label="Close flow detail" onClick={close}>×</button></div><p>{step.description}</p><section className="source-callout"><strong>{mission ? mission.title : "Planned template gate"}</strong><span>{step.evidenceReference || "Evidence reference unavailable."}</span></section>{step.label === "0VAT" && <section className="unavailable-evidence"><strong>No historical C001 0VAT result is claimed</strong><p>0VAT is the required pre-deployment security and vulnerability assessment gate for future Campaign execution. It is planned here because no verified historical result exists.</p></section>}<div className="modal-actions"><button className="button button-primary" onClick={close}>Close</button></div></section></div>;
}

function CampaignSummary({
  state, campaign, includeArchived, setIncludeArchived, execute, directClose, directCloseAvailable, directCloseBusy, stagingBusy, openForm, openTesting, setSection, setReviewFocusId, engageSarge, demoMode,
}: {
  state: CastraState; campaign: Campaign; includeArchived: boolean; setIncludeArchived: (value: boolean) => void;
  execute: (commands: CastraCommand[]) => Promise<boolean>; openForm: (request: FormRequest) => void; openTesting: (link: WorkLink) => void;
  directClose: (review: Tier1DirectCloseReview) => Promise<boolean>; directCloseAvailable: boolean; directCloseBusy: boolean; stagingBusy: boolean;
  setSection: (section: CampaignWorkspaceSection) => void; setReviewFocusId: (id: string | null) => void; engageSarge: (target: SargeEngagementTarget) => void; demoMode: boolean;
}) {
  const [flowDetail, setFlowDetail] = useState<CampaignFlowStep | null>(null);
  const projections = campaignMissionProjections(state, campaign).filter(({ mission }) => includeArchived || !mission.archivedAt);
  const missionIds = new Set(projections.map(({ mission }) => mission.id));
  const actions = state.actions.filter((action) => missionIds.has(action.missionId) && (includeArchived || !action.archivedAt));
  const recordIds = new Set([campaign.id, ...missionIds, ...actions.map((action) => action.id)]);
  const planIds = new Set(state.uiReviewPlans.filter((plan) => plan.campaignId === campaign.id).map((plan) => plan.id));
  const checkpoints = state.uiReviewCheckpoints.filter((checkpoint) => planIds.has(checkpoint.planId));
  const testPlanIds = new Set(state.testPlans.filter((plan) => plan.link.id === campaign.id || recordIds.has(plan.link.id)).map((plan) => plan.id));
  const results = state.testResults.filter((result) => testPlanIds.has(result.testPlanId));
  const punches = state.punchItems.filter((punch) => recordIds.has(punch.affectedWork.id));
  const audits = state.auditEvents.filter((event) => recordIds.has(event.entityId) || Object.values(event.detail).some((value) => recordIds.has(value)));
  const flow = buildCampaignFlow(state, campaign);
  const demoCost = demoSyntheticMeasure("demo_synthetic_cost_total");
  const demoEffort = demoSyntheticMeasure("demo_synthetic_effort_total");
  const openCheckpoint = (id: string) => { setReviewFocusId(id); setSection("testing"); };
  const kpis = [
    { id: "actions", label: "Actions", value: `${actions.filter((item) => item.status === "completed").length}/${actions.length}`, help: "Completed over visible Campaign Actions.", action: () => document.getElementById("execution-hierarchy")?.focus() },
    { id: "blockers", label: "Blockers", value: actions.filter((item) => item.status === "blocked").length, help: "Source-backed blocked Actions in this Campaign.", action: () => document.getElementById("execution-hierarchy")?.focus() },
    { id: "testing", label: "Test Results", value: results.length, help: "Direct Test Result records scoped to this Campaign hierarchy.", action: () => setSection("testing") },
    { id: "punch", label: "Open Punch", value: punches.filter((item) => ["open", "in_remediation", "ready_for_verification"].includes(item.status)).length, help: "Separate remediation records; original results/review evidence remain immutable.", action: () => setSection("testing") },
    { id: "reviews", label: "UI Reviews", value: checkpoints.filter((item) => ["ready_for_review", "rework_required"].includes(item.status)).length, help: "Exact Campaign UI checkpoints requiring Commander attention.", action: () => checkpoints[0] && openCheckpoint(checkpoints[0].id) },
    { id: "audit", label: "Audit", value: audits.length || "Unavailable", help: audits.length ? "Ordered deterministic Campaign audit events." : "Historical Notion audit events were not imported; zero is not inferred.", action: () => setSection("audit") },
    { id: "cost", label: "Cost", value: demoMode ? `${new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(demoCost.value / 100)}*` : "Unavailable", help: demoMode ? demoCost.explanation : "Authoritative Campaign cost inputs are unavailable.", action: () => setSection("stewardship"), synthetic: demoMode },
    { id: "effort", label: "Effort", value: demoMode ? `${demoEffort.value.toFixed(1)} h*` : "Unavailable", help: demoMode ? demoEffort.explanation : "Authoritative Run/Event effort inputs are unavailable.", action: () => setSection("stewardship"), synthetic: demoMode },
  ];
  return <>
      <div className="page-heading campaign-title sticky-page-heading"><div><span className="eyebrow">Campaign · <PresentationRecordIdentity recordType="campaign" id={campaign.id} /></span><h1>{campaign.title}</h1><div className="badge-row"><StatusBadge record={campaign} /><ApprovalBadge record={campaign} /></div></div><div className="record-controls"><button className="button button-accent" onClick={() => engageSarge({ type: "campaign", id: campaign.id, revision: campaign.revision, label: campaign.title })}>Engage SARGE</button><button className="button button-accent" onClick={() => setSection("testing")}>Testing & Punch Items</button><RecordControls record={campaign} execute={execute} edit={() => openForm({ mode: "edit", entityType: "campaign", entityId: campaign.id })} /></div></div>
    <div className="overview-kpi-grid campaign-kpis">{kpis.map((kpi) => <CampaignKpi key={kpi.id} id={kpi.id} label={kpi.label} value={kpi.value} help={kpi.help} onClick={kpi.action} synthetic={kpi.synthetic} />)}</div>
    <section className="typical-campaign-flow"><div className="section-heading"><div><span className="eyebrow">Templated from C001 · source status retained</span><h2>Typical Campaign Flow</h2><p>Planned gates do not claim historical completion. Open a step for its exact Mission, checkpoint, evidence, or unavailable reason.</p></div></div><div className="campaign-flow-track">{flow.map((step) => <button key={step.id} className={`campaign-flow-step flow-${step.status}`} onClick={() => step.checkpointId ? openCheckpoint(step.checkpointId) : setFlowDetail(step)}><span>{humanize(step.status)}</span><strong>{step.label}</strong></button>)}</div></section>
    <section className="intent-panel"><span className="eyebrow">Commander&apos;s Intent · first governing Action</span><p>{campaign.commanderIntent || "Intent has not been recorded."}</p>{campaign.description && <small>{campaign.description}</small>}</section>
    <div className="section-heading" id="execution-hierarchy" tabIndex={-1}><div><span className="eyebrow">Execution hierarchy</span><h2>Missions & Actions</h2><p>Mission bars expand to reveal Actions, UI gates, source-attributed audit milestones, and evidenced team assignments.</p></div><div className="section-actions"><label className="toggle"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /> Show archived</label>{!campaign.archivedAt && <button className="button button-primary" onClick={() => openForm({ mode: "create", entityType: "mission", parentId: campaign.id })}>＋ Mission</button>}</div></div>
    {projections.length === 0 && <div className="inline-empty">No Missions in this view.</div>}
    <div className="mission-stack">{projections.map((projection) => <MissionPanel key={projection.mission.id} state={state} projection={projection} execute={execute} directClose={directClose} directCloseAvailable={directCloseAvailable} directCloseBusy={directCloseBusy} stagingBusy={stagingBusy} openForm={openForm} openTesting={openTesting} openCheckpoint={openCheckpoint} openTeam={() => setSection("team")} engageSarge={engageSarge} />)}</div>
    {flowDetail && <CampaignFlowDetail step={flowDetail} state={state} close={() => setFlowDetail(null)} />}
  </>;
}

function CampaignWorkspace({
  state,
  campaign,
  section,
  setSection,
  includeArchived,
  setIncludeArchived,
  execute,
  directClose,
  directCloseAvailable,
  directCloseBusy,
  stagingBusy,
  openForm,
  openTesting,
  testingContext, reviewFocusId, setReviewFocusId, engageSarge, demoMode,
}: {
  state: CastraState;
  campaign: Campaign;
  section: CampaignWorkspaceSection;
  setSection: (section: CampaignWorkspaceSection) => void;
  includeArchived: boolean;
  setIncludeArchived: (value: boolean) => void;
  execute: (commands: CastraCommand[]) => Promise<boolean>;
  directClose: (review: Tier1DirectCloseReview) => Promise<boolean>;
  directCloseAvailable: boolean;
  directCloseBusy: boolean;
  /** True while any authoritative control on the page is already working. */
  stagingBusy: boolean;
  openForm: (request: FormRequest) => void;
  openTesting: (link: WorkLink) => void;
  testingContext: WorkLink | null;
  reviewFocusId: string | null;
  setReviewFocusId: (id: string | null) => void;
  engageSarge: (target: SargeEngagementTarget) => void;
  demoMode: boolean;
}) {
  return <>
    <nav className="campaign-workspace-nav" aria-label={`${campaign.title} workspace`}>
      {(["summary", "testing", "audit", "team", "stewardship"] as CampaignWorkspaceSection[]).map((item) => <button key={item} className={section === item ? "active" : ""} onClick={() => { setSection(item); if (item !== "testing") setReviewFocusId(null); }}>{item === "testing" ? "Testing & Punch Items" : item === "audit" ? "Audit Milestones" : item === "team" ? "Meet the Team" : item === "stewardship" ? "AERARIUM" : humanize(item)}</button>)}
    </nav>
    {section === "summary" && <CampaignSummary state={state} campaign={campaign} includeArchived={includeArchived} setIncludeArchived={setIncludeArchived} execute={execute} directClose={directClose} directCloseAvailable={directCloseAvailable} directCloseBusy={directCloseBusy} stagingBusy={stagingBusy} openForm={openForm} openTesting={openTesting} setSection={setSection} setReviewFocusId={setReviewFocusId} engageSarge={engageSarge} demoMode={demoMode} />}
    {section === "testing" && <div className="combined-tracking"><section><div className="section-heading"><div><span className="eyebrow">Direct test evidence and separate remediation records</span><h2>Testing & Punch Items</h2></div></div><TestingWorkspace state={state} context={testingContext ?? { type: "campaign", id: campaign.id }} execute={execute} /></section><section><div className="section-heading"><div><span className="eyebrow">Preserved UI-review source type</span><h2>UI checkpoint evidence & comments</h2><p>Displayed in the same tracking surface; historical decisions and evidence remain immutable UI-review records.</p></div></div><UIReviewWorkspace state={state} execute={execute} focusCheckpointId={reviewFocusId} /></section></div>}
    {section === "audit" && <AuditTrail state={state} campaignId={campaign.id} />}
    {section === "team" && <TeamWorkspace state={state} execute={execute} campaignId={campaign.id} />}
    {section === "stewardship" && <AerariumWorkspace state={state} execute={execute} />}
  </>;
}

function MissionPanel({ state, projection, execute, directClose, directCloseAvailable, directCloseBusy, stagingBusy, openForm, openTesting, openCheckpoint, openTeam, engageSarge }: { state: CastraState; projection: ReturnType<typeof campaignMissionProjections>[number]; execute: (commands: CastraCommand[]) => Promise<boolean>; directClose: (review: Tier1DirectCloseReview) => Promise<boolean>; directCloseAvailable: boolean; directCloseBusy: boolean; stagingBusy: boolean; openForm: (request: FormRequest) => void; openTesting: (link: WorkLink) => void; openCheckpoint: (id: string) => void; openTeam: () => void; engageSarge: (target: SargeEngagementTarget) => void }) {
  const { mission, actions, checkpoints, audits, assignedRoleIds } = projection;
  return <details className={`mission-panel mission-accordion ${mission.archivedAt ? "is-archived" : ""}`} open={mission.id === "c001_m000"}>
            <summary className="mission-summary"><div><PresentationRecordIdentity recordType="mission" id={mission.id} /><strong>{mission.title}</strong><small>{mission.description || "No Mission description."}</small></div><div className="mission-summary-meta"><StatusBadge record={mission} /><span>{actions.length} Actions</span><span>{assignedRoleIds.length ? assignedRoleIds.map((id) => presentRole(state, id).displayName).join(", ") : "Unassigned"}</span></div></summary>
    <div className="mission-body"><div className="mission-heading"><div><ApprovalBadge record={mission} /><p>{mission.notes}</p></div><div className="record-controls"><button className="button button-quiet" onClick={() => engageSarge({ type: "mission", id: mission.id, revision: mission.revision, label: mission.title })}>Engage SARGE</button><button className="button button-accent" onClick={() => openTesting({ type: "mission", id: mission.id })}>Tests</button><RecordControls record={mission} execute={execute} edit={() => openForm({ mode: "edit", entityType: "mission", entityId: mission.id })} /></div></div>
      <section className="mission-team-projection"><span className="eyebrow">Evidenced team assignment</span>{assignedRoleIds.length ? <div>{assignedRoleIds.map((id) => { const role = presentRole(state, id); return <button key={id} className="button button-quiet" title={role.accessibleTitle} onClick={openTeam}>{role.visualLabel} · performance</button>; })}</div> : <strong>Unavailable / unassigned — no source Action assignment supports a Mission owner.</strong>}</section>
      {checkpoints.length > 0 && <section className="mission-checkpoints"><span className="eyebrow">UI checkpoint Actions · source-linked projection</span><div>{checkpoints.map((checkpoint) => <button key={checkpoint.id} onClick={() => openCheckpoint(checkpoint.id)}><span className={`status status-${checkpoint.status === "rework_required" ? "blocked" : checkpoint.status === "approved" ? "completed" : "draft"}`}>{humanize(checkpoint.status)}</span><strong>{checkpoint.code} · {checkpoint.name}</strong><small>{checkpoint.scope}</small></button>)}</div></section>}
      <div className="action-table"><div className="action-table-heading"><strong>Actions</strong>{!mission.archivedAt && <button className="button button-small" onClick={() => openForm({ mode: "create", entityType: "action", parentId: mission.id })}>＋ Add Action</button>}</div>{actions.length === 0 ? <div className="inline-empty compact">No Actions in this Mission.</div> : actions.map((action) => <div className={`action-row ${action.archivedAt ? "is-archived" : ""}`} key={action.id}>
              <div className="action-main">
                <PresentationRecordIdentity recordType="action" id={action.id} />
                <strong>{action.title}</strong>
                <span className={`action-kind action-kind-${action.actionKind}`}>{action.actionKind === "deployment" ? "Deployment action" : "Standard work"}</span>
                {action.description && <small>{action.description}</small>}
              </div>
              <div className="action-state"><StatusBadge record={action} /><ApprovalBadge record={action} /></div>
              <div className="record-controls">
                <button className="button button-quiet" onClick={() => engageSarge({ type: "action", id: action.id, revision: action.revision, label: action.title })}>Engage SARGE</button>
                <button className="button button-accent" onClick={() => openTesting({ type: "action", id: action.id })}>Tests</button>
                <RecordControls record={action} execute={execute} edit={() => openForm({ mode: "edit", entityType: "action", entityId: action.id })} />
              </div>
              <Tier1DirectCloseControl state={state} action={action} available={directCloseAvailable} busy={directCloseBusy} close={directClose} />
              <ActionReviewStagingControl action={action} busy={stagingBusy} execute={execute} />
            </div>)}</div>
      <section className="mission-audit-projection"><span className="eyebrow">Append-only audit milestones · read-only projection</span>{audits.length ? audits.map((event) => <div key={event.id}><span>#{event.sequence}</span><strong>{event.summary}</strong><small>{dateLabel(event.occurredAt)} · {event.kind}</small></div>) : <p>Unavailable — the public-safe source bundle contains no historical audit event for this Mission; zero activity is not inferred.</p>}</section>
    </div>
  </details>;
}

function AuditTrail({ state, campaignId = null }: { state: CastraState; campaignId?: string | null }) {
  const campaignMissionIds = new Set(state.missions.filter((mission) => !campaignId || mission.campaignId === campaignId).map((mission) => mission.id));
  const campaignActionIds = new Set(state.actions.filter((action) => campaignMissionIds.has(action.missionId)).map((action) => action.id));
  const directIds = new Set([campaignId, ...campaignMissionIds, ...campaignActionIds].filter((id): id is string => Boolean(id)));
  const events = [...state.auditEvents].filter((event) => !campaignId || directIds.has(event.entityId) || Object.values(event.detail).some((value) => directIds.has(value))).reverse();
  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">Append-only history</span><h1>{campaignId ? "Campaign Audit" : "Audit Trail"}</h1><p>Every event comes from a direct, deterministic Commander operation. Source-bundled history never fabricates missing audit events.</p></div>
        <span className="integrity-mark">{events.length} events · next #{state.nextAuditSequence}</span>
      </div>
      {events.length === 0 ? (
        <div className="inline-empty">Create a record to begin the audit trail.</div>
      ) : (
        <div className="audit-list">
          {events.map((event) => (
            <article className="audit-event" key={event.id}>
              <div className="audit-sequence">#{event.sequence}</div>
              <div className="audit-body">
                <div className="audit-title"><strong>{event.summary}</strong><span>{event.kind}</span></div>
                <div className="audit-meta">{dateLabel(event.occurredAt)} · {event.actor} · {event.origin} · {shortId(event.entityId)}</div>
                {Object.keys(event.detail).length > 0 && <div className="audit-detail">{Object.entries(event.detail).map(([key, value]) => <span key={key}>{humanize(key)}: {value}</span>)}</div>}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function WarEffortsWorkspace({ state }: { state: CastraState }) {
  const c001 = state.campaigns.find((campaign) => campaign.id === "campaign_c001");
  return <><div className="page-heading sticky-page-heading"><div><span className="eyebrow">Optional strategic grouping</span><h1>War Efforts</h1><p className="single-line-definition" title="War Efforts group multiple Campaigns without changing the protected Campaign to Mission to Action hierarchy.">Group multiple Campaigns while preserving Campaign → Mission → Action.</p></div><span className="integrity-mark">NO SOURCE RECORD</span></div><section className="unavailable-evidence"><strong>No War Effort record is available</strong><p>The audited C001 source inventory contains one Campaign and no War Effort entity. The probable source-backed reason is that C001 has remained a single Campaign, so no multi-Campaign grouping was formed. No grouping is manufactured for display.</p><small>Source: C001 Campaign and Mission/Action inventory · {c001 ? c001.title : "C001 record unavailable"}</small></section></>;
}

function BaseopsWorkspace({ state }: { state: CastraState }) {
  const [focus, setFocus] = useState<"products" | "garrison" | "fortification" | null>(null);
  const theme = currentPresentation(state).themeProfileId;
  const terms = theme === "roman_command" ? { garrison: "Garrison", fortification: "Fortification" } : theme === "operations_neutral" ? { garrison: "Sustainment", fortification: "Continuous Improvement" } : { garrison: "Garrison Operations", fortification: "Fortification Improvements" };
  const reason = "Unavailable — C001 is still In progress, M008 closeout/BASEOPS activation is not accepted, and no Deployed Product or BASEOPS record exists in the source bundle.";
  return <><div className="page-heading sticky-page-heading"><div><span className="eyebrow">Campaign → Deployed Product → BASEOPS</span><h1>BASEOPS</h1><p>Operational sustainment begins only after evidenced acceptance and handoff.</p></div><span className="integrity-mark">NOT ACTIVATED</span></div><div className="overview-kpi-grid baseops-kpis"><button className="overview-kpi compact-kpi" onClick={() => setFocus("products")}><span>Deployed products</span><strong>Unavailable</strong><i>Explain →</i></button><button className="overview-kpi compact-kpi" onClick={() => setFocus("garrison")}><span>{terms.garrison}</span><strong>Unavailable</strong><i>Explain →</i></button><button className="overview-kpi compact-kpi" onClick={() => setFocus("fortification")}><span>{terms.fortification}</span><strong>Unavailable</strong><i>Explain →</i></button></div>{focus && <section className="unavailable-evidence" role="status"><strong>{focus === "products" ? "Deployed products" : focus === "garrison" ? terms.garrison : terms.fortification}</strong><p>{reason}</p><small>Canonical meaning remains {focus === "fortification" ? "Fortification improvements" : focus === "garrison" ? "Garrison sustainment" : "Deployed Product lifecycle"}; only the visible theme term changes.</small></section>}<div className="overview-split"><section><div className="section-heading"><div><span className="eyebrow">Canonical Garrison work</span><h2>{terms.garrison} Action list</h2></div></div><div className="inline-empty">{reason}</div></section><section><div className="section-heading"><div><span className="eyebrow">Canonical Fortification work</span><h2>{terms.fortification} Action list</h2></div></div><div className="inline-empty">{reason}</div></section></div></>;
}

function Placeholder({ view }: { view: Exclude<View, "overview" | "welcome-access" | "campaigns" | "testing" | "ui-reviews" | "aerarium" | "graph" | "configuration" | "team" | "local-models" | "remote-work" | "sarge-engagement" | "deployment-workbench" | "deployment-guide" | "governed-closure" | "decision-inbox" | "audit" | "war-efforts" | "baseops" | "session-board" | "troop-welfare"> }) {
  const copy = {
    agents: {
      eyebrow: "Propose, then confirm",
      title: "Agent Boundaries",
      body: "SARGE, FORGE, SIGNAL, RECON, SCRIBE, QUARTERMASTER, FIREWATCH, VEXILLARIUS, and CENSOR are not connected in this slice. Direct record work never invokes an agent or LLM.",
    },
  }[view];
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">{copy.eyebrow}</span><h1>{copy.title}</h1></div></div>
      <div className="placeholder-panel"><span className="placeholder-stamp">PLANNED</span><p>{copy.body}</p><small>Reserved in navigation so the Release 1 information architecture remains visible while implementation evidence stays honest.</small></div>
    </>
  );
}

function ReviewModeBanner({
  session,
  currentDigest,
  changeScenario,
  exit,
}: {
  session: UI03ReviewSession;
  currentDigest: string;
  changeScenario: (scenario: UIReviewScenario) => void;
  exit: () => void;
}) {
  const unchanged = session.authoritativeDigest === currentDigest;
  return (
    <section className="review-mode-banner" role="status" aria-label="UI-03 Review Mode">
      <div>
        <strong>{UI03_FIXTURE_MANIFEST.visibleLabel}</strong>
        <span>UI-03 REVIEW MODE · {UI03_FIXTURE_REVISION} · {session.scenario.toUpperCase()}</span>
      </div>
      <div className="review-mode-integrity">
        <span className={unchanged ? "integrity-ok" : "integrity-failed"}>Authoritative state: {unchanged ? "UNCHANGED" : "DIGEST MISMATCH"}</span>
        <code>{session.authoritativeDigest}</code>
      </div>
      <label>Scenario<select value={session.scenario} onChange={(event) => changeScenario(event.target.value as UIReviewScenario)}>
        {UI03_FIXTURE_MANIFEST.scenarios.map((scenario) => <option key={scenario} value={scenario}>{scenario.replaceAll("_", " ")}</option>)}
      </select></label>
      <button className="button button-primary" onClick={exit}>Exit Review Mode</button>
    </section>
  );
}

interface PageContentRenderFailure {
  name: string;
  message: string;
}

function describePageContentRenderFailure(thrown: unknown): PageContentRenderFailure {
  try {
    if (thrown instanceof Error) {
      return { name: thrown.name || "Error", message: thrown.message || "(no error message)" };
    }
    return { name: "Thrown value", message: String(thrown) };
  } catch {
    return { name: "Thrown value", message: "(the thrown value could not be converted to text)" };
  }
}

interface PageContentErrorBoundaryProps {
  viewLabel: string;
  children: ReactNode;
}

interface PageContentErrorBoundaryState {
  failure: PageContentRenderFailure | null;
  componentStack: string | null;
}

/**
 * BUG-2 (C001.M013.A072): a render exception inside one page must degrade to a
 * named in-place panel instead of unmounting the entire application. The panel
 * deliberately shows the caught error message and component stack — the Tier 1
 * sole Commander has no DevTools access, and this display is the recorded
 * diagnostic path for page render failures such as BUG-1. The boundary is
 * keyed by view where it is used, so navigating to another page remounts it
 * fresh and renders that page normally; one broken page never locks the shell.
 */
export class PageContentErrorBoundary extends Component<PageContentErrorBoundaryProps, PageContentErrorBoundaryState> {
  constructor(props: PageContentErrorBoundaryProps) {
    super(props);
    this.state = { failure: null, componentStack: null };
  }

  static getDerivedStateFromError(thrown: unknown): Partial<PageContentErrorBoundaryState> {
    return { failure: describePageContentRenderFailure(thrown) };
  }

  componentDidCatch(_thrown: Error, errorInfo: ErrorInfo): void {
    this.setState({ componentStack: typeof errorInfo.componentStack === "string" ? errorInfo.componentStack : null });
  }

  render(): ReactNode {
    const { failure, componentStack } = this.state;
    if (!failure) return this.props.children;
    return (
      <section className="unavailable-evidence page-render-failure" role="alert" aria-label={`${this.props.viewLabel} failed to render`}>
        <strong>{this.props.viewLabel} failed to render</strong>
        <p>
          The rest of CASTRA stays mounted. Use the sidebar or page navigation to open another page; this panel
          clears when the view changes. No command was executed and no state was written by this failure display.
        </p>
        <p className="page-render-failure-error"><code>{failure.name}: {failure.message}</code></p>
        <pre className="page-render-failure-stack">{componentStack ?? "Component stack unavailable for this failure."}</pre>
      </section>
    );
  }
}

/**
 * ACT-c1c2989b / C001.M017.A001 — the visible Session Work Plan draft review.
 *
 * Reuses the exact canonical `reviewPlanDraft`/`buildPlanTargetIndex`/
 * `summarizeReview` functions from `src/webmcp/proposals.ts` — the same pure
 * functions the `review_plan` WebMCP tool itself calls — against the exact
 * bounded snapshot shape already built for the WebMCP read tools. Nothing
 * here reorders, filters, rescores, truncates, or duplicates that governed
 * logic; it only calls it and shapes the result for the presentation-only
 * `SessionPlanDraftSurface`, mirroring how `Tier1DirectCloseControl` already
 * calls `tier1DirectCloseReview` directly during render.
 */
/**
 * C001.M016 CAPTURE-02 — the read-only tools whose completion the visible
 * WebMCP activity strip counts.
 *
 * Derived from the declared contract rather than typed out: the read-only tools
 * that need no proposal boundary are exactly `read_command_status` and
 * `inspect_open_work`, the two the authorized read-only test budget invokes. If
 * the declared surface ever changes, the denominator follows it instead of
 * silently going stale. Every other registered tool is still displayed when it
 * is invoked; it simply does not advance this count.
 */
const WEBMCP_OBSERVED_READ_ONLY_TOOLS: readonly string[] = WEBMCP_READ_ONLY_TOOL_NAMES
  .filter((name) => !isProposalTool(name));

/**
 * The memory-only activity ceiling. The strip shows the two most recent steps,
 * so a small bound is enough to keep the earlier-step count honest while making
 * unbounded growth from a chatty agent impossible. Nothing here is persisted,
 * uploaded, or read back as state.
 */
const WEBMCP_ACTIVITY_MEMORY_LIMIT = 8;

function computeWebMcpPlanReview(
  draft: WebMcpClientDraft | null,
  snapshot: WebMcpStateSnapshot | null,
): SessionPlanDraftReviewSummary | null {
  if (!draft?.plan || !snapshot) return null;
  const checks = reviewPlanDraft(draft.plan, buildPlanTargetIndex(snapshot));
  const counts = summarizeReview(checks);
  return {
    reviewedRevision: draft.revision,
    checks,
    counts,
    readyForCommanderSelection: counts.blocking === 0,
  };
}

export function App() {
  const [state, setState] = useState<CastraState | null>(null);
  const [demoState, setDemoState] = useState<CastraState | null>(null);
  const [reviewSession, setReviewSession] = useState<UI03ReviewSession | null>(null);
  const [view, setView] = useState<View>("welcome-access");
  const [authExperience, setAuthExperience] = useState(initialAuthExperienceState);
  const [liveAuthResult, setLiveAuthResult] = useState<BrowserAuthResult>({
    availability: "checking",
    receipt: null,
    publicMessage: "Checking the server authentication boundary.",
  });
  const [authReviewBaselineDigest, setAuthReviewBaselineDigest] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [campaignSection, setCampaignSection] = useState<CampaignWorkspaceSection>("summary");
  const [reviewFocusId, setReviewFocusId] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [formRequest, setFormRequest] = useState<FormRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [persistenceMode, setPersistenceMode] = useState<HostedStateAvailability | "checking_hosted">("disabled_pre_cutover");
  const [loadedHostedStateResult, setLoadedHostedStateResult] = useState<HostedStateLoadResult | null>(null);
  const [evidenceCaptureNotice, setEvidenceCaptureNotice] = useState<string | null>(null);
  const [pendingHostedCommand, setPendingHostedCommand] = useState<PendingHostedStateCommandRecord | null>(null);
  const [recoveryTargetRevision, setRecoveryTargetRevision] = useState("");
  const [hostedStateControlBusy, setHostedStateControlBusy] = useState(false);
  const [freshnessNotice, setFreshnessNotice] = useState<string | null>(null);
  const [initialImportReview, setInitialImportReview] = useState<PreparedInitialImportReview | null>(null);
  const [initialImportConfirmed, setInitialImportConfirmed] = useState(false);
  const [initialImportExportFile, setInitialImportExportFile] = useState<File | null>(null);
  const [initialImportManifestFile, setInitialImportManifestFile] = useState<File | null>(null);
  const [postHighWaterFile, setPostHighWaterFile] = useState<File | null>(null);
  const [postHighWaterReview, setPostHighWaterReview] = useState<PreparedPostHighWaterReconciliationReview | null>(null);
  const [postHighWaterConfirmed, setPostHighWaterConfirmed] = useState(false);
  const hostedStateSelected = useRef(false);
  // ACT-c417cbd5 / P04. The Session Board's authority state is held here rather
  // than inside the board, because it is command state, not presentation state:
  // it survives re-renders, it gates further writes while an unknown outcome is
  // retained, and its result may only be receipt-derived.
  const [sessionBoardAuthorityView, setSessionBoardAuthorityView] = useState<SessionBoardAuthorityViewState>(
    initialSessionBoardAuthorityViewState,
  );
  const sessionBoardAllocation = useRef<SessionBoardAllocationController | null>(null);
  const sessionBoardLastAuthoritativeRead = useRef<HostedStateLoadResult | null>(null);
  /**
   * The baseline the board is currently displaying, tracked in a ref because an
   * allocation settles inside an asynchronous continuation whose closure captured
   * the baseline as it stood when the Commander clicked. Reading that stale
   * closure is precisely how finding 003 survived its first correction: it would
   * compare the deciding baseline against itself and never recover.
   */
  const displayedAuthoritativeBaseline = useRef<SessionBoardBaselineIdentity | null>(null);
  const [testingContext, setTestingContext] = useState<WorkLink | null>(null);
  const [demoScenario, setDemoScenario] = useState<UIReviewScenario>("normal");
  const [sargeTarget, setSargeTarget] = useState<SargeEngagementTarget>({ type: "command_overview", id: "command-overview", revision: 0, label: "Command Overview" });

  useEffect(() => {
    indexedDbRepository
      .load()
      .then(async (loaded) => {
        const sourced = mergeC001SourceBundle(loaded);
        if (hostedStateSelected.current) return;
        setState(sourced);
        setAuthReviewBaselineDigest(authoritativeStateDigest(sourced));
        if (authoritativeStateDigest(sourced) !== authoritativeStateDigest(loaded)) await indexedDbRepository.save(sourced);
        try {
          const stored = sessionStorage.getItem(UI03_REVIEW_SESSION_KEY);
          const restored = stored ? validateReviewSession(JSON.parse(stored) as unknown, authoritativeStateDigest(sourced)) : null;
          if (restored) {
            setReviewSession(restored);
            setView("ui-reviews");
          }
          else if (stored) sessionStorage.removeItem(UI03_REVIEW_SESSION_KEY);
        } catch {
          sessionStorage.removeItem(UI03_REVIEW_SESSION_KEY);
        }
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unable to load local data."),
      );
  }, []);

  useEffect(() => {
    let current = true;
    liveAuthenticationClient.resolveSession().then(async (result) => {
      if (!current) return;
      setLiveAuthResult(result);
      if (result.receipt?.allowed && result.receipt.status === "authenticated") {
        setAuthExperience((state) => transitionAuthExperience(state, { type: "authenticate_live" }));
        const usable = await activateHostedState();
        if (!current) return;
        setView(result.receipt.recoveryPasswordChangeReady || !usable ? "welcome-access" : "overview");
      }
    });
    return () => { current = false; };
  }, []);

  // Every renewal — whether it came from a control the Commander used or from
  // the hosted dispatch boundary itself — updates the visible authentication
  // state. A well-formed server verdict that this is no longer an authenticated
  // Commander session stops the UI presenting a writable one; an unavailable
  // boundary is not a lost session and must not be reported as one.
  useEffect(() => {
    commanderSessionObserver = (result, proof) => {
      setLiveAuthResult(result);
      if (proof.state !== "not_authenticated" || authExperience.mode !== "authenticated_live") return;
      resetToPreCutoverPersistence();
      setAuthExperience((current) => transitionAuthExperience(current, {
        type: "live_session_lost",
        message: "The server-authenticated Commander session is no longer active. No hosted command was dispatched.",
      }));
      setFreshnessNotice(null);
      setView("welcome-access");
    };
    return () => { commanderSessionObserver = null; };
  }, [authExperience.mode]);

  // Deterministic freshness for a quiet authenticated page. There is no model,
  // no polling timer, and no write here: when the page becomes visible or
  // regains focus it renews the session proof and performs one authoritative
  // re-read. It never overwrites a live form or review, a busy control, a
  // retained unknown outcome, Demo state, or the local candidate path.
  useEffect(() => {
    if (authExperience.mode !== "authenticated_live") return;
    let mounted = true;
    let running = false;

    async function revalidate(): Promise<void> {
      if (running) return;
      const gate = hostedStateRefreshPermitted({
        authoritativeHostedSession: hostedStateSelected.current,
        availability: persistenceMode,
        retainedUnknownCommand: Boolean(pendingHostedCommand),
        commandInFlight: hostedStateControlBusy,
        readOnlyReviewSession: Boolean(reviewSession),
        demonstrationSession: authExperience.mode === "demo",
        documentVisible: globalThis.document?.visibilityState !== "hidden",
      });
      const baseline = loadedHostedStateResult && loadedHostedStateResult.stateDigest !== null
        ? { revision: loadedHostedStateResult.revision, stateDigest: loadedHostedStateResult.stateDigest }
        : null;
      if (!gate.permitted || !baseline) return;
      running = true;
      try {
        const proof = await renewLiveCommanderSessionProof();
        if (!mounted || !proof.authenticatedCommander) return;
        const fresh = await hostedStateRepository.inspect();
        if (!mounted) return;
        const decision = hostedStateAdoptionDecision({
          baseline,
          fresh,
          userWorkInProgress: Boolean(formRequest || initialImportReview || postHighWaterReview || recoveryTargetRevision),
        });
        if (decision.verdict === "adopt") adoptAuthoritativeState(fresh);
        if (decision.verdict === "fail_closed") setPersistenceMode("unavailable");
        setFreshnessNotice(decision.verdict === "unchanged" || decision.verdict === "adopt" ? null : decision.message);
        if (decision.verdict === "review_again" || decision.verdict === "fail_closed") {
          setError((current) => current ?? decision.message);
        }
      } catch {
        if (mounted) setFreshnessNotice("The authoritative hosted re-read did not complete. The displayed state was not replaced and no local fallback was used.");
      } finally {
        running = false;
      }
    }

    function onVisibilityChange(): void {
      if (globalThis.document?.visibilityState === "visible") void revalidate();
    }
    function onFocus(): void {
      void revalidate();
    }
    globalThis.document?.addEventListener("visibilitychange", onVisibilityChange);
    globalThis.addEventListener?.("focus", onFocus);
    return () => {
      mounted = false;
      globalThis.document?.removeEventListener("visibilitychange", onVisibilityChange);
      globalThis.removeEventListener?.("focus", onFocus);
    };
  }, [
    authExperience.mode,
    persistenceMode,
    pendingHostedCommand,
    hostedStateControlBusy,
    reviewSession,
    loadedHostedStateResult,
    formRequest,
    initialImportReview,
    postHighWaterReview,
    recoveryTargetRevision,
  ]);

  const reviewState = useMemo(
    () => reviewSession ? buildUI03ReviewState(reviewSession.scenario) : null,
    [reviewSession?.scenario],
  );
  const demoDisplayState = authExperience.mode === "demo" && demoScenario === "empty" ? emptyState() : demoState;
  const displayState = reviewState ?? demoDisplayState ?? state;
  const sessionBoardScenario = (authExperience.mode === "demo" ? demoScenario : (reviewSession?.scenario ?? "normal")) as
    "normal" | "dense" | "blocked" | "exception" | "empty";
  /**
   * Public Demo and UI Review keep the memory-only synthetic fixtures exactly as
   * accepted. An authenticated live session never sees them: its board is built
   * from the exact Action records the loaded authoritative read contains, and
   * when that binding is unavailable the board fails closed to an empty
   * authoritative fixture rather than falling back to synthetic proposals.
   */
  const sessionBoardAuthenticated = authExperience.mode === "authenticated_live" && !reviewSession;
  const sessionBoardBinding = useMemo(
    () => (sessionBoardAuthenticated ? buildAuthoritativeSessionBoardBinding(loadedHostedStateResult) : null),
    [sessionBoardAuthenticated, loadedHostedStateResult],
  );
  const sessionBoardFixture = sessionBoardBinding?.fixture ?? buildSessionBoardFixture(sessionBoardScenario);
  const sessionBoardAuthorityGate: SessionBoardAuthorityGate = {
    authenticatedLiveCommander: authExperience.mode === "authenticated_live"
      && Boolean(liveAuthResult.receipt?.allowed && liveAuthResult.receipt.authorities.includes("Commander")),
    reviewMode: Boolean(reviewSession),
    hostedAvailability: persistenceMode,
    hostedUnknownCommand: Boolean(pendingHostedCommand),
    controlBusy: hostedStateControlBusy,
    retainedAllocationUnknown: sessionBoardAuthorityView.retained,
    authoritativeBindingBound: sessionBoardBinding?.status === "bound",
  };
  /**
   * The one unknown-write gate every authoritative mutation consults.
   *
   * Both unknown-outcome sources are represented: the hosted repository's
   * retained pending command and the Session Board's retained allocation command.
   * Either blocks every authoritative writer, and only the exact reconciliation
   * matching the retained source stays available.
   */
  const authoritativeWriteBlock = authoritativeWriteGate({
    hostedUnknownCommand: Boolean(pendingHostedCommand),
    retainedAllocationUnknown: sessionBoardAuthorityView.retained,
  });

  /**
   * Correction SARGE-P04-FORGE-REJECTED-RECOVERY-003.
   *
   * A known no-mutation rejection is safe and recoverable, so it must not persist
   * for the life of the single-page session. It clears only when authority has
   * genuinely moved past the exact baseline the stop was decided against — an
   * authoritative re-read returning the same revision and digest clears nothing,
   * because the condition that produced the stop demonstrably still holds.
   *
   * An unknown outcome is never cleared here under any baseline movement, and
   * neither is a state with a command still in flight. The helper returns the
   * identical object when nothing changes, so React bails out rather than looping.
   */
  useEffect(() => {
    const baseline = loadedHostedStateResult && loadedHostedStateResult.stateDigest !== null
      ? { revision: loadedHostedStateResult.revision, stateDigest: loadedHostedStateResult.stateDigest }
      : null;
    // Kept current for settlement, which reads it outside this render's closure.
    displayedAuthoritativeBaseline.current = baseline;
    setSessionBoardAuthorityView((current) => sessionBoardAuthorityViewAfterBaseline({
      view: current,
      baseline,
      commandInFlight: sessionBoardAllocation.current?.commandInFlight() ?? false,
    }));
  }, [loadedHostedStateResult]);

  /**
   * ACT-c1c2989b / C001.M017.A001 — cooperative WebMCP surface.
   *
   * Tools are registered only for an active experience: an authenticated live
   * session, a read-only Review session, or the memory-only Public Demo. Any
   * other state registers nothing at all. The adapter receives a bounded read
   * snapshot by injection and holds no repository, dispatcher, credential, or
   * hosted path, so this wiring adds an interface, never an authority.
   */
  const webMcpMode: WebMcpExperienceMode | null = reviewSession
    ? "review"
    : authExperience.mode === "demo"
      ? "public_demo"
      : authExperience.mode === "authenticated_live"
        ? "authenticated_live"
        : null;

  /**
   * The honest authority label for whatever the Commander is currently being
   * shown. Only `current` freshness is answerable: a hosted read that is still
   * checking, empty, unavailable, or superseded by a freshness notice is
   * reported as stale or unknown, and the tools then refuse instead of serving
   * a substitute source.
   */
  const webMcpAuthority = useMemo<WebMcpAuthorityDescriptor | null>(() => {
    if (!webMcpMode) return null;
    if (webMcpMode === "review") {
      return {
        mode: webMcpMode,
        authorityClass: "read_only_review_fixture",
        operationalAuthority: false,
        source: "UI Review synthetic fixture",
        storeRevision: null,
        stateDigest: null,
        observedAt: null,
        freshness: "current",
        notice: "Read-only review fixture. Not operational authority.",
      };
    }
    if (webMcpMode === "public_demo") {
      return {
        mode: webMcpMode,
        authorityClass: "synthetic_public_demo",
        operationalAuthority: false,
        source: "Public Demo memory-only synthetic state",
        storeRevision: null,
        stateDigest: null,
        observedAt: null,
        freshness: "current",
        notice: "Synthetic demonstration data. Not operational authority and never Production state.",
      };
    }
    if (persistenceMode === "loaded" && loadedHostedStateResult) {
      return {
        mode: webMcpMode,
        authorityClass: "hosted_operational_authority",
        operationalAuthority: true,
        source: "CASTRA hosted operational state",
        storeRevision: loadedHostedStateResult.revision,
        stateDigest: loadedHostedStateResult.stateDigest,
        observedAt: null,
        freshness: freshnessNotice ? "stale" : "current",
        notice: "Operational authority for status. Re-read live authority before any governed mutation.",
      };
    }
    if (persistenceMode === "disabled_pre_cutover") {
      return {
        mode: webMcpMode,
        authorityClass: "non_authoritative_local_candidate",
        operationalAuthority: false,
        source: "Local candidate state; hosted operational state is not activated for this environment",
        storeRevision: null,
        stateDigest: null,
        observedAt: null,
        freshness: "current",
        notice: "Not operational authority · local candidate.",
      };
    }
    return {
      mode: webMcpMode,
      authorityClass: "hosted_operational_authority",
      operationalAuthority: true,
      source: `Hosted operational state is ${persistenceMode}`,
      storeRevision: null,
      stateDigest: null,
      observedAt: null,
      freshness: "unknown",
      notice: "Hosted operational state is not readable. The tool surface fails closed rather than substituting another source.",
    };
  }, [webMcpMode, persistenceMode, loadedHostedStateResult, freshnessNotice]);

  /**
   * The snapshot lives in a ref and is refreshed after every render, so a tool
   * invocation reads exactly what the Commander is being shown without
   * re-registering the surface on every state change.
   */
  const webMcpSnapshot = useRef<WebMcpStateSnapshot | null>(null);
  useEffect(() => {
    webMcpSnapshot.current = webMcpAuthority && displayState
      ? {
          authority: webMcpAuthority,
          campaigns: displayState.campaigns,
          missions: displayState.missions,
          actions: displayState.actions,
          openWorkIndex: displayState.openWorkIndex,
          missionOpenWorkRollups: displayState.missionOpenWorkRollups,
        }
      : null;
  });

  /**
   * ACT-c1c2989b / C001.M017.A001 — SIGNAL Sonnet fallback R2. The visible,
   * reversible Session Work Plan draft surface now exists
   * (`SessionPlanDraftSurface`, mounted inside the existing `session-board`
   * view below), so the three cooperative proposal tools are bound instead of
   * refusing `proposal_context_unavailable`.
   *
   * Every member below is client-local by construction and touches no hosted
   * path:
   *
   * - `webMcpDraftRef` holds the exact current draft; `readClientDraft`
   *   returns it directly. `replaceClientDraft` writes the ref and mirrors the
   *   value into the `webMcpDraft` React state so the page re-renders — the
   *   ref, not the mirrored state, is this boundary's source of truth, so a
   *   tool call is never answered from a stale render.
   * - `prepareClosure` reads `webMcpDisplayStateRef` — the exact `displayState`
   *   already shown for this experience, kept current by a same-pattern ref
   *   effect below (mirroring the existing `webMcpSnapshot` ref above) — finds
   *   the named Action in it, and spreads the application's own
   *   `tier1DirectCloseReview(state, action)` into the `reviewed` shape. No
   *   eligibility rule is duplicated or altered.
   * - `available` is bound only in the authenticated live and Public Demo
   *   experiences, never Review Mode, matching the Commander's recorded
   *   default. The object identity below changes only when `webMcpMode`
   *   itself changes — exactly the same trigger the registration effect below
   *   already reacts to — and never merely because the draft's content or
   *   revision changed, so a draft replacement never tears down and
   *   re-registers the five-tool surface.
   */
  const webMcpDraftRef = useRef<WebMcpClientDraft | null>(null);
  const [webMcpDraft, setWebMcpDraft] = useState<WebMcpClientDraft | null>(null);
  const webMcpDraftModeRef = useRef<WebMcpExperienceMode | null>(webMcpMode);
  useEffect(() => {
    const currentDraft = webMcpDraftRef.current;
    const nextDraft = draftAfterExperienceTransition(
      currentDraft,
      webMcpDraftModeRef.current,
      webMcpMode,
    );
    webMcpDraftModeRef.current = webMcpMode;
    if (nextDraft !== currentDraft) {
      webMcpDraftRef.current = nextDraft;
      setWebMcpDraft(nextDraft);
    }
  }, [webMcpMode]);
  const webMcpDisplayStateRef = useRef<CastraState | null>(null);
  useEffect(() => {
    webMcpDisplayStateRef.current = displayState;
  });

  const webMcpProposals = useMemo<WebMcpProposalBoundary>(() => {
    if (webMcpMode !== "authenticated_live" && webMcpMode !== "public_demo") {
      return {
        available: false,
        reason: webMcpMode === "review"
          ? "Review Mode is read-only, so the Session Work Plan draft surface is not bound here."
          : "The Session Work Plan draft surface is bound only in the authenticated live and Public Demo experiences.",
      };
    }
    return {
      available: true,
      readClientDraft: () => webMcpDraftRef.current,
      replaceClientDraft: (draft) => {
        webMcpDraftRef.current = draft;
        setWebMcpDraft(draft);
      },
      prepareClosure: (actionId) => {
        const context = webMcpDisplayStateRef.current;
        const action = context?.actions.find((item) => item.id === actionId) ?? null;
        if (!context || !action) return { status: "unknown_target" };
        return {
          status: "reviewed",
          actionTitle: action.title,
          missionId: action.missionId,
          ...tier1DirectCloseReview(context, action),
        };
      },
    };
  }, [webMcpMode]);

  function discardWebMcpDraft(): void {
    webMcpDraftRef.current = null;
    setWebMcpDraft(null);
  }

  /**
   * C001.M016 CAPTURE-02 — sanitized, memory-only WebMCP execution activity.
   *
   * The exact CAPTURE-01 defect was that a successful native read-only call
   * changed nothing on screen, so a recording could not show that the visible
   * work was caused by WebMCP. This state is the correction, and it is driven
   * only by the registered tool callbacks: nothing here is a timer, an interval,
   * an animation, a fixture, or a video controller.
   *
   * Three boundaries hold it in place:
   *
   * - Each event is already sanitized by `src/webmcp/registration.ts` to a
   *   page-local sequence, the exact canonical tool name, the tool's own
   *   declared classification, and complete/refused. Nothing here re-reads,
   *   enriches, correlates, or stores a tool input, result, message, identifier,
   *   timestamp, or operational value, so no payload can reach the DOM.
   * - It is memory only. It is never written to the repository, hosted state, a
   *   log, storage, or a network call, and it is reset whenever the WebMCP
   *   experience changes or is withdrawn, so nothing crosses a Public Demo
   *   reload or an experience transition.
   * - `recordWebMcpExecution` is created once with a stable identity, so an
   *   activity update never changes the registration effect's dependencies and
   *   therefore never re-registers, reorders, or withdraws the tool surface.
   */
  const [webMcpActivity, setWebMcpActivity] = useState<readonly WebMcpExecutionEvent[]>([]);
  const recordWebMcpExecution = useCallback((event: WebMcpExecutionEvent) => {
    setWebMcpActivity((current) => [...current, event].slice(-WEBMCP_ACTIVITY_MEMORY_LIMIT));
  }, []);
  useEffect(() => {
    // Returning the identical empty array when there is nothing to clear lets
    // React bail out instead of re-rendering on every experience evaluation.
    setWebMcpActivity((current) => (current.length === 0 ? current : []));
  }, [webMcpMode]);

  // Real registration against the browser WebMCP API. Registration is
  // asynchronous, and the cleanup abort is the only unregistration path, so
  // unmounting or changing the active experience deterministically withdraws
  // the tools before anything replaces them.
  useEffect(() => {
    if (!webMcpMode) return;
    const controller = new AbortController();
    // The adapter converts an unsupported capability, an abort, and a host
    // rejection alike into a structured outcome and never rejects outward. The
    // promise is still observed deliberately so that a broken host contract
    // could only ever produce a handled settlement here, never an unhandled
    // rejection. The outcome is not rendered, stored, or acted on: this wiring
    // adds an interface, never an authority.
    void registerCastraWebMcpTools({
      detection: detectWebMcpCapability(),
      mode: webMcpMode,
      readSnapshot: () => webMcpSnapshot.current,
      proposals: webMcpProposals,
      signal: controller.signal,
      // Stable for the life of this component, so binding it adds no new
      // re-registration trigger: an activity update re-renders the strip and
      // leaves the registered surface exactly as it is.
      onExecution: recordWebMcpExecution,
    }).catch(() => undefined);
    return () => controller.abort();
  }, [webMcpMode, webMcpProposals, recordWebMcpExecution]);

  const selectedCampaign = useMemo(
    () => displayState?.campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [displayState, selectedCampaignId],
  );

  async function activateHostedState(): Promise<boolean> {
    setPersistenceMode("checking_hosted");
    setLoadedHostedStateResult(null);
    setEvidenceCaptureNotice(null);
    setFreshnessNotice(null);
    let pending: PendingHostedStateCommandRecord | null = null;
    try {
      pending = await hostedStateRepository.pendingCommand();
      setPendingHostedCommand(pending);
    } catch {
      setPendingHostedCommand(null);
      setPersistenceMode("unavailable");
      setError("The retained hosted-state command could not be verified. Commands are blocked until the durable pending record is repaired.");
      return false;
    }
    const result = await hostedStateRepository.inspect();
    if (result.availability === "disabled_pre_cutover") {
      hostedStateSelected.current = false;
      activeStateRepository = indexedDbRepository;
      setPersistenceMode("disabled_pre_cutover");
      return true;
    }
    hostedStateSelected.current = true;
    activeStateRepository = hostedStateRepository;
    setPersistenceMode(result.availability);
    if (result.availability === "loaded" && result.state) {
      setLoadedHostedStateResult(result);
      setState(result.state);
      setAuthReviewBaselineDigest(authoritativeStateDigest(result.state));
      setError(pending ? "A hosted-state command has an unknown outcome. Reconcile the exact retained command before issuing another command." : null);
      return true;
    }
    if (result.availability === "empty") {
      setState(emptyState());
      setError("Hosted operational state is active but empty. A governed import must initialize it; local browser data was not uploaded or substituted.");
      return false;
    }
    setState(emptyState());
    setError(`Hosted operational state is ${result.availability}. Authoritative commands are blocked; local fallback was not used.`);
    return false;
  }

  /**
   * The exact revision and digest the Commander is currently being shown — or,
   * for a second hosted write issued from the same asynchronous flow, the exact
   * confirmed result of the preceding write in that flow. React has not
   * re-rendered at that point, so the closure-captured result below is still
   * the pre-write revision while the store is already one revision ahead.
   */
  function authoritativeBaseline(precedingConfirmedWrite?: HostedStateLoadResult | null): { revision: number; stateDigest: string } | null {
    return hostedWriteBaseline({ precedingConfirmedWrite, rendered: loadedHostedStateResult });
  }

  /** Replaces the display from an authoritative read only. */
  function adoptAuthoritativeState(fresh: HostedStateLoadResult): void {
    if (fresh.availability !== "loaded" || !fresh.state) return;
    setLoadedHostedStateResult(fresh);
    setPersistenceMode("loaded");
    setState(fresh.state);
    setAuthReviewBaselineDigest(authoritativeStateDigest(fresh.state));
  }

  function hostedMutationActive(): boolean {
    return authExperience.mode === "authenticated_live"
      && persistenceMode === "loaded"
      && hostedStateSelected.current;
  }

  /**
   * Renews the readable proof and revalidates Commander authority before a
   * command is prepared. A failed or non-Commander result stops here, before
   * preparation and before dispatch, and leaves the visible authentication
   * state updated by the session observer above.
   */
  async function renewCommanderSessionProof(): Promise<boolean> {
    const proof = await renewLiveCommanderSessionProof();
    if (proof.authenticatedCommander) return true;
    setError(`${proof.publicMessage} No hosted command was prepared or dispatched.`);
    return false;
  }

  /**
   * Classifies a stopped hosted mutation. Every branch is a known outcome
   * except the retained unknown one, which keeps its exact idempotency key and
   * request binding for explicit reconciliation and never generates a retry or
   * a replacement key.
   */
  async function reportHostedMutationFailure(
    reason: unknown,
    fallbackMessage = "The command could not be completed.",
  ): Promise<void> {
    if (reason instanceof HostedStateStaleBaselineError) {
      adoptAuthoritativeState(reason.fresh);
      setFreshnessNotice(reason.message);
      setError(reason.message);
      return;
    }
    if (reason instanceof HostedStateSessionProofError) {
      setError(reason.message);
      return;
    }
    if (reason instanceof HostedStateUnconfirmedResultError) {
      setPersistenceMode("unavailable");
      setFreshnessNotice(reason.message);
      setError(reason.message);
      return;
    }
    if (reason instanceof HostedStateUnknownOutcomeError) {
      setPendingHostedCommand(await hostedStateRepository.pendingCommand());
    }
    setError(reason instanceof Error ? reason.message : fallbackMessage);
  }

  /**
   * The one ordinary authoritative hosted write path, in fixed order: prove the
   * displayed revision and digest are still current, prepare, dispatch, then
   * re-read and accept the result only when the authoritative store agrees with
   * the terminal receipt. Returns null when the command stopped, in which case
   * the caller leaves any open form or review exactly as it was.
   *
   * `precedingConfirmedWrite` is supplied only by a caller issuing a second
   * hosted write from the same asynchronous flow, and is that flow's exact
   * confirmed first result. It changes which authoritative read this write
   * proves itself against; it never skips or weakens the proof.
   */
  async function commitAuthoritativeChange(
    next: CastraState,
    precedingConfirmedWrite?: HostedStateLoadResult | null,
  ): Promise<HostedStateLoadResult | null> {
    const baseline = authoritativeBaseline(precedingConfirmedWrite);
    if (!baseline) {
      setError("No authoritative hosted baseline is loaded. The command failed closed and no local candidate was written.");
      return null;
    }
    try {
      await hostedStateRepository.confirmAuthoritativeBaseline(baseline);
      const prepared = await hostedStateRepository.prepareSave(next);
      const result = await hostedStateRepository.commitPrepared(prepared);
      if (result.outcome === "rejected") {
        setError(`The hosted write was rejected before any state change: ${result.reasonCode}. Re-read hosted state and review the command again.`);
        return null;
      }
      const confirmed = await hostedStateRepository.confirmAppliedResult(prepared, result);
      setFreshnessNotice(null);
      return confirmed;
    } catch (reason) {
      await reportHostedMutationFailure(reason);
      return null;
    }
  }

  /**
   * Writes one next state and returns the state that may be displayed. Hosted
   * writes go through renewal, authoritative pre-read, dispatch, and
   * authoritative confirmation. The pre-cutover local candidate path is
   * unchanged and is never promoted into hosted state.
   *
   * The confirmed authoritative result is returned with the displayable state
   * so that a caller issuing a second hosted write from the same asynchronous
   * flow can pass it back in as `precedingConfirmedWrite`. Nothing here reads a
   * baseline out of a React value that the running closure captured before this
   * write applied.
   */
  async function persistAndConfirm(
    next: CastraState,
    hostedMutation: boolean,
    precedingConfirmedWrite?: HostedStateLoadResult | null,
  ): Promise<PersistedWrite | null> {
    if (!hostedMutation) {
      await activeStateRepository.save(next);
      setState(next);
      setSavedAt(new Date().toISOString());
      return { state: next, confirmed: null };
    }
    // The shared unknown-write gate again, at the one choke point every ordinary
    // hosted write passes through. The entry points check it too, so this is a
    // backstop rather than the primary control: a future caller that forgets the
    // gate still cannot advance the revision under a retained unknown command.
    if (authoritativeWriteBlock.blocked) {
      setError(authoritativeWriteBlock.message);
      return null;
    }
    if (!await renewCommanderSessionProof()) return null;
    const confirmed = await commitAuthoritativeChange(next, precedingConfirmedWrite);
    if (!confirmed?.state) return null;
    setState(confirmed.state);
    setLoadedHostedStateResult(confirmed);
    setAuthReviewBaselineDigest(authoritativeStateDigest(confirmed.state));
    setSavedAt(new Date().toISOString());
    return { state: confirmed.state, confirmed };
  }

  async function exportHostedStateEvidence(): Promise<void> {
    if (!hostedStateEvidenceExportControlVisible({
      mode: authExperience.mode,
      availability: persistenceMode,
      receipt: liveAuthResult.receipt,
    })) {
      setEvidenceCaptureNotice("Hosted-state evidence capture is available only to the authenticated live Commander on loaded hosted state.");
      return;
    }
    if (!loadedHostedStateResult) {
      setEvidenceCaptureNotice("No loaded hosted-state result is held in memory. Reload hosted state before capturing evidence.");
      return;
    }
    let url: string | null = null;
    try {
      const artifact = buildHostedStateEvidenceCapture({
        source: loadedHostedStateResult,
        capturedAt: new Date().toISOString(),
        origin: globalThis.location?.origin ?? "",
      });
      const serialized = serializeHostedStateEvidenceCapture(artifact);
      const artifactDigest = await hostedSha256(serialized);
      url = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = hostedStateEvidenceCaptureFileName(artifact);
      anchor.click();
      setEvidenceCaptureNotice(`Evidence captured read-only at revision ${artifact.revision} · state ${artifact.stateDigest} · file ${artifactDigest}. No command was dispatched and no hosted write occurred.`);
    } catch (reason) {
      setEvidenceCaptureNotice(reason instanceof Error ? reason.message : "The hosted-state evidence capture could not be produced.");
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  async function reviewInitialHostedImport(exportFile: File | null, manifestFile: File | null): Promise<void> {
    if (!exportFile || !manifestFile || hostedStateControlBusy) return;
    if (!initialImportControlVisible({
      mode: authExperience.mode,
      availability: persistenceMode,
      pendingCommand: authoritativeWriteBlock.blocked,
      receipt: liveAuthResult.receipt,
    })) {
      setError("Governed initial import is available only to the authenticated live Commander on an empty hosted store with no pending command.");
      return;
    }
    if (exportFile.size > 1_000_000) {
      setError("The selected import file is larger than the accepted bounded operational export.");
      return;
    }
    if (manifestFile.size > 256_000) {
      setError("The selected high-water manifest is larger than the accepted bounded manifest.");
      return;
    }
    setHostedStateControlBusy(true);
    setInitialImportReview(null);
    setInitialImportConfirmed(false);
    try {
      const rawBytes = new Uint8Array(await exportFile.arrayBuffer());
      const manifestText = await manifestFile.text();
      let candidate: InitialImportCandidate;
      try {
        candidate = await buildInitialImportCandidateFromFiles(rawBytes, manifestText);
      } finally {
        rawBytes.fill(0);
      }
      const authority = await bindInitialImportAuthority(liveAuthResult.receipt);
      const prepared = await hostedStateRepository.prepareInitialImport(candidate);
      const evidence = await buildInitialImportReviewEvidence({ candidate, authority, prepared });
      setInitialImportReview({ candidate, prepared, evidence });
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The governed initial-import package could not be reviewed.");
    } finally {
      setHostedStateControlBusy(false);
    }
  }

  async function confirmInitialHostedImport(form: HTMLFormElement): Promise<void> {
    if (!initialImportReview || !initialImportConfirmed || hostedStateControlBusy) return;
    if (!initialImportControlVisible({
      mode: authExperience.mode,
      availability: persistenceMode,
      pendingCommand: authoritativeWriteBlock.blocked,
      receipt: liveAuthResult.receipt,
    })) {
      setError("Initial-import conditions changed. Review the exact export again after hosted state and session evidence are current.");
      return;
    }
    setHostedStateControlBusy(true);
    try {
      const currentAuthority = await bindInitialImportAuthority(liveAuthResult.receipt);
      if (currentAuthority.receiptDigest !== initialImportReview.evidence.authorityReceiptDigest) {
        throw new Error("The authenticated authority receipt changed after review. Prepare a fresh import review before confirmation.");
      }
      const identityReference = liveAuthResult.receipt?.identityReference;
      if (!identityReference) throw new Error("The current authenticated identity cannot be bound to the exact import manifest.");
      const stepUp = await submitProductOwnerStepUpForm(
        form,
        identityReference,
        (input) => liveAuthenticationClient.stepUp(input),
        () => undefined,
        OPERATIONAL_STATE_INITIAL_IMPORT_PROOF_ACTION,
        initialImportReview.candidate.manifestDigest,
      );
      await bindInitialImportApproval(stepUp.result.receipt, initialImportReview.candidate.manifestDigest);
      const result = await hostedStateRepository.commitPrepared(initialImportReview.prepared);
      if (result.outcome === "rejected" || result.revision !== 1) {
        throw new Error(`Initial import was not applied as revision 1: ${result.reasonCode}.`);
      }
      const usable = await activateHostedState();
      if (!usable || hostedStateRepository.currentRevision() !== 1) {
        throw new Error("The provider returned an import receipt, but revision 1 could not be reloaded exactly.");
      }
      setInitialImportReview(null);
      setInitialImportConfirmed(false);
      setInitialImportExportFile(null);
      setInitialImportManifestFile(null);
      setSavedAt(new Date().toISOString());
      setView("overview");
      setError(`Governed initial import ${result.outcome} at revision 1 · ${result.reasonCode} · request ${initialImportReview.evidence.requestBindingDigest}. CASTRA hosted state is the operational authority.`);
    } catch (reason) {
      if (reason instanceof HostedStateUnknownOutcomeError) setPendingHostedCommand(await hostedStateRepository.pendingCommand());
      setError(reason instanceof Error ? reason.message : "The governed initial import could not be completed.");
    } finally {
      setHostedStateControlBusy(false);
    }
  }

  async function reviewPostHighWaterReconciliation(file: File | null): Promise<void> {
    if (!file || !state || hostedStateControlBusy) return;
    if (!postHighWaterReconciliationControlVisible({
      mode: authExperience.mode,
      availability: persistenceMode,
      pendingCommand: authoritativeWriteBlock.blocked,
      revision: hostedStateRepository.currentRevision(),
      receipt: liveAuthResult.receipt,
    })) {
      setError("Post-high-water reconciliation is available only to the authenticated live Commander on loaded hosted revision 1 with no pending command.");
      return;
    }
    if (file.size > 256_000) {
      setError("The selected post-high-water package is larger than the accepted bounded artifact.");
      return;
    }
    setHostedStateControlBusy(true);
    setPostHighWaterReview(null);
    setPostHighWaterConfirmed(false);
    let rawBytes: Uint8Array | null = null;
    try {
      rawBytes = new Uint8Array(await file.arrayBuffer());
      const candidate = await buildPostHighWaterReconciliationCandidate({
        rawPackageBytes: rawBytes,
        currentState: state,
        hostedRevision: hostedStateRepository.currentRevision(),
      });
      const prepared = await hostedStateRepository.prepareSave(candidate.state);
      if (prepared.expectedRevision !== candidate.expectedRevision || prepared.stateDigest !== candidate.resultingStateDigest) {
        throw new Error("Prepared hosted write is not bound to the exact A050 candidate and revision-1 baseline.");
      }
      setPostHighWaterReview({ candidate, prepared });
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The governed post-high-water package could not be reviewed.");
    } finally {
      rawBytes?.fill(0);
      setHostedStateControlBusy(false);
    }
  }

  async function confirmPostHighWaterReconciliation(): Promise<void> {
    if (!postHighWaterReview || !postHighWaterConfirmed || !state || hostedStateControlBusy) return;
    if (!postHighWaterReconciliationControlVisible({
      mode: authExperience.mode,
      availability: persistenceMode,
      pendingCommand: authoritativeWriteBlock.blocked,
      revision: hostedStateRepository.currentRevision(),
      receipt: liveAuthResult.receipt,
    })) {
      setError("Post-high-water conditions changed. Review the exact A050 package again after hosted state and session evidence are current.");
      return;
    }
    setHostedStateControlBusy(true);
    try {
      if (await hostedStateDocumentDigest(state) !== postHighWaterReview.candidate.baseStateDigest) {
        throw new Error("Hosted state changed after A050 review. Prepare a fresh exact-package review.");
      }
      const result = await hostedStateRepository.commitPrepared(postHighWaterReview.prepared);
      if (result.outcome === "rejected" || result.revision !== postHighWaterReview.candidate.expectedResultingRevision) {
        throw new Error(`Post-high-water reconciliation was not applied as revision 2: ${result.reasonCode}.`);
      }
      const reloaded = await hostedStateRepository.inspect();
      if (reloaded.availability !== "loaded" || reloaded.revision !== 2 || !reloaded.state
        || reloaded.stateDigest !== postHighWaterReview.candidate.resultingStateDigest) {
        throw new Error("The provider returned a terminal receipt, but the exact A050 revision-2 state could not be reloaded.");
      }
      setState(reloaded.state);
      setAuthReviewBaselineDigest(authoritativeStateDigest(reloaded.state));
      setPersistenceMode("loaded");
      setPostHighWaterReview(null);
      setPostHighWaterConfirmed(false);
      setPostHighWaterFile(null);
      setSavedAt(new Date().toISOString());
      setView("overview");
      setError(`Governed A041–A050 reconciliation ${result.outcome} at revision 2 · ${result.reasonCode} · request ${postHighWaterReview.prepared.requestBindingDigest}. CASTRA hosted state is the operational authority.`);
    } catch (reason) {
      if (reason instanceof HostedStateUnknownOutcomeError) setPendingHostedCommand(await hostedStateRepository.pendingCommand());
      setError(reason instanceof Error ? reason.message : "The governed post-high-water reconciliation could not be completed.");
    } finally {
      setHostedStateControlBusy(false);
    }
  }

  function resetToPreCutoverPersistence(): void {
    hostedStateSelected.current = false;
    activeStateRepository = indexedDbRepository;
    setPersistenceMode("disabled_pre_cutover");
    setPendingHostedCommand(null);
    setFreshnessNotice(null);
    indexedDbRepository.load().then((loaded) => {
      if (!hostedStateSelected.current) setState(mergeC001SourceBundle(loaded));
    }).catch(() => undefined);
  }

  async function execute(commands: CastraCommand[]): Promise<boolean> {
    if (!state) return false;
    if (reviewSession) {
      try { requireUI03ReviewReadOnly("authoritative_command"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Review Mode is read-only."); }
      return false;
    }
    if (authExperience.mode === "demo") {
      if (!demoState) return false;
      const permitted = commands.every((command) => command.type.startsWith("campaign.") || command.type.startsWith("mission.") || command.type.startsWith("action.") || command.type.startsWith("record.") || command.type.startsWith("presentation."));
      if (!permitted) {
        setError("Public Demo permits only in-memory Campaign, Mission, Action, and presentation changes. Providers, models, deployment, identity, and authoritative evidence commands are unavailable.");
        return false;
      }
      try {
        const context = { now: () => new Date().toISOString(), id: createId, presentationScope: "public_demo" as const };
        const applied = commands.reduce((workingState, command) => applyCommand(workingState, command, context), demoState);
        const createdCampaign = commands.some((command) => command.type === "campaign.create") ? applied.campaigns.at(-1) : null;
        const next = createdCampaign ? applyCampaignBaselineTemplate(applied, createdCampaign.id, context) : applied;
        setDemoState(next);
        setSavedAt(null);
        setError(null);
        setFormRequest(null);
        return true;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The demonstration command could not be completed.");
        return false;
      }
    }
    if (!authExperience.mode.startsWith("authenticated_")) {
      setError("An active authenticated Commander session is required for authoritative local record commands.");
      return false;
    }
    if (authExperience.mode === "authenticated_live" && authoritativeWriteBlock.blocked) {
      setError(authoritativeWriteBlock.message);
      return false;
    }
    if (authExperience.mode === "authenticated_live" && !["loaded", "disabled_pre_cutover"].includes(persistenceMode)) {
      setError("Hosted operational state is not ready. The command failed closed and no local fallback was used.");
      return false;
    }
    try {
      const context = { now: () => new Date().toISOString(), id: createId };
      const applied = commands.reduce(
        (workingState, command) => applyCommand(workingState, command, context),
        state,
      );
      const createdCampaign = commands.some((command) => command.type === "campaign.create") ? applied.campaigns.at(-1) : null;
      const next = createdCampaign ? applyCampaignBaselineTemplate(applied, createdCampaign.id, context) : applied;
      // On any stop the open form stays open with its entry intact so the
      // Commander can review the refreshed state and submit again.
      if (!await persistAndConfirm(next, hostedMutationActive())) return false;
      setError(null);
      setFormRequest(null);
      return true;
    } catch (reason) {
      await reportHostedMutationFailure(reason);
      return false;
    }
  }


  async function executeTier1DirectActionClose(expectedReview: Tier1DirectCloseReview): Promise<boolean> {
    const liveCommander = authExperience.mode === "authenticated_live"
      && Boolean(liveAuthResult.receipt?.allowed && liveAuthResult.receipt.authorities.includes("Commander"));
    if (!liveCommander || reviewSession || persistenceMode !== "loaded" || authoritativeWriteBlock.blocked || hostedStateControlBusy) {
      setError(authoritativeWriteBlock.message
        ?? "Tier 1 direct closure requires the authenticated live Commander, loaded hosted authority, no Review Mode, no busy control, and no retained unknown command.");
      return false;
    }
    setHostedStateControlBusy(true);
    setError(null);
    try {
      // Renew the readable same-origin proof and revalidate Commander authority
      // first, then re-read authoritative Production at the click boundary. The
      // Action revision and exact displayed evidence package must still match.
      if (!await renewCommanderSessionProof()) return false;
      const fresh = await hostedStateRepository.inspect();
      if (fresh.availability !== "loaded" || !fresh.state || !fresh.stateDigest) {
        throw new Error("The authoritative hosted state could not be rebound at the close boundary.");
      }
      const freshAction = fresh.state.actions.find((action) => action.id === expectedReview.actionId);
      if (!freshAction) throw new Error("The reviewed Action is no longer present in authoritative state.");
      const reboundReview = tier1DirectCloseReview(fresh.state, freshAction);
      if (reboundReview.expectedRevision !== expectedReview.expectedRevision) {
        throw new Error(`The Action changed after review: expected revision ${expectedReview.expectedRevision}, current ${reboundReview.expectedRevision}.`);
      }
      if (JSON.stringify(reboundReview.evidenceReferences) !== JSON.stringify(expectedReview.evidenceReferences)) {
        throw new Error("The Action evidence package changed after review. Review the refreshed Action before closing it.");
      }
      if (!reboundReview.eligible) {
        throw new Error(`Tier 1 direct closure is no longer eligible: ${reboundReview.issues.join(" ")}`);
      }

      const prepared = await hostedStateRepository.prepareBoundSave((binding) => applyTier1DirectClose(fresh.state!, {
        actionId: reboundReview.actionId,
        expectedRevision: reboundReview.expectedRevision,
        expectedEvidenceReferences: reboundReview.evidenceReferences,
        commandId: binding.idempotencyKey,
      }, {
        now: () => new Date().toISOString(),
        id: createId,
        commandAuthority: "Commander",
      }), "tier1-direct-close");
      const result = await hostedStateRepository.commitPrepared(prepared);
      if (result.outcome === "rejected") throw new Error(`The hosted close was rejected: ${result.reasonCode}.`);

      const reloaded = await hostedStateRepository.inspect();
      const closed = reloaded.state?.actions.find((action) => action.id === expectedReview.actionId);
      const lifecycle = reloaded.state?.lifecycleCommandReceipts.find((receipt) => receipt.commandId === prepared.idempotencyKey);
      if (reloaded.availability !== "loaded" || !reloaded.state || reloaded.revision !== result.revision
        || reloaded.stateDigest !== prepared.stateDigest || closed?.status !== "completed"
        || closed.revision !== expectedReview.resultingRevision || !lifecycle) {
        throw new Error("The close received a terminal receipt but the exact authoritative Action and lifecycle receipt could not be re-read. Stop and reconcile before another command.");
      }
      setState(reloaded.state);
      setLoadedHostedStateResult(reloaded);
      setPersistenceMode("loaded");
      setPendingHostedCommand(null);
      setSavedAt(new Date().toISOString());
      setError(`${expectedReview.actionId} approved and closed at Action revision ${closed.revision} · hosted ${result.outcome} at store revision ${result.revision} · ${result.reasonCode}.`);
      return true;
    } catch (reason) {
      if (reason instanceof HostedStateUnknownOutcomeError) setPendingHostedCommand(await hostedStateRepository.pendingCommand());
      setError(reason instanceof Error ? reason.message : "Tier 1 direct closure failed closed.");
      return false;
    } finally {
      setHostedStateControlBusy(false);
    }
  }

  /**
   * ACT-c417cbd5 / P04 — the authenticated Session Board allocation controller.
   *
   * It is created once and held in a ref because its retention store is the
   * memory block for an unknown outcome: a controller rebuilt on re-render would
   * forget a retained command and quietly re-permit a second write. Durable
   * retention across reload is the recorded G1 residual the Commander accepted
   * for this release; server-side idempotency and request binding remain the
   * authoritative safeguards.
   */
  function sessionBoardAllocationController(): SessionBoardAllocationController {
    if (!sessionBoardAllocation.current) {
      sessionBoardAllocation.current = createSessionBoardAllocationController({
        reload: async () => {
          const fresh = await hostedStateRepository.inspect();
          sessionBoardLastAuthoritativeRead.current = fresh;
          return fresh;
        },
      });
    }
    return sessionBoardAllocation.current;
  }

  /**
   * Presents a settled allocation. Only an applied outcome that already
   * reconciled against the authoritative re-read replaces the displayed state,
   * and it adopts the exact read that was reconciled rather than issuing another
   * one. Every other outcome leaves the display untouched and surfaces its stop.
   */
  function applySessionBoardAllocationOutcome(outcome: SessionBoardAllocationOutcome): void {
    // Correction 003. The settled view is re-evaluated here, against the baseline
    // the board is *currently* displaying rather than the one this continuation
    // closed over, and after the controller latch has already been released. A
    // known no-mutation rejection decided against a baseline the board has since
    // moved past therefore returns to ready immediately, instead of waiting for a
    // further baseline change that will never arrive. Unknown, retained, and
    // genuinely in-flight states are untouched by this path.
    setSessionBoardAuthorityView(sessionBoardAuthorityViewAfterSettlement({
      outcome,
      displayedBaseline: displayedAuthoritativeBaseline.current,
      commandInFlight: sessionBoardAllocation.current?.commandInFlight() ?? false,
    }));
    const fresh = sessionBoardLastAuthoritativeRead.current;
    if (outcome.status === "applied" && outcome.reloaded && fresh
      && fresh.availability === "loaded" && fresh.state
      && fresh.revision === outcome.reloaded.revision
      && fresh.stateDigest === outcome.reloaded.stateDigest) {
      adoptAuthoritativeState(fresh);
      setFreshnessNotice(null);
      setSavedAt(new Date().toISOString());
      setError(null);
      return;
    }
    setError(outcome.message);
  }

  /**
   * The one authenticated path from a Commander Session Board selection to the
   * authoritative allocation client.
   *
   * The gate is re-evaluated here, at the click boundary, instead of being
   * trusted from the render that drew the control: session renewal, hosted
   * availability, Review Mode, a busy control, and a retained unknown command
   * can all change between paint and click, and each must stop the command
   * before anything is prepared.
   */
  async function authorizeSessionBoardSelection(selectedProposalIds: string[]): Promise<void> {
    const bound = sessionBoardBinding && sessionBoardBinding.status === "bound" ? sessionBoardBinding.binding : null;
    if (!sessionBoardAuthorityDispatchPermitted(sessionBoardAuthorityGate) || !bound) {
      const message = "Session Board authorization requires the authenticated live Commander, loaded hosted authority, an authoritative board binding, no Review Mode, no busy control, and no retained unknown command. No command was prepared or dispatched.";
      setSessionBoardAuthorityView((current) => ({
        ...current,
        status: "rejected",
        message,
        result: null,
        baselineAtDecision: authoritativeBaseline(),
      }));
      setError(message);
      return;
    }
    const baseline = authoritativeBaseline();
    if (!baseline) {
      const message = "No authoritative hosted baseline is loaded. The Session Board command failed closed and no local candidate was written.";
      setSessionBoardAuthorityView((current) => ({
        ...current,
        status: "rejected",
        message,
        result: null,
        baselineAtDecision: null,
      }));
      setError(message);
      return;
    }
    setHostedStateControlBusy(true);
    setSessionBoardAuthorityView((current) => ({
      ...current,
      status: "submitting",
      message: `Dispatching one governed allocation command bound to authoritative revision ${baseline.revision}.`,
      result: null,
      baselineAtDecision: baseline,
    }));
    setError(null);
    try {
      if (!await renewCommanderSessionProof()) {
        setSessionBoardAuthorityView((current) => ({
          ...current,
          status: "rejected",
          message: "The authenticated Commander session could not be renewed. No allocation command was prepared or dispatched.",
          result: null,
          baselineAtDecision: baseline,
        }));
        return;
      }
      applySessionBoardAllocationOutcome(await sessionBoardAllocationController().authorize({
        binding: bound,
        selectedProposalIds,
        baseline,
      }));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The Session Board allocation failed closed.";
      setSessionBoardAuthorityView((current) => ({
        ...current,
        status: "rejected",
        message,
        result: null,
        baselineAtDecision: baseline,
      }));
      setError(message);
    } finally {
      setHostedStateControlBusy(false);
    }
  }

  /**
   * The only continuation permitted after an unknown allocation outcome: the
   * byte-identical command under its original idempotency identity, requested
   * explicitly. Nothing here schedules a retry or issues a replacement key.
   */
  async function reconcileSessionBoardAllocationCommand(): Promise<void> {
    if (!sessionBoardReconcilePermitted(sessionBoardAuthorityGate)) {
      setError("Exact Session Board reconciliation is available only to the authenticated live Commander on loaded hosted authority while an unknown allocation command is retained.");
      return;
    }
    setHostedStateControlBusy(true);
    setError(null);
    try {
      if (!await renewCommanderSessionProof()) {
        setSessionBoardAuthorityView((current) => ({
          ...current,
          message: "The authenticated Commander session could not be renewed. The exact command is still retained and was not redispatched.",
        }));
        return;
      }
      applySessionBoardAllocationOutcome(await sessionBoardAllocationController().reconcile());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The exact Session Board reconciliation failed closed.");
    } finally {
      setHostedStateControlBusy(false);
    }
  }

  /**
   * The governed Command Connector path.
   *
   * This is the one place in the running application that builds a Commander
   * command context. The A004 lifecycle commands and the A005 connector both
   * require `commandAuthority: "Commander"`, and until now nothing outside the
   * domain tests constructed it, so no application path could reach the
   * connector at all.
   *
   * Constructing it here does not become agent self-approval, because no agent
   * identity can reach this code: it runs only inside the Commander's
   * authenticated browser session, hosted writes require that session plus the
   * same-origin CSRF proof, and the agent surface `/api/agent-state` is
   * read-only and ignores incoming cookies. The guards below are the same ones
   * `execute` applies — Review Mode is read-only, Public Demo is refused, an
   * unauthenticated session is refused, and an unknown hosted outcome blocks
   * every further command until it is reconciled.
   *
   * The connector entry points are `(state, input, context)` functions rather
   * than `CastraCommand` members, so they are dispatched through the governed
   * closure request union instead of `applyCommand`.
   */
  async function executeGovernedClosure(request: GovernedClosureRequest): Promise<boolean> {
    if (!state) return false;
    if (reviewSession) {
      try { requireUI03ReviewReadOnly("model_or_connector"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Review Mode is read-only."); }
      return false;
    }
    if (authExperience.mode === "demo") {
      setError("Public Demo is unauthenticated and memory-only. Governed closure requires the authenticated Commander session and is unavailable here.");
      return false;
    }
    if (!authExperience.mode.startsWith("authenticated_")) {
      setError("An active authenticated Commander session is required before a governed connector step can be recorded.");
      return false;
    }
    if (authExperience.mode === "authenticated_live" && authoritativeWriteBlock.blocked) {
      setError(authoritativeWriteBlock.message);
      return false;
    }
    if (authExperience.mode === "authenticated_live" && !["loaded", "disabled_pre_cutover"].includes(persistenceMode)) {
      setError("Hosted operational state is not ready. The governed connector step failed closed and no local fallback was used.");
      return false;
    }
    try {
      const context = { now: () => new Date().toISOString(), id: createId, commandAuthority: "Commander" as const };
      const next = applyGovernedClosureStep(state, request, context);
      if (!await persistAndConfirm(next, hostedMutationActive())) return false;
      setError(null);
      return true;
    } catch (reason) {
      // An unknown hosted write outcome retains its exact idempotency key and
      // request binding for reconciliation; no retry is generated here.
      await reportHostedMutationFailure(reason, "The governed connector step could not be completed.");
      return false;
    }
  }

  async function runLocalProposal(input: InvocationInput): Promise<boolean> {
    if (!state) return false;
    if (reviewSession) {
      try { requireUI03ReviewReadOnly("model_or_connector"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Review Mode is read-only."); }
      return false;
    }
    if (!authExperience.mode.startsWith("authenticated_")) {
      setError("An active authenticated Commander session is required before a governed local-model request can be reviewed.");
      return false;
    }
    if (authExperience.mode === "authenticated_live" && authoritativeWriteBlock.blocked) {
      setError(authoritativeWriteBlock.message);
      return false;
    }
    if (authExperience.mode === "authenticated_live" && !["loaded", "disabled_pre_cutover"].includes(persistenceMode)) {
      setError("Hosted operational state is not ready. The proposal request failed closed and no local fallback was used.");
      return false;
    }
    try {
      const hostedMutation = hostedMutationActive();
      const context = { now: () => new Date().toISOString(), id: createId };
      const requested = applyCommand(
        state,
        { type: "local_model.invocation.request", ...input },
        context,
      );
      const requestWrite = await persistAndConfirm(requested, hostedMutation);
      if (!requestWrite) return false;
      setError(null);

      const requestedState = requestWrite.state;
      const invocation = requestedState.localModelInvocations.at(-1);
      if (!invocation || invocation.status !== "ready") return true;
      const policy = requestedState.localModelPolicyVersions.find((item) => item.id === invocation.policyVersionId);
      if (!policy) throw new Error("The policy snapshot for this local-model invocation is unavailable.");
      const result = await ollamaAdapter.generate({
        modelName: invocation.selectedModelName,
        modelDigest: invocation.selectedModelDigest,
        prompt: invocation.prompt,
        maxOutputTokens: policy.maxOutputTokens,
      });
      const completed = applyCommand(
        requestedState,
        { type: "local_model.invocation.complete", invocationId: invocation.id, result },
        context,
      );
      // The completion is the second hosted write of this one asynchronous
      // flow. React has not re-rendered since the request write applied, so the
      // exact confirmed result of that write — not the render-captured
      // revision, which is now one behind — is this write's baseline.
      return Boolean(await persistAndConfirm(completed, hostedMutation, requestWrite.confirmed));
    } catch (reason) {
      await reportHostedMutationFailure(reason, "The local-model proposal request could not be completed.");
      return false;
    }
  }

  async function reconcileHostedStateCommand(form?: HTMLFormElement): Promise<void> {
    if (!pendingHostedCommand || hostedStateControlBusy) return;
    // Exactly one exact reconciliation is available at a time, and it is the one
    // matching the source actually retained. This is the hosted path; if the
    // shared gate is naming the allocation source instead, this command stops.
    if (authoritativeWriteBlock.permittedReconciliation !== "hosted_exact_command") {
      setError(authoritativeWriteBlock.message
        ?? "The retained hosted-state command cannot be reconciled in this state.");
      return;
    }
    setHostedStateControlBusy(true);
    try {
      if (pendingHostedCommand.command.commandType === "initial_import") {
        const identityReference = liveAuthResult.receipt?.identityReference;
        if (!form || !identityReference) throw new Error("Reconciliation of an initial import requires renewed Product Owner proof for the exact retained manifest.");
        const stepUp = await submitProductOwnerStepUpForm(
          form,
          identityReference,
          (input) => liveAuthenticationClient.stepUp(input),
          () => undefined,
          OPERATIONAL_STATE_INITIAL_IMPORT_PROOF_ACTION,
          pendingHostedCommand.command.manifestDigest,
        );
        await bindInitialImportApproval(stepUp.result.receipt, pendingHostedCommand.command.manifestDigest);
      }
      const result = await hostedStateRepository.reconcilePending();
      setPendingHostedCommand(null);
      const usable = await activateHostedState();
      setError(result.outcome === "rejected"
        ? `The retained command was reconciled as rejected: ${result.reasonCode}. Hosted state was reloaded.`
        : usable
          ? `The exact retained command was reconciled as ${result.outcome} at revision ${result.revision}.`
          : "The retained command was reconciled, but hosted state is not currently usable.");
    } catch (reason) {
      setPendingHostedCommand(await hostedStateRepository.pendingCommand().catch(() => pendingHostedCommand));
      setError(reason instanceof Error ? reason.message : "The retained hosted-state command could not be reconciled.");
    } finally {
      setHostedStateControlBusy(false);
    }
  }

  async function recoverHostedOperationalState(form: HTMLFormElement): Promise<void> {
    if (hostedStateControlBusy || persistenceMode !== "loaded" || authoritativeWriteBlock.blocked) return;
    const targetRevision = Number(recoveryTargetRevision);
    if (!Number.isSafeInteger(targetRevision) || targetRevision <= 0 || targetRevision >= hostedStateRepository.currentRevision()) {
      setError("Choose an earlier positive hosted-state revision before starting recovery.");
      return;
    }
    const identityReference = liveAuthResult.receipt?.identityReference;
    if (!identityReference) {
      setError("The current authenticated identity cannot be bound to Product Owner recovery.");
      return;
    }
    setHostedStateControlBusy(true);
    try {
      const stepUp = await submitProductOwnerStepUpForm(
        form,
        identityReference,
        (input) => liveAuthenticationClient.stepUp(input),
        () => undefined,
        OPERATIONAL_STATE_RECOVERY_PROOF_ACTION,
      );
      if (!stepUp.result.receipt?.allowed || stepUp.result.receipt.stepUpEvidence?.sensitiveAction !== OPERATIONAL_STATE_RECOVERY_PROOF_ACTION) {
        setError("Product Owner step-up was not established. No hosted-state recovery was performed.");
        return;
      }
      const result = await hostedStateRepository.restore(targetRevision);
      const usable = await activateHostedState();
      setRecoveryTargetRevision("");
      setError(usable
        ? `Recovery appended hosted revision ${result.revision} from revision ${targetRevision}.`
        : "Recovery returned a receipt, but the restored hosted state could not be reloaded safely.");
    } catch (reason) {
      if (reason instanceof HostedStateUnknownOutcomeError) setPendingHostedCommand(await hostedStateRepository.pendingCommand());
      setError(reason instanceof Error ? reason.message : "Hosted operational-state recovery could not be completed.");
    } finally {
      setHostedStateControlBusy(false);
    }
  }

  function startUI03Review() {
    if (!state) return;
    const session: UI03ReviewSession = {
      contractVersion: 1,
      fixtureId: UI03_FIXTURE_MANIFEST.fixtureId,
      fixtureRevision: UI03_FIXTURE_MANIFEST.fixtureRevision,
      scenario: "normal",
      authoritativeDigest: authoritativeStateDigest(state),
    };
    sessionStorage.setItem(UI03_REVIEW_SESSION_KEY, JSON.stringify(session));
    setReviewSession(session);
    setView("ui-reviews");
    setSelectedCampaignId(null);
    setTestingContext(null);
    setFormRequest(null);
    setError(null);
  }

  function changeReviewScenario(scenario: UIReviewScenario) {
    if (!state || !reviewSession) return;
    if (authoritativeStateDigest(state) !== reviewSession.authoritativeDigest) {
      setError("Authoritative-state digest changed during Review Mode. Scenario switching is blocked; no review fixture data was saved.");
      return;
    }
    const updated = { ...reviewSession, scenario };
    sessionStorage.setItem(UI03_REVIEW_SESSION_KEY, JSON.stringify(updated));
    setReviewSession(updated);
    setSelectedCampaignId(null);
    setTestingContext(null);
    setError(null);
  }

  function exitUI03Review() {
    if (!state || !reviewSession) return;
    const unchanged = authoritativeStateDigest(state) === reviewSession.authoritativeDigest;
    sessionStorage.removeItem(UI03_REVIEW_SESSION_KEY);
    setReviewSession(null);
    setView(authExperience.mode.startsWith("authenticated_") ? "overview" : "welcome-access");
    setSelectedCampaignId(null);
    setTestingContext(null);
    setFormRequest(null);
    setError(unchanged ? null : "Review Mode exited with an authoritative-state digest mismatch. No review fixture command was saved; inspect the authoritative audit before continuing.");
  }

  function openReviewTarget(destination: UIReviewDestination, scenario: UIReviewScenario) {
    if (!reviewSession) return;
    changeReviewScenario(scenario);
    setView(destination);
    setSelectedCampaignId(destination === "campaigns" && scenario !== "empty" ? "campaign_ui03_001" : null);
    setTestingContext(null);
  }

  function navigate(nextView: View) {
    if (reviewSession) {
      setView(nextView);
      if (nextView !== "campaigns") setSelectedCampaignId(null);
      if (nextView === "testing") setTestingContext(null);
      return;
    }
    if (authExperience.mode === "demo") {
      if (!(DEMO_NAVIGATION_VIEWS as readonly string[]).includes(nextView)) {
        setError("That destination is unavailable in Public Demo because it could expose provider, model, deployment, or production-only controls.");
        return;
      }
      setView(nextView);
      if (nextView !== "campaigns") setSelectedCampaignId(null);
      return;
    }
    if (nextView === "welcome-access") {
      setView(nextView);
      setAuthReviewBaselineDigest(state ? authoritativeStateDigest(state) : "");
      setAuthExperience((current) => transitionAuthExperience(current, { type: "open_welcome" }));
      setSelectedCampaignId(null);
      setTestingContext(null);
      return;
    }
    if (!authExperience.mode.startsWith("authenticated_")) {
      setAuthReviewBaselineDigest(state ? authoritativeStateDigest(state) : "");
      setAuthExperience((current) => transitionAuthExperience(current, { type: "protected_route_requested", view: nextView }));
      setView("welcome-access");
      setSelectedCampaignId(null);
      setTestingContext(null);
      setFormRequest(null);
      return;
    }
    setView(nextView);
    if (nextView !== "campaigns") setSelectedCampaignId(null);
    if (nextView === "testing") setTestingContext(null);
  }

  function handleAuthExperience(event: AuthExperienceEvent) {
    if (state && ["open_welcome", "open_about", "open_login", "open_gallery", "enter_demo", "protected_route_requested"].includes(event.type)) {
      setAuthReviewBaselineDigest(authoritativeStateDigest(state));
    }
    setAuthExperience((current) => transitionAuthExperience(current, event));
    setSelectedCampaignId(null);
    setTestingContext(null);
    setFormRequest(null);
    setError(null);
    if (event.type === "enter_demo") {
      setDemoState(buildGovernedPublicDemoState());
      setDemoScenario("normal");
      setView("overview");
    } else if (event.type === "exit_demo") {
      setDemoState(null);
      setDemoScenario("normal");
      setView("welcome-access");
    } else if (event.type === "authenticate_test") {
      setDemoState(null);
      setView("overview");
    } else setView("welcome-access");
  }

  async function loginLive(emailAddress: string, password: string): Promise<BrowserAuthResult> {
    const result = await liveAuthenticationClient.login(emailAddress, password);
    setLiveAuthResult(result);
    if (result.receipt?.allowed && result.receipt.status === "authenticated") {
      setAuthExperience((current) => transitionAuthExperience(current, { type: "authenticate_live" }));
      setDemoState(null);
      const usable = await activateHostedState();
      setView(usable ? "overview" : "welcome-access");
    }
    return result;
  }

  async function logoutLive(): Promise<BrowserAuthResult> {
    const result = await liveAuthenticationClient.logoutCurrent();
    setLiveAuthResult(result);
    if (result.receipt?.allowed && result.receipt.status === "signed_out") {
      resetToPreCutoverPersistence();
      setAuthExperience((current) => transitionAuthExperience(current, { type: "live_session_lost", message: "The current server-authenticated session ended." }));
      setView("welcome-access");
    }
    return result;
  }

  async function revokeAllLive(): Promise<BrowserAuthResult> {
    const result = await liveAuthenticationClient.revokeAll();
    setLiveAuthResult(result);
    if (result.receipt?.allowed && result.receipt.status === "signed_out") {
      resetToPreCutoverPersistence();
      setAuthExperience((current) => transitionAuthExperience(current, { type: "live_session_lost", message: "All server-authenticated sessions were revoked." }));
      setView("welcome-access");
    }
    return result;
  }

  function logoutTestSession() {
    resetToPreCutoverPersistence();
    setAuthExperience((current) => transitionAuthExperience(current, { type: "logout" }));
    setView("welcome-access");
    setSelectedCampaignId(null);
    setTestingContext(null);
    setFormRequest(null);
  }

  async function recoverLive(emailAddress: string): Promise<BrowserAuthResult> {
    const result = await liveAuthenticationClient.requestRecovery(emailAddress);
    setLiveAuthResult(result);
    return result;
  }

  async function changePasswordLive(newPassword: string): Promise<BrowserAuthResult> {
    const result = await liveAuthenticationClient.changePassword(newPassword);
    setLiveAuthResult(result);
    if (result.receipt?.allowed && result.receipt.status === "signed_out") {
      resetToPreCutoverPersistence();
      setAuthExperience((current) => transitionAuthExperience(current, { type: "live_session_lost", message: "The CASTRA password was updated. Sign in with the new password." }));
      setView("welcome-access");
    }
    return result;
  }

  async function stepUpLive(input: {
    emailAddress: string;
    password: string;
    currentIdentityReference: string;
    sensitiveAction: "foundation_manifest_change" | "authentication_policy_change" | "authority_change" | "production_template_activation";
  }): Promise<BrowserAuthResult> {
    const result = await liveAuthenticationClient.stepUp(input);
    setLiveAuthResult(result);
    return result;
  }

  function openCampaign(id: string, section: CampaignWorkspaceSection = "summary", checkpointId: string | null = null) {
    setView("campaigns");
    setSelectedCampaignId(id);
    setCampaignSection(section);
    setReviewFocusId(checkpointId);
  }

  function engageSarge(target: SargeEngagementTarget) {
    if (reviewSession) {
      setError("UI Review Mode is read-only; SARGE engagement records cannot be created from the fixture.");
      return;
    }
    if (authExperience.mode === "demo") {
      setError("Public Demo cannot create SARGE requests or reach runtimes. Sign in through an approved deployment to use governed proposal records.");
      return;
    }
    if (!authExperience.mode.startsWith("authenticated_")) {
      setError("An authenticated Commander session is required to create a governed SARGE engagement request.");
      return;
    }
    setSargeTarget(target);
    setView("sarge-engagement");
    setSelectedCampaignId(null);
    setError(null);
  }

  function returnFromSarge() {
    if (sargeTarget.type === "command_overview") return navigate("overview");
    if (sargeTarget.type === "campaign") return openCampaign(sargeTarget.id);
    return openGraphSource(sargeTarget.type, sargeTarget.id);
  }

  function openTesting(link: WorkLink) {
    setTestingContext(link);
    const working = displayState ?? state;
    const campaignId = link.type === "campaign"
      ? link.id
      : link.type === "mission"
        ? working?.missions.find((mission) => mission.id === link.id)?.campaignId
        : (() => {
            const action = working?.actions.find((item) => item.id === link.id);
            return action ? working?.missions.find((mission) => mission.id === action.missionId)?.campaignId : undefined;
          })();
    if (!campaignId) {
      setError("The linked test context has no governing Campaign in this source-backed workspace.");
      return;
    }
    setSelectedCampaignId(campaignId);
    setCampaignSection("testing");
    setReviewFocusId(null);
    setView("campaigns");
  }

  function openGraphSource(sourceType: string, sourceId: string) {
    const working = displayState ?? state;
    if (!working) return;
    if (sourceType === "campaign") return openCampaign(sourceId);
    if (sourceType === "mission") {
      const mission = working.missions.find((item) => item.id === sourceId);
      if (mission) return openCampaign(mission.campaignId);
    }
    if (sourceType === "action") {
      const action = working.actions.find((item) => item.id === sourceId);
      const mission = action && working.missions.find((item) => item.id === action.missionId);
      if (mission) return openCampaign(mission.campaignId);
    }
    if (sourceType === "ui_review_checkpoint") {
      const checkpoint = working.uiReviewCheckpoints.find((item) => item.id === sourceId);
      const plan = checkpoint && working.uiReviewPlans.find((item) => item.id === checkpoint.planId);
      if (plan) return openCampaign(plan.campaignId, "testing", checkpoint?.id ?? null);
    }
    const testPlan = sourceType === "test_plan" ? working.testPlans.find((item) => item.id === sourceId) : null;
    if (testPlan?.link.type === "campaign") return openCampaign(testPlan.link.id, "testing");
    setError("The graph source remains selected in the read-only inspector; no supported governing-record route was available.");
  }

  if (!state) {
    return <main className="loading-screen"><div className="brand-mark"><span>C</span></div><p>Opening local command post…</p><span className="shell-system-identity shell-system-identity-loading">Command Agentic System for Tactical Readiness &amp; Automation</span>{error && <span className="error-banner">{error}</span>}</main>;
  }

  const visibleState = displayState ?? state;
  /**
   * The authority contract is supplied only to an authenticated live board.
   * Public Demo and UI Review receive no callback at all, so no synthetic
   * surface can reach the authoritative client even by mistake.
   */
  const sessionBoardAuthority = sessionBoardAuthenticated
    ? buildSessionBoardAuthority({
      view: sessionBoardAuthorityView,
      gate: sessionBoardAuthorityGate,
      onAuthorize: (selectedProposalIds) => void authorizeSessionBoardSelection(selectedProposalIds),
      onReconcile: () => void reconcileSessionBoardAllocationCommand(),
    })
    : undefined;
  /**
   * ACT-c1c2989b / C001.M017.A001 — display-only inputs for the visible
   * `SessionPlanDraftSurface`. Every value here is derived, not stored: the
   * ephemeral draft itself lives in the `webMcpDraftRef`/`webMcpDraft` pair
   * above, and this only decides what is safe to show for the exact page the
   * Commander is currently looking at.
   *
   * `webMcpDisplayDraft` guards against a leftover cross-mode draft — for
   * example one drafted in Public Demo and never discarded before the
   * Commander authenticated — by showing it only when its own `mode` still
   * matches the exact active `webMcpMode`, the same rule `readCurrentDraft` in
   * `src/webmcp/registration.ts` already applies to a tool call.
   */
  const webMcpProposalSurfaceAvailable = webMcpMode === "authenticated_live" || webMcpMode === "public_demo";
  const webMcpProposalUnavailableReason = webMcpProposalSurfaceAvailable
    ? null
    : webMcpMode === "review"
      ? "Review Mode is read-only, so the Session Work Plan draft surface is not bound here."
      : "The Session Work Plan draft surface is bound only in the authenticated live and Public Demo experiences.";
  const webMcpDisplayDraft = webMcpDraft && webMcpMode && webMcpDraft.mode === webMcpMode ? webMcpDraft : null;
  const webMcpDisplaySnapshot: WebMcpStateSnapshot | null = webMcpAuthority && displayState
    ? {
        authority: webMcpAuthority,
        campaigns: displayState.campaigns,
        missions: displayState.missions,
        actions: displayState.actions,
        openWorkIndex: displayState.openWorkIndex,
        missionOpenWorkRollups: displayState.missionOpenWorkRollups,
      }
    : null;
  const webMcpPlanReview = computeWebMcpPlanReview(webMcpDisplayDraft, webMcpDisplaySnapshot);
  /**
   * The public projection handed to Command Overview. It exists only while a
   * WebMCP experience is bound, so a page with no registered tool surface
   * renders exactly as before. Each step is rebuilt field by field from the
   * sanitized event, so the component receives no object it could over-render.
   */
  const webMcpActivityView: CommandOverviewWebMcpActivity | undefined = webMcpMode
    ? {
        expectedReadOnlyTools: WEBMCP_OBSERVED_READ_ONLY_TOOLS,
        steps: webMcpActivity.map((event) => ({
          sequence: event.sequence,
          tool: event.tool,
          classification: event.classification,
          outcome: event.outcome,
        })),
      }
    : undefined;
  const shellPresentationState = reviewSession || authExperience.mode.startsWith("authenticated_") || authExperience.mode === "demo" ? visibleState : emptyState();
  const presentation = currentPresentation(shellPresentationState);
  const activeTheme = themeProfile(presentation.themeProfileId);
  const comicCommandDemo = authExperience.mode === "demo" && activeTheme.id === "comic_command";
  const galacticCommandDemo = authExperience.mode === "demo" && activeTheme.id === "galactic_command_bridge";
  const commanderDisplay = presentRole(shellPresentationState, "COMMANDER_PRODUCT_OWNER", "full_name");
  const currentAuthoritativeDigest = authoritativeStateDigest(state);
  const welcomeState = authExperience.mode.startsWith("authenticated_") ? visibleState : emptyState();
  const welcomeDigest = authExperience.mode === "demo" ? "not-provided-to-demo" : currentAuthoritativeDigest;
  const welcomeBaseline = authExperience.mode === "demo" ? "not-provided-to-demo" : authReviewBaselineDigest || currentAuthoritativeDigest;
  const preauthenticationBoundary = liveAuthResult.availability === "configured"
    ? "UNAUTHENTICATED · SERVER AUTH READY"
    : liveAuthResult.availability === "wrong_origin"
      ? "UNAUTHENTICATED · WRONG CASTRA ORIGIN"
      : liveAuthResult.availability === "checking"
        ? "UNAUTHENTICATED · CHECKING SERVER AUTH"
        : "UNAUTHENTICATED · PROVIDER NOT CONFIGURED";
  const accessLabel = reviewSession
    ? "UI-03 · REVIEW ONLY"
    : authExperience.mode === "authenticated_test"
      ? "TEST AUTH · NO PROVIDER"
      : authExperience.mode === "authenticated_live"
        ? "SERVER AUTH · COMMANDER"
        : authExperience.mode === "demo"
          ? "PUBLIC DEMO · MEMORY ONLY"
          : "NO SESSION · LOCAL UI";
  const campaignOrder = visibleState.campaigns.filter((campaign) => !campaign.archivedAt);
  const selectedCampaignIndex = selectedCampaign ? campaignOrder.findIndex((campaign) => campaign.id === selectedCampaign.id) : -1;
  const previousCampaign = selectedCampaignIndex > 0 ? campaignOrder[selectedCampaignIndex - 1] : null;
  const nextCampaign = selectedCampaignIndex >= 0 && selectedCampaignIndex < campaignOrder.length - 1 ? campaignOrder[selectedCampaignIndex + 1] : null;
  const pageContentViewLabel = POST_LOGIN_NAVIGATION.find((item) => item.view === view)?.label ?? humanize(view);

  if (usesPreAuthenticationShell(authExperience, Boolean(reviewSession)) && authExperience.mode !== "demo") {
    return (
      <div className="preauth-shell" data-auth-shell="pre-authentication" data-theme={activeTheme.id} data-density={activeTheme.tokens.density} style={semanticThemeVariables(activeTheme) as CSSProperties}>
        <header className="preauth-masthead">
          <div className="preauth-brand" aria-label="CASTRA">
            <div className="brand-mark"><span>C</span></div>
            <div><strong>CASTRA</strong><span>Deterministic mission command</span></div>
          </div>
          <div className="preauth-boundary" role="status">
            <span className="online-dot auth-dot-idle" />
            <span>{preauthenticationBoundary}</span>
          </div>
        </header>
        <main className="preauth-content">
          <WelcomeAccessWorkspace
            state={welcomeState}
            experience={authExperience}
            dispatch={handleAuthExperience}
            openCommandOverview={() => navigate("overview")}
            authoritativeDigest={welcomeDigest}
            reviewBaselineDigest={welcomeBaseline}
            liveAuthResult={liveAuthResult}
            loginLive={loginLive}
            recoverLive={recoverLive}
            changePasswordLive={changePasswordLive}
          />
        </main>
        <footer className="preauth-footer">
          <span>Super L Works · Product development experience</span>
          <span>{liveAuthResult.availability === "configured"
            ? "Server authentication boundary ready · provider proof required"
            : liveAuthResult.availability === "wrong_origin"
              ? `Wrong CASTRA address · use ${CANONICAL_COMMANDER_ORIGIN}`
              : "Local deterministic UI proof · no configured live provider"}</span>
          <span className="shell-system-identity shell-system-identity-preauth">Command Agentic System for Tactical Readiness &amp; Automation</span>
        </footer>
        {error && <div className="toast" role="alert"><span>{error}</span><button aria-label="Dismiss" onClick={() => setError(null)}>×</button></div>}
      </div>
    );
  }

  return (
    <div className={`app-shell ${reviewSession ? "review-mode" : ""} ${authExperience.mode === "demo" ? "public-demo-mode" : ""} ${comicCommandDemo ? "comic-command-demo" : ""} ${galacticCommandDemo ? "galactic-command-demo" : ""}`} data-theme={activeTheme.id} data-density={activeTheme.tokens.density} style={semanticThemeVariables(activeTheme) as CSSProperties}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><span>C</span></div>
          <div><strong>CASTRA</strong><span>{comicCommandDemo ? "Comic Command" : galacticCommandDemo ? "Galactic Command Bridge" : "Mission Command"}</span></div>
        </div>
        <div className="environment"><span className={`online-dot ${reviewSession || authExperience.mode.startsWith("authenticated_") ? "" : "auth-dot-idle"}`} /> {accessLabel}</div>
        <nav aria-label="Primary navigation">
          <span className="nav-caption">{comicCommandDemo ? "League dispatch" : galacticCommandDemo ? "Command sectors" : "Command post"}</span>
          {POST_LOGIN_NAVIGATION.filter((item) => {
            if (item.view === "troop-welfare") return false;
            if (item.view === "decision-inbox") return authExperience.mode === "authenticated_live" && !reviewSession;
            return authExperience.mode !== "demo" || (DEMO_NAVIGATION_VIEWS as readonly string[]).includes(item.view);
          }).map((item) => (
            <button
              key={item.view}
              className={view === item.view ? "active" : ""}
              onClick={() => navigate(item.view)}
            >
              <span className="nav-glyph">{item.glyph}</span>{item.label}
            </button>
          ))}
          <div className="nav-lower-group" role="group" aria-label="Troop welfare navigation">
            <span className="nav-caption">Troop welfare</span>
            {POST_LOGIN_NAVIGATION.filter((item) => item.view === "troop-welfare" && (authExperience.mode !== "demo" || (DEMO_NAVIGATION_VIEWS as readonly string[]).includes(item.view))).map((item) => (
              <button
                key={item.view}
                className={view === item.view ? "active" : ""}
                onClick={() => navigate(item.view)}
              >
                <span className="nav-glyph">{item.glyph}</span>{item.label}
              </button>
            ))}
          </div>
        </nav>
        {authExperience.mode === "demo" && <button className="demo-exit-sidebar" onClick={() => handleAuthExperience({ type: "exit_demo" })}>Exit Demo · discard changes</button>}
        <div className="sidebar-footer">
          <span>Persistence</span>
          <strong><span className="online-dot" /> {authExperience.mode === "demo" ? "Memory only" : persistenceMode === "loaded" ? "Hosted state ready" : persistenceMode === "checking_hosted" ? "Checking hosted state" : persistenceMode === "disabled_pre_cutover" ? "Hosted state not activated" : `Hosted state ${persistenceMode}`}</strong>
          <small>{authExperience.mode === "demo" ? "Reload/exit restores bundled baseline" : persistenceMode === "disabled_pre_cutover" ? "Not operational authority · local candidate" : savedAt ? `Hosted save ${dateLabel(savedAt)}` : "No unsaved changes"}</small>
          {freshnessNotice && authExperience.mode !== "demo" && <small role="status" data-hosted-freshness="review-again">{freshnessNotice}</small>}
        </div>
        <footer className="shell-system-identity" aria-label="System identity">Command Agentic System for Tactical Readiness &amp; Automation</footer>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-context"><span className="topbar-kicker">{comicCommandDemo ? "DEMO / FOUR-COLOR COMMAND" : galacticCommandDemo ? "DEMO / GALACTIC COMMAND BRIDGE" : "SLW / OPERATIONS"}</span><strong>{comicCommandDemo ? "Issue No. 1 · public proving ground" : galacticCommandDemo ? "Bridge operations display · presentation only" : "Release 1 proving ground"}</strong></div>
          <div className="topbar-actions">
            <div className="authority" title={authExperience.mode.startsWith("authenticated_") ? commanderDisplay.accessibleTitle : "No production identity or authority is active."}>
              <span>{authExperience.mode.startsWith("authenticated_") ? "AUTHORITY · COMMANDER / PRODUCT OWNER" : authExperience.mode === "demo" ? "PUBLIC DEMO · UNAUTHENTICATED" : "ACCESS · NO AUTHENTICATED SESSION"}</span>
              <strong>{authExperience.mode.startsWith("authenticated_") ? commanderDisplay.displayName : authExperience.mode === "demo" ? comicCommandDemo ? "LEAGUE ROSTER · PRESENTATION ONLY" : galacticCommandDemo ? "BRIDGE ROSTER · PRESENTATION ONLY" : "DEMONSTRATION ONLY" : "WELCOME"}</strong>
            </div>
            <AuthenticatedSessionAccess
              mode={authExperience.mode}
              liveAuthResult={liveAuthResult}
              handlers={{ logoutLive, revokeAllLive, stepUpLive, logoutTest: logoutTestSession }}
            />
          </div>
        </header>
        {reviewSession && <ReviewModeBanner session={reviewSession} currentDigest={currentAuthoritativeDigest} changeScenario={changeReviewScenario} exit={exitUI03Review} />}
        {authExperience.mode === "demo" && <section className="demo-mode-banner compact-demo-banner" role="status" aria-label="Public Demo. Changes are temporary and are not saved."><strong>{comicCommandDemo ? "COMIC COMMAND DEMO · NO SAVE" : galacticCommandDemo ? "GALACTIC BRIDGE DEMO · NO SAVE" : "PUBLIC DEMO · NO SAVE"}</strong><span>{comicCommandDemo ? "Presentation-only panels; facts unchanged." : galacticCommandDemo ? "Presentation-only console; facts unchanged." : "Temporary, isolated changes."}</span><label>State<select value={demoScenario} onChange={(event) => { setDemoScenario(event.target.value as UIReviewScenario); setSelectedCampaignId(null); setCampaignSection("summary"); }}><option value="normal">Normal · C001</option><option value="dense">Dense · C001</option><option value="blocked">Blocked mechanic</option><option value="exception">Exception mechanic</option><option value="empty">Empty mechanic</option></select></label><small className="visually-hidden">No identity, production data, provider, model, connector, deployment, browser persistence, file, or server write is available. Reload or exit restores the bundled baseline. Simulated mechanics do not change C001 facts.</small></section>}
        {initialImportControlVisible({ mode: authExperience.mode, availability: persistenceMode, pendingCommand: authoritativeWriteBlock.blocked, receipt: liveAuthResult.receipt }) && (
          <section className="initial-import-control" aria-labelledby="initial-import-title">
            <div>
              <span className="eyebrow">Governed one-time control · hosted revision 0</span>
              <h2 id="initial-import-title">Initialize CASTRA from an approved Notion high-water package</h2>
              <p>Select the separate version-2 raw export and Commander-approved manifest. CASTRA verifies exact bytes, canonical content, complete hierarchy, data-bound counts, deterministic schema-13 state, and an exact-manifest Product Owner proof. Historical A020, browser, Demo, bundled, identity, and secret state are never accepted.</p>
            </div>
            {!initialImportReview ? (
              <div className="initial-import-review">
                <label className="initial-import-file">
                  <span>Version-2 raw export JSON</span>
                  <input type="file" accept="application/json,.json" disabled={hostedStateControlBusy} onChange={(event) => setInitialImportExportFile(event.currentTarget.files?.[0] ?? null)} />
                </label>
                <label className="initial-import-file">
                  <span>Approved high-water manifest JSON</span>
                  <input type="file" accept="application/json,.json" disabled={hostedStateControlBusy} onChange={(event) => setInitialImportManifestFile(event.currentTarget.files?.[0] ?? null)} />
                </label>
                <small>{hostedStateControlBusy ? "Verifying exact package…" : "Review verifies both artifacts only; it does not dispatch a hosted-state write."}</small>
                <button className="button button-primary" type="button" disabled={!initialImportExportFile || !initialImportManifestFile || hostedStateControlBusy} onClick={() => void reviewInitialHostedImport(initialImportExportFile, initialImportManifestFile)}>Review exact package</button>
              </div>
            ) : (
              <form className="initial-import-review" aria-label="Initial import confirmation evidence" onSubmit={(event) => { event.preventDefault(); void confirmInitialHostedImport(event.currentTarget); }}>
                <strong>Exact package verified · confirmation required</strong>
                <dl>
                  <div><dt>Records</dt><dd>{initialImportReview.evidence.counts.totalRecords} · {initialImportReview.evidence.counts.campaigns} Campaign · {initialImportReview.evidence.counts.missions} Missions · {initialImportReview.evidence.counts.actions} Actions</dd></div>
                  <div><dt>Expected revision</dt><dd>0 → 1 only</dd></div>
                  <div><dt>Converter</dt><dd><code>{initialImportReview.evidence.converterVersion}</code></dd></div>
                  <div><dt>Manifest</dt><dd><code>{initialImportReview.evidence.manifestDigest}</code></dd></div>
                  <div><dt>Source artifact</dt><dd><code>{initialImportReview.evidence.sourceArtifactDigest}</code></dd></div>
                  <div><dt>Canonical export</dt><dd><code>{initialImportReview.evidence.exportDigest}</code></dd></div>
                  <div><dt>Normalized state</dt><dd><code>{initialImportReview.evidence.normalizedStateDigest}</code></dd></div>
                  <div><dt>Request binding</dt><dd><code>{initialImportReview.evidence.requestBindingDigest}</code></dd></div>
                  <div><dt>Authority receipt</dt><dd><code>{initialImportReview.evidence.authorityReceiptDigest}</code> · private identity omitted</dd></div>
                  <div><dt>Provider receipt</dt><dd>Pending explicit confirmation</dd></div>
                </dl>
                <label>Email address<input name="emailAddress" type="email" autoComplete="username" required disabled={hostedStateControlBusy} /></label>
                <label>Password<input name="password" type="password" autoComplete="current-password" required disabled={hostedStateControlBusy} /></label>
                <label className="check-label"><input type="checkbox" checked={initialImportConfirmed} onChange={(event) => setInitialImportConfirmed(event.target.checked)} /> Import this exact package once as hosted revision 1. This initializes CASTRA's authoritative hosted operational state.</label>
                <div className="initial-import-actions">
                  <button className="button button-quiet" type="button" disabled={hostedStateControlBusy} onClick={() => { setInitialImportReview(null); setInitialImportConfirmed(false); }}>Cancel review</button>
                  <button className="button button-primary" type="submit" disabled={!initialImportConfirmed || hostedStateControlBusy}>{hostedStateControlBusy ? "Verifying proof and committing…" : "Prove authority and initialize revision 1"}</button>
                </div>
              </form>
            )}
          </section>
        )}
        {postHighWaterReconciliationControlVisible({ mode: authExperience.mode, availability: persistenceMode, pendingCommand: authoritativeWriteBlock.blocked, revision: hostedStateRepository.currentRevision(), receipt: liveAuthResult.receipt }) && (
          <section className="initial-import-control" aria-labelledby="post-high-water-title">
            <div>
              <span className="eyebrow">Governed one-time control · hosted revision 1 → 2</span>
              <h2 id="post-high-water-title">Reconcile the approved A041–A050 post-high-water delta</h2>
              <p>Select the exact terminal A050 differential package. CASTRA verifies the bounded artifact against the approved A040 baseline, the ten terminal A041–A050 records, and the exact revision-2 result before any hosted write is prepared. The approved A040 base and provider history are never altered.</p>
            </div>
            {!postHighWaterReview ? (
              <div className="initial-import-review">
                <label className="initial-import-file">
                  <span>Terminal A041–A050 differential package JSON</span>
                  <input type="file" accept="application/json,.json" disabled={hostedStateControlBusy} onChange={(event) => setPostHighWaterFile(event.currentTarget.files?.[0] ?? null)} />
                </label>
                <small>{hostedStateControlBusy ? "Verifying exact package…" : "Review verifies the exact package only; it does not dispatch a hosted-state write."}</small>
                <button className="button button-primary" type="button" disabled={!postHighWaterFile || hostedStateControlBusy} onClick={() => void reviewPostHighWaterReconciliation(postHighWaterFile)}>Review exact package</button>
              </div>
            ) : (
              <form className="initial-import-review" aria-label="Post-high-water reconciliation confirmation evidence" onSubmit={(event) => { event.preventDefault(); void confirmPostHighWaterReconciliation(); }}>
                <strong>Exact package verified · confirmation required</strong>
                <dl>
                  <div><dt>Records</dt><dd>{postHighWaterReview.candidate.counts.totalRecords} · {postHighWaterReview.candidate.counts.campaigns} Campaign · {postHighWaterReview.candidate.counts.missions} Missions · {postHighWaterReview.candidate.counts.actions} Actions · {postHighWaterReview.candidate.counts.completedActions} completed</dd></div>
                  <div><dt>Expected revision</dt><dd>1 → 2 only</dd></div>
                  <div><dt>Open Actions after reconciliation</dt><dd><code>{postHighWaterReview.candidate.exactOpenActionSet.join(", ")}</code></dd></div>
                  <div><dt>Source artifact</dt><dd><code>{postHighWaterReview.candidate.sourceArtifactDigest}</code></dd></div>
                  <div><dt>Package canonical</dt><dd><code>{postHighWaterReview.candidate.packageCanonicalDigest}</code></dd></div>
                  <div><dt>Base state</dt><dd><code>{postHighWaterReview.candidate.baseStateDigest}</code></dd></div>
                  <div><dt>Resulting state</dt><dd><code>{postHighWaterReview.candidate.resultingStateDigest}</code></dd></div>
                  <div><dt>Request binding</dt><dd><code>{postHighWaterReview.prepared.requestBindingDigest}</code></dd></div>
                  <div><dt>Provider receipt</dt><dd>Pending explicit confirmation</dd></div>
                </dl>
                <label className="check-label"><input type="checkbox" checked={postHighWaterConfirmed} onChange={(event) => setPostHighWaterConfirmed(event.target.checked)} /> Apply this exact package once as hosted revision 2. This updates CASTRA's authoritative hosted operational state.</label>
                <div className="initial-import-actions">
                  <button className="button button-quiet" type="button" disabled={hostedStateControlBusy} onClick={() => { setPostHighWaterReview(null); setPostHighWaterConfirmed(false); }}>Cancel review</button>
                  <button className="button button-primary" type="submit" disabled={!postHighWaterConfirmed || hostedStateControlBusy}>{hostedStateControlBusy ? "Committing…" : "Apply reconciliation as revision 2"}</button>
                </div>
              </form>
            )}
          </section>
        )}
        {view === "configuration" && hostedStateEvidenceExportControlVisible({ mode: authExperience.mode, availability: persistenceMode, receipt: liveAuthResult.receipt }) && (
          <section className="initial-import-control" aria-labelledby="hosted-state-evidence-title">
            <div>
              <span className="eyebrow">Read-only Commander control · hosted revision {loadedHostedStateResult?.revision ?? hostedStateRepository.currentRevision()}</span>
              <h2 id="hosted-state-evidence-title">Export the loaded hosted state as a verification evidence artifact</h2>
              <p>Saves the hosted result already loaded in this authenticated session as one canonical JSON file with stable key ordering, so an independent FIREWATCH can hash it and recheck revision, digest, counts, and the exact open Action set offline. No command is dispatched, no hosted write is prepared, and no identity, token, cookie, or provider value is included.</p>
            </div>
            <div className="initial-import-review">
              <dl>
                <div><dt>Revision</dt><dd>{loadedHostedStateResult?.revision ?? hostedStateRepository.currentRevision()}</dd></div>
                <div><dt>State digest</dt><dd><code>{loadedHostedStateResult?.stateDigest ?? "not loaded"}</code></dd></div>
                <div><dt>Capture boundary</dt><dd>commander_browser_readonly · no mutation · no command</dd></div>
              </dl>
              <small>{evidenceCaptureNotice ?? "The file is produced from memory only; it never re-reads the provider and never changes hosted state."}</small>
              <button className="button button-primary" type="button" disabled={!loadedHostedStateResult} onClick={() => void exportHostedStateEvidence()}>Export hosted state evidence</button>
            </div>
          </section>
        )}
        {authExperience.mode === "authenticated_live" && pendingHostedCommand && (
          <section className="demo-mode-banner compact-demo-banner" role="alert" aria-label="Unknown hosted-state command requires reconciliation.">
            <strong>HOSTED OUTCOME UNKNOWN · COMMANDS BLOCKED</strong>
            <span>{pendingHostedCommand.command.commandType === "restore" ? "Recovery" : pendingHostedCommand.command.commandType === "initial_import" ? "Initial import" : "Write"} retained at expected revision {pendingHostedCommand.command.expectedRevision}. No raw source is displayed, no automatic retry occurred, and no new key was created.</span>
            {pendingHostedCommand.command.commandType === "initial_import" ? (
              <form onSubmit={(event) => { event.preventDefault(); void reconcileHostedStateCommand(event.currentTarget); }}>
                <span>Renew Product Owner proof for the exact retained manifest, then reconcile the identical escrowed body and idempotency key.</span>
                <label>Email address<input name="emailAddress" type="email" autoComplete="username" required disabled={hostedStateControlBusy} /></label>
                <label>Password<input name="password" type="password" autoComplete="current-password" required disabled={hostedStateControlBusy} /></label>
                <button className="button button-primary" type="submit" disabled={hostedStateControlBusy}>{hostedStateControlBusy ? "Reconciling…" : "Renew proof and reconcile exact import"}</button>
              </form>
            ) : (
              <button className="button button-primary" disabled={hostedStateControlBusy} onClick={() => void reconcileHostedStateCommand()}>
                {hostedStateControlBusy ? "Reconciling…" : "Reconcile exact command"}
              </button>
            )}
          </section>
        )}
        {authExperience.mode === "authenticated_live" && persistenceMode === "loaded" && !authoritativeWriteBlock.blocked && hostedStateRepository.currentRevision() > 1 && (
          <details className="demo-mode-banner compact-demo-banner">
            <summary>Governed hosted-state recovery</summary>
            <form onSubmit={(event) => { event.preventDefault(); void recoverHostedOperationalState(event.currentTarget); }}>
              <span>Current immutable revision: {hostedStateRepository.currentRevision()}. Recovery appends a new revision; it never rewrites history.</span>
              <label>Earlier target revision<input type="number" min="1" max={hostedStateRepository.currentRevision() - 1} step="1" required value={recoveryTargetRevision} onChange={(event) => setRecoveryTargetRevision(event.target.value)} /></label>
              <label>Product Owner email<input name="emailAddress" type="email" autoComplete="username" required /></label>
              <label>Current password<input name="password" type="password" autoComplete="current-password" required /></label>
              <label className="check-label"><input type="checkbox" required /> Append the selected historical state as a new immutable revision.</label>
              <button className="button button-primary" type="submit" disabled={hostedStateControlBusy}>{hostedStateControlBusy ? "Verifying…" : "Verify Product Owner and recover"}</button>
            </form>
          </details>
        )}
        <fieldset className="page-content" disabled={Boolean(reviewSession && view !== "ui-reviews")} inert={Boolean(reviewSession && view !== "ui-reviews")}>
          {view !== "overview" && view !== "welcome-access" && <nav className="page-tree-nav" aria-label="Page hierarchy navigation"><button onClick={() => navigate("overview")}>← Command Overview</button>{view === "campaigns" && <button onClick={() => { setSelectedCampaignId(null); setCampaignSection("summary"); setReviewFocusId(null); }}>All Campaigns</button>}{selectedCampaign && previousCampaign && <button onClick={() => openCampaign(previousCampaign.id)}>Previous: {previousCampaign.title}</button>}{selectedCampaign && nextCampaign && <button onClick={() => openCampaign(nextCampaign.id)}>Next: {nextCampaign.title}</button>}<span aria-current="page">{selectedCampaign?.title ?? POST_LOGIN_NAVIGATION.find((item) => item.view === view)?.label ?? humanize(view)}</span></nav>}
          <PageContentErrorBoundary key={view} viewLabel={pageContentViewLabel}>
          {view === "overview" && (
            <CommandOverview state={visibleState} openCampaign={openCampaign} openPortfolio={() => { setView("campaigns"); setSelectedCampaignId(null); }} openSource={openGraphSource} createCampaign={() => setFormRequest({ mode: "create", entityType: "campaign" })} engageSarge={engageSarge} demoMode={authExperience.mode === "demo"} webMcpActivity={webMcpActivityView} />
          )}
          {view === "welcome-access" && <WelcomeAccessWorkspace
            state={welcomeState}
            experience={authExperience}
            dispatch={handleAuthExperience}
            openCommandOverview={() => navigate("overview")}
            authoritativeDigest={welcomeDigest}
            reviewBaselineDigest={welcomeBaseline}
            liveAuthResult={liveAuthResult}
            loginLive={loginLive}
            recoverLive={recoverLive}
            changePasswordLive={changePasswordLive}
          />}
          {view === "campaigns" && !selectedCampaign && (
            <>
              <div className="page-heading sticky-page-heading"><div><span className="eyebrow">{reviewSession ? "Synthetic review portfolio" : "Authoritative portfolio"}</span><h1>Campaigns</h1><p>{reviewSession ? "Inspect the fixed UI-03 hierarchy; all controls are disabled." : "Open a Campaign to manage its Missions and Actions."}</p></div><button className="button button-primary" onClick={() => setFormRequest({ mode: "create", entityType: "campaign" })}>＋ New Campaign</button></div>
              <label className="toggle campaign-toggle"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /> Show archived</label>
              <div className="record-list">
                {visibleState.campaigns.filter((campaign) => includeArchived || !campaign.archivedAt).map((campaign) => (
                  <button className="record-list-item" key={campaign.id} onClick={() => openCampaign(campaign.id)}>
                    <PresentationRecordIdentity recordType="campaign" id={campaign.id} /><strong>{campaign.title}</strong><StatusBadge record={campaign} /><span>→</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {view === "campaigns" && selectedCampaign && (
            <CampaignWorkspace state={visibleState} campaign={selectedCampaign} section={campaignSection} setSection={setCampaignSection} includeArchived={includeArchived} setIncludeArchived={setIncludeArchived} execute={execute} directClose={executeTier1DirectActionClose} directCloseAvailable={authExperience.mode === "authenticated_live" && Boolean(liveAuthResult.receipt?.allowed && liveAuthResult.receipt.authorities.includes("Commander")) && !reviewSession && persistenceMode === "loaded" && !authoritativeWriteBlock.blocked} directCloseBusy={hostedStateControlBusy} stagingBusy={hostedStateControlBusy} openForm={setFormRequest} openTesting={openTesting} testingContext={testingContext} reviewFocusId={reviewFocusId} setReviewFocusId={setReviewFocusId} engageSarge={engageSarge} demoMode={authExperience.mode === "demo"} />
          )}
          {view === "session-board" && (
            <>
              <SessionBoard
                scenario={sessionBoardScenario}
                fixture={sessionBoardFixture}
                allowRehearsal={authExperience.mode === "demo"}
                authority={sessionBoardAuthority}
              />
              <SessionPlanDraftSurface
                available={webMcpProposalSurfaceAvailable}
                unavailableReason={webMcpProposalUnavailableReason}
                draft={webMcpDisplayDraft}
                review={webMcpPlanReview}
                reversalNote={WEBMCP_DRAFT_REVERSAL_NOTE}
                onDiscard={discardWebMcpDraft}
                onOpenGovernedClosure={() => navigate("governed-closure")}
              />
            </>
          )}
          {view === "testing" && <TestingWorkspace state={visibleState} context={testingContext} execute={execute} />}
          {view === "ui-reviews" && <UIReviewWorkspace state={visibleState} execute={execute} reviewMode={Boolean(reviewSession)} reviewScenario={reviewSession?.scenario ?? null} enterReviewMode={startUI03Review} openReviewTarget={openReviewTarget} />}
          {view === "aerarium" && <AerariumWorkspace state={visibleState} execute={execute} />}
          {view === "graph" && <GraphWorkspace state={visibleState} openSource={openGraphSource} />}
          {view === "configuration" && <ConfigurationWorkspace
            state={visibleState}
            execute={execute}
            demoMode={authExperience.mode === "demo"}
            connection={configurationConnectionForApp({
              synthetic: authExperience.mode === "demo" || Boolean(reviewSession),
              authenticatedLive: authExperience.mode === "authenticated_live",
              availability: persistenceMode,
              hasLoadedSnapshot: loadedHostedStateResult?.availability === "loaded",
              stale: Boolean(freshnessNotice),
            }, new Date().toISOString())}
            webMcpActivity={webMcpActivityView}
          />}
          {view === "team" && <TeamWorkspace state={visibleState} execute={execute} />}
          {view === "local-models" && <LocalModelWorkspace state={visibleState} execute={execute} runProposal={runLocalProposal} />}
          {view === "remote-work" && <RemoteWorkbench state={visibleState} execute={execute} />}
          {view === "sarge-engagement" && <SargeEngagementWorkspace state={visibleState} execute={execute} initialTarget={sargeTarget} returnToTarget={returnFromSarge} />}
          {view === "deployment-workbench" && <DeploymentWorkbench state={visibleState} execute={execute} />}
          {view === "deployment-guide" && <DeploymentGuideWorkspace />}
          {view === "governed-closure" && <GovernedClosureWorkspace state={visibleState} submit={executeGovernedClosure} hostedCommandUnknown={authoritativeWriteBlock.blocked} />}
          {view === "audit" && <AuditTrail state={visibleState} />}
          {view === "war-efforts" && <WarEffortsWorkspace state={visibleState} />}
          {view === "baseops" && <BaseopsWorkspace state={visibleState} />}
          {view === "troop-welfare" && <TroopWelfareWorkspace webMcpActivity={webMcpActivityView} />}
          {view !== "overview" && view !== "welcome-access" && view !== "campaigns" && view !== "session-board" && view !== "testing" && view !== "ui-reviews" && view !== "aerarium" && view !== "graph" && view !== "configuration" && view !== "team" && view !== "local-models" && view !== "remote-work" && view !== "sarge-engagement" && view !== "deployment-workbench" && view !== "deployment-guide" && view !== "governed-closure" && view !== "decision-inbox" && view !== "audit" && view !== "war-efforts" && view !== "baseops" && view !== "troop-welfare" && <Placeholder view={view} />}
          </PageContentErrorBoundary>
        </fieldset>
        {authExperience.mode === "demo" && <footer className="demo-synthetic-footer" role="note"><span>* Synthetic Demo-only presentation data. It is not authoritative C001 cost, effort, observed runtime, provider actual, subscription allocation, API-equivalent estimate, or production evidence.</span><ComicCommandDisclaimer active={comicCommandDemo} /><GalacticCommandBridgeDisclaimer active={galacticCommandDemo} /></footer>}
      </main>
      {formRequest && <RecordForm request={formRequest} state={visibleState} close={() => setFormRequest(null)} submit={execute} />}
      {error && <div className="toast" role="alert"><span>{error}</span><button aria-label="Dismiss" onClick={() => setError(null)}>×</button></div>}
    </div>
  );
}
