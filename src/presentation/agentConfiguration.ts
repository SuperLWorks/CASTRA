/**
 * CASTRA 1.0 candidate — portable Agent Configuration capability model.
 *
 * Purpose: let a Commander other than the authoring Commander configure CASTRA
 * without inheriting the authoring deployment's provider, account, voice,
 * storage, or deployment choices.
 *
 * This module is pure data and pure functions. It holds no state, performs no
 * input/output, imports nothing from the domain command layer, the hosted
 * repository, authentication, or WebMCP, and cannot activate a provider, spend
 * money, or mutate any record. Nothing here is a mutation path: a selection
 * made against this model is a Commander review aid until a separately
 * governed, already-existing command applies it.
 *
 * Four value classes are kept apart on purpose:
 *   public_default              shippable in the public candidate;
 *   sanitized_example           synthetic illustration, no real identifier;
 *   private_commander_selection lives in a private Commander Deployment Pack;
 *   secret                      lives only in a secret store or environment.
 *
 * Public serialization fails closed: private, secret, unknown, secret-shaped,
 * private-shaped, over-limit, and malformed values are withheld by reason code
 * and their values are never echoed into the public projection.
 */

export const AGENT_CONFIGURATION_MODEL_VERSION = "castra.agent-configuration-model/1.0.0-candidate";

export const AGENT_CONFIGURATION_LIFECYCLE = "candidate · active development · not yet published";

/** Value confidentiality classes. Only the first two may ever be published. */
export type DisclosureClassification =
  | "public_default"
  | "sanitized_example"
  | "private_commander_selection"
  | "secret";

export type PublicClassification = Extract<DisclosureClassification, "public_default" | "sanitized_example">;

export const PUBLIC_CLASSIFICATIONS: readonly PublicClassification[] = ["public_default", "sanitized_example"];

export const NON_PUBLIC_CLASSIFICATIONS: readonly DisclosureClassification[] = [
  "private_commander_selection",
  "secret",
];

export type CapabilityClassId =
  | "agent_runtime"
  | "agent_adapter"
  | "regular_sarge_voice"
  | "voice_interaction"
  | "operational_store"
  | "deployment_target"
  | "optional_service"
  | "dj_sarge_cloned_voice";

export type CostClass =
  | "no_additional_spend"
  | "commander_existing_subscription_no_additional_spend"
  | "commander_metered_cost_possible_not_authorized_here"
  | "unknown_until_commander_review";

export type QualificationState =
  | "not_evaluated_no_provider_activated"
  | "commander_qualification_required"
  | "not_available_in_this_candidate";

/**
 * Every selectable option must disclose all of these before selection.
 * `capabilityClass` and `compatibleWith` describe fit; the rest describe
 * consequence. A missing field makes the option invalid, not merely sparse.
 */
export const REQUIRED_DISCLOSURE_FIELDS = [
  "capabilityClass",
  "compatibleWith",
  "authorityImpact",
  "dataSent",
  "retentionAssumption",
  "commercialRights",
  "costClass",
  "recoveryExitPath",
  "deploymentImplication",
  "qualificationState",
  "confidentiality",
] as const;

export type RequiredDisclosureField = (typeof REQUIRED_DISCLOSURE_FIELDS)[number];

export interface CapabilityOption {
  id: string;
  capabilityClass: CapabilityClassId;
  name: string;
  summary: string;
  compatibleWith: string;
  authorityImpact: string;
  dataSent: string;
  retentionAssumption: string;
  commercialRights: string;
  costClass: CostClass;
  recoveryExitPath: string;
  deploymentImplication: string;
  qualificationState: QualificationState;
  confidentiality: PublicClassification;
}

export interface CapabilityClass {
  id: CapabilityClassId;
  name: string;
  purpose: string;
  authorityBoundary: string;
  publicDefaultOptionId: string;
  replaceable: boolean;
}

/**
 * A named configuration value that is deliberately NOT part of CASTRA Core and
 * NOT part of the public candidate. Slots carry no value: they describe where
 * the value lives and why it is withheld, so a portable deployment can see the
 * shape of what it must supply without ever seeing another deployment's answer.
 */
export interface WithheldSlot {
  key: string;
  capabilityClass: CapabilityClassId;
  classification: Exclude<DisclosureClassification, PublicClassification>;
  describesWhat: string;
  livesWhere: string;
  valueRendered: false;
}

export const SPEND_BOUNDARY =
  "Additional spend for this configuration surface is $0. Reviewing, comparing, or marking an option here activates no provider, opens no account, presents no credential, and incurs no charge.";

export const SELECTION_EFFECT_NOTICE =
  "This worksheet is disclosure-first and effect-free. Marking an option under consideration saves nothing, applies nothing, registers nothing, and creates no CASTRA record, command, or audit event. Applying a choice remains a separate, already-governed Commander action.";

export const AUTHORITY_INVARIANT =
  "CASTRA roles, role separation, deterministic authority, and Commander-gated approval do not change with any selection below. Agents remain proposal-only, protected effects remain fail-closed, and no option adds a write path to hosted operational state.";

export const CORE_SEPARATION_NOTICE =
  "CASTRA Core, optional adapters, private Commander Deployment Packs, and operational stores are physically and logically distinct. Core ships no Commander selection; a Deployment Pack holds the private selections; a secret store holds secrets; the operational store holds records. None of the four is a substitute for another.";

/** Regular SARGE voice and the future DJ SARGE cloned voice are separate capabilities. */
export const VOICE_CAPABILITY_SEPARATION =
  "Regular SARGE voice is an ordinary, replaceable synthesis capability that each Commander configures for their own deployment. A cloned or likeness-derived DJ SARGE voice is a different capability with different consent, rights, provenance, and authorization requirements. It is not available in this candidate, is not implied by any regular-voice selection, and cannot be enabled from this surface.";

export interface VoiceInteractionSemantic {
  id: string;
  name: string;
  rule: string;
  neverClaim: string;
}

/**
 * These three semantics are contract, not preference. They hold for every voice
 * option, including "no synthesized voice".
 */
