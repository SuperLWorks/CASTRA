import { emptyState } from "../domain/commands";
import { deploymentEligibilityTemplate } from "../domain/deploymentEligibility";
import { refreshOpenWorkProjection } from "../domain/openWork";
import type {
  Action,
  Campaign,
  CastraState,
  Mission,
  RecordStatus,
  UIReviewItem,
} from "../domain/types";

export const C001_SOURCE_BUNDLE_REVISION = "C001.source-bundle.2026-08-11.r2" as const;
export const C001_UI05_SOURCE_BUNDLE_REVISION = "C001.source-bundle.2026-08-11.r1" as const;
export const C001_SOURCE_RETRIEVED_AT = "2026-08-11T12:00:00.000Z" as const;
export const C001_CAMPAIGN_ID = "campaign_c001" as const;

const CAMPAIGN_SOURCE = "DATA-SCOPE.md#historical-source-reference-not-published";
const ACTION_DATA_SOURCE = "DATA-SCOPE.md#historical-source-reference-not-published";
const M010_PLAN_SOURCE = "DATA-SCOPE.md#historical-source-reference-not-published";
const A003_SOURCE = "DATA-SCOPE.md#historical-source-reference-not-published";
const A009_SOURCE = "DATA-SCOPE.md#historical-source-reference-not-published";
const A009_DISPOSITION_SOURCE = "DATA-SCOPE.md#historical-source-reference-not-published";

export interface C001SourceManifestEntry {
  id: string;
  label: string;
  reference: string;
  retrievedAt: string;
  mapping: string;
  availability: "available" | "available_with_limit" | "redacted" | "unavailable";
  limitation: string;
}

export const C001_SOURCE_MANIFEST: readonly C001SourceManifestEntry[] = [
  {
    id: "source_c001_campaign",
    label: "C001 Campaign record",
    reference: CAMPAIGN_SOURCE,
    retrievedAt: C001_SOURCE_RETRIEVED_AT,
    mapping: "Campaign intent, status, approval, evidence state, constraints, and deferred authentication boundary.",
    availability: "available",
    limitation: "Historical demonstration records only, not live state. Source page links are withheld from this preview; see DATA-SCOPE.md.",
  },
  {
    id: "source_c001_missions",
    label: "C001 Mission records",
    reference: "Notion Castra Missions data source · C001 relation query",
    retrievedAt: C001_SOURCE_RETRIEVED_AT,
    mapping: "Twelve source Mission codes plus the additive C001.M000 Specification Gate compatibility projection, titles, statuses, phase summaries, and governing relationships.",
    availability: "available_with_limit",
    limitation: "The free Notion query limit was reached after retrieval. Mission source codes remain exact; some individual page URLs are unavailable in the bundle.",
  },
  {
    id: "source_c001_actions",
    label: "C001 Action records",
    reference: ACTION_DATA_SOURCE,
    retrievedAt: C001_SOURCE_RETRIEVED_AT,
    mapping: "Action codes, titles, statuses, assigned canonical roles, objectives, evidence requirements, and notes.",
    availability: "available_with_limit",
    limitation: "Action source codes remain exact. Private identity and opaque provider values are excluded; page-specific URLs are retained only where already verified.",
  },
  {
    id: "source_c001_ui_review",
    label: "M010 UI review plan and A003 disposition",
    reference: `${M010_PLAN_SOURCE} · ${A003_SOURCE}`,
    retrievedAt: C001_SOURCE_RETRIEVED_AT,
    mapping: "Exact UI-03 and UI-05 fixture bindings, immutable Rework required decisions, source-attributed review items, and non-duplicative remediation maps.",
    availability: "available",
    limitation: "No Commander approval is inferred for the later UI-05 packet.",
  },
  {
    id: "source_c001_repository",
    label: "Historical demo references; underlying evidence is not distributed",
    reference: "DATA-SCOPE.md#withheld-internal-reference and executable deterministic tests",
    retrievedAt: C001_SOURCE_RETRIEVED_AT,
    mapping: "Testing, AERARIUM separation, local-model limitations, deployment, remote-work, authentication deferral, and graph evidence.",
    availability: "available",
    limitation: "No provider telemetry, cost, effort duration, hosted sync, or live authentication result is inferred.",
  },
  {
    id: "source_c001_sensitive",
    label: "Sensitive identity/provider material",
    reference: "Excluded by policy",
    retrievedAt: C001_SOURCE_RETRIEVED_AT,
    mapping: "No mapping.",
    availability: "redacted",
    limitation: "Passwords, tokens, private email, provider secrets, opaque provider identifiers, and personal identifiers are not bundled.",
  },
] as const;

interface MissionSpec {
  code: string;
  title: string;
  status: RecordStatus;
  summary: string;
}

const MISSIONS: readonly MissionSpec[] = [
  { code: "C001.M000", title: "Specification Gate", status: "active", summary: "Additive compatibility projection for the governing Campaign specification and Commander's Intent. It preserves prior source records and does not claim historical Mission completion." },
  { code: "C001.M001", title: "Implementation design and feasibility", status: "completed", summary: "Approved architecture and offline-first feasibility direction." },
  { code: "C001.M002", title: "Foundation and authoritative data", status: "completed", summary: "Protected foundation, authoritative records, and evidence-preserving lifecycle design." },
  { code: "C001.M003", title: "Command workspace and direct operations", status: "completed", summary: "Direct deterministic workspace, navigation continuity, themes, and protected role presentation." },
  { code: "C001.M004", title: "Campaign workflow and bounded SARGE", status: "completed", summary: "Campaign specification, deterministic gates, and Commander-controlled assistance." },
  { code: "C001.M005", title: "Identity, connectors, and hand-offs", status: "completed", summary: "Identity feasibility and propose-then-confirm connector boundaries." },
  { code: "C001.M006", title: "Measurement and evidence graph", status: "completed", summary: "AERARIUM provenance separation and evidence-first read-only graph." },
  { code: "C001.M007", title: "Self-test and deployment", status: "active", summary: "Self-test and hosted shell evidence; recovery and later production gates remain separately governed." },
  { code: "C001.M008", title: "Closeout and BASEOPS handoff", status: "planned", summary: "Closeout template exists; Campaign closeout and BASEOPS activation have not occurred." },
  { code: "C001.M009", title: "Configurable model selection and local AI", status: "active", summary: "Governed local/model policy and remote-work feasibility with explicit unavailable and blocked boundaries." },
  { code: "C001.M010", title: "UI review and experience gates", status: "active", summary: "UI-03 and UI-05 reviews recorded Rework required; A010–A013 remediation and UI-06 review are the current path." },
  { code: "C001.M011", title: "Public Demo and template promotion", status: "planned", summary: "Public Demo and promotion Mission remains not started in Notion; this build supplies only the currently authorized memory-only review base." },
  { code: "C001.M012", title: "Welcome and authentication", status: "active", summary: "Welcome approved; live authentication is deferred to a separately authorized Production test." },
] as const;

