import { useEffect, useMemo, useRef, useState } from "react";
import type { CastraState } from "../domain/types";
import { CANONICAL_COMMANDER_ORIGIN, type BrowserAuthResult } from "./liveAuthClient";
import { submitLiveLoginForm } from "./liveLoginForm";
import { submitRecoveryPasswordForm } from "./liveRecoveryPasswordForm";
import { currentAuthenticationPolicy } from "../domain/authentication";
import {
  AUTH_UI04_MANIFEST,
  AUTH_UI04_REVISION,
  AUTH_UI04_SCENARIOS,
  findAuthUiScenario,
  type AuthExperienceEvent,
  type AuthExperienceState,
  type AuthUiGroup,
  type AuthUiStateClass,
} from "./deterministicAuthUi";
import {
  BUILD_LIFECYCLE_STAGES,
  CAMPAIGN_ARTWORK,
  COST_TRANSPARENCY_STATEMENT,
  GOVERNANCE_PRINCIPLES,
  MISSION_COMMAND_BOUNDARY,
  nextExpandedLifecycleStage,
  OPERATIONS_DIRECTION_STAGES,
  WELCOME_HEADLINE,
  type WelcomeLifecycleStage,
} from "./welcomeContent";

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function historicalDeferred(group: AuthUiGroup): boolean {
  return group === "invitation";
}

function StateBadge({ stateClass, labelText }: { stateClass: AuthUiStateClass; labelText: string }) {
  return <span className={`auth-state-badge auth-state-${stateClass}`}>{labelText}</span>;
}

function ReviewBoundary({ digest, baseline }: { digest: string; baseline: string }) {
  const unchanged = digest === baseline;
  return <section className="auth-review-banner" role="status" aria-label="Authentication UI-04 Review Mode boundary">
    <div>
      <strong>DEMONSTRATION DATA · NOT AUTHORITATIVE · MEMORY ONLY</strong>
      <span>UI-04 AUTHENTICATION REVIEW · {AUTH_UI04_REVISION}</span>
    </div>
    <div>
      <span className={unchanged ? "integrity-ok" : "integrity-failed"}>Authoritative data: {unchanged ? "UNCHANGED" : "DIGEST MISMATCH"}</span>
      <code title={digest}>{digest}</code>
    </div>
  </section>;
}

