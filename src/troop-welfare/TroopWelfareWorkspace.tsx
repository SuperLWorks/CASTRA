import { useEffect, useMemo, useRef, useState } from "react";
import type { CommandOverviewWebMcpActivity } from "../command/CommandOverview";
import {
  applyTroopWelfareGenerationJobRightsReview,
  completeTroopWelfareGenerationJobAnalysis,
  consumeTroopWelfareCapability,
  createTroopWelfareGenerationJob,
  markTroopWelfareGenerationJobReady,
  moderateTroopWelfareAudienceRequest,
  pauseTroopWelfarePlayback,
  playTroopWelfareDeck,
  resumeTroopWelfarePlayback,
  revokeTroopWelfareCapability,
  reviewTroopWelfareGenerationJob,
  selectTroopWelfareAudienceRequest,
  setTroopWelfarePlayerMuted,
  startTroopWelfareGenerationJobGenerating,
  stopTroopWelfarePlayback,
  submitTroopWelfareAudienceRequest,
  troopWelfareCapabilityState,
  type TroopWelfareAudienceRequest,
  type TroopWelfareCapability,
  type TroopWelfareDeckId,
  type TroopWelfareGenerationJob,
  type TroopWelfarePlayerState,
} from "./troopWelfare";
import {
  buildTroopWelfarePresentationSeed,
  summarizeTroopWelfareWebMcpActivity,
  TROOP_WELFARE_ACTIVITIES,
  TROOP_WELFARE_TIMELINE_LANES,
  troopWelfareActivityLabel,
  type TroopWelfareActivityId,
} from "./troopWelfarePresentation";

export interface TroopWelfareWorkspaceProps {
  /** Sanitized display projection only. No raw tool result or CASTRA state enters this local surface. */
  webMcpActivity?: CommandOverviewWebMcpActivity;
}

const deckLabels: Record<TroopWelfareDeckId, { title: string; bpm: string; key: string; accent: string }> = {
  deck_a: { title: "Dawn Patrol / Local Cut", bpm: "122.0", key: "8A", accent: "teal" },
  deck_b: { title: "Night Shift / Local Cut", bpm: "126.0", key: "9A", accent: "violet" },
};

function Timecode({ value }: { value: string }) { return <span className="twf-timecode">{value}</span>; }
function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="twf-meter" aria-label={`${label} level ${value} percent`}><span>{label}</span><i className={`twf-meter-fill twf-${tone}`} style={{ width: `${value}%` }} /></div>;
}
function nowIso() { return new Date().toISOString(); }
function localId(prefix: string) { return `twf_${prefix}_${crypto.randomUUID()}`; }
function jobNextLabel(job: TroopWelfareGenerationJob) {
  return job.state === "requested" ? "Pass moderation" : job.state === "reviewed" ? "Start local analysis" : job.state === "generating" ? "Complete analysis" : job.state === "analyzed" ? "Pass rights review" : job.state === "rights_review" ? "Mark ready" : null;
}