interface ActionSpec {
  code: string;
  title: string;
  status: "done" | "in_progress" | "not_started";
  role: string;
  objective: string;
  source?: string;
}

const ACTIONS: readonly ActionSpec[] = [
  { code: "C001.M000.A001", title: "Commander's Intent", status: "in_progress", role: "COMMANDER_PRODUCT_OWNER", objective: "Define the governing purpose, desired end state, boundaries, and evidence expectations used to shape Specification and Missions.", source: CAMPAIGN_SOURCE },
  { code: "C001.M001.A001", title: "Produce technical design and feasibility decision packet", status: "done", role: "SARGE", objective: "Create an implementation-ready technical design and bounded hosted/local feasibility comparison." },
  { code: "C001.M001.A002", title: "Define Release 1 data, backup, identity, and offline acceptance tests", status: "done", role: "FIREWATCH", objective: "Translate recovery, identity, backup, and offline requirements into testable acceptance criteria." },
  { code: "C001.M002.A001", title: "Define local-first record, audit, export, and restore schemas", status: "done", role: "FORGE", objective: "Design authoritative records, evidence, archive/restore, export/import, and recovery." },
  { code: "C001.M002.A002", title: "Define CASTRA Foundation Manifest and compatibility validation", status: "done", role: "SARGE", objective: "Protect canonical authority while allowing governed presentation and derivative configuration." },
  { code: "C001.M002.A003", title: "Propose CASTRA organization and review gates", status: "done", role: "SARGE", objective: "Define roles and proportional market, assurance, and regulatory research gates." },
  { code: "C001.M003.A001", title: "Map POC navigation to Release 1 command workspace", status: "done", role: "SIGNAL", objective: "Preserve useful navigation continuity while supporting direct work and discoverable evidence." },
  { code: "C001.M003.A002", title: "Define configurable presentation system", status: "done", role: "SIGNAL", objective: "Define semantic themes and protected role display configuration." },
  { code: "C001.M003.A003", title: "Implement Commander theme and role-display configuration", status: "done", role: "SIGNAL", objective: "Implement three profiles, label modes, versioning, audit, and persistence." },
  { code: "C001.M004.A001", title: "Define base Campaign template and state transitions", status: "done", role: "SARGE", objective: "Translate Campaign workflow into deterministic fields, evidence, and transitions." },
  { code: "C001.M004.A002", title: "Define bounded SARGE Campaign-assistance contract", status: "done", role: "SARGE", objective: "Keep proposed Campaign assistance optional, bounded, and Commander-controlled." },
  { code: "C001.M004.A003", title: "Add deployment eligibility gate to Campaign Specification", status: "done", role: "SARGE", objective: "Block external release/deployment actions until the exact deployment disposition is resolved." },
  { code: "C001.M005.A001", title: "Validate authentication and Product Owner control approach", status: "done", role: "RECON", objective: "Evaluate a low-cost identity pattern and auditable protected-change authority." },
  { code: "C001.M005.A002", title: "Define propose-then-confirm connector contracts", status: "done", role: "RECON", objective: "Define narrow scope, consent, evidence, cancellation, and disable behavior." },
  { code: "C001.M006.A001", title: "Implement run-ledger and configurable estimation design", status: "done", role: "QUARTERMASTER", objective: "Separate observed runtime, actuals, allocations, estimates, and unavailable measures." },
  { code: "C001.M006.A002", title: "Define Graphify source model and gap-review workflow", status: "done", role: "SCRIBE", objective: "Define source-backed graph nodes, relationships, provenance, and deterministic gaps." },
  { code: "C001.M006.A003", title: "Implement AERARIUM local ledger and estimation workspace", status: "done", role: "QUARTERMASTER", objective: "Implement append-only runs, versioned assumptions, and provenance-safe rollups." },
  { code: "C001.M006.A004", title: "Implement evidence-first source bundle and graph view", status: "done", role: "SCRIBE", objective: "Implement read-only local graph projection and gaps without external write-back." },
  { code: "C001.M007.A001", title: "Produce CASTRA self-test plan and evidence package", status: "done", role: "FIREWATCH", objective: "Create the three-round self-test package and evidence requirements." },
  { code: "C001.M007.A002", title: "Prepare standalone deployment and recovery rehearsal plan", status: "done", role: "FORGE", objective: "Define packaging, update, export/restore, rollback, and hosting criteria." },
  { code: "C001.M007.A003", title: "Implement verified local-first vertical slice", status: "done", role: "FORGE", objective: "Implement direct Campaign, Mission, Action, persistence, and ordered audit." },
  { code: "C001.M007.A004", title: "Define test management and punch workflow", status: "done", role: "FIREWATCH", objective: "Implement deterministic testing, remediation linkage, verification, and exit gates." },
  { code: "C001.M007.A005", title: "Execute Release 1 Round 1 self-test", status: "done", role: "FIREWATCH", objective: "Verify the local slice and separate passed, deferred, and unavailable evidence." },
  { code: "C001.M007.A006", title: "Validate hosted feasibility and Super L Works access", status: "done", role: "SIGNAL", objective: "Validate the low/no-cost Vercel and branded-host pattern without claiming shared data." },
  { code: "C001.M007.A007", title: "Deploy CASTRA shell and connect branded hostname", status: "done", role: "SIGNAL", objective: "Establish the accepted static hosted shell while preserving deferred identity and sync." },
  { code: "C001.M007.A008", title: "Implement Manual-Assist Deployment Workbench", status: "done", role: "SIGNAL", objective: "Govern deployment requests and redacted receipts without provider credentials or calls." },
  { code: "C001.M007.A009", title: "Record Command Overview as the hosted default", status: "done", role: "SCRIBE", objective: "Preserve Command Overview as default and Graph as on-demand." },
  { code: "C001.M008.A001", title: "Draft Campaign closeout and BASEOPS handoff", status: "done", role: "SCRIBE", objective: "Prepare a future evidence-preserving closeout template without activating BASEOPS." },
  { code: "C001.M009.A001", title: "Define Model Selection Policy and Activity Contract", status: "done", role: "SARGE", objective: "Define versioned activity-first model policy, consent, fallback, cost, and provenance rules." },
  { code: "C001.M009.A002", title: "Implement Ollama local-model adapter", status: "done", role: "FORGE", objective: "Implement a governed loopback-only adapter with unavailable behavior and no remote fallback." },
  { code: "C001.M009.A003", title: "Install and validate local-model pilot", status: "done", role: "FORGE", objective: "Validate qwen3:0.6b diagnostically and stop qwen3:1.7b after a correlated driver-timeout event." },
  { code: "C001.M009.A004", title: "Verify local-model workflow and govern performance", status: "done", role: "FORGE", objective: "Record the unavailable browser path and qwen3:0.6b semantic-quality limitation." },
  { code: "C001.M009.A005", title: "Specify Local Bridge and remote Companion pattern", status: "done", role: "SIGNAL", objective: "Specify outbound-only paired remote draft work without exposing raw Ollama." },
  { code: "C001.M009.A006", title: "Assess remote identity, queue, and packaging feasibility", status: "done", role: "RECON", objective: "Compare low-cost authenticated control-plane and current-user Companion options." },
  { code: "C001.M009.A007", title: "Implement local control-plane and Companion feasibility slice", status: "done", role: "FORGE", objective: "Implement a zero-secret deterministic simulation with no real remote or model execution." },
  { code: "C001.M009.A008", title: "Implement hosted control-plane integration package", status: "done", role: "FORGE", objective: "Add disabled repository-side SQL, RLS, adapter, packaging, and negative-path evidence." },
  { code: "C001.M010.A001", title: "Implement reusable UI review foundation", status: "done", role: "FORGE", objective: "Create the seven-checkpoint Campaign review, evidence, decision, invalidation, and Punch contracts." },
  { code: "C001.M010.A002", title: "Build deterministic populated UI-03 prototype", status: "done", role: "FORGE", objective: "Create 45 isolated fixed review cases without modifying authoritative data." },
  { code: "C001.M010.A003", title: "Conduct Commander UI-03 populated-prototype review", status: "done", role: "COMMANDER_PRODUCT_OWNER", objective: "Record Rework required against the exact fixture revision and scope.", source: A003_SOURCE },
  { code: "C001.M010.A004", title: "Generalize UI review workflow for future Campaigns", status: "done", role: "FORGE", objective: "Make the approved review plan a configurable reusable Campaign pattern." },
  { code: "C001.M010.A005", title: "Reorganize post-login navigation and Campaign workspaces", status: "done", role: "FORGE", objective: "Implement Overview-first navigation and Campaign-scoped operational evidence." },
  { code: "C001.M010.A006", title: "Build Command Overview rollups and drill-downs", status: "done", role: "FORGE", objective: "Provide source-linked KPIs, queues, Campaign detail, and provenance-safe stewardship rollups." },
  { code: "C001.M010.A007", title: "Upgrade Commander Graph experience", status: "done", role: "SIGNAL", objective: "Embed the read-only graph on demand with navigable gaps and node details." },
  { code: "C001.M010.A008", title: "Consolidate Configuration and Meet the Team", status: "done", role: "FORGE", objective: "Unify configuration, model defaults, Campaign-aware team, and performance history." },
  { code: "C001.M010.A009", title: "Conduct integrated UI-05 review", status: "done", role: "COMMANDER_PRODUCT_OWNER", objective: "Record Rework required against the exact r1 integrated fixture and eight-entry review inventory.", source: A009_DISPOSITION_SOURCE },
  { code: "C001.M010.A010", title: "Compact global shell and Command Overview", status: "done", role: "FORGE", objective: "Implement compact banners, sticky headers, hierarchy navigation, compact KPI help, exact review drill-downs, and provenance-safe stewardship." },
  { code: "C001.M010.A011", title: "Rebuild Campaign lifecycle workspace", status: "done", role: "FORGE", objective: "Implement Campaign KPIs, Typical Campaign Flow, expandable Mission/Action hierarchy, C001.M000 compatibility, and evidence projections." },
  { code: "C001.M010.A012", title: "Complete Demo stewardship and Configuration rework", status: "done", role: "FORGE", objective: "Add isolated synthetic Demo stewardship and correct Configuration control layout without changing authoritative measures." },
  { code: "C001.M010.A013", title: "Verify and deploy current-source UI-06 candidate", status: "in_progress", role: "FIREWATCH", objective: "Verify the integrated candidate and record the current-source Production deployment receipt." },
  { code: "C001.M010.A014", title: "Conduct Commander UI-06 release-candidate review", status: "not_started", role: "COMMANDER_PRODUCT_OWNER", objective: "Review the exact deployed UI-06 candidate; no disposition is recorded by this build." },
  { code: "C001.M011.A001", title: "Implement Demo and template-promotion foundation", status: "not_started", role: "FORGE", objective: "Future governed template promotion; not implemented by this UI remediation." },
  { code: "C001.M011.A002", title: "Build memory-only public Demo runtime", status: "not_started", role: "FORGE", objective: "Future full Demo Mission; this build provides only the specifically authorized public-safe review base." },
  { code: "C001.M012.A001", title: "Implement Welcome and authentication foundation", status: "done", role: "FORGE", objective: "Implement deterministic Welcome, policy, authority, session, and provider-neutral contracts." },
  { code: "C001.M012.A002", title: "Build deterministic Welcome and authentication UI", status: "done", role: "FORGE", objective: "Build memory-only authentication UI states and route evidence." },
  { code: "C001.M012.A003", title: "Conduct Commander Welcome/authentication review", status: "done", role: "COMMANDER_PRODUCT_OWNER", objective: "Record Commander approval of the Welcome experience." },
  { code: "C001.M012.A004", title: "Implement server-side authentication boundary", status: "done", role: "FORGE", objective: "Implement provider-neutral server guards without a live provider claim." },
  { code: "C001.M012.A005", title: "Configure and test live Supabase authentication", status: "in_progress", role: "SIGNAL", objective: "Deferred to a separately authorized Production test; Production login remains disabled and unclaimed." },
  { code: "C001.M012.A006", title: "FIREWATCH authentication and Demo isolation verification", status: "not_started", role: "FIREWATCH", objective: "Blocked on the later Production authentication proof." },
  { code: "C001.M012.A007", title: "Record Commander authentication acceptance", status: "not_started", role: "COMMANDER_PRODUCT_OWNER", objective: "Blocked on FIREWATCH live authentication evidence." },
  { code: "C001.M012.A008", title: "Rework Welcome pre-authentication shell", status: "done", role: "FORGE", objective: "Remove post-login navigation from Welcome and provide the approved command treatment." },
  { code: "C001.M012.A009", title: "Add lifecycle principles, cost transparency, and artwork", status: "done", role: "FORGE", objective: "Complete the approved Welcome/About content and public-domain Campaign artwork." },
] as const;

