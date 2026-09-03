import { buildPublicDemoState, C001_SOURCE_BUNDLE_REVISION } from "../data/c001SourceBundle";
import { currentPresentation, suppliedRolesFor } from "../domain/presentation";
import { uiReviewInventoryEvidenceScope } from "../domain/uiReview";
import type { CastraState, PresentationSettingsVersion, UIReviewInventoryEntry } from "../domain/types";

export const COMIC_COMMAND_DEMO_REVISION = "comic-command.demo.v1";
export const COMIC_COMMAND_PRESENTATION_ID = "demo_presentation_comic_command_v1";
export const COMIC_COMMAND_UI07_CHECKPOINT_ID = "ui_review_checkpoint_c001_ui07";
export const COMIC_COMMAND_UI07_FIXTURE_ID = "ui_review_fixture_c001_ui07_comic_command";
export const COMIC_COMMAND_REVIEWED_AT = "2026-08-11T13:00:00.000Z";
export const COMIC_COMMAND_ASSET_BOUNDARY = {
  externalMedia: false,
  downloadedArtwork: false,
  companyLogos: false,
  characterIllustrations: false,
  treatment: "Code-generated semantic tokens, halftone dots, panel borders, caption boxes, speed lines, and generic starburst motifs only.",
} as const;

export const COMIC_COMMAND_REVIEW_DESTINATIONS = [
  "public-demo",
  "overview",
  "campaigns",
  "configuration",
  "team",
  "aerarium",
] as const;

function comicInventory(): UIReviewInventoryEntry[] {
  const rows: Array<{
    key: string;
    name: string;
    component: string;
    destination: UIReviewInventoryEntry["destination"];
    focus: string;
    gaps: string;
  }> = [
    { key: "public-demo", name: "Public Demo shell", component: "App/Public Demo boundary", destination: null, focus: "Comic Command default, compact no-save boundary, original generic motifs, and fan/trademark disclaimer.", gaps: "Character names are presentation references only; no artwork, endorsement, affiliation, or legal opinion is supplied." },
    { key: "overview", name: "Command Overview", component: "CommandOverview", destination: "overview", focus: "Four-color panel treatment, compact KPIs, synthetic stewardship asterisks, Campaign cards, and source-linked review controls.", gaps: "Synthetic cost and effort remain Demo-only; authoritative C001 measures remain unavailable." },
    { key: "campaigns", name: "Campaign workspace", component: "CampaignWorkspace", destination: "campaigns", focus: "Sticky hierarchy, source-backed C001 text, comic presentation vocabulary, checkpoints, Mission/Action accordions, and responsible display names.", gaps: "No source fact, status, approval, evidence, or lifecycle meaning is changed by the presentation." },
    { key: "configuration", name: "Configuration", component: "ConfigurationWorkspace", destination: "configuration", focus: "Demo-only selector, contained palette/type/panel/KPI/team preview, presentation-only boundary, and version lineage.", gaps: "Comic Command is deliberately unavailable to authoritative/post-login configuration." },
    { key: "team", name: "Meet the Team", component: "TeamWorkspace", destination: "team", focus: "Exact fictional display mapping, themed taglines, presentation-only responsibility copy, and protected accessible canonical provenance.", gaps: "Runtime availability and deterministic workflow policy are not changed or implied." },
    { key: "aerarium", name: "AERARIUM stewardship", component: "CommandOverview/StewardshipDetail", destination: "aerarium", focus: "Asterisked synthetic Demo charts and strict separation from observed, provider actual, subscription, estimate, and unavailable measures.", gaps: "No actual provider, token, runtime, subscription, API, or authoritative cost evidence is added." },
  ];
  return rows.map((row, index) => ({
    id: `ui_review_inventory_c001_ui07_comic_${String(index + 1).padStart(2, "0")}`,
    checkpointId: COMIC_COMMAND_UI07_CHECKPOINT_ID,
    screenKey: row.key,
    screenName: row.name,
    componentReference: row.component,
    states: ["normal", "dense", "unavailable", "mobile_responsive"],
    additionalStates: ["Demo reset", "presentation-only boundary"],
    evidenceReferences: ["DATA-SCOPE.md#withheld-internal-reference", "DATA-SCOPE.md#withheld-internal-reference"],
    fixtureContractId: COMIC_COMMAND_UI07_FIXTURE_ID,
    dataSource: "ui_review_fixture",
    destination: row.destination,
    inspectionFocus: row.focus,
    knownIntentionalGaps: row.gaps,
    requestedDecision: "Review the deployed Comic Command presentation and choose Approve, Approve with Punch Items, or Rework required.",
    createdAt: COMIC_COMMAND_REVIEWED_AT,
  }));
}

