import { useState } from "react";
import { AerariumConfigurationWorkspace } from "../aerarium/AerariumWorkspace";
import { ConfigurationCenterWorkspace } from "../team-configuration/ConfigurationCenterWorkspace";
import type { ConfigurationConnectionProjection } from "../team-configuration/configurationCenter";
import { recommendedConfigurationPreferences } from "../team-configuration/configurationCenter";
import type { ConfigurationRoleId, RuntimePreference } from "../team-configuration/configurationCenter";
import type { CommandOverviewWebMcpActivity } from "../command/CommandOverview";
import { PUBLIC_DEMO_PRESENTATION_POLICY } from "../demo/publicDemoPresentation";
import { observedRuntime } from "../domain/aerarium";
import "./agentConfiguration.css";
import {
  AGENT_CONFIGURATION_LIFECYCLE,
  AUTHORITY_INVARIANT,
  CORE_SEPARATION_NOTICE,
  SELECTION_EFFECT_NOTICE,
  SPEND_BOUNDARY,
  VOICE_CAPABILITY_SEPARATION,
  VOICE_INTERACTION_SEMANTICS,
  capabilityClasses,
  optionsForClass,
  publicProjection,
  withheldSlotsForClass,
} from "./agentConfiguration";
import type { CapabilityOption } from "./agentConfiguration";
import {
  availableThemeProfiles,
  canonicalRoleNames,
  currentPresentation,
  rolePresentationTagline,
  roleIconChoices,
  roleIconGlyphs,
  themeProfile,
} from "../domain/presentation";
import { shortId } from "../domain/ids";
import type { CastraCommand, CastraState, RoleDisplayEntry, RoleLabelMode } from "../domain/types";

interface Props {
  state: CastraState;
  execute: (commands: CastraCommand[]) => Promise<boolean>;
  campaignId?: string | null;
  demoMode?: boolean;
}

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

const labelModes: Array<{ id: RoleLabelMode; name: string }> = [
  { id: "icon_only", name: "Icon only" },
  { id: "icon_compact", name: "Icon + compact code" },
  { id: "full_name", name: "Full themed name" },
];

function RoleEditModal({ entry, close, execute }: { entry: RoleDisplayEntry; close: () => void; execute: Props["execute"] }) {
  const [displayName, setDisplayName] = useState(entry.displayName);
  const [compactCode, setCompactCode] = useState(entry.compactCode);
  const [icon, setIcon] = useState(entry.icon);
  const [accentColor, setAccentColor] = useState(entry.accentColor);
  const [description, setDescription] = useState(entry.description);
  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const saved = await execute([{ type: "presentation.role.update", canonicalId: entry.canonicalId, displayName, compactCode, icon, accentColor, description }]);
    if (saved) close();
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="role-edit-title" onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-heading"><div><span className="eyebrow">Display-only Commander configuration</span><h2 id="role-edit-title">Configure {entry.displayName}</h2></div><button className="icon-button" aria-label="Close" onClick={close}>×</button></div>
    <form onSubmit={submit}>
      <div className="protected-role-id"><span>Protected canonical mapping</span><strong>{canonicalRoleNames[entry.canonicalId]}</strong><small>{entry.canonicalId} cannot be renamed, removed, or used to alter authority.</small></div>
      <label>Display name<input required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <div className="form-split"><label>Compact code<input required maxLength={12} value={compactCode} onChange={(event) => setCompactCode(event.target.value)} /></label><label>Icon choice<select value={icon} onChange={(event) => setIcon(event.target.value as RoleDisplayEntry["icon"])}>{roleIconChoices.map((choice) => <option key={choice} value={choice}>{roleIconGlyphs[choice]} {label(choice)}</option>)}</select></label></div>
      <label>Non-semantic accent color<div className="color-input"><input type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} /><input required pattern="#[0-9a-fA-F]{6}" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} /></div></label>
      <label>Description<textarea required maxLength={240} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <p className="form-note">These display settings never alter semantic status colors, approval gates, authority, or workflow responsibilities.</p>
      <div className="modal-actions"><button type="button" className="button button-quiet" onClick={close}>Cancel</button><button type="submit" className="button button-primary">Create display version</button></div>
    </form>
  </section></div>;
}

