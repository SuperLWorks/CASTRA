import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { roleIconGlyphs } from "../domain/presentation";
import type { CommandOverviewWebMcpActivity } from "../command/CommandOverview";
import {
  agentConfigurationCatalog,
  buildConfigurationReadiness,
  configurationChangeSummary,
  configurationEditionPolicy,
  configurationGroups,
  declaredConfigurationCapabilities,
  generateSkillDraft,
  governedConfigurationRoles,
  operatingStoreOptions,
  optionalServiceDefinitions,
  runtimeOptions,
  sharedConfigurationCapabilities,
  updateConfigurationPreferences,
  voiceConfigurationSequence,
} from "./configurationCenter";
import type {
  ConfigurationConnectionProjection,
  ConfigurationGroupId,
  ConfigurationObservation,
  ConfigurationPreferences,
  ConfigurationRoleId,
  RuntimePreference,
  ConfigurationSkillDraft,
  ConfigurationUpdate,
} from "./configurationCenter";
import "./ConfigurationCenterWorkspace.css";

export interface ConfigurationCenterWorkspaceProps {
  savedPreferences: ConfigurationPreferences;
  configurationVersion: number;
  observations?: readonly ConfigurationObservation[];
  evidenceScope?: "current_hosted" | "local" | "synthetic";
  connection?: ConfigurationConnectionProjection;
  webMcpActivity?: CommandOverviewWebMcpActivity;
  /** Private session selection is injected only in a non-Demo experience. */
  sessionSelections?: Partial<Record<ConfigurationRoleId, RuntimePreference>>;
  demoMode?: boolean;
  appearanceEditor: ReactNode;
  onSave: (preferences: ConfigurationPreferences) => Promise<boolean>;
}

const noObservations: readonly ConfigurationObservation[] = [];

function title(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function runtimeLabel(value: { provider: string; subscription: string; model: string; effort: string } | null): string {
  return value ? `${value.model} · ${value.effort}` : "Not configured";
}

function update(current: ConfigurationPreferences, next: ConfigurationUpdate): ConfigurationPreferences {
  return updateConfigurationPreferences(current, next);
}

function Dialog({
  title: dialogTitle,
  eyebrow,
  children,
  onClose,
}: { title: string; eyebrow: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(typeof document === "undefined" ? null : document.activeElement as HTMLElement | null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previousFocus.current?.focus(); };
  }, []);

  return <div className="configuration-center-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="configuration-center-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="configuration-editor-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="eyebrow">{eyebrow}</span><h2 id="configuration-editor-title">{dialogTitle}</h2></div><button ref={closeButton} className="icon-button" aria-label={`Close ${dialogTitle}`} onClick={onClose}>×</button></header>
      <div className="configuration-center-dialog-body">{children}</div>
    </section>
  </div>;
}

