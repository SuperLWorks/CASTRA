/**
 * Troop Welfare — memory-resident synthetic Public Demo model.
 *
 * C001.M016 SIGNAL R2. This module is the pure, deterministic engine behind
 * `TroopWelfareWorkspace.tsx`. It is intentionally isolated from CASTRA's
 * authoritative domain:
 *
 * - It imports nothing from `src/domain`, `src/data`, or any other CASTRA
 *   authoritative or hosted-state module, and nothing here can construct a
 *   `CastraCommand` or reach `/api/state`.
 * - It has no repository, `fetch`, local/session storage, cookie, provider,
 *   microphone, camera, geolocation, account, credential, or network path.
 *   Every exported function is a plain, synchronous, side-effect-free
 *   transformation over plain data supplied by its caller.
 * - Every identifier (event id, capability id, request id, job id) is supplied
 *   by the caller. The calling `TroopWelfareWorkspace` component generates
 *   those locally (for example with `crypto.randomUUID()`) and keeps all
 *   resulting state in ordinary React state; nothing here persists anything
 *   beyond that in-memory value.
 * - Bounded, untrusted creative fields (nickname, request text) can never
 *   become authority, budget, expiry, or operational data: the types below
 *   simply have no such fields, and no function in this module bridges a
 *   request into a CASTRA command, approval, or lifecycle transition.
 *
 * Required invariants demonstrated by the functions below (see
 * `troopWelfare.test.ts`):
 *
 * 1. Only an explicit call from the workspace (representing an explicit local
 *    Commander action) creates or continues an event, or issues a new bounded
 *    capability. Nothing here auto-creates or auto-renews either one.
 * 2. Capability TTL is clamped to at most
 *    `TROOP_WELFARE_CAPABILITY_MAX_TTL_MINUTES`, is single-use, is visible via
 *    `troopWelfareCapabilityState`, is revocable, and is never auto-renewed —
 *    there is no "extend" or "refresh" function, only `issueTroopWelfareCapability`,
 *    which always mints a distinct new record.
 * 3. Event lifetime (`TroopWelfareEvent`), job capability
 *    (`TroopWelfareCapability`), and the optional presence timer
 *    (`TroopWelfarePresence`) are distinct types with independent transition
 *    functions; none of the three is mutated as a side effect of transitioning
 *    another.
 * 4. Request text and nickname are bounded/untrusted creative fields
 *    (`boundedCreativeText`) and the `TroopWelfareAudienceRequest` type carries
 *    no authority, budget, expiry, or operational field.
 * 5. A generation job can reach `"ready"` only after passing local moderation
 *    (`reviewTroopWelfareGenerationJob`) and rights/content review
 *    (`applyTroopWelfareGenerationJobRightsReview`); `markTroopWelfareGenerationJobReady`
 *    refuses every other path.
 * 6. Every queue item and generation job carries a `source` and
 *    `provenanceLabel` drawn from `TROOP_WELFARE_PROVENANCE_LABELS`.
 * 7. `troopWelfareStopMuteAvailable` is unconditionally `true`: Stop/Mute stays
 *    available across pause, capability expiry, an unavailable-provider
 *    simulation, and every terminal state.
 * 8. `submitTroopWelfareAudienceRequest` and `createTroopWelfareGenerationJob`
 *    both reject a repeated identifier, so an unknown retried submission never
 *    creates a second, duplicate job.
 * 9. The publication view defaults `includeHumanMusicAudio` to `false`, and
 *    `TROOP_WELFARE_PUBLICATION_RIGHTS_NOTE` states that event performance
 *    rights and recording/publication rights are separate.
 */

export const TROOP_WELFARE_MODEL_REVISION = "troop-welfare.2026-09-01.r2" as const;

export type TroopWelfareResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

/**
 * Strips control characters (checked by numeric code point, never a regex
 * escape sequence, so this cannot be silently mistranscribed), collapses
 * whitespace, trims, then clamps length. Used for every bounded, untrusted
 * creative field (nickname, request text) so none of them can carry a control
 * byte or exceed its bound.
 */
export function boundedCreativeText(value: string, maxLength: number): string {
  let withoutControlCharacters = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const isControlCharacter = codePoint < 0x20 || codePoint === 0x7f;
    withoutControlCharacters += isControlCharacter ? " " : character;
  }
  return withoutControlCharacters
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(0, maxLength));
}

// ---------------------------------------------------------------------------
// Event lifecycle — create / start / active / pause / stop (terminal).
// ---------------------------------------------------------------------------