const DISCLOSURE_FIELD_LABELS: ReadonlyArray<readonly [keyof CapabilityOption, string]> = [
  ["compatibleWith", "Compatible with"],
  ["authorityImpact", "Authority impact"],
  ["dataSent", "Data sent"],
  ["retentionAssumption", "Retention assumption"],
  ["commercialRights", "Commercial rights"],
  ["costClass", "Cost class"],
  ["recoveryExitPath", "Recovery / exit path"],
  ["deploymentImplication", "Deployment implication"],
  ["qualificationState", "Qualification state"],
  ["confidentiality", "Value classification"],
];

/**
 * Disclosure-first, effect-free capability worksheet. It renders the portable
 * configuration model, marks nothing outside local component state, executes no
 * command, and never renders a private Commander selection or a secret.
 */
function AgentCapabilityWorksheet() {
  const [considered, setConsidered] = useState<Record<string, string>>({});
  const projection = publicProjection();
  function toggle(classId: string, optionId: string): void {
    setConsidered((current) => (current[classId] === optionId
      ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== classId))
      : { ...current, [classId]: optionId }));
  }
  return <>
    <div className="section-heading"><div><span className="eyebrow">Portable Commander configuration · disclosure before selection</span><h2>Agent Configuration — capability classes</h2><p>Replaceable runtime, adapter, voice, storage, deployment, and optional-service classes. Every option states its consequences before it can be marked, and no provider is named, chosen, activated, or recommended for you. {AGENT_CONFIGURATION_LIFECYCLE}.</p></div></div>

    <section className="agent-config-boundary">
      <strong>Nothing on this worksheet is applied, saved, or activated</strong>
      <p>{SELECTION_EFFECT_NOTICE}</p>
      <p>{AUTHORITY_INVARIANT}</p>
      <p>{SPEND_BOUNDARY}</p>
      <small>{CORE_SEPARATION_NOTICE}</small>
    </section>

    <div className="agent-config-legend">
      <article><span>Class 1</span><strong>Public default</strong><small>Shipped with CASTRA Core and safe to publish. Neutral by design: it chooses no provider for you.</small></article>
      <article><span>Class 2</span><strong>Sanitized example</strong><small>Synthetic illustration only. It contains no real account, record, endpoint, device, or provider evidence and is never a deployment input.</small></article>
      <article><span>Class 3</span><strong className="agent-config-withheld-mark">Private Commander selection</strong><small>Your own answers. They live in your private Deployment Pack, never in CASTRA Core, and are never rendered here or in public output.</small></article>
      <article><span>Class 4</span><strong className="agent-config-withheld-mark">Secret</strong><small>Environment or secret store only. Never a repository file, a receipt, a chat, a screenshot, or this surface.</small></article>
    </div>

    <div className="agent-config-voice-semantics">
      {VOICE_INTERACTION_SEMANTICS.map((semantic) => <article key={semantic.id}>
        <strong>{semantic.name}</strong>
        <p>{semantic.rule}</p>
        <p className="agent-config-never">{semantic.neverClaim}</p>
      </article>)}
    </div>

    {capabilityClasses().map((definition) => {
      const withheld = withheldSlotsForClass(definition.id);
      return <section className="agent-config-class" key={definition.id} aria-labelledby={`agent-config-${definition.id}`}>
        <div className="agent-config-class-heading">
          <h3 id={`agent-config-${definition.id}`}>{definition.name}</h3>
          <p>{definition.purpose}</p>
          <span className="agent-config-authority">{definition.authorityBoundary}</span>
          {definition.id === "dj_sarge_cloned_voice" && <span className="agent-config-authority">{VOICE_CAPABILITY_SEPARATION}</span>}
        </div>
        <div className="agent-config-option-list">
          {optionsForClass(definition.id).map((option) => {
            const isDefault = option.id === definition.publicDefaultOptionId;
            const unavailable = option.qualificationState === "not_available_in_this_candidate";
            const isConsidered = considered[definition.id] === option.id;
            return <article
              key={option.id}
              className={`agent-config-option${isDefault ? " agent-config-option-default" : ""}${isConsidered ? " agent-config-option-considered" : ""}${unavailable ? " agent-config-option-unavailable" : ""}`}
            >
              <div className="agent-config-option-heading">
                <strong>{option.name}</strong>
                <div className="agent-config-tags">
                  {isDefault && <span className="agent-config-tag agent-config-tag-public">Public default</span>}
                  <span className={`agent-config-tag ${option.confidentiality === "sanitized_example" ? "agent-config-tag-example" : "agent-config-tag-public"}`}>{label(option.confidentiality)}</span>
                  <span className="agent-config-tag agent-config-tag-cost">{label(option.costClass)}</span>
                  <span className={`agent-config-tag${unavailable ? " agent-config-tag-unavailable" : ""}`}>{label(option.qualificationState)}</span>
                </div>
              </div>
              <p>{option.summary}</p>
              <dl className="agent-config-disclosures">
                {DISCLOSURE_FIELD_LABELS.map(([field, text]) => <div key={field}><dt>{text}</dt><dd>{option[field]}</dd></div>)}
              </dl>
              <div className="agent-config-option-actions">
                {unavailable
                  ? <small>Not selectable. This path is declared here only so it stays visibly separate from regular voice, and enabling it would require its own Commander authorization.</small>
                  : <>
                    <button type="button" className="button button-quiet" aria-pressed={isConsidered} onClick={() => toggle(definition.id, option.id)}>{isConsidered ? "Clear consideration" : "Mark under consideration"}</button>
                    <small>{isConsidered ? "Under consideration in this view only — nothing is saved, applied, or activated." : "Marking is a local review aid; it saves nothing and activates nothing."}</small>
                  </>}
              </div>
            </article>;
          })}
        </div>
        {withheld.length > 0 && <div className="agent-config-withheld">
          <strong>Withheld from CASTRA Core and from public output</strong>
          <ul>{withheld.map((slot) => <li key={slot.key}><code>{slot.key}</code> · {label(slot.classification)} — {slot.describesWhat} <em>Lives where:</em> {slot.livesWhere}</li>)}</ul>
        </div>}
      </section>;
    })}

    <section className="agent-config-projection" aria-labelledby="agent-config-projection-title">
      <div><span className="eyebrow">Fail-closed public projection</span><h3 id="agent-config-projection-title">What this page would publish, and what it refuses</h3></div>
      <div className="agent-config-projection-counts">
        <article><span>Publishable values</span><strong>{projection.records.length}</strong><small>Public defaults and sanitized examples only.</small></article>
        <article><span>Withheld values</span><strong>{projection.withheld.length}</strong><small>Refused by class, key, shape, size, or malformed content.</small></article>
        <article><span>Serializer mode</span><strong>{projection.failClosed ? "FAIL CLOSED" : "UNKNOWN"}</strong><small>An unrecognized classification is treated as private, never as public.</small></article>
        <article><span>Lifecycle</span><strong>CANDIDATE</strong><small>{projection.lifecycle}</small></article>
      </div>
      <div className="agent-config-projection-scroll">
        <table>
          <caption className="visually-hidden">Values withheld from public serialization, by reason code</caption>
          <thead><tr><th scope="col">Withheld key</th><th scope="col">Reason code</th></tr></thead>
          <tbody>{projection.withheld.map((record) => <tr key={record.key}><td><code>{record.key}</code></td><td><code>{record.reasonCode}</code></td></tr>)}</tbody>
        </table>
      </div>
      <small>Only the key and the reason code are shown. The withheld value itself is never rendered, logged, or serialized, so this table can be read, copied, or published without disclosing what it refused.</small>
    </section>
  </>;
}

