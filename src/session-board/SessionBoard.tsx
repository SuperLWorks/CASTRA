import { useEffect, useMemo, useRef, useState } from "react";
import {
  SESSION_BOARD_CRITERIA_IDS,
  buildSelectionSummary,
  findSelectionToggles,
  formatMinutes,
  formatUsd,
  type SessionBoardAuthority,
  canDispatchAuthorization,
  canDispatchReconcile,
  canRenderAuthorityResult,
  getAuthorityResult,
  type SessionBoardOutcome,
  type SessionBoardScenario,
  type SessionBoardScenarioFixture,
  type SessionBoardSelection,
} from "./sessionBoardModel";

interface SessionBoardProps {
  scenario: SessionBoardScenario;
  fixture: SessionBoardScenarioFixture;
  allowRehearsal: boolean;
  authority?: SessionBoardAuthority;
}

type CopyStatus = "idle" | "copied" | "failure";

type CopyStatusMap = Record<string, CopyStatus>;

const copyStatusText: Record<CopyStatus, string> = {
  idle: "Ready",
  copied: "Copied",
  failure: "Copy failed",
};

function isCopyable(value: string): boolean {
  return value.length > 0;
}

function normalizeCopyKey(prefix: string, value: string): string {
  return `${prefix}:${value}`;
}

function copyText(value: string, setCopyStatus: (status: CopyStatus) => void): void {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    setCopyStatus("failure");
    return;
  }

  void navigator.clipboard.writeText(value)
    .then(() => setCopyStatus("copied"))
    .catch(() => setCopyStatus("failure"));
}

function CopyButton({
  label,
  value,
  status,
  onCopy,
}: {
  label: string;
  value: string;
  status: CopyStatus;
  onCopy: () => void;
}) {
  return (
    <div className="session-board-copy-row">
      <button type="button" className="button button-quiet session-board-copy-button" aria-label={label} onClick={onCopy}>
        Copy
      </button>
      <span
        className={`session-board-copy-status session-board-copy-status-${status}`}
        role="status"
        aria-live="polite"
      >
        {copyStatusText[status]}
      </span>
      <code>{value}</code>
    </div>
  );
}

function CopyableIdentity({
  label,
  value,
  status,
  onCopy,
  includeStatusOnlyWhenCopyable = false,
}: {
  label: string;
  value: string;
  status: CopyStatus;
  onCopy: () => void;
  includeStatusOnlyWhenCopyable?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {isCopyable(value) ? (
          <>
            <CopyButton
              label={label}
              value={value}
              status={status}
              onCopy={onCopy}
            />
          </>
        ) : (
          <>
            <code>{value || "Unavailable"}</code>
            {includeStatusOnlyWhenCopyable ? null : <span className="session-board-copy-status session-board-copy-status-failure">{copyStatusText.failure}</span>}
          </>
        )}
      </dd>
    </div>
  );
}

