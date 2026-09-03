export const hostedControlPlaneTarget = {
  uiHost: "Vercel static CASTRA UI",
  identityAndLedgerCandidate: "Supabase Auth/Postgres",
  status: "not_configured" as const,
  phase1PackageStatus: "repository_ready" as const,
  contractVersion: "castra-hosted-control-plane/1.0.0" as const,
  migrationVersion: "202608100001" as const,
  serverAdapter: "disabled" as const,
  networkEnabled: false as const,
  credentialsPresent: false as const,
  privilegedBrowserOperations: false as const,
};

export interface HostedControlPlaneConfiguration {
  version: "castra-hosted-control-plane/1.0.0";
  provider: "supabase_candidate";
  projectReference: string;
  authenticatedCommanderIdentity: boolean;
  durableJobLedger: boolean;
  outboundCompanionRetrieval: boolean;
}

export interface HostedControlPlaneValidation {
  ready: boolean;
  status: "not_configured" | "invalid" | "configured";
  missing: string[];
  statement: string;
}

export function validateHostedControlPlane(
  configuration: HostedControlPlaneConfiguration | null,
): HostedControlPlaneValidation {
  if (!configuration) {
    return {
      ready: false,
      status: "not_configured",
      missing: ["approved provider setup", "Commander authentication", "durable job ledger", "outbound Companion retrieval"],
      statement: "Phase 1 repository contracts are ready. No hosted provider, identity, credential, transport, or network call is configured.",
    };
  }
  const missing = [
    !configuration.projectReference.trim() && "provider project reference",
    !configuration.authenticatedCommanderIdentity && "Commander authentication",
    !configuration.durableJobLedger && "durable job ledger",
    !configuration.outboundCompanionRetrieval && "outbound Companion retrieval",
  ].filter((item): item is string => Boolean(item));
  return {
    ready: missing.length === 0,
    status: missing.length === 0 ? "configured" : "invalid",
    missing,
    statement: missing.length === 0
      ? "Configuration shape is complete; provider eligibility, security, and live connectivity still require separate evidence."
      : "Hosted control-plane configuration is incomplete and must fail closed.",
  };
}

export interface HostedControlPlanePort {
  readonly kind: "provider_neutral";
  readonly networkEnabled: boolean;
  validate(): HostedControlPlaneValidation;
  enqueue(): Promise<never>;
  cancel(): Promise<never>;
}

export class UnconfiguredHostedControlPlane implements HostedControlPlanePort {
  readonly kind = "provider_neutral" as const;
  readonly networkEnabled = false as const;

  validate(): HostedControlPlaneValidation {
    return validateHostedControlPlane(null);
  }

  async enqueue(): Promise<never> {
    throw new Error("Hosted control plane is not configured; no network call was made.");
  }

  async cancel(): Promise<never> {
    throw new Error("Hosted control plane is not configured; no network call was made.");
  }
}

export const hostedControlPlane = new UnconfiguredHostedControlPlane();