function idFor(code: string): string {
  return code.toLowerCase().replaceAll(".", "_");
}

function actionStatus(value: ActionSpec["status"]): RecordStatus {
  return value === "done" ? "completed" : value === "in_progress" ? "in_progress" : "planned";
}

function sourceNotes(code: string, role: string, source?: string): string {
  return [
    `Assigned canonical role: ${role}.`,
    `Source: ${source ?? `${ACTION_DATA_SOURCE} · Action Code ${code}`}.`,
    `Snapshot revision: ${C001_SOURCE_BUNDLE_REVISION}.`,
    "Historical timestamps and numeric effort/cost are unavailable unless separately evidenced; no value is inferred.",
  ].join(" ");
}

function campaign(): Campaign {
  const deploymentEligibility = deploymentEligibilityTemplate();
  return {
    id: C001_CAMPAIGN_ID,
    type: "campaign",
    title: "C001 — Build CASTRA Release 1",
    description: "Build and verify the first standalone, browser-accessible, local-first CASTRA Release 1 while preserving deterministic authority, evidence, and Commander gates.",
    commanderIntent: "Deliver a low/no-cost deterministic agentic operating system in which direct records and audit remain authoritative, agents only propose, and the Commander retains approval and release authority.",
    notes: `Authoritative public-safe source snapshot from ${CAMPAIGN_SOURCE}. Live authentication remains deferred to a separately authorized Production test. Sensitive identity/provider fields are excluded.`,
    status: "active",
    revision: 1,
    approval: null,
    createdAt: C001_SOURCE_RETRIEVED_AT,
    updatedAt: C001_SOURCE_RETRIEVED_AT,
    archivedAt: null,
    deploymentEligibility: {
      ...deploymentEligibility,
      webDeploymentIntent: "intended",
      brandedSubdomainRequirement: "required",
      standardPattern: "applies",
      commercialUse: "commercial_branded",
      providerEligibility: "verified_eligible",
      proposedHostname: "castra.superlworks.com",
      dnsAuthorityState: "Hosted static shell and branded hostname previously verified; this bundle performs no provider or DNS action.",
      exportImportImplication: "Browser-origin IndexedDB remains local; export/import remains a separate controlled capability.",
      hostedPersistenceImplication: "No shared hosted persistence is claimed.",
      authenticationImplication: "Production login disabled/unclaimed; provider proof deferred to separately authorized Production testing.",
      synchronizationImplication: "No hosted synchronization is implemented.",
      migrationImplication: "No Craps migration or cutover is authorized.",
      providerChangeAssessment: "No provider, plan, cost, capability, terms, or policy change occurs in this bundle.",
      evidenceReference: CAMPAIGN_SOURCE,
      disposition: "eligible",
      dispositionExplanation: "Static hosted-shell pattern was previously verified; this does not accept live authentication or shared data.",
      disposedAt: C001_SOURCE_RETRIEVED_AT,
      disposedBy: "Commander",
    },
  };
}