export function TroopWelfareWorkspace({ webMcpActivity }: TroopWelfareWorkspaceProps) {
  const seed = useMemo(() => buildTroopWelfarePresentationSeed(nowIso()), []);
  const [selectedActivity, setSelectedActivity] = useState<TroopWelfareActivityId>("dj");
  const [favorites, setFavorites] = useState<TroopWelfareActivityId[]>(["dj", "requests", "trivia"]);
  const [player, setPlayer] = useState<TroopWelfarePlayerState>({ activeDeck: "deck_a", nowPlayingJobId: "twf_seed_deck_a", playback: "paused", muted: false });
  const [capability, setCapability] = useState<TroopWelfareCapability>(seed.capability);
  const [requests, setRequests] = useState<TroopWelfareAudienceRequest[]>(seed.requests);
  const [jobs, setJobs] = useState<TroopWelfareGenerationJob[]>(seed.jobs);
  const [clockIso, setClockIso] = useState(nowIso());
  const [notice, setNotice] = useState("Synthetic set preview · no audio generated");
  const [requestDraft, setRequestDraft] = useState("");
  const [queueNote, setQueueNote] = useState("Northstar request is locally moderated and ready for a bounded candidate review.");
  const [masterLevel, setMasterLevel] = useState(74);
  const [crossfade, setCrossfade] = useState(50);
  const requestInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setClockIso(nowIso()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (selectedActivity === "requests") requestInputRef.current?.focus();
  }, [selectedActivity]);

  const capabilityState = troopWelfareCapabilityState(capability, clockIso);
  const remainingSeconds = Math.max(0, Math.ceil((new Date(capability.expiresAt).getTime() - new Date(clockIso).getTime()) / 1_000));
  const capabilityLabel = capabilityState === "active" ? `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")} remaining` : capabilityState;
  const readyIds = jobs.filter((job) => job.state === "ready").map((job) => job.id);
  const activeDeck = player.activeDeck ?? "deck_a";
  const activeTrack = deckLabels[activeDeck];
  const activeJob = jobs.find((job) => job.id === player.nowPlayingJobId) ?? null;
  const activeTrackTitle = activeJob?.source === "ai" ? "AI candidate / local review" : activeTrack.title;
  const activeTrackProvenance = activeJob?.provenanceLabel ?? "Local placeholder only — no provider execution";
  const tracker = summarizeTroopWelfareWebMcpActivity(webMcpActivity);

  function selectActivity(id: TroopWelfareActivityId) {
    setSelectedActivity(id);
    if (id === "requests") setNotice("Music Requests focused locally. No public intake or endpoint exists.");
    if (id === "craps") setNotice("Placeholder · simulator route pending");
    if (id !== "dj" && id !== "requests" && id !== "craps") setNotice(`${troopWelfareActivityLabel(id)} is a compact local placeholder.`);
  }
  function toggleFavorite(id: TroopWelfareActivityId) { setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function startDeck(deck: TroopWelfareDeckId) {
    const jobId = deck === "deck_a" ? "twf_seed_deck_a" : "twf_seed_deck_b";
    setPlayer((current) => playTroopWelfareDeck(current, deck, jobId));
    setNotice(`${deckLabels[deck].title} cued locally. No audio is generated or played.`);
  }
  function previousOrNext(direction: -1 | 1) {
    const currentIndex = Math.max(0, readyIds.indexOf(player.nowPlayingJobId ?? readyIds[0]));
    const nextIndex = (currentIndex + direction + readyIds.length) % readyIds.length;
    const deck: TroopWelfareDeckId = nextIndex === 0 ? "deck_a" : "deck_b";
    setPlayer((current) => playTroopWelfareDeck(current, deck, readyIds[nextIndex]));
    const selectedJob = jobs.find((job) => job.id === readyIds[nextIndex]);
    setNotice(`${direction < 0 ? "Previous" : "Next"} queued ${selectedJob?.source === "ai" ? "an AI candidate under local review" : "a local placeholder"} on ${deck === "deck_a" ? "Deck A" : "Deck B"}.`);
  }
  function consumeCapability() {
    const result = consumeTroopWelfareCapability(capability, nowIso());
    if (result.ok) { setCapability(result.value); setNotice("Capability consumed once locally. It never renews automatically."); } else setNotice(result.reason);
  }
  function revokeCapability() {
    const result = revokeTroopWelfareCapability(capability, nowIso());
    if (result.ok) { setCapability(result.value); setNotice("Capability revoked locally. Stop and Mute remain available."); } else setNotice(result.reason);
  }
  function submitLocalRequest() {
    const result = submitTroopWelfareAudienceRequest(requests, { id: localId("request"), nickname: "Guest", requestText: requestDraft, nowIso: nowIso() });
    if (result.ok) { setRequests(result.value); setRequestDraft(""); setQueueNote("Local request added as bounded, untrusted creative input. It is pending local moderation."); } else setQueueNote(result.reason);
  }
  function moderateRequest(request: TroopWelfareAudienceRequest) {
    const result = moderateTroopWelfareAudienceRequest(request, "approve");
    if (result.ok) { setRequests((current) => current.map((item) => item.id === request.id ? result.value : item)); setQueueNote("Request passed local moderation. It can now be selected for at most two candidates."); } else setQueueNote(result.reason);
  }
  function selectAndCreateCandidate(request: TroopWelfareAudienceRequest) {
    const selected = request.status === "moderated_ok" ? selectTroopWelfareAudienceRequest(request) : { ok: true as const, value: request };
    if (!selected.ok) { setQueueNote(selected.reason); return; }
    const selectedRequest = selected.value;
    const created = createTroopWelfareGenerationJob(jobs, { id: localId("job"), requestId: selectedRequest.id, source: "ai", nowIso: nowIso() });
    if (!created.ok) { setQueueNote(created.reason); return; }
    setRequests((current) => current.map((item) => item.id === request.id ? selectedRequest : item));
    setJobs(created.value);
    setQueueNote("One local AI candidate was added. No provider call occurred; duplicate and two-candidate limits remain enforced by the pure helper.");
  }
  function advanceJob(job: TroopWelfareGenerationJob) {
    const timestamp = nowIso();
    const result = job.state === "requested" ? reviewTroopWelfareGenerationJob(job, "pass", timestamp)
      : job.state === "reviewed" ? startTroopWelfareGenerationJobGenerating(job, timestamp)
      : job.state === "generating" ? completeTroopWelfareGenerationJobAnalysis(job, timestamp)
      : job.state === "analyzed" ? applyTroopWelfareGenerationJobRightsReview(job, "pass", timestamp)
      : job.state === "rights_review" ? markTroopWelfareGenerationJobReady(job, timestamp)
      : null;
    if (result?.ok) { setJobs((current) => current.map((item) => item.id === job.id ? result.value : item)); setQueueNote(`${jobNextLabel(job)} completed locally. No provider or audio activity occurred.`); }
    else if (result) setQueueNote(result.reason);
  }
  const favoriteActivities = TROOP_WELFARE_ACTIVITIES.filter((activity) => favorites.includes(activity.id));

  return <section className="twf-console" aria-label="Troop Welfare AI DJ SARGE local workstation">
    <aside className="twf-activity-rail" aria-label="Troop Welfare activities">
      <div className="twf-rail-mark" aria-hidden="true">TW</div>
      <div className="twf-rail-list">{TROOP_WELFARE_ACTIVITIES.map((activity) => <button key={activity.id} type="button" className={`twf-rail-button ${selectedActivity === activity.id ? "is-selected" : ""}`} onClick={() => selectActivity(activity.id)} aria-pressed={selectedActivity === activity.id}><span className="twf-rail-glyph" aria-hidden="true">{activity.id === "dj" ? "♫" : activity.id === "requests" ? "↳" : activity.id === "craps" ? "◇" : "·"}</span><span>{activity.shortLabel}</span>{activity.id === "craps" && <small>Placeholder</small>}</button>)}</div>
      <span className="twf-rail-footer">LOCAL<br />ONLY</span>
    </aside>
    <div className="twf-workstation">
      <header className="twf-console-header"><div className="twf-console-title"><span className="eyebrow">Troop Welfare · recreation console</span><h1>AI DJ SARGE</h1></div><div className="twf-header-status"><button type="button" className="twf-favorite-toggle" onClick={() => toggleFavorite(selectedActivity)} aria-label={`Toggle ${troopWelfareActivityLabel(selectedActivity)} as a local favorite`}>{favorites.includes(selectedActivity) ? "★" : "☆"}</button><span className="twf-live-dot" /> SYNTHETIC SET PREVIEW <b>NO LIVE PROVIDER</b><Timecode value="00:18:42" /></div></header>
      <nav className="twf-favorites" aria-label="Favorite activities"><span className="twf-favorite-label">FAVORITES</span>{favoriteActivities.map((activity) => <button type="button" key={activity.id} onClick={() => selectActivity(activity.id)} className={selectedActivity === activity.id ? "is-selected" : ""}>{activity.label}</button>)}<button type="button" className="twf-favorite-more" onClick={() => setFavorites(TROOP_WELFARE_ACTIVITIES.slice(0, 4).map((activity) => activity.id))} aria-label="Reset local activity favorites">+</button></nav>
      {selectedActivity !== "dj" && selectedActivity !== "requests" ? <section className="twf-activity-placeholder" aria-live="polite"><span className="eyebrow">LOCAL ACTIVITY</span><h2>{troopWelfareActivityLabel(selectedActivity)}</h2><p>{selectedActivity === "craps" ? "Placeholder · simulator route pending" : "Coming soon · local placeholder only"}</p><button type="button" className="twf-action" onClick={() => selectActivity("dj")}>Return to AI DJ SARGE</button></section> : <div className="twf-main-grid">
        <section className="twf-timeline-panel" aria-label="AI DJ synthetic timeline"><div className="twf-panel-toolbar"><div><span className="eyebrow">SET ARRANGEMENT</span><strong>Morale set · 122–126 BPM</strong></div><div className="twf-toolbar-tools"><span>SNAP 1/4</span><span>GRID</span><span className="is-active">LOCAL</span></div></div><div className="twf-ruler" aria-hidden="true">{["00:00", "00:04", "00:08", "00:12", "00:16", "00:20", "00:24", "00:28"].map((tick) => <span key={tick}>{tick}</span>)}</div><div className="twf-timeline"><span className="twf-playhead" aria-label="Current playhead at 00:18:42" />{TROOP_WELFARE_TIMELINE_LANES.map((lane) => <div className="twf-timeline-lane" key={lane.label}><span className="twf-lane-label">{lane.label}</span><div className="twf-lane-clips">{lane.clips.map((clip) => <span key={`${lane.label}-${clip.left}`} className={`twf-clip twf-clip-${lane.color}`} style={{ left: `${clip.left}%`, width: `${clip.width}%` }}><i />{clip.label}</span>)}</div></div>)}</div><div className="twf-timeline-footer"><span>ENERGY <b>STEADY → LIFT</b></span><span>PLAYHEAD <b>18:42</b></span><span>NO AUDIO BUFFER · VISUAL ONLY</span></div></section>
        <aside className={`twf-queue-panel ${selectedActivity === "requests" ? "is-focused" : ""}`} aria-label="Music requests and queue"><div className="twf-panel-toolbar"><div><span className="eyebrow">REQUEST CONTROL</span><strong>Queue / moderation</strong></div><span className="twf-count">{requests.length} LOCAL</span></div>{requests.map((request) => <article className="twf-request-card" key={request.id}><div><span className="twf-request-name">{request.nickname.toUpperCase()}</span><span className="twf-state-badge is-ok">{request.status.replaceAll("_", " ")}</span></div><p>{request.requestText}</p><small>Untrusted creative input · local review only</small>{request.status === "submitted" && <button type="button" className="twf-inline-action" onClick={() => moderateRequest(request)}>Pass local moderation</button>}{(request.status === "moderated_ok" || request.status === "selected") && <button type="button" className="twf-inline-action" onClick={() => selectAndCreateCandidate(request)}>{request.status === "moderated_ok" ? "Select + create candidate" : "Create next candidate"}</button>}</article>)}<label className="twf-request-input">LOCAL REQUEST<input ref={requestInputRef} value={requestDraft} maxLength={200} onChange={(event) => setRequestDraft(event.target.value)} placeholder="Bounded creative input" /></label><button type="button" className="twf-action" onClick={submitLocalRequest}>Queue for local moderation</button><div className="twf-job-list">{jobs.filter((job) => job.source === "ai").map((job) => <div className="twf-job-row" key={job.id}><span>{job.state.replaceAll("_", " ")} · {job.provenanceLabel}</span>{jobNextLabel(job) && <button type="button" onClick={() => advanceJob(job)}>{jobNextLabel(job)}</button>}</div>)}</div><p className="twf-queue-note" role="status">{queueNote}</p></aside>
        <section className="twf-decks-panel" aria-label="Dual local placeholder decks">{(["deck_a", "deck_b"] as const).map((deck) => { const descriptor = deckLabels[deck]; const selected = activeDeck === deck; const displayedJob = selected ? activeJob : null; const isAiCandidate = displayedJob?.source === "ai"; return <article className={`twf-deck twf-deck-${descriptor.accent} ${selected ? "is-active" : ""}`} key={deck}><header><span>DECK {deck === "deck_a" ? "A" : "B"}</span><span className="twf-state-badge">{isAiCandidate ? "AI CANDIDATE" : "LOCAL PLACEHOLDER"}</span></header><div className="twf-deck-track"><div className="twf-vinyl" aria-hidden="true"><i /></div><div><strong>{isAiCandidate ? "AI candidate / local review" : descriptor.title}</strong><p>{descriptor.bpm} BPM · {descriptor.key} · 03:42</p><small>Provenance: {displayedJob?.provenanceLabel ?? "local_placeholder · no provider execution"}</small></div></div><div className="twf-deck-controls"><button type="button" aria-label={`Cue ${deck === "deck_a" ? "Deck A" : "Deck B"}`} onClick={() => startDeck(deck)}>CUE</button><button type="button" aria-label={`Play ${deck === "deck_a" ? "Deck A" : "Deck B"}`} onClick={() => startDeck(deck)}>▶</button><Meter label="LEVEL" value={deck === "deck_a" ? 68 : 48} tone={descriptor.accent} /></div></article>; })}</section>
        <aside className="twf-status-panel" aria-label="AI DJ SARGE status and boundaries"><div className="twf-panel-toolbar"><div><span className="eyebrow">AI DJ SARGE</span><strong>Safety / readiness</strong></div><span className="twf-state-badge is-warn">LOCAL</span></div><dl className="twf-status-list"><div><dt>Persona</dt><dd>Ready · no live provider</dd></div><div><dt>Capability</dt><dd>{capabilityLabel}</dd></div><div><dt>Voice</dt><dd>Regular SARGE selected</dd></div><div><dt>Clone</dt><dd>Separately gated · inactive</dd></div><div><dt>Rights</dt><dd>Event ≠ publish</dd></div><div><dt>Human music</dt><dd>Excluded from publication</dd></div></dl><div className="twf-capability-actions"><button type="button" disabled={capabilityState !== "active"} onClick={consumeCapability}>Use once</button><button type="button" disabled={capabilityState !== "active"} onClick={revokeCapability}>Revoke</button><span>{capabilityState === "active" ? "No renewal path" : `Capability ${capabilityState}`}</span></div><p className="twf-isolation-note">Local only · no provider/audio/endpoint/persistence.</p><div className="twf-webmcp-tracker" aria-label="Sanitized WebMCP activity"><span>WEBMCP TRACKER · {tracker.state.toUpperCase()}</span><b>{tracker.completed}/{tracker.expected} unique expected read-only tools complete</b>{tracker.rows.length === 0 ? <small>{tracker.state === "empty" ? "No sanitized activity supplied." : "Awaiting observed activity."}</small> : <div className="twf-tracker-rows">{tracker.rows.map((step) => <span key={`${step.sequence}-${step.tool}`}>{step.sequence} · {step.tool} · {step.classification} · {step.outcome}</span>)}</div>}</div></aside>
      </div>}
      <div className="twf-notice" role="status" aria-live="polite">{notice}</div>
      <footer className="twf-transport" aria-label="Persistent transport controls"><div className="twf-transport-now"><span className="twf-live-dot" /><div><small>NOW CUEING · {player.playback.toUpperCase()}</small><strong>{activeTrackTitle}</strong><em>{activeTrackProvenance}</em></div></div><div className="twf-transport-controls"><button type="button" className="twf-start" aria-label="Start local transport" onClick={() => startDeck(activeDeck)}>START</button><button type="button" aria-label="Previous local placeholder" onClick={() => previousOrNext(-1)}>‹</button><button type="button" aria-label={player.playback === "paused" ? "Resume local transport" : "Pause local transport"} onClick={() => setPlayer((current) => current.playback === "paused" ? resumeTroopWelfarePlayback(current) : pauseTroopWelfarePlayback(current))}>{player.playback === "paused" ? "▶" : "Ⅱ"}</button><button type="button" aria-label="Next local placeholder" onClick={() => previousOrNext(1)}>›</button><button type="button" className="twf-stop" aria-label="Stop local transport" onClick={() => { setPlayer((current) => stopTroopWelfarePlayback(current)); setNotice("Playback stopped locally. Stop remains available in every state."); }}>■ STOP</button><button type="button" className={`twf-mute ${player.muted ? "is-muted" : ""}`} aria-label={player.muted ? "Unmute local transport" : "Mute local transport"} onClick={() => { setPlayer((current) => setTroopWelfarePlayerMuted(current, !current.muted)); setNotice(player.muted ? "Local transport unmuted." : "Local transport muted."); }}>{player.muted ? "UNMUTE" : "MUTE"}</button></div><label className="twf-master">MASTER <input aria-label="Local master level" type="range" min="0" max="100" value={masterLevel} onChange={(event) => setMasterLevel(Number(event.target.value))} /><b>{masterLevel}</b></label><label className="twf-crossfade">XFADE <input aria-label="Local crossfade" type="range" min="0" max="100" value={crossfade} onChange={(event) => setCrossfade(Number(event.target.value))} /><b>{crossfade}</b></label></footer>
    </div>
  </section>;
}