function AppearanceEditor({ state, execute, demoMode = false }: Props) {
  const presentation = currentPresentation(state);
  const activeTheme = themeProfile(presentation.themeProfileId);
  const selectableThemes = availableThemeProfiles(demoMode ? "public_demo" : "authoritative");
  const featuredPreviewRole = presentation.roles.find((entry) => entry.canonicalId === "SARGE");
  const [editing, setEditing] = useState<RoleDisplayEntry | null>(null);
  return <>
    <section className="presentation-boundary"><strong>{demoMode ? "Demo appearance · memory only" : "Appearance settings"}</strong><span>{demoMode ? "Display choices are synthetic and memory-only. They do not change runtime, authority, records, or readiness." : "Display changes create a versioned presentation setting. They do not start a provider or change a role's authority."}</span></section>
    {demoMode && <section className="presentation-boundary demo-default-policy"><strong>Demo default: {themeProfile(PUBLIC_DEMO_PRESENTATION_POLICY.defaultThemeProfileId).shortName}</strong><span>New templates are selectable display options only. Reload or exit restores the governed default.</span></section>}
    <div className="section-heading"><div><span className="eyebrow">Appearance</span><h2>Theme & presentation</h2></div></div>
    <section className="configuration-control-grid">
      <label>Theme / template<select value={presentation.themeProfileId} onChange={(event) => execute([{ type: "presentation.profile.apply", themeProfileId: event.target.value as typeof presentation.themeProfileId }])}>{selectableThemes.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.scope === "public_demo_only" ? " · Demo only" : ""}</option>)}</select></label>
      <label>AERARIUM role label mode<select value={presentation.aerariumLabelMode} onChange={(event) => execute([{ type: "presentation.label_mode.change", labelMode: event.target.value as RoleLabelMode }])}>{labelModes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name}</option>)}</select></label>
      <div className={`configuration-live-preview ${activeTheme.id === "comic_command" ? "comic-command-preview" : activeTheme.id === "galactic_command_bridge" ? "galactic-command-preview" : ""}`}>
        <span>Live preview</span>
        <strong>{activeTheme.name}</strong>
        <small>{activeTheme.description} · {activeTheme.tokens.density} density · {label(presentation.aerariumLabelMode)}</small>
        <div className="theme-swatches" aria-label={`${activeTheme.name} semantic colors`}>{[activeTheme.tokens.background, activeTheme.tokens.surface, activeTheme.tokens.primary, activeTheme.tokens.secondary, activeTheme.tokens.success, activeTheme.tokens.warning, activeTheme.tokens.critical].map((color, index) => <i key={`${color}-${index}`} style={{ backgroundColor: color }} />)}</div>
        {activeTheme.id === "comic_command" && featuredPreviewRole && <div className="comic-preview-sample" aria-label="Comic Command contained presentation preview"><span className="comic-caption-box">FOUR-COLOR COMMAND</span><article className="comic-preview-kpi"><small>Representative KPI</small><strong>REVIEW</strong><span>Sample panel · no metric recorded</span></article><article className="comic-preview-team" style={{ "--role-accent": featuredPreviewRole.accentColor } as React.CSSProperties}><span className="role-icon">{roleIconGlyphs[featuredPreviewRole.icon]}</span><div><strong>{featuredPreviewRole.displayName}</strong><small>{rolePresentationTagline(activeTheme.id, featuredPreviewRole.canonicalId)}</small></div></article><b>Presentation only; workflows unchanged.</b></div>}
        {activeTheme.id === "galactic_command_bridge" && featuredPreviewRole && <div className="galactic-preview-sample" aria-label="Galactic Command Bridge contained presentation preview"><span className="galactic-console-label">BRIDGE STATUS</span><article className="galactic-preview-kpi"><small>Representative KPI</small><strong>READY</strong><span>Sample indicator · no metric recorded</span></article><article className="galactic-preview-team" style={{ "--role-accent": featuredPreviewRole.accentColor } as React.CSSProperties}><span className="role-icon">{roleIconGlyphs[featuredPreviewRole.icon]}</span><div><strong>{featuredPreviewRole.displayName}</strong><small>{rolePresentationTagline(activeTheme.id, featuredPreviewRole.canonicalId)}</small></div></article><div className="galactic-indicators" aria-label="Generic red, amber, and blue status indicators"><i /><i /><i /></div><b>Presentation only; workflows unchanged.</b></div>}
      </div>
    </section>

    <div className="section-heading"><div><span className="eyebrow">Display-only team presentation</span><h2>Names, compact labels, icons & accents</h2><p>Configured display names are shown on Meet the Team cards; canonical mappings remain internal, accessible, and auditable.</p></div></div>
    <div className="configuration-role-list">{presentation.roles.map((entry) => <article key={entry.canonicalId} style={{ "--role-accent": entry.accentColor } as React.CSSProperties}><span className="role-icon">{roleIconGlyphs[entry.icon]}</span><div><strong>{entry.displayName}</strong><small>{rolePresentationTagline(activeTheme.id, entry.canonicalId) ?? `${entry.compactCode} · decorative ${entry.accentColor}`}</small></div><button className="button button-quiet" onClick={() => setEditing(entry)}>Configure</button></article>)}</div>

    <div className="section-heading"><div><span className="eyebrow">Semantic token layer</span><h2>Active profile tokens</h2></div></div>
    <div className="token-grid">{Object.entries(activeTheme.tokens).map(([name, value]) => <div key={name}><span>{label(name)}</span>{typeof value === "string" && value.startsWith("#") && <i style={{ backgroundColor: value }} />}<strong>{value}</strong></div>)}</div>

    <div className="section-heading"><div><span className="eyebrow">Append-only lineage</span><h2>Presentation history</h2></div></div>
    {state.presentationVersions.length === 0 ? <div className="inline-empty compact">The supplied Oil & Gas profile is active without a stored override. The first change creates version 1.</div> : <div className="presentation-history">{[...state.presentationVersions].reverse().map((version) => <article key={version.id}><span className="record-id">{shortId(version.id)}</span><strong>v{version.version} · {themeProfile(version.themeProfileId).shortName}</strong><small>{version.roleProfileName} · {label(version.aerariumLabelMode)} · {new Date(version.createdAt).toLocaleString()}</small></article>)}</div>}

    <div className="section-heading"><div><span className="eyebrow">Treasury & effort stewardship</span><h2>AERARIUM assumptions</h2></div></div>
    <AerariumConfigurationWorkspace state={state} execute={execute} />
    {editing && <RoleEditModal entry={editing} close={() => setEditing(null)} execute={execute} />}
  </>;
}

