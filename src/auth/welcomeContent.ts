export const WELCOME_HEADLINE = "Command with evidence, not guesswork.";

export function nextExpandedLifecycleStage(current: string | null, requested: string): string | null {
  return current === requested ? null : requested;
}

export const COST_TRANSPARENCY_STATEMENT =
  "CASTRA itself does not require an access fee. Costs, if any, arise from optional hosting, connections/connectors, tools, subscriptions, LLMs, or Product Owner-approved API exceptions selected by the Commander for that CASTRA configuration.";

export interface WelcomeLifecycleStage {
  id: string;
  label: string;
  purpose: string;
  governance: string;
  evidence: string;
  gate: string;
}

export const BUILD_LIFECYCLE_STAGES: readonly WelcomeLifecycleStage[] = [
  {
    id: "commanders-intent",
    label: "Commander’s Intent",
    purpose: "Define the problem, desired end state, value, boundaries, and conditions for success before solution work begins.",
    governance: "The Commander owns the intent. Bounded drafting assistance may propose wording, but it cannot approve scope or create authority.",
    evidence: "Record the approved intent, stated needs, known constraints, sources, assumptions, and unresolved questions.",
    gate: "Proceed when the Commander confirms that the end state and protected boundaries are clear enough for discovery.",
  },
  {
    id: "recon-discovery",
    label: "RECON / Discovery",
    purpose: "Examine overlapping work, missing intent, users, product sources, feasibility, constraints, and material unknowns.",
    governance: "RECON is bounded and Commander-directed. Findings inform decisions; they do not transition, approve, or rewrite authoritative work.",
    evidence: "Retain source-attributed findings, alternatives, gaps, risks, and an explicit unavailable state where evidence cannot be obtained.",
    gate: "Proceed when material unknowns are resolved, accepted as visible risks, or assigned to governed follow-up work.",
  },
  {
    id: "specification",
    label: "Specification",
    purpose: "Translate intent and discovery into versioned requirements, acceptance criteria, evidence needs, deployment eligibility, and review plans.",
    governance: "The Commander approves the build baseline. Material covered changes invalidate applicable approval while preserving prior evidence.",
    evidence: "Retain the exact approved requirements, references, review findings, decisions, revisions, and invalidation history.",
    gate: "Build begins only from a discoverable, testable specification with the required Commander disposition.",
  },
  {
    id: "build",
    label: "Build",
    purpose: "Create the approved product slice through scoped Campaign, Mission, and Action work without widening authority.",
    governance: "FORGE and other roles execute inside assigned scope. Models and connectors may only return reviewable proposals; authoritative changes remain human commands.",
    evidence: "Retain direct record changes, source/build references, audit history, known gaps, and reproducible configuration provenance.",
    gate: "The build advances when the specified slice is complete enough for proportionate, evidence-producing verification.",
  },
  {
    id: "verification-testing",
    label: "Verification Testing",
    purpose: "Produce evidence that the built product conforms to its approved requirements and release criteria.",
    governance: "FIREWATCH assurance is proportionate and evidence-based. No role may fabricate results, erase failed evidence, or self-authorize release.",
    evidence: "Retain plans, cases, immutable results, executor/time, evidence or unavailable reason, Punch Items, verification, and exit-gate rollups.",
    gate: "Required tests and critical findings must satisfy deterministic exit rules before the Commander can accept or deploy the product.",
  },
  {
    id: "commander-acceptance-deployment",
    label: "Commander Acceptance / Deployment",
    purpose: "Make the final human decision on acceptance and, when intended and eligible, authorize a separately evidenced deployment action.",
    governance: "The Commander retains final acceptance and release authority. Deployment eligibility, preview evidence, fresh confirmation, and provider boundaries remain binding.",
    evidence: "Retain the exact decision, approval scope, release criteria, verified preview/production receipts, exceptions, and unresolved limitations.",
    gate: "No external release is represented without current eligibility, required evidence, and an explicit Commander decision bound to the approved revision.",
  },
] as const;

