import { useMemo, useState } from "react";
import { observedRuntime } from "../domain/aerarium";
import { currentPresentation } from "../domain/presentation";
import type { Action, Campaign, CastraState, SargeEngagementTarget } from "../domain/types";
import { GraphWorkspace } from "../graph/GraphWorkspace";
import {
  C001_SOURCE_BUNDLE_REVISION,
  C001_SOURCE_MANIFEST,
  c001SourceForRecord,
} from "../data/c001SourceBundle";
import {
  DEMO_SYNTHETIC_COST_SERIES,
  DEMO_SYNTHETIC_EFFORT_SERIES,
  demoSyntheticMeasure,
} from "../demo/demoStewardship";
import { buildCommandOverviewRollup, type CommandOverviewPortfolioHealth } from "./commandOverviewRollup";

export type CampaignWorkspaceSection = "summary" | "testing" | "audit" | "team" | "stewardship";

/**
 * C001.M016 CAPTURE-02 — the public projection of one observed WebMCP
 * invocation.
 *
 * This is presentation input only, and it is deliberately the whole of what this
 * component may render about a tool call: a page-local ordinal, the exact
 * canonical tool name, the tool's own declared classification, and whether the
 * call completed or was refused. There is no field for the input, the result,
 * the response text, a refusal message, a record identifier, a revision, a
 * timestamp, or any operational value, so this surface cannot display a payload
 * even if a caller had one. The sanitizing is done upstream, in
 * `src/webmcp/registration.ts`; this type keeps the same bound visible at the
 * component boundary.
 */
export interface CommandOverviewWebMcpStep {
  readonly sequence: number;
  readonly tool: string;
  readonly classification: "read_only" | "proposal";
  readonly outcome: "complete" | "refused";
}

/**
 * The memory-only activity the application holds for the active experience.
 *
 * `expectedReadOnlyTools` names the read-only tools this experience expects to
 * observe, so the progression denominator is derived from the declared tool
 * surface rather than a hard-coded number, and a call to any other registered
 * tool is shown honestly without advancing it.
 */
export interface CommandOverviewWebMcpActivity {
  readonly expectedReadOnlyTools: readonly string[];
  readonly steps: readonly CommandOverviewWebMcpStep[];
}