export interface ConfigurationWorkspaceProps extends Props {
  connection?: ConfigurationConnectionProjection;
  webMcpActivity?: CommandOverviewWebMcpActivity;
  sessionSelections?: Partial<Record<ConfigurationRoleId, RuntimePreference>>;
}

/** The wrapper owns existing versioned presentation state; the center receives no raw CastraState. */
export function ConfigurationWorkspace({ state, execute, demoMode = false, connection, webMcpActivity, sessionSelections }: ConfigurationWorkspaceProps) {
  const presentation = currentPresentation(state);
  const savedPreferences = presentation.configurationPreferences ?? recommendedConfigurationPreferences();
  return <ConfigurationCenterWorkspace
    savedPreferences={savedPreferences}
    configurationVersion={presentation.version}
    evidenceScope={demoMode ? "synthetic" : "local"}
    connection={connection}
    webMcpActivity={webMcpActivity}
    sessionSelections={sessionSelections}
    demoMode={demoMode}
    onSave={(configurationPreferences) => execute([{ type: "presentation.configuration.save", configurationPreferences }])}
    appearanceEditor={<AppearanceEditor state={state} execute={execute} demoMode={demoMode} />}
  />;
}

export function TeamWorkspace({ state, execute: _execute, campaignId = null }: Props) {
  const presentation = currentPresentation(state);
  const activeTheme = themeProfile(presentation.themeProfileId);
  const [selected, setSelected] = useState<RoleDisplayEntry | null>(null);
  const campaign = campaignId ? state.campaigns.find((item) => item.id === campaignId) : null;
  const missionIds = new Set(state.missions.filter((item) => !campaignId || item.campaignId === campaignId).map((item) => item.id));
  const scopedActions = state.actions.filter((item) => missionIds.has(item.missionId));
  const actionRole = (notes: string) => notes.match(/Assigned canonical role:\s*([^\.]+)\./)?.[1]?.trim() || "";
  const selectedRuns = selected ? state.aerariumRuns.filter((run) => run.roleId === selected.canonicalId && (!campaignId || (run.work.type === "campaign" && run.work.id === campaignId) || (run.work.type === "mission" && missionIds.has(run.work.id)) || (run.work.type === "action" && scopedActions.some((action) => action.id === run.work.id)))) : [];
  const selectedRunIds = new Set(selectedRuns.map((run) => run.id));
  const selectedMeasures = state.aerariumMeasures.filter((measure) => selectedRunIds.has(measure.runId));
  const providerActual = selectedMeasures.filter((measure) => measure.kind === "provider_actual");
  const allocation = selectedMeasures.filter((measure) => measure.kind === "allocated_subscription_cost");
  const effortMs = selectedRuns.reduce((sum, run) => sum + observedRuntime(state, run.id, new Date().toISOString()).activeRuntimeMs, 0);
  const selectedActions = selected ? scopedActions.filter((action) => actionRole(action.notes) === selected.canonicalId) : [];
  return <>
    <div className="page-heading"><div><span className="eyebrow">{campaign ? `${campaign.title} · Campaign team` : "Cross-Campaign role performance"}</span><h1>Meet the Team</h1><p>Cards show configured display names only. Protected canonical role, authority, and workflow provenance remains available through audit and accessible titles.</p></div><span className="integrity-mark">{campaign ? "CAMPAIGN VIEW" : "ALL CAMPAIGNS"}</span></div>
    <section className="presentation-boundary"><strong>Authority remains protected</strong><span>Only display presentation and permitted model preference are configurable. Activity policy controls; agents remain proposal-only.</span></section>
    <div className="role-display-grid meet-team-grid">{presentation.roles.map((entry) => {
      const roleActions = scopedActions.filter((action) => actionRole(action.notes) === entry.canonicalId);
      const selection = presentation.modelSelections.find((item) => item.canonicalId === entry.canonicalId);
      const tagline = rolePresentationTagline(activeTheme.id, entry.canonicalId);
      return <button className="meet-team-card" key={entry.canonicalId} style={{ "--role-accent": entry.accentColor } as React.CSSProperties} title={`${entry.displayName} · protected role ${canonicalRoleNames[entry.canonicalId]} · ${entry.canonicalId}`} onClick={() => setSelected(entry)}>
        <div className="role-card-heading"><span className="role-icon">{roleIconGlyphs[entry.icon]}</span><div><span>{entry.compactCode}</span><h2>{entry.displayName}</h2>{tagline && <small className="comic-role-tagline">{tagline}</small>}</div></div><p>{entry.description}</p><div className="role-card-footer"><span>{roleActions.length} source-backed Action{roleActions.length === 1 ? "" : "s"}</span><span>{selection ? label(selection.runtimeClass) : "Model policy unavailable"}</span></div><small>Open Agent Performance History →</small>
      </button>;
    })}</div>
    {selected && <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelected(null)}><section className="modal agent-history" role="dialog" aria-modal="true" aria-labelledby="agent-history-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">Agent Performance History · {campaign ? "Campaign filter" : "All Campaigns"}</span><h2 id="agent-history-title">{selected.displayName}</h2></div><button className="icon-button" aria-label="Close performance history" onClick={() => setSelected(null)}>×</button></div>
      <div className="overview-kpi-grid"><article className="overview-kpi"><span>Assigned Actions</span><strong>{selectedActions.length}</strong><small>{selectedActions.filter((item) => item.status === "completed").length} complete</small></article><article className="overview-kpi"><span>Observed effort</span><strong>{selectedRuns.length ? `${(effortMs / 3_600_000).toFixed(2)} h` : "Unavailable"}</strong><small>{selectedRuns.length ? "Local Run/Event timestamps" : "No linked AERARIUM Runs"}</small></article><article className="overview-kpi"><span>Provider actual</span><strong>{providerActual.length ? `${(providerActual.reduce((sum, item) => sum + item.value, 0) / 100).toFixed(2)} ${providerActual[0].currency}` : "Unavailable"}</strong><small>No inferred provider usage</small></article><article className="overview-kpi"><span>Subscription allocation</span><strong>{allocation.length ? `${(allocation.reduce((sum, item) => sum + item.value, 0) / 100).toFixed(2)} ${allocation[0].currency}` : "Unavailable"}</strong><small>Separate from provider actual</small></article></div>
      <div className="record-list">{selectedActions.map((action) => <div className="record-list-item" key={action.id}><span className="record-id">{action.id}</span><strong>{action.title}</strong><span className={`status status-${action.status}`}>{label(action.status)}</span></div>)}{selectedActions.length === 0 && <div className="inline-empty compact">No source-backed Actions are assigned in this filter. This does not imply zero effort or cost.</div>}</div>
      <div className="modal-actions"><button className="button button-primary" onClick={() => setSelected(null)}>Close</button></div></section></div>}
  </>;
}