function ActivityTracker({ activity }: { activity: CommandOverviewWebMcpActivity }) {
  const completed = new Set(activity.steps.filter((step) => step.outcome === "complete" && step.classification === "read_only" && activity.expectedReadOnlyTools.includes(step.tool)).map((step) => step.tool));
  return <section className="configuration-activity" aria-label="Observed WebMCP activity" role="status" aria-live="polite">
    <div><span className="eyebrow">Observed WebMCP activity</span><strong>{activity.steps.length ? `Observed · ${completed.size}/${activity.expectedReadOnlyTools.length}` : `Ready · 0/${activity.expectedReadOnlyTools.length}`}</strong></div>
    {activity.steps.length === 0 ? <small>No registered tool has been invoked in this experience.</small> : <ol>{activity.steps.map((step) => <li key={step.sequence}><span>#{step.sequence}</span><strong>{step.tool}</strong><small>{title(step.classification)} · {title(step.outcome)}</small></li>)}</ol>}
  </section>;
}

function Guidance({ group }: { group: typeof configurationGroups[number] }) {
  return <div className="configuration-guidance"><p><strong>What:</strong> {group.what}</p><p><strong>Why:</strong> {group.why}</p><p><strong>When saved:</strong> {group.outcome}</p></div>;
}

export function ConfigurationCenterWorkspace({
  savedPreferences,
  configurationVersion,
  observations = noObservations,
  evidenceScope = "local",
  connection,
  webMcpActivity,
  sessionSelections,
  demoMode = false,
  appearanceEditor,
  onSave,
}: ConfigurationCenterWorkspaceProps) {
  const [draft, setDraft] = useState(savedPreferences);
  const [editor, setEditor] = useState<ConfigurationGroupId | null>(null);
  const [snapshot, setSnapshot] = useState<ConfigurationPreferences | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"red" | "yellow" | "green" | null>(null);
  const [skillName, setSkillName] = useState("");
  const [skillOutcome, setSkillOutcome] = useState("");
  const [skillRole, setSkillRole] = useState<typeof agentConfigurationCatalog[number]["roleId"]>("SARGE");
  const [skillCapability, setSkillCapability] = useState(sharedConfigurationCapabilities()[0]?.id ?? "agent_runtime");
  const [skillError, setSkillError] = useState<string | null>(null);
  const now = new Date().toISOString();
  const readiness = useMemo(() => buildConfigurationReadiness(draft, observations, now, { configurationVersion, scope: demoMode ? "synthetic" : evidenceScope }), [configurationVersion, demoMode, draft, evidenceScope, observations, now]);
  const changes = useMemo(() => configurationChangeSummary(savedPreferences, draft), [draft, savedPreferences]);
  const changed = changes.length > 0;
  const currentGroup = configurationGroups.find((group) => group.id === editor) ?? null;

  const openEditor = (group: ConfigurationGroupId) => { setSnapshot(draft); setEditor(group); setConfirmDiscard(false); };
  const requestClose = () => {
    if (snapshot && JSON.stringify(snapshot) !== JSON.stringify(draft)) { setConfirmDiscard(true); return; }
    setEditor(null);
  };
  const discardEditor = () => { if (snapshot) setDraft(snapshot); setConfirmDiscard(false); setEditor(null); };
  const change = (next: ConfigurationUpdate) => setDraft((current) => update(current, next));
  const save = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      if (await onSave(draft)) { setReviewing(false); setEditor(null); setSnapshot(null); }
      else setSaveError("Settings could not be saved. Your local draft is still here.");
    } finally { setSaving(false); }
  };
  const createSkillDraft = () => {
    if (draft.skillDrafts.length >= 12) { setSkillError("You can keep up to 12 skill drafts. Review or remove one before adding another."); return; }
    try {
      const generated = generateSkillDraft({ roleId: skillRole, capabilityId: skillCapability, name: skillName.trim(), outcome: skillOutcome.trim() });
      change({ field: "skillDrafts", value: [...draft.skillDrafts, generated] });
      setSkillName(""); setSkillOutcome(""); setSkillError(null);
    } catch { setSkillError("Use a short name and outcome without account details, paths, links, or credentials."); }
  };

  const summaryCards = ([
    ["red", "Needs setup/check", readiness.counts.red],
    ["yellow", "Needs attention", readiness.counts.yellow],
    ["green", "Ready", readiness.counts.green],
  ] as const);
  const filteredChecks = activeFilter ? readiness.checks.filter((check) => check.color === activeFilter) : readiness.checks;

  return <section className="configuration-center" aria-labelledby="configuration-center-title">
    <header className="configuration-center-header">
      <div><span className="eyebrow">Commander setup · preferences, not runtime activation</span><h1 id="configuration-center-title">Configuration Center</h1><p>Set up how CASTRA should work, then choose its appearance. Saved settings are not proof they are running.</p></div>
      <div className="configuration-center-save"><span className={changed ? "configuration-unsaved" : "configuration-saved"}>{changed ? `${changes.length} unsaved change${changes.length === 1 ? "" : "s"}` : "No unsaved changes"}</span><button className="button button-primary" disabled={!changed || saving} onClick={() => setReviewing(true)}>{saving ? "Saving…" : "Review and save"}</button></div>
    </header>

    <div className="configuration-readiness" aria-label="Configuration readiness">
      {summaryCards.map(([color, text, count]) => <button key={color} type="button" className={`configuration-count configuration-count-${color}${activeFilter === color ? " is-active" : ""}`} aria-pressed={activeFilter === color} onClick={() => setActiveFilter((current) => current === color ? null : color)}><strong>{count}</strong><span>{text}</span></button>)}
      <div className="configuration-count configuration-count-neutral"><strong>{readiness.counts.neutral}</strong><span>Off, locked or display-only</span></div>
      <div className="configuration-connection"><strong>{connection?.label ?? "Connection evidence unavailable"}</strong><small>{readiness.counts.actionable} actionable checks · {readiness.denominator}</small></div>
    </div>

    <div className="configuration-content">
      <div className="configuration-card-grid">
        {configurationGroups.map((group) => <article key={group.id} className={`configuration-card configuration-card-${group.id}`}>
          <span className="configuration-card-number">{configurationGroups.indexOf(group) + 1}</span><h2>{group.label}</h2><p>{group.what}</p><small>{group.outcome}</small><button className="button button-quiet" onClick={() => openEditor(group.id)}>Open {group.label}</button>
        </article>)}
      </div>
      <aside className="configuration-checks" aria-live="polite"><div><span className="eyebrow">{activeFilter ? `${title(activeFilter)} checks` : "Readiness details"}</span><button className="button button-quiet" disabled={!activeFilter} onClick={() => setActiveFilter(null)}>Show all</button></div><ul>{filteredChecks.map((check) => <li key={check.id} className={`configuration-check configuration-check-${check.color}`}><span aria-hidden="true" /><div><strong>{check.label}</strong><small>{check.reason}</small></div></li>)}</ul><small className="configuration-checks-note">Neutral items are separate from the actionable total. A preference never creates health evidence.</small></aside>
    </div>

    {reviewing && <Dialog title="Review and save settings" eyebrow="Local preference review" onClose={() => !saving && setReviewing(false)}>
      <p className="configuration-dialog-lead">{changes.length ? "These preferences will be saved through the versioned settings flow." : "There are no changes to save."}</p>
      <ul className="configuration-change-list">{changes.map((entry) => <li key={entry}>{entry}</li>)}</ul>
      {saveError && <p className="configuration-inline-error" role="alert">{saveError}</p>}
      <p className="configuration-boundary-note">{demoMode ? "Demo settings · memory only. They are not runtime applied." : "Saved settings are not runtime applied. No provider, voice, or paid service starts from this save."}</p>
      <footer><button className="button button-quiet" disabled={saving} onClick={() => setReviewing(false)}>Back to editing</button><button className="button button-primary" disabled={!changed || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save settings"}</button></footer>
    </Dialog>}

    {currentGroup && <Dialog title={currentGroup.label} eyebrow="Configuration editor" onClose={requestClose}>
      {confirmDiscard ? <div className="configuration-discard"><h3>Discard this editor’s unsaved changes?</h3><p>Changes made since opening this editor will be removed. Earlier unsaved changes elsewhere stay intact.</p><footer><button className="button button-quiet" onClick={() => setConfirmDiscard(false)}>Keep editing</button><button className="button button-danger" onClick={discardEditor}>Discard changes</button></footer></div> : <>
        <Guidance group={currentGroup} />
        {editor === "operating_setup" && <div className="configuration-editor-stack"><label>Where CASTRA keeps work<select value={draft.operatingStore} onChange={(event) => change({ field: "operatingStore", value: event.target.value as ConfigurationPreferences["operatingStore"] })}>{operatingStoreOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><p className="configuration-boundary-note">This preference does not connect, migrate, or verify a store. {connection?.label ?? "Connection evidence unavailable."}</p></div>}
        {editor === "agents" && <div className="configuration-agent-list">{agentConfigurationCatalog.map((agent) => {
          const preference = draft.agents.find((entry) => entry.roleId === agent.roleId) ?? null;
          const savedPreference = savedPreferences.agents.find((entry) => entry.roleId === agent.roleId) ?? null;
          const sessionSelection = !demoMode && governedConfigurationRoles.includes(agent.roleId as ConfigurationRoleId)
            ? sessionSelections?.[agent.roleId as ConfigurationRoleId] ?? null : null;
          const selectedOption = preference ? runtimeOptions.find((option) => option.provider === preference.provider && option.subscription === preference.subscription && option.model === preference.model) ?? null : null;
          const declared = declaredConfigurationCapabilities(agent.roleId);
          return <article key={agent.roleId} style={{ "--agent-accent": agent.accentColor } as CSSProperties}><div className="configuration-avatar">{roleIconGlyphs[agent.icon]}</div><div className="configuration-agent-heading"><strong>{agent.roleId}</strong><small>{agent.what}</small></div><p>{agent.outcome}</p><dl><div><dt>Standing recommendation</dt><dd>{runtimeLabel(agent.standingDefault)}</dd></div><div><dt>{JSON.stringify(preference) === JSON.stringify(savedPreference) ? "Saved preference" : "Draft preference"}</dt><dd>{runtimeLabel(preference)}</dd></div>{!demoMode && <div><dt>Session-selected</dt><dd>{runtimeLabel(sessionSelection)}</dd></div>}<div><dt>Actual observed runtime</dt><dd>Not observed</dd></div></dl>{agent.roleId === "CENSOR" ? <p className="configuration-censor">Independent CASTRA audit · Regulatory research · Trademark research<br /><strong>Commander-authored profile pending.</strong></p> : agent.runtimeSelectable && preference && <div className="configuration-runtime-selects"><label>Subscription<select value={preference.subscription} onChange={(event) => { const option = runtimeOptions.find((candidate) => candidate.subscription === event.target.value) ?? runtimeOptions[0]; change({ field: "agent", value: { roleId: preference.roleId, provider: option.provider, subscription: option.subscription, model: option.model, effort: option.efforts[0] } }); }}>{[...new Set(runtimeOptions.map((option) => option.subscription))].map((subscription) => <option key={subscription} value={subscription}>{title(subscription)}</option>)}</select></label><label>Model<select value={preference.model} onChange={(event) => { const option = runtimeOptions.find((candidate) => candidate.subscription === preference.subscription && candidate.model === event.target.value)!; change({ field: "agent", value: { ...preference, provider: option.provider, subscription: option.subscription, model: option.model, effort: option.efforts.includes(preference.effort) ? preference.effort : option.efforts[0] } }); }}>{runtimeOptions.filter((option) => option.subscription === preference.subscription).map((option) => <option key={option.model} value={option.model}>{option.model}</option>)}</select></label><label>Effort<select value={preference.effort} onChange={(event) => change({ field: "agent", value: { ...preference, effort: event.target.value as typeof preference.effort } })}>{selectedOption?.efforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select></label></div>}<details><summary>Capabilities and skill inventory</summary><p><strong>Declared role permissions:</strong> {declared.defaultCapabilities.length ? declared.defaultCapabilities.join(", ") : "No operating profile."}</p><p>No installed-skill inventory available. Declared permissions are not installed skills or observed access.</p><small>{declared.sourcePath}</small></details>{agent.standingFallback && <small className="configuration-fallback">Fallback: {runtimeLabel(agent.standingFallback)} · {agent.fallbackCondition}</small>}</article>;
        })}<aside className="configuration-paid-lock"><strong>Metered APIs · Locked in this edition</strong><span>{configurationEditionPolicy.notice}</span></aside></div>}
        {editor === "voice" && <div className="configuration-voice-flow">{voiceConfigurationSequence.map((step) => <article key={step.id}><h3>{step.label}</h3><p>{step.what}</p>{step.id === "input" && <label>Your preference<select value={draft.voice.input} onChange={(event) => change({ field: "voice", value: { ...draft.voice, input: event.target.value as typeof draft.voice.input } })}><option value="typed">Type</option><option value="push_to_talk">Push-to-talk (proposed)</option></select></label>}{step.id === "transcriptConfirmation" && <p className="configuration-boundary-note">Transcript review is required. You can edit or discard it; typing is always available.</p>}{step.id === "reply" && <label>Reply preference<select value={draft.voice.reply} onChange={(event) => { const reply = event.target.value as typeof draft.voice.reply; change({ field: "voice", value: { ...draft.voice, reply, voice: reply === "text" ? "none" : "device_voice" } }); }}><option value="text">Text</option><option value="text_and_voice">Text with proposed voice</option></select></label>}{step.id === "voice" && <p className="configuration-boundary-note">Device voice is unavailable until an adapter is supported. AI DJ SARGE identity and cloned voice are separately unavailable.</p>}<small>{step.outcome}</small></article>)}</div>}
        {editor === "optional_services" && <div className="configuration-editor-stack">{optionalServiceDefinitions.map((service) => <article className="configuration-service" key={service.id}><div><h3>{service.label}</h3><p>{service.what}</p><small>{service.outcome}</small></div><label>Preference<select value={draft.optionalServices[service.id]} onChange={(event) => change({ field: "optionalServices", value: { ...draft.optionalServices, [service.id]: event.target.value } })}><option value="off">Off</option><option value="consider">Consider later</option></select></label></article>)}<aside className="configuration-paid-lock"><strong>Metered APIs · Locked in this edition</strong><span>No key entry, unlock action, payment action, or automatic paid fallback.</span></aside></div>}
        {editor === "appearance" && <div className="configuration-appearance-editor">{appearanceEditor}</div>}
        {editor === "agents" && <section className="configuration-skill-drafts"><h3>Create skill draft for review</h3><p>Drafts are reviewable instructions, not installations, permissions, or active skills.</p><div className="configuration-skill-form"><label>Role<select value={skillRole} onChange={(event) => setSkillRole(event.target.value as typeof skillRole)}>{agentConfigurationCatalog.map((agent) => <option key={agent.roleId} value={agent.roleId}>{agent.roleId}</option>)}</select></label><label>Declared capability<select value={skillCapability} onChange={(event) => setSkillCapability(event.target.value as typeof skillCapability)}>{sharedConfigurationCapabilities().map((capability) => <option key={capability.id} value={capability.id}>{capability.name}</option>)}</select></label><label>Short name<input maxLength={80} value={skillName} onChange={(event) => setSkillName(event.target.value)} /></label><label>Intended outcome<textarea maxLength={240} value={skillOutcome} onChange={(event) => setSkillOutcome(event.target.value)} /></label><button className="button button-quiet" disabled={!skillName.trim() || !skillOutcome.trim() || draft.skillDrafts.length >= 12} onClick={createSkillDraft}>Generate draft</button></div>{skillError && <p className="configuration-inline-error" role="alert">{skillError}</p>}{draft.skillDrafts.length >= 12 && <p className="configuration-boundary-note">Draft limit reached: 12 of 12 are ready for Commander review.</p>}{draft.skillDrafts.length > 0 && <ul>{draft.skillDrafts.map((skill: ConfigurationSkillDraft) => <li key={`${skill.roleId}:${skill.name}`}><strong>{skill.name}</strong> · {skill.status}<details><summary>Reviewable steps and checks</summary><ol>{skill.steps.map((step) => <li key={step}>{step}</li>)}</ol><ul>{skill.acceptance.map((check) => <li key={check}>{check}</li>)}</ul></details></li>)}</ul>}</section>}
        <footer><button className="button button-quiet" onClick={requestClose}>Cancel</button><button className="button button-primary" onClick={() => setEditor(null)}>Keep local edits</button></footer>
      </>}
    </Dialog>}
    {webMcpActivity && <ActivityTracker activity={webMcpActivity} />}
  </section>;
}