export const TROOP_WELFARE_EVENT_TITLE_MAX_LENGTH = 80;

export type TroopWelfareEventStatus = "draft" | "active" | "paused" | "stopped";
export type TroopWelfareEventAction = "start" | "pause" | "resume" | "stop";
export type TroopWelfareParticipationMode = "human_only" | "ai_only" | "mixed";

export interface TroopWelfareEvent {
  id: string;
  title: string;
  participationMode: TroopWelfareParticipationMode;
  status: TroopWelfareEventStatus;
  createdAt: string;
  startedAt: string | null;
  lastPausedAt: string | null;
  stoppedAt: string | null;
  provenance: "synthetic_local_demo";
}

/** `draft -> active -> paused -> active -> stopped`; `stopped` is terminal. */
const TROOP_WELFARE_EVENT_TRANSITIONS: Record<
  TroopWelfareEventStatus,
  Partial<Record<TroopWelfareEventAction, TroopWelfareEventStatus>>
> = {
  draft: { start: "active", stop: "stopped" },
  active: { pause: "paused", stop: "stopped" },
  paused: { resume: "active", stop: "stopped" },
  stopped: {},
};

export function createTroopWelfareEvent(input: {
  id: string;
  title: string;
  participationMode: TroopWelfareParticipationMode;
  nowIso: string;
}): TroopWelfareEvent {
  return {
    id: input.id,
    title: boundedCreativeText(input.title, TROOP_WELFARE_EVENT_TITLE_MAX_LENGTH) || "Untitled synthetic event",
    participationMode: input.participationMode,
    status: "draft",
    createdAt: input.nowIso,
    startedAt: null,
    lastPausedAt: null,
    stoppedAt: null,
    provenance: "synthetic_local_demo",
  };
}

/**
 * The only way a `TroopWelfareEvent` changes status. `stopped` is a terminal
 * shutdown with no outgoing transition — continuing after a stop requires a
 * brand new explicit `createTroopWelfareEvent` call, never a resume of the
 * same record.
 */
export function applyTroopWelfareEventAction(
  event: TroopWelfareEvent,
  action: TroopWelfareEventAction,
  nowIso: string,
): TroopWelfareResult<TroopWelfareEvent> {
  const nextStatus = TROOP_WELFARE_EVENT_TRANSITIONS[event.status][action];
  if (!nextStatus) {
    return {
      ok: false,
      reason: `Cannot ${action} this synthetic event while it is ${event.status}. It never transitions on its own; only an explicit local Commander action changes it.`,
    };
  }
  const updated: TroopWelfareEvent = { ...event, status: nextStatus };
  if (action === "start") updated.startedAt = nowIso;
  if (action === "pause") updated.lastPausedAt = nowIso;
  if (action === "resume") updated.lastPausedAt = null;
  if (action === "stop") updated.stoppedAt = nowIso;
  return { ok: true, value: updated };
}

// ---------------------------------------------------------------------------
// Job capability — single-use, TTL-bounded, revocable, never auto-renewed.
// ---------------------------------------------------------------------------

export const TROOP_WELFARE_CAPABILITY_MAX_TTL_MINUTES = 60;
export const TROOP_WELFARE_CAPABILITY_DEFAULT_TTL_MINUTES = 15;

export type TroopWelfareCapabilityState = "active" | "used" | "revoked" | "expired";

export interface TroopWelfareCapability {
  id: string;
  eventId: string;
  issuedAt: string;
  expiresAt: string;
  ttlMinutes: number;
  usedAt: string | null;
  revokedAt: string | null;
  provenance: "synthetic_local_demo";
}

/**
 * Mints one new, distinct capability. `requestedTtlMinutes` is clamped to
 * `[1, TROOP_WELFARE_CAPABILITY_MAX_TTL_MINUTES]` — a caller cannot exceed the
 * 60-minute ceiling. There is no "extend" or "renew" function anywhere in this
 * module; a lapsed capability can only be replaced by issuing a new one.
 */