export const VOICE_INTERACTION_SEMANTICS: readonly VoiceInteractionSemantic[] = [
  {
    id: "push_to_talk",
    name: "Push-to-talk capture",
    rule: "Capture is explicitly held open by the Commander for the duration of the utterance. There is no always-on listening state, no wake word, and no background capture when the control is released.",
    neverClaim: "Never describe a released or idle control as listening, and never treat an unheld control as consent to capture.",
  },
  {
    id: "editable_confirmation",
    name: "Editable confirmation",
    rule: "Any transcribed or interpreted result is presented as editable text that the Commander may correct, replace, or discard before confirming. Confirmation is a distinct deliberate act on the corrected text.",
    neverClaim: "Never treat a transcript as confirmed input, and never apply an interpretation the Commander has not confirmed in its final edited form.",
  },
  {
    id: "typed_fallback",
    name: "Typed fallback",
    rule: "Typing remains fully available whenever voice is unavailable, refused, unclear, or simply not wanted. A typed interaction is complete and legitimate on its own terms.",
    neverClaim: "Never report a typed interaction as a completed voice outcome, a successful transcription, or evidence that a voice path worked.",
  },
];

const CLASSES: readonly CapabilityClass[] = [
  {
    id: "agent_runtime",
    name: "Agent runtime class",
    purpose: "Which class of runtime may execute bounded agent work for a role.",
    authorityBoundary: "A runtime never gains approval, closure, waiver, or release authority. Role separation and the decision matrix are unchanged by this choice.",
    publicDefaultOptionId: "agent_runtime.none_selected",
    replaceable: true,
  },
  {
    id: "agent_adapter",
    name: "Agent adapter class",
    purpose: "How a selected runtime is reached: the transport or integration surface, not the vendor.",
    authorityBoundary: "An adapter carries proposals and read-only projections only. No adapter class may add a hosted-state mutation path or bypass a Commander gate.",
    publicDefaultOptionId: "agent_adapter.none_selected",
    replaceable: true,
  },
  {
    id: "regular_sarge_voice",
    name: "Regular SARGE voice output",
    purpose: "How ordinary spoken output is produced, if the Commander wants spoken output at all.",
    authorityBoundary: "Voice output is presentation. It confirms nothing, authorizes nothing, and never substitutes for a Commander decision.",
    publicDefaultOptionId: "regular_sarge_voice.none_selected",
    replaceable: true,
  },
  {
    id: "voice_interaction",
    name: "Voice interaction mode",
    purpose: "How voice input is captured and confirmed, and what happens when it is unavailable.",
    authorityBoundary: "Push-to-talk, editable confirmation, and typed fallback are preserved in every mode. A typed interaction is never reported as a voice outcome.",
    publicDefaultOptionId: "voice_interaction.typed_only",
    replaceable: true,
  },
  {
    id: "operational_store",
    name: "Operational state store class",
    purpose: "Where durable operational records live for this deployment.",
    authorityBoundary: "Authenticated hosted-state boundaries and fail-closed behaviour are unchanged. A local candidate store is never operational authority and is never promoted into one.",
    publicDefaultOptionId: "operational_store.none_selected",
    replaceable: true,
  },
  {
    id: "deployment_target",
    name: "Deployment target class",
    purpose: "Where the application and its server boundary run.",
    authorityBoundary: "A deployment target grants no authority. Production effects still require the recorded per-deployment Commander authorization.",
    publicDefaultOptionId: "deployment_target.none_selected",
    replaceable: true,
  },
  {
    id: "optional_service",
    name: "Optional service class",
    purpose: "Additional services a Commander may add, each of which must earn its data-use and cost disclosure.",
    authorityBoundary: "Optional services are additive and removable. None may become a dependency of authority, lifecycle, or evidence integrity.",
    publicDefaultOptionId: "optional_service.none",
    replaceable: true,
  },
  {
    id: "dj_sarge_cloned_voice",
    name: "DJ SARGE cloned-voice path (separate, gated)",
    purpose: "Declared here only so it is visibly distinct from regular voice and visibly unavailable.",
    authorityBoundary: "Not available in this candidate. Any future path requires separate Commander authorization covering consent, likeness, rights provenance, and retention before any configuration exists.",
    publicDefaultOptionId: "dj_sarge_cloned_voice.not_available",
    replaceable: false,
  },
];