function mission(spec: MissionSpec): Mission {
  const isSpecificationProjection = spec.code === "C001.M000";
  return {
    id: idFor(spec.code),
    type: "mission",
    campaignId: C001_CAMPAIGN_ID,
    title: `${spec.code} — ${spec.title}`,
    description: spec.summary,
    notes: isSpecificationProjection
      ? `Compatibility projection from the C001 Campaign specification and Commander intent at ${CAMPAIGN_SOURCE}. Stable projection ID C001.M000; prior Mission/Action source IDs remain unchanged. No historical completion date or approval is inferred. Snapshot ${C001_SOURCE_BUNDLE_REVISION}.`
      : `Source: Notion Castra Missions query · ${spec.code}. Snapshot ${C001_SOURCE_BUNDLE_REVISION}; page-specific timestamp unavailable in the public-safe bundle.`,
    status: spec.status,
    revision: 1,
    approval: null,
    createdAt: C001_SOURCE_RETRIEVED_AT,
    updatedAt: C001_SOURCE_RETRIEVED_AT,
    archivedAt: null,
  };
}

function action(spec: ActionSpec): Action {
  return {
    id: idFor(spec.code),
    type: "action",
    missionId: idFor(spec.code.split(".A")[0]),
    title: `${spec.code} — ${spec.title}`,
    description: spec.objective,
    notes: sourceNotes(spec.code, spec.role, spec.source),
    status: actionStatus(spec.status),
    revision: 1,
    approval: null,
    createdAt: C001_SOURCE_RETRIEVED_AT,
    updatedAt: C001_SOURCE_RETRIEVED_AT,
    archivedAt: null,
    actionKind: spec.code === "C001.M007.A007" ? "deployment" : "standard",
    operationalContext: {
      owner: spec.role,
      blocker: actionStatus(spec.status) === "blocked" ? "Source record is blocked; reason unavailable in the public-safe snapshot." : "",
      nextGate: spec.status === "done" ? "Closed in the source snapshot." : spec.objective,
      evidenceReference: spec.source ?? `${ACTION_DATA_SOURCE} · Action Code ${spec.code}`,
      attentionState: "normal",
    },
  };
}

function reviewItems(): UIReviewItem[] {
  const items = [
    ["03", "Authenticated shell / Command Overview", "Put Command Overview first and provide cross-Campaign rollups with Campaign drill-downs.", "C001.M010.A005 · C001.M010.A006"],
    ["04", "Primary navigation / Campaign workspace", "Order Command Overview, War Efforts, Campaigns, BASEOPS and move Testing, UI Reviews, and Audit into each Campaign.", "C001.M010.A005"],
    ["05", "Command Overview / Commander Graph", "Expose Commander Graph within Command Overview on demand.", "C001.M010.A005 · C001.M010.A007"],
    ["06", "Primary navigation / Configuration", "Place Configuration immediately above Agent Boundaries.", "C001.M010.A005"],
    ["07", "Command Overview / AERARIUM", "Move AERARIUM stewardship rollups into Command Overview.", "C001.M010.A005 · C001.M010.A006"],
    ["08", "Campaign / Meet the Team", "Provide Campaign team/model mix and cross-Campaign performance.", "C001.M010.A006 · C001.M010.A008"],
    ["09", "Commander Graph / gaps and relationships", "Navigate gaps to source records and show role/Campaign relationships and node details.", "C001.M010.A007"],
    ["10", "Configuration / presentation", "Use dropdown-led presentation controls with live preview.", "C001.M010.A008"],
    ["11", "Meet the Team / cards", "Show configured display names and performance; protect canonical mapping.", "C001.M010.A008"],
    ["12", "Command Overview / KPIs and queues", "Make KPI cards and Campaign list clickable and expose blockers and Commander reviews.", "C001.M010.A006"],
    ["13", "BASEOPS / stewardship", "Provide Garrison and Fortification KPIs and running action lists with themed terminology.", "C001.M010.A005"],
    ["14", "Command Overview / AERARIUM", "Show dollars and effort without blending actuals, allocations, or estimates.", "C001.M010.A006"],
    ["15", "Configuration / AERARIUM", "Consolidate AERARIUM configuration into main Configuration.", "C001.M010.A008"],
  ] as const;
  return items.map(([suffix, screenReference, comment, mapping]) => ({
    id: `ui_review_item_a003_ri_${suffix}`,
    checkpointId: "ui_review_checkpoint_c001_ui03",
    inventoryEntryId: "ui_review_inventory_c001_ui03",
    screenReference,
    componentReference: mapping,
    sourceAttribution: "Commander UI-03 review",
    sourceReference: A003_SOURCE,
    comment,
    severity: ["04", "13"].includes(suffix) ? "critical" : suffix === "06" || suffix === "15" ? "medium" : "high",
    createdAt: C001_SOURCE_RETRIEVED_AT,
    createdBy: "Commander",
  }));
}

