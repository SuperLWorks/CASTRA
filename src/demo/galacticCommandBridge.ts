import { currentPresentation, GALACTIC_COMMAND_BRIDGE_DISCLAIMER, suppliedRolesFor, themeProfile } from "../domain/presentation";
import type { CastraState } from "../domain/types";
import { PUBLIC_DEMO_PRESENTATION_POLICY } from "./publicDemoPresentation";

export const GALACTIC_COMMAND_BRIDGE_REVISION = "galactic-command-bridge.demo.v1";
export const GALACTIC_COMMAND_BRIDGE_PROFILE_VERSION = 1;

export const GALACTIC_COMMAND_BRIDGE_ASSET_BOUNDARY = {
  externalMedia: false,
  remoteAssets: false,
  downloadedArtwork: false,
  logosOrInsignia: false,
  franchiseNamesOrCharacters: false,
  copiedLayouts: false,
  customOrFranchiseFonts: false,
  treatment: "Original semantic tokens, CSS grid panels, cool-gray geometry, generic indicator lights, alert rails, scan lines, and angular console motifs only.",
} as const;

export const GALACTIC_COMMAND_BRIDGE_REVIEW_DESTINATIONS = [
  "public-demo",
  "overview",
  "campaigns",
  "configuration",
  "team",
  "aerarium",
] as const;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

function shortHash(value: unknown): string {
  const text = JSON.stringify(stableValue(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function galacticCommandBridgeProtectedDigest(state: CastraState): string {
  return `castra-protected-v1:${shortHash({
    campaigns: state.campaigns,
    missions: state.missions,
    actions: state.actions,
    testPlans: state.testPlans,
    testCycles: state.testCycles,
    testCases: state.testCases,
    testResults: state.testResults,
    punchItems: state.punchItems,
    aerariumRuns: state.aerariumRuns,
    aerariumRunEvents: state.aerariumRunEvents,
    aerariumMeasures: state.aerariumMeasures,
    modelSelections: currentPresentation(state).modelSelections,
  })}`;
}

export const GALACTIC_COMMAND_BRIDGE_REVIEW_SCOPE = `uis-v1-${shortHash({
  revision: GALACTIC_COMMAND_BRIDGE_REVISION,
  version: GALACTIC_COMMAND_BRIDGE_PROFILE_VERSION,
  governedDefault: PUBLIC_DEMO_PRESENTATION_POLICY.defaultThemeProfileId,
  profile: themeProfile("galactic_command_bridge"),
  roles: suppliedRolesFor("galactic_command_bridge"),
  disclaimer: GALACTIC_COMMAND_BRIDGE_DISCLAIMER,
  destinations: GALACTIC_COMMAND_BRIDGE_REVIEW_DESTINATIONS,
  assets: GALACTIC_COMMAND_BRIDGE_ASSET_BOUNDARY,
})}`;

