import type { HostedStateAvailability } from "../data/hostedStateRepository";
import { projectConfigurationConnection, type ConfigurationConnectionProjection } from "./configurationCenter";

/** Only already-held, non-sensitive connection facts cross this UI boundary. */
export interface ConfigurationAppConnectionContext {
  synthetic: boolean;
  authenticatedLive: boolean;
  availability: HostedStateAvailability | "checking_hosted";
  hasLoadedSnapshot: boolean;
  stale: boolean;
}

export function configurationConnectionForApp(context: ConfigurationAppConnectionContext, now: string): ConfigurationConnectionProjection {
  if (context.synthetic) return projectConfigurationConnection({ kind: "synthetic" }, now);
  if (!context.authenticatedLive) return projectConfigurationConnection({ kind: "unavailable" }, now);
  if (context.availability === "disabled_pre_cutover") return projectConfigurationConnection({ kind: "local" }, now);
  if (context.availability === "loaded" && context.hasLoadedSnapshot) {
    // The existing loader has no observedAt/validUntil. Never turn render time
    // or a loaded snapshot into fresh connection, database or runtime evidence.
    return projectConfigurationConnection({ kind: "hosted", state: context.stale ? "stale" : "current" }, now);
  }
  return projectConfigurationConnection({ kind: "unavailable" }, now);
}