interface Props {
  state: CastraState;
  openCampaign: (id: string, section?: CampaignWorkspaceSection, checkpointId?: string | null) => void;
  openPortfolio: () => void;
  openSource: (sourceType: string, sourceId: string) => void;
  createCampaign: () => void;
  engageSarge: (target: SargeEngagementTarget) => void;
  demoMode?: boolean;
  /**
   * Supplied only while a WebMCP experience is bound. When it is absent this
   * component renders exactly as before, so no page without a registered tool
   * surface gains a strip, a row, or a single pixel of height.
   */
  webMcpActivity?: CommandOverviewWebMcpActivity;
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function money(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
}

function duration(ms: number): string {
  const hours = ms / 3_600_000;
  return hours < 1 ? `${Math.round(ms / 60_000)} min` : `${hours.toFixed(2)} h`;
}

function portfolioHealthLabel(health: CommandOverviewPortfolioHealth): string {
  return health === "blocked" ? "Blocked" : health === "attention" ? "Needs attention" : "On track";
}

function portfolioHealthStatusClass(health: CommandOverviewPortfolioHealth): string {
  return health === "blocked" ? "status status-blocked" : health === "attention" ? "status status-active" : "status status-completed";
}

function roleFromAction(action: Action): string {
  return action.notes.match(/Assigned canonical role:\s*([^\.]+)\./)?.[1]?.trim() || "UNAVAILABLE";
}

/**
 * Compact KPI tile. Always renders the dense, label-beside-value "micro" row
 * layout (`command-overview-micro-kpi`, appended in src/styles.css) — this is
 * a module-private helper used only inside this file, so tightening its
 * layout here cannot affect the visually similar but independent
 * `CampaignKpi` in src/App.tsx or the shared `.overview-kpi`/`.overview-kpi-grid`
 * base rules other workspaces rely on. The decorative "Open →" affordance is
 * dropped (it was `aria-hidden`, purely visual); the tile remains a real
 * `<button>` with its existing hover/cursor affordance and unchanged
 * `aria-describedby` tooltip wiring.
 *
 * R3: the shared `.overview-kpi.compact-kpi` rule (also used by App.tsx's
 * `CampaignKpi`) sets `min-height: 88px` at two-class specificity, which was
 * silently beating this file's one-class `.command-overview-micro-kpi {
 * min-height: 0 }` override regardless of source order, so the tile never
 * actually shrank to its dense row content. styles.css now qualifies that
 * override (and the value's font-size) with the full three-class compound
 * selector `.overview-kpi.compact-kpi.command-overview-micro-kpi` — the
 * exact className string this component renders below — so it wins on
 * specificity, not source order, while the shared two-class rule itself, and
 * `CampaignKpi`, stay byte-for-byte untouched.
 */
function CompactKpi({ id, label, value, help, onClick, synthetic = false }: {
  id: string;
  label: string;
  value: string | number;
  help: string;
  onClick: () => void;
  synthetic?: boolean;
}) {
  const helpId = `${id}_help`;
  return <div className="compact-kpi-wrap">
    <button className="overview-kpi compact-kpi command-overview-micro-kpi" onClick={onClick} aria-describedby={helpId}>
      <span>{label}{synthetic ? "*" : ""}</span><strong>{value}</strong>
    </button>
    <span className="kpi-tooltip" id={helpId} role="tooltip">{help}</span>
  </div>;
}

/**
 * C001.M016 CAPTURE-02 — the visible WebMCP activity strip.
 *
 * CAPTURE-01 proved the native read-only calls succeeded while the page stayed
 * visually static, so the recording could not show that the on-screen work was
 * caused by WebMCP. This strip is driven only by the sanitized events the
 * registered tool callbacks actually produced: there is no timer, no interval,
 * no animation, no fixture, no video controller, and no synthetic progression
 * anywhere in this component, so a state shown here happened because a tool ran.
 *
 * The progression is counted honestly. A step advances the counter only when a
 * declared expected read-only tool completes for the first time, so a refusal, a
 * repeat call, and a proposal-tool call are each displayed with the count left
 * exactly where it was rather than implying progress that did not occur. Only
 * the two most recent steps are rendered, with any earlier ones counted in a
 * leading note, so the strip stays one compact line no matter how many calls a
 * page receives.
 */
const WEBMCP_VISIBLE_STEP_LIMIT = 2;

function webMcpClassificationLabel(classification: CommandOverviewWebMcpStep["classification"]): string {
  return classification === "read_only" ? "read only" : "proposal";
}

function WebMcpActivityStrip({ activity }: { activity: CommandOverviewWebMcpActivity }) {
  const expected = activity.expectedReadOnlyTools.length;
  const completedExpectedTools = new Set<string>();
  const rows = activity.steps.map((step) => {
    if (
      step.outcome === "complete"
      && step.classification === "read_only"
      && activity.expectedReadOnlyTools.includes(step.tool)
    ) {
      completedExpectedTools.add(step.tool);
    }
    return {
      sequence: step.sequence,
      outcome: step.outcome,
      // The exact one-line progression the CAPTURE-02 plan requires, assembled
      // only from the four sanitized fields above.
      label: `${completedExpectedTools.size}/${expected} · ${step.tool} · ${step.outcome} · ${webMcpClassificationLabel(step.classification)}`,
    };
  });
  const visible = rows.slice(-WEBMCP_VISIBLE_STEP_LIMIT);
  const earlier = rows.length - visible.length;
  const summary = rows.length === 0
    ? `Ready · 0/${expected}`
    : `Observed · ${completedExpectedTools.size}/${expected}`;

  return <div className="command-overview-webmcp-strip" role="status" aria-live="polite" aria-label="WebMCP activity">
    <span className="eyebrow">WebMCP activity</span>
    <span className="command-overview-webmcp-summary">{summary}</span>
    {rows.length === 0
      ? <span className="command-overview-webmcp-empty">No registered tool has been invoked yet.</span>
      : <>
        {earlier > 0 && <span className="command-overview-webmcp-earlier">+{earlier} earlier</span>}
        {/* `role="list"` is kept explicitly because the strip's CSS sets
            `list-style: none`, which drops native list semantics in some
            browsers; the ordered list itself, and each step's own text, stay
            available to a screen reader. */}
        <ol className="command-overview-webmcp-steps" role="list">
          {visible.map((row) => <li key={row.sequence} className={row.outcome === "refused" ? "webmcp-step is-refused" : "webmcp-step"}>{row.label}</li>)}
        </ol>
      </>}
  </div>;
}

function StewardshipDetail({ demoMode, state, close }: { demoMode: boolean; state: CastraState; close: () => void }) {
  const cost = demoSyntheticMeasure("demo_synthetic_cost_total");
  const effort = demoSyntheticMeasure("demo_synthetic_effort_total");
  const maxCost = Math.max(...DEMO_SYNTHETIC_COST_SERIES.map((item) => item.value));
  const maxEffort = Math.max(...DEMO_SYNTHETIC_EFFORT_SERIES.map((item) => item.value));
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}>
    <section className="modal stewardship-detail" role="dialog" aria-modal="true" aria-labelledby="stewardship-detail-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-heading"><div><span className="eyebrow">AERARIUM · provenance kept separate</span><h2 id="stewardship-detail-title">Cost & Effort Stewardship</h2></div><button className="icon-button" aria-label="Close stewardship detail" onClick={close}>×</button></div>
      {demoMode ? <>
        <section className="synthetic-boundary"><strong>Synthetic Demo-only presentation data*</strong><span>These figures demonstrate graphics only and never enter CASTRA Runs, measures, authoritative records, or provider evidence.</span></section>
        <div className="stewardship-chart-grid">
          <section><h3>{cost.label} · {money(cost.value)}*</h3>{DEMO_SYNTHETIC_COST_SERIES.map((item) => <div className="chart-row" key={item.id}><span>{item.label}*</span><div><i style={{ width: `${(item.value / maxCost) * 100}%` }} /></div><strong>{money(item.value)}*</strong></div>)}</section>
          <section><h3>{effort.label} · {effort.value.toFixed(1)} h*</h3>{DEMO_SYNTHETIC_EFFORT_SERIES.map((item) => <div className="chart-row" key={item.id}><span>{item.label}*</span><div><i style={{ width: `${(item.value / maxEffort) * 100}%` }} /></div><strong>{item.value.toFixed(1)} h*</strong></div>)}</section>
        </div>
      </> : <div className="aer-measure-grid">
        <article className="aer-measure"><span>Observed runtime</span><strong>{state.aerariumRuns.length ? "Available in Campaign detail" : "Unavailable"}</strong><small>No authoritative C001 Run/Event timestamps were bundled.</small></article>
        <article className="aer-measure"><span>Provider actual</span><strong>Unavailable</strong><small>No provider-actual evidence was bundled.</small></article>
        <article className="aer-measure"><span>Subscription allocation</span><strong>Unavailable</strong><small>No eligible runtime denominator and plan snapshot were bundled.</small></article>
        <article className="aer-measure"><span>API-equivalent estimate</span><strong>Unavailable</strong><small>No applicable price-card/profile snapshot was bundled; API use remains exception-only.</small></article>
      </div>}
      <div className="modal-actions"><button className="button button-primary" onClick={close}>Close</button></div>
    </section>
  </div>;
}

