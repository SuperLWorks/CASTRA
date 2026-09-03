export type AuthAdapterCapability =
  | "initial_commander_provisioning"
  | "email_verification"
  | "password_login"
  | "recovery_reset"
  | "callback_exchange"
  | "session_refresh"
  | "logout"
  | "revoke"
  | "step_up";

export interface ServerAuthAdapterDescriptor {
  contract: "castra.server-auth-adapter";
  contractVersion: 1;
  adapterId: "disabled" | "deterministic_test";
  executionBoundary: "server_only";
  browserCredentialHandling: "none";
  networkCapability: "none";
  providerState: "disabled" | "deterministic_test";
  capabilities: ReadonlyArray<{
    capability: AuthAdapterCapability;
    availability: "unavailable" | "deterministic_description_only";
  }>;
  createsRealIdentityOrSession: false;
  storesCredentialOrToken: false;
}

const capabilityNames: AuthAdapterCapability[] = [
  "initial_commander_provisioning",
  "email_verification",
  "password_login",
  "recovery_reset",
  "callback_exchange",
  "session_refresh",
  "logout",
  "revoke",
  "step_up",
];

export const disabledServerAuthAdapter: ServerAuthAdapterDescriptor = Object.freeze({
  contract: "castra.server-auth-adapter",
  contractVersion: 1,
  adapterId: "disabled",
  executionBoundary: "server_only",
  browserCredentialHandling: "none",
  networkCapability: "none",
  providerState: "disabled",
  capabilities: capabilityNames.map((capability) => ({ capability, availability: "unavailable" as const })),
  createsRealIdentityOrSession: false,
  storesCredentialOrToken: false,
});

export const deterministicTestAuthAdapter: ServerAuthAdapterDescriptor = Object.freeze({
  ...disabledServerAuthAdapter,
  adapterId: "deterministic_test",
  providerState: "deterministic_test",
  capabilities: capabilityNames.map((capability) => ({ capability, availability: "deterministic_description_only" as const })),
});