const OPTIONS: readonly CapabilityOption[] = [
  // --- Agent runtime -------------------------------------------------------
  {
    id: "agent_runtime.none_selected",
    capabilityClass: "agent_runtime",
    name: "No runtime selected — Commander decision required",
    summary: "The shipped public default. CASTRA runs with human-only execution until a Commander deliberately chooses otherwise.",
    compatibleWith: "Every adapter class, because nothing is dispatched.",
    authorityImpact: "None. All work remains human, and every gate stays exactly where it is.",
    dataSent: "Nothing leaves the deployment for agent execution.",
    retentionAssumption: "No external retention exists to reason about.",
    commercialRights: "No third-party terms apply because no third party is engaged.",
    costClass: "no_additional_spend",
    recoveryExitPath: "Already the neutral state; there is nothing to exit from.",
    deploymentImplication: "No runtime credential, allowlist, network egress, or environment variable is required.",
    qualificationState: "not_evaluated_no_provider_activated",
    confidentiality: "public_default",
  },
  {
    id: "agent_runtime.local_inference_class",
    capabilityClass: "agent_runtime",
    name: "Local inference on Commander-controlled hardware (class)",
    summary: "A model runtime executing on hardware the Commander owns or controls. Named as a class; no specific engine, model, or vendor is selected here.",
    compatibleWith: "Local adapter class; unsuitable for a hosted-only deployment target with no local companion.",
    authorityImpact: "Proposal-only, and typically constrained to low-risk drafting, extraction, and fixed-category classification with Commander review of every output.",
    dataSent: "Prompt content stays on the Commander's own hardware. Nothing is transmitted to a third party by the runtime itself.",
    retentionAssumption: "Retention is whatever the Commander's own machine retains; no third-party retention window applies.",
    commercialRights: "The Commander must read the licence of the specific engine and model weights they choose, including any restriction on commercial use, redistribution, or output claims.",
    costClass: "no_additional_spend",
    recoveryExitPath: "Stop the local process and revert to the human-only default; no external account or data must be reclaimed.",
    deploymentImplication: "Requires local compute, storage, and a companion path from the browser surface; adds nothing to the hosted deployment.",
    qualificationState: "commander_qualification_required",
    confidentiality: "public_default",
  },
  {
    id: "agent_runtime.first_party_subscription_handoff_class",
    capabilityClass: "agent_runtime",
    name: "First-party subscription handoff (class)",
    summary: "Bounded work handed to an assistant runtime the Commander already subscribes to, launched under their own session rather than a metered programmatic interface.",
    compatibleWith: "Handoff adapter class; not a programmatic server-to-server integration.",
    authorityImpact: "Proposal-only. Results return as reviewable candidates and never as approvals, closures, or authority.",
    dataSent: "Whatever bounded task context the Commander chooses to hand over. Treat everything handed over as disclosed to that provider.",
    retentionAssumption: "Governed by the provider's own subscription terms, which the Commander must read; this candidate asserts no retention window on their behalf.",
    commercialRights: "Provider terms govern output use, training on inputs, and any commercial restriction. Read them before handing over proprietary material.",
    costClass: "commander_existing_subscription_no_additional_spend",
    recoveryExitPath: "Stop handing work over. Nothing in CASTRA depends on the provider remaining available.",
    deploymentImplication: "No server credential is added to the deployment; the handoff happens in the Commander's own session.",
    qualificationState: "commander_qualification_required",
    confidentiality: "public_default",
  },
  {
    id: "agent_runtime.metered_programmatic_class",
    capabilityClass: "agent_runtime",
    name: "Metered programmatic interface (class) — disclosed, not authorized here",
    summary: "A pay-per-use programmatic interface. Disclosed so the trade-off is visible; this candidate neither configures nor authorizes it.",
    compatibleWith: "Server adapter class only, which is exactly why it changes the deployment's secret and cost posture.",
    authorityImpact: "Proposal-only if ever adopted, but it introduces an unattended-writer question that reopens the assurance-tier review.",
    dataSent: "Task content is transmitted to the provider on every call.",
    retentionAssumption: "Provider-defined and contract-specific. Unknown until the Commander reads and records the applicable terms.",
    commercialRights: "Requires an explicit reading of provider commercial terms, data-processing terms, and any training-on-input clause.",
    costClass: "commander_metered_cost_possible_not_authorized_here",
    recoveryExitPath: "Remove the interface configuration and rotate any credential that was issued; billing continues until the account itself is closed.",
    deploymentImplication: "Adds a server-held secret, a billing relationship, and a new external dependency to the deployment.",
    qualificationState: "commander_qualification_required",
    confidentiality: "public_default",
  },

  // --- Agent adapter -------------------------------------------------------
  {
    id: "agent_adapter.none_selected",
    capabilityClass: "agent_adapter",
    name: "No adapter selected — Commander decision required",
    summary: "The shipped public default. No agent transport is wired.",
    compatibleWith: "Every runtime class, because nothing is dispatched.",
    authorityImpact: "None.",
    dataSent: "Nothing.",
    retentionAssumption: "Not applicable.",
    commercialRights: "Not applicable.",
    costClass: "no_additional_spend",
    recoveryExitPath: "Already the neutral state.",
    deploymentImplication: "No transport configuration is required.",
    qualificationState: "not_evaluated_no_provider_activated",
    confidentiality: "public_default",
  },
  {
    id: "agent_adapter.browser_model_context_class",
    capabilityClass: "agent_adapter",
    name: "Browser model-context adapter (class)",
    summary: "The already-implemented in-page tool surface: read-only projections plus reversible client-local proposals, registered against the browser's model-context API when the browser provides one.",
    compatibleWith: "Any runtime the browser itself exposes. Registration semantics, tool set, and refusal codes are unchanged by this candidate.",
    authorityImpact: "Read and propose only. The registered surface has no write capability, no protected effect, and refuses out-of-context requests with a stable reason code.",
    dataSent: "Only the projections the active experience already renders in that browser session. No credential and no hosted write path is exposed.",
    retentionAssumption: "Ephemeral and page-local. A draft is discarded on abort, experience change, or reload.",
    commercialRights: "No third-party media or content is introduced by the adapter itself.",
    costClass: "no_additional_spend",
    recoveryExitPath: "Abort unregisters every registration exactly once; discarding a draft is client-local and immediate.",
    deploymentImplication: "Requires a browser that provides the capability. Absence is detected and refused honestly rather than shimmed.",
    qualificationState: "commander_qualification_required",
    confidentiality: "public_default",
  },
  {
    id: "agent_adapter.session_handoff_class",
    capabilityClass: "agent_adapter",
    name: "Human-mediated session handoff (class)",
    summary: "The Commander carries a bounded task package to a runtime themselves and brings a result back for review.",
    compatibleWith: "Subscription-handoff and local runtime classes.",
    authorityImpact: "The Commander remains in the loop on both directions by construction.",
    dataSent: "Exactly what the Commander chooses to carry, nothing automatic.",
    retentionAssumption: "Determined by the destination runtime's own terms.",
    commercialRights: "Determined by the destination runtime's own terms.",
    costClass: "no_additional_spend",
    recoveryExitPath: "Stop carrying work; no configuration to unwind.",
    deploymentImplication: "No credential, endpoint, or allowlist is added to the deployment.",
    qualificationState: "commander_qualification_required",
    confidentiality: "public_default",
  },

  // --- Regular SARGE voice -------------------------------------------------
  {
    id: "regular_sarge_voice.none_selected",
    capabilityClass: "regular_sarge_voice",
    name: "No synthesized voice — text only",
    summary: "The shipped public default. CASTRA is fully usable with no spoken output at all.",
    compatibleWith: "Every voice interaction mode, including typed-only.",
    authorityImpact: "None.",
    dataSent: "Nothing.",
    retentionAssumption: "Not applicable.",
    commercialRights: "Not applicable.",
    costClass: "no_additional_spend",
    recoveryExitPath: "Already the neutral state.",
    deploymentImplication: "No audio, licence, or network dependency.",
    qualificationState: "not_evaluated_no_provider_activated",
    confidentiality: "public_default",
  },
  {
    id: "regular_sarge_voice.platform_local_synthesis_class",
    capabilityClass: "regular_sarge_voice",
    name: "Platform-local speech synthesis (class)",
    summary: "Voices already installed on the Commander's own device or operating system. Which voice, and at what rate, is entirely the Commander's choice.",
    compatibleWith: "Push-to-talk and typed-only interaction modes alike.",
    authorityImpact: "Presentation only. Spoken output confirms nothing.",
    dataSent: "Text to be spoken stays on the device; no network call is required.",
    retentionAssumption: "No external retention.",
    commercialRights: "Bundled platform voices are usually licensed for personal or on-device playback; the Commander should check before recording, redistributing, or publishing the audio.",
    costClass: "no_additional_spend",
    recoveryExitPath: "Turn it off; nothing external must be reclaimed.",
    deploymentImplication: "Availability and voice inventory vary by device and browser, so behaviour differs between Commanders. Never assume a voice exists.",
    qualificationState: "commander_qualification_required",
    confidentiality: "public_default",
  },
  {
    id: "regular_sarge_voice.self_hosted_synthesis_class",
    capabilityClass: "regular_sarge_voice",
    name: "Self-hosted synthesis engine (class)",
    summary: "A synthesis engine the Commander runs themselves, giving consistent output across devices at the cost of running it.",
    compatibleWith: "Deployments that already include a Commander-controlled server or companion.",
    authorityImpact: "Presentation only.",
    dataSent: "Text to be spoken reaches the Commander's own service and no third party.",
    retentionAssumption: "Whatever the Commander's own service retains, which they control and should state.",
    commercialRights: "Engine and voice-model licences must be read individually; some permit local use but restrict distribution of generated audio.",
    costClass: "unknown_until_commander_review",
    recoveryExitPath: "Stop the service and fall back to text-only; no external account to close.",
    deploymentImplication: "Adds an operational component to run, update, and monitor.",
    qualificationState: "commander_qualification_required",
    confidentiality: "public_default",
  },
  {
    id: "regular_sarge_voice.hosted_synthesis_service_class",
    capabilityClass: "regular_sarge_voice",
    name: "Hosted synthesis service (class)",
    summary: "A third-party service that returns synthesized audio. Convenient, and the option with the most consequential disclosures.",
    compatibleWith: "Any deployment with outbound network access and a place to hold a service credential.",
    authorityImpact: "Presentation only, but it introduces an external dependency and a credential to protect.",
    dataSent: "Every phrase to be spoken is transmitted to the service, including any operational text the Commander asks CASTRA to read aloud.",
    retentionAssumption: "Service-defined. Ask specifically whether submitted text or generated audio is retained, logged, or used for model improvement, and record the answer.",
    commercialRights: "Check whether generated audio may be used commercially, whether attribution is required, and whether any voice is a licensed likeness with its own restrictions.",
    costClass: "commander_metered_cost_possible_not_authorized_here",
    recoveryExitPath: "Remove the credential and revert to text-only or local synthesis; request deletion of submitted content under the service's own terms.",
    deploymentImplication: "Adds a server-held secret, outbound egress, and a per-use cost relationship.",
    qualificationState: "commander_qualification_required",
    confidentiality: "public_default",
  },

  // --- Voice interaction ---------------------------------------------------
  {
    id: "voice_interaction.typed_only",
    capabilityClass: "voice_interaction",
    name: "Typed only",
    summary: "The shipped public default. Every interaction is typed; no capture path exists.",
    compatibleWith: "Every voice output option, including no voice at all.",
    authorityImpact: "None. Typed input is a complete interaction in its own right.",
    dataSent: "Nothing beyond what the deployment already handles.",
    retentionAssumption: "Unchanged from the deployment's own store.",
    commercialRights: "Not applicable.",
    costClass: "no_additional_spend",
    recoveryExitPath: "Already the neutral state.",
    deploymentImplication: "No microphone permission is ever requested.",
    qualificationState: "not_evaluated_no_provider_activated",
    confidentiality: "public_default",
  },
  {
    id: "voice_interaction.push_to_talk_with_editable_confirmation",
    capabilityClass: "voice_interaction",
    name: "Push-to-talk with editable confirmation",
    summary: "Capture only while the control is held, then an editable transcript the Commander corrects and confirms. Typed entry stays available throughout.",
    compatibleWith: "Any voice output option and any runtime class.",
    authorityImpact: "None by itself. Confirmation remains a deliberate Commander act on the final edited text, and an unconfirmed transcript is never applied.",
    dataSent: "Captured audio or its transcript goes wherever the chosen transcription capability lives — on-device or a service the Commander names. Disclose that destination before enabling.",
    retentionAssumption: "On-device capture retains nothing beyond the session; a hosted transcription service retains on its own terms, which must be recorded.",
    commercialRights: "Transcription service terms may claim rights over submitted audio; read them before speaking anything proprietary.",
    costClass: "unknown_until_commander_review",
    recoveryExitPath: "Release the control, discard the transcript, or switch back to typed-only at any time. A discarded transcript leaves no record.",
    deploymentImplication: "Requires a microphone permission prompt on the Commander's device and, if hosted transcription is chosen, outbound egress and a credential.",
    qualificationState: "commander_qualification_required",
    confidentiality: "public_default",
  },

  // --- Operational store ---------------------------------------------------
  {
    id: "operational_store.none_selected",
    capabilityClass: "operational_store",
    name: "No durable store selected — Commander decision required",
    summary: "The shipped public default. Without an activated store, hosted state is not authority and the application says so plainly.",
    compatibleWith: "Every deployment target.",
    authorityImpact: "No operational authority exists until a store is deliberately activated and its initial import is performed under its own recorded authority.",
    dataSent: "Nothing leaves the browser.",
    retentionAssumption: "Local browser storage only, which the Commander can clear at any time.",
    commercialRights: "Not applicable.",
    costClass: "no_additional_spend",
    recoveryExitPath: "Already the neutral state.",
    deploymentImplication: "No database, migration, or credential is required to evaluate the application.",
    qualificationState: "not_evaluated_no_provider_activated",
    confidentiality: "public_default",
  },
  {
    id: "operational_store.local_candidate_class",
    capabilityClass: "operational_store",
    name: "Local browser candidate store (class) — never authority",
    summary: "Local, non-authoritative record-keeping for evaluation. It is a candidate path, labelled as such, and is never promoted into hosted state.",
    compatibleWith: "Any deployment target where hosted state is not activated.",
    authorityImpact: "None. Nothing written here is operational state, and it is never uploaded or treated as authority.",
    dataSent: "Nothing. Records stay in the browser profile.",
    retentionAssumption: "Until the browser profile or its storage is cleared. There is no backup.",
    commercialRights: "Not applicable.",
    costClass: "no_additional_spend",
    recoveryExitPath: "Clearing browser storage discards everything, so treat it as disposable and never as a system of record.",
    deploymentImplication: "Zero infrastructure, and zero durability guarantee. Do not evaluate recovery posture from this option.",
    qualificationState: "commander_qualification_required",
    confidentiality: "public_default",
  },
  {
    id: "operational_store.managed_relational_class",
    capabilityClass: "operational_store",
    name: "Managed relational store with an authenticated server boundary (class)",
    summary: "A managed relational database reached only through the deployment's own authenticated server boundary. Named as a class; the provider remains the Commander's decision.",
    compatibleWith: "Deployment targets that can run the server boundary.",
    authorityImpact: "Becomes the operational source once activated and imported under its own recorded authority. Empty, denied, stale, malformed, or unknown results fail closed rather than falling back.",
    dataSent: "Operational records travel between the server boundary and the store. The browser never reaches the store directly.",
    retentionAssumption: "The Commander's own retention and backup policy, which must be written down before it is needed. Free tiers frequently pause, limit, or expire backups.",
    commercialRights: "Read the provider's terms for data ownership, export rights, and any restriction on the deployment's own use of its records.",
    costClass: "unknown_until_commander_review",
    recoveryExitPath: "Prove an export and a restore before depending on it. Migration to another store is a governed change with its own dual-run or cutover plan.",
    deploymentImplication: "Requires migrations applied in order, an authenticated identity path, environment configuration, and a redeploy before configuration takes effect.",
    qualificationState: "commander_qualification_required",
    confidentiality: "public_default",
  },
  {
    id: "operational_store.self_operated_class",
    capabilityClass: "operational_store",
    name: "Self-operated database (class)",
    summary: "A database the Commander runs and maintains themselves, trading convenience for control.",
    compatibleWith: "Deployment targets the Commander operates.",
    authorityImpact: "Identical authority semantics; the operational burden moves to the Commander.",
    dataSent: "Records stay within infrastructure the Commander controls.",
    retentionAssumption: "Entirely the Commander's policy, including backup frequency, offsite copies, and tested restores.",
    commercialRights: "Engine licence terms apply; most common engines are permissive, but verify rather than assume.",
    costClass: "unknown_until_commander_review",
    recoveryExitPath: "The Commander owns backup and restore end to end. An untested restore is not a recovery path.",
    deploymentImplication: "Adds patching, monitoring, capacity, and availability responsibilities to the Commander.",
    qualificationState: "commander_qualification_required",
    confidentiality: "public_default",
  },

  // --- Deployment target ---------------------------------------------------
  {
    id: "deployment_target.none_selected",
    capabilityClass: "deployment_target",
    name: "No deployment target selected — Commander decision required",
    summary: "The shipped public default. The application can be built and run locally without choosing a host.",
    compatibleWith: "Every store class in evaluation mode.",
    authorityImpact: "None.",
    dataSent: "Nothing.",
    retentionAssumption: "Not applicable.",
    commercialRights: "Not applicable.",
    costClass: "no_additional_spend",
    recoveryExitPath: "Already the neutral state.",
    deploymentImplication: "None.",
    qualificationState: "not_evaluated_no_provider_activated",
    confidentiality: "public_default",
  },
  {
    id: "deployment_target.local_only_class",
    capabilityClass: "deployment_target",
    name: "Local machine only (class)",
    summary: "Build and run on the Commander's own machine. The most private option and the least available one.",
    compatibleWith: "Local candidate and self-operated store classes.",
    authorityImpact: "None. Local operation grants no authority and performs no lifecycle transition.",
    dataSent: "Nothing leaves the machine.",
    retentionAssumption: "Local disk only.",
    commercialRights: "Not applicable.",
    costClass: "no_additional_spend",
    recoveryExitPath: "Stop the process.",
    deploymentImplication: "No domain, certificate, or hosting account; also no access from another device.",
    qualificationState: "commander_qualification_required",
    confidentiality: "public_default",
  },
  {
    id: "deployment_target.managed_platform_class",
    capabilityClass: "deployment_target",
    name: "Managed application platform (class)",
    summary: "A managed host that builds from a repository and runs the server boundary. Named as a class; the platform remains the Commander's decision.",
    compatibleWith: "Managed relational and self-operated store classes.",
    authorityImpact: "None by itself. Deploying authorizes no operational-authority transition, and each Production deployment still requires its own recorded Commander authorization.",
    dataSent: "Source is built by the platform; runtime traffic and logs pass through it.",
    retentionAssumption: "Platform log and build retention applies and is rarely zero. Assume request metadata is retained unless the platform states otherwise.",
    commercialRights: "Check plan terms for commercial use, and confirm whether the free tier permits the deployment's actual purpose.",
    costClass: "unknown_until_commander_review",
    recoveryExitPath: "Keep the previous deployment inspectable and redeployable; rollback is the mitigation when there is no preview gate.",
    deploymentImplication: "Environment variables take effect only on a new deployment, so every configuration change needs a redeploy and a re-check.",
    qualificationState: "commander_qualification_required",
    confidentiality: "public_default",
  },
  {
    id: "deployment_target.self_operated_host_class",
    capabilityClass: "deployment_target",
    name: "Self-operated host (class)",
    summary: "Infrastructure the Commander runs, with the corresponding control and corresponding work.",
    compatibleWith: "Any store class the Commander can reach from it.",
    authorityImpact: "None by itself.",
    dataSent: "Only what the Commander's own infrastructure handles.",
    retentionAssumption: "The Commander's own log and backup policy.",
    commercialRights: "Not applicable beyond the components chosen.",
    costClass: "unknown_until_commander_review",
    recoveryExitPath: "The Commander owns rollback, and it must be rehearsed rather than assumed.",
    deploymentImplication: "Adds certificates, patching, uptime, and network exposure to the Commander's responsibilities.",
    qualificationState: "commander_qualification_required",
    confidentiality: "public_default",
  },

  // --- Optional services ---------------------------------------------------
  {
    id: "optional_service.none",
    capabilityClass: "optional_service",
    name: "No optional services",
    summary: "The shipped public default. Nothing optional is enabled, so nothing optional needs justifying.",
    compatibleWith: "Everything.",
    authorityImpact: "None.",
    dataSent: "Nothing.",
    retentionAssumption: "Not applicable.",
    commercialRights: "Not applicable.",
    costClass: "no_additional_spend",
    recoveryExitPath: "Already the neutral state.",
    deploymentImplication: "None.",
    qualificationState: "not_evaluated_no_provider_activated",
    confidentiality: "public_default",
  },
  {
    id: "optional_service.usage_analytics_class",
    capabilityClass: "optional_service",
    name: "Usage analytics (class)",
    summary: "Behavioural or usage measurement. Disclosed because it is the option most often enabled without a decision.",
    compatibleWith: "Any deployment target.",
    authorityImpact: "None, provided no measure is ever read back as operational state or as evidence.",
    dataSent: "Interaction events, and — unless deliberately suppressed — page context that may carry record titles or identifiers.",
    retentionAssumption: "Vendor-defined retention windows apply and are frequently long. Record the actual window before enabling.",
    commercialRights: "Some vendors assert broad rights over collected data; read the terms before sending anything derived from operational records.",
    costClass: "unknown_until_commander_review",
    recoveryExitPath: "Remove the integration and request deletion; already-transmitted data may persist for the vendor's retention window.",
    deploymentImplication: "Adds a third-party script or endpoint and a privacy-disclosure obligation to the deployment.",
    qualificationState: "commander_qualification_required",
    confidentiality: "public_default",
  },
  {
    id: "optional_service.error_reporting_class",
    capabilityClass: "optional_service",
    name: "Error and diagnostic reporting (class)",
    summary: "Automatic capture of failures. Genuinely useful, and a common accidental route for sensitive values to leave a deployment.",
    compatibleWith: "Any deployment target.",
    authorityImpact: "None directly, but a leaked diagnostic payload can expose record content that authority assumes stays inside the boundary.",
    dataSent: "Stack traces, request context, and whatever the surrounding scope happened to hold at failure time.",
    retentionAssumption: "Vendor-defined. Assume payloads are retained and searchable by anyone with vendor account access.",
    commercialRights: "Ordinary vendor terms apply; the material risk is disclosure, not licensing.",
    costClass: "unknown_until_commander_review",
    recoveryExitPath: "Disable capture and purge stored events; scrubbing rules must be verified rather than trusted.",
    deploymentImplication: "Requires an explicit redaction posture so credentials, tokens, and record bodies never reach the vendor.",
    qualificationState: "commander_qualification_required",
    confidentiality: "public_default",
  },
  {
    id: "optional_service.sanitized_example_pack",
    capabilityClass: "optional_service",
    name: "Sanitized example configuration pack",
    summary: "A synthetic, non-operational illustration of a completed configuration, used for documentation and screenshots. It contains no real account, record, endpoint, device, or provider evidence.",
    compatibleWith: "Documentation and evaluation only; never a deployment input.",
    authorityImpact: "None. It is illustrative data and is never loaded as state.",
    dataSent: "Nothing.",
    retentionAssumption: "Not applicable.",
    commercialRights: "Authored for this candidate; no third-party media is included.",
    costClass: "no_additional_spend",
    recoveryExitPath: "Delete the example; nothing depends on it.",
    deploymentImplication: "None. Never copy an example value into a live deployment without deciding it independently.",
    qualificationState: "not_evaluated_no_provider_activated",
    confidentiality: "sanitized_example",
  },

  // --- DJ SARGE (declared, unavailable) ------------------------------------
  {
    id: "dj_sarge_cloned_voice.not_available",
    capabilityClass: "dj_sarge_cloned_voice",
    name: "Not available in this candidate",
    summary: "Declared so that it is visibly separate from regular SARGE voice and visibly unavailable. There is nothing to select.",
    compatibleWith: "Nothing in this candidate; it is not wired to any option above.",
    authorityImpact: "None, because no path exists. A future path would require separate Commander authorization before any configuration surface is built.",
    dataSent: "Nothing.",
    retentionAssumption: "Not applicable while unavailable. A future path must state consent, provenance, and retention before it is built.",
    commercialRights: "A cloned or likeness-derived voice raises consent, personality, and licensing questions that must be resolved and recorded first.",
    costClass: "unknown_until_commander_review",
    recoveryExitPath: "Not applicable; nothing can be enabled.",
    deploymentImplication: "None.",
    qualificationState: "not_available_in_this_candidate",
    confidentiality: "public_default",
  },
];