export function issueTroopWelfareCapability(input: {
  id: string;
  eventId: string;
  nowIso: string;
  requestedTtlMinutes?: number;
}): TroopWelfareCapability {
  const requested = input.requestedTtlMinutes ?? TROOP_WELFARE_CAPABILITY_DEFAULT_TTL_MINUTES;
  const ttlMinutes = Math.min(
    Math.max(1, Math.round(Number.isFinite(requested) ? requested : TROOP_WELFARE_CAPABILITY_DEFAULT_TTL_MINUTES)),
    TROOP_WELFARE_CAPABILITY_MAX_TTL_MINUTES,
  );
  const expiresAt = new Date(new Date(input.nowIso).getTime() + ttlMinutes * 60_000).toISOString();
  return {
    id: input.id,
    eventId: input.eventId,
    issuedAt: input.nowIso,
    expiresAt,
    ttlMinutes,
    usedAt: null,
    revokedAt: null,
    provenance: "synthetic_local_demo",
  };
}

/** Visible, deterministic status. Revoked and used both outrank expiry. */
export function troopWelfareCapabilityState(
  capability: TroopWelfareCapability,
  nowIso: string,
): TroopWelfareCapabilityState {
  if (capability.revokedAt) return "revoked";
  if (capability.usedAt) return "used";
  if (new Date(nowIso).getTime() >= new Date(capability.expiresAt).getTime()) return "expired";
  return "active";
}

/** Single-use: consuming an already used, revoked, or expired capability fails. */
export function consumeTroopWelfareCapability(
  capability: TroopWelfareCapability,
  nowIso: string,
): TroopWelfareResult<TroopWelfareCapability> {
  const state = troopWelfareCapabilityState(capability, nowIso);
  if (state !== "active") {
    return {
      ok: false,
      reason: `This capability is ${state}, not active, so it cannot be consumed. Issue a new capability instead; none is ever auto-renewed.`,
    };
  }
  return { ok: true, value: { ...capability, usedAt: nowIso } };
}

/** Revocation is blocked only once the capability was already used or revoked. */
export function revokeTroopWelfareCapability(
  capability: TroopWelfareCapability,
  nowIso: string,
): TroopWelfareResult<TroopWelfareCapability> {
  if (capability.usedAt) return { ok: false, reason: "This capability was already used and cannot be revoked after the fact." };
  if (capability.revokedAt) return { ok: false, reason: "This capability was already revoked." };
  return { ok: true, value: { ...capability, revokedAt: nowIso } };
}

// ---------------------------------------------------------------------------
// Presence — distinct from both the event lifetime and the job capability.
// ---------------------------------------------------------------------------

export interface TroopWelfarePresence {
  participantLabel: string;
  lastSeenAt: string;
  timeoutMinutes: number;
}

export function touchTroopWelfarePresence(presence: TroopWelfarePresence, nowIso: string): TroopWelfarePresence {
  return { ...presence, lastSeenAt: nowIso };
}

export function troopWelfarePresenceActive(presence: TroopWelfarePresence, nowIso: string): boolean {
  const elapsedMinutes = (new Date(nowIso).getTime() - new Date(presence.lastSeenAt).getTime()) / 60_000;
  return elapsedMinutes <= presence.timeoutMinutes;
}

// ---------------------------------------------------------------------------
// Audience requests — bounded, untrusted creative input only.
// ---------------------------------------------------------------------------

export const TROOP_WELFARE_REQUEST_NICKNAME_MAX_LENGTH = 40;
export const TROOP_WELFARE_REQUEST_TEXT_MAX_LENGTH = 200;

export type TroopWelfareAudienceRequestStatus =
  | "submitted"
  | "moderated_ok"
  | "moderated_blocked"
  | "selected"
  | "rejected";

/**
 * Deliberately has no authority, budget, expiry, or operational field. A
 * request can never modify anything beyond its own `status` in this queue.
 */
export interface TroopWelfareAudienceRequest {
  id: string;
  nickname: string;
  requestText: string;
  submittedAt: string;
  status: TroopWelfareAudienceRequestStatus;
  provenance: "synthetic_local_demo";
}

/** Rejects a repeated `id` so a retried/unknown submission never duplicates. */
export function submitTroopWelfareAudienceRequest(
  requests: readonly TroopWelfareAudienceRequest[],
  input: { id: string; nickname: string; requestText: string; nowIso: string },
): TroopWelfareResult<TroopWelfareAudienceRequest[]> {
  if (requests.some((request) => request.id === input.id)) {
    return {
      ok: false,
      reason: "A request with this identifier is already queued. An unknown retried submission never creates a second, duplicate entry.",
    };
  }
  const requestText = boundedCreativeText(input.requestText, TROOP_WELFARE_REQUEST_TEXT_MAX_LENGTH);
  if (!requestText) {
    return { ok: false, reason: "Enter request text before submitting. It is bounded, untrusted creative input only." };
  }
  const nickname = boundedCreativeText(input.nickname, TROOP_WELFARE_REQUEST_NICKNAME_MAX_LENGTH) || "Anonymous";
  const request: TroopWelfareAudienceRequest = {
    id: input.id,
    nickname,
    requestText,
    submittedAt: input.nowIso,
    status: "submitted",
    provenance: "synthetic_local_demo",
  };
  return { ok: true, value: [...requests, request] };
}

