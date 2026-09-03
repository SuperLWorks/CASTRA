import type { WebMcpClientDraft, WebMcpReviewCheck } from "../webmcp/contracts";
import {
  SESSION_PLAN_DRAFT_EMPTY_MESSAGE,
  SESSION_PLAN_DRAFT_READINESS_CAPTION,
  formatReviewCounts,
  groupPlanReviewChecks,
  planTargetKindLabel,
  readinessLabel,
  reviewDimensionLabel,
  reviewResultLabel,
  type SessionPlanDraftReviewSummary,
} from "./sessionPlanDraftView";

/**
 * C001.M017.A001 — presentation-only Session Work Plan draft surface.
 *
 * Props in, callbacks out. This component holds no React state of its own,
 * makes no fetch/repository/dispatcher/authentication/lifecycle/provider/
 * deployment/persistence/network call, and performs no review re-derivation:
 * `review` arrives already computed (by `src/App.tsx`, from the exact same
 * canonical `reviewPlanDraft`/`summarizeReview` functions the `review_plan`
 * WebMCP tool itself uses), and this component only groups and labels it
 * through the sibling pure view model. It cannot dispatch, save, allocate,
 * close, approve, or mutate any CASTRA state; `onDiscard` clears only the
 * ephemeral page draft the Commander is looking at, and
 * `onOpenGovernedClosure` only navigates to the existing, unchanged Governed
 * Closure workspace.
 */
export interface SessionPlanDraftSurfaceProps {
  /** Whether the WebMCP proposal boundary is bound in the active experience (authenticated live or Public Demo; never Review Mode). */
  readonly available: boolean;
  /** Shown only when `available` is false. */
  readonly unavailableReason: string | null;
  /** The exact current client-local draft for the active experience, or `null` before any draft exists. */
  readonly draft: WebMcpClientDraft | null;
  /** The plan review already computed for `draft.plan`, or `null` when there is no plan to review yet. */
  readonly review: SessionPlanDraftReviewSummary | null;
  /** The verbatim `WEBMCP_DRAFT_REVERSAL_NOTE` contract constant. */
  readonly reversalNote: string;
  /** Discards the whole page draft (plan and confirmation). Never a hosted or lifecycle effect. */
  readonly onDiscard: () => void;
  /** Opens the existing Governed Closure workspace — the exceptions and reconciliation path. */
  readonly onOpenGovernedClosure: () => void;
}