function ProposalGate({
  title,
  source,
  unmetCondition,
}: {
  title: string;
  source: string;
  unmetCondition?: string;
}) {
  return (
    <dl className="session-board-gate-list-item">
      <div>
        <dt>{title}</dt>
        <dd>{source}</dd>
      </div>
      {unmetCondition ? (
        <div className="session-board-gate-unmet">
          <dt>Unmet condition</dt>
          <dd>{unmetCondition}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function EmptyState() {
  return (
    <section className="session-board-empty" role="status">
      <h2>No proposals in this fixture</h2>
      <p>The synthetic empty scenario confirms a deterministic no-operations path and a fully visible boundary warning.</p>
    </section>
  );
}

function UnknownOutcomeBanner({ message }: { message: string }) {
  return (
    <section className="session-board-unknown" role="alert" aria-live="polite">
      <h2>Unknown outcome (synthetic)</h2>
      <p>{message}</p>
      <p>
        Reconciliation is a separate Commander callback path in the authoritative implementation plane; no
        automatic retry control is shown in this boundary.
      </p>
    </section>
  );
}

function AuthorityResultRows({ outcome }: { outcome: SessionBoardOutcome }) {
  return (
    <dl>
      <div><dt>Receipt identity</dt><dd><code>{outcome.receiptIdentity}</code></dd></div>
      <div><dt>Full opaque identity</dt><dd><code>{outcome.fullOpaqueIdentity}</code></dd></div>
      <div><dt>Machine identity</dt><dd><code>{outcome.machineOpaqueIdentity}</code></dd></div>
      <div><dt>Blockers</dt><dd>{outcome.blockers.join(" · ")}</dd></div>
      <div><dt>Freshness</dt><dd>{outcome.freshness}</dd></div>
      <div><dt>Next gate</dt><dd>{outcome.nextGate}</dd></div>
      <div><dt>Progress</dt><dd>{outcome.progress.join(" · ")}</dd></div>
      <div><dt>Verification</dt><dd>{outcome.verification.join(" · ")}</dd></div>
    </dl>
  );
}

function ReconcileCommandBanner({
  message,
  disabled,
  onReconcile,
}: {
  message: string;
  disabled: boolean;
  onReconcile: () => void;
}) {
  return (
    <section className="session-board-unknown" role="alert" aria-live="polite">
      <h2>Unknown outcome</h2>
      <p>{message}</p>
      <button
        className="button button-primary"
        type="button"
        disabled={disabled}
        onClick={onReconcile}
      >
        Reconcile exact command
      </button>
    </section>
  );
}

export function SessionBoard({ fixture, allowRehearsal, scenario, authority }: SessionBoardProps) {
  const [selected, setSelected] = useState<string[]>(() => fixture.defaultSelectedIds);
  const [rehearsalAuthorized, setRehearsalAuthorized] = useState(false);
  const [copyStatusById, setCopyStatusById] = useState<CopyStatusMap>({});
  const [authorizationDispatched, setAuthorizationDispatched] = useState(false);
  const [reconcileDispatched, setReconcileDispatched] = useState(false);
  const lastAuthorityStatusRef = useRef<SessionBoardAuthority["status"] | "presentation">("presentation");
  const resultOutcome = fixture.defaultOutcome;

  const selection: SessionBoardSelection = useMemo(
    () => buildSelectionSummary(fixture.proposals, selected),
    [fixture.proposals, selected],
  );

  const selectionByProposalId = useMemo(
    () => new Map(fixture.proposals.map((proposal) => [proposal.proposalId, proposal])),
    [fixture.proposals],
  );

  const selectedLabels = selection.selectedProposalIds
    .map((proposalId) => selectionByProposalId.get(proposalId)?.shortMachineIdentity)
    .filter((value): value is string => Boolean(value))
    .join(", ");
  const shouldRenderResult = canRenderAuthorityResult(allowRehearsal, rehearsalAuthorized, authority);
  const appliedResult = getAuthorityResult(authority);
  const result = allowRehearsal ? resultOutcome : appliedResult;
  const authorizeDecision = canDispatchAuthorization(authority, selection, authorizationDispatched);
  const reconcileDecision = canDispatchReconcile(authority, reconcileDispatched);
  const disableAuthorityButton = allowRehearsal ? !selection.canAuthorize : !authorizeDecision.allowed;

  useEffect(() => {
    if (allowRehearsal) {
      return;
    }
    const nextAuthorityStatus = authority?.status ?? "presentation";
    if (lastAuthorityStatusRef.current !== nextAuthorityStatus) {
      setAuthorizationDispatched(false);
      setReconcileDispatched(false);
    }
    lastAuthorityStatusRef.current = nextAuthorityStatus;
  }, [allowRehearsal, authority?.status]);

  if (fixture.proposals.length === 0) {
    return <EmptyState />;
  }

  function toggleProposal(proposalId: string) {
    if (allowRehearsal) {
      setRehearsalAuthorized(false);
    }
    setSelected((current) => findSelectionToggles(fixture.proposals, current, proposalId));
  }

  function runAuthorization() {
    if (allowRehearsal) {
      setRehearsalAuthorized(true);
      return;
    }
    if (!authorizeDecision.allowed || !authority) {
      return;
    }

    setAuthorizationDispatched(true);
    authority.onAuthorize([...selection.selectedProposalIds]);
  }

  function runReconciliation() {
    if (!reconcileDecision.allowed || !authority?.onReconcile) {
      return;
    }

    setReconcileDispatched(true);
    authority.onReconcile();
  }

  function setCopyStatus(id: string, status: CopyStatus) {
    setCopyStatusById((current) => ({ ...current, [id]: status }));
  }

  function statusFor(id: string): CopyStatus {
    return copyStatusById[id] ?? "idle";
  }

  return (
    <section className="session-board" aria-label="Session Board">
      <header className="session-board-header">
        <h1>{fixture.heading}</h1>
        <p>{fixture.boundaryNotice}</p>
      </header>
      <p className="session-board-scenario" role="status">
        Scenario <span>{scenario}</span> · selected criteria <span>{SESSION_BOARD_CRITERIA_IDS.join(", ")}</span>
      </p>

      <section className="session-board-proposal-list" aria-label="Proposal cards">
        {fixture.proposals.map((proposal) => {
          const isChecked = selected.includes(proposal.proposalId);
          const disabled = proposal.state === "protected" || proposal.state === "blocked";
          const shortCopyId = normalizeCopyKey("short", proposal.proposalId);
          const fullCopyId = normalizeCopyKey("full", proposal.proposalId);
          const branchCopyId = normalizeCopyKey("branch", proposal.proposalId);
          const worktreeCopyId = normalizeCopyKey("worktree", proposal.proposalId);
          return (
            <article
              key={proposal.proposalId}
              className={`session-board-card ${isChecked ? "session-board-card-selected" : ""} session-board-card-${proposal.state}`}
            >
              <label className="session-board-card-title">
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={disabled}
                  onChange={() => toggleProposal(proposal.proposalId)}
                  aria-describedby={`proposal-${proposal.proposalId}-status`}
                />
                <div>
                  <span className="session-board-proposal-label">{proposal.proposalLabel}</span>
                  <strong>{proposal.humanIdentity}</strong>
                  <span className="session-board-chip">{proposal.state}</span>
                </div>
              </label>
              <div id={`proposal-${proposal.proposalId}-status`}>
                <p className="session-board-card-outcome">{proposal.outcome}</p>
                <dl className="session-board-grid-list">
                  <div><dt>Lifecycle</dt><dd>{proposal.lifecycleState}</dd></div>
                  <div><dt>Dependencies</dt><dd>{proposal.dependencies.join(", ")}</dd></div>
                  <div><dt>Expected time</dt><dd>{formatMinutes(proposal.expectedTimeMinutes)}</dd></div>
                  <div><dt>Marginal cost</dt><dd>{formatUsd(proposal.marginalCostUsd)}</dd></div>
                  <div><dt>Risk</dt><dd>{proposal.risk}</dd></div>
                  <div><dt>Next gate</dt><dd>{proposal.protectedNextGate}</dd></div>
                  <CopyableIdentity
                    label="Short opaque identity"
                    value={proposal.shortMachineIdentity}
                    status={statusFor(shortCopyId)}
                    onCopy={() => copyText(proposal.shortMachineIdentity, (valueStatus) => setCopyStatus(shortCopyId, valueStatus))}
                  />
                  <CopyableIdentity
                    label="Full opaque identity"
                    value={proposal.fullMachineIdentity}
                    status={statusFor(fullCopyId)}
                    onCopy={() => copyText(proposal.fullMachineIdentity, (valueStatus) => setCopyStatus(fullCopyId, valueStatus))}
                  />
                  <CopyableIdentity
                    label="Branch hint"
                    value={proposal.branchHint}
                    status={statusFor(branchCopyId)}
                    onCopy={() => copyText(proposal.branchHint, (valueStatus) => setCopyStatus(branchCopyId, valueStatus))}
                    includeStatusOnlyWhenCopyable
                  />
                  <CopyableIdentity
                    label="Worktree hint"
                    value={proposal.worktreeHint}
                    status={statusFor(worktreeCopyId)}
                    onCopy={() => copyText(proposal.worktreeHint, (valueStatus) => setCopyStatus(worktreeCopyId, valueStatus))}
                    includeStatusOnlyWhenCopyable
                  />
                </dl>
                <section className="session-board-acceptance" aria-label={`Acceptance criteria for ${proposal.humanIdentity}`}>
                  <h3>Acceptance criteria</h3>
                  <ul>
                    {proposal.acceptanceCriteria.map((criterion) => (
                      <li key={`${proposal.proposalId}-${criterion}`}>{criterion}</li>
                    ))}
                  </ul>
                </section>
                <section className="session-board-gates" aria-label={`Protected gates for ${proposal.humanIdentity}`}>
                  <h3>Protected gates</h3>
                  {proposal.protectedGates.map((gate) => <ProposalGate key={gate.title} {...gate} />)}
                </section>
              </div>
            </article>
          );
        })}
      </section>

      <aside className="session-board-summary" aria-live="polite">
        <h2>Selection summary</h2>
        <dl>
          <div><dt>Selected proposals</dt><dd>{selection.summary.selectedCount}</dd></div>
          <div><dt>Total time</dt><dd>{formatMinutes(selection.summary.selectedTimeMinutes)}</dd></div>
          <div><dt>Marginal cost</dt><dd>{formatUsd(selection.summary.selectedCostUsd)}</dd></div>
          <div><dt>Primary effects</dt><dd>{selection.summary.effects.join(", ") || "None"}</dd></div>
          <div><dt>Selected identifiers</dt><dd>{selectedLabels || "None"}</dd></div>
        </dl>

        <button
          className="button button-primary"
          type="button"
          disabled={disableAuthorityButton}
          onClick={runAuthorization}
        >
          {allowRehearsal ? "Authorize selected actions (local rehearsal)" : "Authorize selected actions"}
        </button>

        {!allowRehearsal && !authority ? (
          <p className="session-board-disabled-notice">
            In this view, authorization is presentation-only. No command is dispatched until an authoritative callback is supplied.
          </p>
        ) : null}

        {authority?.status === "submitting" ? (
          <p className="session-board-disabled-notice">
            Authorization request is in progress. No local retries are available from this state.
          </p>
        ) : null}

        {authority?.status === "rejected" ? (
          <section className="session-board-blockers" role="alert">
            <p>Authorization rejected: {authority.message}</p>
          </section>
        ) : null}

        {authority?.status === "unknown" ? (
          authority.onReconcile ? (
            <ReconcileCommandBanner
              message={authority.message}
              disabled={!reconcileDecision.allowed}
              onReconcile={runReconciliation}
            />
          ) : (
            <section className="session-board-unknown" role="alert" aria-live="polite">
              <h2>Unknown outcome</h2>
              <p>{authority.message}</p>
            </section>
          )
        ) : null}

        {authority?.status !== "unknown" && selection.summary.blockedReasons.length > 0 ? (
          <ul className="session-board-blockers" role="alert">
            {selection.summary.blockedReasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        ) : null}

        {selection.summary.criticalProtectedGates.length > 0 ? (
          <section className="session-board-blockers" aria-label="Protected gate blockers">
            <h3>Unmet gate conditions</h3>
            {selection.summary.criticalProtectedGates.map((gate) => <p key={gate}>{gate}</p>)}
          </section>
        ) : null}
      </aside>

      {allowRehearsal && fixture.hasUnknownOutcome ? <UnknownOutcomeBanner message={fixture.unknownOutcomeGuidance} /> : null}

      {shouldRenderResult && result ? (
        <section className="session-board-result" aria-label="Authorization result">
          <h2>{allowRehearsal ? "Execution result (synthetic, review only)" : "Execution result"}</h2>
          <CopyableIdentity
            label="Branch"
            value={result.receiptBranch}
            status={statusFor("result-branch")}
            onCopy={() => copyText(result.receiptBranch, (valueStatus) => setCopyStatus("result-branch", valueStatus))}
          />
          <CopyableIdentity
            label="Worktree"
            value={result.receiptWorktree}
            status={statusFor("result-worktree")}
            onCopy={() => copyText(result.receiptWorktree, (valueStatus) => setCopyStatus("result-worktree", valueStatus))}
          />
          <AuthorityResultRows outcome={result} />
          {allowRehearsal ? (
            <p className="session-board-result-note">No retry control appears in this synthetic review plane.</p>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