export function moderateTroopWelfareAudienceRequest(
  request: TroopWelfareAudienceRequest,
  outcome: "approve" | "block",
): TroopWelfareResult<TroopWelfareAudienceRequest> {
  if (request.status !== "submitted") {
    return { ok: false, reason: `Only a freshly submitted request can be moderated; this one is already ${request.status}.` };
  }
  return { ok: true, value: { ...request, status: outcome === "approve" ? "moderated_ok" : "moderated_blocked" } };
}

/** The raffle/selection step: only a request that passed moderation is eligible. */
export function selectTroopWelfareAudienceRequest(
  request: TroopWelfareAudienceRequest,
): TroopWelfareResult<TroopWelfareAudienceRequest> {
  if (request.status !== "moderated_ok") {
    return { ok: false, reason: "Only a request that passed local moderation can be selected by the raffle." };
  }
  return { ok: true, value: { ...request, status: "selected" } };
}

export function rejectTroopWelfareAudienceRequest(
  request: TroopWelfareAudienceRequest,
): TroopWelfareResult<TroopWelfareAudienceRequest> {
  if (request.status === "selected" || request.status === "rejected") {
    return { ok: false, reason: `This request is already ${request.status}.` };
  }
  return { ok: true, value: { ...request, status: "rejected" } };
}

// ---------------------------------------------------------------------------
// Generation jobs — requested / reviewed / generating / quarantined /
// analyzed / rights_review / ready. No provider is ever actually invoked.
// ---------------------------------------------------------------------------

export type TroopWelfareJobSource = "human" | "ai" | "local_placeholder";
export type TroopWelfareJobState =
  | "requested"
  | "reviewed"
  | "generating"
  | "quarantined"
  | "analyzed"
  | "rights_review"
  | "ready";

export const TROOP_WELFARE_PROVENANCE_LABELS: Record<TroopWelfareJobSource, string> = {
  human: "Human audience request (synthetic queue)",
  ai: "AI-suggested seed (local placeholder, no provider call)",
  local_placeholder: "Local placeholder only — no provider execution",
};

/** At most this many generation candidates per selected audience request. */
export const TROOP_WELFARE_MAX_JOBS_PER_REQUEST = 2;

export interface TroopWelfareGenerationJob {
  id: string;
  requestId: string | null;
  source: TroopWelfareJobSource;
  provenanceLabel: string;
  state: TroopWelfareJobState;
  moderationPassed: boolean;
  rightsReviewPassed: boolean;
  createdAt: string;
  updatedAt: string;
}

export function troopWelfareCanCreateAnotherJobForRequest(
  jobs: readonly TroopWelfareGenerationJob[],
  requestId: string,
): boolean {
  return jobs.filter((job) => job.requestId === requestId).length < TROOP_WELFARE_MAX_JOBS_PER_REQUEST;
}

/**
 * Rejects a repeated `id` (an unknown retried creation must never duplicate a
 * job) and caps distinct candidates per request at
 * `TROOP_WELFARE_MAX_JOBS_PER_REQUEST`, matching "one-or-two song generation
 * candidates" per selected request.
 */
export function createTroopWelfareGenerationJob(
  jobs: readonly TroopWelfareGenerationJob[],
  input: { id: string; requestId?: string | null; source: TroopWelfareJobSource; nowIso: string },
): TroopWelfareResult<TroopWelfareGenerationJob[]> {
  if (jobs.some((job) => job.id === input.id)) {
    return {
      ok: false,
      reason: "A generation job with this identifier already exists. An unknown retried creation never creates a duplicate second job.",
    };
  }
  const requestId = input.requestId ?? null;
  if (requestId && !troopWelfareCanCreateAnotherJobForRequest(jobs, requestId)) {
    return {
      ok: false,
      reason: `This audience request already has ${TROOP_WELFARE_MAX_JOBS_PER_REQUEST} generation candidates, the local maximum.`,
    };
  }
  const job: TroopWelfareGenerationJob = {
    id: input.id,
    requestId,
    source: input.source,
    provenanceLabel: TROOP_WELFARE_PROVENANCE_LABELS[input.source],
    state: "requested",
    moderationPassed: false,
    rightsReviewPassed: false,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  };
  return { ok: true, value: [...jobs, job] };
}

