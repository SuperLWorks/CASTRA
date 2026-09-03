import { buildPublicDemoState, C001_SOURCE_BUNDLE_REVISION } from "../data/c001SourceBundle";
import { currentPresentation } from "../domain/presentation";
import { uiReviewInventoryEvidenceScope } from "../domain/uiReview";
import type { CastraState, ThemeProfileId, UIReviewInventoryEntry } from "../domain/types";

export const PUBLIC_DEMO_PRESENTATION_POLICY = {
  id: "public-demo.presentation-policy.v1",
  version: 1,
  defaultThemeProfileId: "slw_oil_gas" as ThemeProfileId,
  defaultSelectionAuthority: "commander_explicit_decision",
  newTemplateBehavior: "selectable_option_only",
  persistence: "memory_only",
  resetBoundary: "reload_exit_reentry",
  changedAt: "2026-08-11T14:00:00.000Z",
} as const;

export const PUBLIC_DEMO_DEFAULT_UI07_CHECKPOINT_ID = "ui_review_checkpoint_c001_ui07";
export const PUBLIC_DEMO_DEFAULT_UI07_FIXTURE_ID = "ui_review_fixture_c001_ui07_demo_default_policy";
export const PUBLIC_DEMO_DEFAULT_REVIEW_REVISION = "public-demo.default-policy.v1";

function defaultPolicyInventory(): UIReviewInventoryEntry[] {
  const evidence = [
    "DATA-SCOPE.md#withheld-internal-reference",
    "DATA-SCOPE.md#withheld-internal-reference",
    "DATA-SCOPE.md#withheld-internal-reference",
  ];
  const rows: Array<Pick<UIReviewInventoryEntry, "screenKey" | "screenName" | "componentReference" | "destination" | "inspectionFocus" | "knownIntentionalGaps">> = [
    {
      screenKey: "public-demo-entry",
      screenName: "Public Demo entry and reset",
      componentReference: "App/Public Demo boundary",
      destination: null,
      inspectionFocus: "Oil & Gas is the explicit governed entry default; reload, exit, and re-entry restore that default after a transient selection.",
      knownIntentionalGaps: "The Demo keeps no browser or server persistence and does not remember a visitor's theme choice.",
    },
    {
      screenKey: "configuration-theme-selector",
      screenName: "Configuration theme selector",
      componentReference: "ConfigurationWorkspace",
      destination: "configuration",
      inspectionFocus: "Comic Command remains a selectable Demo-only option while adding or demonstrating a theme never changes the governed default.",
      knownIntentionalGaps: "Only a separate Commander decision may change the Public Demo default policy.",
    },
    {
      screenKey: "comic-command-option",
      screenName: "Optional Comic Command presentation",
      componentReference: "App/PresentationWorkspace/TeamWorkspace",
      destination: "team",
      inspectionFocus: "Comic role mapping, taglines, presentation-only help, contained preview, original motifs, and fan/trademark disclaimer remain intact after explicit selection.",
      knownIntentionalGaps: "Character names are unaffiliated presentation references; no artwork, logo, endorsement, affiliation, or legal opinion is supplied.",
    },
    {
      screenKey: "overview-stewardship",
      screenName: "Overview and stewardship provenance",
      componentReference: "CommandOverview/StewardshipDetail",
      destination: "overview",
      inspectionFocus: "Theme switching changes presentation only; source-backed C001 facts and separately asterisked synthetic Demo stewardship remain unchanged.",
      knownIntentionalGaps: "Synthetic Demo figures are not authoritative, observed, provider, subscription, or API evidence.",
    },
  ];
  return rows.map((row, index) => ({
    id: `ui_review_inventory_c001_ui07_demo_default_${String(index + 1).padStart(2, "0")}`,
    checkpointId: PUBLIC_DEMO_DEFAULT_UI07_CHECKPOINT_ID,
    screenKey: row.screenKey,
    screenName: row.screenName,
    componentReference: row.componentReference,
    states: ["normal", "mobile_responsive", "unavailable"],
    additionalStates: ["Optional theme selected", "Demo reset", "presentation-only boundary"],
    evidenceReferences: evidence,
    fixtureContractId: PUBLIC_DEMO_DEFAULT_UI07_FIXTURE_ID,
    dataSource: "ui_review_fixture",
    destination: row.destination,
    inspectionFocus: row.inspectionFocus,
    knownIntentionalGaps: row.knownIntentionalGaps,
    requestedDecision: "Review the deployed governed Demo default and optional Comic Command path, then choose Approve, Approve with Punch Items, or Rework required.",
    createdAt: PUBLIC_DEMO_PRESENTATION_POLICY.changedAt,
  }));
}