/**
 * Values that are deliberately excluded from CASTRA Core and from the public
 * candidate. Slots are metadata only — no value, no example, no shape that
 * could be mistaken for one.
 */
export const WITHHELD_SLOTS: readonly WithheldSlot[] = [
  {
    key: "private.commander.runtime_selection",
    capabilityClass: "agent_runtime",
    classification: "private_commander_selection",
    describesWhat: "Which runtime class a particular Commander chose for each role, and any model or effort binding they recorded.",
    livesWhere: "That Commander's private Deployment Pack.",
    valueRendered: false,
  },
  {
    key: "private.commander.regular_voice_selection",
    capabilityClass: "regular_sarge_voice",
    classification: "private_commander_selection",
    describesWhat: "Which regular SARGE voice a particular Commander chose, and at what speaking rate. The authoring deployment's answer is a private default, not a public default, and is not shipped as one.",
    livesWhere: "That Commander's private Deployment Pack.",
    valueRendered: false,
  },
  {
    key: "private.commander.store_binding",
    capabilityClass: "operational_store",
    classification: "private_commander_selection",
    describesWhat: "The chosen store provider, project binding, region, and operational endpoints for a particular deployment.",
    livesWhere: "That Commander's private Deployment Pack and their provider account.",
    valueRendered: false,
  },
  {
    key: "private.commander.deployment_binding",
    capabilityClass: "deployment_target",
    classification: "private_commander_selection",
    describesWhat: "The chosen host, account, project, domain, and environment configuration for a particular deployment.",
    livesWhere: "That Commander's private Deployment Pack and their provider account.",
    valueRendered: false,
  },
  {
    key: "secret.session_signing_material",
    capabilityClass: "deployment_target",
    classification: "secret",
    describesWhat: "Server-side signing material for the deployment's own sessions.",
    livesWhere: "The deployment's environment or secret store only — never a repository file, a receipt, a chat, a screenshot, or this configuration surface.",
    valueRendered: false,
  },
  {
    key: "secret.store_access_material",
    capabilityClass: "operational_store",
    classification: "secret",
    describesWhat: "Credentials the server boundary uses to reach the operational store, and any agent read key or its registered digest.",
    livesWhere: "The deployment's environment or secret store only — never a repository file, a receipt, a chat, a screenshot, or this configuration surface.",
    valueRendered: false,
  },
  {
    key: "secret.optional_service_material",
    capabilityClass: "optional_service",
    classification: "secret",
    describesWhat: "Credentials for any optional service or hosted synthesis service the Commander enables.",
    livesWhere: "The deployment's environment or secret store only — never a repository file, a receipt, a chat, a screenshot, or this configuration surface.",
    valueRendered: false,
  },
];