export const OPERATIONS_DIRECTION_STAGES: readonly WelcomeLifecycleStage[] = [
  {
    id: "transition-baseops",
    label: "Transition to BASEOPS",
    purpose: "Move an accepted Deployed Product into its distinct operational lifecycle with ownership, service intent, boundaries, and handoff evidence.",
    governance: "Transition does not erase the Campaign history. BASEOPS authority and operating conditions are explicitly assigned and reviewable.",
    evidence: "Retain the deployed baseline, handoff checklist, operating references, ownership, known limitations, and readiness decision.",
    gate: "Operations begin only when the Commander accepts the handoff and the governing operational record is complete enough to use safely.",
  },
  {
    id: "operational-validation",
    label: "Operational Validation",
    purpose: "Produce evidence from realistic or deployed use that the product achieves the intended purpose for the Commander and users.",
    governance: "Operational success is not inferred from build completion or verification alone. Realistic-use evidence and user outcomes remain distinct and traceable.",
    evidence: "Retain scenarios, users or roles, observed outcomes, limitations, feedback, gaps, and source-attributed validation evidence.",
    gate: "The Commander accepts operational fitness, constrains use, or directs remediation based on evidenced intended-use outcomes.",
  },
  {
    id: "garrison-sustainment",
    label: "Garrison sustainment",
    purpose: "Keep the product dependable through routine care, incident follow-up, evidence maintenance, recovery readiness, and controlled configuration.",
    governance: "Sustainment work remains scoped, auditable, and subject to the same protected authority boundaries as build work.",
    evidence: "Retain operating notes, incidents, changes, tests, receipts, current risks, service observations, and explicit unavailable measurements.",
    gate: "Continue operation while the evidence supports the approved service boundary; escalate material risk or change into governed work.",
  },
  {
    id: "fortification-improvements",
    label: "Fortification improvements",
    purpose: "Strengthen resilience, safety, maintainability, usability, or capability in response to operational evidence and approved intent.",
    governance: "Material improvements return through specification, build, verification, and acceptance rather than bypassing release controls.",
    evidence: "Link each improvement to observed need, approved scope, implementation evidence, tests, Punch Items, and the resulting operational baseline.",
    gate: "Activate an improvement only after its classification, authority, verification, and acceptance requirements are satisfied.",
  },
  {
    id: "lifecycle-stewardship",
    label: "Stewardship",
    purpose: "Make ongoing cost, effort, availability, and performance tradeoffs visible across the useful life of the product.",
    governance: "AERARIUM keeps observed runtime, provider actual, subscription allocation, estimates, and unavailable values separate; no telemetry is invented.",
    evidence: "Retain versioned configuration inputs, provenance, confidence and availability labels, operational outcomes, and reproducible calculations.",
    gate: "The Commander adjusts, sustains, retires, or replaces the product using transparent evidence rather than blended or assumed cost claims.",
  },
] as const;

export interface GovernancePrinciple {
  id: string;
  title: string;
  description: string;
}

export const GOVERNANCE_PRINCIPLES: readonly GovernancePrinciple[] = [
  { id: "intent", title: "Clear intent and end state", description: "Work starts with the Commander’s purpose, desired outcome, constraints, and definition of success." },
  { id: "trust", title: "Competence, trust, and shared understanding", description: "People and governed roles work from common facts, visible authority, and demonstrated capability." },
  { id: "delegation", title: "Delegated execution", description: "Execution can be delegated inside protected authority and evidence gates; approval, release, and foundational authority remain protected." },
  { id: "initiative", title: "Disciplined initiative and prudent risk", description: "Teams may act within the approved intent while risks, assumptions, limits, and exceptions stay explicit and reviewable." },
  { id: "tasking", title: "Mission-style tasking", description: "Tasking states purpose, outcome, boundaries, and evidence instead of prescribing every implementation move." },
  { id: "peers", title: "Peer assistance and cross-checking", description: "CASTRA treats peer-to-peer assistance as a product operating principle for shared problem-solving and challenge; it is not claimed as military doctrine." },
  { id: "verification", title: "Independent verification before release", description: "Evidence must show conformance to approved requirements and release criteria before Commander acceptance." },
  { id: "validation", title: "Operational validation after deployment", description: "Realistic or deployed use must show whether the product achieves its intended purpose for the Commander and users." },
] as const;

export const MISSION_COMMAND_BOUNDARY =
  "CASTRA is a software operating model inspired by selected Mission Command and decentralized-execution principles. It has no military affiliation, endorsement, certification, or authority.";

export const CAMPAIGN_ARTWORK = {
  src: "/assets/roman-army-marching-campaign-fantuzzi-1920.jpg",
  alt: "Sixteenth-century engraving of a Roman force marching out on campaign in a long procession.",
  title: "The March of the Roman Army",
  credit: "Antonio Fantuzzi after Giulio Romano",
  sourceLabel: "Bibliothèque nationale de France via Wikimedia Commons",
  license: "Public domain",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:%28La_marche_de_l%27arm%C3%A9e_romaine%29_%3B_%283%29._%28Marche_de_frondeurs%29_-_estampe_-_A.F._%28Antonio_Fantuzzi%29_%28monogramme%29_%3B_%28d%27apr%C3%A8s_Jules_Romain%29_-_btv1b532341208_%281_of_2%29.jpg",
} as const;