function LifecycleExplorer({
  title,
  description,
  scope,
  stages,
  expandedStage,
  onToggle,
}: {
  title: string;
  description: string;
  scope: string;
  stages: readonly WelcomeLifecycleStage[];
  expandedStage: string | null;
  onToggle: (stageKey: string) => void;
}) {
  return <section className="lifecycle-explorer" aria-labelledby={`${scope}-heading`}>
    <div className="lifecycle-explorer-heading">
      <div><span className="eyebrow">Interactive lifecycle detail</span><h2 id={`${scope}-heading`}>{title}</h2></div>
      <p>{description}</p>
    </div>
    <div className="lifecycle-stage-list">
      {stages.map((stage, index) => {
        const stageKey = `${scope}-${stage.id}`;
        const expanded = expandedStage === stageKey;
        const triggerId = `${stageKey}-trigger`;
        const panelId = `${stageKey}-panel`;
        return <article className={expanded ? "lifecycle-stage lifecycle-stage-expanded" : "lifecycle-stage"} key={stage.id}>
          <button
            type="button"
            id={triggerId}
            className="lifecycle-stage-trigger"
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${stage.label} details`}
            onClick={() => onToggle(stageKey)}
          >
            <span className="lifecycle-stage-number">{String(index + 1).padStart(2, "0")}</span>
            <strong>{stage.label}</strong>
            <span aria-hidden="true">{expanded ? "−" : "+"}</span>
          </button>
          <div
            id={panelId}
            className="lifecycle-stage-panel"
            role="region"
            aria-labelledby={triggerId}
            hidden={!expanded}
          >
            <dl>
              <div><dt>Purpose</dt><dd>{stage.purpose}</dd></div>
              <div><dt>Governance</dt><dd>{stage.governance}</dd></div>
              <div><dt>Evidence</dt><dd>{stage.evidence}</dd></div>
              <div><dt>Gate</dt><dd>{stage.gate}</dd></div>
            </dl>
          </div>
        </article>;
      })}
    </div>
  </section>;
}

function CostTransparency() {
  return <aside className="cost-transparency">
    <span className="eyebrow">Cost transparency</span>
    <h2>No CASTRA access fee</h2>
    <p>{COST_TRANSPARENCY_STATEMENT}</p>
    <small>Open Source Materials are not yet published and remain Coming Soon.</small>
  </aside>;
}

function GovernancePrinciples() {
  return <section className="governance-principles" aria-labelledby="governance-principles-heading">
    <div className="welcome-section-heading">
      <div><span className="eyebrow">How CASTRA governs work</span><h2 id="governance-principles-heading">Intent gives direction. Evidence protects authority.</h2></div>
      <p>{MISSION_COMMAND_BOUNDARY}</p>
    </div>
    <div className="governance-principle-grid">
      {GOVERNANCE_PRINCIPLES.map((principle, index) => <article key={principle.id}>
        <span>{String(index + 1).padStart(2, "0")}</span>
        <h3>{principle.title}</h3>
        <p>{principle.description}</p>
      </article>)}
    </div>
  </section>;
}

interface WelcomeAccessWorkspaceProps {
  state: CastraState;
  experience: AuthExperienceState;
  dispatch: (event: AuthExperienceEvent) => void;
  openCommandOverview: () => void;
  authoritativeDigest: string;
  reviewBaselineDigest: string;
  liveAuthResult: BrowserAuthResult;
  loginLive: (emailAddress: string, password: string) => Promise<BrowserAuthResult>;
  recoverLive: (emailAddress: string) => Promise<BrowserAuthResult>;
  changePasswordLive: (newPassword: string) => Promise<BrowserAuthResult>;
}

export function WelcomeAccessWorkspace({
  state,
  experience,
  dispatch,
  openCommandOverview,
  authoritativeDigest,
  reviewBaselineDigest,
  liveAuthResult,
  loginLive,
  recoverLive,
  changePasswordLive,
}: WelcomeAccessWorkspaceProps) {
  const policy = currentAuthenticationPolicy(state);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selectedScenario = findAuthUiScenario(experience.scenarioId);
  const [expandedLifecycleStage, setExpandedLifecycleStage] = useState<string | null>(null);

  const toggleLifecycleStage = (stageKey: string) => {
    setExpandedLifecycleStage((current) => nextExpandedLifecycleStage(current, stageKey));
  };

  useEffect(() => {
    headingRef.current?.focus();
  }, [experience.screen, experience.scenarioId]);

  const shell = (content: React.ReactNode) => <>
    <div className="auth-screen-toolbar">
      <button className="back-link" onClick={() => dispatch({ type: "open_welcome" })}>← Welcome</button>
      <div className="auth-screen-actions">
        <button className="button button-quiet" onClick={() => dispatch({ type: "open_gallery" })}>Open UI-04 state gallery</button>
        {experience.mode === "authenticated_test" && <button className="button button-primary" onClick={openCommandOverview}>Command Overview</button>}
      </div>
    </div>
    <div className="auth-live-status" role="status" aria-live="polite">{experience.statusMessage}</div>
    {content}
  </>;

  if (experience.mode === "authenticated_live") {
    if (liveAuthResult.receipt?.recoveryPasswordChangeReady) {
      return shell(<RecoveryPasswordWorkspace
        headingRef={headingRef}
        changePasswordLive={changePasswordLive}
      />);
    }
    return shell(<LiveSessionWorkspace
      headingRef={headingRef}
      liveAuthResult={liveAuthResult}
      openCommandOverview={openCommandOverview}
    />);
  }

  if (experience.screen === "about") {
    return shell(<section className="auth-detail-shell about-castra-full">
      <span className="eyebrow">About CASTRA</span>
      <h1 ref={headingRef} tabIndex={-1}>Human command with governed assistance</h1>
      <p className="auth-lede">CASTRA is a deterministic agentic operating system. People directly create and manage authoritative records; normal work does not require a model call. Optional model and connector assistance stays bounded, reviewable, and non-authoritative.</p>
      <div className="about-principle-grid">
        <article><span>01</span><h2>Direct command</h2><p>Campaigns, Missions, Actions, evidence, testing, approvals, effort, and the later BASEOPS direction remain direct and auditable.</p></article>
        <article><span>02</span><h2>Optional assistance</h2><p>Models and connectors can be governed, bounded, proposed, reviewed, and Commander-confirmed. They never become the authority.</p></article>
        <article><span>03</span><h2>Clear access boundary</h2><p>Public Demo has no saved production capability. An authenticated deployment is required for production capability.</p></article>
      </div>
      <CostTransparency />
      <LifecycleExplorer
        title="Build Lifecycle"
        description="From the Commander’s desired end state to an evidenced acceptance and deployment decision. Expand every stage to inspect its purpose, governance, evidence, and gate."
        scope="about-build"
        stages={BUILD_LIFECYCLE_STAGES}
        expandedStage={expandedLifecycleStage}
        onToggle={toggleLifecycleStage}
      />
      <LifecycleExplorer
        title="Operations Direction"
        description="A distinct post-deployment path for transition, realistic-use validation, sustainment, improvement, and transparent stewardship."
        scope="about-operations"
        stages={OPERATIONS_DIRECTION_STAGES}
        expandedStage={expandedLifecycleStage}
        onToggle={toggleLifecycleStage}
      />
      <GovernancePrinciples />
      <aside className="about-slw-note"><strong>Shared by Super L Works</strong><p>Super L Works shares its product-development experience and does not require paid website access for its products.</p></aside>
    </section>);
  }

  if (experience.screen === "login") {
    return shell(<LoginReviewScreen
      headingRef={headingRef}
      dispatch={dispatch}
      policyState={policy.providerState}
      liveAuthResult={liveAuthResult}
      loginLive={loginLive}
      recoverLive={recoverLive}
    />);
  }

  if (experience.screen === "gallery") {
    return shell(<AuthStateGallery
      headingRef={headingRef}
      dispatch={dispatch}
      digest={authoritativeDigest}
      baseline={reviewBaselineDigest}
    />);
  }

  if (experience.screen === "scenario" && selectedScenario) {
    return shell(<>
      <ReviewBoundary digest={authoritativeDigest} baseline={reviewBaselineDigest} />
      <section className="auth-detail-shell auth-scenario-detail">
        <div className="section-heading">
          <div><span className="eyebrow">{label(selectedScenario.group)} · {selectedScenario.screen}</span><h1 ref={headingRef} tabIndex={-1}>{selectedScenario.heading}</h1></div>
          <StateBadge stateClass={selectedScenario.stateClass} labelText={selectedScenario.statusLabel} />
        </div>
        <p className="auth-lede">{selectedScenario.summary}</p>
        {historicalDeferred(selectedScenario.group) && <p className="source-callout"><strong>Historical / deferred UI evidence</strong><span>This A002 state is retained for regression only. It is not an available Release 1 authentication method.</span></p>}
        {experience.requestedProtectedView && <p className="auth-route-reference"><strong>Requested destination</strong><span>{label(experience.requestedProtectedView)} · name only; no secret route state retained</span></p>}
        <div className="auth-review-question-grid">
          <article><strong>Commander should inspect</strong><p>{selectedScenario.inspectionFocus}</p></article>
          <article><strong>Intentional boundary</strong><p>{selectedScenario.intentionalGap}</p></article>
          <article><strong>UI-04 review question</strong><p>{selectedScenario.requestedReview}</p></article>
        </div>
        <div className="auth-scenario-actions">
          <button className="button button-quiet" onClick={() => dispatch({ type: "open_gallery" })}>Back to state gallery</button>
          {selectedScenario.id === "login-success" && <button className="button button-primary" onClick={() => dispatch({ type: "authenticate_test" })}>Activate deterministic test access</button>}
        </div>
      </section>
    </>);
  }

  if (experience.screen === "demo" || experience.mode === "demo") {
    return <>
      <ReviewBoundary digest={authoritativeDigest} baseline={reviewBaselineDigest} />
      <section className="demo-mode-shell">
        <div className="demo-mode-heading">
          <div><span className="eyebrow">Public Demo · isolated preview boundary</span><h1 ref={headingRef} tabIndex={-1}>Explore without production access</h1><p>Everything on this screen is fixed, synthetic, and held only in memory. This is not the M011 public Demo runtime.</p></div>
          <button className="button button-primary" onClick={() => dispatch({ type: "exit_demo" })}>Exit Demo · discard state</button>
        </div>
        <div className="demo-boundary-strip" role="status"><strong>NO IDENTITY · NO SESSION · NO COOKIE · NO PRODUCTION DATA · NO PERSISTENCE</strong><span>Logging in later cannot transfer any Demo record.</span></div>
        <div className="demo-card-grid">
          <article><span className="record-id">SYNTHETIC-CAMPAIGN</span><h2>North Ridge Readiness</h2><p>Review a fictional hierarchy label only. No Campaign was created.</p><span className="status status-draft">Demonstration</span></article>
          <article><span className="record-id">SYNTHETIC-CHECK</span><h2>Exit evidence review</h2><p>Representative copy illustrates the future Demo boundary, not a test result.</p><span className="status status-blocked">Review only</span></article>
          <article><span className="record-id">SYNTHETIC-EFFORT</span><h2>AERARIUM separation</h2><p>No runtime, provider actual, subscription allocation, token estimate, or cost is generated here.</p><span className="status">Unavailable</span></article>
        </div>
        <p className="source-callout"><strong>What Demo cannot do</strong><span>Save records, reuse production identity, call a provider/model/connector, open Remote Work or Deployment controls, or transfer state into a later login.</span></p>
      </section>
    </>;
  }

  return <>
    <section className="welcome-command-hero">
      <div className="welcome-command-copy">
        <span className="eyebrow">Super L Works · CASTRA Release 1</span>
        <h1 ref={headingRef} tabIndex={-1}>{WELCOME_HEADLINE}</h1>
        <p>CASTRA is a deterministic agentic operating system for direct human mission command, with optional assistance kept bounded, reviewable, and accountable.</p>
        <div className="welcome-primary-actions" role="group" aria-label="Welcome choices">
          <button className="button button-primary" onClick={() => dispatch({ type: "open_login" })}>Sign in to CASTRA</button>
          <button className="button button-accent" onClick={() => dispatch({ type: "enter_demo" })}>Enter Public Demo</button>
          <button className="button button-quiet" onClick={() => dispatch({ type: "open_about" })}>About CASTRA</button>
        </div>
        <div className="welcome-session-status" role="status">
          <span className="online-dot auth-dot-idle" />
          NO AUTHENTICATED SESSION · PROVIDER {policy.providerState.toUpperCase()}
        </div>
      </div>

      <figure className="welcome-campaign-artwork">
        <img src={CAMPAIGN_ARTWORK.src} alt={CAMPAIGN_ARTWORK.alt} />
        <figcaption>
          <span>Campaign artwork</span>
          <strong>{CAMPAIGN_ARTWORK.title}</strong>
          <small>{CAMPAIGN_ARTWORK.credit} · {CAMPAIGN_ARTWORK.license}</small>
          <a href={CAMPAIGN_ARTWORK.sourceUrl} target="_blank" rel="noreferrer">{CAMPAIGN_ARTWORK.sourceLabel}</a>
        </figcaption>
      </figure>
    </section>

    <section className="welcome-lifecycle" aria-labelledby="welcome-lifecycle-heading">
      <div className="welcome-section-heading">
        <div><span className="eyebrow">Product lifecycle</span><h2 id="welcome-lifecycle-heading">Build deliberately. Operate with purpose.</h2></div>
        <p>Verification establishes conformance before release. Operational Validation separately establishes intended-use success after realistic or deployed use.</p>
      </div>
      <LifecycleExplorer
        title="Build Lifecycle"
        description="Commander’s Intent → RECON / Discovery → Specification → Build → Verification Testing → Commander Acceptance / Deployment."
        scope="welcome-build"
        stages={BUILD_LIFECYCLE_STAGES}
        expandedStage={expandedLifecycleStage}
        onToggle={toggleLifecycleStage}
      />
      <LifecycleExplorer
        title="Operations Direction"
        description="Transition to BASEOPS → Operational Validation → Garrison sustainment → Fortification improvements → Stewardship."
        scope="welcome-operations"
        stages={OPERATIONS_DIRECTION_STAGES}
        expandedStage={expandedLifecycleStage}
        onToggle={toggleLifecycleStage}
      />
    </section>

    <section className="welcome-about" aria-labelledby="welcome-about-heading">
      <div className="welcome-section-heading">
        <div><span className="eyebrow">About CASTRA</span><h2 id="welcome-about-heading">A command system built around accountable human work.</h2></div>
        <p>Direct record operations remain deterministic. Optional models and connectors can assist only inside explicit policy, review, evidence, and Commander-confirmation boundaries.</p>
      </div>
      <div className="welcome-capability-grid">
        <article><span>01</span><h3>Direct human records</h3><p>Create and govern Campaigns, Missions, Actions, evidence, testing, and effort without requiring a model call.</p></article>
        <article><span>02</span><h3>Governed assistance</h3><p>Models and connectors may propose bounded help. They do not approve, publish, or replace authoritative records.</p></article>
        <article><span>03</span><h3>Lifecycle continuity</h3><p>Campaign → Mission → Action supports product work, with a distinct Deployed Product → BASEOPS operations direction.</p></article>
        <article><span>04</span><h3>Clear access boundary</h3><p>Public Demo has no saved production capability. Authenticated deployment provides production capability.</p></article>
      </div>
      <CostTransparency />
      <aside className="welcome-slw-statement"><strong>Super L Works</strong><p>Super L Works shares its product-development experience and does not require paid website access for its products.</p></aside>
    </section>

    <GovernancePrinciples />

    <section className="welcome-future" aria-labelledby="welcome-future-heading">
      <div className="welcome-section-heading compact"><div><span className="eyebrow">Future channels &amp; recognition</span><h2 id="welcome-future-heading">Reserved for evidenced releases.</h2></div><p>No future item below is available or claimed today.</p></div>
      <div className="welcome-future-grid">
        <article><span className="future-state">COMING SOON</span><h3>YouTube Channel</h3><p>Future product-development demonstrations and Commander guidance.</p><button className="button button-quiet" disabled aria-disabled="true">YouTube Channel · Coming Soon</button></article>
        <article><span className="future-state">COMING SOON</span><h3>Open Source Materials</h3><p>Future governed reference material. No repository or download is published here.</p><button className="button button-quiet" disabled aria-disabled="true">Open Source Materials · Coming Soon</button></article>
        <article className="welcome-recognition-card"><span className="future-state">RESERVED · COMING SOON</span><h3>Credentials / Recognitions</h3><p>No credential, award, affiliation, certification, customer, or recognition is asserted. This area remains intentionally empty until evidence exists.</p></article>
      </div>
    </section>

    <section className="auth-ui04-entry auth-ui04-secondary">
      <div><span className="eyebrow">Local Commander review utility · not a public capability</span><h2>Deterministic UI-04 state review</h2><p>{AUTH_UI04_SCENARIOS.length} fixed memory-only scenarios · no provider · no authoritative writes.</p></div>
      <button className="button button-quiet" onClick={() => dispatch({ type: "open_gallery" })}>Open deterministic UI-04 review</button>
    </section>
  </>;
}

function RecoveryPasswordWorkspace({
  headingRef,
  changePasswordLive,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  changePasswordLive: (newPassword: string) => Promise<BrowserAuthResult>;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("Recovery was verified. Choose a unique CASTRA-only password.");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const attempt = await submitRecoveryPasswordForm(event.currentTarget, changePasswordLive, () => {
        setNewPassword("");
        setConfirmPassword("");
      });
      setMessage(attempt.publicMessage);
    } finally {
      setNewPassword("");
      setConfirmPassword("");
      setPending(false);
    }
  }

  return <section className="login-review-layout recovery-password-layout">
    <div className="login-panel">
      <span className="eyebrow">Verified recovery · single Commander</span>
      <h1 ref={headingRef} tabIndex={-1}>Set your CASTRA password</h1>
      <p>The one-time recovery link has been verified by the server. Choose a unique password for this CASTRA identity only—not a Supabase dashboard, database, email, or Vercel password.</p>
      <form onSubmit={submit} aria-describedby="recovery-password-boundary recovery-password-status">
        <label>New CASTRA password<input name="newPassword" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required disabled={pending} /></label>
        <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required disabled={pending} /></label>
        <button type="submit" className="button button-primary" disabled={pending}>{pending ? "Updating…" : "Set CASTRA password"}</button>
      </form>
      <p id="recovery-password-boundary" className="auth-form-boundary"><strong>Private server action</strong><span>Both fields are consumed once and cleared immediately. Supabase enforces the deployment password policy; CASTRA stores no plaintext password and exposes no provider token.</span></p>
      <div id="recovery-password-status" className="auth-live-status" role="status" aria-live="polite">{message}</div>
    </div>
    <aside className="login-assurance-panel">
      <span className="eyebrow">Recovery boundary</span>
      <h2>What happens next</h2>
      <ul><li>The recovery grant is bound to this verified identity and expires</li><li>Commander and Product Owner authority must both be evidenced</li><li>A successful change revokes existing provider sessions</li><li>You then sign in normally with this CASTRA-only password</li></ul>
    </aside>
  </section>;
}

function LoginReviewScreen({
  headingRef,
  dispatch,
  policyState,
  liveAuthResult,
  loginLive,
  recoverLive,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  dispatch: (event: AuthExperienceEvent) => void;
  policyState: string;
  liveAuthResult: BrowserAuthResult;
  loginLive: (emailAddress: string, password: string) => Promise<BrowserAuthResult>;
  recoverLive: (emailAddress: string) => Promise<BrowserAuthResult>;
}) {
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"login" | "recovery" | null>(null);
  const [message, setMessage] = useState(liveAuthResult.publicMessage);
  const configured = liveAuthResult.availability === "configured";
  const boundaryDescription = configured
    ? "The HTTPS server accepts email and password only for this single request. It creates no account, retains no plaintext credential, and keeps provider tokens in hardened server-managed cookies."
    : liveAuthResult.availability === "wrong_origin"
      ? `This browser is on a noncanonical CASTRA address. Credential and recovery submission are disabled here. Open ${CANONICAL_COMMANDER_ORIGIN} to resolve the Commander session or recover access.`
    : liveAuthResult.availability === "unavailable"
      ? "The configured server boundary is temporarily unavailable. The form is disabled, no provider fallback is allowed, and no authentication success is claimed."
      : liveAuthResult.availability === "checking"
        ? "The server boundary is still being checked. The form remains disabled until a complete governed receipt is received."
        : "No live provider configuration is available on this origin. The form is disabled and no provider request is made.";

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || pending) return;
    setPending("login");
    try {
      const attempt = await submitLiveLoginForm(event.currentTarget, loginLive, () => setPassword(""));
      setMessage(attempt.publicMessage);
    } finally {
      setPassword("");
      setPending(null);
    }
  }

  async function requestRecovery() {
    if (!configured || pending || !emailAddress.trim()) return;
    setPending("recovery");
    try {
      const result = await recoverLive(emailAddress.trim());
      setMessage(result.publicMessage);
    } finally {
      setPending(null);
    }
  }

  return <section className="login-review-layout">
    <div className="login-panel">
      <span className="eyebrow">Single-Commander access · email and password</span>
      <h1 ref={headingRef} tabIndex={-1}>Log in to CASTRA</h1>
      <p>This deployment accepts only its one administrator-provisioned Commander account. The same generic response is shown for every address; public signup and automatic identity creation are unavailable.</p>
      <form onSubmit={submitLogin} aria-describedby="login-boundary-note login-attempt-status">
        <label>Email address<input name="emailAddress" type="email" autoComplete="username" value={emailAddress} onChange={(event) => setEmailAddress(event.target.value)} required disabled={!configured || Boolean(pending)} /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={!configured || Boolean(pending)} /></label>
        <div className="login-button-stack">
          <button type="submit" className="button button-primary" disabled={!configured || Boolean(pending)}>{pending === "login" ? "Signing in…" : "Sign in to CASTRA"}</button>
          <button type="button" className="button button-quiet" disabled={!configured || Boolean(pending) || !emailAddress.trim()} onClick={requestRecovery}>{pending === "recovery" ? "Requesting…" : "Forgot password?"}</button>
        </div>
      </form>
      {liveAuthResult.availability === "wrong_origin" && <div className="login-button-stack" role="group" aria-label="Canonical CASTRA recovery">
        <a className="button button-primary" href={`${CANONICAL_COMMANDER_ORIGIN}/`}>Open canonical CASTRA</a>
      </div>}
      <p id="login-boundary-note" className="auth-form-boundary"><strong>Server boundary {label(liveAuthResult.availability)}</strong><span>{boundaryDescription}</span></p>
      <div id="login-attempt-status" className="auth-live-status" role="status" aria-live="polite">{message}</div>
      <div className="auth-text-links">
        <button onClick={() => dispatch({ type: "inspect_scenario", scenarioId: "login-loading" })}>Review deterministic login states</button>
        <button onClick={() => dispatch({ type: "inspect_scenario", scenarioId: "recovery-request" })}>Review recovery states</button>
      </div>
      <small className="auth-no-signup">Wrong, unknown, unverified, or unauthorized credentials receive the same generic denial. No public signup, automatic identity creation, invitation workflow, social login, SMS, shared tenancy, or team access. Public visitors may use isolated memory-only Demo Mode only.</small>
    </div>
    <aside className="login-assurance-panel">
      <span className="eyebrow">Access boundary</span>
      <h2>What CASTRA protects</h2>
      <ul><li>One verified identity per deployment</li><li>No automatic account creation</li><li>Separate Commander and Product Owner authority</li><li>Fresh password step-up for foundational changes</li><li>Seven-day idle and thirty-day absolute ceilings</li><li>No browser-visible provider token</li></ul>
      <button className="button button-quiet" onClick={() => dispatch({ type: "inspect_scenario", scenarioId: "offline" })}>Review offline behavior</button>
      <small>Repository policy: {label(policyState)}. Live status is established only by the server response above.</small>
    </aside>
  </section>;
}

function LiveSessionWorkspace({
  headingRef,
  liveAuthResult,
  openCommandOverview,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  liveAuthResult: BrowserAuthResult;
  openCommandOverview: () => void;
}) {
  return <section className="auth-detail-shell live-session-workspace">
    <span className="eyebrow">Authenticated CASTRA · server boundary</span>
    <h1 ref={headingRef} tabIndex={-1}>Commander access</h1>
    <p className="auth-lede">This identity may hold Commander and Product Owner authority, but the authority assignments remain separate. A foundational action still requires a fresh, action-bound password step-up.</p>
    <div className="auth-review-question-grid">
      <article><strong>Identity</strong><p>Opaque server identity reference received. No provider token is exposed to browser JavaScript.</p></article>
      <article><strong>Authorities</strong><p>{liveAuthResult.receipt?.authorities.join(" · ") || "No current authority evidence"}</p></article>
      <article><strong>Session ceilings</strong><p>Seven days idle · thirty days absolute · login remains available at any time.</p></article>
    </div>
    <div className="auth-scenario-actions">
      <button className="button button-primary" onClick={openCommandOverview}>Open Command Overview</button>
    </div>
    <p className="auth-form-boundary">Use the authenticated <strong>Session &amp; Access</strong> control in the page header for current-device logout, guarded revoke-all, and the 15-minute Product Owner proof. Those controls remain reachable from every post-login page and on mobile.</p>
  </section>;
}

function AuthStateGallery({
  headingRef,
  dispatch,
  digest,
  baseline,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  dispatch: (event: AuthExperienceEvent) => void;
  digest: string;
  baseline: string;
}) {
  const [group, setGroup] = useState<AuthUiGroup | "all">("all");
  const [stateClass, setStateClass] = useState<AuthUiStateClass | "all">("all");
  const groups = useMemo(() => [...new Set(AUTH_UI04_SCENARIOS.map((item) => item.group))], []);
  const visible = AUTH_UI04_SCENARIOS.filter((item) => (group === "all" || item.group === group) && (stateClass === "all" || item.stateClass === stateClass));

  return <>
    <ReviewBoundary digest={digest} baseline={baseline} />
    <div className="page-heading auth-gallery-heading">
      <div><span className="eyebrow">UI-04 review packet · {AUTH_UI04_MANIFEST.stateClasses.length} state classes</span><h1 ref={headingRef} tabIndex={-1}>Welcome &amp; authentication state gallery</h1><p>Inspect representative populated states. This gallery is memory-only, reload-reset, provider-disabled, and structurally separate from authoritative CASTRA commands.</p></div>
      <span className="integrity-mark">{AUTH_UI04_SCENARIOS.length} FIXED SCENARIOS</span>
    </div>
    <div className="auth-gallery-filters" aria-label="Authentication state filters">
      <label>Workflow<select value={group} onChange={(event) => setGroup(event.target.value as AuthUiGroup | "all")}><option value="all">All workflows</option>{groups.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
      <label>State class<select value={stateClass} onChange={(event) => setStateClass(event.target.value as AuthUiStateClass | "all")}><option value="all">All states</option>{AUTH_UI04_MANIFEST.stateClasses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
      <span role="status">Showing {visible.length} of {AUTH_UI04_SCENARIOS.length}</span>
    </div>
    <div className="auth-gallery-grid">
      {visible.map((item) => <article key={item.id}>
        <div><span className="record-id">{item.id}</span><StateBadge stateClass={item.stateClass} labelText={item.statusLabel} /></div>
        <small>{historicalDeferred(item.group) ? "Historical / deferred · " : ""}{label(item.group)} · {item.screen}</small>
        <h2>{item.heading}</h2>
        <p>{item.summary}</p>
        <button className="button button-quiet" onClick={() => dispatch({ type: "inspect_scenario", scenarioId: item.id })} aria-label={`Inspect ${item.heading}`}>Inspect scenario</button>
      </article>)}
    </div>
    {visible.length === 0 && <div className="empty-state" role="status">No deterministic scenarios match these filters.</div>}
  </>;
}