export function capabilityClasses(): readonly CapabilityClass[] {
  return CLASSES;
}

export function capabilityClass(id: CapabilityClassId): CapabilityClass | null {
  return CLASSES.find((entry) => entry.id === id) ?? null;
}

export function optionsForClass(id: CapabilityClassId): readonly CapabilityOption[] {
  return OPTIONS.filter((option) => option.capabilityClass === id);
}

export function optionById(id: string): CapabilityOption | null {
  return OPTIONS.find((option) => option.id === id) ?? null;
}

export function allCapabilityOptions(): readonly CapabilityOption[] {
  return OPTIONS;
}

export function publicDefaultOption(id: CapabilityClassId): CapabilityOption | null {
  const definition = capabilityClass(id);
  return definition ? optionById(definition.publicDefaultOptionId) : null;
}

export function withheldSlotsForClass(id: CapabilityClassId): readonly WithheldSlot[] {
  return WITHHELD_SLOTS.filter((slot) => slot.capabilityClass === id);
}

/** Disclosure completeness. A missing or blank required field is a defect. */
export function missingDisclosureFields(option: Partial<CapabilityOption>): RequiredDisclosureField[] {
  return REQUIRED_DISCLOSURE_FIELDS.filter((field) => {
    const value = option[field];
    return typeof value !== "string" || value.trim().length === 0;
  });
}