export function withComicCommandDemoPresentation(base: CastraState): CastraState {
  if (base.presentationVersions.some((item) => item.id === COMIC_COMMAND_PRESENTATION_ID)) return base;
  const previous = currentPresentation(base);
  const version: PresentationSettingsVersion = {
    id: COMIC_COMMAND_PRESENTATION_ID,
    familyId: "demo_only:comic_command",
    version: 1,
    supersedesId: null,
    createdAt: COMIC_COMMAND_REVIEWED_AT,
    themeProfileId: "comic_command",
    roleProfileName: "Comic Command · Demo-only display v1",
    aerariumLabelMode: previous.aerariumLabelMode,
    roles: suppliedRolesFor("comic_command"),
    modelSelections: previous.modelSelections.map((item) => ({ ...item })),
  };
  const existingInventoryIds = new Set(base.uiReviewInventoryEntries.map((item) => item.id));
  const inventory = comicInventory().filter((item) => !existingInventoryIds.has(item.id));
  return {
    ...base,
    presentationVersions: [...base.presentationVersions, version],
    uiReviewFixtureContracts: [
      ...base.uiReviewFixtureContracts.filter((item) => item.id !== COMIC_COMMAND_UI07_FIXTURE_ID),
      {
        id: COMIC_COMMAND_UI07_FIXTURE_ID,
        contractVersion: 1,
        planId: "ui_review_plan_c001",
        namespace: `${C001_SOURCE_BUNDLE_REVISION}+${COMIC_COMMAND_DEMO_REVISION}`,
        visibleLabel: "DEMONSTRATION DATA · NOT AUTHORITATIVE",
        authority: "demonstration_only",
        storageBoundary: "isolated_ui_review_fixture",
        canTargetAuthoritativeData: false,
        populated: true,
        status: "populated",
        createdAt: COMIC_COMMAND_REVIEWED_AT,
      },
    ],
    uiReviewCheckpoints: base.uiReviewCheckpoints.map((checkpoint) => {
      if (checkpoint.id === "ui_review_checkpoint_c001_ui06") return {
        ...checkpoint,
        status: "invalidated" as const,
        updatedAt: COMIC_COMMAND_REVIEWED_AT,
        evidenceReferences: [...checkpoint.evidenceReferences, "DATA-SCOPE.md#withheld-internal-reference"],
      };
      if (checkpoint.id === COMIC_COMMAND_UI07_CHECKPOINT_ID) return {
        ...checkpoint,
        revision: 2,
        scope: "Deployed Public-Demo-only Comic Command presentation over the immutable C001 r2 source baseline",
        coveredUiRevision: COMIC_COMMAND_DEMO_REVISION,
        status: "ready_for_review" as const,
        evidenceRequirement: "Exact Demo-only profile/mapping, trademark boundary, canonical-workflow and reset isolation proof, desktop/mobile/live evidence, and Commander disposition",
        evidenceReferences: ["DATA-SCOPE.md#withheld-internal-reference", "DATA-SCOPE.md#withheld-internal-reference"],
        updatedAt: COMIC_COMMAND_REVIEWED_AT,
      };
      return checkpoint;
    }),
    uiReviewInventoryEntries: [...base.uiReviewInventoryEntries, ...inventory],
  };
}

export function buildComicCommandDemoState(): CastraState {
  return withComicCommandDemoPresentation(buildPublicDemoState());
}

export function comicCommandReviewScope(state: CastraState = buildComicCommandDemoState()): string {
  return uiReviewInventoryEvidenceScope(state, COMIC_COMMAND_UI07_CHECKPOINT_ID);
}