function ui05ReviewItems(): UIReviewItem[] {
  const items = [
    ["01", "public-demo", "Public Demo banner", "Make the Demo banner substantially smaller while retaining an accessible transient/no-save warning.", "C001.M010.A010", "medium"],
    ["02", "overview", "Command Overview KPIs", "Add compact Cost and Effort cards and move explanations into hover/focus help.", "C001.M010.A010", "high"],
    ["03", "overview", "Command Overview header", "Pin the page header and Add New Campaign control while the page scrolls.", "C001.M010.A010", "high"],
    ["04", "overview", "Command Overview hierarchy", "Remove individual Mission boxes and retain Campaign cards with associated blockers and reviews.", "C001.M010.A010", "high"],
    ["05", "overview", "Commander review queue", "Route UI-03 and UI-05 to distinct exact evidence/actions and expose bounded SARGE support without implying connectivity.", "C001.M010.A010", "critical"],
    ["06", "overview", "Global hierarchy navigation", "Provide Command Overview and appropriate up/down hierarchy navigation on every page.", "C001.M010.A010", "critical"],
    ["07", "overview", "Cost & Effort Stewardship", "Move stewardship near the top and drill into provenance-safe AERARIUM graphics.", "C001.M010.A010", "high"],
    ["08", "war-efforts", "War Efforts Demo boundary", "Apply the compact Demo banner.", "C001.M010.A010", "medium"],
    ["09", "war-efforts", "War Efforts header", "Pin the War Efforts page header.", "C001.M010.A010", "medium"],
    ["10", "war-efforts", "War Efforts navigation", "Add top navigation back to Command Overview.", "C001.M010.A010", "high"],
    ["10a", "war-efforts", "War Efforts definition", "Render a concise single desktop line while preserving full accessible meaning at narrow widths.", "C001.M010.A010", "medium"],
    ["11", "campaign-workspace", "Campaigns header", "Pin the Campaigns page header.", "C001.M010.A010", "medium"],
    ["12", "campaign-workspace", "Campaigns navigation", "Add navigation back to Command Overview.", "C001.M010.A010", "high"],
    ["12a", "campaign-workspace", "Campaign header", "Pin the individual Campaign header.", "C001.M010.A011", "high"],
    ["13", "campaign-workspace", "Campaign hierarchy navigation", "Add Overview, All Campaigns, and previous/next navigation.", "C001.M010.A011", "high"],
    ["14", "campaign-workspace", "Campaign KPIs", "Add compact Campaign-scoped KPI categories.", "C001.M010.A011", "high"],
    ["15", "campaign-workspace", "Execution Hierarchy", "Nest Actions under expandable Mission rows to reduce scrolling.", "C001.M010.A011", "critical"],
    ["16", "campaign-workspace", "Campaign Demo boundary", "Apply the compact Demo banner.", "C001.M010.A010", "medium"],
    ["17", "campaign-workspace", "Testing & Punch Items", "Combine testing and UI review tracking while preserving record types, immutable evidence, Punch links, and audit provenance.", "C001.M010.A011", "critical"],
    ["18", "campaign-workspace", "Typical Campaign Flow", "Replace the isolated Specification Gate panel with the clickable C001-derived Campaign flow and honest status gates.", "C001.M010.A011", "critical"],
    ["19", "campaign-workspace", "Commander's Intent Action", "Project Commander's Intent first in the Execution Hierarchy without inventing completion or approval.", "C001.M010.A011", "high"],
    ["20", "campaign-workspace", "Specification Gate Mission", "Map Specification Gate additively to C001.M000 with stable source/evidence compatibility and no duplication.", "C001.M010.A011", "critical"],
    ["21", "campaign-workspace", "UI checkpoint hierarchy", "Integrate all seven checkpoints with exact details and source-linked comment/closeout history.", "C001.M010.A011", "critical"],
    ["22", "campaign-workspace", "Mission audit timeline", "Project append-only audit milestones into relevant Mission positions without rewriting facts.", "C001.M010.A011", "high"],
    ["23", "campaign-workspace", "Mission team assignment", "Show evidenced configured team members with performance links; otherwise show unassigned.", "C001.M010.A011", "high"],
    ["24", "configuration", "Team configuration button", "Change Configure Display to Configure.", "C001.M010.A012", "medium"],
    ["25", "configuration", "Configuration Live Preview", "Move the palette below preview text and prevent overlap responsively.", "C001.M010.A012", "high"],
    ["26", "public-demo", "Global Demo banner", "Apply the compact banner everywhere it appears.", "C001.M010.A010", "high"],
    ["27", "overview", "Global sticky headers", "Pin every page name/header for scrolling.", "C001.M010.A010", "high"],
    ["28", "overview", "Global accessible navigation", "Provide keyboard/focus-safe Command Overview and hierarchy navigation without responsive overflow.", "C001.M010.A010", "critical"],
    ["29", "public-demo", "Synthetic Demo stewardship", "Populate only Demo with separately classified synthetic Cost/Effort graphics, asterisks, and a persistent explanation.", "C001.M010.A012", "critical"],
  ] as const;
  return items.map(([suffix, inventoryKey, screenReference, comment, mapping, severity]) => ({
    id: `ui_review_item_a009_ri_${suffix.replace("a", "_a")}`,
    checkpointId: "ui_review_checkpoint_c001_ui05",
    inventoryEntryId: `ui_review_inventory_c001_ui05_${inventoryKey}`,
    screenReference,
    componentReference: mapping,
    sourceAttribution: "Commander UI-05 review",
    sourceReference: A009_DISPOSITION_SOURCE,
    comment,
    severity,
    createdAt: C001_SOURCE_RETRIEVED_AT,
    createdBy: "Commander",
  }));
}