export function CommandOverview({ state, openCampaign, openPortfolio, openSource, createCampaign, engageSarge, demoMode = false, webMcpActivity }: Props) {
  const [graphOpen, setGraphOpen] = useState(false);
  const [stewardshipOpen, setStewardshipOpen] = useState(false);
  const activeCampaigns = state.campaigns.filter((record) => !record.archivedAt);
  const activeMissions = state.missions.filter((record) => !record.archivedAt);
  const activeActions = state.actions.filter((record) => !record.archivedAt);
  const completedActions = activeActions.filter((record) => record.status === "completed");
  const blockedActions = activeActions.filter((record) => record.status === "blocked");
  const openPunches = state.punchItems.filter((item) => ["open", "in_remediation", "ready_for_verification"].includes(item.status));
  const commanderReviews = state.uiReviewCheckpoints.filter((item) => item.status === "ready_for_review" || item.status === "rework_required");
  const pendingApprovals = [...activeCampaigns, ...activeMissions, ...activeActions].filter((record) => !record.approval);
  const openWork = state.openWorkIndex;
  const openWorkCounts = {
    blocked: openWork.filter((entry) => entry.state === "blocked").length,
    review: openWork.filter((entry) => entry.state === "commander_review").length,
    ready: openWork.filter((entry) => entry.state === "ready_for_mission_closure").length,
    reconciliation: openWork.filter((entry) => entry.state === "reconciliation_required").length,
  };
  const rollup = useMemo(() => buildCommandOverviewRollup(state, new Date().toISOString()), [state]);
  // Single source string for the header's one-line "Next permitted action" —
  // identical derivation to the inline ternary it replaces (R2), computed
  // once so the compact header can CSS-truncate it to one line (full text
  // stays in the DOM/accessible name and in the element's `title`; nothing
  // is shortened or hidden from CommandOverview.test.tsx's plain substring
  // assertions) without duplicating the expression.
  const nextPermittedActionText = rollup.nextPermittedAction.available
    ? `${rollup.nextPermittedAction.title} — ${rollup.nextPermittedAction.nextGate}`
    : rollup.nextPermittedAction.title;
  const activePresentation = currentPresentation(state);
  const comicCommand = demoMode && activePresentation.themeProfileId === "comic_command";
  const galacticCommand = demoMode && activePresentation.themeProfileId === "galactic_command_bridge";
  const modelDefaults = activePresentation.modelSelections;
  const rolePerformance = activePresentation.roles.map((role) => {
    const actions = activeActions.filter((action) => roleFromAction(action) === role.canonicalId);
    const campaignIds = new Set(actions.map((action) => state.missions.find((item) => item.id === action.missionId)?.campaignId).filter(Boolean));
    const runs = state.aerariumRuns.filter((run) => run.roleId === role.canonicalId);
    const effort = runs.reduce((sum, run) => sum + observedRuntime(state, run.id, new Date().toISOString()).activeRuntimeMs, 0);
    return { role, actions, campaignCount: campaignIds.size, effort, selection: modelDefaults.find((item) => item.canonicalId === role.canonicalId) };
  });
  const demoCost = demoSyntheticMeasure("demo_synthetic_cost_total");
  const demoEffort = demoSyntheticMeasure("demo_synthetic_effort_total");
  const firstCampaignId = activeCampaigns[0]?.id;

  // Full, uncapped KPI set — unchanged from the pre-rework single screen.
  // Every tile still exists and still works; it is relocated into the
  // closed-by-default detail drawer below rather than deleted, so no
  // shortcut or destination is lost, only de-duplicated off the compact
  // primary band.
  const operationalKpis = [
    { id: "campaigns", label: "Campaigns", value: activeCampaigns.length, help: `${activeMissions.length} Missions and ${activeActions.length} Actions. Opens the running Campaign portfolio.`, action: openPortfolio },
    { id: "actions", label: "Actions complete", value: `${completedActions.length}/${activeActions.length}`, help: "Completed Actions over all non-archived Actions. Opens Campaigns.", action: openPortfolio },
    { id: "testing", label: "Testing & Punch", value: `${state.testResults.length}/${openPunches.length}`, help: "Test Results / open Punch Items. Opens the first governing Campaign tracking surface.", action: () => firstCampaignId && openCampaign(firstCampaignId, "testing") },
    { id: "reviews", label: "UI review gates", value: commanderReviews.length, help: "Review-ready or Rework-required UI checkpoints. Opens exact Campaign tracking.", action: () => firstCampaignId && openCampaign(firstCampaignId, "testing", commanderReviews[0]?.id) },
    { id: "audit", label: "Audit evidence", value: state.auditEvents.length, help: state.auditEvents.length ? "Ordered deterministic local audit events." : "Historical source audit timestamps are unavailable in the C001 bundle.", action: () => firstCampaignId && openCampaign(firstCampaignId, "audit") },
    { id: "blockers", label: "Blockers", value: blockedActions.length + openPunches.filter((item) => ["critical", "high"].includes(item.severity)).length, help: "Blocked Actions plus unresolved high/critical Punch Items.", action: openPortfolio },
    { id: "review", label: "Commander review", value: commanderReviews.length + pendingApprovals.length, help: "Exact UI checkpoints plus records with unavailable direct approval evidence.", action: () => firstCampaignId && openCampaign(firstCampaignId, "testing", commanderReviews[0]?.id) },
    { id: "agents", label: "Agent assignments", value: rolePerformance.filter((item) => item.actions.length).length, help: "Configured roles with source-backed assigned Actions. Opens Meet the Team.", action: () => firstCampaignId && openCampaign(firstCampaignId, "team") },
  ];

  // Concise primary-band KPI set for the fixed one-screen viewport: portfolio
  // scale, completion, risk, decisions-needed, and spend/time. Every value,
  // help string, and onClick is copied verbatim from the existing stewardship
  // and operational KPI definitions above/below (no new derivation), so the
  // compact band cannot drift from the full data. Testing & Punch, UI review
  // gates, Audit evidence, Agent assignments, Provider actual, and
  // API-equivalent stay reachable via the drawer below, the Cost/Effort
  // tiles' existing stewardship dialog, and ordinary sidebar navigation —
  // none of those destinations are removed.
  const primaryKpis: Array<{ id: string; label: string; value: string | number; help: string; action: () => void; synthetic: boolean }> = [
    { id: "campaigns", label: "Campaigns", value: activeCampaigns.length, help: `${activeMissions.length} Missions and ${activeActions.length} Actions. Opens the running Campaign portfolio.`, action: openPortfolio, synthetic: false },
    { id: "actions", label: "Actions complete", value: `${completedActions.length}/${activeActions.length}`, help: "Completed Actions over all non-archived Actions. Opens Campaigns.", action: openPortfolio, synthetic: false },
    { id: "blockers", label: "Blockers", value: blockedActions.length + openPunches.filter((item) => ["critical", "high"].includes(item.severity)).length, help: "Blocked Actions plus unresolved high/critical Punch Items.", action: openPortfolio, synthetic: false },
    { id: "review", label: "Commander review", value: commanderReviews.length + pendingApprovals.length, help: "Exact UI checkpoints plus records with unavailable direct approval evidence.", action: () => firstCampaignId && openCampaign(firstCampaignId, "testing", commanderReviews[0]?.id), synthetic: false },
    { id: "cost", label: "Cost", value: demoMode ? `${money(demoCost.value)}*` : "Unavailable", help: demoMode ? demoCost.explanation : "Unavailable — no authoritative provider actual, subscription allocation, or estimate inputs were bundled.", action: () => setStewardshipOpen(true), synthetic: demoMode },
    { id: "effort", label: "Effort", value: demoMode ? `${demoEffort.value.toFixed(1)} h*` : rollup.observedRuntimeMs ? duration(rollup.observedRuntimeMs) : "Unavailable", help: demoMode ? demoEffort.explanation : "Unavailable — no authoritative C001 Run/Event timestamps were bundled.", action: () => setStewardshipOpen(true), synthetic: demoMode },
  ];

  // Agent Team heartbeat band: same source filter as before, capped to one
  // guaranteed-single-row compact row. R3: the cap drops from 6 to 4 and the
  // grid becomes a fixed 4-column template (styles.css) rather than
  // auto-fit/minmax, because auto-fit's column count depends on the real
  // viewport's exact content width — at this page's real ~919px content
  // width, `auto-fit, minmax(150px,1fr)` fits only 5 of the prior 6 tiles
  // per row, silently wrapping the 6th onto a near-empty second row. A fixed
  // 4-column template always fits exactly 4 tiles on exactly one row. The
  // full, uncapped roster renders unchanged inside the detail drawer, and
  // "Meet the Team" reuses the exact pre-existing
  // openCampaign(firstCampaignId, "team") destination.
  const filteredRolePerformance = rolePerformance.filter((item) => item.actions.length || item.role.canonicalId === "COMMANDER_PRODUCT_OWNER");
  const visibleRolePerformance = filteredRolePerformance.slice(0, 4);
  const hiddenRoleCount = filteredRolePerformance.length - visibleRolePerformance.length;

  // Attention/decision band: blocked Actions first (they already outrank
  // reviews in the rollup's own priority order), then Commander-review
  // checkpoints, capped to 2 combined (R3, was 3) so the band stays concise
  // regardless of real portfolio size. The complete, uncapped queue (with
  // descriptions) renders unchanged inside the detail drawer.
  const attentionTotal = blockedActions.length + commanderReviews.length;
  const visibleBlocked = blockedActions.slice(0, 2);
  const visibleReviews = commanderReviews.slice(0, Math.max(0, 2 - visibleBlocked.length));
  const hiddenAttentionCount = attentionTotal - visibleBlocked.length - visibleReviews.length;

  return <div className="command-overview-shell">
    <div className="page-heading sticky-page-heading command-overview-heading">
      <div className="command-overview-heading-primary"><span className="eyebrow">{comicCommand ? "Public-safe C001 edition · transient panels" : demoMode ? "Public-safe C001 baseline · transient changes" : "C001 portfolio · local authoritative workspace"}</span><h1>Command Overview</h1><p className="visually-hidden">{comicCommand ? "Campaign dispatches, evidence alerts, and Commander decisions—same governed facts, four-color presentation." : "Cross-Campaign stewardship, blockers, evidence, and Commander decisions."}</p>
        <div className="command-health-strip" role="status" aria-label="Portfolio health and next permitted action">
          <span className={portfolioHealthStatusClass(rollup.portfolioHealth)}>{portfolioHealthLabel(rollup.portfolioHealth)}</span>
          <span className="next-permitted-action"><strong>Next permitted action:</strong><span className="next-permitted-action-text" title={nextPermittedActionText}>{nextPermittedActionText}</span></span>
        </div>
        {webMcpActivity && <WebMcpActivityStrip activity={webMcpActivity} />}
      </div>
      <div className="record-controls"><span className="integrity-mark">{C001_SOURCE_BUNDLE_REVISION}</span><button className="button button-accent" onClick={() => engageSarge({ type: "command_overview", id: "command-overview", revision: 0, label: "Command Overview" })}>Engage SARGE</button><button className="button button-primary" onClick={createCampaign}>＋ New Campaign</button></div>
    </div>

    <section className="command-overview-kpi-band" aria-labelledby="command-overview-kpi-label">
      <div className="command-overview-band-heading">
        <span className="eyebrow" id="command-overview-kpi-label">Portfolio KPIs</span>
        <button className="button button-quiet button-small" onClick={() => setStewardshipOpen(true)}>Cost & Effort detail</button>
      </div>
      <div className="command-overview-kpi-grid">{primaryKpis.map((kpi) => <CompactKpi key={kpi.id} id={kpi.id} label={kpi.label} value={kpi.value} help={kpi.help} onClick={kpi.action} synthetic={kpi.synthetic} />)}</div>
    </section>

    <section className="command-overview-agent-band" aria-labelledby="command-overview-agent-label">
      <div className="command-overview-band-heading">
        <span className="eyebrow" id="command-overview-agent-label">Agent Team · cross-Campaign heartbeat</span>
        <button className="button button-quiet button-small" onClick={() => firstCampaignId && openCampaign(firstCampaignId, "team")}>Meet the Team</button>
      </div>
      <div className="agent-performance-strip command-overview-agent-strip">{visibleRolePerformance.map(({ role, actions, campaignCount, effort }) => <button key={role.canonicalId} title={`${role.displayName} · protected ${role.canonicalId}`} onClick={() => firstCampaignId && openCampaign(firstCampaignId, "team")}><strong>{role.displayName}</strong><span>{actions.length} Actions · {campaignCount} Campaigns · {effort ? duration(effort) : "effort unavailable"}</span></button>)}</div>
      {hiddenRoleCount > 0 && <p className="command-overview-overflow-note">+{hiddenRoleCount} more configured role{hiddenRoleCount === 1 ? "" : "s"} in the detail drawer and Meet the Team.</p>}
    </section>

    <section className="command-overview-attention-band" aria-labelledby="command-overview-attention-label">
      <div className="command-overview-band-heading">
        <span className="eyebrow" id="command-overview-attention-label">Decision queue</span>
      </div>
      <p className="command-overview-status-line">
        <strong>{openWork.length}</strong> open · <strong className={openWorkCounts.blocked ? "attention-figure" : ""}>{openWorkCounts.blocked}</strong> blocked · <strong>{openWorkCounts.review}</strong> Commander review · <strong>{openWorkCounts.ready}</strong> ready to close · <strong className={openWorkCounts.reconciliation ? "attention-figure" : ""}>{openWorkCounts.reconciliation}</strong> reconciliation
      </p>
      <div className="overview-queue command-overview-attention-list">
        {visibleBlocked.map((action) => <article className="review-queue-card" key={action.id}><button onClick={() => openSource("action", action.id)}><span className="status status-blocked">Blocked</span><strong title={action.title}>{action.title}</strong></button><button className="button button-quiet button-small" onClick={() => engageSarge({ type: "action", id: action.id, revision: action.revision, label: action.title })}>Engage SARGE</button></article>)}
        {visibleReviews.map((checkpoint) => <article className="review-queue-card" key={checkpoint.id}><button onClick={() => firstCampaignId && openCampaign(firstCampaignId, "testing", checkpoint.id)}><span className={`status status-${checkpoint.status === "rework_required" ? "blocked" : "draft"}`}>Commander review</span><strong title={`${checkpoint.code} · ${checkpoint.name}`}>{checkpoint.code} · {checkpoint.name}</strong></button><button className="button button-quiet button-small" onClick={() => engageSarge({ type: "ui_review_checkpoint", id: checkpoint.id, revision: checkpoint.revision, label: `${checkpoint.code} · ${checkpoint.name}` })}>Engage SARGE</button></article>)}
        {attentionTotal === 0 && <div className="inline-empty compact">No source-backed blocker or Commander-review item is currently recorded.</div>}
      </div>
      {hiddenAttentionCount > 0 && <p className="command-overview-overflow-note">Showing {visibleBlocked.length + visibleReviews.length} of {attentionTotal} blockers/reviews. Full list is in the detail drawer below.</p>}
    </section>

    <details className="command-overview-detail-drawer">
      {/* R3: shortened from the R2 wording ("Open Work rows, Campaigns, Cost
          & Effort stewardship, full Agent Team roster, Commander Graph, and
          evidence & sources") — same five destinations, terser microcopy, so
          this toggle's own label reliably stays one line instead of risking
          a wrap onto a second. The destinations themselves are unchanged;
          only this summary control's description of them is tightened. */}
      <summary>More detail — Open Work, Campaigns, Stewardship, Team, Graph &amp; Evidence (closed by default)</summary>
      <div className="command-overview-detail-body">
        <section className="open-work-panel" aria-labelledby="command-open-work-index-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">M013 · deterministic hot context</span>
              <h2 id="command-open-work-index-title">Open Work Index</h2>
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

        <section className="overview-stewardship overview-stewardship-top">
          <div className="section-heading"><div><span className="eyebrow">{comicCommand ? "Treasury panel · measures never blended" : "AERARIUM · measures never blended"}</span><h2>Cost & Effort Stewardship</h2></div><button className="button button-quiet" onClick={() => setStewardshipOpen(true)}>{comicCommand ? "Open full panel" : "Open detailed graphics"}</button></div>
          <div className="overview-kpi-grid stewardship-kpis">
            <CompactKpi id="cost-full" label="Cost" value={demoMode ? `${money(demoCost.value)}*` : "Unavailable"} help={demoMode ? demoCost.explanation : "Unavailable — no authoritative provider actual, subscription allocation, or estimate inputs were bundled."} onClick={() => setStewardshipOpen(true)} synthetic={demoMode} />
            <CompactKpi id="effort-full" label="Effort" value={demoMode ? `${demoEffort.value.toFixed(1)} h*` : rollup.observedRuntimeMs ? duration(rollup.observedRuntimeMs) : "Unavailable"} help={demoMode ? demoEffort.explanation : "Unavailable — no authoritative C001 Run/Event timestamps were bundled."} onClick={() => setStewardshipOpen(true)} synthetic={demoMode} />
            <CompactKpi id="provider-full" label="Provider actual" value="Unavailable" help="No provider actual evidence was bundled. Demo synthetic figures are not provider actuals." onClick={() => setStewardshipOpen(true)} />
            <CompactKpi id="estimate-full" label="API-equivalent" value="Unavailable" help="No applicable price-card/profile snapshot was bundled. API use remains separately approved and exception-only." onClick={() => setStewardshipOpen(true)} />
          </div>
        </section>

        {/* id gets a "-full" suffix here only (the operationalKpis data itself is untouched)
            so this drawer copy's tooltip DOM ids never collide with band 2's primaryKpis,
            which reuse the same short ids ("campaigns", "actions", "blockers", "review"). */}
        <div className="overview-kpi-grid operational-kpis">{operationalKpis.map((kpi) => <CompactKpi key={kpi.id} id={`${kpi.id}-full`} label={kpi.label} value={kpi.value} help={kpi.help} onClick={kpi.action} />)}</div>

        <div className="overview-split">
          <section>
            <div className="section-heading"><div><span className="eyebrow">{comicCommand ? "Running dispatch file" : galacticCommand ? "Operational docket" : "Running portfolio"}</span><h2>{comicCommand ? "Campaign Dispatches" : galacticCommand ? "Campaign Operations" : "Campaigns"}</h2></div></div>
            <div className="campaign-running-list">{activeCampaigns.map((campaign) => {
              const missions = activeMissions.filter((mission) => mission.campaignId === campaign.id);
              const missionIds = new Set(missions.map((mission) => mission.id));
              const actions = activeActions.filter((action) => missionIds.has(action.missionId));
              const blockers = actions.filter((action) => action.status === "blocked").length;
              const planIds = new Set(state.uiReviewPlans.filter((plan) => plan.campaignId === campaign.id).map((plan) => plan.id));
              const reviews = state.uiReviewCheckpoints.filter((checkpoint) => planIds.has(checkpoint.planId) && ["ready_for_review", "rework_required"].includes(checkpoint.status)).length;
              return <article key={campaign.id}>
                <button className="campaign-running-main" onClick={() => openCampaign(campaign.id)}><span className="record-id">{campaign.id}</span><strong>{campaign.title}</strong><p>{campaign.commanderIntent || campaign.description || "Intent unavailable."}</p><div className="card-stats"><span>{actions.filter((action) => action.status === "completed").length}/{actions.length} Actions</span><span>{blockers} blockers</span><span>{reviews} reviews</span><span>{campaign.status}</span></div></button>
                <button className="button button-quiet" onClick={() => openCampaign(campaign.id)}>Open</button>
              </article>;
            })}</div>
          </section>
          <section>
            <div className="section-heading"><div><span className="eyebrow">{comicCommand ? "Commander alert board" : "Decision queues"}</span><h2>{comicCommand ? "Alerts & Reviews" : "Blockers & Reviews"}</h2></div></div>
            <div className="overview-queue">
              {blockedActions.map((action) => <article className="review-queue-card" key={action.id}><button onClick={() => openSource("action", action.id)}><span className="status status-blocked">Blocked</span><strong>{action.title}</strong><small>{action.description || "Reason unavailable in source record."}</small></button><button className="button button-quiet" onClick={() => engageSarge({ type: "action", id: action.id, revision: action.revision, label: action.title })}>Engage SARGE</button></article>)}
              {commanderReviews.map((checkpoint) => <article className="review-queue-card" key={checkpoint.id}><button onClick={() => firstCampaignId && openCampaign(firstCampaignId, "testing", checkpoint.id)}><span className={`status status-${checkpoint.status === "rework_required" ? "blocked" : "draft"}`}>Commander review</span><strong>{checkpoint.code} · {checkpoint.name}</strong><small>{checkpoint.scope}</small><span className="exact-link">Open exact {checkpoint.code} evidence/action →</span></button><button className="button button-quiet" onClick={() => engageSarge({ type: "ui_review_checkpoint", id: checkpoint.id, revision: checkpoint.revision, label: `${checkpoint.code} · ${checkpoint.name}` })}>Engage SARGE</button></article>)}
              {!blockedActions.length && !commanderReviews.length && <div className="inline-empty compact">No source-backed blocker or Commander-review item is currently recorded.</div>}
            </div>
          </section>
        </div>

        <section>
          <div className="section-heading"><div><span className="eyebrow">Cross-Campaign agent performance</span><h2>{comicCommand ? "League roster rollup" : "Configured team rollup"}</h2></div></div>
          <div className="agent-performance-strip">{filteredRolePerformance.map(({ role, actions, campaignCount, effort, selection }) => <button key={role.canonicalId} title={`${role.displayName} · protected ${role.canonicalId}`} onClick={() => firstCampaignId && openCampaign(firstCampaignId, "team")}><strong>{role.displayName}</strong><span>{actions.length} Actions · {campaignCount} Campaigns</span><small>Effort {effort ? duration(effort) : "unavailable"} · {selection?.runtimeClass.replaceAll("_", " ") ?? "model policy unavailable"}</small></button>)}</div>
        </section>

        <section className="overview-graph">
          <div className="section-heading"><div><span className="eyebrow">{comicCommand ? "On-demand relationship spotlight" : "On-demand relationship evidence"}</span><h2>Commander Graph</h2><p>CASTRA remains authoritative. External Graphify execution is unavailable/deferred; this local projection is read-only.</p></div><button className="button button-primary" aria-expanded={graphOpen} onClick={() => setGraphOpen((current) => !current)}>{graphOpen ? "Close relationship view" : comicCommand ? "Open spotlight" : "Open relationship view"}</button></div>
          {graphOpen && <GraphWorkspace state={state} embedded openSource={openSource} />}
        </section>

        <section className="source-callout"><strong>{comicCommand ? "Source-backed origin file" : "Evidence-backed bundled base"}</strong><span>{C001_SOURCE_MANIFEST.filter((item) => item.availability !== "redacted").length} source groups · sensitive identity/provider material excluded · no hosted sync claim</span></section>
      </div>
    </details>

    {stewardshipOpen && <StewardshipDetail demoMode={demoMode} state={state} close={() => setStewardshipOpen(false)} />}
  </div>;
}