export function isFullyDisclosed(option: Partial<CapabilityOption>): boolean {
  return missingDisclosureFields(option).length === 0;
}

// ---------------------------------------------------------------------------
// Fail-closed public serialization
// ---------------------------------------------------------------------------

export const MAX_PUBLIC_VALUE_LENGTH = 2000;

/** Keys under these prefixes are never publishable, whatever they claim to be. */
export const RESERVED_NON_PUBLIC_KEY_PREFIXES: readonly string[] = ["private.", "secret.", "credential.", "internal."];

export type WithholdReasonCode =
  | "secret_class_withheld"
  | "private_class_withheld"
  | "unknown_classification_withheld"
  | "reserved_key_prefix_withheld"
  | "secret_shape_detected"
  | "private_shape_detected"
  | "limit_exceeded_withheld"
  | "invalid_value_withheld";

export interface ClassifiedValue {
  key: string;
  value: string;
  /** Deliberately widened: an unrecognized or absent claim must fail closed. */
  declaredClassification: string;
}

export type PublicClassificationResult =
  | { key: string; publishable: true; classification: PublicClassification }
  | { key: string; publishable: false; reasonCode: WithholdReasonCode };

export interface PublicSerializationResult {
  modelVersion: string;
  lifecycle: string;
  failClosed: true;
  records: Array<{ key: string; classification: PublicClassification; value: string }>;
  withheld: Array<{ key: string; reasonCode: WithholdReasonCode }>;
}