export function reviewTroopWelfareGenerationJob(
  job: TroopWelfareGenerationJob,
  outcome: "pass" | "block",
  nowIso: string,
): TroopWelfareResult<TroopWelfareGenerationJob> {
  if (job.state !== "requested") {
    return { ok: false, reason: `Local moderation review only applies to a freshly requested job; this one is already ${job.state}.` };
  }
  return outcome === "pass"
    ? { ok: true, value: { ...job, state: "reviewed", moderationPassed: true, updatedAt: nowIso } }
    : { ok: true, value: { ...job, state: "quarantined", moderationPassed: false, updatedAt: nowIso } };
}

export function startTroopWelfareGenerationJobGenerating(
  job: TroopWelfareGenerationJob,
  nowIso: string,
): TroopWelfareResult<TroopWelfareGenerationJob> {
  if (job.state !== "reviewed") {
    return { ok: false, reason: `Simulated generation can start only after local moderation passes; this job is ${job.state}.` };
  }
  return { ok: true, value: { ...job, state: "generating", updatedAt: nowIso } };
}

export function completeTroopWelfareGenerationJobAnalysis(
  job: TroopWelfareGenerationJob,
  nowIso: string,
): TroopWelfareResult<TroopWelfareGenerationJob> {
  if (job.state !== "generating") {
    return { ok: false, reason: `Local content analysis only applies after simulated generation started; this job is ${job.state}.` };
  }
  return { ok: true, value: { ...job, state: "analyzed", updatedAt: nowIso } };
}

export function applyTroopWelfareGenerationJobRightsReview(
  job: TroopWelfareGenerationJob,
  outcome: "pass" | "block",
  nowIso: string,
): TroopWelfareResult<TroopWelfareGenerationJob> {
  if (job.state !== "analyzed") {
    return { ok: false, reason: `Rights/content review only applies after local analysis; this job is ${job.state}.` };
  }
  return outcome === "pass"
    ? { ok: true, value: { ...job, state: "rights_review", rightsReviewPassed: true, updatedAt: nowIso } }
    : { ok: true, value: { ...job, state: "quarantined", rightsReviewPassed: false, updatedAt: nowIso } };
}

/**
 * The only path into `"ready"`. Refuses unless the job is exactly at
 * `"rights_review"` and both `moderationPassed` and `rightsReviewPassed` are
 * true — a simulated generation result can never enter `ready` without local
 * moderation and rights/content review.
 */
export function markTroopWelfareGenerationJobReady(
  job: TroopWelfareGenerationJob,
  nowIso: string,
): TroopWelfareResult<TroopWelfareGenerationJob> {
  if (job.state !== "rights_review") {
    return { ok: false, reason: `A job can enter ready only from a passed rights/content review; this job is ${job.state}.` };
  }
  if (!job.moderationPassed || !job.rightsReviewPassed) {
    return {
      ok: false,
      reason: "A simulated generation result cannot enter ready without both local moderation and rights/content review passing.",
    };
  }
  return { ok: true, value: { ...job, state: "ready", updatedAt: nowIso } };
}

// ---------------------------------------------------------------------------
// Player — one queue, two logical decks, play/pause/stop/skip/mute.
// ---------------------------------------------------------------------------

export type TroopWelfareDeckId = "deck_a" | "deck_b";
export type TroopWelfarePlaybackState = "idle" | "playing" | "paused" | "stopped";

export interface TroopWelfarePlayerState {
  activeDeck: TroopWelfareDeckId | null;
  nowPlayingJobId: string | null;
  playback: TroopWelfarePlaybackState;
  muted: boolean;
}

export const INITIAL_TROOP_WELFARE_PLAYER_STATE: TroopWelfarePlayerState = {
  activeDeck: null,
  nowPlayingJobId: null,
  playback: "idle",
  muted: false,
};

export function playTroopWelfareDeck(
  player: TroopWelfarePlayerState,
  deck: TroopWelfareDeckId,
  jobId: string,
): TroopWelfarePlayerState {
  return { ...player, activeDeck: deck, nowPlayingJobId: jobId, playback: "playing" };
}

export function pauseTroopWelfarePlayback(player: TroopWelfarePlayerState): TroopWelfarePlayerState {
  return player.playback === "playing" ? { ...player, playback: "paused" } : player;
}