function ui05InventoryEntries(): CastraState["uiReviewInventoryEntries"] {
  const entries = [
    ["overview", "Command Overview", "overview", "KPIs, Campaign running list, detail surfaces, queues, team rollup, separate AERARIUM measures, and on-demand graph.", "Production auth and numeric C001 cost/effort evidence remain unavailable."],
    ["war-efforts", "War Efforts", null, "Explicit no-data surface and source-backed probable explanation.", "No War Effort source record exists."],
    ["campaign-workspace", "Campaign workspace", "campaigns", "Summary, Testing, UI Reviews, Audit, Meet the Team, and AERARIUM tabs with retained context.", "Some source page URLs and historical audit events are unavailable."],
    ["baseops", "BASEOPS", null, "Clickable Deployed Product, Garrison, and Fortification explanations and action lists.", "No accepted handoff or BASEOPS work record exists."],
    ["graph", "Commander Graph", "graph", "On-demand nodes, relationships, role/Campaign associations, gaps, inspector, and governing-record navigation.", "External Graphify execution is not connected."],
    ["team", "Meet the Team", "team", "Configured display-only names, protected mappings, model policy, and Campaign/all-Campaign performance.", "Runtime connectivity, observed effort, and cost remain unavailable unless evidenced."],
    ["configuration", "Configuration", "configuration", "Dropdown-led theme/label controls, live preview, display settings, model defaults, and embedded AERARIUM configuration.", "No setting grants role authority or runtime connectivity."],
    ["public-demo", "Public Demo", "overview", "Public-safe C001 baseline, transient edits, and explicit Normal/Dense/Blocked/Exception/Empty state selection.", "Blocked/Exception/Empty are labelled UI mechanics; no provider or persistence exists."],
  ] as const;
  return entries.map(([key, name, destination, focus, gap]) => ({
    id: `ui_review_inventory_c001_ui05_${key}`,
    checkpointId: "ui_review_checkpoint_c001_ui05",
    screenKey: key,
    screenName: name,
    componentReference: C001_UI05_SOURCE_BUNDLE_REVISION,
    states: ["normal", "dense", "unavailable", "error", "empty", "mobile_responsive"],
    additionalStates: ["blocked", "exception"],
    evidenceReferences: ["DATA-SCOPE.md#withheld-internal-reference", "DATA-SCOPE.md#withheld-internal-reference"],
    fixtureContractId: "ui_review_fixture_c001",
    dataSource: "ui_review_fixture",
    destination,
    inspectionFocus: focus,
    knownIntentionalGaps: gap,
    requestedDecision: "Commander UI-05 disposition remains open; inspect this exact revision and source scope.",
    createdAt: C001_SOURCE_RETRIEVED_AT,
  }));
}

function ui06InventoryEntries(): CastraState["uiReviewInventoryEntries"] {
  const entries = [
    ["overview", "Command Overview", "overview", "Compact sticky shell, provenance-safe Cost/Effort drill-downs, Campaign/blocker/review cards, and on-demand graph.", "Production authentication remains disabled/unclaimed; post-login numerical C001 inputs remain unavailable."],
    ["war-efforts", "War Efforts", null, "Compact header/navigation and explicit source-backed no-data explanation.", "No War Effort source record exists."],
    ["campaign-workspace", "Campaign workspace", "campaigns", "Campaign KPIs, Typical Campaign Flow, expandable hierarchy, combined Testing & Punch Items, audit/team projections, and local navigation.", "C001.M000 is a compatibility projection; historical 0VAT evidence is unavailable."],
    ["baseops", "BASEOPS", null, "Sticky navigation, themed Garrison/Fortification cards, and truthful unavailable action lists.", "No accepted handoff or BASEOPS work record exists."],
    ["graph", "Commander Graph", "graph", "On-demand local read-only relationship projection with exact source drill-downs.", "External Graphify execution is not connected."],
    ["team", "Meet the Team", "team", "Evidenced Mission assignments and protected role-performance links.", "Unassigned Missions remain explicitly unavailable."],
    ["configuration", "Configuration", "configuration", "Contained Configure controls and non-overlapping live palette preview.", "Runtime connectivity remains unverified."],
    ["public-demo", "Public Demo", "overview", "Compact boundary, immutable public-safe base, transient edits, and separately marked synthetic Demo-only stewardship.", "Synthetic presentation measures never enter authoritative records."],
  ] as const;
  return entries.map(([key, name, destination, focus, gap]) => ({
    id: `ui_review_inventory_c001_ui06_${key}`,
    checkpointId: "ui_review_checkpoint_c001_ui06",
    screenKey: key,
    screenName: name,
    componentReference: C001_SOURCE_BUNDLE_REVISION,
    states: ["normal", "dense", "unavailable", "error", "empty", "mobile_responsive"],
    additionalStates: ["blocked", "exception"],
    evidenceReferences: ["DATA-SCOPE.md#withheld-internal-reference", "DATA-SCOPE.md#withheld-internal-reference"],
    fixtureContractId: "ui_review_fixture_c001_ui06",
    dataSource: "ui_review_fixture",
    destination,
    inspectionFocus: focus,
    knownIntentionalGaps: gap,
    requestedDecision: "Commander UI-06 disposition remains open; inspect this exact deployed revision and evidence scope.",
    createdAt: C001_SOURCE_RETRIEVED_AT,
  }));
}