function ReviewCheckList({ checks }: { checks: readonly WebMcpReviewCheck[] }) {
  return (
    <ul className="session-plan-draft-check-list">
      {checks.map((entry) => (
        <li key={entry.checkId}>
          <span className={`session-plan-draft-result session-plan-draft-result-${entry.result}`}>
            {reviewResultLabel(entry.result)}
          </span>
          <span className="session-plan-draft-dimension">{reviewDimensionLabel(entry.dimension)}</span>
          <span>{entry.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function UnavailablePanel({ reason }: { reason: string | null }) {
  return (
    <section className="session-plan-draft session-plan-draft-unavailable" aria-label="Session Work Plan draft">
      <h2>Session Work Plan draft (WebMCP)</h2>
      <p role="status" aria-live="polite">
        {reason ?? "The Session Work Plan draft surface is not bound in this experience."}
      </p>
    </section>
  );
}

export function SessionPlanDraftSurface({
  available,
  unavailableReason,
  draft,
  review,
  reversalNote,
  onDiscard,
  onOpenGovernedClosure,
}: SessionPlanDraftSurfaceProps) {
  if (!available) {
    return <UnavailablePanel reason={unavailableReason} />;
  }

  const plan = draft?.plan ?? null;
  const confirmation = draft?.confirmation ?? null;
  const grouping = plan && review ? groupPlanReviewChecks(plan, review.checks) : null;
  const blockingFindings = review ? review.checks.filter((entry) => entry.result === "blocking") : [];

  return (
    <section className="session-plan-draft" aria-label="Session Work Plan draft">
      <header className="session-plan-draft-header">
        <h2>Session Work Plan draft (WebMCP)</h2>
        <p>
          Drafted, reviewed, and staged only by a cooperative WebMCP tool call in this browser page. Nothing here is
          a CASTRA record, and nothing here has allocated, dispatched, approved, or closed anything.
        </p>
      </header>

      {draft ? (
        <p className="session-plan-draft-status" role="status" aria-live="polite">
          Draft revision {draft.revision} · {draft.mode.replaceAll("_", " ")}
        </p>
      ) : (
        <p className="session-plan-draft-empty" role="status" aria-live="polite">
          {SESSION_PLAN_DRAFT_EMPTY_MESSAGE}
        </p>
      )}

      {plan && (
        <section className="session-plan-draft-plan" aria-label="Drafted plan">
          <h3>Bound Commander intent</h3>
          <p className="session-plan-draft-intent">{plan.intent}</p>

          <h3>Proposal cards ({plan.cards.length})</h3>
          <ul className="session-plan-draft-cards">
            {plan.cards.map((card) => (
              <li className="session-plan-draft-card" key={card.proposalId}>
                <article aria-label={`Proposal ${card.proposalId}`}>
                  <div className="session-plan-draft-card-title">
                    <span className="session-plan-draft-chip">{planTargetKindLabel(card.targetKind)}</span>
                    <strong>{card.title}</strong>
                    <code>{card.proposalId}</code>
                  </div>
                  {card.outcome && <p>{card.outcome}</p>}
                  <dl className="session-plan-draft-card-grid">
                    <div><dt>Target</dt><dd>{card.target || "Not stated"}</dd></div>
                    <div><dt>Depends on</dt><dd>{card.dependsOn.join(", ") || "None declared"}</dd></div>
                    <div><dt>Verification</dt><dd>{card.verification || "Not stated"}</dd></div>
                  </dl>
                </article>
              </li>
            ))}
          </ul>

          {review && grouping && (
            <section className="session-plan-draft-review" aria-label="Review findings">
              <h3>Review findings</h3>
              <p role="status" aria-live="polite">
                {formatReviewCounts(review.counts)} · {readinessLabel(review.readyForCommanderSelection)}
              </p>
              <p className="session-plan-draft-readiness-caption">{SESSION_PLAN_DRAFT_READINESS_CAPTION}</p>

              {blockingFindings.length > 0 && (
                <ul className="session-plan-draft-blocking" role="alert">
                  {blockingFindings.map((entry) => (
                    <li key={entry.checkId}>
                      {entry.proposalId ? `${entry.proposalId}: ` : ""}
                      {entry.detail}
                    </li>
                  ))}
                </ul>
              )}

              <h4>Plan-level findings</h4>
              <ReviewCheckList checks={grouping.planLevelChecks} />

              {grouping.cardGroups.map((group) => (
                <section key={group.proposalId} aria-label={`Findings for ${group.proposalId}`}>
                  <h4>
                    {group.card.title} (<code>{group.proposalId}</code>) — {formatReviewCounts(group.counts)}
                  </h4>
                  <ReviewCheckList checks={group.checks} />
                </section>
              ))}
            </section>
          )}
        </section>
      )}

      {confirmation && (
        <section className="session-plan-draft-confirmation" aria-label="Prepared confirmation">
          <h3>Prepared confirmation (page draft only)</h3>
          <p className="session-plan-draft-confirmation-note">
            Nothing has been closed. This is a page draft only; only your confirmation in CASTRA performs it, and the
            existing direct-close and Governed Closure execution paths are unchanged.
          </p>
          <dl className="session-plan-draft-confirmation-grid">
            <div><dt>Action</dt><dd>{confirmation.actionTitle} (<code>{confirmation.actionId}</code>)</dd></div>
            <div><dt>Mission</dt><dd><code>{confirmation.missionId}</code></dd></div>
            <div><dt>Expected revision</dt><dd>{confirmation.expectedRevision}</dd></div>
            <div><dt>Resulting revision</dt><dd>{confirmation.resultingRevision}</dd></div>
            <div><dt>Target</dt><dd>{confirmation.target}</dd></div>
            <div><dt>Effect</dt><dd>{confirmation.effect}</dd></div>
            <div><dt>Rollback</dt><dd>{confirmation.rollback}</dd></div>
            <div><dt>Alternatives</dt><dd>{confirmation.alternatives.join(" · ") || "None stated"}</dd></div>
            <div><dt>Residual risk</dt><dd>{confirmation.residualRisk}</dd></div>
            <div><dt>Confirmation label</dt><dd>{confirmation.confirmationLabel}</dd></div>
            <div><dt>Decided by</dt><dd>{confirmation.decidedBy === "commander_only" ? "Commander only" : confirmation.decidedBy}</dd></div>
            <div><dt>Executed here</dt><dd>{confirmation.executedHere ? "Yes" : "No — not executed by this draft"}</dd></div>
          </dl>
          <div className="session-plan-draft-evidence">
            <span>Bound evidence ({confirmation.evidenceReferences.length})</span>
            {confirmation.evidenceReferences.map((reference) => <code key={reference}>{reference}</code>)}
          </div>
          <p className="session-plan-draft-confirmation-prompt">{confirmation.confirmationPrompt}</p>
        </section>
      )}

      {draft && (
        <footer className="session-plan-draft-footer">
          <p className="session-plan-draft-reversal">{reversalNote}</p>
          <button
            type="button"
            className="button button-quiet"
            aria-label="Discard the Session Work Plan page draft"
            onClick={onDiscard}
          >
            Discard page draft
          </button>
        </footer>
      )}

      <p className="session-plan-draft-exceptions-link">
        Exceptions and reconciliation:{" "}
        <button type="button" className="button button-quiet" onClick={onOpenGovernedClosure}>
          Open Governed Closure
        </button>
      </p>
    </section>
  );
}
