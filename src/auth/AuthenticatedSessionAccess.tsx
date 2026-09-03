import { useState } from "react";
import type { AuthExperienceMode } from "./deterministicAuthUi";
import type { BrowserAuthResult } from "./liveAuthClient";
import { submitProductOwnerStepUpForm } from "./productOwnerStepUpForm";

export type SessionAccessAction = "logout_current" | "revoke_all";

export interface SessionAccessHandlers {
  logoutLive: () => Promise<BrowserAuthResult>;
  revokeAllLive: () => Promise<BrowserAuthResult>;
  stepUpLive: (input: {
    emailAddress: string;
    password: string;
    currentIdentityReference: string;
    sensitiveAction: "foundation_manifest_change";
  }) => Promise<BrowserAuthResult>;
  logoutTest: () => void;
}

export function sessionAccessVisible(mode: AuthExperienceMode): boolean {
  return mode === "authenticated_live" || mode === "authenticated_test";
}

export async function runSessionAccessAction(
  mode: AuthExperienceMode,
  action: SessionAccessAction,
  handlers: SessionAccessHandlers,
): Promise<BrowserAuthResult | null> {
  if (mode === "authenticated_live") {
    return action === "logout_current" ? handlers.logoutLive() : handlers.revokeAllLive();
  }
  if (mode === "authenticated_test" && action === "logout_current") handlers.logoutTest();
  return null;
}

export function AuthenticatedSessionAccess({ mode, liveAuthResult, handlers }: {
  mode: AuthExperienceMode;
  liveAuthResult: BrowserAuthResult;
  handlers: SessionAccessHandlers;
}) {
  const [pending, setPending] = useState<SessionAccessAction | "step_up" | null>(null);
  const [revokeConfirmationOpen, setRevokeConfirmationOpen] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  if (!sessionAccessVisible(mode)) return null;

  const live = mode === "authenticated_live";
  const authorities = live
    ? liveAuthResult.receipt?.authorities.join(" · ") || "Authority evidence unavailable"
    : "Commander · Product Owner · deterministic test only";
  const identityReference = liveAuthResult.receipt?.identityReference ?? "";
  const hasProductOwner = liveAuthResult.receipt?.authorities.includes("Product Owner") ?? false;

  async function perform(action: SessionAccessAction) {
    if (pending) return;
    setPending(action);
    try {
      const result = await runSessionAccessAction(mode, action, handlers);
      if (result) setMessage(result.publicMessage);
    } finally {
      setPending(null);
      setRevokeConfirmationOpen(false);
    }
  }

  async function requestStepUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!live || !identityReference || !hasProductOwner || pending) return;
    setPending("step_up");
    try {
      const submitted = await submitProductOwnerStepUpForm(
        event.currentTarget,
        identityReference,
        handlers.stepUpLive,
        () => { setEmailAddress(""); setPassword(""); },
      );
      setMessage(submitted.publicMessage);
    } finally {
      setPending(null);
    }
  }

  return <details className="session-access-control">
    <summary aria-label="Open Session and Access controls">
      <span>Session &amp; Access</span>
      <small>{live ? "Server authenticated" : "Test session"}</small>
    </summary>
    <section className="session-access-panel" aria-label="Session and Access">
      <div className="session-access-status" role="status">
        <span>Session</span>
        <strong>{live ? "Active · server managed" : "Active · deterministic test"}</strong>
        <span>Authorities</span>
        <strong>{authorities}</strong>
        <small>Provider tokens remain outside browser storage and page content.</small>
      </div>
      <div className="session-access-actions">
        <button className="button button-quiet" disabled={Boolean(pending)} onClick={() => void perform("logout_current")}>Log out this device</button>
        {live && <button className="button button-accent session-step-up-review" disabled={Boolean(pending) || !hasProductOwner || !identityReference} aria-expanded={stepUpOpen} onClick={() => setStepUpOpen((current) => !current)}>Review Product Owner proof</button>}
        {!revokeConfirmationOpen && <button className="button button-danger session-revoke-review" disabled={Boolean(pending) || !live} aria-describedby="revoke-all-description" onClick={() => setRevokeConfirmationOpen(true)}>Review revoke all sessions</button>}
      </div>
      <p id="revoke-all-description" className="session-revoke-description">Revoke-all is a separate security action. It signs out every CASTRA device and cannot be triggered by opening this menu.</p>
      {revokeConfirmationOpen && <div className="session-revoke-confirmation" role="alert">
        <strong>Revoke every CASTRA session?</strong>
        <p>Use only for account risk, device loss, or the final revocation test.</p>
        <div>
          <button className="button button-quiet" disabled={Boolean(pending)} onClick={() => setRevokeConfirmationOpen(false)}>Cancel</button>
          <button className="button button-danger" disabled={Boolean(pending)} onClick={() => void perform("revoke_all")}>Confirm revoke all sessions</button>
        </div>
      </div>}
      {live && stepUpOpen && <form className="session-step-up-form" onSubmit={requestStepUp}>
        <strong>Product Owner proof only</strong>
        <p>Exact action class: <code>foundation_manifest_change</code>. A successful proof lasts 15 minutes and performs no Foundation Manifest or protected mutation.</p>
        <label>Email address<input name="emailAddress" type="email" autoComplete="username" value={emailAddress} onChange={(event) => setEmailAddress(event.target.value)} required disabled={Boolean(pending)} /></label>
        <label>Current CASTRA password<input name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={Boolean(pending)} /></label>
        <div>
          <button className="button button-quiet" type="button" disabled={Boolean(pending)} onClick={() => { setStepUpOpen(false); setEmailAddress(""); setPassword(""); }}>Cancel</button>
          <button className="button button-accent" type="submit" disabled={Boolean(pending) || !hasProductOwner || !identityReference}>Confirm 15-minute proof</button>
        </div>
      </form>}
      {!live && <small className="session-access-unavailable">Provider-backed step-up and revoke-all are unavailable because deterministic test access has no provider session.</small>}
      {message && <div className="auth-live-status" aria-live="polite">{message}</div>}
    </section>
  </details>;
}