export function resumeTroopWelfarePlayback(player: TroopWelfarePlayerState): TroopWelfarePlayerState {
  return player.playback === "paused" ? { ...player, playback: "playing" } : player;
}

export function stopTroopWelfarePlayback(player: TroopWelfarePlayerState): TroopWelfarePlayerState {
  return { ...player, playback: "stopped", activeDeck: null, nowPlayingJobId: null };
}

export function skipTroopWelfareDeck(
  player: TroopWelfarePlayerState,
  deck: TroopWelfareDeckId,
  jobId: string,
): TroopWelfarePlayerState {
  return { ...player, activeDeck: deck, nowPlayingJobId: jobId, playback: "playing" };
}

export function setTroopWelfarePlayerMuted(player: TroopWelfarePlayerState, muted: boolean): TroopWelfarePlayerState {
  return { ...player, muted };
}

/**
 * Always `true`. Stop/Mute is a local playback control independent of event,
 * capability, and job lifecycle state, so it stays available across pause,
 * capability expiry, an unavailable-provider simulation, and every terminal
 * state. The context parameter exists only so a caller can document which
 * state it checked; no combination of values ever changes the result.
 */
export function troopWelfareStopMuteAvailable(context?: {
  eventStatus?: TroopWelfareEventStatus;
  capabilityState?: TroopWelfareCapabilityState;
  jobState?: TroopWelfareJobState;
}): boolean {
  void context;
  return true;
}

// ---------------------------------------------------------------------------
// Publication isolation.
// ---------------------------------------------------------------------------

export const TROOP_WELFARE_PUBLICATION_RIGHTS_NOTE =
  "Event performance rights and recording/publication rights are separate. Selecting or playing a song for this simulated event never grants YouTube or other publication rights.";

export const TROOP_WELFARE_HUMAN_MUSIC_EXCLUSION_NOTE =
  "Third-party human music is never automatically included in generated YouTube content.";

export interface TroopWelfarePublicationView {
  includeHumanMusicAudio: boolean;
}

export const INITIAL_TROOP_WELFARE_PUBLICATION_VIEW: TroopWelfarePublicationView = {
  includeHumanMusicAudio: false,
};

export function setTroopWelfarePublicationIncludesHumanMusic(include: boolean): TroopWelfarePublicationView {
  return { includeHumanMusicAudio: include };
}

// ---------------------------------------------------------------------------
// Voice — regular SARGE voice configurable; DJ SARGE persona gated/inactive.
// ---------------------------------------------------------------------------

export type TroopWelfareVoiceProfileId = "regular_sarge" | "dj_sarge_cloned";

export interface TroopWelfareVoiceProfile {
  id: TroopWelfareVoiceProfileId;
  label: string;
  available: boolean;
  note: string;
}

export const TROOP_WELFARE_VOICE_PROFILES: readonly TroopWelfareVoiceProfile[] = [
  { id: "regular_sarge", label: "Regular SARGE voice", available: true, note: "Configurable in this synthetic demo." },
  {
    id: "dj_sarge_cloned",
    label: "DJ SARGE persona (cloned voice)",
    available: false,
    note: "Separately gated and inactive; no cloned voice is used here.",
  },
];

export interface TroopWelfareVoiceSelection {
  profileId: TroopWelfareVoiceProfileId;
}

export const INITIAL_TROOP_WELFARE_VOICE_SELECTION: TroopWelfareVoiceSelection = { profileId: "regular_sarge" };

export function selectTroopWelfareVoiceProfile(
  profileId: TroopWelfareVoiceProfileId,
): TroopWelfareResult<TroopWelfareVoiceSelection> {
  const profile = TROOP_WELFARE_VOICE_PROFILES.find((item) => item.id === profileId);
  if (!profile) return { ok: false, reason: "Unknown voice profile." };
  if (!profile.available) {
    return { ok: false, reason: `${profile.label} is separately gated and inactive in this synthetic demo.` };
  }
  return { ok: true, value: { profileId } };
}

// ---------------------------------------------------------------------------
// Non-functional QR / request-code illustration.
// ---------------------------------------------------------------------------

export const TROOP_WELFARE_REQUEST_CODE_NOTE =
  "Local simulation only. This illustration never creates a public endpoint, signed grant, live intake, account, microphone, or provider-backed generation.";

export function troopWelfareSyntheticRequestCode(eventId: string): string {
  const tail = eventId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return `LOCAL-SIM-${tail || "000000"}`;
}
