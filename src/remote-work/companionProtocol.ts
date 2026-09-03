export const companionProtocol = {
  version: "castra-companion/2.0.0" as const,
  packageVersion: "castra-windows-current-user-companion/1.0.0" as const,
  topology: "manual_local_fixture_remote_outbound_future" as const,
  listener: "none" as const,
  codexTransport: "local_stdio" as const,
  codexAuthenticationRequired: "chatgpt_subscription" as const,
  hostedQueue: "not_configured" as const,
  allowedRisk: "low" as const,
  authority: "proposal_only" as const,
  maxClaimLeaseMinutes: 15,
  retryAfterUnknown: false as const,
  modelManagement: false as const,
  fileAccess: false as const,
  toolAccess: false as const,
  terminalAccess: false as const,
  browserAccess: false as const,
  credentialAccess: false as const,
};

export interface CompanionBoundaryStatus {
  implementation: "repository_ready_manual_launch";
  listener: "none";
  runtimeCallsEnabled: false;
  health: "package_not_connected_to_browser";
  lastReceiptReference: string;
  statement: string;
}

export function companionBoundaryStatus(lastReceiptReference = "none"): CompanionBoundaryStatus {
  return {
    implementation: "repository_ready_manual_launch",
    listener: "none",
    runtimeCallsEnabled: false,
    health: "package_not_connected_to_browser",
    lastReceiptReference,
    statement: "A manually launched Windows current-user package and Codex subscription adapter are present. This browser is not connected to that process; hosted retrieval and remote dispatch remain unavailable.",
  };
}