/**
 * Benign, defensive shape detection. These patterns exist to refuse
 * publication, never to test, probe, or exercise a credential. Matching is
 * intentionally conservative: a false refusal is safe, a false publication is
 * not.
 */
const SECRET_SHAPE_PATTERNS: readonly RegExp[] = [
  // The PEM header and vendor-prefix patterns are written structurally rather
  // than as contiguous literals. A naive literal secret scan over the built
  // bundle would otherwise match this detector's own source and report a
  // finding that is not a secret. The patterns match the same real material.
  /-{5}\s?BEGIN[\sA-Z]{0,40}KEY-{5}/,
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\b(?:sb|sk|pk|rk|ak)_[A-Za-z0-9_-]{12,}/i,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}/i,
  /\bsha256:[A-Fa-f0-9]{64}\b/,
  /\b[A-Fa-f0-9]{64}\b/,
  /\b[A-Za-z0-9+/]{64,}={0,2}\b/,
  /\b(?:api[_-]?key|secret|token|password|passphrase|private[_-]?key)\s*[:=]\s*["']?(?=[^\s"']*\d)[A-Za-z0-9_\-.+/]{12,}/i,
];

const PRIVATE_SHAPE_PATTERNS: readonly RegExp[] = [
  /(?:^|[\s"'(])[A-Za-z]:[\\/]/,
  /\/(?:Users|home|root)\/[A-Za-z0-9._-]+/,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /\b(?:act|mis|cmp|war|usr|org|prj)_[A-Za-z0-9-]{6,}/i,
  /\bC\d{3}\.M\d{3}(?:\.A\d{3})?\b/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  /\b[a-z0-9-]{6,}\.(?:supabase\.(?:co|in)|vercel\.app)\b/i,
  /\b(?:device|machine|hardware|serial|imei|mac)[-_ ]?(?:id|number|address)\s*[:=]/i,
];

export function looksLikeSecretMaterial(value: string): boolean {
  return SECRET_SHAPE_PATTERNS.some((pattern) => pattern.test(value));
}

export function looksLikePrivateMaterial(value: string): boolean {
  return PRIVATE_SHAPE_PATTERNS.some((pattern) => pattern.test(value));
}

function hasReservedKeyPrefix(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return RESERVED_NON_PUBLIC_KEY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

const TAB_CODE = 9;
const LINE_FEED_CODE = 10;
const CARRIAGE_RETURN_CODE = 13;
const FIRST_PRINTABLE_CODE = 32;
const DELETE_CODE = 127;

/** True for any C0 control character other than tab/newline/carriage return, or DEL. */
export function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === DELETE_CODE) return true;
    if (code < FIRST_PRINTABLE_CODE && code !== TAB_CODE && code !== LINE_FEED_CODE && code !== CARRIAGE_RETURN_CODE) {
      return true;
    }
  }
  return false;
}