function sourceState(): CastraState {
  const state = emptyState();
  const c001 = campaign();
  const missions = MISSIONS.map(mission);
  const actions = ACTIONS.map(action);
  return {
    ...state,
    campaigns: [c001],
    missions,
    actions,
    testPlans: [{ id: "test_plan_c001_round1", title: "C001 Release 1 Round 1 self-test", description: "Evidence package recorded under C001.M007.A005; deployment, backup/restore rehearsal, live auth, sync, and migration remain outside this passed local gate.", link: { type: "campaign", id: C001_CAMPAIGN_ID }, status: "closed", createdAt: C001_SOURCE_RETRIEVED_AT, updatedAt: C001_SOURCE_RETRIEVED_AT }],
    testCycles: [{ id: "test_cycle_c001_round1", testPlanId: "test_plan_c001_round1", title: "Round 1 local deterministic verification", status: "completed", createdAt: C001_SOURCE_RETRIEVED_AT, updatedAt: C001_SOURCE_RETRIEVED_AT }],
    testCases: [{ id: "test_case_c001_round1", testPlanId: "test_plan_c001_round1", title: "Implemented local Release 1 slice", status: "executed", expectedResult: "Implemented deterministic local scope passes its automated and browser verification without claiming deferred external capabilities.", requirementReference: "C001.M007.A005 acceptance package", sourceReference: "DATA-SCOPE.md#withheld-internal-reference", required: true, severity: "high", createdAt: C001_SOURCE_RETRIEVED_AT, updatedAt: C001_SOURCE_RETRIEVED_AT }],
    testResults: [{ id: "test_result_c001_round1", testPlanId: "test_plan_c001_round1", testCycleId: "test_cycle_c001_round1", testCaseId: "test_case_c001_round1", outcome: "pass", actualResult: "Verified for the implemented local scope. Deferred external gates remain explicitly unverified.", executor: "FIREWATCH", executedAt: C001_SOURCE_RETRIEVED_AT, evidenceReference: "DATA-SCOPE.md#withheld-internal-reference", resultReference: "C001.M007.A005", unavailableReason: "", createdAt: C001_SOURCE_RETRIEVED_AT }],
    firewatchVerifications: [{ id: "firewatch_c001_round1", testPlanId: "test_plan_c001_round1", outcome: "verified", evidenceReference: "DATA-SCOPE.md#withheld-internal-reference", unavailableReason: "", verifiedAt: C001_SOURCE_RETRIEVED_AT, recordedAt: C001_SOURCE_RETRIEVED_AT }],
    exitDecisions: [{ id: "exit_decision_c001_round1", testPlanId: "test_plan_c001_round1", decision: "conditional_pass", rationale: "Pass to the next defined test/deployment-planning gate only; not release, Production authentication, recovery, migration, or deployment acceptance.", decidedAt: C001_SOURCE_RETRIEVED_AT, decidedBy: "Commander" }],
    uiReviewPlans: [{ id: "ui_review_plan_c001", contractVersion: 1, campaignId: C001_CAMPAIGN_ID, revision: 1, applicability: "ui", applicabilityReason: "CASTRA is browser-accessible and UI-bearing.", applicabilityEvidenceReference: M010_PLAN_SOURCE, experienceIntent: "The Commander can understand and control every authoritative lifecycle, stewardship, and review surface.", devicesAndScreenSizes: "Desktop and responsive/mobile browser review", themeAndNavigationPattern: "Commander-selected semantic theme; approved Campaign-oriented left navigation", requiredCheckpoints: ["UI-01", "UI-02", "UI-03", "UI-04", "UI-05", "UI-06", "UI-07"], demonstrationDataNeeds: "Evidence-backed C001 public-safe source bundle plus visibly isolated deterministic state mechanics", approver: "Commander", evidenceRequirement: "Exact fixture/data revision, source inventory, screen/state coverage, known gaps, and Commander disposition", screenshotRequired: true, status: "configured", createdAt: C001_SOURCE_RETRIEVED_AT, updatedAt: C001_SOURCE_RETRIEVED_AT }],
    uiReviewFixtureContracts: [
      { id: "ui_review_fixture_c001", contractVersion: 1, planId: "ui_review_plan_c001", namespace: C001_UI05_SOURCE_BUNDLE_REVISION, visibleLabel: "DEMONSTRATION DATA · NOT AUTHORITATIVE", authority: "demonstration_only", storageBoundary: "isolated_ui_review_fixture", canTargetAuthoritativeData: false, populated: true, status: "populated", createdAt: C001_SOURCE_RETRIEVED_AT },
      { id: "ui_review_fixture_c001_ui06", contractVersion: 1, planId: "ui_review_plan_c001", namespace: C001_SOURCE_BUNDLE_REVISION, visibleLabel: "DEMONSTRATION DATA · NOT AUTHORITATIVE", authority: "demonstration_only", storageBoundary: "isolated_ui_review_fixture", canTargetAuthoritativeData: false, populated: true, status: "populated", createdAt: C001_SOURCE_RETRIEVED_AT },
    ],
    uiReviewCheckpoints: [
      { id: "ui_review_checkpoint_c001_ui01", planId: "ui_review_plan_c001", code: "UI-01", name: "Experience Intent", revision: 1, scope: "Approved UI Review Standard intent gate; historical standalone checkpoint evidence unavailable", coveredUiRevision: C001_UI05_SOURCE_BUNDLE_REVISION, status: "not_started", evidenceRequirement: "Commander intent, desired experience, scope, and evidence reference", evidenceReferences: [M010_PLAN_SOURCE], createdAt: C001_SOURCE_RETRIEVED_AT, updatedAt: C001_SOURCE_RETRIEVED_AT },
      { id: "ui_review_checkpoint_c001_ui02", planId: "ui_review_plan_c001", code: "UI-02", name: "Information Architecture", revision: 1, scope: "Approved UI Review Standard information-architecture gate; historical standalone checkpoint evidence unavailable", coveredUiRevision: C001_UI05_SOURCE_BUNDLE_REVISION, status: "not_started", evidenceRequirement: "Navigation, hierarchy, screen inventory, and Commander evidence", evidenceReferences: [M010_PLAN_SOURCE], createdAt: C001_SOURCE_RETRIEVED_AT, updatedAt: C001_SOURCE_RETRIEVED_AT },
      { id: "ui_review_checkpoint_c001_ui03", planId: "ui_review_plan_c001", code: "UI-03", name: "Populated Prototype", revision: 11, scope: "C001.M010.A002.fixture.r1 · nine destinations · five states", coveredUiRevision: "C001.M010.A002.fixture.r1", status: "rework_required", evidenceRequirement: "Exact fixture, inventory scope, Commander comments, and remediation map", evidenceReferences: [A003_SOURCE, "DATA-SCOPE.md#withheld-internal-reference"], createdAt: C001_SOURCE_RETRIEVED_AT, updatedAt: C001_SOURCE_RETRIEVED_AT },
      { id: "ui_review_checkpoint_c001_ui04", planId: "ui_review_plan_c001", code: "UI-04", name: "Functional Slice", revision: 1, scope: "Deterministic Welcome/authentication functional-slice review traceability; no consolidated checkpoint decision is inferred", coveredUiRevision: "C001.M012.A002", status: "not_started", evidenceRequirement: "Functional interaction, isolation, responsive, and Commander review evidence", evidenceReferences: ["DATA-SCOPE.md#withheld-internal-reference"], createdAt: C001_SOURCE_RETRIEVED_AT, updatedAt: C001_SOURCE_RETRIEVED_AT },
      { id: "ui_review_checkpoint_c001_ui05", planId: "ui_review_plan_c001", code: "UI-05", name: "Full-State Review", revision: 1, scope: "Integrated A004–A008 information architecture and public-safe C001 dataset", coveredUiRevision: C001_UI05_SOURCE_BUNDLE_REVISION, status: "rework_required", evidenceRequirement: "Source inventory, populated destinations, responsive/accessibility evidence, known gaps, and Commander disposition", evidenceReferences: ["DATA-SCOPE.md#withheld-internal-reference"], createdAt: C001_SOURCE_RETRIEVED_AT, updatedAt: C001_SOURCE_RETRIEVED_AT },
      { id: "ui_review_checkpoint_c001_ui06", planId: "ui_review_plan_c001", code: "UI-06", name: "Release Candidate", revision: 1, scope: "Integrated UI-05 remediation, C001.M000 compatibility projection, isolated Demo stewardship, and current-source Production candidate", coveredUiRevision: C001_SOURCE_BUNDLE_REVISION, status: "ready_for_review", evidenceRequirement: "Exact source/migration inventory, local and live browser evidence, deployment receipt, known gaps, and Commander disposition", evidenceReferences: ["DATA-SCOPE.md#withheld-internal-reference"], createdAt: C001_SOURCE_RETRIEVED_AT, updatedAt: C001_SOURCE_RETRIEVED_AT },
      { id: "ui_review_checkpoint_c001_ui07", planId: "ui_review_plan_c001", code: "UI-07", name: "BASEOPS Review", revision: 1, scope: "Future post-deployment operational UI review; C001 has no accepted BASEOPS handoff", coveredUiRevision: C001_SOURCE_BUNDLE_REVISION, status: "not_started", evidenceRequirement: "Operational validation, sustainment use, performance, and Commander evidence", evidenceReferences: [M010_PLAN_SOURCE], createdAt: C001_SOURCE_RETRIEVED_AT, updatedAt: C001_SOURCE_RETRIEVED_AT },
    ],
    uiReviewInventoryEntries: [{ id: "ui_review_inventory_c001_ui03", checkpointId: "ui_review_checkpoint_c001_ui03", screenKey: "ui03-post-login", screenName: "UI-03 post-login packet", componentReference: "C001.M010.A002.fixture.r1", states: ["normal", "dense", "unavailable", "error", "empty", "mobile_responsive"], additionalStates: ["blocked", "exception"], evidenceReferences: [A003_SOURCE], fixtureContractId: "ui_review_fixture_c001", dataSource: "ui_review_fixture", destination: "overview", inspectionFocus: "Post-login information architecture, Campaign stewardship, graph, team, configuration, and BASEOPS.", knownIntentionalGaps: "External Graphify, Production authentication, hosted sync, and numeric effort/cost remain unavailable unless separately evidenced.", requestedDecision: "Rework required was recorded for this exact scope.", createdAt: C001_SOURCE_RETRIEVED_AT }, ...ui05InventoryEntries(), ...ui06InventoryEntries()],
    uiReviewItems: [...reviewItems(), ...ui05ReviewItems()],
    uiReviewDecisions: [
      { id: "ui_review_decision_c001_ui03", checkpointId: "ui_review_checkpoint_c001_ui03", checkpointRevision: 11, inventoryEvidenceScope: "uis-v1-05e2fdb9", disposition: "rework_required", rationale: "The fixture is useful and isolated, but its post-login information architecture and stewardship surfaces require the A005–A008 changes.", evidenceReferences: [A003_SOURCE, "DATA-SCOPE.md#withheld-internal-reference"], punchItemIds: [], decidedAt: C001_SOURCE_RETRIEVED_AT, decidedBy: "Commander" },
      { id: "ui_review_decision_c001_ui05", checkpointId: "ui_review_checkpoint_c001_ui05", checkpointRevision: 1, inventoryEvidenceScope: "uis-v1-4e1f98c8", disposition: "rework_required", rationale: "The integrated information architecture is directionally correct, but the Commander requires compact sticky shells, exact review drill-downs, Campaign lifecycle integration, and isolated Demo stewardship before release-candidate review.", evidenceReferences: [A009_SOURCE, A009_DISPOSITION_SOURCE, "DATA-SCOPE.md#withheld-internal-reference"], punchItemIds: [], decidedAt: C001_SOURCE_RETRIEVED_AT, decidedBy: "Commander" },
    ],
  };
}