export function withGovernedPublicDemoPresentation(base: CastraState): CastraState {
  const existingInventoryIds = new Set(base.uiReviewInventoryEntries.map((item) => item.id));
  const inventory = defaultPolicyInventory().filter((item) => !existingInventoryIds.has(item.id));
  const evidenceReferences = [
    "DATA-SCOPE.md#withheld-internal-reference",
    "DATA-SCOPE.md#withheld-internal-reference",
    "DATA-SCOPE.md#withheld-internal-reference",
  ];
  return {
    ...base,
    uiReviewFixtureContracts: [
      ...base.uiReviewFixtureContracts.filter((item) => item.id !== PUBLIC_DEMO_DEFAULT_UI07_FIXTURE_ID),
      {
        id: PUBLIC_DEMO_DEFAULT_UI07_FIXTURE_ID,
        contractVersion: 1,
        planId: "ui_review_plan_c001",
        namespace: `${C001_SOURCE_BUNDLE_REVISION}+${PUBLIC_DEMO_DEFAULT_REVIEW_REVISION}`,
        visibleLabel: "DEMONSTRATION DATA · NOT AUTHORITATIVE",
        authority: "demonstration_only",
        storageBoundary: "isolated_ui_review_fixture",
        canTargetAuthoritativeData: false,
        populated: true,
        status: "populated",
        createdAt: PUBLIC_DEMO_PRESENTATION_POLICY.changedAt,
      },
    ],
    uiReviewCheckpoints: base.uiReviewCheckpoints.map((checkpoint) => {
      if (checkpoint.id === "ui_review_checkpoint_c001_ui06") return {
        ...checkpoint,
        status: "invalidated" as const,
        updatedAt: PUBLIC_DEMO_PRESENTATION_POLICY.changedAt,
        evidenceReferences: [...new Set([...checkpoint.evidenceReferences, "DATA-SCOPE.md#withheld-internal-reference"])],
      };
      if (checkpoint.id === PUBLIC_DEMO_DEFAULT_UI07_CHECKPOINT_ID) return {
        ...checkpoint,
        revision: 3,
        scope: "Governed Oil & Gas Public Demo default with Comic Command retained as an optional Demo-only presentation",
        coveredUiRevision: PUBLIC_DEMO_DEFAULT_REVIEW_REVISION,
        status: "ready_for_review" as const,
        evidenceRequirement: "Default-policy version, initial/reset proof, optional Comic Command rendering, authoritative/post-login invariants, desktop/mobile/live evidence, and Commander disposition",
        evidenceReferences: [...new Set([...checkpoint.evidenceReferences, ...evidenceReferences])],
        updatedAt: PUBLIC_DEMO_PRESENTATION_POLICY.changedAt,
      };
      return checkpoint;
    }),
    uiReviewInventoryEntries: [...base.uiReviewInventoryEntries, ...inventory],
  };
}

export function buildGovernedPublicDemoState(): CastraState {
  const state = withGovernedPublicDemoPresentation(buildPublicDemoState());
  if (currentPresentation(state).themeProfileId !== PUBLIC_DEMO_PRESENTATION_POLICY.defaultThemeProfileId) {
    throw new Error("Public Demo baseline does not match the governed default presentation policy.");
  }
  return state;
}

export function publicDemoDefaultReviewScope(state: CastraState = buildGovernedPublicDemoState()): string {
  return uiReviewInventoryEvidenceScope(state, PUBLIC_DEMO_DEFAULT_UI07_CHECKPOINT_ID);
}