/**
 * Decides whether one named value may appear in public output. The value itself
 * is never returned on a refusal, so a refusal record can be logged, rendered,
 * or serialized without re-disclosing what it withheld.
 */
export function classifyForPublicSerialization(entry: ClassifiedValue): PublicClassificationResult {
  const key = typeof entry?.key === "string" && entry.key.trim().length > 0 ? entry.key.trim() : "<unnamed>";
  if (hasReservedKeyPrefix(key)) return { key, publishable: false, reasonCode: "reserved_key_prefix_withheld" };

  const declared = entry?.declaredClassification;
  if (declared === "secret") return { key, publishable: false, reasonCode: "secret_class_withheld" };
  if (declared === "private_commander_selection") return { key, publishable: false, reasonCode: "private_class_withheld" };
  if (declared !== "public_default" && declared !== "sanitized_example") {
    return { key, publishable: false, reasonCode: "unknown_classification_withheld" };
  }

  const value = entry?.value;
  if (typeof value !== "string" || value.length === 0 || hasControlCharacters(value)) {
    return { key, publishable: false, reasonCode: "invalid_value_withheld" };
  }
  if (value.length > MAX_PUBLIC_VALUE_LENGTH) {
    return { key, publishable: false, reasonCode: "limit_exceeded_withheld" };
  }
  if (looksLikeSecretMaterial(value)) return { key, publishable: false, reasonCode: "secret_shape_detected" };
  if (looksLikePrivateMaterial(value)) return { key, publishable: false, reasonCode: "private_shape_detected" };

  return { key, publishable: true, classification: declared };
}

/**
 * Projects a set of named values into public output. Anything that is not
 * provably publishable is withheld with a reason code and without its value.
 */
export function serializePublicConfiguration(entries: readonly ClassifiedValue[]): PublicSerializationResult {
  const records: PublicSerializationResult["records"] = [];
  const withheld: PublicSerializationResult["withheld"] = [];
  for (const entry of entries) {
    const decision = classifyForPublicSerialization(entry);
    if (decision.publishable) {
      records.push({ key: decision.key, classification: decision.classification, value: entry.value });
    } else {
      withheld.push({ key: decision.key, reasonCode: decision.reasonCode });
    }
  }
  return {
    modelVersion: AGENT_CONFIGURATION_MODEL_VERSION,
    lifecycle: AGENT_CONFIGURATION_LIFECYCLE,
    failClosed: true,
    records,
    withheld,
  };
}

/** Flattens the public catalog into named values eligible for public output. */
export function publicCatalogEntries(): ClassifiedValue[] {
  const entries: ClassifiedValue[] = [];
  for (const option of OPTIONS) {
    for (const field of REQUIRED_DISCLOSURE_FIELDS) {
      entries.push({
        key: `${option.id}.${field}`,
        value: option[field],
        declaredClassification: option.confidentiality,
      });
    }
  }
  return entries;
}

/**
 * Flattens the withheld slots into named values. Each carries only its
 * description, so even a defective serializer could not leak a selection —
 * there is no selection here to leak.
 */
export function withheldSlotEntries(): ClassifiedValue[] {
  return WITHHELD_SLOTS.map((slot) => ({
    key: slot.key,
    value: slot.describesWhat,
    declaredClassification: slot.classification,
  }));
}

/** The full projection a public artifact would be built from. */
export function publicProjection(): PublicSerializationResult {
  return serializePublicConfiguration([...publicCatalogEntries(), ...withheldSlotEntries()]);
}

export interface CatalogIssue {
  optionId: string;
  code: "missing_disclosure_field" | "non_public_catalog_value" | "unknown_capability_class" | "missing_public_default";
  detail: string;
}

/**
 * Self-check for the shipped catalog: every option fully disclosed, every
 * option publishable, every class resolvable with a real public default.
 */
export function catalogIssues(): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  for (const option of OPTIONS) {
    for (const field of missingDisclosureFields(option)) {
      issues.push({ optionId: option.id, code: "missing_disclosure_field", detail: field });
    }
    if (capabilityClass(option.capabilityClass) === null) {
      issues.push({ optionId: option.id, code: "unknown_capability_class", detail: option.capabilityClass });
    }
    for (const field of REQUIRED_DISCLOSURE_FIELDS) {
      const decision = classifyForPublicSerialization({
        key: `${option.id}.${field}`,
        value: option[field],
        declaredClassification: option.confidentiality,
      });
      if (!decision.publishable) {
        issues.push({ optionId: option.id, code: "non_public_catalog_value", detail: `${field}:${decision.reasonCode}` });
      }
    }
  }
  for (const definition of CLASSES) {
    const fallback = optionById(definition.publicDefaultOptionId);
    if (fallback === null || fallback.capabilityClass !== definition.id) {
      issues.push({ optionId: definition.publicDefaultOptionId, code: "missing_public_default", detail: definition.id });
    }
  }
  return issues;
}