function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const ids = new Set(existing.map((item) => item.id));
  return [...existing, ...incoming.filter((item) => !ids.has(item.id))];
}

function refreshManagedBundleById<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  canRefresh: (item: T) => boolean,
): T[] {
  const incomingById = new Map(incoming.map((item) => [item.id, item]));
  const refreshed = existing.map((item) => {
    const replacement = incomingById.get(item.id);
    return replacement && canRefresh(item) ? replacement : item;
  });
  return mergeById(refreshed, incoming);
}

export function mergeC001SourceBundle(existing: CastraState): CastraState {
  const bundled = sourceState();
  return refreshOpenWorkProjection({
    ...existing,
    campaigns: mergeById(existing.campaigns, bundled.campaigns),
    missions: refreshManagedBundleById(existing.missions, bundled.missions, (item) => item.notes.includes(C001_UI05_SOURCE_BUNDLE_REVISION)),
    actions: refreshManagedBundleById(existing.actions, bundled.actions, (item) => item.notes.includes(C001_UI05_SOURCE_BUNDLE_REVISION)),
    testPlans: mergeById(existing.testPlans, bundled.testPlans),
    testCycles: mergeById(existing.testCycles, bundled.testCycles),
    testCases: mergeById(existing.testCases, bundled.testCases),
    testResults: mergeById(existing.testResults, bundled.testResults),
    firewatchVerifications: mergeById(existing.firewatchVerifications, bundled.firewatchVerifications),
    exitDecisions: mergeById(existing.exitDecisions, bundled.exitDecisions),
    uiReviewPlans: mergeById(existing.uiReviewPlans, bundled.uiReviewPlans),
    uiReviewFixtureContracts: mergeById(existing.uiReviewFixtureContracts, bundled.uiReviewFixtureContracts),
    uiReviewCheckpoints: refreshManagedBundleById(existing.uiReviewCheckpoints, bundled.uiReviewCheckpoints, (item) => item.updatedAt === C001_SOURCE_RETRIEVED_AT),
    uiReviewInventoryEntries: mergeById(existing.uiReviewInventoryEntries, bundled.uiReviewInventoryEntries),
    uiReviewItems: mergeById(existing.uiReviewItems, bundled.uiReviewItems),
    uiReviewDecisions: mergeById(existing.uiReviewDecisions, bundled.uiReviewDecisions),
  });
}

export function buildPublicDemoState(): CastraState {
  return mergeC001SourceBundle(emptyState());
}

export function c001SourceForRecord(recordId: string): C001SourceManifestEntry | null {
  if (recordId === C001_CAMPAIGN_ID) return C001_SOURCE_MANIFEST[0];
  if (recordId.startsWith("c001_m")) return recordId.includes("_a") ? C001_SOURCE_MANIFEST[2] : C001_SOURCE_MANIFEST[1];
  if (recordId.startsWith("ui_review_")) return C001_SOURCE_MANIFEST[3];
  return null;
}
